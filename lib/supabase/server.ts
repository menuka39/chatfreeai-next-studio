import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { normalizeSupabaseUrl } from "./url";

/**
 * Server-side Supabase client bound to the request's cookies (App Router
 * server components and route handlers).
 */
export async function supabaseServer() {
  const store = await cookies();
  return createServerClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => store.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list) store.set(name, value, options);
          } catch {
            /* called from a Server Component — middleware refreshes instead */
          }
        },
      },
    },
  );
}

/** Same client but reading cookies straight off a NextRequest (API routes). */
export function supabaseFromRequest(req: NextRequest) {
  return createServerClient(
    normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL),
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: () => {
          /* API routes don't need to refresh cookies — middleware does */
        },
      },
    },
  );
}

export const supabaseEnvPresent = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

/**
 * Service-role query helper. NEVER import from client code — the service key
 * bypasses Row Level Security. Used server-side to read/write profiles.
 */
export async function serviceQuery<T>(
  path: string,
  init: RequestInit = {},
): Promise<T | null> {
  const url = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(`${url}/rest/v1/${path}`, {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: init.method === "PATCH" || init.method === "POST" ? "return=representation" : "",
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    // A successful DELETE (or any 204/empty response) has no body — res.json()
    // throws on empty input, which the catch below would silently turn into
    // null, indistinguishable from a real failure. Return a truthy sentinel
    // instead so callers can tell "deleted" apart from "failed".
    const text = await res.text();
    if (!text) return { ok: true } as T;
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
