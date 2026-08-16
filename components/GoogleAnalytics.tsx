"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

type GoogleAnalyticsProps = {
  measurementId: string;
};

export function GoogleAnalytics({ measurementId }: GoogleAnalyticsProps) {
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!ready || !measurementId || typeof window.gtag !== "function") return;

    window.gtag("config", measurementId, {
      page_path: window.location.pathname + window.location.search,
    });
  }, [measurementId, pathname, ready]);

  if (!measurementId) return null;

  return (
    <>
      <Script
        id="ga-loader"
        src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive" onReady={() => setReady(true)}>
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${measurementId}', { send_page_view: false });
        `}
      </Script>
    </>
  );
}
