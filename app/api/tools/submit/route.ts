import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { serviceQuery } from "@/lib/supabase/server";
import {
  validateSubmission,
  freeQueueEta,
  formatEta,
  priorityTier,
  MAX_PENDING_FREE_PER_USER,
  MAX_PENDING_TOTAL_PER_USER,
  type SubmissionInput,
} from "@/lib/tool-submission";
import { packageGrantsFreepriority, freePriorityRemaining, reserveFreePriority, releaseFreePriority } from "@/lib/submission-access";
import { effectivePriorityPrice, effectivePriorityTiers } from "@/lib/priority-pricing";
import { createToolSubmissionOrder, paypalConfigured, lastPaypalError } from "@/lib/paypal";

export const runtime = "nodejs";
export const maxDuration = 30;

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

interface SubmissionRow {
  id: string;
  tier: string;
  status: string;
  submitted_at: string;
}

/** Current size of the free queue — also what a new free submission would join. */
async function freeQueueDepth(): Promise<number> {
  const rows = await serviceQuery<SubmissionRow[]>(
    "tool_submissions?tier=eq.free&status=eq.pending&select=id",
  );
  return rows?.length ?? 0;
}

/**
 * GET — what the submit form needs to show before anyone fills anything in:
 * the live free-queue ETA, and (if signed in with a package) how many of the
 * monthly free 24h priority slots are left.
 */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  const depth = await freeQueueDepth();
  const eta = freeQueueEta(depth + 1);

  return Response.json({
    signedIn: Boolean(session.userId),
    freeQueue: { position: eta.position, hours: eta.hours, formatted: formatEta(eta) },
    packagePerk: packageGrantsFreepriority(session)
      ? { available: true, remaining: await freePriorityRemaining(session) }
      : { available: false, remaining: 0 },
    priorityTiers: await effectivePriorityTiers(),
  });
}

/**
 * POST — create a submission.
 *
 * Three outcomes depending on tier:
 *  - free:            queued immediately, status='pending'
 *  - package-24h:      queued immediately IF a monthly slot is available,
 *                       status='pending', paid_via_package=true
 *  - 6h/24h/48h/72h:   status='awaiting_payment' — the row is saved (so the
 *                       filled-in form survives the redirect to PayPal) but
 *                       does NOT count toward anything or go live until
 *                       /api/tools/submit/capture confirms payment.
 */
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return deny(401, "auth_required", "Sign in to submit a tool.");

  let body: Partial<SubmissionInput> & { tier?: string; usePackagePerk?: boolean };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const errors = validateSubmission(body);
  if (Object.keys(errors).length) return deny(400, "validation_failed", "Check the highlighted fields.", { fields: errors });

  const tier = body.tier ?? "free";
  const isPriority = tier !== "free";
  if (isPriority && !priorityTier(tier)) return deny(400, "bad_request", "Unknown listing tier.");

  // abuse ceilings — generous, not normal-use limits
  const mine = await serviceQuery<SubmissionRow[]>(
    `tool_submissions?user_id=eq.${encodeURIComponent(session.userId)}&status=in.(awaiting_payment,pending)&select=id,tier`,
  );
  const pendingFree = (mine ?? []).filter((r) => r.tier === "free").length;
  if (tier === "free" && pendingFree >= MAX_PENDING_FREE_PER_USER) {
    return deny(429, "too_many_pending", `You already have ${MAX_PENDING_FREE_PER_USER} free submissions waiting for review.`);
  }
  if ((mine?.length ?? 0) >= MAX_PENDING_TOTAL_PER_USER) {
    return deny(429, "too_many_pending", "You have too many submissions in progress right now.");
  }

  const usingPackagePerk = tier === "24h" && Boolean(body.usePackagePerk);
  let reservedPerk = false;
  if (usingPackagePerk) {
    reservedPerk = await reserveFreePriority(session);
    if (!reservedPerk) {
      return deny(429, "perk_unavailable", "You're out of free priority listings for this month — pick a paid tier instead.");
    }
  }

  const now = new Date();
  const priority = isPriority ? priorityTier(tier) : null;
  const willGoLiveImmediately = tier === "free" || usingPackagePerk;

  const insertBody = {
    user_id: session.userId,
    tool_name: body.toolName!.trim(),
    tagline: body.tagline!.trim(),
    description: body.description!.trim(),
    website_url: body.websiteUrl!.trim(),
    category: body.category,
    contact_email: body.contactEmail!.trim(),
    tier,
    status: willGoLiveImmediately ? "pending" : "awaiting_payment",
    paid_via_package: usingPackagePerk,
    review_due_at: willGoLiveImmediately && priority
      ? new Date(now.getTime() + priority.hours * 3_600_000).toISOString()
      : null,
  };

  const created = await serviceQuery<SubmissionRow[]>("tool_submissions", {
    method: "POST",
    body: JSON.stringify(insertBody),
  });
  const submission = created?.[0];
  if (!submission) {
    if (reservedPerk) await releaseFreePriority(session);
    return deny(500, "db_error", "Could not save your submission. Please try again.");
  }

  if (willGoLiveImmediately) {
    if (tier === "free") {
      const depth = await freeQueueDepth();
      const eta = freeQueueEta(depth); // this row is already counted in depth
      return Response.json({
        submissionId: submission.id,
        status: "queued",
        tier: "free",
        queue: { position: eta.position, formatted: formatEta(eta) },
      });
    }
    return Response.json({
      submissionId: submission.id,
      status: "queued",
      tier: "24h",
      usedPackagePerk: true,
      reviewDueAt: insertBody.review_due_at,
    });
  }

  // paid priority — start the PayPal order against this specific submission
  if (!paypalConfigured()) {
    return deny(500, "not_configured", "Payments are not configured yet.");
  }
  const order = await createToolSubmissionOrder(
    submission.id,
    (await effectivePriorityPrice(tier))!,
    `${priority!.label} Priority Listing — ${insertBody.tool_name}`,
  );
  if (!order) {
    return deny(502, "paypal_error", "Could not start the PayPal checkout.", { detail: lastPaypalError() ?? undefined });
  }

  return Response.json({
    submissionId: submission.id,
    status: "awaiting_payment",
    tier,
    approveUrl: order.approveUrl,
    orderId: order.orderId,
  });
}
