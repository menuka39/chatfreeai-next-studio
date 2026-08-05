/**
 * Admin-adjustable prices for the 4 Priority Listing tiers
 * (lib/tool-submission.ts's PRIORITY_TIERS) — layered over those hardcoded
 * defaults via site_settings, the same public-read/service-role-write table
 * already used for the site logo/name.
 *
 * Deliberately NOT part of the plan_limits/margin-checked system: those
 * tiers have no credits or AI-cost dimension at all — paying for priority
 * doesn't grant any metered resource, it just skips the free queue. There's
 * no "worst-case AI spend" to validate against, so the safety net here is
 * just "is this a real positive price," not a profit calculation.
 */

import { serviceQuery } from "./supabase/server";
import { PRIORITY_TIERS, type PriorityTier } from "./tool-submission";

const settingKey = (tierId: string) => `priority_price_${tierId}`;

interface SettingRow {
  key: string;
  value: string | null;
}

/**
 * No caching here, unlike lib/plan-limits.ts's effectiveCredits() — that one
 * is hit on every chat/image/video/audio/tool-run request site-wide, where a
 * DB round-trip on every single request is a real cost worth trading a few
 * seconds of eventual consistency for. Submitting a tool listing is rare by
 * comparison — nowhere near that frequency — and both consumers of this
 * price (the actual PayPal order amount, and what's displayed to a user
 * before they pay) are exactly the places a cached, possibly-stale value
 * would cause real harm: a wrong charge, or a price shown that doesn't match
 * what they're about to be charged. Always reading fresh from Postgres (the
 * single source of truth all instances share) costs one extra query on an
 * infrequent path and sidesteps the whole class of "which server instance's
 * in-memory cache is stale" bug entirely, rather than managing it.
 */
async function loadOverrides(): Promise<Map<string, number>> {
  const keys = PRIORITY_TIERS.map((t) => settingKey(t.id));
  const rows = await serviceQuery<SettingRow[]>(
    `site_settings?key=in.(${keys.join(",")})&select=key,value`,
  );
  return new Map(
    (rows ?? [])
      .filter((r) => r.value !== null && !Number.isNaN(Number(r.value)))
      .map((r) => [r.key, Number(r.value)]),
  );
}

/** Kept as a no-op for callers written against the old cached version — nothing to invalidate now that every read is already fresh. */
export function invalidatePriorityPricingCache() {}

/** All 4 tiers with their effective (possibly admin-overridden) price. */
export async function effectivePriorityTiers(): Promise<(PriorityTier & { overridden: boolean })[]> {
  const overrides = await loadOverrides();
  return PRIORITY_TIERS.map((t) => {
    const override = overrides.get(settingKey(t.id));
    return override !== undefined ? { ...t, price: override, overridden: true } : { ...t, overridden: false };
  });
}

/** One tier's effective price — what the submit/capture routes actually need. */
export async function effectivePriorityPrice(tierId: string): Promise<number | null> {
  const tier = PRIORITY_TIERS.find((t) => t.id === tierId);
  if (!tier) return null;
  const overrides = await loadOverrides();
  return overrides.get(settingKey(tierId)) ?? tier.price;
}
