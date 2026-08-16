"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

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
  const skippedInitialPageView = useRef(false);

  useEffect(() => {
    if (!skippedInitialPageView.current) {
      skippedInitialPageView.current = true;
      return;
    }

    if (!measurementId || typeof window.gtag !== "function") return;

    window.gtag("config", measurementId, {
      page_path: window.location.pathname + window.location.search,
    });
  }, [measurementId, pathname]);

  return null;
}
