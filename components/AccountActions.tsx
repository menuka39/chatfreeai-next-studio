"use client";

import { useState } from "react";
import { packages } from "@/lib/packages";

/**
 * Subscribe / cancel controls. Subscribing redirects to PayPal's approval
 * page; activation happens via webhook after payment, so there is nothing a
 * user can do client-side to grant themselves a plan.
 */
export default function AccountActions({
  hasActivePlan,
  currentPackageId,
}: {
  hasActivePlan: boolean;
  currentPackageId: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);

  async function subscribe(packageId: string) {
    setBusy(packageId);
    setMessage(null);
    setDetail(null);
    try {
      const res = await fetch("/api/account/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDetail(data.detail ?? null);
        throw new Error(data.message ?? "Could not start checkout.");
      }
      window.location.href = data.approveUrl; // continue on PayPal's secure page
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
    }
  }

  async function cancel() {
    setBusy("cancel");
    setMessage(null);
    setDetail(null);
    try {
      const res = await fetch("/api/account/subscription", { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setDetail(data.detail ?? null);
        throw new Error(data.message ?? "Could not cancel.");
      }
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(null);
      setConfirmCancel(false);
    }
  }

  return (
    <div className="mt-5 border-t border-line pt-5">
      {hasActivePlan ? (
        confirmCancel ? (
          <div className="rounded-xl border border-warn-line bg-warn-tint p-4">
            <p className="text-sm font-semibold text-ink">Cancel your subscription?</p>
            <p className="mt-1 text-[13px] text-ink-mute">
              You keep full access until the end of the period you&apos;ve already paid for. No
              further charges after that.
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={cancel}
                disabled={busy === "cancel"}
                className="rounded-lg bg-warn px-4 py-2 text-sm font-semibold text-navy disabled:opacity-50"
              >
                {busy === "cancel" ? "Cancelling…" : "Yes, cancel"}
              </button>
              <button
                onClick={() => setConfirmCancel(false)}
                className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink"
              >
                Keep my plan
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setConfirmCancel(true)}
            className="rounded-lg border border-line px-4 py-2 text-sm font-semibold text-ink-mute hover:border-warn hover:text-ink"
          >
            Cancel subscription
          </button>
        )
      ) : (
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            {currentPackageId ? "Resubscribe" : "Subscribe"}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {packages.map((p) => (
              <button
                key={p.id}
                onClick={() => subscribe(p.id)}
                disabled={busy !== null}
                className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
              >
                {busy === p.id ? "Opening PayPal…" : `${p.name} — $${p.price}/mo`}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[12.5px] text-ink-faint">
            You&apos;ll approve the payment on PayPal&apos;s own page. Your card never touches our
            servers.
          </p>
        </div>
      )}

      {message && (
        <div className="mt-3 rounded-xl border border-warn-line bg-warn-tint p-4">
          <p className="text-sm font-semibold text-ink">{message}</p>
          {detail && (
            <p className="mt-2 break-words font-mono text-[12px] leading-relaxed text-ink-mute">{detail}</p>
          )}
        </div>
      )}
    </div>
  );
}
