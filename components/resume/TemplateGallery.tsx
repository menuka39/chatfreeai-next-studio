"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import TemplateRenderer from "./TemplateRenderer";
import ScaledPage from "./ScaledPage";
import { sampleResume } from "@/lib/resume";
import { resumeTemplates, CATEGORIES, ATS_LABEL, type Category, type ResumeTemplate } from "@/lib/resume-templates";

/**
 * Every card is a REAL render of the template scaled to the card width, not a
 * screenshot — it can't go stale, needs no image hosting, and what you preview
 * is exactly what you get. The magnifier opens the same render large enough to
 * read before committing.
 */

/**
 * Signal orange means exactly one thing across the site: action / live / CTA.
 * The middling "ATS good" badge used to borrow it too, which diluted that
 * meaning and made a passive status badge compete visually with real buttons.
 * Only the badges that carry real signal keep colour: teal for genuinely
 * safe, amber for genuinely risky. "ok" reads as plain, quiet text instead.
 */
const TONE = {
  good: "bg-mint-tint text-mint",
  ok: "bg-canvas text-ink-mute",
  warn: "bg-warn-tint text-warn",
} as const;

type Sample = ReturnType<typeof sampleResume>;

function Card({ t, sample, onPreview }: { t: ResumeTemplate; sample: Sample; onPreview: (t: ResumeTemplate) => void }) {
  const ats = ATS_LABEL[t.ats];
  return (
    <div className="group overflow-hidden rounded-xl border border-line bg-surface transition-all hover:-translate-y-0.5 hover:border-brand hover:shadow-lg">
      <div className="relative bg-ink/5 p-3">
        {/* full page, top 62% — enough to judge the layout without a huge card */}
        <div className="overflow-hidden rounded shadow-md">
          <ScaledPage crop={0.62}>
            <TemplateRenderer data={sample} template={t} />
          </ScaledPage>
        </div>

        {t.popular && (
          <span className="absolute right-4 top-4 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold text-white shadow">
            Popular
          </span>
        )}
        {t.photo && (
          <span className="absolute left-4 top-4 rounded-full bg-ink/75 px-2 py-0.5 text-[10px] font-semibold text-white shadow">
            Photo
          </span>
        )}

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 bg-ink/40 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            onClick={() => onPreview(t)}
            className="pointer-events-auto rounded-lg bg-white/95 px-3 py-2 text-[13px] font-semibold text-ink shadow hover:bg-white"
          >
            Preview
          </button>
          <Link
            href={`/tools/resume-builder/build?t=${t.slug}`}
            className="pointer-events-auto rounded-lg bg-brand px-3 py-2 text-[13px] font-semibold text-white shadow hover:bg-brand-deep"
          >
            Use this →
          </Link>
        </div>
      </div>

      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="font-display text-[15px] font-semibold">{t.name}</p>
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${TONE[ats.tone]}`}>
            {ats.tone === "warn" ? "Styled" : ats.tone === "good" ? "ATS ✓✓" : "ATS ✓"}
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-snug text-ink-mute">{t.blurb}</p>
        <div className="mt-2.5 flex gap-2 sm:hidden">
          <button onClick={() => onPreview(t)} className="flex-1 rounded-lg border border-line py-1.5 text-[12.5px] font-semibold text-ink">
            Preview
          </button>
          <Link href={`/tools/resume-builder/build?t=${t.slug}`} className="flex-1 rounded-lg bg-brand py-1.5 text-center text-[12.5px] font-semibold text-white">
            Use this
          </Link>
        </div>
      </div>
    </div>
  );
}

function PreviewModal({ t, sample, onClose }: { t: ResumeTemplate; sample: Sample; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const ats = ATS_LABEL[t.ats];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-6 w-full max-w-4xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl border border-line bg-surface p-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-display text-xl font-semibold">{t.name}</h3>
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${TONE[ats.tone]}`}>{ats.label}</span>
            </div>
            <p className="mt-1 text-[13px] text-ink-mute">
              {t.category} · {t.blurb}
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/tools/resume-builder/build?t=${t.slug}`}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
            >
              Use this template →
            </Link>
            <button onClick={onClose} className="rounded-lg border border-line px-3 py-2 text-sm font-semibold text-ink-mute hover:text-ink">
              Close
            </button>
          </div>
        </div>
        <div className="rounded-b-2xl border border-t-0 border-line bg-ink/10 p-4">
          <div className="mx-auto max-w-[720px] overflow-hidden rounded shadow-2xl">
            <ScaledPage>
              <TemplateRenderer data={sample} template={t} />
            </ScaledPage>
          </div>
          <p className="mt-3 text-center text-[12px] text-ink-faint">
            Sample content shown. Press Esc to close.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function TemplateGallery() {
  const [cat, setCat] = useState<Category | "All">("All");
  const [onlyAts, setOnlyAts] = useState(false);
  const [onlyPhoto, setOnlyPhoto] = useState(false);
  const [preview, setPreview] = useState<ResumeTemplate | null>(null);
  const sample = useMemo(() => sampleResume(), []);

  const shown = resumeTemplates.filter(
    (t) =>
      (cat === "All" || t.category === cat) &&
      (!onlyAts || t.ats !== "styled") &&
      (!onlyPhoto || t.photo),
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setCat("All")}
          className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
            cat === "All" ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute hover:text-ink"
          }`}
        >
          All {resumeTemplates.length}
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`rounded-lg border px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
              cat === c ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute hover:text-ink"
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-[13px] text-ink-mute">
          <input type="checkbox" checked={onlyAts} onChange={(e) => setOnlyAts(e.target.checked)} />
          Only parser-safe layouts
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink-mute">
          <input type="checkbox" checked={onlyPhoto} onChange={(e) => setOnlyPhoto(e.target.checked)} />
          With photo
        </label>
        <span className="text-[13px] text-ink-faint">{shown.length} shown</span>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((t) => (
          <Card key={t.slug} t={t} sample={sample} onPreview={setPreview} />
        ))}
      </div>

      {shown.length === 0 && <p className="mt-10 text-center text-ink-mute">No templates match those filters.</p>}

      {preview && <PreviewModal t={preview} sample={sample} onClose={() => setPreview(null)} />}
    </div>
  );
}
