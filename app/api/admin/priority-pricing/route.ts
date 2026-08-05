import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { serviceQuery } from "@/lib/supabase/server";
import { effectivePriorityTiers, invalidatePriorityPricingCache } from "@/lib/priority-pricing";
import { PRIORITY_TIERS } from "@/lib/tool-submission";

export const runtime = "nodejs";
export const maxDuration = 15;

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

const settingKey = (tierId: string) => `priority_price_${tierId}`;

/** GET — the 4 tiers with their effective (possibly admin-overridden) price. */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  return Response.json({ tiers: await effectivePriorityTiers() });
}

/**
 * POST { id, price } — rotate one tier's price.
 *
 * No margin/profit check here, unlike /admin/limits — Priority Listing has
 * no credits or AI-cost dimension at all (paying for it just skips the free
 * queue, it doesn't grant any metered resource), so there's no "worst-case
 * spend" to validate a price against. The safeguard is simpler: a real,
 * positive number, nothing else.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  let body: { id?: string; price?: number };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const tier = PRIORITY_TIERS.find((t) => t.id === body.id);
  if (!tier) return deny(400, "bad_request", "Unknown tier id.");

  const price = Number(body.price);
  if (!Number.isFinite(price) || price <= 0) return deny(400, "bad_value", "Price must be a positive number.");

  const result = await serviceQuery("site_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ key: settingKey(tier.id), value: String(price), updated_at: new Date().toISOString() }),
  });
  if (!result) return deny(500, "db_error", "Could not save. Check the site_settings table exists.");

  invalidatePriorityPricingCache();
  return Response.json({ ok: true, id: tier.id, price });
}

/** DELETE ?id=6h — revert one tier back to the lib/tool-submission.ts default. */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const id = req.nextUrl.searchParams.get("id");
  const tier = PRIORITY_TIERS.find((t) => t.id === id);
  if (!tier) return deny(400, "bad_request", "Unknown tier id.");

  const result = await serviceQuery(`site_settings?key=eq.${encodeURIComponent(settingKey(tier.id))}`, { method: "DELETE" });
  if (result === null) return deny(500, "db_error", "Could not revert that tier.");

  invalidatePriorityPricingCache();
  return Response.json({ ok: true, id: tier.id });
}
