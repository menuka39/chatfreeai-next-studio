import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

/**
 * OAuth / magic-link landing point.
 *
 * Cookies are written directly onto the redirect response we return. Writing
 * them to the `cookies()` store instead and then building a separate response
 * loses them, which shows up as "logged in, but bounced back to /login".
 */

// only ever redirect to our own allow-listed paths (open-redirect protection)
const SAFE_NEXT = new Set(["/account", "/auth/reset"]);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const errorParam = req.nextUrl.searchParams.get("error_description") ?? req.nextUrl.searchParams.get("error");

  const nextParam = req.nextUrl.searchParams.get("next") ?? "/account";
  const nextPath = SAFE_NEXT.has(nextParam) ? nextParam : "/account";

  const fail = (reason: string) => {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("error", reason);
    return NextResponse.redirect(url);
  };

  if (errorParam) return fail(errorParam.slice(0, 200));
  if (!code) return fail("missing_code");

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fail("not_configured");

  // build the response FIRST so the auth cookies land on it
  const response = NextResponse.redirect(new URL(nextPath, req.nextUrl.origin));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("[auth/callback] exchange failed:", error.message);
    return fail(error.message.slice(0, 200));
  }

  return response;
}
