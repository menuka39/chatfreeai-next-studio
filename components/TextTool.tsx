"use client";

import { extractDocText } from "@/lib/doc-text";
import Markdown from "@/components/chat/Markdown";

import { useRef, useState } from "react";
import Link from "next/link";
import { modelById } from "@/lib/models";
import type { TextToolClient } from "@/lib/text-tools";

type Phase = "idle" | "running" | "done" | "error";

function deviceId() {
  if (typeof window === "undefined") return null;
  let id = localStorage.getItem("cfai_device");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cfai_device", id);
  }
  return id;
}

export default function TextTool({ tool }: { tool: TextToolClient }) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      tool.fields.map((f) => [f.id, f.type === "select" ? (f.options?.[0] ?? "") : ""]),
    ),
  );
  /** which field is currently reading files, and anything that went wrong */
  const [reading, setReading] = useState<string | null>(null);
  const [readError, setReadError] = useState<Record<string, string>>({});

  /**
   * Append uploaded documents to a textarea rather than replacing it.
   *
   * Screening is usually several candidates at once, so files are separated
   * with the same `---` marker the field already documents, and dropping a
   * second batch adds to the first instead of wiping it.
   */
  async function addFiles(fieldId: string, files: FileList, maxLength?: number) {
    setReading(fieldId);
    setReadError((e) => ({ ...e, [fieldId]: "" }));
    const chunks: string[] = [];
    const failed: string[] = [];
    for (const file of Array.from(files)) {
      try {
        const doc = await extractDocText(file);
        chunks.push(`### ${doc.name}\n${doc.text}`);
      } catch (err) {
        failed.push(err instanceof Error ? err.message : `Could not read ${file.name}`);
      }
    }
    if (chunks.length) {
      setValues((v) => {
        const existing = (v[fieldId] ?? "").trim();
        let next = existing
          ? `${existing}\n\n---\n\n${chunks.join("\n\n---\n\n")}`
          : chunks.join("\n\n---\n\n");
        // respect the field's own limit rather than silently overflowing it
        if (maxLength && next.length > maxLength) next = next.slice(0, maxLength);
        return { ...v, [fieldId]: next };
      });
    }
    if (failed.length) setReadError((e) => ({ ...e, [fieldId]: failed.join(" · ") }));
    setReading(null);
  }

  const [modelId, setModelId] = useState(tool.modelChoices[0]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [output, setOutput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [needsPlan, setNeedsPlan] = useState(false);
  const [badFields, setBadFields] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const outRef = useRef<HTMLDivElement>(null);

  const set = (id: string, v: string) => setValues((prev) => ({ ...prev, [id]: v }));

  async function run() {
    if (phase === "running") return;
    setPhase("running");
    setOutput("");
    setMessage(null);
    setNeedsPlan(false);
    setBadFields([]);

    try {
      const res = await fetch("/api/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: tool.slug, modelId, values, deviceId: deviceId() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ message: "Something went wrong." }));
        setPhase("error");
        setMessage(err.message ?? "Something went wrong.");
        setNeedsPlan(["model_locked", "daily_limit_reached", "package_exhausted"].includes(err.error));
        setBadFields(err.fields ?? []);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const json = JSON.parse(line.slice(6).trim());
            if (json.delta) {
              setOutput((prev) => prev + json.delta);
              outRef.current?.scrollTo({ top: outRef.current.scrollHeight });
            }
          } catch {
            /* partial frame */
          }
        }
      }
      setPhase("done");
    } catch {
      setPhase("error");
      setMessage("Connection lost. Please try again.");
    }
  }

  async function copy() {
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function download() {
    const blob = new Blob([output], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tool.slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Print the report as it appears on screen, so "Save as PDF" produces the
   * formatted document rather than raw markdown.
   *
   * Built by cloning the already-rendered output into a hidden iframe with
   * print styles, rather than re-deriving a PDF from the markdown source.
   * Whatever the reader can see is exactly what comes out — headings,
   * tables, emphasis and all — with no second renderer to drift from the
   * first one.
   */
  function printReport() {
    const node = outRef.current?.querySelector(".cfai-md");
    if (!node) return;

    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) {
      document.body.removeChild(frame);
      return;
    }

    // Printed on white with dark text regardless of the site theme — a page
    // that prints its dark background wastes ink and reads badly on paper.
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${tool.name}</title>
<style>
  @page { margin: 18mm; }
  body { font: 13.5px/1.65 -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; background: #fff; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  h2 { font-size: 16px; margin: 18px 0 6px; }
  h3 { font-size: 14px; margin: 14px 0 4px; }
  p, li { margin: 0 0 6px; }
  ul, ol { padding-left: 20px; margin: 0 0 10px; }
  strong { font-weight: 600; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 12px; }
  th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #f4f4f5; font-weight: 600; }
  /* keep a candidate's block together rather than splitting it mid-section */
  h2, h3 { break-after: avoid; }
  table, li { break-inside: avoid; }
  /* the renderer also emits these — unstyled they print as plain text and
     the report loses the distinctions it was written with */
  a { color: #1a4fd6; text-decoration: underline; }
  code { font: 12px ui-monospace, Menlo, Consolas, monospace; background: #f4f4f5; padding: 1px 4px; border-radius: 3px; }
  pre { background: #f4f4f5; padding: 8px 10px; border-radius: 4px; overflow-x: auto; }
  pre code { background: none; padding: 0; }
  blockquote { margin: 8px 0; padding-left: 12px; border-left: 3px solid #ddd; color: #444; }
  hr { border: 0; border-top: 1px solid #ddd; margin: 14px 0; }
  em { font-style: italic; }
  .meta { color: #666; font-size: 11px; margin-bottom: 14px; }
</style></head><body>
  <h1>${tool.name}</h1>
  <p class="meta">${new Date().toLocaleString()}</p>
  ${node.innerHTML.replace(/ class="[^"]*"/g, "")}
</body></html>`);
    doc.close();

    // Print after close rather than on `load`. A document built with
    // document.write has usually already fired load by this point, so an
    // onload handler assigned here never runs and the dialog never opens.
    // A frame gives layout time to settle so the first page isn't blank.
    requestAnimationFrame(() => {
      setTimeout(() => {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
        // leave it long enough for the print dialog to take its snapshot
        setTimeout(() => frame.remove(), 60_000);
      }, 250);
    });
  }

  const canRun = tool.fields.every((f) => !f.required || String(values[f.id] ?? "").trim());

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
      {/* Inputs */}
      <div className="card-shadow rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="space-y-4">
          {tool.fields.map((f) => {
            const bad = badFields.includes(f.id);
            const base = `mt-1.5 w-full rounded-xl border bg-canvas px-3.5 py-2.5 text-[15px] outline-none placeholder:text-ink-faint focus:border-brand ${
              bad ? "border-warn" : "border-line"
            }`;
            return (
              <div key={f.id}>
                <label htmlFor={`f-${f.id}`} className="text-sm font-semibold">
                  {f.label}
                  {f.required && <span className="ml-1 text-ink-faint">*</span>}
                </label>
                {f.type === "textarea" ? (
                  <textarea
                    id={`f-${f.id}`}
                    rows={f.rows ?? 4}
                    maxLength={f.maxLength}
                    value={values[f.id] ?? ""}
                    onChange={(e) => set(f.id, e.target.value)}
                    placeholder={f.placeholder}
                    className={`${base} resize-y`}
                  />
                ) : f.type === "select" ? (
                  <select
                    id={`f-${f.id}`}
                    value={values[f.id] ?? ""}
                    onChange={(e) => set(f.id, e.target.value)}
                    className={base}
                  >
                    {f.options?.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    id={`f-${f.id}`}
                    type="text"
                    maxLength={f.maxLength}
                    value={values[f.id] ?? ""}
                    onChange={(e) => set(f.id, e.target.value)}
                    placeholder={f.placeholder}
                    className={base}
                  />
                )}
                {f.type === "textarea" && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <label className="cursor-pointer rounded-lg border border-line px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-brand">
                      {reading === f.id ? "Reading…" : "Upload PDF or text"}
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.txt,.md,.markdown,.rtf,.csv"
                        className="hidden"
                        disabled={reading !== null}
                        onChange={(e) => {
                          if (e.target.files?.length) addFiles(f.id, e.target.files, f.maxLength);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <span className="text-[11.5px] text-ink-faint">
                      Read in your browser — the file itself is never uploaded.
                    </span>
                  </div>
                )}
                {readError[f.id] && (
                  <p className="mt-1 text-[12px] font-semibold text-warn">{readError[f.id]}</p>
                )}
                {f.help && <p className="mt-1 text-[12px] text-ink-faint">{f.help}</p>}
                {f.maxLength && f.type === "textarea" && (
                  <p className="mt-1 text-right text-[11px] text-ink-faint">
                    {(values[f.id] ?? "").length.toLocaleString()} / {f.maxLength.toLocaleString()}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-5 border-t border-line pt-4">
          <label htmlFor="tool-model" className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">
            Model
          </label>
          <select
            id="tool-model"
            value={modelId}
            onChange={(e) => setModelId(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line bg-canvas px-3.5 py-2.5 text-[15px] outline-none focus:border-brand"
          >
            {tool.modelChoices.map((id) => {
              const m = modelById(id);
              if (!m) return null;
              return (
                <option key={id} value={id}>
                  {m.brand} {m.version}
                  {m.minPlan !== "free" ? " — paid plans" : " — free"}
                </option>
              );
            })}
          </select>
          <p className="mt-2 text-[12px] text-ink-faint">
            Charged from the same credits as chat — longer inputs and outputs cost more.
          </p>
        </div>

        <button
          onClick={run}
          disabled={!canRun || phase === "running"}
          className="mt-5 w-full rounded-xl bg-brand px-6 py-3.5 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
        >
          {phase === "running" ? "Working…" : `Generate ${tool.outputLabel.toLowerCase()}`}
        </button>

        {message && (
          <div className="mt-4 rounded-xl border border-warn-line bg-warn-tint p-4 text-sm">
            <p className="font-semibold text-ink">{message}</p>
            {needsPlan && (
              <Link
                href="/pricing"
                className="mt-3 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
              >
                View packages
              </Link>
            )}
          </div>
        )}
      </div>

      {/* Output */}
      <div className="card-shadow flex min-h-[420px] flex-col rounded-2xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold">{tool.outputLabel}</h2>
          {output && (
            <div className="flex gap-2">
              <button
                onClick={copy}
                className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-mute hover:border-brand hover:text-ink"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              {tool.downloadable && (
                <>
                {/* PDF first: a report that gets emailed or filed is wanted
                    far more often than the markdown source */}
                <button
                  onClick={printReport}
                  className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink hover:border-brand"
                >
                  Save as PDF
                </button>
                <button
                  onClick={download}
                  className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold text-ink-mute hover:border-brand hover:text-ink"
                >
                  Download .md
                </button>
                </>
              )}
            </div>
          )}
        </div>

        <div ref={outRef} className="mt-4 flex-1 overflow-y-auto">
          {output ? (
            <div className="cfai-md text-[14.5px] leading-relaxed text-ink">
              <Markdown content={output} streaming={phase === "running"} />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-center">
              <p className="max-w-xs text-sm text-ink-mute">
                {phase === "running"
                  ? "Working on it…"
                  : `Fill in the fields and your ${tool.outputLabel.toLowerCase()} appears here.`}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
