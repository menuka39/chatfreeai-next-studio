"use client";

import { useRef, useState } from "react";
import Link from "next/link";

/**
 * Video to Prompt.
 *
 * Three steps, only two of which touch this app: the browser uploads straight
 * to storage with a signed URL (a serverless request body can't carry a video),
 * then asks the server to analyse it, then the server deletes it. The upload is
 * the slow part, so it gets its own progress — a spinner with no percentage on
 * a 90MB file reads as a hang.
 */

const ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-msvideo,video/mpeg,video/3gpp";
const MAX_BYTES = 95 * 1024 * 1024;

type Phase = "idle" | "uploading" | "analysing" | "done" | "error";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

export default function VideoToPrompt() {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState("");
  const [message, setMessage] = useState("");
  const [needsPlan, setNeedsPlan] = useState(false);
  const [copied, setCopied] = useState(false);

  const fileRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLPreElement>(null);

  const busy = phase === "uploading" || phase === "analysing";

  function pick(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPhase("error");
      setMessage(`That video is ${mb(f.size)}. The limit is 95MB — trim it or export at a lower bitrate.`);
      return;
    }
    setFile(f);
    setPhase("idle");
    setMessage("");
    setOutput("");
  }

  /** XHR rather than fetch: only XHR reports upload progress. */
  function put(url: string, body: File, type: string) {
    return new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", type);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () =>
        xhr.status >= 200 && xhr.status < 300
          ? resolve()
          : reject(new Error(`Upload failed (${xhr.status})`));
      xhr.onerror = () => reject(new Error("Upload failed"));
      xhr.send(body);
    });
  }

  async function run() {
    if (!file || busy) return;
    setPhase("uploading");
    setProgress(0);
    setOutput("");
    setMessage("");
    setNeedsPlan(false);

    try {
      const signRes = await fetch("/api/prompt/video/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mimeType: file.type, size: file.size }),
      });
      const signed = await signRes.json();
      if (!signRes.ok) {
        setPhase("error");
        setMessage(signed.message ?? "Could not start the upload.");
        setNeedsPlan(signed.error === "plan_required");
        return;
      }

      await put(signed.uploadUrl, file, file.type);

      setPhase("analysing");
      const res = await fetch("/api/prompt/video/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: signed.path, mimeType: signed.mimeType, notes }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ message: "Something went wrong." }));
        setPhase("error");
        setMessage(err.message ?? "Something went wrong.");
        setNeedsPlan(["plan_required", "package_exhausted"].includes(err.error));
        return;
      }

      const reader = res.body.getReader();
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
    } catch (err) {
      setPhase("error");
      setMessage(err instanceof Error ? err.message : "Connection lost. Please try again.");
    }
  }

  return (
    <div className="space-y-5">
      {/* ---- picker ---- */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-8 text-center"
      >
        <input
          ref={fileRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => {
            pick(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <p className="text-sm text-white/70">
          {file ? (
            <>
              <span className="font-medium text-white">{file.name}</span>
              <span className="text-white/45"> · {mb(file.size)}</span>
            </>
          ) : (
            "Drop a video here, or choose one below."
          )}
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="mt-4 rounded-full border border-white/15 px-5 py-2 text-sm font-medium text-white transition hover:bg-white/10 disabled:opacity-40"
        >
          {file ? "Choose a different video" : "Choose video"}
        </button>
        <p className="mt-3 text-xs text-white/40">MP4, MOV, WebM and similar · up to 95MB</p>
      </div>

      {/* ---- optional direction ---- */}
      <div>
        <label htmlFor="v2p-notes" className="mb-2 block text-sm font-medium text-white/80">
          Anything to emphasise? <span className="font-normal text-white/40">optional</span>
        </label>
        <input
          id="v2p-notes"
          type="text"
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="e.g. focus on the camera movement, keep it under 60 words"
          className="w-full rounded-xl border border-white/12 bg-white/[0.03] px-4 py-3 text-sm text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none"
        />
      </div>

      <button
        type="button"
        disabled={!file || busy}
        onClick={run}
        className="w-full rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:opacity-40"
      >
        {phase === "uploading"
          ? `Uploading… ${progress}%`
          : phase === "analysing"
            ? "Watching the video…"
            : "Write the prompt"}
      </button>

      {phase === "uploading" && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-white/70 transition-[width] duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {message && (
        <p className="rounded-xl border border-red-400/25 bg-red-400/10 px-4 py-3 text-sm text-red-200">
          {message}
          {needsPlan && (
            <>
              {" "}
              <Link href="/pricing" className="underline underline-offset-2">
                See packages
              </Link>
            </>
          )}
        </p>
      )}

      {(output || phase === "analysing") && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-white/45">
              Your video prompt
            </span>
            {output && (
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(output);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                }}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
              >
                {copied ? "Copied" : "Copy"}
              </button>
            )}
          </div>
          <pre
            ref={outRef}
            className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-white/85"
          >
            {output || "Reading the footage…"}
          </pre>
        </div>
      )}

      <p className="text-xs text-white/35">
        Your video is uploaded only so the model can watch it once, and is deleted as soon as the
        prompt is written.
      </p>
    </div>
  );
}
