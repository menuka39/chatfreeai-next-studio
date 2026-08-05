import { NextRequest } from "next/server";
import { verifyWebhook, getSubscription, packageForPlanId } from "@/lib/paypal";
import { serviceQuery } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * PayPal webhook — the ONLY writer of plan state.
 *
 * Security:
 *  1. Signature is verified with PayPal's verify-webhook-signature API.
 *     Unverifiable events are dropped with 400 — never processed.
 *  2. On activation we ALSO fetch the subscription from PayPal's API and use
 *     THAT data (status + custom_id), not the webhook body. Even a perfectly
 *     forged body can't activate anything, because the source of truth is
 *     PayPal's server, not the request.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  const verified = await verifyWebhook(req.headers, raw).catch(() => false);
  if (!verified) {
    console.warn("[paypal-webhook] rejected unverified event");
    return new Response("verification failed", { status: 400 });
  }

  let event: { event_type?: string; resource?: { id?: string; custom_id?: string; plan_id?: string } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const type = event.event_type ?? "";
  const subId = event.resource?.id;
  if (!subId) return new Response("ok", { status: 200 });

  if (type === "BILLING.SUBSCRIPTION.ACTIVATED" || type === "PAYMENT.SALE.COMPLETED") {
    // trust PayPal's API, not the webhook body
    const sub = await getSubscription(subId);
    if (!sub || sub.status !== "ACTIVE" || !sub.custom_id) return new Response("ok", { status: 200 });
    const packageId = await packageForPlanId(sub.plan_id ?? "");
    if (!packageId) return new Response("ok", { status: 200 });

    await serviceQuery(`profiles?id=eq.${encodeURIComponent(sub.custom_id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        package_id: packageId,
        subscription_status: "active",
        paypal_subscription_id: subId,
        current_period_start: new Date().toISOString().slice(0, 10),
      }),
    });
    console.log(`[paypal-webhook] activated ${packageId} for user ${sub.custom_id}`);
  }

  if (
    type === "BILLING.SUBSCRIPTION.CANCELLED" ||
    type === "BILLING.SUBSCRIPTION.SUSPENDED" ||
    type === "BILLING.SUBSCRIPTION.EXPIRED"
  ) {
    await serviceQuery(`profiles?paypal_subscription_id=eq.${encodeURIComponent(subId)}`, {
      method: "PATCH",
      body: JSON.stringify({ package_id: null, subscription_status: "cancelled" }),
    });
    console.log(`[paypal-webhook] downgraded subscription ${subId} (${type})`);
  }

  return new Response("ok", { status: 200 });
}
