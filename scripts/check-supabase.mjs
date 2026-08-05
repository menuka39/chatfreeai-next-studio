/**
 * Verify the Supabase configuration before you hit a confusing error at
 * sign-in time.
 *
 *   NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-supabase.mjs
 *
 * Checks: URL shape, project refs match, the project is reachable, the anon
 * key is accepted, and the profiles table exists.
 */

const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const service = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();

let failed = false;
const ok = (m) => console.log("  ✓", m);
const bad = (m) => { console.error("  ✗", m); failed = true; };

const refFromUrl = url.match(/^https?:\/\/([a-z0-9]+)\.supabase\./i)?.[1] ?? null;
const refFromKey = (k) => {
  const p = k.split(".");
  if (p.length !== 3) return null;
  try {
    return JSON.parse(Buffer.from(p[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()).ref ?? null;
  } catch { return null; }
};

console.log("\nSupabase configuration check\n");

if (!url) bad("NEXT_PUBLIC_SUPABASE_URL is not set");
else if (!refFromUrl) bad(`URL doesn't look right: ${url}  (expected https://<ref>.supabase.co)`);
else ok(`URL project ref: ${refFromUrl}`);

if (!anon) bad("NEXT_PUBLIC_SUPABASE_ANON_KEY is not set");
else {
  const kr = refFromKey(anon);
  if (kr && refFromUrl && kr !== refFromUrl) bad(`ANON KEY belongs to project "${kr}" but the URL is "${refFromUrl}" — MISMATCH`);
  else if (kr) ok(`anon key project ref: ${kr}`);
  else ok("anon key is a new-style key (no embedded ref to compare)");
}

if (service) {
  const sr = refFromKey(service);
  if (sr && refFromUrl && sr !== refFromUrl) bad(`SERVICE ROLE KEY belongs to "${sr}" but the URL is "${refFromUrl}" — MISMATCH`);
  else ok("service role key project matches");
} else console.log("  – SUPABASE_SERVICE_ROLE_KEY not set (needed for plan lookups)");

if (url && anon && !failed) {
  console.log("\nLive checks\n");
  try {
    const res = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: anon } });
    if (res.status === 401) bad("anon key REJECTED by this project (Invalid API key) — re-copy it from Settings → API Keys");
    else if (!res.ok) bad(`auth endpoint returned ${res.status}`);
    else ok("anon key accepted by the auth API");
  } catch (e) {
    bad(`cannot reach ${url} — ${e.message}. Is the project paused?`);
  }

  if (service) {
    try {
      const res = await fetch(`${url}/rest/v1/profiles?select=id&limit=1`, {
        headers: { apikey: service, Authorization: `Bearer ${service}` },
      });
      if (res.ok) ok("profiles table exists and is readable with the service key");
      else if (res.status === 404) bad("profiles table NOT found — run supabase/schema.sql in the SQL editor");
      else bad(`profiles check returned ${res.status}: ${(await res.text()).slice(0, 120)}`);
    } catch (e) {
      bad(`profiles check failed: ${e.message}`);
    }
  }
}

console.log(failed ? "\n✗ Fix the items above, then redeploy.\n" : "\n✓ Supabase configuration looks correct.\n");
process.exit(failed ? 1 : 0);
