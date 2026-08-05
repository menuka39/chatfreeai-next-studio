/**
 * Normalise the Supabase project URL so common paste mistakes don't produce
 * "Invalid path specified in request URL" errors:
 *   - trailing slash            https://xxx.supabase.co/      -> stripped
 *   - dashboard URL pasted      https://supabase.com/dashboard/project/xxx
 *                               -> rebuilt as https://xxx.supabase.co
 *   - accidental path suffixes  https://xxx.supabase.co/auth  -> stripped
 */
export function normalizeSupabaseUrl(raw: string | undefined): string {
  if (!raw) return "";
  let url = raw.trim().replace(/\/+$/, "");

  // someone pasted the dashboard link instead of the API URL
  const dash = url.match(/supabase\.com\/dashboard\/project\/([a-z0-9]+)/i);
  if (dash) return `https://${dash[1]}.supabase.co`;

  // strip any path — the SDK appends /auth/v1 etc. itself
  const m = url.match(/^(https?:\/\/[^/]+)/);
  if (m) url = m[1];

  return url;
}

/** Project ref from a Supabase URL: https://<ref>.supabase.co -> <ref> */
export function projectRefFromUrl(url: string | undefined): string | null {
  const m = normalizeSupabaseUrl(url).match(/^https?:\/\/([a-z0-9]+)\.supabase\./i);
  return m ? m[1] : null;
}

/**
 * Project ref carried inside a legacy JWT anon/service key. Supabase signs
 * these with a `ref` claim, so we can prove a key belongs to the project in
 * NEXT_PUBLIC_SUPABASE_URL instead of waiting for an "Invalid API key" error
 * at sign-in. Returns null for the newer `sb_publishable_…` keys, which carry
 * no readable ref.
 */
export function projectRefFromKey(key: string | undefined): string | null {
  if (!key) return null;
  const parts = key.split(".");
  if (parts.length !== 3) return null; // not a JWT (new-style key)
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return typeof payload.ref === "string" ? payload.ref : null;
  } catch {
    return null;
  }
}

/**
 * Compare the configured URL and key. Returns a human-readable problem, or
 * null when they agree (or when the key type makes the check impossible).
 */
export function supabaseConfigProblem(
  url: string | undefined,
  key: string | undefined,
): string | null {
  if (!url) return "NEXT_PUBLIC_SUPABASE_URL is not set.";
  if (!key) return "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.";

  const urlRef = projectRefFromUrl(url);
  if (!urlRef) return `NEXT_PUBLIC_SUPABASE_URL doesn't look like a Supabase project URL: ${url}`;

  const keyRef = projectRefFromKey(key);
  if (keyRef && keyRef !== urlRef) {
    return (
      `Project mismatch: the URL points at "${urlRef}" but the anon key belongs to "${keyRef}". ` +
      `Copy both values from the same project.`
    );
  }
  if (key.startsWith("sb_secret_") || key.includes("service_role")) {
    return "NEXT_PUBLIC_SUPABASE_ANON_KEY looks like a SECRET key. Use the publishable/anon key here.";
  }
  return null;
}
