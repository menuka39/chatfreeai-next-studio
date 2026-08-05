"use client";

import Script from "next/script";
import { useEffect, useRef } from "react";
import { ADSENSE_CLIENT_ID, adsenseConfigured } from "@/lib/adsense";

/**
 * Google AdSense — loader plus a reusable ad slot.
 *
 * Hand-rolled with next/script rather than @next/third-parties, which ships
 * GoogleAnalytics and GoogleTagManager but has no AdSense equivalent (checked
 * the installed package — only ga/gtm/maps/youtube modules exist).
 *
 * NOT YET LIVE: the publisher id below is a placeholder. AdSense has to
 * approve the site before a real `ca-pub-…` id exists, so this is the
 * plumbing, ready for that id to be dropped in — see the README section for
 * exactly what to change when approval comes through.
 */


/**
 * The site-wide loader — one per page, in the root layout.
 *
 * Same production-only rule as GoogleAnalytics: without it, local dev page
 * loads would register as real ad impressions. That matters more here than
 * for analytics — Google treats invalid traffic as a policy violation, and
 * a developer refreshing their own ad-bearing pages all day is exactly the
 * pattern that gets accounts suspended.
 */
export function AdSenseLoader() {
  if (!adsenseConfigured || process.env.NODE_ENV !== "production") return null;
  return (
    <Script
      id="adsense-loader"
      async
      strategy="afterInteractive"
      src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
      crossOrigin="anonymous"
    />
  );
}

/**
 * One ad slot. Renders nothing at all until AdSense is actually configured —
 * so dropping <AdSlot> into a page now is safe: it's invisible today and
 * starts working the moment a real publisher id is set, with no code change.
 */
export function AdSlot({
  slot,
  format = "auto",
  className = "",
}: {
  /** the ad unit id from AdSense (its own value, separate from the publisher id) */
  slot: string;
  format?: string;
  className?: string;
}) {
  const pushed = useRef(false);

  useEffect(() => {
    if (!adsenseConfigured || process.env.NODE_ENV !== "production") return;
    // React 18+ runs effects twice in dev StrictMode, and a client-side
    // route change can remount this — pushing the same slot twice makes
    // AdSense log "already have ads in them", so guard it.
    if (pushed.current) return;
    pushed.current = true;
    try {
      ((window as unknown as { adsbygoogle: unknown[] }).adsbygoogle ??= []).push({});
    } catch {
      // an ad failing to fill is normal and never worth breaking a page over
    }
  }, []);

  if (!adsenseConfigured) return null;

  return (
    <ins
      className={`adsbygoogle block ${className}`}
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
