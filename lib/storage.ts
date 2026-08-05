/**
 * Minimal Supabase Storage client for admin-uploaded assets — just enough to
 * upload a file to the public `public-assets` bucket (see supabase/schema.sql)
 * and get back its public URL. Service-role only; never called from a route
 * the browser can hit without going through requireAdmin() first.
 */

import { normalizeSupabaseUrl } from "./supabase/url";

const BUCKET = "public-assets";

export interface UploadResult {
  path: string;
  publicUrl: string;
}

export async function uploadPublicAsset(
  path: string,
  bytes: ArrayBuffer,
  contentType: string,
): Promise<UploadResult | null> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": contentType,
        // overwrite on re-upload (e.g. re-uploading the logo under the same name)
        "x-upsert": "true",
      },
      body: bytes,
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return null;
    return { path, publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${path}` };
  } catch {
    return null;
  }
}
