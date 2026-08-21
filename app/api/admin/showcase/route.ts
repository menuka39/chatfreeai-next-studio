import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { serviceQuery } from "@/lib/supabase/server";
import { listAllShowcase } from "@/lib/showcase";
import { uploadPublicAsset } from "@/lib/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_VIDEO_BYTES = 50 * 1_048_576;
const MAX_IMAGE_BYTES = 8 * 1_048_576;

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
 * POST multipart — upload an item and add it to a gallery.
 *
 * Accepts an uploaded file rather than a URL. A generated clip lives on a
 * provider link that expires, so pointing the gallery at one would leave the
 * page full of dead media within the hour; taking a copy into our own
 * storage is the only version that stays working.
 *
 * The file's own header bytes decide what it really is — the declared
 * Content-Type is client-controlled and proves nothing. `surface` decides
 * which formats are allowed, so an image can't be filed as a video clip and
 * end up in a <video> tag that renders nothing.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const form = await req.formData().catch(() => null);
  if (!form) return deny(400, "bad_request", "Expected multipart form data.");

  const surface = String(form.get("surface") ?? "video") === "image" ? "image" : "video";
  // "video" is the historical field name; "media" is the surface-neutral one.
  const file = form.get("media") ?? form.get("video");
  const prompt = String(form.get("prompt") ?? "").trim();
  if (!(file instanceof File) || file.size === 0) return deny(400, "bad_request", "No file provided.");
  if (!prompt) return deny(400, "bad_request", "A prompt is required — visitors tap the item to reuse it.");

  const limit = surface === "image" ? MAX_IMAGE_BYTES : MAX_VIDEO_BYTES;
  if (file.size > limit) {
    return deny(400, "file_too_large", `File must be under ${Math.round(limit / 1_048_576)}MB.`);
  }

  const bytes = await file.arrayBuffer();
  const head = new Uint8Array(bytes.slice(0, 12));

  let ext: string;
  let type: string;
  if (surface === "image") {
    const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
    const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
    // "RIFF" .... "WEBP"
    const isWebp =
      head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 &&
      head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50;
    if (!isPng && !isJpeg && !isWebp) {
      return deny(400, "bad_file_type", "That doesn't look like a PNG, JPEG or WebP image.");
    }
    ext = isPng ? "png" : isWebp ? "webp" : "jpg";
    type = isPng ? "image/png" : isWebp ? "image/webp" : "image/jpeg";
  } else {
    // MP4/MOV carry an 'ftyp' box at offset 4; WebM starts with the EBML magic
    const isMp4 = head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70;
    const isWebm = head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3;
    if (!isMp4 && !isWebm) return deny(400, "bad_file_type", "That doesn't look like an MP4 or WebM video.");
    ext = isWebm ? "webm" : "mp4";
    type = isWebm ? "video/webm" : "video/mp4";
  }

  const uploaded = await uploadPublicAsset(`showcase/${crypto.randomUUID()}.${ext}`, bytes, type);
  if (!uploaded) return deny(502, "upload_failed", "Could not upload. Check Supabase storage is configured.");

  /*
   * A poster still, uploaded alongside a video. Optional but worth taking:
   * without one a <video> is a blank rectangle until it buffers, and on
   * mobile browsers it often never paints a frame at all.
   */
  let posterUrl: string | null = null;
  const poster = form.get("poster");
  if (surface === "video" && poster instanceof File && poster.size > 0 && poster.size <= MAX_IMAGE_BYTES) {
    const pb = await poster.arrayBuffer();
    const ph = new Uint8Array(pb.slice(0, 4));
    const pngOk = ph[0] === 0x89 && ph[1] === 0x50;
    const jpgOk = ph[0] === 0xff && ph[1] === 0xd8;
    if (pngOk || jpgOk) {
      const up = await uploadPublicAsset(
        `showcase/${crypto.randomUUID()}.${pngOk ? "png" : "jpg"}`,
        pb,
        pngOk ? "image/png" : "image/jpeg",
      );
      posterUrl = up?.publicUrl ?? null;
    }
  }

  const created = await serviceQuery("showcase_clips", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      video_url: uploaded.publicUrl,
      poster_url: posterUrl,
      prompt,
      model_name: String(form.get("modelName") ?? "").trim() || null,
      aspect: String(form.get("aspect") ?? (surface === "image" ? "1:1" : "9:16")).trim(),
      sort_order: Number(form.get("sortOrder") ?? 0) || 0,
      published: String(form.get("published") ?? "true") !== "false",
      surface,
      in_guess: String(form.get("inGuess") ?? "false") === "true",
    }),
  });
  if (!created) return deny(500, "db_error", "Uploaded, but could not save. Does the showcase_clips table exist?");

  return Response.json({ ok: true, url: uploaded.publicUrl });
}

/** PATCH { id, published?, inGuess?, sortOrder?, prompt? } — edit without re-uploading. */
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  let body: { id?: string; published?: boolean; inGuess?: boolean; sortOrder?: number; prompt?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }
  if (!body.id) return deny(400, "bad_request", "Missing id.");

  const patch: Record<string, unknown> = {};
  if (body.published !== undefined) patch.published = body.published;
  if (body.inGuess !== undefined) patch.in_guess = body.inGuess;
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
