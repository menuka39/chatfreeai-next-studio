/**
 * One-time PayPal setup: creates the product and the three monthly billing
 * plans, then prints the P-… ids to paste into your env vars.
 *
 *   PAYPAL_ENV=sandbox \
 *   PAYPAL_CLIENT_ID=xxx \
 *   PAYPAL_CLIENT_SECRET=xxx \
 *   node scripts/setup-paypal.mjs
 *
 * Run it once against sandbox, test, then once with PAYPAL_ENV=live and your
 * live credentials. Safe to re-run: PayPal just creates another product/plan,
 * and you use whichever ids you configure.
 *
 * Prices come from lib/packages.ts — the single source of truth — so the
 * PayPal plans can never drift from what the site shows.
 */

import { readFileSync } from "node:fs";

const ENV = process.env.PAYPAL_ENV === "live" ? "live" : "sandbox";
const BASE = ENV === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
const ID = process.env.PAYPAL_CLIENT_ID;
const SECRET = process.env.PAYPAL_CLIENT_SECRET;

if (!ID || !SECRET) {
  console.error("Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET first (from developer.paypal.com → My Apps).");
  process.exit(1);
}

/* ---- read the packages from the catalogue so prices can't drift ---- */
const src = readFileSync(new URL("../lib/packages.ts", import.meta.url), "utf8");
const pkgs = [...src.matchAll(/id: "(starter|pro|promax)",\s*\n\s*name: "([^"]+)",\s*\n\s*price: ([\d.]+)/g)].map(
  (m) => ({ id: m[1], name: m[2], price: m[3] }),
);
if (pkgs.length !== 3) {
  console.error("Could not read the three packages from lib/packages.ts");
  process.exit(1);
}

/* ---- auth ---- */
const tokenRes = await fetch(`${BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: `Basic ${Buffer.from(`${ID}:${SECRET}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
if (!tokenRes.ok) {
  console.error("Auth failed:", tokenRes.status, await tokenRes.text());
  process.exit(1);
}
const { access_token } = await tokenRes.json();
const H = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

/* ---- 1. product ---- */
const productRes = await fetch(`${BASE}/v1/catalogs/products`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Chat Free AI subscription",
    description: "Monthly credit packages for chatfreeai.com — chat, image, video and voice AI.",
    type: "SERVICE",
    category: "SOFTWARE",
    home_url: "https://chatfreeai.com",
  }),
});
if (!productRes.ok) {
  console.error("Product creation failed:", productRes.status, await productRes.text());
  process.exit(1);
}
const product = await productRes.json();
console.log(`✓ product created: ${product.id} (${ENV})\n`);

/* ---- 2. three monthly plans ---- */
const envNames = { starter: "PAYPAL_PLAN_STARTER", pro: "PAYPAL_PLAN_PRO", promax: "PAYPAL_PLAN_PROMAX" };
const results = [];

for (const pkg of pkgs) {
  const planRes = await fetch(`${BASE}/v1/billing/plans`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      product_id: product.id,
      name: `${pkg.name} — $${pkg.price}/month`,
      description: `Chat Free AI ${pkg.name} package, billed monthly. Cancel anytime.`,
      status: "ACTIVE",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          total_cycles: 0, // renews until cancelled
          pricing_scheme: { fixed_price: { value: pkg.price, currency_code: "USD" } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        setup_fee_failure_action: "CONTINUE",
        // cancel the subscription automatically after 3 failed renewals —
        // our webhook then downgrades the account
        payment_failure_threshold: 3,
      },
    }),
  });
  if (!planRes.ok) {
    console.error(`Plan creation failed for ${pkg.name}:`, planRes.status, await planRes.text());
    process.exit(1);
  }
  const plan = await planRes.json();
  console.log(`✓ ${pkg.name.padEnd(8)} $${pkg.price}/mo -> ${plan.id}`);
  results.push(`${envNames[pkg.id]}=${plan.id}`);
}

console.log(`\nPaste these into your env (${ENV}):\n`);
console.log(`PAYPAL_ENV=${ENV}`);
for (const line of results) console.log(line);
console.log(`\nStill needed: PAYPAL_WEBHOOK_ID — create the webhook in the Developer
Dashboard (URL: https://chatfreeai.com/api/webhooks/paypal) and copy its id.`);
