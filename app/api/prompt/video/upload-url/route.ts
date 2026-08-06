import { NextRequest } from "next/server";
import { getSession, planFor } from "@/lib/session";
import { createSignedUploadUrl } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Hands the browser a one-shot URL to upload a video to.
 *
 * Video-to-prompt can't relay the file through this route: serverless request
 * bodies cap at a few megabytes and a usable clip is far larger. So the browser
 * uploads to storage directly, and the analyse step passes Gemini the resulting
 * link rather than the bytes — Gemini fetches it itself. Nothing large ever
 * touches our own runtime.
 *
 * The file is deleted as soon as the analysis finishes.
 */

/** Gemini fetches external URLs up to 100MB; stay under it with room to spare. */
export const MAX_VIDEO_BYTES = 95 * 1024 * 1024;

/** The video types Gemini accepts by URL. */
export const VIDEO_TYPES: Record<string, string> = {
  "video/mp4": "mp4",
  "video/mpeg": "mpeg",
  "video/quicktime": "mov",
  "video/avi": "avi",
  "video/x-flv": "flv",
  "video/mpg": "mpg",
  "video/webm": "webm",
  "video/wmv": "wmv",
  "video/3gpp": "3gp",
};

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId || planFor(session) === "free") {
    return deny(402, "plan_required", "Video to Prompt is included in every paid plan.");
  }

  let body: { mimeType?: string; size?: number };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid request body.");
  }

  const mime = (body.mimeType ?? "").toLowerCase();
  const ext = VIDEO_TYPES[mime];
  if (!ext) {
    return deny(415, "unsupported_type", "That file type isn't supported. Try MP4, MOV or WebM.");
  }

  const size = Number(body.size ?? 0);
  if (!size || size < 0) return deny(400, "bad_request", "Missing file size.");
  if (size > MAX_VIDEO_BYTES) {
    return deny(413, "too_large", "That video is over 95MB. Trim it or export at a lower bitrate.");
  }

  const signed = await createSignedUploadUrl(`prompt-video/${crypto.randomUUID()}.${ext}`);
  if (!signed) {
    console.error("[video-to-prompt] could not sign an upload URL");
    return deny(502, "storage_error", "Could not start the upload. Please try again.");
  }

  return Response.json({ ...signed, mimeType: mime });
}
