"use client";

import { useEffect, useState } from "react";

interface LimitRow {
  id: string;
  name: string;
  credits: number;
  price: number | null;
  overridden: boolean;
  // paid tiers only
  allInCost?: number;
  profit?: number;
  safe?: boolean;
  historicalFloor?: number;
  // free tiers only
  dailyCost?: number;
  // resume_pass only
  days?: number;
}

/** Same formula as lib/margin.ts — client-side, so the profit preview updates as the admin types, before the real (server-enforced) check on save. */
const TARGET = 0.126;
const TOPUP_FEE = 1.055;
const CARD_PCT = 0.029;
const CARD_FLAT = 0.3;
function previewMargin(credits: number, price: number) {
  const allInCost = (credits / 1_000_000) * TARGET * TOPUP_FEE + price * CARD_PCT + CARD_FLAT;
  return { allInCost, profit: price - allInCost, safe: price - allInCost > 0 };
}
function previewFreeCost(credits: number) {
  return (credits / 1_000_000) * TARGET;
}
/**
 * Resume Pass has a genuinely different cost model — calls/day × days ×
 * $0.00004 (see lib/margin.ts's computeResumePassMargin), not credits/1M.
 * Reusing previewMargin here would have been quietly wrong: at typical
 * values (a few hundred calls/day) the two formulas happen to land in a
 * similar ballpark by coincidence, but previewMargin never multiplies by
 * days at all — raise the daily allowance enough and it would show a large
 * fake profit right up until Save hit the real, correctly-computed 409.
 */
const RESUME_ASSIST_COST_PER_CALL = 0.00004;
function previewResumePassMargin(aiAssistDaily: number, days: number, price: number) {
  const allInCost = aiAssistDaily * days * RESUME_ASSIST_COST_PER_CALL * TOPUP_FEE + price * CARD_PCT + CARD_FLAT;
  return { allInCost, profit: price - allInCost, safe: price - allInCost > 0 };
}

export default function LimitsPanel() {
  const [rows, setRows] = useState<LimitRow[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { credits: string; price: string }>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/admin/limits")
      .then((r) => r.json())
      .then((d: { limits: LimitRow[] }) => {
        setRows(d.limits);
        setDrafts(Object.fromEntries(d.limits.map((r) => [r.id, { credits: String(r.credits), price: r.price !== null ? String(r.price) : "" }])));
      });

  useEffect(() => {
    load();
  }, []);

  async function save(id: string, isPaid: boolean) {
    const draft = drafts[id];
    const credits = Number(draft.credits);
    const price = isPaid ? Number(draft.price) : undefined;

    setBusyId(id);
    setMessage(null);
    try {
      const res = await fetch("/api/admin/limits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, credits, ...(isPaid ? { price } : {}) }),
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
    setMessage(null);
    try {
      await fetch(`/api/admin/limits?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!rows) return <p className="text-ink-mute">Loading…</p>;

  const field =
    "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] outline-none focus:border-brand";

  return (
    <div className="space-y-4">
      {rows.map((r) => {
        const isPaid = r.price !== null || ["starter", "pro", "promax"].includes(r.id);
        const isResumePass = r.id === "resume_pass";
        const draft = drafts[r.id] ?? { credits: "", price: "" };
        const draftCredits = Number(draft.credits) || 0;
        const draftPrice = Number(draft.price) || 0;
        const floor = r.historicalFloor;
        const checkPrice = isPaid && floor !== undefined ? Math.min(draftPrice, floor) : draftPrice;
        const preview = isResumePass
          ? previewResumePassMargin(draftCredits, r.days ?? 5, checkPrice || draftPrice)
          : isPaid
            ? previewMargin(draftCredits, checkPrice || draftPrice)
            : null;
        const freePreview = !isPaid ? previewFreeCost(draftCredits) : null;
        const changed = draft.credits !== String(r.credits) || (isPaid && draft.price !== String(r.price ?? ""));

        return (
          <div key={r.id} className="card-shadow rounded-2xl border border-line bg-surface p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{r.name}</p>
                <p className="mt-0.5 text-[12px] text-ink-faint">
                  {r.overridden ? "Admin-set" : "Using the built-in default"}
                </p>
              </div>
              {r.overridden && (
                <button
                  onClick={() => revert(r.id)}
                  disabled={busyId === r.id}
                  className="text-[12px] font-semibold text-ink-faint hover:text-warn"
                >
                  Revert to default
                </button>
              )}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">
                  {isResumePass ? "AI assists / day" : isPaid ? "Credits / month" : "Credits / day"}
                </label>
                <input
                  value={draft.credits}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...d[r.id], credits: e.target.value.replace(/[^0-9]/g, "") } }))}
                  className={field}
                  inputMode="numeric"
                />
              </div>
              {isPaid && (
                <div>
                  <label className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-faint">Price (USD)</label>
                  <input
                    value={draft.price}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: { ...d[r.id], price: e.target.value.replace(/[^0-9.]/g, "") } }))}
                    className={field}
                    inputMode="decimal"
                  />
                </div>
              )}
            </div>

            {/* live preview — updates as the admin types, before the real server-side check */}
            <div className={`mt-3 rounded-lg p-3 text-[13px] ${isPaid ? (preview?.safe ? "bg-mint-tint" : "bg-warn-tint") : "bg-canvas"}`}>
              {isPaid ? (
                <>
                  <p className={preview?.safe ? "text-mint" : "font-semibold text-warn"}>
                    Worst-case profit: ${preview?.profit.toFixed(2)} per purchase
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-ink-faint">
                    (cost ${preview?.allInCost.toFixed(2)} if every credit goes to the most expensive thing on the site
                    {floor !== undefined && floor < draftPrice ? `, checked at the lowest price this package has ever had ($${floor.toFixed(2)})` : ""})
                  </p>
                  {!preview?.safe && (
                    <p className="mt-1 text-[12px] font-semibold text-warn">
                      Save will be refused — this loses money{floor !== undefined && floor < draftPrice ? " for anyone still on that older price" : ""}.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-ink-mute">
                  Worst-case cost: ${freePreview?.toFixed(4)}/day per user — pure spend, no revenue to offset it.
                </p>
              )}
            </div>

            {message?.id === r.id && (
              <p className={`mt-2 text-[12.5px] ${message.ok ? "text-mint" : "font-semibold text-warn"}`}>{message.text}</p>
            )}

            <button
              onClick={() => save(r.id, isPaid)}
              disabled={busyId === r.id || !changed || (isPaid && !preview?.safe)}
              className="mt-3 rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep disabled:opacity-40"
            >
              {busyId === r.id ? "Saving…" : "Save"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
