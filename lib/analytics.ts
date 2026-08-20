/**
 * Google Analytics 4 configuration — a plain (non-"use client") module, for
 * the same reason lib/adsense.ts is one: the value is read from both the
 * client tracker and the server-rendered root layout, and a "use client"
 * boundary would hand the server side a client-reference object instead of
 * the string.
 */

/** `G-…` from the GA4 web data stream. Unset = analytics simply doesn't render. */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "";

/** A GA4 measurement id is always `G-` followed by the property suffix. */
export const analyticsConfigured = /^G-[A-Z0-9]+$/i.test(GA_MEASUREMENT_ID);

/**
 * Skipped in local `next dev` on purpose: without this, every page load while
 * building or testing would report as real traffic and quietly inflate
 * whatever numbers an admin reads later.
 */
export const analyticsEnabled = analyticsConfigured && process.env.NODE_ENV === "production";
