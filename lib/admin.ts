import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "./session";
import { serviceQuery, supabaseServer, supabaseEnvPresent } from "./supabase/server";

/**
 * Admin gate for API routes.
 *
 * Every /api/admin/* route calls this independently — admin access is never
 * enforced only by hiding the UI. A signed-in non-admin gets a 403, not a
 * redirect, since this is an API response, not a page.
 *
 * Same hard-refusal as isAdminPageRequest() below: getSession()'s dev shim
 * warns-and-allows in production for its general (lower-stakes) use, but
 * these specific routes can rotate API keys and delete content, so a
 * misconfigured production deploy must fail closed here rather than honour
 * an `admin=1` cookie from anyone who sets one.
 */
/**
 * blog_posts.id is a real Postgres uuid. Several call sites splice a
 * URL path segment directly into a PostgREST query string
 * (`blog_posts?id=eq.${id}`) rather than binding it as a parameter — without
 * this check, a crafted segment containing `&` or `=` could inject
 * additional filter clauses into that query. A strict UUID shape is a
 * correct allowlist here, not just a defensive guess: nothing else could
 * ever be a real row's id anyway.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isValidId(id: string): boolean {
  return UUID_RE.test(id);
}

export async function requireAdmin(req: NextRequest) {
  if (!supabaseEnvPresent() && process.env.NODE_ENV === "production") {
    console.error("[admin] Supabase env vars missing in production — admin API access is disabled, not shimmed.");
    return {
      ok: false as const,
      response: Response.json({ error: "forbidden", message: "Admin access is not available." }, { status: 403 }),
    };
  }

  const session = await getSession(req);
  if (!session.userId) {
    return { ok: false as const, response: Response.json({ error: "auth_required", message: "Sign in first." }, { status: 401 }) };
  }
  if (!session.isAdmin) {
    return { ok: false as const, response: Response.json({ error: "forbidden", message: "Admin access required." }, { status: 403 }) };
  }
  return { ok: true as const, session };
}

/**
 * Admin check for Server Components (pages, layouts, Header) — these have no
 * NextRequest to hand getSession(), only next/headers' cookies(). Mirrors the
 * exact two paths lib/session.ts's getSession() uses, so a page gate and an
 * API route gate never disagree about who's an admin:
 *   - Supabase configured: real session, profiles.is_admin from the DB.
 *   - Not configured: the DEV cookie shim's `admin=1` cookie.
 *
 * DELIBERATELY STRICTER than lib/session.ts's shim: that one warns-and-allows
 * in production, because its blast radius (someone spoofs a paid plan) is
 * bounded and reversible. Admin access is not — it can rotate API keys,
 * delete every post, and change site branding. So this one refuses outright
 * in production if Supabase isn't configured, rather than trusting whoever
 * happens to set a cookie. A misconfigured production deploy should fail
 * closed here, loudly, not silently hand out admin to anyone who guesses it.
 */
let adminShimWarned = false;

export async function isAdminPageRequest(): Promise<{ isAdmin: boolean; email: string | null }> {
  if (!supabaseEnvPresent()) {
    if (process.env.NODE_ENV === "production") {
      if (!adminShimWarned) {
        adminShimWarned = true;
        console.error(
          "[admin] Supabase env vars missing in production — admin access is DISABLED, not shimmed. " +
            "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to restore it.",
        );
      }
      return { isAdmin: false, email: null };
    }
    const store = await cookies();
    return { isAdmin: store.get("admin")?.value === "1", email: store.get("uid")?.value ? `${store.get("uid")!.value}@dev.local` : null };
  }
  try {
    const supabase = await supabaseServer();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { isAdmin: false, email: null };
    const rows = await serviceQuery<{ is_admin: boolean | null; email: string | null }[]>(
      `profiles?id=eq.${encodeURIComponent(user.id)}&select=is_admin,email&limit=1`,
    );
    return { isAdmin: Boolean(rows?.[0]?.is_admin), email: rows?.[0]?.email ?? user.email ?? null };
  } catch {
    return { isAdmin: false, email: null };
  }
}
