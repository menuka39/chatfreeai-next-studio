import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { uploadPublicAsset } from "@/lib/storage";
import { detectImageType, EXT_FOR } from "@/lib/file-signature";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 5 * 1_048_576;

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

/**
 * POST multipart form `image` — used by both the blog editor's featured
 * image field and the rich editor's inline image button.
 *
 * Same magic-byte validation as the site logo upload (lib/file-signature.ts)
 * — the request's declared Content-Type is client-controlled and proves
 * nothing; the file's own header bytes decide PNG/JPEG/WebP, not the label.
 * Unlike the logo (one fixed `logo.png` path, since there's only ever one),
 * every blog image gets a random filename — a post can have many images,
 * and admins can upload many posts' worth over time, so collisions matter
 * here in a way they don't for a single site-wide logo.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const form = await req.formData().catch(() => null);
  if (!form) return deny(400, "bad_request", "Expected multipart form data.");

  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return deny(400, "bad_request", "No image provided.");
  if (file.size > MAX_BYTES) return deny(400, "file_too_large", "Image must be under 5MB.");

  const bytes = await file.arrayBuffer();
  const detected = detectImageType(new Uint8Array(bytes));
  if (!detected) return deny(400, "bad_file_type", "That doesn't look like a real PNG, JPG or WebP file.");

  const ext = EXT_FOR[detected];
  const id = crypto.randomUUID();
  const uploaded = await uploadPublicAsset(`blog/${id}.${ext}`, bytes, detected);
  if (!uploaded) return deny(502, "upload_failed", "Could not upload the image. Check Supabase storage is configured.");

  return Response.json({ url: uploaded.publicUrl });
}
