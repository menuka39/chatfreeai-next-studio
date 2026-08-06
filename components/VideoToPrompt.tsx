"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { planScenes, SCENE_LENGTHS, MAX_SCENES } from "@/lib/scene-plan";

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
type Mode = "single" | "scenes";

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)}MB`;

interface Scene {
  n: string;
  range: string;
  seconds: string;
  prompt: string;
}

/**
 * Split the streamed reply into scenes.
 *
 * Runs on every chunk, so it has to cope with a half-written header and a
 * prompt that is still arriving — the last scene simply grows until the next
 * header appears. Anything before the first header is preamble the model was
 * asked not to write; if it writes some anyway, it is dropped rather than
 * shown as a scene.
 */
function parseScenes(text: string): Scene[] {
  const out: Scene[] = [];
  const re = /^###\s*SCENE\s*(\S+)\s*\|\s*([^|\n]+?)\s*\|\s*([^\n]*)$/gim;
  const heads: { i: number; len: number; m: RegExpExecArray }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) heads.push({ i: m.index, len: m[0].length, m });

  heads.forEach((h, k) => {
    const body = text.slice(h.i + h.len, k + 1 < heads.length ? heads[k + 1].i : undefined);
    out.push({
      n: h.m[1].replace(/[^\d]/g, "") || String(k + 1),
      range: h.m[2].trim(),
      seconds: h.m[3].trim(),
      prompt: body.trim(),
    });
  });
  return out;
}

export default function VideoToPrompt() {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [mode, setMode] = useState<Mode>("scenes");
  /** Seconds per scene. Every value here is renderable by some model. */
  const [sceneSeconds, setSceneSeconds] = useState(8);
  /** Read off the file itself — the server needs it to size the plan. */
  const [duration, setDuration] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [output, setOutput] = useState("");
  const [message, setMessage] = useState("");
  const [needsPlan, setNeedsPlan] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const fileRef = useRef<HTMLInputElement>(null);
  const outRef = useRef<HTMLElement>(null);

  const busy = phase === "uploading" || phase === "analysing";
  const scenes = mode === "scenes" ? parseScenes(output) : [];
  const totalSeconds = scenes.reduce((n, sc) => n + (parseInt(sc.seconds, 10) || 0), 0);
  // The SAME planner the route runs, so the count shown here is the count the
  // model is asked for. Computing it separately is how the screen came to
  // promise four scenes for an 18.4s video the server split into three.
  const plan = planScenes(duration, sceneSeconds);
  const plannedScenes = plan.length;
  const cappedBy = plannedScenes >= MAX_SCENES && duration / sceneSeconds > MAX_SCENES;

  function copy(text: string, id: string) {
    void navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1400);
  }

  function pick(f: File | null) {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPhase("error");
      setMessage(`That video is ${mb(f.size)}. The limit is 95MB — trim it or export at a lower bitrate.`);
      return;
    }
    setFile(f);
    setDuration(0);
    // The browser can read the duration without uploading anything, which is
    // what lets the scene count be shown before a byte is sent.
    const probe = document.createElement("video");
    probe.preload = "metadata";
    probe.onloadedmetadata = () => {
      if (Number.isFinite(probe.duration)) setDuration(probe.duration);
      URL.revokeObjectURL(probe.src);
    };
    probe.onerror = () => URL.revokeObjectURL(probe.src);
    probe.src = URL.createObjectURL(f);
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
        body: JSON.stringify({
          path: signed.path,
          mimeType: signed.mimeType,
          notes,
          ...(mode === "scenes" ? { sceneSeconds, duration } : {}),
        }),
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

      {/* ---- what to produce ---- */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <span className="mb-2 block text-sm font-medium text-white/80">Output</span>
          <div className="flex gap-2">
            {(
              [
                ["scenes", "Scene by scene"],
                ["single", "One prompt"],
              ] as [Mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                type="button"
                disabled={busy}
                onClick={() => setMode(m)}
                className={`flex-1 rounded-xl border px-3 py-2.5 text-sm transition disabled:opacity-40 ${
                  mode === m
                    ? "border-white/30 bg-white/10 font-medium text-white"
                    : "border-white/12 text-white/60 hover:bg-white/5"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: mode === "scenes" ? undefined : "none" }}>
          <label className="mb-2 block text-sm font-medium text-white/80">Seconds per scene</label>
          <div className="flex gap-2">
            {SCENE_LENGTHS.map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => setSceneSeconds(n)}
                className={`flex-1 rounded-xl border px-2 py-2.5 text-sm transition disabled:opacity-40 ${
                  sceneSeconds === n
                    ? "border-white/30 bg-white/10 font-medium text-white"
                    : "border-white/12 text-white/60 hover:bg-white/5"
                }`}
              >
                {n}s
              </button>
            ))}
          </div>
        </div>
      </div>

      <p className="-mt-1 text-xs text-white/40">
        {mode !== "scenes" ? (
          "One prompt describing the whole clip as a single shot."
        ) : plannedScenes ? (
          <>
            {Math.round(duration)}s video → <span className="text-white/70">{plannedScenes} scenes</span> of{" "}
            {sceneSeconds}s, each with its own self-contained prompt.
            {cappedBy && " Capped at 24 — pick a longer scene length to cover the whole video."}
          </>
        ) : (
          "Choose a video and this will show how many scenes the plan comes to."
        )}
      </p>

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
          placeholder="e.g. keep every shot handheld, mention the rain in each scene"
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
            : mode === "scenes"
              ? "Break into scenes"
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
              {scenes.length
                ? `${scenes.length} scenes · ${totalSeconds}s covered`
                : "Your video prompt"}
            </span>
            {output && (
              <button
                type="button"
                onClick={() => copy(scenes.length ? scenes.map((sc) => sc.prompt).join("\n\n") : output, "all")}
                className="rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
              >
                {copied === "all" ? "Copied" : scenes.length ? "Copy all" : "Copy"}
              </button>
            )}
          </div>
          {scenes.length ? (
            /*
             * One card per scene, because each is copied into a generator on
             * its own — that is the whole point of splitting the video up. A
             * single blob of text would have to be hand-separated first, and
             * the timestamps are what tell you which clip goes where when you
             * stitch them back together.
             */
            <div ref={outRef as React.RefObject<HTMLDivElement>} className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {scenes.map((sc, i) => (
                <div key={i} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/80">
                      Scene {sc.n}
                    </span>
                    <span className="font-mono text-xs text-white/40">{sc.range}</span>
                    {sc.seconds && (
                      <span className="font-mono text-xs text-white/40">· {sc.seconds}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => copy(sc.prompt, `s${i}`)}
                      className="ml-auto rounded-full border border-white/15 px-3 py-1 text-xs text-white/80 transition hover:bg-white/10"
                    >
                      {copied === `s${i}` ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/85">
                    {sc.prompt}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <pre
              ref={outRef as React.RefObject<HTMLPreElement>}
              className="max-h-[420px] overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-relaxed text-white/85"
            >
              {output || "Reading the footage…"}
            </pre>
          )}
        </div>
      )}

      {/*
        A short reply is the visible symptom of the model running out of output
        budget partway through, and it is worth naming: otherwise a plan that
        silently stops at scene 2 of 6 looks like the whole answer.
      */}
      {phase === "done" && scenes.length > 0 && scenes.length < plannedScenes && (
        <p className="rounded-xl border border-amber-400/25 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
          Only {scenes.length} of {plannedScenes} scenes came back. Try again, or pick a longer
          scene length so there are fewer of them.
        </p>
      )}

      <p className="text-xs text-white/35">
        Your video is uploaded only so the model can watch it once, and is deleted as soon as the
        prompt is written.
      </p>
    </div>
  );
}
