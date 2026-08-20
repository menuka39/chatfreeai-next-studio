/**
 * SERVER ONLY. Holds VIDEO_URL_SECRET — the signing key for video URLs and refund tokens.
 *
 * Importing this from a "use client" file is a build error, by design.
 * Nothing leaks today — Next.js never inlines a non-NEXT_PUBLIC_ variable
 * into the browser bundle; it substitutes `undefined`. That is the actual
 * hazard: the mistake compiles, ships, and only shows up as an unexplained
 * auth failure in production. This turns it into a red build instead.
 */
import "server-only";

import { createHmac, timingSafeEqual } from "crypto";

/**
 * Signs the provider video URLs our own server hands out.
 *
 * The extend feature needs to read the last frame of a finished clip, and a
 * cross-origin <video> taints the canvas — so the file has to come back
 * through our origin. A naive `/proxy?url=…` is a textbook SSRF hole: anyone
 * could point it at an internal address and use our server as a fetcher.
 *
 * Signing closes that completely. The proxy only accepts a URL our own poll
 * endpoint produced and signed, so an attacker can't invent one. No allowlist
 * of provider hostnames to keep up to date either.
 */

const secret = () =>
  // deliberately the raw value: this is a signing secret, and trimming it
  // would change every signature already issued
  process.env.VIDEO_URL_SECRET ?? process.env.OPENROUTER_API_KEY ?? "insecure-dev-secret";

export function signVideoUrl(url: string): string {
  return createHmac("sha256", secret()).update(url).digest("base64url");
}

export function verifyVideoUrl(url: string, token: string): boolean {
  try {
    const expected = Buffer.from(signVideoUrl(url));
    const given = Buffer.from(token);
    return expected.length === given.length && timingSafeEqual(expected, given);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Refund tokens                                                       */
/* ------------------------------------------------------------------ */

/**
 * What the poll endpoint needs to know to refund a failed job.
 *
 * This used to travel as bare base64 JSON with no signature at all, which made
 * it a credit printer: the client could rewrite `credits` to any number, point
 * `key` at any user's quota bucket, and replay the same failed job as often as
 * it liked. Every field below is now covered by an HMAC, the job id is bound
 * into the claim so a token can't be moved to a different job, and the quota
 * key is no longer carried at all — the server rebuilds it from the session.
 */
export interface RefundClaim {
  jobId: string;
  userId: string;
  period: string;
  credits: number;
}

function refundPayload(claim: RefundClaim): string {
  // fixed field order — the signature covers this exact string
  return Buffer.from(
    JSON.stringify({
      jobId: claim.jobId,
      userId: claim.userId,
      period: claim.period,
      credits: claim.credits,
    }),
  ).toString("base64url");
}

export function signRefundToken(claim: RefundClaim): string {
  const payload = refundPayload(claim);
  const sig = createHmac("sha256", secret()).update(`refund:${payload}`).digest("base64url");
  return `${payload}.${sig}`;
}

/**
 * Returns the claim only if the signature checks out AND it was issued for
 * this exact job. Anything else — tampering, a token borrowed from another
 * job, a nonsense credit amount — returns null and no refund happens.
 */
export function verifyRefundToken(token: string, jobId: string): RefundClaim | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot <= 0) return null;
    const payload = token.slice(0, dot);
    const given = Buffer.from(token.slice(dot + 1));
    const expected = Buffer.from(
      createHmac("sha256", secret()).update(`refund:${payload}`).digest("base64url"),
    );
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

    const claim = JSON.parse(Buffer.from(payload, "base64url").toString()) as RefundClaim;
    if (typeof claim.jobId !== "string" || claim.jobId !== jobId) return null;
    if (typeof claim.userId !== "string" || !claim.userId) return null;
    if (typeof claim.period !== "string" || !claim.period) return null;
    if (!Number.isSafeInteger(claim.credits) || claim.credits <= 0) return null;
    return claim;
  } catch {
    return null;
  }
}
