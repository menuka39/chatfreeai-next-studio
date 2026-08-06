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
