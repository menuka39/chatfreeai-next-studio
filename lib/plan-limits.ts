/**
 * Admin-adjustable credits/price for packages and the free daily allowances,
 * layered over the hardcoded defaults in lib/packages.ts — same "DB first,
 * hardcoded fallback" shape, including a 30s in-memory
 * cache, so an admin's change takes effect within moments without hammering
 * Postgres on every quota check.
 *
 * lib/packages.ts itself is left completely untouched: it's still the
 * fallback (and the only source for things that AREN'T admin-adjustable —
 * feature lists, output-token limits, package names). This file only
 * resolves the two numbers that matter for /admin/limits: credits and price.
 */

import { serviceQuery } from "./supabase/server";
import { packageById, FREE_LIMITS, type Package } from "./packages";
import { RESUME_PASS } from "./resume-pass";
import type { Plan } from "./models";

/**
 * `credits` means a different thing per row — monthly credits for a package,
 * a daily allowance for guest/free, AI-assist calls/day for resume_pass. The
 * column is deliberately generic (an admin-adjustable quantity + an optional
 * price) rather than one column per meaning, so adding a new adjustable tier
 * doesn't need a schema change — just a new id and a default resolver below.
 */
export type LimitId = "guest" | "free" | "resume_pass" | Exclude<Plan, "free">;
export const ALL_LIMIT_IDS: LimitId[] = ["guest", "free", "resume_pass", "starter", "pro", "promax"];

interface PlanLimitRow {
  id: string;
  credits: number;
  price: number | null;
  updated_at: string;
}

let cache: Map<string, PlanLimitRow> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30_000;

/**
 * `skipCache: true` bypasses the in-memory cache entirely — for admin-facing
 * reads immediately after a write. invalidatePlanLimitsCache() only clears
 * THIS process's memory; in any real multi-instance deployment (serverless
 * functions, multiple server processes), a write handled by one instance and
 * a subsequent read handled by a DIFFERENT instance would still see the old
 * cached value for up to CACHE_TTL_MS, since the invalidation never reached
 * that other instance. Demonstrated live: POST a new price, GET immediately
 * after, got the stale default back even though the database already had
 * the new value. The hot quota-check path (effectiveCredits, hit on every
 * chat/image/video/audio/tool request) keeps the cache — a few seconds of
 * eventual consistency on a credit LIMIT is a reasonable, honest tradeoff for
 * not adding a DB round-trip to the hottest path in the app. Admin-facing
 * reads are low-frequency enough that there's no real cost to always being
 * exactly right instead.
 */
async function loadOverrides(skipCache = false): Promise<Map<string, PlanLimitRow>> {
  if (!skipCache && cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  const rows = await serviceQuery<PlanLimitRow[]>("plan_limits?select=id,credits,price,updated_at");
  cache = new Map((rows ?? []).map((r) => [r.id, r]));
  cachedAt = Date.now();
  return cache;
}

export function invalidatePlanLimitsCache() {
  cache = null;
}

function defaultFor(id: LimitId): { credits: number; price: number | null } {
  if (id === "guest" || id === "free") return { credits: FREE_LIMITS[id], price: null };
  if (id === "resume_pass") return { credits: RESUME_PASS.aiAssistDaily, price: RESUME_PASS.price };
  const pkg = packageById(id);
  return { credits: pkg!.credits, price: pkg!.price };
}

/** The credits (and price, for paid tiers) actually in effect right now. */
export async function effectiveLimit(id: LimitId, skipCache = false): Promise<{ credits: number; price: number | null; overridden: boolean }> {
  const overrides = await loadOverrides(skipCache);
  const row = overrides.get(id);
  if (row) return { credits: row.credits, price: row.price, overridden: true };
  return { ...defaultFor(id), overridden: false };
}

/** Just the credit count — the one thing every quota `charge()` call actually needs. */
export async function effectiveCredits(id: LimitId): Promise<number> {
  return (await effectiveLimit(id)).credits;
}

/** Every tier's effective values, for the admin panel and the public pricing page. */
export async function effectiveLimits(skipCache = false): Promise<Record<LimitId, { credits: number; price: number | null; overridden: boolean }>> {
  const overrides = await loadOverrides(skipCache);
  const out = {} as Record<LimitId, { credits: number; price: number | null; overridden: boolean }>;
  for (const id of ALL_LIMIT_IDS) {
    const row = overrides.get(id);
    out[id] = row ? { credits: row.credits, price: row.price, overridden: true } : { ...defaultFor(id), overridden: false };
  }
  return out;
}

/** A package with its credits/price swapped for the effective (possibly admin-overridden) values. */
export async function effectivePackage(id: Exclude<Plan, "free">): Promise<Package> {
  const base = packageById(id)!;
  const { credits, price } = await effectiveLimit(id);
  return { ...base, credits, price: price ?? base.price };
}

/** Resume Pass's effective (possibly admin-overridden) daily allowance and price. Days stays fixed at the product's 5-day default — not part of this admin control. */
export async function effectiveResumePass(): Promise<{ aiAssistDaily: number; days: number; price: number }> {
  const { credits, price } = await effectiveLimit("resume_pass");
  return { aiAssistDaily: credits, days: RESUME_PASS.days, price: price ?? RESUME_PASS.price };
}
