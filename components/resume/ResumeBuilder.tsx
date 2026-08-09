"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ResumeEditor from "./ResumeEditor";
import TemplateRenderer from "./TemplateRenderer";
import ScaledPage from "./ScaledPage";
import type { PaperSize } from "@/lib/resume-pdf";
import { PAPER_OPTIONS } from "@/lib/resume-paper";
import AtsPanel from "./AtsPanel";
import { type ResumeData, blankResume, sampleResume, ACCENTS, atsChecks, resumeToText, PHOTO_PLACEHOLDER } from "@/lib/resume";
import { resumeTemplates, templateBySlug, ATS_LABEL, type ResumeTemplate } from "@/lib/resume-templates";

const STORAGE_KEY = "cfai_resume_v2";
const MAX_PHOTO_BYTES = 400_000;

function deviceId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem("cfai_device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cfai_device", id);
  }
  return id;
}

type Tab = "edit" | "preview";

export default function ResumeBuilder({ initialTemplate }: { initialTemplate?: string }) {
  const [data, setData] = useState<ResumeData>(blankResume);
  const [templateSlug, setTemplateSlug] = useState<string>(initialTemplate ?? "atlas");
  const [accent, setAccent] = useState<string>("");
  const [targetRole, setTargetRole] = useState("");
  const [tab, setTab] = useState<Tab>("edit");
  const [loaded, setLoaded] = useState(false);
  const [zoom, setZoom] = useState(0.62);
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [assistError, setAssistError] = useState<string | null>(null);
  const [needsPlan, setNeedsPlan] = useState(false);
  const [entitlement, setEntitlement] = useState<{ label: string; dailyAssists: number; paid: boolean } | null>(null);
  const [assistsLeft, setAssistsLeft] = useState<number | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  // the actual full-size render node, captured for PDF — kept separate from
  // the zoomed on-screen wrapper so export is never affected by the zoom level
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [paper, setPaper] = useState<PaperSize>("a4");
  const [atsMode, setAtsMode] = useState(false);
  const [showPdfMenu, setShowPdfMenu] = useState(false);

  const template: ResumeTemplate = templateBySlug(templateSlug) ?? resumeTemplates[0];
  // only these layouts actually risk a parser reading content out of order,
  // so the ATS-safe toggle explains itself differently for the rest
  const isMultiColumn = ["sidebar-left", "sidebar-right", "sidebar-wide", "two-col"].includes(template.layout);
  const sample = useMemo(() => sampleResume(), []);

  // restore draft; a template in the URL always wins over the saved one
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // Reading the browser's own state on mount — localStorage or the URL. That
        // has to happen after mount or the server's HTML and the client's first
        // render disagree, and this rule can't tell a one-shot external read
        // from a render loop.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setData(saved.data ?? blankResume());
        setTemplateSlug(initialTemplate ?? saved.templateSlug ?? "atlas");
        setAccent(saved.accent ?? "");
        setTargetRole(saved.targetRole ?? "");
      } else {
        setData(sampleResume());
      }
    } catch {
      setData(sampleResume());
    }
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // what this visitor gets — shown plainly so nobody hits a surprise wall
  useEffect(() => {
    fetch("/api/resume/assist")
      .then((r) => r.json())
      .then((d) => {
        setEntitlement(d);
        setAssistsLeft(d.dailyAssists);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!loaded) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, templateSlug, accent, targetRole }));
      } catch {
        /* quota exceeded — a large photo. The resume still works in-session. */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data, templateSlug, accent, targetRole, loaded]);

  const checks = atsChecks(data, template.ats !== "styled");

  async function callAssist(action: "summary" | "bullet" | "skills" | "headline", notes: string): Promise<string | null> {
    setAssistError(null);
    setNeedsPlan(false);
    try {
      const res = await fetch("/api/resume/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, targetRole, notes, deviceId: deviceId() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setAssistError(json.message ?? "Could not generate that.");
        setNeedsPlan(Boolean(json.upgrade) || json.error === "model_locked");
        if (typeof json.dailyAssists === "number") setAssistsLeft(0);
        return null;
      }
      if (typeof json.remaining === "number") setAssistsLeft(json.remaining);
      return json.text ?? null;
    } catch {
      setAssistError("Connection lost. Try again.");
      return null;
    }
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_PHOTO_BYTES * 6) {
      setAssistError("That image is very large. Please use one under ~2MB.");
      return;
    }
    // downscale to a square thumbnail so the saved draft stays small
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 320;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d")!;
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        setData((d) => ({ ...d, photo: canvas.toDataURL("image/jpeg", 0.82) }));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  }

  const download = (content: string, filename: string, type: string) => {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  async function downloadPdf() {
    if (pdfBusy) return;
    setPdfBusy(true);
    setPdfError(null);
    setShowPdfMenu(false);
    try {
      const base = (data.fullName || "resume").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
      /*
       * jsPDF and html2canvas together are the heaviest thing this page could
       * pull in, and most visitors are here to write a CV, not to export one
       * — many never press the button at all. Loading them on the click keeps
       * that weight off everyone else's first paint.
       */
      const { resumeToPdf } = await import("@/lib/resume-pdf");
      await resumeToPdf(data, template, accent || template.accent, {
        paper,
        atsMode,
        filename: `${base || "resume"}-${template.slug}.pdf`,
      });
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : "Could not create the PDF. Please try again.");
    } finally {
      setPdfBusy(false);
    }
  }

  const ats = ATS_LABEL[template.ats];

  return (
    <div>
      <style jsx global>{`
        .resume-page { width: 794px; min-height: 1123px; margin: 0 auto; }
      `}</style>

      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface p-4">
        <div className="min-w-[200px] flex-1">
          <label className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Target role</label>
          <input
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g. Senior Frontend Engineer"
            className="mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-faint focus:border-brand"
          />
        </div>

        <button
          onClick={() => setSwitcherOpen((v) => !v)}
          className="rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-ink hover:border-brand"
        >
          Template: <span className="text-brand">{template.name}</span> ▾
        </button>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAccent("")}
            title="Template default"
            className={`h-6 w-6 rounded-full border-2 ${!accent ? "scale-110 border-ink" : "border-transparent"}`}
            style={{ backgroundColor: template.accent }}
          />
          {ACCENTS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAccent(a.value)}
              title={a.label}
              className={`h-6 w-6 rounded-full border-2 transition-transform ${accent === a.value ? "scale-110 border-ink" : "border-transparent"}`}
              style={{ backgroundColor: a.value }}
            />
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={() => download(resumeToText(data), "resume.txt", "text/plain;charset=utf-8")} className="rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:border-brand">
            .txt
          </button>
          <button onClick={() => download(JSON.stringify({ data, templateSlug, accent, targetRole }, null, 2), "resume.json", "application/json")} className="rounded-lg border border-line px-3 py-2 text-[13px] font-semibold text-ink hover:border-brand">
            .json
          </button>
          <div className="relative">
            <button
              onClick={() => setShowPdfMenu((v) => !v)}
              disabled={pdfBusy}
              className="rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep disabled:opacity-60"
            >
              {pdfBusy ? "Creating PDF…" : "Download PDF ▾"}
            </button>
            {showPdfMenu && !pdfBusy && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowPdfMenu(false)} />
                <div className="absolute right-0 z-20 mt-1.5 w-64 rounded-xl border border-line bg-surface p-3 shadow-lg">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Paper size</p>
                <div className="mt-1.5 flex gap-1.5">
                  {PAPER_OPTIONS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPaper(p.id)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-[12px] font-semibold transition-colors ${
                        paper === p.id ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute hover:text-ink"
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Layout</p>
                <div className="mt-1.5 space-y-1.5">
                  <button
                    onClick={() => setAtsMode(false)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      !atsMode ? "border-brand bg-brand-tint" : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <span className="block text-[12.5px] font-semibold text-ink">Template design</span>
                    <span className="block text-[11px] text-ink-mute">Keeps {template.name}&apos;s layout and colour</span>
                  </button>
                  <button
                    onClick={() => setAtsMode(true)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                      atsMode ? "border-brand bg-brand-tint" : "border-line hover:border-ink-faint"
                    }`}
                  >
                    <span className="block text-[12.5px] font-semibold text-ink">Maximum ATS safety</span>
                    <span className="block text-[11px] text-ink-mute">
                      {isMultiColumn
                        ? "Flattens the columns to one — safest for large employer portals"
                        : "Already single column; this only strips remaining styling"}
                    </span>
                  </button>
                </div>

                  <button
                    onClick={downloadPdf}
                    className="mt-3 w-full rounded-lg bg-brand px-4 py-2 text-[13px] font-semibold text-white hover:bg-brand-deep"
                  >
                    Download PDF
                  </button>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-ink-faint">
                    Real selectable text, not a picture — so ATS software can actually read it.
                  </p>
                  {pdfError && (
                    <p className="mt-2 text-[11.5px] font-medium text-warn">{pdfError}</p>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* template switcher */}
      {switcherOpen && (
        <div className="mt-3 rounded-2xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink-mute">Switch template — your content is kept</p>
            <Link href="/tools/resume-builder" className="text-[13px] font-semibold text-brand hover:text-brand-deep">
              See full gallery →
            </Link>
          </div>
          <div className="mt-3 grid max-h-[420px] gap-2.5 overflow-y-auto sm:grid-cols-4 lg:grid-cols-7">
            {resumeTemplates.map((t) => (
              <button
                key={t.slug}
                onClick={() => {
                  setTemplateSlug(t.slug);
                  setSwitcherOpen(false);
                }}
                className={`overflow-hidden rounded-lg border text-left transition-colors ${
                  t.slug === templateSlug ? "border-brand ring-1 ring-brand" : "border-line hover:border-ink-faint"
                }`}
              >
                <div className="overflow-hidden bg-ink/5 p-1">
                  <div className="pointer-events-none overflow-hidden rounded-sm">
                    <ScaledPage crop={0.55}>
                      <TemplateRenderer data={sample} template={t} />
                    </ScaledPage>
                  </div>
                </div>
                <p className="px-2 py-1 text-[11.5px] font-semibold">{t.name}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {entitlement && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-canvas px-4 py-2.5">
          <p className="text-[12.5px] text-ink-mute">
            <span className="font-semibold text-ink">{entitlement.label}</span>
            {" · "}Unlimited resumes, templates and PDF downloads
            {assistsLeft !== null && (
              <>
                {" · "}
                <span className={assistsLeft === 0 ? "font-semibold text-warn" : ""}>
                  {assistsLeft} of {entitlement.dailyAssists} AI suggestions left today
                </span>
              </>
            )}
          </p>
          {!entitlement.paid && (
            <Link href="/pricing#resume" className="text-[12.5px] font-semibold text-brand hover:text-brand-deep">
              More AI suggestions →
            </Link>
          )}
        </div>
      )}

      {assistError && (
        <div className="mt-3 rounded-xl border border-warn-line bg-warn-tint p-4 text-sm">
          <p className="font-semibold text-ink">{assistError}</p>
          {needsPlan && (
            <Link href="/pricing#resume" className="mt-2 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep">
              See the Resume Pass
            </Link>
          )}
        </div>
      )}

      {/* mobile tabs */}
      <div className="mt-4 flex gap-2 lg:hidden">
        {(["edit", "preview"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-lg border px-4 py-2 text-sm font-semibold capitalize ${
              tab === t ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,430px)_1fr]">
        <div className={`${tab === "edit" ? "block" : "hidden"} lg:block`}>
          <div className="card-shadow rounded-2xl border border-line bg-surface p-5">
            {template.photo && (
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-line bg-canvas p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={data.photo || PHOTO_PLACEHOLDER}
                  alt=""
                  className="h-14 w-14 rounded-full object-cover"
                />
                <div className="flex-1">
                  <p className="text-[13px] font-semibold">Portrait</p>
                  <p className="text-[11.5px] text-ink-faint">
                    {data.photo
                      ? "Cropped square. Stored in this browser only — never uploaded to us."
                      : "This template shows a photo. Upload one to replace the placeholder."}
                  </p>
                </div>
                <input ref={photoInput} type="file" accept="image/*" onChange={onPhoto} className="hidden" />
                <button onClick={() => photoInput.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-brand">
                  {data.photo ? "Change" : "Upload"}
                </button>
                {data.photo && (
                  <button onClick={() => setData((d) => ({ ...d, photo: "" }))} className="text-[12px] text-ink-faint hover:text-warn">
                    ✕
                  </button>
                )}
              </div>
            )}
            <ResumeEditor data={data} onChange={setData} targetRole={targetRole} onAssist={callAssist} />
          </div>
          <div className="mt-4">
            <AtsPanel checks={checks} />
          </div>
        </div>

        <div className={`${tab === "preview" ? "block" : "hidden"} lg:block`}>
          <div className="sticky top-4">
            <div className="mb-2 flex items-center justify-between">
              <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${ats.tone === "good" ? "bg-mint-tint text-mint" : ats.tone === "ok" ? "bg-canvas text-ink-mute" : "bg-warn-tint text-warn"}`}>
                {ats.label}
              </span>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setZoom((z) => Math.max(0.35, z - 0.1))} className="rounded border border-line px-2 text-[13px] text-ink-mute hover:text-ink">−</button>
                <span className="w-10 text-center text-[12px] text-ink-faint">{Math.round(zoom * 100)}%</span>
                <button onClick={() => setZoom((z) => Math.min(1, z + 0.1))} className="rounded border border-line px-2 text-[13px] text-ink-mute hover:text-ink">+</button>
              </div>
            </div>
            <div className="overflow-auto rounded-2xl border border-line bg-ink/5 p-4" style={{ maxHeight: "calc(100vh - 140px)" }}>
              {/* Outer box reserves the SCALED footprint; the inner node stays
                  full A4 size and is transformed down. Sizing the wrapper to the
                  scaled dimensions is what stops the squish/huge-frame bug. */}
              <div
                className="mx-auto"
                style={{ width: 794 * zoom, height: 1123 * zoom }}
              >
                <div
                  className="origin-top-left shadow-2xl"
                  style={{ transform: `scale(${zoom})`, width: 794 }}
                >
                  <div>
                    <TemplateRenderer data={data} template={template} accent={accent || undefined} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
