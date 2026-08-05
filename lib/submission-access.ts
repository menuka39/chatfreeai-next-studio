/**
 * The monthly-package perk: 5 free 24-hour Priority Listings a month.
 *
 * Only for paying monthly packages (Starter/Pro/Pro Max) — a free account or
 * guest gets the same free queue and the same option to pay for priority as
 * anyone else, just not this subscriber-only perk. Metered by calendar month
 * via the same `charge()` primitive the rest of the app already uses for
 * per-period pools, keyed to the user's billing period so it resets exactly
 * when their other package limits do.
 */

import type { Session } from "./session";
import { charge } from "./quota";

export const FREE_PRIORITY_24H_PER_MONTH = 5;

const PAID_PACKAGES = new Set(["starter", "pro", "promax"]);

export function packageGrantsFreepriority(session: Session): boolean {
  return Boolean(session.packageId && PAID_PACKAGES.has(session.packageId));
}

const MONTH_TTL = 60 * 60 * 24 * 40;
const key = (session: Session) => `q:submit24h:u:${session.userId}:${session.periodStart}`;

/** Reserve one of the monthly free 24h slots. Returns false if none are left. */
export async function reserveFreePriority(session: Session): Promise<boolean> {
  if (!session.userId || !packageGrantsFreepriority(session)) return false;
  const res = await charge(key(session), session.periodStart, FREE_PRIORITY_24H_PER_MONTH, 1, MONTH_TTL);
  return res.ok;
}

/** Give a reserved slot back — used when a later step in the same request fails. */
export async function releaseFreePriority(session: Session): Promise<void> {
  if (!session.userId) return;
  await charge(key(session), session.periodStart, Number.MAX_SAFE_INTEGER, -1, MONTH_TTL);
}

/** How many of the monthly slots remain, for the form to show honestly. */
export async function freePriorityRemaining(session: Session): Promise<number> {
  if (!packageGrantsFreepriority(session)) return 0;
  // a zero-credit charge() call is this module's read-only "peek" pattern
  const res = await charge(key(session), session.periodStart, FREE_PRIORITY_24H_PER_MONTH, 0, MONTH_TTL);
  return Math.max(0, FREE_PRIORITY_24H_PER_MONTH - res.used);
}
