"use client";

/**
 * AI Audio Studio — the cfai-studio audio interface on this app's API.
 *
 * Kept exactly: the two-panel layout, the model dropdown with its avatars and
 * tags, Simple/Custom modes, the genre chips and style presets, the
 * instrumental switch, the format radios, the showcase tiles, the All/Liked
 * library and the fixed now-playing bar with its queue.
 *
 * Changed underneath: generation goes to /api/music (which stores the track
 * and returns a permanent URL), and the library is the same project store the
 * image and video studios use — so a track survives a reload, a new device and
 * a cleared cache the same way a project does.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { musicModels, type MusicModelConfig } from "@/lib/music-models";
import { packages } from "@/lib/packages";
import { allClips, type StudioClip } from "@/lib/studio-projects";
import { useStudioProjects, useStudioCredits, fmtCredits } from "./useStudio";
import "./audio-studio.css";

const GENRES = [
  "Pop", "Lo-fi", "Hip-hop", "EDM", "Rock", "Jazz",
  "Cinematic", "Ambient", "Acoustic", "Synthwave", "R&B", "Classical",
];

const PRESETS = [
  "lofi hip-hop, warm piano, 90 BPM",
  "epic cinematic orchestral trailer",
  "upbeat pop with catchy chorus",
  "ambient synth pad, dreamy",
  "acoustic guitar ballad",
];

const SURPRISE = [
  "A midnight synthwave drive through neon city rain",
  "Joyful ukulele folk song about summer mornings",
  "Dark cinematic percussion with rising tension",
  "Smooth jazz saxophone over late-night lounge chords",
  "Energetic EDM festival anthem with a euphoric drop",
  "Gentle piano lullaby with soft strings",
  "Retro 80s funk groove with slap bass",
];

const SURPRISE_VOICE = [
  "Welcome to our channel — sit back, relax, and enjoy the show!",
  "This week on the podcast: three ideas that will change how you work.",
  "Thank you for calling. Our team will be with you shortly.",
];

const ENHANCE = ["rich production", "detailed arrangement", "clear mix", "memorable melody"];

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** The plugin's deterministic cover art — same track, same colours, forever. */
function coverStyle(id: string): React.CSSProperties {
  const h = hash(id);
  const h1 = h % 360;
  const h2 = (h1 + 40 + (h % 80)) % 360;
  return { background: `linear-gradient(${h % 180}deg,hsl(${h1},62%,38%),hsl(${h2},72%,26%))` };
}

function coverWave(id: string) {
  const h = hash("w" + id);
  return Array.from({ length: 14 }, (_, i) => Math.min(100, 22 + ((h >> (i % 24)) & 15) * 5));
}

function fmtClock(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

function trackTitle(clip: StudioClip) {
  if (clip.title) return clip.title;
  const base = (clip.prompt || "").trim();
  if (!base) return "Untitled";
  const words = base.split(/\s+/).slice(0, 6).join(" ");
  return words.length < base.length ? `${words}…` : words;
}

function greetLine() {
  const h = new Date().getHours();
  if (h < 5) return "Good night, let's start creating";
  if (h < 12) return "Good morning, let's start creating";
  if (h < 17) return "Good afternoon, let's start creating";
  if (h < 21) return "Good evening, let's start creating";
  return "Good night, let's start creating";
}

/** The plugin keyed its avatars and tiles by song | clip | voice. */
const kindKey = (m: MusicModelConfig) =>
  m.kind === "speech" ? "voice" : m.length === "full song" ? "song" : "clip";

const shortTag = (m: MusicModelConfig) =>
  m.kind === "speech" ? ["Speech", "Voices"] : m.length === "full song" ? ["Full song", "Top"] : ["30s clip", "Cheap"];

export default function AudioStudio() {
  const [modelId, setModelId] = useState(musicModels[0].id);
  const [ddOpen, setDdOpen] = useState(false);
  const [mode, setMode] = useState<"simple" | "custom">("simple");
  const [prompt, setPrompt] = useState("");
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [styleTags, setStyleTags] = useState<string[]>([]);
  const [instrumental, setInstrumental] = useState(false);
  const [format, setFormat] = useState("mp3");
  const [filter, setFilter] = useState<"all" | "liked">("all");
  const [payOpen, setPayOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; type?: "error" | "success" } | null>(null);

  /* player */
  const [queueIdx, setQueueIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const seekingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const { projects, push, save } = useStudioProjects("audio");
  const { credits, refresh: refreshCredits } = useStudioCredits();

  const model = useMemo(() => musicModels.find((m) => m.id === modelId)!, [modelId]);
  const isMusic = model.kind === "music";
  const library = useMemo(() => allClips(projects).map((x) => x.clip), [projects]);
  const visible = useMemo(
    () => (filter === "liked" ? library.filter((c) => c.liked) : library),
    [library, filter],
  );
  const queue = visible;
  const nowPlaying = queueIdx > -1 ? queue[queueIdx] : null;

  useEffect(() => {
    const close = () => setDdOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDdOpen(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  /* ---------------- player ---------------- */
  const playIndex = useCallback(
    (i: number) => {
      if (i < 0 || i >= queue.length) return;
      setQueueIdx(i);
      const a = audioRef.current;
      if (!a) return;
      a.src = queue[i].url;
      void a.play();
    },
    [queue],
  );

  function playClip(clip: StudioClip) {
    const i = queue.findIndex((q) => q.job_id === clip.job_id);
    playIndex(i > -1 ? i : 0);
  }

  function toggleLike(clip: StudioClip) {
    save(
      projects.map((p) => ({
        ...p,
        clips: p.clips.map((c) => (c.job_id === clip.job_id ? { ...c, liked: c.liked ? 0 : 1 } : c)),
      })),
    );
  }

  function removeClip(clip: StudioClip) {
    save(
      projects
        .map((p) => ({ ...p, clips: p.clips.filter((c) => c.job_id !== clip.job_id) }))
        .filter((p) => p.clips.length > 0),
    );
  }

  function reuse(clip: StudioClip) {
    const m = musicModels.find((x) => x.id === clip.model);
    if (m) setModelId(m.id);
    if (clip.title) {
      setMode("custom");
      setTitle(clip.title);
    } else {
      setMode("simple");
    }
    setPrompt(clip.prompt);
    promptRef.current?.focus();
  }

  /* ---------------- generate ---------------- */
  async function generate() {
    const text = mode === "custom" && isMusic ? (title || prompt) : prompt;
    if (!text.trim()) {
      setStatus({ msg: "Please describe what you want to hear.", type: "error" });
      return;
    }
    setBusy(true);
    setStatus({ msg: "Generating your audio… songs can take a minute or two." });

    const styleLine = styleTags.join(", ");
    const fullPrompt = [
      prompt.trim(),
      styleLine ? `Style: ${styleLine}` : "",
      instrumental && isMusic ? "Instrumental only, no vocals." : "",
    ]
      .filter(Boolean)
      .join(". ");

    try {
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: model.id,
          prompt: fullPrompt || text,
          ...(mode === "custom" && lyrics.trim() ? { lyrics: lyrics.trim() } : {}),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setBusy(false);
        setStatus({ msg: json.message ?? "Generation failed. Please try again.", type: "error" });
        if (json.error === "upgrade_required" || json.error === "plan_required") setPayOpen(true);
        return;
      }

      const clip: StudioClip = {
        job_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        url: json.url,
        model: model.id,
        prompt: prompt.trim() || text,
        title: mode === "custom" ? title : undefined,
        format,
        liked: 0,
        ts: Date.now(),
      };
      // Every track joins the current project so the library, the account sync
      // and the ordering behave exactly like the image and video studios.
      push(clip, projects[0]?.id ?? null);
      setBusy(false);
      setStatus(null);
      void refreshCredits();
    } catch {
      setBusy(false);
      setStatus({ msg: "Connection lost. Please try again.", type: "error" });
    }
  }

  /**
   * Music now spends from the package credits like everything else, so the
   * balance is the whole story — and roughly how many more tracks fit is the
   * useful form of it, since a credit figure alone doesn't say that.
   */
  const capLabel = credits?.signedIn && credits.cap > 0
    ? `${fmtCredits(credits.remaining)} credits left · about ${Math.floor(
        credits.remaining / model.creditsPerGeneration,
      )} more on ${model.name}`
    : "";

  /* ---------------- render ---------------- */
  return (
    <div className="caud" data-free="0" data-logged={credits?.signedIn ? "1" : "0"}>
      {/* ================= LEFT: CONTROL PANEL ================= */}
      <div className="caud-side">
        <div className="caud-side-head">
          <span className="caud-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="16" height="16">
              <path fill="currentColor" d="M4 14h2.5v4H4zM8.6 9h2.5v9H8.6zM13.2 5h2.5v13h-2.5zM17.8 11h2.5v7h-2.5z" />
            </svg>
          </span>
          <strong className="caud-side-title">AI Audio Studio</strong>
          <span className="caud-side-price">{fmtCredits(model.creditsPerGeneration)} credits</span>
        </div>

        <div className="caud-side-scroll">
          <span className="caud-sec">Model</span>
          <div className="caud-dd" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className="caud-dd-btn"
              aria-haspopup="listbox"
              aria-expanded={ddOpen}
              onClick={() => setDdOpen((o) => !o)}
            >
              <span className="caud-dd-current">
                {model.name} · {model.provider}
              </span>
              <svg className="caud-dd-chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M7.4 9.4 12 14l4.6-4.6L18 10.8l-6 6-6-6z" />
              </svg>
            </button>
            <div className="caud-dd-panel" hidden={!ddOpen}>
              <div className="caud-models">
                {musicModels.map((m) => (
                  <label key={m.id} className="caud-model">
                    <input
                      type="radio"
                      name="caud_type"
                      value={m.id}
                      checked={m.id === modelId}
                      onChange={() => {
                        setModelId(m.id);
                        setDdOpen(false);
                        if (m.kind !== "music") setMode("simple");
                      }}
                    />
                    <span className="caud-model-inner">
                      <span className={`caud-model-ava caud-ava-${kindKey(m)}`}>{m.provider.charAt(0)}</span>
                      <span className="caud-model-info">
                        <span className="caud-model-name">{m.name}</span>
                        <span className="caud-model-meta">
                          {m.provider} · {m.length}
                        </span>
                        <span className="caud-model-tags">
                          {shortTag(m).map((t, i) => (
                            <em key={t} className={i === 0 ? "is-hot" : ""}>
                              {t}
                            </em>
                          ))}
                        </span>
                        <span className="caud-model-price">{fmtCredits(m.creditsPerGeneration)} credits</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <span className="caud-sec">Prompt</span>
          <div className="caud-modes" style={{ display: isMusic ? "" : "none" }}>
            <button
              type="button"
              className={`caud-mode${mode === "simple" ? " is-active" : ""}`}
              onClick={() => setMode("simple")}
            >
              Simple
            </button>
            <button
              type="button"
              className={`caud-mode${mode === "custom" ? " is-active" : ""}`}
              onClick={() => setMode("custom")}
            >
              Custom
            </button>
          </div>
          <p className="caud-help">
            {mode === "custom" && isMusic
              ? "Add a title and your own lyrics — styles below still apply."
              : isMusic
                ? "Describe the music you want (style, mood, instruments, tempo)."
                : "Type the exact words you want spoken…"}
          </p>

          <div className="caud-fields caud-fields-custom" style={{ display: mode === "custom" && isMusic ? "" : "none" }}>
            <input
              id="caud-ctitle"
              type="text"
              className="caud-input caud-ctitle"
              maxLength={120}
              placeholder="Title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <textarea
              id="caud-lyrics"
              className="caud-input caud-lyrics"
              rows={6}
              maxLength={4000}
              placeholder={"[Verse 1]\nYour own lyrics here…\n\n[Chorus]\n…"}
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
            />
          </div>

          <div className="caud-promptbox">
            <textarea
              ref={promptRef}
              id="caud-prompt"
              className="caud-prompt"
              rows={4}
              maxLength={1000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <div className="caud-promptbar">
              <button
                type="button"
                className="caud-chip"
                onClick={() => {
                  const list = isMusic ? SURPRISE : SURPRISE_VOICE;
                  setPrompt(list[Math.floor(Math.random() * list.length)]);
                  promptRef.current?.focus();
                }}
              >
                🎲 Surprise me
              </button>
              <button
                type="button"
                className="caud-chip"
                onClick={() => {
                  if (!prompt.trim() || !isMusic) return;
                  const add = ENHANCE.filter((x) => !prompt.toLowerCase().includes(x.toLowerCase())).slice(0, 3);
                  if (add.length) setPrompt((v) => `${v}, ${add.join(", ")}`);
                }}
              >
                ✦ Enhance
              </button>
              <span className="caud-count">
                <span>{prompt.length}</span>/1000
              </span>
            </div>
          </div>

          <div style={{ display: isMusic ? "" : "none" }}>
            <span className="caud-sec">Styles</span>
            <div className="caud-genres">
              {GENRES.map((g) => (
                <button
                  key={g}
                  type="button"
                  className={`caud-genre${styleTags.includes(g) ? " is-on" : ""}`}
                  onClick={() =>
                    setStyleTags((prev) => (prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g]))
                  }
                >
                  {g}
                </button>
              ))}
            </div>

            <label className="caud-switch">
              <input
                type="checkbox"
                id="caud-instrumental"
                checked={instrumental}
                onChange={(e) => setInstrumental(e.target.checked)}
              />
              <span className="caud-switch-track">
                <span className="caud-switch-thumb" />
              </span>
              <span className="caud-switch-label">
                Instrumental <em>no vocals</em>
              </span>
            </label>

            <div className="caud-presets">
              {PRESETS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="caud-preset"
                  title={p}
                  onClick={() => {
                    setPrompt((v) => (v ? `${v}, ${p}` : p));
                    promptRef.current?.focus();
                  }}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <span className="caud-sec">Format</span>
          <div className="caud-formats" role="radiogroup">
            {model.formats.map((f) => (
              <label key={f} className="caud-format">
                <input
                  type="radio"
                  name="caud_format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                <span>
                  {f.toUpperCase()}
                  {f === "wav" && <em> · lossless</em>}
                </span>
              </label>
            ))}
          </div>

          {credits && !credits.signedIn && (
            <p className="caud-help caud-loginline">
              <Link href="/login">Log in</Link> to generate and use your credits.
            </p>
          )}

          {status && (
            <div className={`caud-status${status.type ? ` is-${status.type}` : ""}`} role="status" style={{ display: "block" }}>
              {status.msg}
            </div>
          )}
        </div>

        <div className="caud-side-foot">
          <button type="button" className="caud-generate" disabled={busy} onClick={generate}>
            <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
              <path fill="currentColor" d="M12 2l2.1 5.7L20 9.8l-5.9 2.1L12 18l-2.1-6.1L4 9.8l5.9-2.1L12 2z" />
            </svg>
            <strong>{busy ? "Rendering…" : "Generate Audio"}</strong>
            <span className="caud-generate-cost">· {fmtCredits(model.creditsPerGeneration)} credits</span>
          </button>
        </div>
      </div>

      {/* ================= MAIN ================= */}
      <div className="caud-main">
        <div className="caud-main-head">
          <h2 className="caud-greet">{greetLine()}</h2>
          <div className="caud-main-tools">
            <span className="caud-balance" title="Shared balance — also used by the image & video generators">
              <span className="caud-balance-dot" />
              <span>{credits?.signedIn && credits.cap > 0 ? fmtCredits(credits.remaining) : "—"}</span>
            </span>
            <button type="button" className="caud-topup" onClick={() => setPayOpen((o) => !o)}>
              ＋ Top up
            </button>
          </div>
        </div>

        <div className="caud-showcase">
          {musicModels.map((m) => (
            <button key={m.id} type="button" className="caud-show" onClick={() => setModelId(m.id)}>
              <span className={`caud-show-tile caud-tile-${kindKey(m)}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" width="42" height="42">
                  <path
                    fill="rgba(255,255,255,.92)"
                    d="M4 14h2.5v4H4zM8.6 9h2.5v9H8.6zM13.2 5h2.5v13h-2.5zM17.8 11h2.5v7h-2.5z"
                  />
                </svg>
              </span>
              <span className="caud-show-name">
                <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true">
                  <path fill="currentColor" d="M4 14h2.5v4H4zM8.6 9h2.5v9H8.6zM13.2 5h2.5v13h-2.5zM17.8 11h2.5v7h-2.5z" />
                </svg>{" "}
                {m.name}
              </span>
              <span className="caud-show-desc">{m.blurb}</span>
              <span className="caud-show-price">{fmtCredits(m.creditsPerGeneration)} credits</span>
            </button>
          ))}
        </div>

        <div className="caud-paywrap" hidden={!payOpen}>
          <div className="caud-showcase">
            {packages.map((p) => (
              <Link key={p.id} href="/pricing" className="caud-show">
                <span className="caud-show-tile caud-tile-song" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="42" height="42">
                    <path
                      fill="rgba(255,255,255,.92)"
                      d="M4 14h2.5v4H4zM8.6 9h2.5v9H8.6zM13.2 5h2.5v13h-2.5zM17.8 11h2.5v7h-2.5z"
                    />
                  </svg>
                </span>
                <span className="caud-show-name">{p.name}</span>
                <span className="caud-show-desc">
                  {fmtCredits(p.credits)} credits a month, shared across every tool
                </span>
                <span className="caud-show-price">${p.price.toFixed(2)} / month</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="caud-libhead">
          <span className="caud-sec caud-sec-lib">
            Library <em>your creations{capLabel ? ` · ${capLabel}` : ""}</em>
          </span>
          <div className="caud-filters">
            <button
              type="button"
              className={`caud-filter${filter === "all" ? " is-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`caud-filter${filter === "liked" ? " is-active" : ""}`}
              onClick={() => setFilter("liked")}
            >
              ♡ Liked
            </button>
          </div>
        </div>

        <div className="caud-lib">
          {busy && (
            <div className="caud-card caud-card-pending">
              <div className="caud-cover" style={coverStyle("pending")}>
                <span className="caud-cover-wave">
                  {coverWave("pending").map((h, i) => (
                    <i key={i} style={{ height: `${h}%` }} />
                  ))}
                </span>
              </div>
              <div className="caud-card-body">
                <div className="caud-card-title">Rendering…</div>
                <div className="caud-card-sub">
                  <span className="caud-card-badge">{model.name}</span>
                </div>
              </div>
            </div>
          )}

          {visible.map((clip) => {
            const isCur = nowPlaying?.job_id === clip.job_id;
            return (
              <div
                key={clip.job_id}
                className={`caud-card${isCur ? " is-current" : ""}${isCur && playing ? " is-playing" : ""}`}
                data-id={clip.job_id}
              >
                <div className="caud-cover" style={coverStyle(clip.job_id)} onClick={() => playClip(clip)}>
                  <span className="caud-cover-wave">
                    {coverWave(clip.job_id).map((h, i) => (
                      <i key={i} style={{ height: `${h}%` }} />
                    ))}
                  </span>
                  <button type="button" className="caud-cover-play" aria-label="Play">
                    <svg viewBox="0 0 24 24" width="22" height="22">
                      <path fill="currentColor" d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                  <span className="caud-cover-eq">
                    <i />
                    <i />
                    <i />
                  </span>
                </div>
                <div className="caud-card-body">
                  <div className="caud-card-title" title={clip.prompt}>
                    {trackTitle(clip)}
                  </div>
                  <div className="caud-card-sub">
                    <span className="caud-card-badge">
                      {musicModels.find((m) => m.id === clip.model)?.name ?? clip.model}
                    </span>
                    <span className="caud-card-sub-txt">{clip.prompt}</span>
                  </div>
                  <div className="caud-card-btns">
                    <button
                      type="button"
                      className={`caud-mini caud-like${clip.liked ? " is-liked" : ""}`}
                      aria-label="Like"
                      onClick={() => toggleLike(clip)}
                    >
                      {clip.liked ? "♥" : "♡"}
                    </button>
                    <a className="caud-mini" href={clip.url} download aria-label="Download">
                      ⬇
                    </a>
                    <button type="button" className="caud-mini" aria-label="Reuse" onClick={() => reuse(clip)}>
                      ↺
                    </button>
                    <button
                      type="button"
                      className="caud-mini caud-mini-danger"
                      aria-label="Remove"
                      onClick={() => removeClip(clip)}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="caud-empty" style={{ display: visible.length || busy ? "none" : "" }}>
          Nothing here yet — describe something on the left and press Generate.
        </p>
      </div>

      {/* ================= NOW PLAYING ================= */}
      <div className="caud-player" hidden={!nowPlaying}>
        <div className="caud-player-cover" style={nowPlaying ? coverStyle(nowPlaying.job_id) : undefined} />
        <div className="caud-player-meta">
          <span className="caud-player-title">{nowPlaying ? trackTitle(nowPlaying) : ""}</span>
          <span className="caud-player-sub">
            {nowPlaying ? (musicModels.find((m) => m.id === nowPlaying.model)?.name ?? nowPlaying.model) : ""}
          </span>
        </div>
        <div className="caud-player-ctrls">
          <button
            type="button"
            className="caud-pbtn"
            aria-label="Previous track"
            onClick={() => playIndex(queueIdx > 0 ? queueIdx - 1 : queue.length - 1)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M6 5h2v14H6zM20 5v14L9.5 12z" />
            </svg>
          </button>
          <button
            type="button"
            className="caud-pbtn caud-pbtn-main"
            aria-label="Play / pause"
            onClick={() => {
              const a = audioRef.current;
              if (!a?.src) return;
              if (a.paused) void a.play();
              else a.pause();
            }}
          >
            <svg className="caud-ico-play" viewBox="0 0 24 24" width="20" height="20" style={{ display: playing ? "none" : "" }}>
              <path fill="currentColor" d="M8 5v14l11-7z" />
            </svg>
            <svg className="caud-ico-pause" viewBox="0 0 24 24" width="20" height="20" style={{ display: playing ? "" : "none" }}>
              <path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z" />
            </svg>
          </button>
          <button
            type="button"
            className="caud-pbtn"
            aria-label="Next track"
            onClick={() => playIndex(queueIdx < queue.length - 1 ? queueIdx + 1 : 0)}
          >
            <svg viewBox="0 0 24 24" width="18" height="18">
              <path fill="currentColor" d="M16 5h2v14h-2zM4 5v14l10.5-7z" />
            </svg>
          </button>
        </div>
        <div className="caud-player-seek">
          <span className="caud-player-time">{fmtClock(cur)}</span>
          <input
            type="range"
            className="caud-seek"
            min={0}
            max={100}
            step={0.1}
            aria-label="Seek"
            value={dur ? (cur / dur) * 100 : 0}
            onChange={(e) => {
              seekingRef.current = true;
              const a = audioRef.current;
              if (a?.duration) a.currentTime = (Number(e.target.value) / 100) * a.duration;
              seekingRef.current = false;
            }}
          />
          <span className="caud-player-time">{fmtClock(dur)}</span>
        </div>
        <a className="caud-pbtn caud-player-dl" href={nowPlaying?.url ?? "#"} download aria-label="Download">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12 3v10.6l3.3-3.3 1.4 1.4L12 17.4 7.3 11.7l1.4-1.4 3.3 3.3V3h0zM5 19h14v2H5z" />
          </svg>
        </a>
        <audio
          ref={audioRef}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => (queue.length > 1 ? playIndex((queueIdx + 1) % queue.length) : setPlaying(false))}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onTimeUpdate={(e) => {
            if (!seekingRef.current) setCur(e.currentTarget.currentTime);
          }}
        />
      </div>
    </div>
  );
}
