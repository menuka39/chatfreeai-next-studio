/**
 * Sessions — real auth via Supabase.
 *
 * The JWT arrives in an httpOnly cookie set by Supabase Auth. We validate it
 * with `getUser()` (which checks the signature against the auth server —
 * never trust `getSession()` alone server-side), then load the user's plan
 * from the `profiles` table with the SERVICE role.
 *
 * The plan lives in the DATABASE, not in a cookie and not in the JWT: the
 * only writer is our PayPal webhook handler after signature verification, so
 * a user cannot grant themselves a package by editing anything client-side.
 *
 * DEV FALLBACK: when Supabase env vars are absent (local sandbox, CI), the
 * old cookie shim applies so the app stays testable — with a loud warning in
 * production.
 */

import type { NextRequest } from "next/server";
import type { Plan } from "./models";
import { packageById } from "./packages";
import { supabaseFromRequest, supabaseEnvPresent, serviceQuery } from "./supabase/server";

export interface Session {
  userId: string | null;
  email?: string | null;
  isAdmin: boolean;
  packageId: string | null;
  subscriptionStatus?: string | null;
  paypalSubscriptionId?: string | null;
  /** ISO timestamp while a Resume Pass is active */
  resumePassExpiresAt?: string | null;
  /** ISO month key of the current billing period — keys the monthly pool */
  periodStart: string;
}

interface ProfileRow {
  id: string;
  email: string | null;
  is_admin: boolean | null;
  package_id: string | null;
  subscription_status: string | null;
  paypal_subscription_id: string | null;
  current_period_start: string | null;
  resume_pass_expires_at: string | null;
}

let warned = false;

export async function getSession(req: NextRequest): Promise<Session> {
  const monthKey = new Date().toISOString().slice(0, 7);

  if (!supabaseEnvPresent()) {
    // In production this means a misconfigured deploy — missing or mistyped
    // Supabase env vars. Degrade to a plain guest session rather than
    // honouring the dev cookie shim: that shim reads `pkg` straight from a
    // cookie, so anyone could hand themselves Pro Max by editing one in
    // devtools. A guest session makes a bad deploy obvious immediately
    // (nobody can log in) instead of quietly giving paid plans away while
    // everything still looks fine.
    if (process.env.NODE_ENV === "production") {
      if (!warned) {
        warned = true;
        console.error(
          "[auth] Supabase env vars are missing — every request is being treated as a " +
            "signed-out guest. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY " +
            "and SUPABASE_SERVICE_ROLE_KEY, then redeploy.",
        );
      }
      return { userId: null, packageId: null, periodStart: monthKey, isAdmin: false };
    }

    const userId = req.cookies.get("uid")?.value ?? null;
    const packageId = req.cookies.get("pkg")?.value ?? null;
    const periodStart = req.cookies.get("period")?.value ?? monthKey;
    // dev-only convenience so admin routes are testable without a real DB
    const isAdmin = req.cookies.get("admin")?.value === "1";
    return { userId, packageId, periodStart, isAdmin };
  }

  // --- real path: validate the JWT, then read the plan from the DB ---------
  const supabase = supabaseFromRequest(req);
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, packageId: null, periodStart: monthKey, isAdmin: false };

  const rows = await serviceQuery<ProfileRow[]>(
    `profiles?id=eq.${encodeURIComponent(user.id)}&select=id,email,is_admin,package_id,subscription_status,paypal_subscription_id,current_period_start,resume_pass_expires_at&limit=1`,
  );
  const profile = rows?.[0];

  const active =
    profile?.package_id &&
    ["active", "cancelling"].includes(profile.subscription_status ?? "") &&
    packageById(profile.package_id);

  return {
    userId: user.id,
    email: user.email ?? profile?.email ?? null,
    packageId: active ? profile!.package_id : null,
    subscriptionStatus: profile?.subscription_status ?? null,
    paypalSubscriptionId: profile?.paypal_subscription_id ?? null,
    isAdmin: Boolean(profile?.is_admin),
    resumePassExpiresAt: profile?.resume_pass_expires_at ?? null,
    periodStart: profile?.current_period_start?.slice(0, 7) ?? monthKey,
  };
}

/** Guests and free accounts are both on the "free" plan — same model access. */
export function planFor(session: Session): Plan {
  if (session.packageId && packageById(session.packageId)) {
    return packageById(session.packageId)!.id;
  }
  return "free";
}

export const isGuest = (session: Session) => !session.userId;

export function clientIp(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "0.0.0.0";
}
