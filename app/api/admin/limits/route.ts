import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { serviceQuery } from "@/lib/supabase/server";
import { effectiveLimits, effectiveLimit, invalidatePlanLimitsCache, ALL_LIMIT_IDS, type LimitId } from "@/lib/plan-limits";
import { computeMargin, computeMarginAgainstHistory, computeFreeCost, computeResumePassMargin, computeResumePassMarginAgainstHistory } from "@/lib/margin";
import { packageById } from "@/lib/packages";
import { RESUME_PASS } from "@/lib/resume-pass";

export const runtime = "nodejs";
export const maxDuration = 15;

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

const PAID_IDS: LimitId[] = ["starter", "pro", "promax"];

/** GET — every tier's effective values, plus a live margin/cost preview for each. */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  // admin-facing — always fresh, never the in-memory cache (see lib/plan-limits.ts's
  // loadOverrides comment: that cache is process-local, so a different server
  // instance's write would otherwise still look stale here)
  const effective = await effectiveLimits(true);
  const rows = await Promise.all(
    ALL_LIMIT_IDS.map(async (id) => {
      const { credits, price, overridden } = effective[id];

      if (PAID_IDS.includes(id)) {
        const margin = computeMargin(credits, price!);
        const historyRows = await serviceQuery<{ price: number }[]>(
          `plan_limit_history?package_id=eq.${encodeURIComponent(id)}&select=price`,
        );
        const historicalFloor = Math.min(packageById(id)!.price, ...(historyRows ?? []).map((r) => r.price));
        return { id, name: packageById(id)!.name, overridden, historicalFloor, ...margin };
      }

      if (id === "resume_pass") {
        const historyRows = await serviceQuery<{ price: number }[]>(
          `plan_limit_history?package_id=eq.resume_pass&select=price`,
        );
        const historicalFloor = Math.min(RESUME_PASS.price, ...(historyRows ?? []).map((r) => r.price));
        const { result: margin } = computeResumePassMarginAgainstHistory(credits, RESUME_PASS.days, price!, [historicalFloor]);
        // margin.price is deliberately the WORST-CASE price the safety check
        // ran against (possibly the historical floor, not what's actually
        // set) — spreading it directly would silently show that instead of
        // the real current price. allInCost/profit/safe stay as the
        // worst-case figures (genuinely useful: "if a legacy subscriber
        // applies, here's your real profit"), only price is restored to
        // what's actually in effect.
        return { id, name: "Resume Pass", overridden, historicalFloor, ...margin, price: price! };
      }

      return { id, name: id === "guest" ? "Guest (no account)" : "Free account", credits, price: null, overridden, dailyCost: computeFreeCost(credits) };
    }),
  );

  return Response.json({ limits: rows });
}

/**
 * POST { id, credits, price? } — rotate one tier's limit.
 *
 * The rule this route enforces isn't just "the price/credits I'm saving
 * right now are profitable" — it's "these new credits are still profitable
 * against every price this package has EVER been sold at." PayPal
 * subscription plans lock a subscriber to the price they signed up at (see
 * lib/paypal.ts's ensurePlanId — a price change creates a NEW plan rather
 * than altering existing subscribers' billing), but credits are read fresh
 * on every quota check with no such lock. Raising credits without this check
 * would immediately hand the new, larger allowance to every subscriber still
 * on an old, lower legacy price — a combination the price-only check never
 * saw. A save that would lose money against ANY of those historical prices
 * is refused outright, identifying which price is the problem. Free/guest
 * tiers have no price and no legacy-subscriber risk, so they're accepted
 * with just a cost preview back.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  let body: { id?: string; credits?: number; price?: number };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const id = body.id as LimitId;
  if (!ALL_LIMIT_IDS.includes(id)) return deny(400, "bad_request", "Unknown tier id.");

  const credits = Number(body.credits);
  if (!Number.isFinite(credits) || credits <= 0) return deny(400, "bad_value", "Credits must be a positive number.");

  const isPaid = PAID_IDS.includes(id);
  const isResumePass = id === "resume_pass";
  let price: number | null = null;
  let outgoingPrice: number | null = null;

  if (isPaid) {
    price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) return deny(400, "bad_value", "Price must be a positive number.");

    // every price this package has ever been sold at — the hardcoded
    // default (day-one price, may still have subscribers on it even if
    // never explicitly "set" through this panel) plus every recorded change
    const [current, historyRows] = await Promise.all([
      effectiveLimit(id, true), // fresh — this becomes the recorded history entry
      serviceQuery<{ price: number }[]>(`plan_limit_history?package_id=eq.${encodeURIComponent(id)}&select=price`),
    ]);
    outgoingPrice = current.price;
    const historicalPrices = [packageById(id)!.price, ...(historyRows ?? []).map((r) => r.price)];

    const { worstPrice, result: margin } = computeMarginAgainstHistory(credits, price, historicalPrices);
    if (!margin.safe) {
      const isLegacy = worstPrice !== price;
      return deny(409, "would_lose_money",
        (isLegacy
          ? `Refused: a subscriber still on this package's ${worstPrice === packageById(id)!.price ? "original" : "a previous"} ` +
            `price of $${worstPrice.toFixed(2)} would get ${credits.toLocaleString()} credits for that price — `
          : `Refused: at $${price.toFixed(2)} for ${credits.toLocaleString()} credits — `) +
          `worst-case cost is $${margin.allInCost.toFixed(2)}, a loss of $${Math.abs(margin.profit).toFixed(2)} per purchase. ` +
          `Raise the price, lower the credits, or both.`,
        { margin, worstPrice, checkedAgainst: historicalPrices },
      );
    }
  }

  if (isResumePass) {
    price = Number(body.price);
    if (!Number.isFinite(price) || price <= 0) return deny(400, "bad_value", "Price must be a positive number.");

    const [current, historyRows] = await Promise.all([
      effectiveLimit(id, true), // fresh — this becomes the recorded history entry
      serviceQuery<{ price: number }[]>(`plan_limit_history?package_id=eq.resume_pass&select=price`),
    ]);
    outgoingPrice = current.price;
    const historicalPrices = [RESUME_PASS.price, ...(historyRows ?? []).map((r) => r.price)];

    const { worstPrice, result: margin } = computeResumePassMarginAgainstHistory(credits, RESUME_PASS.days, price, historicalPrices);
    if (!margin.safe) {
      const isLegacy = worstPrice !== price;
      return deny(409, "would_lose_money",
        (isLegacy
          ? `Refused: someone who bought a pass at the ${worstPrice === RESUME_PASS.price ? "original" : "a previous"} ` +
            `price of $${worstPrice.toFixed(2)} would get ${credits.toLocaleString()} assists/day for that price — `
          : `Refused: at $${price.toFixed(2)} for ${credits.toLocaleString()} assists/day — `) +
          `worst-case cost over the ${RESUME_PASS.days}-day pass is $${margin.allInCost.toFixed(2)}, ` +
          `a loss of $${Math.abs(margin.profit).toFixed(2)}. Raise the price, lower the daily allowance, or both.`,
        { margin, worstPrice, checkedAgainst: historicalPrices },
      );
    }
  }

  const result = await serviceQuery(`plan_limits?on_conflict=id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ id, credits, price, updated_at: new Date().toISOString(), updated_by: gate.session.userId }),
  });
  if (!result) return deny(500, "db_error", "Could not save. Check the plan_limits table exists.");

  // record the price being replaced so future changes stay checked against
  // it too — a legacy subscriber (or, for Resume Pass, someone whose pass
  // hasn't expired yet) locked to it doesn't disappear just because the
  // admin panel moved past it
  if ((isPaid || isResumePass) && outgoingPrice !== null) {
    await serviceQuery("plan_limit_history", {
      method: "POST",
      body: JSON.stringify({ package_id: id, price: outgoingPrice }),
    });
  }

  invalidatePlanLimitsCache();
  return Response.json({
    ok: true,
    id,
    credits,
    price,
    margin: isPaid ? computeMargin(credits, price!) : isResumePass ? computeResumePassMargin(credits, RESUME_PASS.days, price!) : null,
  });
}

/** DELETE ?id=starter — revert one tier back to the lib/packages.ts / FREE_LIMITS default. */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !ALL_LIMIT_IDS.includes(id as LimitId)) return deny(400, "bad_request", "Unknown tier id.");

  const result = await serviceQuery(`plan_limits?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (result === null) return deny(500, "db_error", "Could not revert that tier.");

  invalidatePlanLimitsCache();
  return Response.json({ ok: true, id });
}
