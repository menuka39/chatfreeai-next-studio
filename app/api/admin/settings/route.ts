import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { serviceQuery } from "@/lib/supabase/server";
import { uploadPublicAsset } from "@/lib/storage";
import { detectImageType, EXT_FOR } from "@/lib/file-signature";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_LOGO_BYTES = 2 * 1_048_576;

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

interface SettingRow {
  key: string;
  value: string | null;
}

/** GET — current settings, public (the site itself needs these to render). */
export async function GET() {
  const rows = await serviceQuery<SettingRow[]>("site_settings?select=key,value");
  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
  return Response.json({
    siteName: map.site_name ?? "Chat Free AI",
    tagline: map.tagline ?? "",
    logoUrl: map.logo_url ?? null,
  });
}

/**
 * POST — multipart form: optional `logo` file, optional `siteName` /
 * `tagline` text fields. Every field is optional so the form can save just
 * the text without re-uploading a logo, or vice versa.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  const form = await req.formData().catch(() => null);
  if (!form) return deny(400, "bad_request", "Expected multipart form data.");

  const updates: { key: string; value: string }[] = [];

  const siteName = form.get("siteName");
  if (typeof siteName === "string" && siteName.trim()) {
    updates.push({ key: "site_name", value: siteName.trim().slice(0, 80) });
  }
  const tagline = form.get("tagline");
  if (typeof tagline === "string") {
    updates.push({ key: "tagline", value: tagline.trim().slice(0, 160) });
  }

  const logo = form.get("logo");
  if (logo instanceof File && logo.size > 0) {
    if (logo.size > MAX_LOGO_BYTES) {
      return deny(400, "file_too_large", "Logo must be under 2MB.");
    }
    const bytes = await logo.arrayBuffer();
    // The request's declared Content-Type is entirely client-controlled —
    // `curl -F "file=@x;type=image/png"` proves any bytes can claim any type.
    // Detect the real type from the file's own magic bytes instead, and use
    // THAT for both the allow-check and the extension/storage Content-Type,
    // so a mislabelled or malicious upload can't ride in on a fake header.
    const detected = detectImageType(new Uint8Array(bytes));
    if (!detected) {
      return deny(400, "bad_file_type", "Logo must be a real PNG, JPG or WebP file.");
    }
    const ext = EXT_FOR[detected];
    const uploaded = await uploadPublicAsset(`logo.${ext}`, bytes, detected);
    if (!uploaded) {
      return deny(502, "upload_failed", "Could not upload the logo. Check Supabase storage is configured.");
    }
    // cache-bust so the new logo shows immediately instead of a stale CDN copy
    updates.push({ key: "logo_url", value: `${uploaded.publicUrl}?v=${Date.now()}` });
  }

  if (!updates.length) return deny(400, "bad_request", "Nothing to update.");

  for (const u of updates) {
    const result = await serviceQuery(`site_settings?on_conflict=key`, {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ key: u.key, value: u.value, updated_at: new Date().toISOString() }),
    });
    if (!result) return deny(500, "db_error", `Could not save "${u.key}". Check the site_settings table exists.`);
  }

  return Response.json({ ok: true, updated: updates.map((u) => u.key) });
}
