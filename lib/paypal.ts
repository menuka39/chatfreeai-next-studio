
/**
 * PayPal Subscriptions integration.
 *
 * SECURITY MODEL — why this shape:
 *  - Card numbers NEVER touch our servers. The user enters them on PayPal's
 *    own pages (or uses their PayPal balance/wallet). Saving and removing
 *    cards happens inside the PayPal wallet, which is PCI-DSS Level 1 — the
 *    strongest certification that exists. Storing cards ourselves would make
 *    us a breach target for no benefit.
 *  - Plan changes are applied ONLY from webhooks whose signature PayPal has
 *    verified (verify-webhook-signature API). A user cannot forge a request
 *    to give themselves a package.
 *  - Client id/secret live server-side only.
 */

const BASE =
  process.env.PAYPAL_BASE_URL ??
  (process.env.PAYPAL_ENV === "live"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com");

let tokenCache: { token: string; expires: number } | null = null;

/**
 * Last PayPal failure, for diagnostics. Holds PayPal's own error text (issue
 * codes like INVALID_RESOURCE_ID, or "Client Authentication failed") — never
 * our credentials.
 */
let lastError: string | null = null;
export const lastPaypalError = () => lastError;

async function accessToken(): Promise<string | null> {
  // Read straight from the environment. These were briefly editable from an
  // admin screen; that was removed deliberately — a hijacked admin session
  // could have swapped in an attacker's PayPal credentials and quietly
  // redirected every payment. Rotating these now needs a deploy, which is
  // the right amount of friction for the credentials that receive money.
  const id = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_CLIENT_SECRET;
  if (!id || !secret) {
    lastError = "PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET is not set";
    return null;
  }
  if (tokenCache && tokenCache.expires > Date.now() + 60_000) return tokenCache.token;

  try {
    const res = await fetch(`${BASE}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastError =
        res.status === 401
          ? `PayPal rejected the credentials (401). Check that PAYPAL_CLIENT_ID/SECRET are the ${process.env.PAYPAL_ENV === "live" ? "LIVE" : "SANDBOX"} pair and match PAYPAL_ENV.`
          : `PayPal auth failed (${res.status}): ${body.slice(0, 200)}`;
      return null;
    }
    const json = await res.json();
    tokenCache = { token: json.access_token, expires: Date.now() + json.expires_in * 1000 };
    lastError = null;
    return tokenCache.token;
  } catch (e) {
    lastError = `Could not reach PayPal: ${e instanceof Error ? e.message : "network error"}`;
    return null;
  }
}

async function api<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const token = await accessToken();
  if (!token) return null;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(15000),
    });
    if (res.status === 204) return {} as T;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastError = `${path} -> ${res.status}: ${body.slice(0, 300)}`;
      console.error("[paypal]", lastError);
      return null;
    }
    return (await res.json()) as T;
  } catch (e) {
    lastError = `${path} -> ${e instanceof Error ? e.message : "network error"}`;
    console.error("[paypal]", lastError);
    return null;
  }
}

/** Env override for a package's plan id (optional — auto-provisioned otherwise). */
function planIdFromEnv(packageId: string): string | null {
  const map: Record<string, string | undefined> = {
    starter: process.env.PAYPAL_PLAN_STARTER,
    pro: process.env.PAYPAL_PLAN_PRO,
    promax: process.env.PAYPAL_PLAN_PROMAX,
  };
  return map[packageId] ?? null;
}

/* ------------------------------------------------------------------ */
/* Auto-provisioning: product, plans and webhook are created (or found)
/* through the API on first use, so the only required env vars are the
/* client id + secret. Cached in memory per process.
/* ------------------------------------------------------------------ */

/**
 * Where PayPal sends the customer back to.
 *
 * Falling back to localhost in production would drop someone who has just
 * paid onto a dead address, with the money taken and no way back to the site.
 * Outside development the domain is the only safe default.
 */
function returnBase() {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return process.env.NODE_ENV === "production" ? "https://chatfreeai.com" : "http://localhost:3000";
}

const PRODUCT_NAME = "Chat Free AI subscription";
/** Plan names encode the package id AND price — change a price in
 *  lib/packages.ts and a fresh plan is provisioned automatically. */
const planName = (packageId: string, price: number) => `cfai-${packageId} $${price}/month`;

let productCache: string | null = null;
const planCache = new Map<string, string>();          // `${packageId}:${price}` -> planId
const planReverse = new Map<string, string>();        // planId -> packageId
let webhookCache: string | null = null;

async function ensureProduct(): Promise<string | null> {
  if (productCache) return productCache;
  // find existing
  const list = await api<{ products?: { id: string; name: string }[] }>(
    "/v1/catalogs/products?page_size=20&total_required=false",
  );
  const found = list?.products?.find((p) => p.name === PRODUCT_NAME);
  if (found) return (productCache = found.id);
  // create
  const created = await api<{ id: string }>("/v1/catalogs/products", {
    method: "POST",
    body: JSON.stringify({
      name: PRODUCT_NAME,
      description: "Monthly credit packages for chatfreeai.com — chat, image, video and voice AI.",
      type: "SERVICE",
      category: "SOFTWARE",
      home_url: process.env.SITE_URL ?? "https://chatfreeai.com",
    }),
  });
  if (created?.id) productCache = created.id;
  return productCache;
}

/**
 * Resolve the PayPal plan id for a package: env override first, then an
 * existing plan with the matching name, otherwise create it.
 */
export async function ensurePlanId(packageId: string, price: number): Promise<string | null> {
  const fromEnv = planIdFromEnv(packageId);
  if (fromEnv) {
    planReverse.set(fromEnv, packageId);
    return fromEnv;
  }
  // keyed by price too: a plan cached for the OLD price must never be
  // returned for a NEW one — each distinct price is genuinely a different
  // PayPal plan (see planName below), and the cache exists purely to avoid
  // re-querying PayPal for the SAME plan on every checkout, not to shortcut
  // past a real price change
  const cacheKey = `${packageId}:${price}`;
  const cached = planCache.get(cacheKey);
  if (cached) return cached;

  const productId = await ensureProduct();
  if (!productId) return null;

  const wanted = planName(packageId, price);
  const list = await api<{ plans?: { id: string; name: string; status: string }[] }>(
    `/v1/billing/plans?product_id=${encodeURIComponent(productId)}&page_size=20&total_required=false`,
  );
  const found = list?.plans?.find((p) => p.name === wanted && p.status === "ACTIVE");
  if (found) {
    planCache.set(cacheKey, found.id);
    planReverse.set(found.id, packageId);
    return found.id;
  }

  const created = await api<{ id: string }>("/v1/billing/plans", {
    method: "POST",
    body: JSON.stringify({
      product_id: productId,
      name: wanted,
      description: `Chat Free AI ${packageId} package, billed monthly. Cancel anytime.`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0,
          pricing_scheme: { fixed_price: { value: String(price), currency_code: "USD" } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        payment_failure_threshold: 3,
      },
    }),
  });
  if (!created?.id) return null;
  planCache.set(cacheKey, created.id);
  planReverse.set(created.id, packageId);
  return created.id;
}

/** Map a PayPal plan id back to our package id (for the webhook). */
export async function packageForPlanId(planId: string): Promise<string | null> {
  // env overrides
  for (const pkg of ["starter", "pro", "promax"]) {
    if (planIdFromEnv(pkg) === planId) return pkg;
  }
  if (planReverse.has(planId)) return planReverse.get(planId)!;
  // cold cache (e.g. webhook lands on a fresh instance): fetch the plan and
  // parse the package id out of its name
  const plan = await api<{ id: string; name?: string }>(
    `/v1/billing/plans/${encodeURIComponent(planId)}`,
  );
  const m = plan?.name?.match(/^cfai-(starter|pro|promax) /);
  if (m) {
    planReverse.set(planId, m[1]);
    return m[1];
  }
  return null;
}

/**
 * Resolve the webhook id used for signature verification: env override
 * first, then an existing webhook pointing at our URL, otherwise create it.
 */
export async function ensureWebhookId(): Promise<string | null> {
  if (process.env.PAYPAL_WEBHOOK_ID) return process.env.PAYPAL_WEBHOOK_ID;
  if (webhookCache) return webhookCache;

  const site = process.env.SITE_URL;
  if (!site || !site.startsWith("https://")) return null; // PayPal requires https
  const url = `${site.replace(/\/$/, "")}/api/webhooks/paypal`;

  const list = await api<{ webhooks?: { id: string; url: string }[] }>("/v1/notifications/webhooks");
  const found = list?.webhooks?.find((w) => w.url === url);
  if (found) return (webhookCache = found.id);

  const created = await api<{ id: string }>("/v1/notifications/webhooks", {
    method: "POST",
    body: JSON.stringify({
      url,
      event_types: [
        { name: "BILLING.SUBSCRIPTION.ACTIVATED" },
        { name: "BILLING.SUBSCRIPTION.CANCELLED" },
        { name: "BILLING.SUBSCRIPTION.SUSPENDED" },
        { name: "BILLING.SUBSCRIPTION.EXPIRED" },
        { name: "PAYMENT.SALE.COMPLETED" },
      ],
    }),
  });
  if (created?.id) webhookCache = created.id;
  return webhookCache;
}

/** Create a subscription; returns the PayPal approval URL to redirect to. */
export async function createSubscription(packageId: string, userId: string, price: number) {
  const planId = await ensurePlanId(packageId, price);
  if (!planId) {
    lastError = lastError ?? "Could not create or find the PayPal billing plan.";
    return null;
  }
  const site = returnBase();

  const sub = await api<{ id: string; links: { rel: string; href: string }[] }>(
    "/v1/billing/subscriptions",
    {
      method: "POST",
      body: JSON.stringify({
        plan_id: planId,
        custom_id: userId, // ties the webhook back to our user
        application_context: {
          brand_name: "Chat Free AI",
          user_action: "SUBSCRIBE_NOW",
          return_url: `${site}/account?checkout=success`,
          cancel_url: `${site}/account?checkout=cancelled`,
        },
      }),
    },
  );
  if (!sub) return null;
  const approve = sub.links.find((l) => l.rel === "approve")?.href ?? null;
  return approve ? { subscriptionId: sub.id, approveUrl: approve } : null;
}

export async function cancelSubscription(subscriptionId: string, reason: string) {
  const res = await api(`/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason: reason.slice(0, 120) }),
  });
  return res !== null;
}

export async function getSubscription(subscriptionId: string) {
  return api<{ id: string; status: string; custom_id?: string; plan_id?: string }>(
    `/v1/billing/subscriptions/${encodeURIComponent(subscriptionId)}`,
  );
}

/**
 * Verify a webhook came from PayPal. Uses PayPal's own verification API —
 * an unverifiable event is DISCARDED, never processed.
 */
export async function verifyWebhook(headers: Headers, rawBody: string): Promise<boolean> {
  const webhookId = await ensureWebhookId();
  if (!webhookId) return false;
  const result = await api<{ verification_status: string }>(
    "/v1/notifications/verify-webhook-signature",
    {
      method: "POST",
      body: JSON.stringify({
        auth_algo: headers.get("paypal-auth-algo"),
        cert_url: headers.get("paypal-cert-url"),
        transmission_id: headers.get("paypal-transmission-id"),
        transmission_sig: headers.get("paypal-transmission-sig"),
        transmission_time: headers.get("paypal-transmission-time"),
        webhook_id: webhookId,
        webhook_event: JSON.parse(rawBody),
      }),
    },
  );
  return result?.verification_status === "SUCCESS";
}

/**
 * One-time purchase (Resume Pass). Uses the Orders API rather than
 * Subscriptions — a 5-day pass shouldn't create a recurring agreement the
 * user then has to remember to cancel.
 */
export async function createPassOrder(userId: string, price: number, label: string) {
  const site = returnBase();
  const order = await api<{ id: string; links: { rel: string; href: string }[] }>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: userId,
          description: label.slice(0, 127),
          amount: { currency_code: "USD", value: price.toFixed(2) },
        },
      ],
      application_context: {
        brand_name: "Chat Free AI",
        user_action: "PAY_NOW",
        return_url: `${site}/account?pass=success`,
        cancel_url: `${site}/account?pass=cancelled`,
      },
    }),
  });
  if (!order) {
    lastError = lastError ?? "PayPal did not create the order.";
    return null;
  }
  const approve = order.links.find((l) => l.rel === "approve")?.href ?? null;
  return approve ? { orderId: order.id, approveUrl: approve } : null;
}

/** Capture an approved order. Returns the payer-confirmed amount, or null. */
export async function capturePassOrder(orderId: string) {
  const res = await api<{ status: string; purchase_units?: { custom_id?: string; payments?: { captures?: { amount?: { value?: string } }[] } }[] }>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    { method: "POST", body: "{}" },
  );
  if (!res || res.status !== "COMPLETED") return null;
  const unit = res.purchase_units?.[0];
  return {
    userId: unit?.custom_id ?? null,
    amount: Number(unit?.payments?.captures?.[0]?.amount?.value ?? 0),
  };
}

/**
 * Orders API, for a Priority Listing purchase — a one-off payment against a
 * specific submission, not a subscription. custom_id carries the SUBMISSION
 * id (not the user id) so capture can look up exactly which listing to
 * activate without trusting anything else the client sends.
 */
export async function createToolSubmissionOrder(submissionId: string, price: number, label: string) {
  const site = returnBase();
  const order = await api<{ id: string; links: { rel: string; href: string }[] }>("/v2/checkout/orders", {
    method: "POST",
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          custom_id: submissionId,
          description: label.slice(0, 127),
          amount: { currency_code: "USD", value: price.toFixed(2) },
        },
      ],
      application_context: {
        brand_name: "Chat Free AI",
        user_action: "PAY_NOW",
        return_url: `${site}/tools/submit?paid=success`,
        cancel_url: `${site}/tools/submit?paid=cancelled`,
      },
    }),
  });
  if (!order) {
    lastError = lastError ?? "PayPal did not create the order.";
    return null;
  }
  const approve = order.links.find((l) => l.rel === "approve")?.href ?? null;
  return approve ? { orderId: order.id, approveUrl: approve } : null;
}

/** Capture an approved Priority Listing order. Returns the submission id and paid amount, or null. */
export async function captureToolSubmissionOrder(orderId: string) {
  const res = await api<{ status: string; purchase_units?: { custom_id?: string; payments?: { captures?: { amount?: { value?: string } }[] } }[] }>(
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    { method: "POST", body: "{}" },
  );
  if (!res || res.status !== "COMPLETED") return null;
  const unit = res.purchase_units?.[0];
  return {
    submissionId: unit?.custom_id ?? null,
    amount: Number(unit?.payments?.captures?.[0]?.amount?.value ?? 0),
  };
}

export function paypalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}
