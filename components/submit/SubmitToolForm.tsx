"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  CATEGORIES,
  PRIORITY_TIERS,
  validateSubmission,
  type SubmissionInput,
} from "@/lib/tool-submission";

type FormState = SubmissionInput;
type Choice = "free" | "24h-perk" | (typeof PRIORITY_TIERS)[number]["id"];

const empty: FormState = { toolName: "", tagline: "", description: "", websiteUrl: "", category: "", contactEmail: "" };

interface EtaInfo {
  signedIn: boolean;
  freeQueue: { position: number; hours: number; formatted: string };
  packagePerk: { available: boolean; remaining: number };
  /** admin-adjustable in /admin/limits — falls back to the static defaults below only during the initial load */
  priorityTiers?: (typeof PRIORITY_TIERS)[number][];
}

export default function SubmitToolForm() {
  const [data, setData] = useState<FormState>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [choice, setChoice] = useState<Choice>("free");
  const [info, setInfo] = useState<EtaInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);

  useEffect(() => {
    fetch("/api/tools/submit")
      .then((r) => r.json())
      .then(setInfo)
      .catch(() => {});
  }, []);

  // resume after a PayPal redirect
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");
    if (params.get("paid") !== "success" || !token) return;
    setBusy(true);
    fetch("/api/tools/submit/capture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: token }),
    })
      .then((r) => r.json())
      .then((json) => {
        if (json.ok) {
          setResult({
            status: "paid",
            message: `Payment confirmed for "${json.toolName ?? "your tool"}" — it'll be reviewed by ${new Date(json.reviewDueAt).toLocaleString()}.`,
          });
          window.history.replaceState({}, "", "/tools/submit");
        } else {
          setServerError(json.message ?? "Could not confirm the payment.");
        }
      })
      .catch(() => setServerError("Could not confirm the payment. If you were charged, contact support."))
      .finally(() => setBusy(false));
  }, []);

  // admin-adjustable prices from the API once loaded; static defaults only
  // during the brief initial fetch
  const tiers = info?.priorityTiers ?? PRIORITY_TIERS;

  const field =
    "mt-1.5 w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[14.5px] outline-none placeholder:text-ink-faint focus:border-brand";
  const errClass = (k: string) => (errors[k] ? " border-warn" : "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validateSubmission(data);
    setErrors(fieldErrors);
    if (Object.keys(fieldErrors).length) return;

    setBusy(true);
    setServerError(null);
    try {
      const tier = choice === "24h-perk" ? "24h" : choice;
      const res = await fetch("/api/tools/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, tier, usePackagePerk: choice === "24h-perk" }),
      });
      const json = await res.json();
      if (!res.ok) {
        if (res.status === 400 && json.fields) setErrors(json.fields);
        setServerError(json.message ?? "Could not submit your tool.");
        return;
      }
      if (json.approveUrl) {
        window.location.href = json.approveUrl;
        return;
      }
      if (json.tier === "free") {
        setResult({
          status: "queued",
          message: `You're #${json.queue.position} in the free queue — estimated live in ${json.queue.formatted}.`,
        });
      } else {
        setResult({
          status: "queued",
          message: `Queued with your free monthly priority slot — reviewed by ${new Date(json.reviewDueAt).toLocaleString()}.`,
        });
      }
      setData(empty);
    } catch {
      setServerError("Connection lost. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="card-shadow rounded-2xl border border-mint/30 bg-surface p-8 text-center">
        <p className="text-3xl">✓</p>
        <h2 className="mt-3 font-display text-xl font-semibold">Submitted</h2>
        <p className="mx-auto mt-2 max-w-md text-ink-mute">{result.message}</p>
        <Link href="/tools" className="mt-6 inline-block rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
          Back to tools
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-8 lg:grid-cols-[1fr_360px]">
      <div className="card-shadow rounded-2xl border border-line bg-surface p-6 sm:p-7">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">Tool name</label>
            <input
              value={data.toolName}
              onChange={(e) => setData({ ...data, toolName: e.target.value })}
              placeholder="e.g. PromptForge"
              className={field + errClass("toolName")}
            />
            {errors.toolName && <p className="mt-1 text-[12.5px] text-warn">{errors.toolName}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">Tagline</label>
            <input
              value={data.tagline}
              onChange={(e) => setData({ ...data, tagline: e.target.value })}
              placeholder="One line — what it does, for who"
              maxLength={140}
              className={field + errClass("tagline")}
            />
            {errors.tagline && <p className="mt-1 text-[12.5px] text-warn">{errors.tagline}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">Description</label>
            <textarea
              value={data.description}
              onChange={(e) => setData({ ...data, description: e.target.value })}
              rows={4}
              placeholder="What it does, what makes it worth listing, who it's for."
              maxLength={1000}
              className={field + " resize-y" + errClass("description")}
            />
            {errors.description && <p className="mt-1 text-[12.5px] text-warn">{errors.description}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Website URL</label>
            <input
              value={data.websiteUrl}
              onChange={(e) => setData({ ...data, websiteUrl: e.target.value })}
              placeholder="https://"
              className={field + errClass("websiteUrl")}
            />
            {errors.websiteUrl && <p className="mt-1 text-[12.5px] text-warn">{errors.websiteUrl}</p>}
          </div>

          <div>
            <label className="text-sm font-semibold">Category</label>
            <select
              value={data.category}
              onChange={(e) => setData({ ...data, category: e.target.value })}
              className={field + errClass("category")}
            >
              <option value="">Choose one</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {errors.category && <p className="mt-1 text-[12.5px] text-warn">{errors.category}</p>}
          </div>

          <div className="sm:col-span-2">
            <label className="text-sm font-semibold">Contact email</label>
            <input
              value={data.contactEmail}
              onChange={(e) => setData({ ...data, contactEmail: e.target.value })}
              placeholder="you@example.com"
              className={field + errClass("contactEmail")}
            />
            <p className="mt-1 text-[12px] text-ink-faint">Only used to reach you about this listing.</p>
            {errors.contactEmail && <p className="mt-1 text-[12.5px] text-warn">{errors.contactEmail}</p>}
          </div>
        </div>
      </div>

      {/* tier picker */}
      <div className="space-y-3">
        <label
          className={`block cursor-pointer rounded-xl border p-4 transition-colors ${
            choice === "free" ? "border-brand bg-brand-tint" : "border-line bg-surface hover:border-ink-faint"
          }`}
        >
          <div className="flex items-start gap-3">
            <input type="radio" name="tier" checked={choice === "free"} onChange={() => setChoice("free")} className="mt-1" />
            <div>
              <p className="font-semibold text-ink">Free listing</p>
              <p className="mt-0.5 text-[13px] text-ink-mute">
                Reviewed in the order received.
                {info ? (
                  <>
                    {" "}
                    Estimated time until live:{" "}
                    <span className="font-semibold text-ink">{info.freeQueue.formatted}</span>.
                  </>
                ) : (
                  " Calculating…"
                )}
              </p>
            </div>
          </div>
        </label>

        {info?.packagePerk.available && info.packagePerk.remaining > 0 && (
          <label
            className={`block cursor-pointer rounded-xl border p-4 transition-colors ${
              choice === "24h-perk" ? "border-mint bg-mint-tint" : "border-line bg-surface hover:border-ink-faint"
            }`}
          >
            <div className="flex items-start gap-3">
              <input type="radio" name="tier" checked={choice === "24h-perk"} onChange={() => setChoice("24h-perk")} className="mt-1" />
              <div>
                <p className="font-semibold text-ink">
                  24 Hours — free with your package <span className="text-mint">$0</span>
                </p>
                <p className="mt-0.5 text-[13px] text-ink-mute">
                  {info.packagePerk.remaining} of 5 free monthly priority listings left.
                </p>
              </div>
            </div>
          </label>
        )}

        <p className="pt-1 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Priority Listing</p>
        {tiers.map((t) => (
          <label
            key={t.id}
            className={`block cursor-pointer rounded-xl border p-4 transition-colors ${
              choice === t.id ? "border-brand bg-brand-tint" : "border-line bg-surface hover:border-ink-faint"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <input type="radio" name="tier" checked={choice === t.id} onChange={() => setChoice(t.id)} className="mt-1" />
                <div>
                  <p className="font-semibold text-ink">{t.hours} Hours</p>
                  <p className="text-[13px] text-ink-mute">{t.label}</p>
                </div>
              </div>
              <p className="font-display text-lg font-semibold">${t.price}</p>
            </div>
          </label>
        ))}

        {serverError && (
          <div className="rounded-xl border border-warn-line bg-warn-tint p-3.5">
            <p className="text-[13.5px] font-medium text-ink">{serverError}</p>
            {!info?.signedIn && (
              <Link href="/login" className="mt-2 inline-block text-[13px] font-semibold text-brand hover:text-brand-deep">
                Sign in →
              </Link>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-brand px-5 py-3 text-center text-[15px] font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy
            ? "Working…"
            : choice === "free" || choice === "24h-perk"
              ? "Submit tool"
              : `Continue to payment — $${tiers.find((t) => t.id === choice)?.price}`}
        </button>
      </div>
    </form>
  );
}
