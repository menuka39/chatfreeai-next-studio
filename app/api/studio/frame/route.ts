import { NextRequest } from "next/server";
import { getSession, planFor } from "@/lib/session";
import { uploadPublicAsset } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Parks a chain seed frame in storage and hands back an https URL.
 *
 * Extending a clip means sending its closing frame back as the next clip's
 * first frame. Inlined as a data URI that frame is ~2MB of base64 at 1080p —
 * close enough to the 4.5MB request ceiling that a 4K clip would fail outright,
 * and the bytes get re-uploaded on every retry.
 *
 * Storing it once instead has a second payoff: the URL goes on the clip record,
 * so a chain can be re-run later from exactly the frame it was built from
 * rather than from whatever the video decodes to today.
 */

const MAX_BYTES = 8_000_000;
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  // Storage is not an open drop box: only an account that can actually render
  // a video has any reason to park a frame here.
  if (!session.userId || planFor(session) === "free") {
    return deny(403, "plan_required", "Extending a scene needs a paid plan.");
  }

  let body: { dataUrl?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid request body.");
  }

  const dataUrl = body.dataUrl ?? "";
  const match = /^data:([\w/+-]+);base64,([\s\S]+)$/.exec(dataUrl);
  if (!match) return deny(400, "bad_request", "Expected a base64 data URL.");

  const ext = TYPES[match[1].toLowerCase()];
  if (!ext) return deny(400, "bad_request", "That image type isn't supported.");

  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.byteLength) return deny(400, "bad_request", "That image is empty.");
  if (bytes.byteLength > MAX_BYTES) return deny(413, "too_large", "That frame is too large.");

  const stored = await uploadPublicAsset(
    `frames/${crypto.randomUUID()}.${ext}`,
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
    match[1],
  );
  if (!stored) {
    console.error("[frame] storage upload failed — check the public-assets bucket exists");
    return deny(502, "storage_error", "Could not save that frame.");
  }

  return Response.json({ url: stored.publicUrl, bytes: bytes.byteLength });
}
