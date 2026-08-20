"use client";

import Script from "next/script";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";
import { GA_MEASUREMENT_ID, analyticsEnabled } from "@/lib/analytics";

/**
 * Google Analytics 4 — hand-rolled with next/script rather than
 * @next/third-parties.
 *
 * WHY NOT @next/third-parties/google:
 * Its <GoogleAnalytics> does exactly two things — `gtag('js')` and
 * `gtag('config', gaId)` — and nothing else. It has no router hook, so it
 * fires once, on first load. Every link click after that is a soft
 * navigation: the URL changes, the page does not reload, and that component
 * never learns about it.
 *
 * Sites using it still see per-page numbers because GA4's own "Enhanced
 * Measurement > page changes based on browser history events" listens for
 * history changes server-side of the code, in the GA4 dashboard. That works,
 * but it means page-view tracking depends on a checkbox nobody on the dev
 * side controls: switch it off and views silently collapse to the landing
 * page only, with a build that still looks perfectly clean. It also reads
 * document.title at history-change time, which in the App Router can still
 * be the PREVIOUS page's title.
 *
 * So this sends page_view from the router instead. `send_page_view: false`
 * in the config turns off gtag's own automatic one, which is the piece
 * @next/third-parties gives no way to set — otherwise the first load counts
 * twice.
 *
 * ONE REQUIRED DASHBOARD CHANGE: turn OFF Enhanced Measurement's
 * "page changes based on browser history events". Leaving it on alongside
 * this doubles every soft navigation. Leave the rest of Enhanced Measurement
 * (scrolls, outbound clicks, file downloads) alone — those don't overlap.
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function PageViewTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Guards against React re-running the effect for a URL already reported —
  // Strict Mode double-invokes effects in development, and pathname and
  // searchParams can settle in two separate renders for one navigation.
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!analyticsEnabled) return;

    const query = searchParams.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    if (lastSent.current === url) return;
    lastSent.current = url;

    // Two frames, so the title from the new route's metadata has actually
    // been committed to the document before it gets read. Sending
    // immediately is what makes GA reports show the page you just left.
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => {
        window.gtag?.("event", "page_view", {
          page_path: url,
          page_location: window.location.href,
          page_title: document.title,
        });
      });
    });

    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [pathname, searchParams]);

  return null;
}

export function Analytics() {
  if (!analyticsEnabled) return null;

  return (
    <>
      {/*
        A raw <script>, not <Script strategy="...">. Checked against the
        actual built HTML rather than assumed:

        - afterInteractive puts inline content in a client chunk that runs
          AFTER hydration — later than this component's own first effect,
          so `window.gtag` would still be undefined for the very first
          page_view and the landing hit would vanish with no error anywhere.
        - beforeInteractive inline content never reached the server HTML at
          all in this setup.

        A raw script tag inside a client component IS server-rendered, and a
        script in the body runs during HTML parse, before hydration. That is
        the ordering guarantee the tracker below depends on. ~200 bytes,
        fetches nothing; only gtag.js is deferred.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}',{send_page_view:false});`,
        }}
      />
      {/* Queued calls sit in dataLayer until this lands and drains them. */}
      <Script
        id="ga-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
      />
      {/* useSearchParams opts a subtree out of prerendering; without this
          boundary it would deopt every statically generated page. */}
      <Suspense fallback={null}>
        <PageViewTracker />
      </Suspense>
    </>
  );
}
