"use client";

import { useState } from "react";

export default function SettingsForm({
  initialSiteName,
  initialTagline,
  initialLogoUrl,
}: {
  initialSiteName: string;
  initialTagline: string;
  initialLogoUrl: string | null;
}) {
  const [siteName, setSiteName] = useState(initialSiteName);
  const [tagline, setTagline] = useState(initialTagline);
  const [logoPreview, setLogoPreview] = useState<string | null>(initialLogoUrl);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function pickLogo(file: File | undefined) {
    if (!file) return;
    setLogoFile(file);
    setLogoPreview(URL.createObjectURL(file));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("siteName", siteName);
      form.set("tagline", tagline);
      if (logoFile) form.set("logo", logoFile);

      const res = await fetch("/api/admin/settings", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: json.message ?? "Could not save settings." });
        return;
      }
      setMessage({ ok: true, text: "Saved. Refresh the site to see it live." });
      setLogoFile(null);
    } catch {
      setMessage({ ok: false, text: "Connection lost. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[14.5px] outline-none placeholder:text-ink-faint focus:border-brand";

  return (
    <form onSubmit={save} className="card-shadow max-w-xl rounded-2xl border border-line bg-surface p-6">
      <div>
        <label className="text-sm font-semibold">Logo</label>
        <div className="mt-2 flex items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas">
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo preview" className="h-full w-full object-contain" />
            ) : (
              <span className="text-[11px] text-ink-faint">No logo</span>
            )}
          </div>
          <label className="cursor-pointer rounded-lg border border-line px-4 py-2 text-[13px] font-semibold text-ink hover:border-brand">
            Choose image
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => pickLogo(e.target.files?.[0])}
            />
          </label>
        </div>
        <p className="mt-1.5 text-[12px] text-ink-faint">PNG, JPG or WebP, up to 2MB. Falls back to the text wordmark if none is set.</p>
      </div>

      <div className="mt-5">
        <label className="text-sm font-semibold">Site name</label>
        <input value={siteName} onChange={(e) => setSiteName(e.target.value)} className={field} maxLength={80} />
      </div>

      <div className="mt-5">
        <label className="text-sm font-semibold">Tagline</label>
        <input
          value={tagline}
          onChange={(e) => setTagline(e.target.value)}
          placeholder="Shown in a few places around the site"
          className={field}
          maxLength={160}
        />
      </div>

      {message && (
        <p className={`mt-4 text-[13.5px] ${message.ok ? "text-mint" : "font-semibold text-warn"}`}>{message.text}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className="mt-5 rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save settings"}
      </button>
    </form>
  );
}
