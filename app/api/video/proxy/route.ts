import { NextRequest } from "next/server";
import { verifyVideoUrl } from "@/lib/video-token";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Streams a finished clip back through our origin so the browser can read its
 * last frame without tainting the canvas.
 *
 * Only URLs signed by our own poll endpoint are accepted — see
 * lib/video-token.ts for why that matters.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  const token = req.nextUrl.searchParams.get("token");

  if (!url || !token) {
    // "missing" and "wrong" are different faults with different causes — a
    // clip saved before URLs were signed has no token at all, while a
    // mismatch means the url was signed and then changed.
    console.warn("[video-proxy] missing url or token", { hasUrl: Boolean(url), hasToken: Boolean(token) });
    return Response.json({ error: "bad_request", message: "Missing url or token." }, { status: 400 });
  }
  if (!verifyVideoUrl(url, token)) {
    // Log enough to tell WHICH url failed without dumping the whole thing
    // into logs. Signing is a plain HMAC of the url with no expiry, so a
    // mismatch can only mean the url the client sent differs from the one
    // the server signed — usually because it was re-uploaded under a new
    // name between polls.
    console.warn("[video-proxy] signature mismatch", {
      host: (() => { try { return new URL(url).hostname; } catch { return "unparseable"; } })(),
      urlTail: url.slice(-60),
      tokenLength: token.length,
      secretConfigured: Boolean(process.env.VIDEO_URL_SECRET),
    });
    return Response.json({ error: "forbidden", message: "That video link isn't signed by us." }, { status: 403 });
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return Response.json({ error: "bad_request", message: "Malformed URL." }, { status: 400 });
  }
  if (parsed.protocol !== "https:") {
    return Response.json({ error: "bad_request", message: "Only https is allowed." }, { status: 400 });
  }

  let upstream: Response;
  try {
    // Same 401 problem as the storage copy: provider clip URLs arrive
    // unsigned and need our key to read. Only ever sent to the provider's
    // own host — the URL is signed by us, but the host still gets checked
    // before any credential leaves this process.
    const headers: Record<string, string> = {};
    if (/(^|\.)openrouter\.ai$/i.test(parsed.hostname) && process.env.OPENROUTER_API_KEY) {
      headers.Authorization = `Bearer ${process.env.OPENROUTER_API_KEY}`;
    }
    const range = req.headers.get("range");
    if (range) headers.Range = range;

    upstream = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
  } catch {
    return Response.json({ error: "upstream_error", message: "Could not fetch that video." }, { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    // name the real cause: 403/404 from the provider means the signed link
    // expired, anything else is worth seeing verbatim
    console.error("[video-proxy] upstream refused", {
      status: upstream.status,
      host: parsed.host,
      body: !upstream.body,
    });
    return Response.json(
      { error: "upstream_error", message: "The provider link may have expired." },
      { status: 502 },
    );
  }

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("content-type") ?? "video/mp4",
      ...(upstream.headers.get("content-length") ? { "Content-Length": upstream.headers.get("content-length")! } : {}),
      ...(upstream.headers.get("content-range") ? { "Content-Range": upstream.headers.get("content-range")! } : {}),
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=600",
    },
  });
}
