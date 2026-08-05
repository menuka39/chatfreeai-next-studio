"use client";

import { useEffect, useRef } from "react";

/**
 * Renders the Turnstile widget and hands the resulting token back.
 *
 * Only mounted when the server has actually asked for a challenge, so real
 * visitors never load Cloudflare's script — or see a widget — unless a check
 * is genuinely needed.
 */

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
    onTurnstileReady?: () => void;
  }
}

const SCRIPT_ID = "cf-turnstile-script";

function loadScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve();
    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("script failed")));
      return;
    }
    const el = document.createElement("script");
    el.id = SCRIPT_ID;
    el.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error("script failed"));
    document.head.appendChild(el);
  });
}

export default function TurnstileGate({
  siteKey,
  onToken,
  onUnavailable,
}: {
  siteKey: string;
  onToken: (token: string) => void;
  onUnavailable: () => void;
}) {
  const holder = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    loadScript()
      .then(() => {
        if (cancelled || !holder.current || !window.turnstile) return;
        widgetId.current = window.turnstile.render(holder.current, {
          sitekey: siteKey,
          theme: "dark",
          size: "flexible",
          callback: (token: string) => onToken(token),
          "error-callback": () => onUnavailable(),
          "expired-callback": () => window.turnstile?.reset(widgetId.current ?? undefined),
        });
      })
      .catch(() => {
        // Cloudflare blocked or offline. Telling the visitor to solve a widget
        // that will never appear would strand them, so surface it as a plain
        // failure they can retry.
        if (!cancelled) onUnavailable();
      });

    return () => {
      cancelled = true;
      if (widgetId.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetId.current);
        } catch {
          /* already gone */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  return (
    <div className="mt-2 rounded-xl border border-line bg-canvas p-3">
      <p className="text-[12.5px] text-ink-mute">
        Quick check that you&apos;re not a bot — this keeps the free tier free for everyone.
      </p>
      <div ref={holder} className="mt-2" />
      <p className="mt-1.5 text-[11.5px] text-ink-faint">
        Signing in skips this entirely.
      </p>
    </div>
  );
}
