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

/**
 * Project ref from a default Supabase URL: https://<ref>.supabase.co -> <ref>
 *
 * Returns null for a custom domain (https://auth.example.com), because the ref
 * genuinely isn't in the hostname there — the project is reachable at a name
 * that says nothing about which project it is. Null therefore means "can't
 * tell from the URL", NOT "bad URL". Callers must treat it that way; see
 * supabaseConfigProblem.
 *
 * The `{20}` matters. Supabase project refs are always 20 lowercase letters,
 * and matching any label instead read a VANITY subdomain
 * (https://chatfreeai.supabase.co) as the ref "chatfreeai" — which then never
 * equals the real ref in the key, so a correctly configured project was
 * reported as a project mismatch. Vanity subdomains keep the .supabase.co
 * suffix, so the suffix alone can't tell the two apart; the length can.
 */
export function projectRefFromUrl(url: string | undefined): string | null {
  const m = normalizeSupabaseUrl(url).match(/^https?:\/\/([a-z]{20})\.supabase\./i);
  return m ? m[1].toLowerCase() : null;
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
 * null when they agree (or when the setup makes the check impossible).
 *
 * Custom domains are a supported setup, not a misconfiguration. Once a project
 * has a Custom Domain or vanity subdomain, NEXT_PUBLIC_SUPABASE_URL becomes
 * something like https://auth.chatfreeai.com — done specifically so the Google
 * consent screen stops showing the raw project ref, since the OAuth screen
 * displays the root domain of the callback URL.
 *
 * The earlier version rejected exactly that: it required the ref to be
 * extractable from the hostname and reported "doesn't look like a Supabase
 * project URL" otherwise. So the correct production setup would have been
 * flagged as broken. What can actually be checked without the ref — that the
 * value is a URL at all, and that the key isn't a secret — still is; only the
 * ref comparison is skipped, exactly as it already is for `sb_publishable_…`
 * keys that carry no ref.
 */
export function supabaseConfigProblem(
  url: string | undefined,
  key: string | undefined,
): string | null {
  if (!url) return "NEXT_PUBLIC_SUPABASE_URL is not set.";
  if (!key) return "NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.";

  // Shape check that a custom domain passes but a typo doesn't.
  const normalized = normalizeSupabaseUrl(url);
  if (!/^https?:\/\/[^/]+\.[^/]+$/.test(normalized)) {
    return `NEXT_PUBLIC_SUPABASE_URL doesn't look like a URL: ${url}`;
  }
  if (!normalized.startsWith("https://") && !normalized.startsWith("http://127.0.0.1")) {
    return `NEXT_PUBLIC_SUPABASE_URL must be https (or local): ${url}`;
  }

  if (key.startsWith("sb_secret_") || key.includes("service_role")) {
    return "NEXT_PUBLIC_SUPABASE_ANON_KEY looks like a SECRET key. Use the publishable/anon key here.";
  }

  // Only possible when the URL still carries the ref AND the key is a legacy
  // JWT. On a custom domain, or with a new-style key, there is nothing to
  // compare — that is not a problem to report.
  const urlRef = projectRefFromUrl(url);
  const keyRef = projectRefFromKey(key);
  if (urlRef && keyRef && keyRef !== urlRef) {
    return (
      `Project mismatch: the URL points at "${urlRef}" but the anon key belongs to "${keyRef}". ` +
      `Copy both values from the same project.`
    );
  }

  return null;
}
