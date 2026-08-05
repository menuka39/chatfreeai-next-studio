import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";

/**
 * Email-link verification that works on ANY device.
 *
 * The /auth/callback route uses the PKCE `code` flow, which requires the code
 * verifier cookie set by the browser that STARTED the sign-in. Open the email
 * on your phone after requesting it on your laptop and that cookie isn't
 * there, so the exchange fails with "code verifier should be non-empty" —
 * which looks to the user like an expired link.
 *
 * This route verifies a `token_hash` instead. No verifier needed, so the link
 * works wherever it's opened. Point the Supabase email templates here:
 *
 *   {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email
 */

const SAFE_NEXT = new Set(["/account", "/auth/reset"]);

export async function GET(req: NextRequest) {
  const tokenHash = req.nextUrl.searchParams.get("token_hash");
  const type = req.nextUrl.searchParams.get("type") as EmailOtpType | null;

  const nextParam = req.nextUrl.searchParams.get("next") ?? "/account";
  const nextPath = SAFE_NEXT.has(nextParam)
    ? nextParam
    : type === "recovery"
      ? "/auth/reset"
      : "/account";

  const fail = (reason: string) => {
    const url = new URL("/login", req.nextUrl.origin);
    url.searchParams.set("error", reason);
    return NextResponse.redirect(url);
  };

  if (!tokenHash || !type) return fail("missing_token");

  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fail("not_configured");

  // build the response first so the session cookies land on it
  const response = NextResponse.redirect(new URL(nextPath, req.nextUrl.origin));

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
  if (error) {
    console.error("[auth/confirm] verifyOtp failed:", error.message);
    return fail(error.message.slice(0, 200));
  }

  return response;
}
