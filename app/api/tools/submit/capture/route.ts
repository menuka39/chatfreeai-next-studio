import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { serviceQuery } from "@/lib/supabase/server";
import { captureToolSubmissionOrder, lastPaypalError } from "@/lib/paypal";
import { priorityTier } from "@/lib/tool-submission";
import { effectivePriorityPrice } from "@/lib/priority-pricing";

export const runtime = "nodejs";
export const maxDuration = 30;

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

interface SubmissionRow {
  id: string;
  user_id: string;
  tier: string;
  status: string;
  submitted_at: string;
  tool_name: string;
}

/**
 * POST { orderId } — confirm a Priority Listing payment and activate the
 * submission. Driven entirely by what PayPal's capture response reports
 * (submission id via custom_id, amount actually paid) — never by anything
 * the browser claims, so a request can't self-activate by inventing an id.
 */
export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return deny(401, "auth_required", "Log in first.");

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }
  if (!body.orderId) return deny(400, "bad_request", "orderId is required.");

  const captured = await captureToolSubmissionOrder(body.orderId);
  if (!captured || !captured.submissionId) {
    return deny(502, "paypal_error", "PayPal did not confirm that payment.", { detail: lastPaypalError() ?? undefined });
  }

  const rows = await serviceQuery<SubmissionRow[]>(
    `tool_submissions?id=eq.${encodeURIComponent(captured.submissionId)}&select=id,user_id,tier,status,submitted_at,tool_name`,
  );
  const submission = rows?.[0];
  if (!submission) return deny(404, "not_found", "That submission no longer exists.");

  // ownership check — the submitter is the only one who should be able to
  // land here with a real approved order for it
  if (submission.user_id !== session.userId) {
    console.warn("[tool-submit] capture ownership mismatch", { submission: submission.id, session: session.userId });
    return deny(403, "mismatch", "That payment doesn't match your account.");
  }

  if (submission.status !== "awaiting_payment") {
    // already captured (double-click, browser back-button) — idempotent success
    return Response.json({ ok: true, submissionId: submission.id, alreadyCaptured: true });
  }

  const tier = priorityTier(submission.tier);
  if (!tier) return deny(500, "bad_state", "This submission has an invalid tier.");

  // defense in depth: the amount PayPal actually captured must match this
  // tier's real price, not just be "a payment happened". Checked against the
  // CURRENT effective price rather than a price stored at order-creation
  // time — correct in the vastly common case, but if an admin changes the
  // price in the narrow window between a user starting checkout and
  // completing it on PayPal, a legitimate payment at the OLD price could be
  // rejected here. Worth knowing, not worth the schema complexity of
  // tracking a per-order expected price for a multi-minute-at-most window.
  const expectedPrice = (await effectivePriorityPrice(submission.tier)) ?? tier.price;
  if (captured.amount + 0.001 < expectedPrice) {
    console.warn("[tool-submit] underpaid capture", { submission: submission.id, expected: expectedPrice, got: captured.amount });
    return deny(402, "amount_mismatch", "The payment amount didn't match the listing price.");
  }

  const now = new Date();
  const reviewDueAt = new Date(now.getTime() + tier.hours * 3_600_000).toISOString();

  const updated = await serviceQuery<SubmissionRow[]>(`tool_submissions?id=eq.${encodeURIComponent(submission.id)}`, {
    method: "PATCH",
    body: JSON.stringify({
      status: "pending",
      paypal_order_id: body.orderId,
      amount_paid: captured.amount,
      submitted_at: now.toISOString(),
      review_due_at: reviewDueAt,
      updated_at: now.toISOString(),
    }),
  });

  if (!updated?.length) return deny(500, "db_error", "Payment was captured but the listing couldn't be activated. Contact support.");

  return Response.json({ ok: true, submissionId: submission.id, reviewDueAt, toolName: submission.tool_name });
}
