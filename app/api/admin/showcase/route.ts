import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { serviceQuery } from "@/lib/supabase/server";
import { listAllShowcase } from "@/lib/showcase";
import { uploadPublicAsset } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 50 * 1_048_576;

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

/** GET — every clip, published or not. */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  return Response.json({ clips: await listAllShowcase() });
}

/**
 * POST multipart — upload a clip and add it to the gallery.
 *
 * Accepts an uploaded file rather than a URL. A generated clip lives on a
 * provider link that expires, so pointing the gallery at one would leave the
 * homepage full of dead videos within the hour; taking a copy into our own
 * storage is the only version that stays working.
 *
 * The file's own header bytes decide whether it's really a video — the
 * declared Content-Type is client-controlled and proves nothing.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const form = await req.formData().catch(() => null);
  if (!form) return deny(400, "bad_request", "Expected multipart form data.");

  const file = form.get("video");
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return deny(400, "bad_request", "No video provided.");
  if (!prompt) return deny(400, "bad_request", "A prompt is required — visitors tap the clip to reuse it.");
  if (file.size > MAX_BYTES) return deny(400, "file_too_large", "Video must be under 50MB.");

  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes.slice(0, 12));
  // MP4/MOV carry an 'ftyp' box at offset 4; WebM starts with the EBML magic
  const isMp4 = head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
  const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
  if (!isMp4 && !isWebm) return deny(400, "bad_file_type", "That doesn't look like an MP4 or WebM video.");

  const ext = isWebm ? "webm" : "mp4";
  const type = isWebm ? "video/webm" : "video/mp4";
  const uploaded = await uploadPublicAsset(`showcase/${crypto.randomUUID()}.${ext}`, bytes, type);
  if (!uploaded) return deny(502, "upload_failed", "Could not upload. Check Supabase storage is configured.");

  const created = await serviceQuery("showcase_clips", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      video_url: uploaded.publicUrl,
      prompt,
      model_name: String(form.get("modelName") ?? "").trim() || null,
      aspect: String(form.get("aspect") ?? "9:16").trim() || "9:16",
      sort_order: Number(form.get("sortOrder") ?? 0) || 0,
      published: String(form.get("published") ?? "true") !== "false",
    }),
  });
  if (!created) return deny(500, "db_error", "Uploaded, but could not save. Does the showcase_clips table exist?");

  return Response.json({ ok: true, url: uploaded.publicUrl });
}

/** PATCH { id, published?, sortOrder?, prompt? } — edit without re-uploading. */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  let body: { id?: string; published?: boolean; sortOrder?: number; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }
  if (!body.id) return deny(400, "bad_request", "Missing id.");

  const patch: Record<string, unknown> = {};
  if (body.published !== undefined) patch.published = body.published;
  if (body.sortOrder !== undefined) patch.sort_order = body.sortOrder;
  if (body.prompt !== undefined) patch.prompt = body.prompt.trim();
  if (!Object.keys(patch).length) return deny(400, "bad_request", "Nothing to update.");

  const res = await serviceQuery(`showcase_clips?id=eq.${encodeURIComponent(body.id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (res === null) return deny(500, "db_error", "Could not update that clip.");
  return Response.json({ ok: true });
}

/** DELETE ?id= — remove from the gallery. */
export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return deny(400, "bad_request", "Missing id.");

  const res = await serviceQuery(`showcase_clips?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res === null) return deny(500, "db_error", "Could not remove that clip.");
  return Response.json({ ok: true });
}
