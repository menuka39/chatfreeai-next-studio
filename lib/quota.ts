/**
 * Server-side quota enforcement.
 *
 * Rules:
 *  - Guest (no login):  8,000 credits per UTC day, keyed by IP + device hash.
 *  - Free (logged in): 20,000 credits per UTC day, keyed by user id.
 *  - Paid:             monthly credit pool from their package.
 *
 * The period (UTC day, or billing month) is part of the key, so allowances
 * refill automatically and a spent day stays spent — there is no way to top up
 * early. Counting is server-side only: clearing cookies, incognito, or calling
 * the API directly all hit the same counter.
 *
 * ⚠️ STORAGE — READ BEFORE DEPLOYING
 * On a single long-running server the in-memory store is fine. On Vercel (or
 * any serverless platform) it is NOT: each request can land on a different
 * instance with its own empty memory, so limits effectively vanish and free
 * users cost you real money.
 *
 * Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN and this file switches
 * to Redis automatically — no code change. Redis also makes charging ATOMIC,
 * which closes the race where parallel requests each read the old total.
 */

import { createHash } from "crypto";
import { FREE_LIMITS } from "./packages";

export type Tier = "guest" | "free" | "paid";

export interface QuotaState {
  tier: Tier;
  used: number;
  limit: number;
  remaining: number;
  resetsAt: string;
}

interface QuotaStore {
  /** Add `amount` to the key and return the new total. Sets the TTL on create. */
  incrBy(key: string, amount: number, ttlSeconds: number): Promise<number>;
  /** Current total, or 0. */
  read(key: string): Promise<number>;
  readonly kind: "memory" | "redis";
}

/* ------------------------------------------------------------------ */
/* Dev store — single process only                                     */
/* ------------------------------------------------------------------ */

class MemoryQuotaStore implements QuotaStore {
  readonly kind = "memory" as const;
  private map = new Map<string, { total: number; expires: number }>();

  private live(key: string) {
    const hit = this.map.get(key);
    if (!hit || hit.expires < Date.now()) return null;
    return hit;
  }
  async read(key: string) {
    return this.live(key)?.total ?? 0;
  }
  async incrBy(key: string, amount: number, ttlSeconds: number) {
    const hit = this.live(key);
    const total = (hit?.total ?? 0) + amount;
    this.map.set(key, {
      total,
      expires: hit?.expires ?? Date.now() + ttlSeconds * 1000,
    });
    return total;
  }
}

/* ------------------------------------------------------------------ */
/* Production store — Upstash Redis over REST (no extra dependency,    */
/* works on Vercel edge/serverless)                                    */
/* ------------------------------------------------------------------ */

class RedisQuotaStore implements QuotaStore {
  readonly kind = "redis" as const;
  /**
   * Throttle the diagnostic, don't suppress it.
   *
   * This was "log once per process", which backfired: on serverless the
   * instance that logged it may have been recycled or its line scrolled
   * away, so the one message explaining WHY requests are being refused was
   * effectively invisible. A misconfiguration persists until someone fixes
   * it, so the explanation has to keep appearing — throttled to once a
   * minute, which is frequent enough to find and too rare to flood.
   */
  private static lastWarnedAt = 0;
  /** the most recent failure reason, so callers can report it without re-deriving it */
  static lastError = "";
  private static shouldWarn() {
    const now = Date.now();
    if (now - RedisQuotaStore.lastWarnedAt < 60_000) return false;
    RedisQuotaStore.lastWarnedAt = now;
    return true;
  }
  constructor(
    private url: string,
    private token: string,
  ) {}

  private async cmd<T>(parts: (string | number)[]): Promise<T | null> {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(parts),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        RedisQuotaStore.lastError =
          `HTTP ${res.status}` +
          (res.status === 401 || res.status === 403
            ? " (UPSTASH_REDIS_REST_TOKEN is wrong)"
            : res.status === 404
              ? " (UPSTASH_REDIS_REST_URL is wrong — it must be the https:// REST URL, not rediss://)"
              : "");
        // Say WHY. A silent null here is indistinguishable from any other
        // failure, and the symptom users see ("you've reached your free
        // limit") points nowhere near the real cause. 401 = wrong token,
        // 404 = wrong URL — both are one-line fixes once you can see them.
        if (RedisQuotaStore.shouldWarn()) {
          console.error(
            `[quota] Upstash rejected the request: HTTP ${res.status}. ` +
              `401/403 means UPSTASH_REDIS_REST_TOKEN is wrong; 404 means ` +
              `UPSTASH_REDIS_REST_URL is wrong (it must be the https:// REST URL, ` +
              `not the rediss:// one). Until this is fixed every request is refused.`,
          );
        }
        return null;
      }
      const json = await res.json();
      return (json?.result ?? null) as T;
    } catch (err) {
      RedisQuotaStore.lastError = `cannot reach Upstash (${err instanceof Error ? err.message : "unknown"}) — URL wrong, or the database is paused`;
      if (RedisQuotaStore.shouldWarn()) {
        console.error("[quota] Could not reach Upstash:", err instanceof Error ? err.message : err);
      }
      return null;
    }
  }

  async read(key: string) {
    const v = await this.cmd<string>(["GET", key]);
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  async incrBy(key: string, amount: number, ttlSeconds: number) {
    // INCRBY is atomic — parallel requests can't both read a stale total.
    const total = await this.cmd<number>(["INCRBY", key, amount]);
    if (total === null) {
      // Redis unreachable. Fail CLOSED: report the limit as already spent so we
      // never hand out unmetered usage during an outage.
      throw new Error(RedisQuotaStore.lastError || "quota store unavailable");
    }
    if (total === amount) await this.cmd(["EXPIRE", key, ttlSeconds]);
    return total;
  }
}

function createStore(): QuotaStore {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new RedisQuotaStore(url, token);

  if (process.env.NODE_ENV === "production") {
    console.warn(
      "[quota] No UPSTASH_REDIS_REST_URL set — using in-memory quotas. " +
        "On serverless this means limits are NOT enforced across instances.",
    );
  }
  return new MemoryQuotaStore();
}

const store = createStore();
export const quotaBackend = store.kind;

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

/** UTC day string, e.g. "2026-07-21" — this is what makes the reset daily. */
export function utcDayKey(d = new Date()) {
  return d.toISOString().slice(0, 10);
}

export function nextUtcMidnight(d = new Date()) {
  const next = new Date(d);
  next.setUTCHours(24, 0, 0, 0);
  return next.toISOString();
}

/**
 * Identify an anonymous visitor. IP alone is too blunt (shared NAT, mobile
 * carriers) and a cookie alone is trivially cleared, so we hash both together
 * AND keep a stricter IP-only counter as the ceiling.
 */
export function guestKeys(ip: string, deviceId: string | null) {
  const day = utcDayKey();
  const device = createHash("sha256").update(`${ip}::${deviceId ?? "none"}`).digest("hex").slice(0, 32);
  return {
    device: `q:guest:dev:${device}:${day}`,
    ip: `q:guest:ip:${createHash("sha256").update(ip).digest("hex").slice(0, 32)}:${day}`,
  };
}

export const userDailyKey = (userId: string) => `q:free:${userId}:${utcDayKey()}`;
export const userMonthlyKey = (userId: string, periodStart: string) =>
  `q:paid:${userId}:${periodStart}`;

const DAY_TTL = 60 * 60 * 36; // a bit over a day, so the key self-expires

/* ------------------------------------------------------------------ */
/* Charging                                                            */
/* ------------------------------------------------------------------ */

/** Read current usage without charging. */
export async function peek(key: string, limit: number, resetsAt: string): Promise<QuotaState> {
  const used = await store.read(key);
  return { tier: "guest", used, limit, remaining: Math.max(0, limit - used), resetsAt };
}

/**
 * Charge credits against a key. Returns ok:false if it would exceed the limit.
 *
 * `credits` may be negative to refund. Refunds always apply — they can't push
 * a user over a limit.
 *
 * NOTE: the second parameter is kept for call-site compatibility; the period is
 * already encoded in the key, so it is not used for bucketing.
 */
export async function charge(
  key: string,
  _period: string,
  limit: number,
  credits: number,
  ttl = DAY_TTL,
) {
  if (credits <= 0) {
    const total = await store.incrBy(key, credits, ttl);
    return { ok: true as const, used: total, remaining: Math.max(0, limit - total) };
  }

  try {
    const total = await store.incrBy(key, credits, ttl);
    if (total > limit) {
      // put it back — this request is refused
      await store.incrBy(key, -credits, ttl);
      const used = total - credits;
      return { ok: false as const, used, remaining: Math.max(0, limit - used) };
    }
    return { ok: true as const, used: total, remaining: limit - total };
  } catch (err) {
    // Store unavailable — fail closed rather than give away free usage, but
    // flag WHY. Callers previously could not tell this apart from a real
    // over-limit and told the user they had run out of credits, which is both
    // untrue and pushes them at the pricing page over an outage.
    return {
      ok: false as const,
      used: limit,
      remaining: 0,
      storeDown: true as const,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Reserve a small amount before a request so a user cannot fire many parallel
 * requests to blow past the limit, then settle the difference afterwards.
 */
export const RESERVE_CREDITS = 400;

export function limitForTier(tier: Tier, packageCredits?: number) {
  if (tier === "paid") return packageCredits ?? 0;
  return FREE_LIMITS[tier];
}
