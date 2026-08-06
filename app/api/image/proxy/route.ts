import { NextRequest } from "next/server";
import { verifyVideoUrl } from "@/lib/video-token";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves a generated image from our own origin so a canvas can read it.
 *
 * The mask editor draws the image onto a canvas and exports the result. A
 * canvas that has drawn a cross-origin image without CORS headers is tainted:
 * toDataURL throws, so the edit can never be submitted. Provider CDNs mostly
 * don't send those headers, and asking for them with crossOrigin="anonymous"
 * makes the image fail to load outright — which is what left the editor
 * opening blank with nothing to paint on.
 *
 * Same shape as the video proxy: the URL must carry a signature this server
 * produced, so this can't be turned into an open fetcher for arbitrary hosts.
 */
export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url") ?? "";
  const token = req.nextUrl.searchParams.get("token") ?? "";

  if (!url || !token) {
    return Response.json({ error: "bad_request", message: "Missing url or token." }, { status: 400 });
  }
  if (!verifyVideoUrl(url, token)) {
    return Response.json({ error: "forbidden", message: "That image link isn't signed by us." }, { status: 403 });
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

  const headers: Record<string, string> = {};
  // Some provider image URLs need our key to read, the same way clip URLs do.
  // Only ever sent to the provider's own host.
  const key = openRouterKey();
  if (/(^|\.)openrouter\.ai$/i.test(parsed.hostname) && key) {
    headers.Authorization = `Bearer ${key}`;
  }

  let upstream: Response;
  try {
    upstream = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  } catch {
    return Response.json({ error: "upstream_error", message: "Could not fetch that image." }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    return Response.json(
      { error: "upstream_error", message: "That image link may have expired." },
      { status: 502 },
    );
  }

  const type = upstream.headers.get("content-type") ?? "image/png";
  if (!type.startsWith("image/")) {
    return Response.json({ error: "bad_request", message: "That URL isn't an image." }, { status: 400 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": type,
      // Same-origin already, but explicit CORS keeps the canvas readable even
      // if this is ever served from a different subdomain.
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
