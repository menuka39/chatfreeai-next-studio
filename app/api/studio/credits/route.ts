import { NextRequest } from "next/server";
import { getSession, planFor } from "@/lib/session";
import { peek, userMonthlyKey } from "@/lib/quota";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import { packageById } from "@/lib/packages";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What the studio's Credits view and the balance chips read.
 *
 * The WordPress studio carried its own wallet — a per-image cash balance the
 * plugin topped up over PayPal. This app already has one pool: the monthly
 * package credits shared by chat, image, video and audio. So the studio shows
 * that instead of a second balance, and "Payment" points at the packages this
 * app actually sells. Same panels, real numbers.
 *
 * Every studio — image, video, music and speech — spends from this one
 * balance, so this is the only number any of them needs.
 */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  const plan = planFor(session);

  if (!session.userId) {
    return Response.json({
      signedIn: false,
      plan: "free",
      packageName: null,
      used: 0,
      cap: 0,
      remaining: 0,
      resetsAt: null,
    });
  }

  if (plan === "free") {
    return Response.json({
      signedIn: true,
      plan: "free",
      packageName: null,
      used: 0,
      cap: 0,
      remaining: 0,
      resetsAt: null,
    });
  }

  const cap = await effectiveCredits(session.packageId! as LimitId);
  const key = userMonthlyKey(session.userId, session.periodStart);
  const state = await peek(key, cap, session.periodStart);

  return Response.json({
    signedIn: true,
    plan,
    packageName: packageById(session.packageId!)?.name ?? null,
    used: state.used,
    cap,
    remaining: state.remaining,
    resetsAt: session.periodStart,
  });
}
