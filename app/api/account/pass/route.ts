import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { createPassOrder, capturePassOrder, paypalConfigured, lastPaypalError } from "@/lib/paypal";
import { serviceQuery } from "@/lib/supabase/server";
import { RESUME_PASS } from "@/lib/resume-pass";
import { effectiveResumePass } from "@/lib/plan-limits";

export const runtime = "nodejs";
export const maxDuration = 30;

function deny(status: number, code: string, message: string, detail?: string) {
  return Response.json({ error: code, message, detail }, { status });
}

/** POST — start the PayPal checkout for a Resume Pass, at the current (possibly admin-adjusted) price. */
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return deny(500, "not_configured", "Payments are not configured yet.", "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set.");
  }
  const session = await getSession(req);
  if (!session.userId) return deny(401, "auth_required", "Log in to buy a Resume Pass.");

  const pass = await effectiveResumePass();
  const created = await createPassOrder(session.userId, pass.price, `${RESUME_PASS.name} — ${pass.days} days`);
  if (!created) {
    return deny(502, "paypal_error", "Could not start the PayPal checkout.", lastPaypalError() ?? undefined);
  }
  return Response.json({ approveUrl: created.approveUrl, orderId: created.orderId });
}

/**
 * PUT { orderId } — capture after the user approves on PayPal, then grant the
 * pass. The grant is driven by PayPal's capture response (which reports the
 * amount actually paid and the custom_id we set), not by anything the browser
 * sends, so a user can't self-grant by calling this with a made-up id.
 */
export async function PUT(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return deny(401, "auth_required", "Log in first.");

  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }
  if (!body.orderId) return deny(400, "bad_request", "orderId is required.");

  const captured = await capturePassOrder(body.orderId);
  if (!captured) {
    return deny(502, "paypal_error", "PayPal did not confirm that payment.", lastPaypalError() ?? undefined);
  }
  // the order must belong to this user and cover the CURRENT price — not the
  // hardcoded default, since an admin may have changed it after this order
  // was created (the order itself was created at whatever price was
  // effective at that moment, so this should still match under normal
  // operation; re-checking against current rather than hardcoded keeps this
  // consistent with every other admin-adjustable price check in the app)
  const pass = await effectiveResumePass();
  if (captured.userId !== session.userId || captured.amount + 0.001 < pass.price) {
    console.warn("[pass] capture mismatch", { expected: session.userId, got: captured.userId, amount: captured.amount });
    return deny(403, "mismatch", "That payment doesn't match your account.");
  }

  const expires = new Date(Date.now() + pass.days * 24 * 60 * 60 * 1000).toISOString();
  await serviceQuery(`profiles?id=eq.${encodeURIComponent(session.userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ resume_pass_expires_at: expires }),
  });

  return Response.json({ ok: true, expiresAt: expires });
}
