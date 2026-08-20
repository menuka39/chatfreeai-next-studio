"use client";

import Script from "next/script";
import { useEffect, useRef, type CSSProperties } from "react";
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
 *
 * SCOPE OF THE PLACEMENT GUARANTEE: where <AdSlot> goes is under this repo's
 * control; where Auto ads goes is not. Any page carrying an AdSense unit is
 * eligible for Auto ads placement, so enabling it in the dashboard lets
 * Google position units anywhere on the page — including inside the chat,
 * which every placement decision here exists to prevent. Keep Auto ads off;
 * see DEPLOY.md.
 */
export function AdSlot({
  slot,
  format = "auto",
  className = "",
  minHeight = 280,
  label = false,
}: {
  /** the ad unit id from AdSense (its own value, separate from the publisher id) */
  slot: string;
  format?: string;
  className?: string;
  /**
   * Space held for the ad before it fills.
   *
   * An empty <ins> is zero-height until AdSense paints into it, and everything
   * below then jumps down — the single biggest source of layout shift on an
   * ad-supported page, and CLS is a ranking signal. Reserving the space costs
   * a gap for a moment; not reserving it costs the score.
   *
   * A single number reserves the same height everywhere, which is wrong for a
   * responsive unit: AdSense serves a ~100px banner to a phone and a ~90px
   * leaderboard to a desktop, so one number is guaranteed to over-reserve on
   * one and under-reserve on the other. Pass `{ base, sm, lg }` to reserve
   * per breakpoint — omitted steps inherit the one below.
   */
  minHeight?: number | { base: number; sm?: number; lg?: number };
  /**
   * Renders a small "Advertisement" caption above the unit. Worth it wherever
   * an ad sits directly against real UI, so it doesn't read as part of the
   * product. AdSense allows exactly "Advertisement" or "Sponsored Links" —
   * anything more inviting ("useful links", "recommended") is a policy breach.
   */
  label?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!adsenseConfigured || process.env.NODE_ENV !== "production") return;
    const el = ref.current;
    if (!el) return;

    const fill = () => {
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
    };

    /*
     * Only request the ad once the slot is near the viewport.
     *
     * Requesting every unit on load runs an auction for ads most visitors
     * never scroll to — main-thread work that competes with the page becoming
     * interactive, for impressions that don't count as viewable anyway.
     */
    if (typeof IntersectionObserver === "undefined") return fill();
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          fill();
          io.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  if (!adsenseConfigured) return null;

  // Inline styles can't hold media queries, so the breakpoints come from
  // Tailwind utilities and the values ride in as custom properties.
  const h = typeof minHeight === "number" ? { base: minHeight } : minHeight;
  const vars = {
    "--ad-h": `${h.base}px`,
    "--ad-h-sm": `${h.sm ?? h.base}px`,
    "--ad-h-lg": `${h.lg ?? h.sm ?? h.base}px`,
  } as CSSProperties;
  const reserve = "min-h-[var(--ad-h)] sm:min-h-[var(--ad-h-sm)] lg:min-h-[var(--ad-h-lg)]";

  return (
    <div ref={ref} className={className} style={vars}>
      {label && (
        <p className="mb-1.5 text-center text-[11px] uppercase tracking-[0.14em] text-ink-faint">
          Advertisement
        </p>
      )}
      <ins
        className={`adsbygoogle block w-full ${reserve}`}
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
