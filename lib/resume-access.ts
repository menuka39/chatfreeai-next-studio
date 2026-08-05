/**
 * Who can use the resume builder, and how much AI help they get.
 *
 * DESIGN NOTE — why AI assists are metered in CALLS, not credits:
 *
 * Credits exist to price expensive, variable work (chat, image, video, voice)
 * where one request can cost dollars. A resume assist is a ~160-token
 * completion costing about $0.00004 — four thousandths of a cent. Charging it
 * against a credit pool made the builder feel metered and, worse, produced a
 * backwards outcome: a $2.99 pass holder got assists without touching credits
 * while a $14.99 subscriber paid for every one. A subscriber should never get
 * the worse deal.
 *
 * So: everyone gets a daily CALL allowance. The builder itself — editing,
 * template switching, PDF export — is unlimited for every tier, because those
 * cost us nothing per use. The daily cap is an ABUSE CEILING, not an expected
 * budget: writing one resume takes roughly 20-40 assists in total.
 *
 * Worst-case cost per tier per month (cap × 30 days × $0.00004):
 *   guest      10/day  ->  $0.01
 *   free       30/day  ->  $0.04
 *   pass      300/day  ->  $0.04 over its 5-day life
 *   starter   200/day  ->  $0.24   (4% of ~$5.61 profit)
 *   pro       400/day  ->  $0.48   (8% of ~$6.16 profit)
 *   promax    800/day  ->  $0.96   (16% of ~$6.02 profit)
 * Real usage is a rounding error against these; the ceilings only bind on
 * scripted abuse.
 */

import type { Session } from "./session";
import { passActive } from "./resume-pass";
import { effectiveResumePass } from "./plan-limits";

export type ResumeTier = "guest" | "free" | "pass" | "starter" | "pro" | "promax";

export interface ResumeAccess {
  tier: ResumeTier;
  /** AI suggestion calls allowed per UTC day */
  dailyAssists: number;
  /** builder, templates, PDF export — unlimited for everyone */
  unlimitedBuilder: true;
  /** how the entitlement is described in the UI */
  label: string;
  /** true when it came from something they paid for */
  paid: boolean;
}

/**
 * `pass` is intentionally NOT in this map — its cap is admin-adjustable (see
 * /admin/limits) and resolved live via effectiveResumePass() below, rather
 * than duplicated here as a second hardcoded constant. It used to be
 * duplicated (a bare `300` here, independent of RESUME_PASS.aiAssistDaily in
 * lib/resume-pass.ts) — the two could already have silently drifted apart
 * even before either was admin-adjustable; making the pass cap admin-facing
 * was the forcing function to fix that instead of teaching a third place the
 * same wrong number.
 */
export const ASSIST_CAPS: Record<Exclude<ResumeTier, "pass">, number> = {
  guest: 10,
  free: 30,
  starter: 200,
  pro: 400,
  promax: 800,
};

const LABELS: Record<ResumeTier, string> = {
  guest: "Free — sign in for more AI suggestions",
  free: "Free account",
  pass: "Resume Pass",
  starter: "Starter package",
  pro: "Pro package",
  promax: "Pro Max package",
};

export async function resumeAccess(session: Session): Promise<ResumeAccess> {
  // A monthly package always wins: it's the more expensive product, so it must
  // never give a worse allowance than the cheap one-off pass.
  const pkg = session.packageId;
  let tier: ResumeTier;

  if (pkg === "promax" || pkg === "pro" || pkg === "starter") tier = pkg;
  else if (passActive(session.resumePassExpiresAt)) tier = "pass";
  else if (session.userId) tier = "free";
  else tier = "guest";

  const dailyAssists = tier === "pass" ? (await effectiveResumePass()).aiAssistDaily : ASSIST_CAPS[tier];

  return {
    tier,
    dailyAssists,
    unlimitedBuilder: true,
    label: LABELS[tier],
    paid: tier !== "guest" && tier !== "free",
  };
}

/** Quota key for the per-day assist counter. */
export function assistKey(session: Session, ipHash: string) {
  const day = new Date().toISOString().slice(0, 10);
  return session.userId ? `q:rassist:u:${session.userId}:${day}` : `q:rassist:g:${ipHash}:${day}`;
}
