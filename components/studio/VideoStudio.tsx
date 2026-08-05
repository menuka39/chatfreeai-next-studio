"use client";

/**
 * AI Video Studio — the cfai-studio video interface on this app's API.
 *
 * The rail, the collapsible model list, the single spec popover (aspect ·
 * resolution · duration), the reference-frame slots, "Extend scene" and the
 * project cards with their per-clip strip are all the plugin's, class for
 * class. Underneath: /api/video start + poll, this app's credit pool, and
 * the browser-side ffmpeg join instead of the plugin's server merge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { videoModels, videoCredits, type VideoModelConfig } from "@/lib/video-models";
import { promptPresets, promptIdeas } from "@/lib/video-presets";
import { packages } from "@/lib/packages";
import { allClips, type StudioClip } from "@/lib/studio-projects";
import { extractLastFrame, proxiedVideo } from "@/lib/extract-frame";
import { migrateVideoHistory } from "@/lib/video-history";
import { downloadVideo, videoFilename } from "@/lib/download-video";
import type { ShowcaseClip } from "@/lib/showcase";
import { useStudioProjects, useStudioCredits, fmtCredits, greeting } from "./useStudio";
import "./video-studio.css";

type View = "generate" | "project" | "browser" | "guess" | "credits" | "payment";

const SHAPE: Record<string, string> = {
  "1:1": "avg-s-11",
  "16:9": "avg-s-169",
  "9:16": "avg-s-916",
  "4:3": "avg-s-43",
  "3:4": "avg-s-34",
  "3:2": "avg-s-32",
  "2:3": "avg-s-23",
  "21:9": "avg-s-219",
};

const SUGGEST = [
  "neon city at night, slow dolly shot",
  "drone flyover, mountain sunrise",
  "macro shot, coffee pouring, steam rising",
  "cinematic portrait, wind in hair",
  "retro 80s synthwave street",
  "ocean waves, golden hour, slow motion",
];

const MODEL_COLORS = ["#7c5cff", "#2bd4d9", "#ff8a3d", "#45d483", "#ff6b9d", "#ffb547"];

function modelColor(slug: string) {
  let h = 0;
  for (let i = 0; i < slug.length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return MODEL_COLORS[h % MODEL_COLORS.length];
}

function modelBadges(m: VideoModelConfig) {
  const out: { l: string; c: string }[] = [];
  if (m.tier === "fast") out.push({ l: "Fast", c: "fast" });
  if (m.tier === "premium") out.push({ l: "Pro", c: "pro" });
  if (m.audio) out.push({ l: "Audio", c: "audio" });
  const res = m.resolutions[m.resolutions.length - 1]?.label;
  if (res) out.push({ l: res, c: "res" });
  return out.slice(0, 3);
}

const IDEAS: { title: string; prompt: string }[] = [
  ...promptIdeas.map((p) => ({ title: p.split(",")[0].slice(0, 28), prompt: p })),
  ...promptPresets.flatMap((g) =>
    g.options.slice(0, 4).map((o) => ({ title: `${g.label} · ${o.label}`, prompt: o.append })),
  ),
];

/** Adaptive polling — the plugin's exact cadence. */
const POLL_STEPS = [2000, 2000, 3000, 3000, 4000, 5000, 6000, 8000];
const pollDelay = (attempt: number) => (attempt < POLL_STEPS.length ? POLL_STEPS[attempt] : 10000);

const fileToDataUrl = (f: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("read failed"));
    r.readAsDataURL(f);
  });

export default function VideoStudio({ showcase = [] }: { showcase?: ShowcaseClip[] }) {
  const [view, setView] = useState<View>("generate");
  const [modelId, setModelId] = useState(videoModels[0].id);
  const [aspect, setAspect] = useState(videoModels[0].aspectRatios[0]);
  const [resolution, setResolution] = useState(videoModels[0].resolutions[0].label);
  const [duration, setDuration] = useState(videoModels[0].defaultDuration);
  const [prompt, setPrompt] = useState("");
  const [firstFrame, setFirstFrame] = useState("");
  const [lastFrameImg, setLastFrameImg] = useState("");

  const [modelsOpen, setModelsOpen] = useState(false);
  const [specsOpen, setSpecsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progTxt, setProgTxt] = useState("Rendering…");
  const [status, setStatus] = useState<{ msg: string; type?: "error" | "success" } | null>(null);
  const [shown, setShown] = useState<
    | { url: string; download: string; raw: string; model: string; dur: number; aspect: string; res: string }
    | null
  >(null);
  /**
   * Native audio is opt-in and off by default.
   *
   * Providers charge a multiplier for synced sound (2× unless verified lower),
   * so sending it on every render of an audio-capable model would silently
   * double the bill. The plugin's audio line sits in exactly this spot as a
   * status note; here it doubles as the switch, so the price on the button is
   * always the price that gets charged.
   */
  const [generateAudio, setGenerateAudio] = useState(false);
  const [extendMode, setExtendMode] = useState(false);
  const [pendingFrame, setPendingFrame] = useState<string | null>(null);
  const [joining, setJoining] = useState<string | null>(null);

  const promptRef = useRef<HTMLTextAreaElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameInputRef = useRef<HTMLInputElement>(null);
  const frameSlotRef = useRef(0);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const deviceRef = useRef<string | null>(null);

  const { projects, currentId, setCurrentId, push, remove } = useStudioProjects("video", migrateVideoHistory);
  const { credits, refresh: refreshCredits } = useStudioCredits();

  const model = useMemo(() => videoModels.find((m) => m.id === modelId)!, [modelId]);
  const browserClips = useMemo(() => allClips(projects), [projects]);
  const baseCost = videoCredits(model, duration, resolution);
  const cost = generateAudio ? Math.ceil(baseCost * (model.audioSurcharge ?? 2)) : baseCost;

  useEffect(() => {
    let id = localStorage.getItem("cfai_device");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("cfai_device", id);
    }
    deviceRef.current = id;
  }, []);

  /**
   * The plugin's setupModel(): every spec snaps back to the new model's
   * default. Run from the picker rather than an effect so the switch is one
   * render, and so a model with no 1080p never briefly claims to have it.
   */
  const pickModel = useCallback((m: VideoModelConfig) => {
    setModelId(m.id);
    setAspect(m.aspectRatios.includes("16:9") ? "16:9" : m.aspectRatios[0]);
    const r = m.resolutions.find((x) => x.label === "1080p") ?? m.resolutions[m.resolutions.length - 1];
    setResolution(r.label);
    setDuration(m.durations.includes(8) ? 8 : m.durations[Math.floor(m.durations.length / 2)]);
    if (!m.imageToVideo) setFirstFrame("");
    if (!m.lastFrame) setLastFrameImg("");
    if (!m.audio) setGenerateAudio(false);
  }, []);

  useEffect(() => {
    const close = () => setSpecsOpen(false);
    document.addEventListener("click", close);
    return () => {
      document.removeEventListener("click", close);
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const goto = (v: View) => setView((cur) => (cur === v ? "generate" : v));

  const arCss = (a: string) => {
    const [w, h] = a.split(":").map((n) => parseFloat(n) || 1);
    return `${w} / ${h}`;
  };

  function loadVideo(
    url: string,
    specs: { model: string; dur: number; aspect: string; res: string },
    opts: { download?: string; raw?: string } = {},
  ) {
    setShown({
      url,
      download: opts.download ?? url,
      raw: opts.raw ?? url,
      ...specs,
    });
  }

  /* ---------------- generation ---------------- */
  function schedulePoll(jobId: string, refundToken: string, specs: {
    model: string;
    dur: number;
    aspect: string;
    res: string;
    prompt: string;
    isExtend: boolean;
    ts: number;
  }, attempt: number) {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = setTimeout(() => void poll(jobId, refundToken, specs, attempt), pollDelay(attempt));
  }

  async function poll(
    jobId: string,
    refundToken: string,
    specs: {
      model: string;
      dur: number;
      aspect: string;
      res: string;
      prompt: string;
      isExtend: boolean;
      ts: number;
    },
    attempt: number,
  ) {
    try {
      const res = await fetch(
        `/api/video?jobId=${encodeURIComponent(jobId)}&refundToken=${encodeURIComponent(refundToken)}`,
      );
      const st = await res.json();

      if (st.status === "completed" && st.videoUrl) {
        const served = st.videoToken && /^https?:/i.test(st.videoUrl)
          ? proxiedVideo(st.videoUrl, st.videoToken)
          : st.videoUrl;
        setBusy(false);
        setStatus(null);
        loadVideo(served, { model: specs.model, dur: specs.dur, aspect: specs.aspect, res: specs.res }, {
          download: served,
          raw: st.videoUrl,
        });
        const clip: StudioClip = {
          job_id: jobId,
          url: served,
          download: served,
          raw: st.videoUrl,
          model: specs.model,
          dur: specs.dur,
          aspect: specs.aspect,
          res: specs.res,
          prompt: specs.prompt,
          ts: specs.ts,
        };
        push(clip, specs.isExtend ? currentId : null);
        void refreshCredits();
        return;
      }

      if (st.status === "failed") {
        setBusy(false);
        setStatus({ msg: st.error ?? "Generation failed. Your credits were refunded.", type: "error" });
        void refreshCredits();
        return;
      }

      setProgTxt(`Rendering… (${st.status ?? "processing"})`);
      schedulePoll(jobId, refundToken, specs, attempt + 1);
    } catch {
      // a single failed poll is normal on a cold start — back off, keep going
      schedulePoll(jobId, refundToken, specs, Math.max(attempt, 4));
    }
  }

  async function startGenerate(frameUrl: string, endFrameUrl: string, isExtend: boolean) {
    if (!prompt.trim()) {
      setStatus({ msg: "Please enter a prompt.", type: "error" });
      return;
    }
    const specs = {
      model: model.id,
      dur: duration,
      aspect,
      res: resolution,
      prompt,
      isExtend,
      ts: Date.now(),
    };

    setStatus(null);
    setBusy(true);
    setShown(null);
    setProgTxt("Rendering…");

    try {
      const res = await fetch("/api/video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          prompt,
          duration,
          aspectRatio: aspect,
          resolution,
          ...(frameUrl ? { firstFrame: frameUrl } : {}),
          ...(endFrameUrl ? { lastFrame: endFrameUrl } : {}),
          ...(generateAudio ? { generateAudio: true } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setBusy(false);
        setStatus({ msg: data.message ?? "Generation failed.", type: "error" });
        if (data.error === "plan_required" || data.error === "package_exhausted") setView("payment");
        return;
      }
      schedulePoll(data.jobId, data.refundToken ?? "", specs, 0);
    } catch {
      setBusy(false);
      setStatus({ msg: "Connection lost. Please try again.", type: "error" });
    }
  }

  /* ---------------- extend ---------------- */
  async function beginExtend() {
    if (!shown || busy) return;
    setStatus({ msg: "Reading the last frame…" });
    try {
      const frame = await extractLastFrame(shown.url);
      setPendingFrame(frame);
      setExtendMode(true);
      setStatus(null);
      promptRef.current?.focus();
    } catch {
      setStatus({
        msg: "Could not read the video frame to extend (try Download instead).",
        type: "error",
      });
    }
  }

  function exitExtend() {
    setExtendMode(false);
    setPendingFrame(null);
  }

  /* ---------------- project actions ---------------- */
  async function downloadAllClips(projId: string) {
    const proj = projects.find((p) => p.id === projId);
    if (!proj) return;
    setJoining(projId);
    setStatus({ msg: "Packaging your clips…" });
    try {
      const { downloadAll } = await import("@/lib/download-video");
      const out = await downloadAll(
        proj.clips.map((c, i) => ({
          source: c.download ?? c.url,
          filename: videoFilename([proj.title, i + 1]),
        })),
        (i, n) => setStatus({ msg: `Saving clip ${i} of ${n}…` }),
      );
      setStatus(
        out.failed.length
          ? { msg: `${out.failed.length} clip(s) could not be saved — their links may have expired.`, type: "error" }
          : null,
      );
    } finally {
      setJoining(null);
    }
  }

  async function mergeProject(projId: string) {
    const proj = projects.find((p) => p.id === projId);
    if (!proj || proj.clips.length < 2) return;
    setJoining(projId);
    try {
      const { joinClips } = await import("@/lib/join-clips");
      const out = await joinClips(
        proj.clips.map((c, i) => ({ source: c.download ?? c.url, label: `Clip ${i + 1}` })),
        (msg, pct) => setStatus({ msg: pct != null ? `${msg} ${pct}%` : msg }),
      );
      const url = URL.createObjectURL(out.blob);
      const first = proj.clips[0];
      loadVideo(url, {
        model: first.model,
        dur: proj.clips.reduce((s, c) => s + (c.dur ?? 0), 0),
        aspect: first.aspect ?? "16:9",
        res: first.res ?? "",
      }, { download: url, raw: url });
      setView("generate");
      setStatus(null);
    } catch (err) {
      setStatus({ msg: err instanceof Error ? err.message : "Could not merge those clips.", type: "error" });
    } finally {
      setJoining(null);
    }
  }

  function newProject(switchToGenerate: boolean) {
    exitExtend();
    setCurrentId(null);
    setPrompt("");
    setFirstFrame("");
    setLastFrameImg("");
    setShown(null);
    setStatus(null);
    if (switchToGenerate) setView("generate");
    setTimeout(() => promptRef.current?.focus(), 50);
  }

  const openProject = useCallback(
    (projId: string, clip: StudioClip) => {
      setCurrentId(projId);
      loadVideo(
        clip.url,
        { model: clip.model, dur: clip.dur ?? 0, aspect: clip.aspect ?? "16:9", res: clip.res ?? "" },
        { download: clip.download, raw: clip.raw },
      );
      setView("generate");
    },
    [setCurrentId],
  );

  async function enhancePrompt() {
    if (!prompt.trim()) return;
    try {
      const res = await fetch("/api/video/enhance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt, deviceId: deviceRef.current }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStatus({ msg: json.message ?? "Could not rewrite that.", type: "error" });
        return;
      }
      setPrompt(json.prompt);
      setStatus(null);
    } catch {
      setStatus({ msg: "Connection lost. Try again.", type: "error" });
    }
  }

  async function onFrameFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const url = await fileToDataUrl(f);
    if (frameSlotRef.current === 0) setFirstFrame(url);
    else setLastFrameImg(url);
  }

  /* ---------------- render ---------------- */
  return (
    <div className="avg-wrap">
      <div className="avg-studio avg-app" data-single="">
        {/* ============ RAIL ============ */}
        <div className="avg-rail">
          {(
            [
              ["generate", "🎬", "Generate"],
              ["project", "◻", "Projects"],
              ["browser", "▦", "Browser"],
              ["guess", "✦", "Guess"],
              ["credits", "●", "Credits"],
              ["payment", "💳", "Payment"],
            ] as [View, string, string][]
          ).map(([v, ic, l]) => (
            <button
              key={v}
              type="button"
              className={`avg-rail-btn${view === v ? " active" : ""}`}
              data-view={v}
              onClick={() => goto(v)}
            >
              <span className="avg-rail-ic">{ic}</span>
              <span className="avg-rail-l">{l}</span>
            </button>
          ))}
        </div>

        <div className="avg-views">
          {/* ============ GENERATE ============ */}
          <div className="avg-view avg-view-generate" style={{ display: view === "generate" ? "" : "none" }}>
            <div className="avg-genwrap">
              {/* ---------- CONTROLS ---------- */}
              <div className="avg-panel avg-controls">
                <div className="avg-panel-head">
                  <div>
                    <span className="avg-eyebrow">Create</span>
                    <h3 className="avg-h">New video</h3>
                  </div>
                  <span className="avg-chip avg-balance" title="Monthly credits">
                    <span className="avg-chip-dot" />
                    <span className="avg-balance-val">
                      {credits?.signedIn && credits.cap > 0 ? fmtCredits(credits.remaining) : "—"}
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  className="avg-model-bar"
                  aria-expanded={modelsOpen}
                  onClick={() => setModelsOpen((o) => !o)}
                >
                  <span className="avg-model-bar-ic" style={{ ["--avg-mc" as string]: modelColor(model.id) }}>
                    {model.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="avg-model-bar-text">
                    <span className="avg-model-bar-name">{model.name}</span>
                    <span className="avg-model-bar-sub">{model.provider}</span>
                  </span>
                  <span className="avg-model-bar-chev">›</span>
                </button>

                <div className={`avg-models avg-models-collapsed${modelsOpen ? " avg-open" : ""}`}>
                  {videoModels.map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      className={`avg-mcard${m.id === modelId ? " active" : ""}`}
                      style={{ ["--avg-mc" as string]: modelColor(m.id) }}
                      onClick={() => {
                        pickModel(m);
                        setModelsOpen(false);
                      }}
                    >
                      <span className="avg-mcard-ic">{m.name.charAt(0).toUpperCase()}</span>
                      <span className="avg-mcard-body">
                        <span className="avg-mcard-name">{m.name}</span>
                        <span className="avg-mcard-sub">{m.provider}</span>
                        <span className="avg-mcard-badges">
                          {modelBadges(m).map((b) => (
                            <span key={b.l} className={`avg-mcard-badge avg-b-${b.c}`}>
                              {b.l}
                            </span>
                          ))}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>

                <div className="avg-extend-mode" style={{ display: extendMode ? "flex" : "none" }}>
                  <span className="avg-extend-mode-ico">↳</span>
                  <div className="avg-extend-mode-body">
                    <strong>Continuing your clip</strong>
                    <span>
                      Describe what happens next, then press Render. The new clip starts from your last frame.
                    </span>
                  </div>
                  <button type="button" className="avg-extend-cancel" aria-label="Cancel" onClick={exitExtend}>
                    ×
                  </button>
                </div>

                <div className="avg-frames">
                  <div className="avg-frames-label">
                    Reference frame <span className="avg-frames-hint">optional — image-to-video</span>
                  </div>
                  <div className="avg-frames-row">
                    <button
                      type="button"
                      className="avg-frameslot"
                      data-i={0}
                      style={firstFrame ? { backgroundImage: `url(${firstFrame})` } : undefined}
                      disabled={!model.imageToVideo}
                      onClick={() => {
                        if (firstFrame) return setFirstFrame("");
                        frameSlotRef.current = 0;
                        frameInputRef.current?.click();
                      }}
                    >
                      {!firstFrame && <span className="avg-frame-plus">+</span>}
                      <span className="avg-frame-tag">First</span>
                    </button>
                    <button
                      type="button"
                      className="avg-frameslot"
                      data-i={1}
                      style={lastFrameImg ? { backgroundImage: `url(${lastFrameImg})` } : undefined}
                      disabled={!model.lastFrame || !firstFrame}
                      onClick={() => {
                        if (lastFrameImg) return setLastFrameImg("");
                        frameSlotRef.current = 1;
                        frameInputRef.current?.click();
                      }}
                    >
                      <span className="avg-frame-tag">Last</span>
                    </button>
                  </div>
                  <input
                    ref={frameInputRef}
                    type="file"
                    className="avg-frame-input"
                    accept="image/png,image/jpeg,image/webp"
                    style={{ display: "none" }}
                    onChange={onFrameFile}
                  />
                </div>

                <div className="avg-prompt-wrap">
                  <textarea
                    ref={promptRef}
                    className="avg-prompt"
                    maxLength={1000}
                    rows={5}
                    placeholder="A neon city at night, cinematic, slow dolly shot…"
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                  />
                  <div className="avg-prompt-bar">
                    <button type="button" className="avg-enhance" onClick={enhancePrompt}>
                      ✦ Enhance
                    </button>
                    <span className="avg-charcount">
                      <span className="avg-cc">{prompt.length}</span>/1000
                    </span>
                  </div>
                </div>

                <div className="avg-suggest">
                  {SUGGEST.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="avg-sugg-chip"
                      onClick={() => {
                        setPrompt((v) => (v ? `${v}, ${s}` : s));
                        promptRef.current?.focus();
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                <div className="avg-ctrlwrap">
                  <div
                    className="avg-pop avg-pop-specs"
                    style={{ display: specsOpen ? "block" : "none" }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="avg-pop-title">Aspect Ratio</div>
                    <div className="avg-pills avg-aspect avg-aspect-grid">
                      {model.aspectRatios.map((a) => (
                        <button
                          key={a}
                          type="button"
                          className={`avg-asp${a === aspect ? " active" : ""}`}
                          data-aspect={a}
                          onClick={() => setAspect(a)}
                        >
                          <span className={`avg-shape ${SHAPE[a] ?? "avg-s-169"}`} />
                          <span className="avg-asp-l">{a}</span>
                        </button>
                      ))}
                    </div>

                    <div className="avg-pop-title">Resolution</div>
                    <div className="avg-pills avg-resolution avg-res-row">
                      {model.resolutions.map((r) => (
                        <button
                          key={r.label}
                          type="button"
                          className={`avg-pill${r.label === resolution ? " active" : ""}`}
                          onClick={() => setResolution(r.label)}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>

                    <div className="avg-pop-title">
                      Duration <span className="avg-durhint avg-sub-em">— {model.durations.join("/")}s</span>
                    </div>
                    <div className="avg-pills avg-duration avg-dur-row">
                      {model.durations.map((d) => (
                        <button
                          key={d}
                          type="button"
                          className={`avg-pill${d === duration ? " active" : ""}`}
                          onClick={() => setDuration(d)}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="avg-ctrlbar"
                    aria-expanded={specsOpen}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSpecsOpen((o) => !o);
                    }}
                  >
                    <span className={`avg-shape avg-ctrl-shape ${SHAPE[aspect] ?? "avg-s-169"}`} />
                    <span className="avg-ctrlbar-label">
                      {aspect} · {resolution} · {duration}s
                    </span>
                    <span className="avg-ctrlbar-chev">›</span>
                  </button>
                </div>

                <button
                  type="button"
                  className={`avg-btn avg-generate${extendMode ? " avg-cont" : ""}`}
                  disabled={busy || !prompt.trim()}
                  onClick={() => {
                    if (extendMode && pendingFrame) {
                      const frame = pendingFrame;
                      exitExtend();
                      void startGenerate(frame, "", true);
                    } else {
                      void startGenerate(firstFrame, lastFrameImg, false);
                    }
                  }}
                >
                  <span className="avg-gen-star">✦</span>
                  <span className="avg-gen-label">
                    {busy ? "Rendering…" : extendMode ? "Render continuation" : "Render video"}
                  </span>
                  <span className="avg-gen-badge">
                    <span className="avg-cost">{fmtCredits(cost)} credits</span>
                  </span>
                </button>

                <div className="avg-audionote">
                  {model.audio ? (
                    <button
                      type="button"
                      className={`avg-audio ${generateAudio ? "on" : "off"}`}
                      style={{ background: "none", border: 0, padding: 0, font: "inherit", cursor: "pointer" }}
                      onClick={() => setGenerateAudio((v) => !v)}
                    >
                      ● {generateAudio
                        ? `Audio on — ${model.audioSurcharge ?? 2}× cost`
                        : "Audio supported — tap to turn on"}
                    </button>
                  ) : (
                    <span className="avg-audio off">● No audio for this model</span>
                  )}
                </div>

                {credits && !credits.signedIn && (
                  <p className="avg-note avg-login-note">
                    <Link href="/login">Log in</Link> to render and use your credits.
                  </p>
                )}

                {status && (
                  <div className={`avg-status${status.type ? ` avg-${status.type}` : ""}`} style={{ display: "block" }}>
                    <span className="avg-status-bar" />
                    <span className="avg-status-txt">{status.msg}</span>
                  </div>
                )}
              </div>

              {/* ---------- OUTPUT ---------- */}
              <div className="avg-panel avg-output avg-main">
                <div className="avg-hero">
                  <h2 className="avg-hero-h">
                    <span className="avg-hero-accent">{greeting()}</span>, let&apos;s start creating
                  </h2>
                  <p className="avg-hero-sub">Create stunning AI videos in seconds — no editing skills needed.</p>
                </div>

                <div className="avg-output-area" style={{ display: shown || busy ? "block" : "none" }}>
                  <span className="avg-eyebrow">Output</span>
                  <h3 className="avg-h">Preview</h3>

                  <div className="avg-viewer" style={{ aspectRatio: arCss(shown?.aspect ?? aspect) }}>
                    <div className="avg-ph" style={{ display: !shown && !busy ? "" : "none" }}>
                      <span className="avg-ph-ico">🎬</span>
                      Your render appears here. Pick options and hit Render.
                    </div>
                    <video
                      ref={videoRef}
                      className="avg-video"
                      controls
                      playsInline
                      style={{ display: shown && !busy ? "block" : "none" }}
                      src={shown?.url}
                    />
                    <div className="avg-prog" style={{ display: busy ? "flex" : "none" }}>
                      <span className="avg-spinner" />
                      <span className="avg-prog-txt">{progTxt}</span>
                    </div>
                  </div>

                  <div className="avg-meta" style={{ display: shown && !busy ? "flex" : "none" }}>
                    <span>{videoModels.find((m) => m.id === shown?.model)?.name ?? shown?.model}</span>
                    <span>{shown?.dur}s</span>
                    <span>{shown?.aspect}</span>
                    <span>{shown?.res}</span>
                    {generateAudio && <span>audio</span>}
                  </div>

                  <div className="avg-viewer-actions" style={{ display: shown && !busy ? "flex" : "none" }}>
                    <button
                      type="button"
                      className="avg-btn avg-download"
                      onClick={() => {
                        if (!shown) return;
                        void downloadVideo(shown.download, videoFilename([shown.model, shown.dur])).catch((e) =>
                          setStatus({ msg: e instanceof Error ? e.message : "Download failed.", type: "error" }),
                        );
                      }}
                    >
                      ⤓ Download
                    </button>
                    <button
                      type="button"
                      className="avg-btn avg-extend"
                      title="Continue this scene — you choose what happens next"
                      onClick={beginExtend}
                    >
                      ↳ Extend scene
                    </button>
                    <button type="button" className="avg-btn avg-ghost avg-again" onClick={() => newProject(false)}>
                      ＋ New project
                    </button>
                  </div>
                  <p className="avg-actions-hint" style={{ display: shown && !busy ? "block" : "none" }}>
                    <strong>Extend scene</strong> adds a clip to this project — you type what happens next, then
                    Render. Find each project below to download or merge its clips.
                  </p>
                </div>

                {!shown && !busy && (
                  <div className="avg-insp">
                    <div className="avg-insp-head">
                      <h3>Get inspired</h3>
                      <p>Tap a clip to reuse its prompt</p>
                    </div>
                    <div className="avg-insp-grid">
                      {showcase.length
                        ? showcase.slice(0, 12).map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              className="avg-insp-card"
                              onClick={() => {
                                setPrompt(g.prompt);
                                promptRef.current?.focus();
                              }}
                            >
                              <span className="avg-insp-thumb">
                                <video muted loop playsInline preload="metadata" poster={g.posterUrl ?? undefined}>
                                  <source src={g.videoUrl} type="video/mp4" />
                                </video>
                              </span>
                              <span className="avg-insp-title">{g.modelName ?? "Showcase"}</span>
                              <span className="avg-insp-desc">
                                {g.prompt.split(/\s+/).slice(0, 14).join(" ")}…
                              </span>
                            </button>
                          ))
                        : IDEAS.slice(0, 12).map((g) => (
                            <button
                              key={g.prompt}
                              type="button"
                              className="avg-insp-card"
                              onClick={() => {
                                setPrompt(g.prompt);
                                promptRef.current?.focus();
                              }}
                            >
                              <span className="avg-insp-thumb" />
                              <span className="avg-insp-title">{g.title}</span>
                              <span className="avg-insp-desc">
                                {g.prompt.split(/\s+/).slice(0, 14).join(" ")}…
                              </span>
                            </button>
                          ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ============ PROJECTS ============ */}
          <div className="avg-view avg-view-project" style={{ display: view === "project" ? "" : "none" }}>
            <span className="avg-eyebrow">Library</span>
            <h3 className="avg-h avg-view-h">Your projects</h3>
            <p className="avg-view-sub">
              {credits?.signedIn ? "Synced to your account." : "Saved in this browser."}
            </p>
            <div className="avg-projects">
              <button type="button" className="avg-project avg-project-new" onClick={() => newProject(true)}>
                <span className="avg-frame-plus">+</span>
                <span className="avg-project-new-l">New project</span>
              </button>

              {!projects.length && (
                <div className="avg-empty-g">No projects yet — generate a video to start one.</div>
              )}

              {projects.map((proj) => (
                <div key={proj.id} className={`avg-project${proj.id === currentId ? " current" : ""}`}>
                  <div
                    className="avg-project-head"
                    style={{ cursor: "pointer" }}
                    onClick={() => proj.clips.length && openProject(proj.id, proj.clips[proj.clips.length - 1])}
                  >
                    <span className="avg-project-title">{proj.title}</span>
                    <span className="avg-project-meta">
                      {proj.clips.length} {proj.clips.length === 1 ? "clip" : "clips"}
                    </span>
                    <button
                      type="button"
                      className="avg-project-del"
                      title="Delete project"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!window.confirm("Delete this project? Your generated clips stay in your account history."))
                          return;
                        remove(proj.id);
                      }}
                    >
                      ×
                    </button>
                  </div>

                  <div className="avg-project-clips">
                    {proj.clips.map((clip, idx) => (
                      <div key={clip.job_id} className="avg-gthumb" onClick={() => openProject(proj.id, clip)}>
                        <video className="avg-gthumb-vid" muted playsInline preload="metadata" src={`${clip.url}#t=0.1`} />
                        <span className="avg-gnum">{idx + 1}</span>
                        <span className="avg-gd">{clip.dur}s</span>
                      </div>
                    ))}
                  </div>

                  <div className="avg-project-actions">
                    <button
                      type="button"
                      className="avg-btn avg-mini"
                      disabled={joining === proj.id}
                      onClick={() => void downloadAllClips(proj.id)}
                    >
                      ⤓ Download all
                    </button>
                    {proj.clips.length >= 2 && (
                      <button
                        type="button"
                        className="avg-btn avg-mini"
                        disabled={joining === proj.id}
                        onClick={() => void mergeProject(proj.id)}
                      >
                        ⛓ Merge into one
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ============ BROWSER ============ */}
          <div className="avg-view avg-view-browser" style={{ display: view === "browser" ? "" : "none" }}>
            <span className="avg-eyebrow">Library</span>
            <h3 className="avg-h avg-view-h">Browser</h3>
            <p className="avg-view-sub">All your generated clips.</p>
            <div className="avg-browsegrid">
              {browserClips.map((x) => (
                <button
                  key={x.clip.job_id}
                  type="button"
                  className="avg-asset"
                  title={x.clip.prompt}
                  onClick={() => openProject(x.proj.id, x.clip)}
                >
                  <video muted loop playsInline preload="metadata" src={`${x.clip.url}#t=0.1`} />
                </button>
              ))}
            </div>
            <p className="avg-browse-empty" style={{ display: browserClips.length ? "none" : "block" }}>
              No clips yet — generate your first video to see it here.
            </p>
          </div>

          {/* ============ GUESS ============ */}
          <div className="avg-view avg-view-guess" style={{ display: view === "guess" ? "" : "none" }}>
            <span className="avg-eyebrow">Guess</span>
            <h3 className="avg-h avg-view-h">Guess</h3>
            <p className="avg-view-sub">Tap a style to reuse its prompt.</p>
            <div className="avg-guessgrid">
              {IDEAS.slice(0, 16).map((g) => (
                <button
                  key={g.prompt}
                  type="button"
                  className="avg-guess-card"
                  onClick={() => {
                    setPrompt(g.prompt);
                    setView("generate");
                    setTimeout(() => promptRef.current?.focus(), 200);
                  }}
                >
                  <span className="avg-guess-thumb" />
                  <span className="avg-guess-title">{g.title}</span>
                </button>
              ))}
            </div>
          </div>

          {/* ============ CREDITS ============ */}
          <div className="avg-view avg-view-credits" style={{ display: view === "credits" ? "" : "none" }}>
            <div className="avg-box avg-mycredits">
              <div className="avg-sec-head">
                <span className="avg-eyebrow">Account</span>
                <div className="avg-head-row">
                  <h3 className="avg-title">Your credits</h3>
                  <span className="avg-chip">
                    <span className="avg-chip-dot" />
                    <span className="avg-balance-val">
                      {credits?.signedIn && credits.cap > 0 ? fmtCredits(credits.remaining) : "—"}
                    </span>
                  </span>
                </div>
              </div>
              <div className="avg-pad">
                <p className="avg-note">
                  {credits?.signedIn && credits.cap > 0
                    ? `${fmtCredits(credits.remaining)} of ${fmtCredits(credits.cap)} monthly credits left on ${credits.packageName}. They reset at the start of your next billing period.`
                    : "Video rendering is included in every paid package — one balance shared with chat, images and audio."}
                </p>
                {browserClips.length > 0 && (
                  <table className="avg-table">
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Model</th>
                        <th>Dur</th>
                        <th>Res</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {browserClips.slice(0, 15).map((x) => (
                        <tr key={x.clip.job_id}>
                          <td>{new Date(x.clip.ts).toLocaleString()}</td>
                          <td>{videoModels.find((m) => m.id === x.clip.model)?.name ?? x.clip.model}</td>
                          <td>{x.clip.dur}s</td>
                          <td>{x.clip.res}</td>
                          <td>
                            <a href={x.clip.download ?? x.clip.url} target="_blank" rel="noopener">
                              view
                            </a>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          {/* ============ PAYMENT ============ */}
          <div className="avg-view avg-view-payment" style={{ display: view === "payment" ? "" : "none" }}>
            <div className="avg-box avg-pricing">
              <div className="avg-sec-head">
                <span className="avg-eyebrow">Packages</span>
                <h3 className="avg-title">Choose a package</h3>
              </div>
              <div className="avg-pad">
                <table className="avg-table">
                  <thead>
                    <tr>
                      <th>Package</th>
                      <th>Monthly credits</th>
                      <th>Price</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {packages.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <strong>{p.name}</strong>
                        </td>
                        <td>{fmtCredits(p.credits)}</td>
                        <td>${p.price.toFixed(2)}</td>
                        <td>
                          <Link href="/pricing">Choose</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="avg-note">
                  A render costs its duration × the per-second rate of the resolution you pick. Failed renders are
                  refunded automatically.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
