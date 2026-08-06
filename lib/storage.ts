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

/**
 * A one-shot URL the browser can PUT a file to directly.
 *
 * Serverless request bodies cap at a few megabytes, so a video can't be
 * relayed through our own routes. A signed upload URL lets the browser talk to
 * storage directly while the service-role key stays on the server.
 */
export async function createSignedUploadUrl(
  path: string,
): Promise<{ path: string; uploadUrl: string; publicUrl: string } | null> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  try {
    const res = await fetch(`${url}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    if (!res.ok) {
      console.error("[storage] sign upload failed", res.status, (await res.text()).slice(0, 300));
      return null;
    }
    const data = (await res.json()) as { url?: string };
    if (!data.url) return null;
    return {
      path,
      uploadUrl: `${url}/storage/v1${data.url}`,
      publicUrl: `${url}/storage/v1/object/public/${BUCKET}/${path}`,
    };
  } catch {
    return null;
  }
}

/** Remove an object. Used to clear uploads we only needed for one request. */
export async function deletePublicAsset(path: string): Promise<boolean> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return false;
  try {
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${key}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}
