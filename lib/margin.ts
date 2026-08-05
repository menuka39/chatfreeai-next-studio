/**
 * The real-money math behind package limits — same formula
 * `scripts/audit-margins.mjs` uses to prove no catalogue option can lose
 * money. This is the ONE place that formula lives for runtime (server) code;
 * the audit script stays a standalone text-parser over the .ts source (so it
 * needs zero build step to run) and isn't refactored to import this, but the
 * constants below are kept numerically identical on purpose — copy any
 * change to one into the other, and re-run `npm run audit:margins` after.
 *
 * WHY THIS FILE EXISTS: /admin/limits lets an admin change a package's price
 * and credit allowance. That is the single most dangerous number in the
 * app — get it wrong and every purchase of that package quietly loses money,
 * silently, until someone notices. This function is what makes that save
 * SAFE: computed and checked BEFORE any write reaches the database, using
 * the same worst-case assumption the audit script does (a user spends every
 * credit on the single most expensive thing on the site).
 */

/** Max USD cost per 1M credits — the ceiling every catalogued model/option must stay under. */
export const TARGET_COST_PER_1M = 0.126;
/** OpenRouter's fee for topping up credits. */
export const TOPUP_FEE = 1.055;
/** Card processor fee: percentage + flat. */
export const CARD_PCT = 0.029;
export const CARD_FLAT = 0.3;

export interface MarginResult {
  credits: number;
  price: number;
  /** worst-case all-in cost: API spend (with topup fee) + card processing */
  allInCost: number;
  profit: number;
  /** the hard safety floor this was checked against */
  safe: boolean;
}

/**
 * Worst-case profit for a package: what's left if a subscriber spends every
 * credit on the single most expensive thing the site offers, and the topup +
 * card fees are paid on top. `safe` is false at profit <= $0 — a real loss,
 * not just a thin margin.
 */
export function computeMargin(credits: number, price: number): MarginResult {
  const apiCost = (credits / 1_000_000) * TARGET_COST_PER_1M;
  const allInCost = apiCost * TOPUP_FEE + price * CARD_PCT + CARD_FLAT;
  const profit = price - allInCost;
  return { credits, price, allInCost, profit, safe: profit > 0 };
}

/**
 * The real check for a package edit: new credits must be safe not just
 * against the price being saved, but against the LOWEST price any
 * currently-active subscriber might still be locked into via an older
 * PayPal plan (see lib/plan-limits.ts and the schema comment on
 * plan_limit_history for why that's a real, not theoretical, risk).
 *
 * `historicalPrices` should include every price ever set for this package —
 * the original hardcoded default plus every subsequent admin change — so a
 * subscriber from any point in the package's history is covered, not just
 * the price in effect right this moment.
 */
export function computeMarginAgainstHistory(
  credits: number,
  newPrice: number,
  historicalPrices: number[],
): { worstPrice: number; result: MarginResult } {
  const worstPrice = Math.min(newPrice, ...historicalPrices);
  return { worstPrice, result: computeMargin(credits, worstPrice) };
}

/**
 * Resume Pass uses a different cost model than the credit-based packages —
 * assists are metered in raw CALLS, not credits (see lib/resume-access.ts's
 * own detailed comment on why). $0.00004/call is the real, documented cost
 * of a ~160-token completion there — kept numerically identical to that
 * comment on purpose, the same cross-reference discipline as the constants
 * at the top of this file.
 */
export const RESUME_ASSIST_COST_PER_CALL = 0.00004;

export interface ResumePassMarginResult {
  aiAssistDaily: number;
  days: number;
  price: number;
  allInCost: number;
  profit: number;
  safe: boolean;
}

export function computeResumePassMargin(aiAssistDaily: number, days: number, price: number): ResumePassMarginResult {
  const apiCost = aiAssistDaily * days * RESUME_ASSIST_COST_PER_CALL;
  const allInCost = apiCost * TOPUP_FEE + price * CARD_PCT + CARD_FLAT;
  const profit = price - allInCost;
  return { aiAssistDaily, days, price, allInCost, profit, safe: profit > 0 };
}

/**
 * Resume Pass is a one-off PayPal Order, not a subscription — there's no
 * legacy PayPal plan locking anyone to an old recurring price the way
 * packages have, and any single active pass is bounded to at most 5 days.
 * Still checked against price history for the same reason packages are: an
 * already-active (already-paid) pass holder reads the daily allowance live,
 * same as packages, so raising it doesn't retroactively re-check what an
 * existing pass holder who paid an older, lower price would get — just with
 * a much smaller, days-bounded blast radius than an ongoing subscription.
 */
export function computeResumePassMarginAgainstHistory(
  aiAssistDaily: number,
  days: number,
  newPrice: number,
  historicalPrices: number[],
): { worstPrice: number; result: ResumePassMarginResult } {
  const worstPrice = Math.min(newPrice, ...historicalPrices);
  return { worstPrice, result: computeResumePassMargin(aiAssistDaily, days, worstPrice) };
}

/** Worst-case USD cost of a free (unpriced) daily allowance — pure spend, no revenue to offset it. */
export function computeFreeCost(dailyCredits: number): number {
  return (dailyCredits / 1_000_000) * TARGET_COST_PER_1M;
}
