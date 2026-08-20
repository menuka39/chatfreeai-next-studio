/**
 * AdSense configuration — deliberately a plain (non-"use client") module.
 *
 * These constants are imported by BOTH the client component
 * (components/AdSense.tsx) and a server route (app/ads.txt/route.ts).
 * They originally lived in the client component, and importing them into
 * the server route silently broke it at runtime: the "use client" boundary
 * rewrites what the importing side receives, so `ADSENSE_CLIENT_ID` arrived
 * as a client-reference object rather than the string, and calling
 * `.replace()` on it threw `TypeError: … .replace is not a function` — a
 * 500 on /ads.txt that the build reported as perfectly clean.
 *
 * Plain shared values that both sides need belong in a plain module.
 */

/** Set NEXT_PUBLIC_ADSENSE_CLIENT_ID to the real `ca-pub-…` id after AdSense approves the site. */
export const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID ?? "";

/** A placeholder id is scaffolding, not a live integration — treat it as unconfigured. */
export const adsenseConfigured =
  ADSENSE_CLIENT_ID.startsWith("ca-pub-") && !ADSENSE_CLIENT_ID.includes("XXXX");

/**
 * Ad unit ids, in one place rather than as loose strings in page files.
 *
 * These are placeholders until the units exist. After AdSense approves the
 * site: create each unit in the AdSense dashboard, then paste its `data-ad-slot`
 * number here. A wrong or placeholder number doesn't error — the unit just
 * silently never fills, which is exactly the kind of failure that goes
 * unnoticed for weeks, so treat it as a real step and check Realtime after.
 */
export const AD_SLOTS = {
  /** Responsive banner above the chat box on the home page. */
  chatTop: "3912546619",
} as const;
