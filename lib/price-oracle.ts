import { openRouterKey } from "./openrouter";

/**
 * Live price oracle.
 *
 * THE PROBLEM IT SOLVES: several catalogue prices are `estimated`, and any
 * price can change on the provider's side between deploys. A hardcoded number
 * that is too low means we charge too few credits and lose money on every
 * generation — and a static audit can't see it, because the audit only checks
 * the numbers we wrote down.
 *
 * THE FIX: before charging, ask OpenRouter what the model ACTUALLY costs right
 * now and price from that. The catalogue becomes a fallback, not the source of
 * truth.
 *
 *   live price available  -> charge from the live price
 *   live price missing    -> charge from the catalogue, and if the entry is
 *                            marked `estimated`, multiply by SAFETY_FACTOR
 *
 * Prices are cached in memory for an hour, so this costs one request per hour
 * per server process, not one per generation. A stale-but-present cache is
 * always preferred over failing a user's request.
 */

/** Applied to `estimated` catalogue prices when live data is unavailable. */
export const SAFETY_FACTOR = 2;

/** USD cost per 1M credits — the rate every modality is priced against. */
export const CREDIT_RATE = 0.126;

/** credits = usdCost / CREDIT_RATE * 1M  ⇒  usdCost * 7.94M. Rounded up. */
export function creditsForUsd(usd: number) {
  return Math.ceil((usd / CREDIT_RATE) * 1_000_000);
}

export interface LivePrice {
  /** USD per 1M prompt tokens */
  promptPerM?: number;
  /** USD per 1M completion tokens */
  completionPerM?: number;
  /** USD per second of video */
  perSecond?: number;
  /** USD per output image */
  perImage?: number;
  /** USD per megapixel */
  perMegapixel?: number;
}

const TTL_MS = 60 * 60 * 1000;
let cache: { at: number; prices: Map<string, LivePrice> } | null = null;
let inflight: Promise<Map<string, LivePrice>> | null = null;

const num = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/** Parse whichever pricing shape a model entry uses. */
function parsePricing(entry: Record<string, unknown>): LivePrice {
  const out: LivePrice = {};
  const p = entry.pricing;

  // token models: { prompt: "0.00000015", completion: "0.0000006" } (per token)
  if (p && !Array.isArray(p) && typeof p === "object") {
    const obj = p as Record<string, unknown>;
    const prompt = num(obj.prompt);
    const completion = num(obj.completion);
    if (prompt !== undefined) out.promptPerM = prompt * 1_000_000;
    if (completion !== undefined) out.completionPerM = completion * 1_000_000;
    const perSec = num(obj.per_second ?? obj.video);
    if (perSec !== undefined) out.perSecond = perSec;
    const perImg = num(obj.image ?? obj.per_image);
    if (perImg !== undefined) out.perImage = perImg;
  }

  // media models: [{ billable: "output_image", unit: "image", cost_usd: 0.04 }]
  if (Array.isArray(p)) {
    for (const raw of p) {
      const row = raw as Record<string, unknown>;
      const cost = num(row.cost_usd ?? row.cost);
      if (cost === undefined) continue;
      const unit = String(row.unit ?? "").toLowerCase();
      if (unit === "second" || unit === "seconds") out.perSecond = cost;
      else if (unit === "image") out.perImage = cost;
      else if (unit === "megapixel" || unit === "mp") out.perMegapixel = cost;
    }
  }
  return out;
}

async function fetchAll(): Promise<Map<string, LivePrice>> {
  const key = openRouterKey();
  const prices = new Map<string, LivePrice>();
  const endpoints = [
    "https://openrouter.ai/api/v1/models",
    "https://openrouter.ai/api/v1/models?output_modality=video",
    "https://openrouter.ai/api/v1/models?output_modality=image",
  ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        headers: key ? { Authorization: `Bearer ${key}` } : {},
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;
      const json = await res.json();
      const list: Record<string, unknown>[] = json.data ?? json.models ?? [];
      for (const entry of list) {
        const id = String(entry.id ?? entry.slug ?? "");
        if (!id) continue;
        const parsed = parsePricing(entry);
        if (Object.keys(parsed).length) prices.set(id, { ...prices.get(id), ...parsed });
      }
    } catch {
      /* endpoint unavailable — other endpoints may still succeed */
    }
  }
  return prices;
}

/** Cached live prices. Never throws; returns an empty map on total failure. */
export async function livePrices(): Promise<Map<string, LivePrice>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.prices;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const prices = await fetchAll();
      if (prices.size) cache = { at: Date.now(), prices };
      // a stale cache beats no cache
      return prices.size ? prices : (cache?.prices ?? new Map());
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Effective USD cost for one unit of work.
 *
 * @param slug        OpenRouter model slug
 * @param pick        reads the live price for this modality
 * @param fallback    catalogue cost
 * @param estimated   whether the catalogue cost is a guess
 */
export async function effectiveCost(
  slug: string,
  pick: (p: LivePrice) => number | undefined,
  fallback: number,
  estimated = false,
): Promise<{ usd: number; source: "live" | "catalogue" | "catalogue+safety" }> {
  try {
    const live = pick((await livePrices()).get(slug) ?? {});
    // ignore zero/absurd values — a bad parse must never make things free
    if (live !== undefined && live > 0) return { usd: live, source: "live" };
  } catch {
    /* fall through to the catalogue */
  }
  return estimated
    ? { usd: fallback * SAFETY_FACTOR, source: "catalogue+safety" }
    : { usd: fallback, source: "catalogue" };
}
