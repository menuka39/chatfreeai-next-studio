import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

/**
 * Refreshes the Supabase session on every request and adds security headers.
 *
 * IMPORTANT: cookie options are passed through EXACTLY as @supabase/ssr
 * provides them. Do not add httpOnly here — the Supabase browser client reads
 * the auth cookie from document.cookie, so forcing httpOnly makes the client
 * believe nobody is signed in and breaks the token refresh cycle. (The tokens
 * are short-lived JWTs by design; this is Supabase's documented model.)
 */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) req.cookies.set(name, value);
          res = NextResponse.next({ request: req });
          for (const { name, value, options } of list) res.cookies.set(name, value, options);
        },
      },
    });
    // touch the session so expiring tokens get rotated
    await supabase.auth.getUser();
  }

  // --- security headers on every response --------------------------------
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|woff2)).*)"],
};
