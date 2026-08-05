import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { packageById } from "@/lib/packages";
import { effectivePackage } from "@/lib/plan-limits";
import { createSubscription, cancelSubscription, paypalConfigured, lastPaypalError } from "@/lib/paypal";
import { serviceQuery } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

function deny(status: number, code: string, message: string, detail?: string) {
  return Response.json({ error: code, message, detail }, { status });
}

/**
 * POST { packageId } — start a PayPal subscription. Returns the PayPal
 * approval URL; the plan itself is only activated later by the verified
 * webhook, never by this route.
 */
export async function POST(req: NextRequest) {
  if (!paypalConfigured()) {
    return deny(
      500,
      "not_configured",
      "Payments are not configured yet.",
      "PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in the environment.",
    );
  }

  const session = await getSession(req);
  if (!session.userId) return deny(401, "auth_required", "Log in to subscribe.");

  let body: { packageId?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const pkg = packageById(body.packageId ?? "");
  if (!pkg) return deny(400, "unknown_package", "That package does not exist.");

  if (session.packageId && session.subscriptionStatus === "active") {
    return deny(409, "already_subscribed", "You already have an active package. Cancel it first to switch.");
  }

  // admin-adjustable price in /admin/limits — a new subscriber is always
  // charged whatever price is CURRENTLY in effect, never a stale hardcoded one
  const effective = await effectivePackage(pkg.id);
  const created = await createSubscription(effective.id, session.userId, effective.price);
  if (!created) {
    return deny(
      502,
      "paypal_error",
      "Could not start the PayPal checkout.",
      lastPaypalError() ?? "PayPal did not return an approval link.",
    );
  }

  // remember the pending subscription id so the webhook can cross-check it
  await serviceQuery(`profiles?id=eq.${encodeURIComponent(session.userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ paypal_subscription_id: created.subscriptionId }),
  });

  return Response.json({ approveUrl: created.approveUrl });
}

/**
 * DELETE — cancel the current subscription at PayPal. Access continues until
 * the end of the paid period; the webhook does the final downgrade.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return deny(401, "auth_required", "Log in first.");
  if (!session.paypalSubscriptionId || !session.packageId) {
    return deny(404, "no_subscription", "You don't have an active subscription.");
  }

  const ok = await cancelSubscription(session.paypalSubscriptionId, "Cancelled by user from account page");
  if (!ok) {
    return deny(502, "paypal_error", "PayPal could not cancel the subscription.", lastPaypalError() ?? undefined);
  }

  await serviceQuery(`profiles?id=eq.${encodeURIComponent(session.userId)}`, {
    method: "PATCH",
    body: JSON.stringify({ subscription_status: "cancelling" }),
  });

  return Response.json({ ok: true, message: "Cancelled. Your package stays active until the period ends." });
}
