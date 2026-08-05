"use client";

import { useEffect, useState } from "react";

interface Tier {
  id: string;
  hours: number;
  price: number;
  label: string;
  overridden: boolean;
}

export default function PriorityPricingPanel() {
  const [tiers, setTiers] = useState<Tier[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/admin/priority-pricing")
      .then((r) => r.json())
      .then((d: { tiers: Tier[] }) => {
        setTiers(d.tiers);
        setDrafts(Object.fromEntries(d.tiers.map((t) => [t.id, String(t.price)])));
      });

  useEffect(() => {
    load();
  }, []);

  async function save(id: string) {
    const price = Number(drafts[id]);
    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/priority-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, price }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ id, ok: false, text: json.message ?? "Could not save." });
        return;
      }
      setMessage({ id, ok: true, text: "Saved — live within moments." });
      await load();
    } catch {
      setMessage({ id, ok: false, text: "Connection lost. Try again." });
    } finally {
      setBusyId(null);
    }
  }

  async function revert(id: string) {
    setBusyId(id);
    try {
      await fetch(`/api/admin/priority-pricing?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!tiers) return <p className="text-ink-mute">Loading…</p>;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {tiers.map((t) => {
        const draft = drafts[t.id] ?? "";
        const changed = draft !== String(t.price);
        return (
          <div key={t.id} className="card-shadow rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-ink">
                  {t.hours} Hours <span className="text-ink-faint">· {t.label}</span>
                </p>
                <p className="mt-0.5 text-[11.5px] text-ink-faint">{t.overridden ? "Admin-set" : "Using the built-in default"}</p>
              </div>
              {t.overridden && (
                <button onClick={() => revert(t.id)} disabled={busyId === t.id} className="text-[11.5px] font-semibold text-ink-faint hover:text-warn">
                  Revert
                </button>
              )}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-ink-mute">$</span>
              <input
                value={draft}
                onChange={(e) => setDrafts((d) => ({ ...d, [t.id]: e.target.value.replace(/[^0-9.]/g, "") }))}
                className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-brand"
                inputMode="decimal"
              />
              <button
                onClick={() => save(t.id)}
                disabled={busyId === t.id || !changed || !draft}
                className="shrink-0 rounded-lg bg-brand px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-brand-deep disabled:opacity-40"
              >
                {busyId === t.id ? "…" : "Save"}
              </button>
            </div>
            {message?.id === t.id && (
              <p className={`mt-1.5 text-[12px] ${message.ok ? "text-mint" : "font-semibold text-warn"}`}>{message.text}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}
