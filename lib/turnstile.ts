import { createHmac, timingSafeEqual } from "crypto";

/**
 * Cloudflare Turnstile — bot protection for the guest tier.
 *
 * WHY GUESTS SPECIFICALLY: a guest gets free tokens plus 3 web searches a day,
 * and a search costs us $0.005 with no revenue behind it. The only thing
 * separating guests today is an IP hash and a device id — and the device id is
 * a UUID the browser generates and stores in localStorage, so a script can mint
 * a fresh one per request. Rotating IPs defeats the other half. Signed-in users
 * are already accountable through their account, so they are never challenged.
 *
 * ONE CHALLENGE, NOT ONE PER MESSAGE: Turnstile tokens are single-use and
 * short-lived. Solving on every message would be hostile and would hammer
 * Cloudflare, so a passing verification mints a short-lived HMAC-signed cookie
 * and subsequent messages just present that.
 *
 * The cookie is signed server-side and httpOnly: the browser can neither read
 * nor forge it, which is the whole point — an unsigned "I am human" flag would
 * be the same as no check at all.
 */

const VERIFY_URL =
  process.env.TURNSTILE_VERIFY_URL ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** How long a solved challenge is honoured before we ask again. */
export const HUMAN_TTL_SECONDS = 2 * 60 * 60;
export const HUMAN_COOKIE = "cfai_h";

export const turnstileConfigured = () =>
  Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

const secret = () => process.env.TURNSTILE_SECRET_KEY ?? "";
const signingKey = () =>
  // deliberately the raw value: this is a signing secret, and trimming it
  // would change every signature already issued
  process.env.TURNSTILE_SECRET_KEY ?? process.env.OPENROUTER_API_KEY ?? "insecure-dev-secret";

export interface VerifyResult {
  ok: boolean;
  /** Cloudflare's machine-readable reason, for logs — never shown to the user */
  codes?: string[];
}

/** Ask Cloudflare whether this challenge response is genuine. */
export async function verifyTurnstile(token: string, ip: string | null): Promise<VerifyResult> {
  if (!token) return { ok: false, codes: ["missing-input-response"] };

  const form = new URLSearchParams();
  form.set("secret", secret());
  form.set("response", token);
  if (ip) form.set("remoteip", ip);

  try {
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    return { ok: Boolean(json.success), codes: json["error-codes"] };
  } catch {
    // Cloudflare unreachable. Refusing here would take the whole guest tier
    // offline because of someone else's outage, so we let it through and log —
    // the per-day quotas are still the real spend ceiling.
    console.warn("[turnstile] verification endpoint unreachable — allowing this request");
    return { ok: true, codes: ["verify-unreachable"] };
  }
}

/* ------------------------------------------------------------------ */
/* Short-lived "this browser passed" cookie                            */
/* ------------------------------------------------------------------ */

/** value = `<expiryEpochSeconds>.<hmac>` */
export function mintHumanCookie(): string {
  const expires = Math.floor(Date.now() / 1000) + HUMAN_TTL_SECONDS;
  const sig = createHmac("sha256", signingKey()).update(String(expires)).digest("base64url");
  return `${expires}.${sig}`;
}

export function humanCookieValid(value: string | undefined | null): boolean {
  if (!value) return false;
  const [expiresRaw, sig] = value.split(".");
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || !sig) return false;
  if (expires < Math.floor(Date.now() / 1000)) return false;

  const expected = Buffer.from(createHmac("sha256", signingKey()).update(expiresRaw).digest("base64url"));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const humanCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: HUMAN_TTL_SECONDS,
};
