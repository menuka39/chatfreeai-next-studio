"use client";

import { useEffect, useState } from "react";

interface Status {
  id: string;
  label: string;
  configured: boolean;
  healthy: boolean;
  failures: number;
  openedAt: number | null;
  lastError: string;
}

/**
 * Shows where chat traffic is actually going.
 *
 * The fallback is silent by design — a provider outage shouldn't reach users.
 * The risk is that it stays silent for you too: a dead key can sit there for
 * months while every request quietly costs more than it should. This is the
 * page that makes that visible.
 *
 * Note the caveat below the list: breaker state is per server instance, so
 * a reading is one instance's view, not the whole fleet's.
 */
export default function ProviderStatus() {
  const [rows, setRows] = useState<Status[] | null>(null);

  const load = () =>
    fetch("/api/admin/providers")
      .then((r) => r.json())
      .then((d) => setRows(d.providers ?? []))
      .catch(() => setRows([]));

  useEffect(() => {
    load();
    // a circuit re-closes on its own after a couple of minutes; polling means
    // the page reflects that without anyone reloading it
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  if (!rows) return <p className="text-ink-mute">Loading…</p>;

  return (
    <div>
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((p) => {
          const state = !p.configured ? "off" : p.healthy ? "direct" : "fallback";
          return (
            <div key={p.id} className="card-shadow rounded-xl border border-line bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-ink">{p.label}</span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                    state === "direct"
                      ? "bg-mint-tint text-mint"
                      : state === "fallback"
                        ? "bg-warn-tint text-warn"
                        : "text-ink-faint"
                  }`}
                >
                  {state === "direct" ? "Direct" : state === "fallback" ? "Falling back" : "Not configured"}
                </span>
              </div>

              {state === "off" && (
                <p className="mt-1.5 text-[12px] text-ink-faint">
                  No key set — these models go through OpenRouter.
                </p>
              )}
              {state === "direct" && p.failures > 0 && (
                <p className="mt-1.5 text-[12px] text-ink-faint">
                  {p.failures} recent failure{p.failures === 1 ? "" : "s"} — still routing direct.
                </p>
              )}
              {state === "fallback" && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[12px] text-ink-mute">
                    Opened {p.openedAt ? new Date(p.openedAt).toLocaleTimeString() : "—"} after{" "}
                    {p.failures} failures. Retries automatically.
                  </p>
                  {p.lastError && (
                    <p className="break-words text-[11.5px] text-ink-faint">Last error: {p.lastError}</p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-[11.5px] text-ink-faint">
        Breaker state is per server instance, so this reflects the instance that answered — during an
        outage some instances may still be trying. OpenRouter is always the fallback.
      </p>
    </div>
  );
}
