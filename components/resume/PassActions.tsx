"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { passDaysLeft } from "@/lib/resume-pass";

/**
 * Buy / show status for the 5-day Resume Pass.
 *
 * After PayPal approval the user returns with ?token=<orderId>; we capture it
 * server-side and the server decides whether to grant the pass based on what
 * PayPal reports was actually paid.
 */
export default function PassActions({
  expiresAt,
  hasPackage,
  price,
  days,
}: {
  expiresAt: string | null;
  hasPackage: boolean;
  /** current (possibly admin-adjusted) Resume Pass price and length — passed down from the server component so this stays live without a second fetch */
  price: number;
  days: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  const daysLeft = passDaysLeft(expiresAt);
  const active = daysLeft > 0;

  // capture on return from PayPal
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (params.get("pass") !== "success" || !token) return;
    setCapturing(true);
    (async () => {
      try {
        const res = await fetch("/api/account/pass", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: token }),
        });
        const json = await res.json();
        if (!res.ok) {
          setMessage(json.message ?? "Could not confirm the payment.");
          setDetail(json.detail ?? null);
        } else {
          window.location.replace("/account");
          return;
        }
      } catch {
        setMessage("Could not confirm the payment. If you were charged, contact support.");
      } finally {
        setCapturing(false);
      }
    })();
  }, []);

  async function buy() {
    setBusy(true);
    setMessage(null);
    setDetail(null);
    try {
      const res = await fetch("/api/account/pass", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.message ?? "Could not start checkout.");
        setDetail(json.detail ?? null);
        setBusy(false);
        return;
      }
      window.location.href = json.approveUrl;
    } catch {
      setMessage("Connection lost. Try again.");
      setBusy(false);
    }
  }

  if (hasPackage) {
    return (
      <div className="card-shadow mt-5 rounded-2xl border border-line bg-surface p-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Resume Builder</p>
        <p className="mt-2 text-sm text-ink">
          Included with your package — all {40} templates, unlimited downloads.
        </p>
        <Link href="/tools/resume-builder" className="mt-3 inline-block rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-brand">
          Open the builder
        </Link>
      </div>
    );
  }

  return (
    <div id="pass" className="card-shadow mt-5 scroll-mt-24 rounded-2xl border border-line bg-surface p-6">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Resume Pass</p>

      {capturing ? (
        <p className="mt-2 text-sm text-ink-mute">Confirming your payment…</p>
      ) : active ? (
        <>
          <p className="mt-1 text-lg font-semibold">
            Active — {daysLeft} {daysLeft === 1 ? "day" : "days"} left
          </p>
          <p className="mt-1 text-[13px] text-ink-mute">
            Unlimited resumes, all 40 templates, unlimited PDF downloads. Expires{" "}
            {new Date(expiresAt!).toLocaleDateString()}. No auto-renewal — nothing to cancel.
          </p>
          <Link href="/tools/resume-builder" className="mt-4 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep">
            Open the builder
          </Link>
        </>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold">
            ${price} for {days} days
          </p>
          <p className="mt-1 text-[13px] text-ink-mute">
            One payment, no subscription. Unlimited resumes and PDF downloads while it lasts.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={buy}
              disabled={busy}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
            >
              {busy ? "Opening PayPal…" : "Get the Resume Pass"}
            </button>
            <Link href="/tools/resume-builder" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink hover:border-brand">
              Browse templates first
            </Link>
          </div>
        </>
      )}

      {message && (
        <div className="mt-3 rounded-xl border border-warn-line bg-warn-tint p-4">
          <p className="text-sm font-semibold text-ink">{message}</p>
          {detail && <p className="mt-2 break-words font-mono text-[12px] text-ink-mute">{detail}</p>}
        </div>
      )}
    </div>
  );
}
