"use client";

/**
 * AI Speech Studio — the cfai-studio speech interface on this app's API.
 *
 * Same panels, same classes: the model dropdown with per-model price badges,
 * the script box with a live cost estimate, the voice picker with its filter,
 * the format radios, the highlight tiles, the All/Liked library and the fixed
 * now-playing bar.
 *
 * Tracks are requested in stored form (`store: true`), so the library holds a
 * real URL. An object URL built from the streamed response died with the page,
 * which left every entry in a reloaded library with a play button that did
 * nothing — the work looked saved and was not.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { audioModels, audioCredits, FORMATS, type AudioModelConfig } from "@/lib/audio-models";
import { packages } from "@/lib/packages";
import { allClips, type StudioClip } from "@/lib/studio-projects";
import { useStudioProjects, useStudioCredits, fmtCredits } from "./useStudio";
import "./speech-studio.css";
import "./speech-studio.overrides.css";

/**
 * Close-on-outside-click.
 *
 * Next's App Router hydrates into `document`, so React's delegated listener
 * and ours sit on the SAME node, where stopPropagation cannot stop a sibling.
 * React opened the dropdown, then our listener closed it in the same click —
 * it never appeared to open at all. Test what was clicked instead.
 */
const KEEP_OPEN = "[data-studio-open]";

type View = "generate" | "library" | "credits" | "payment";

const SAMPLE =
  "Welcome to Chat Free AI. This is a short sample so you can hear how this voice sounds before you spend a single credit on your real script.";

const TAG: Record<string, string> = {
  fast: "Cheapest",
  standard: "Best value",
  premium: "Most natural",
};

function fmtClock(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const priceLabel = (m: AudioModelConfig) => `${fmtCredits(m.creditsPerChar * 5000)} / 5k`;

function trackTitle(clip: StudioClip) {
  const base = (clip.prompt || "").trim();
  if (!base) return "Untitled";
  const words = base.split(/\s+/).slice(0, 7).join(" ");
  return words.length < base.length ? `${words}…` : words;
}

export default function SpeechStudio() {
  const [modelId, setModelId] = useState(audioModels[0].id);
  const [ddOpen, setDdOpen] = useState(false);
  const [text, setText] = useState("");
  const [voice, setVoice] = useState(audioModels[0].voices[0]);
  const [vfilter, setVfilter] = useState("");
  const [format, setFormat] = useState<string>("mp3");
  const [filter, setFilter] = useState<"all" | "liked">("all");
  const [view, setView] = useState<View>("generate");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ msg: string; type?: "error" | "success" } | null>(null);

  const [queueIdx, setQueueIdx] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const seekingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const { projects, push, save } = useStudioProjects("speech");
  const { credits, refresh: refreshCredits } = useStudioCredits();

  const model = useMemo(() => audioModels.find((m) => m.id === modelId)!, [modelId]);
  const library = useMemo(() => allClips(projects).map((x) => x.clip), [projects]);
  const visible = useMemo(
    () => (filter === "liked" ? library.filter((c) => c.liked) : library),
    [library, filter],
  );
  const nowPlaying = queueIdx > -1 ? visible[queueIdx] : null;
  const cost = audioCredits(model, text.length);
  const voices = model.voices.filter((v) => v.toLowerCase().includes(vfilter.toLowerCase()));

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.(KEEP_OPEN)) return;
      setDdOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setDdOpen(false);
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const playIndex = useCallback(
    (i: number) => {
      if (i < 0 || i >= visible.length) return;
      setQueueIdx(i);
      const a = audioRef.current;
      if (!a) return;
      a.src = visible[i].url;
      void a.play();
    },
    [visible],
  );

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

  async function generate() {
    if (!text.trim()) {
      setStatus({ msg: "Type or paste the text you want spoken.", type: "error" });
      return;
    }
    setBusy(true);
    setStatus({ msg: "Generating…" });
    try {
      const res = await fetch("/api/audio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId: model.id, text, voice, format, store: true }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setBusy(false);
        setStatus({ msg: json.message ?? "Generation failed. Please try again.", type: "error" });
        if (json.error === "plan_required" || json.error === "package_exhausted") setView("payment");
        return;
      }

      const { url } = (await res.json()) as { url: string };
      const clip: StudioClip = {
        job_id: `${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
        url,
        model: model.id,
        prompt: text,
        voice,
        format,
        liked: 0,
        ts: Date.now(),
      };
      push(clip, projects[0]?.id ?? null);
      setBusy(false);
      setStatus(null);
      setView("library");
      void refreshCredits();
    } catch {
      setBusy(false);
      setStatus({ msg: "Connection lost. Please try again.", type: "error" });
    }
  }

  const highlights = audioModels.slice(0, 3);

  return (
    <div className="cspk cspk-hasrail" data-free="0" data-logged={credits?.signedIn ? "1" : "0"}>
      {/* ============ RAIL ============ */}
      <div className="cspk-rail">
        {(
          [
            ["generate", "✦", "Create"],
            ["library", "▦", "Library"],
            ["credits", "●", "Credits"],
            ["payment", "💳", "Payment"],
          ] as [View, string, string][]
        ).map(([v, ic, l]) => (
          <button
            key={v}
            type="button"
            className={`cspk-rail-btn${view === v ? " is-active" : ""}`}
            onClick={() => setView(v)}
          >
            <span className="cspk-rail-ic">{ic}</span>
            <span className="cspk-rail-l">{l}</span>
          </button>
        ))}
      </div>

      {/* ============ LEFT: CONTROLS ============ */}
      <div className="cspk-side">
        <div className="cspk-app">
          <span className="cspk-app-ico">🗣️</span>
          <span className="cspk-app-name">AI Speech Studio</span>
          <span className="cspk-app-price">{priceLabel(model)}</span>
        </div>

        <div className="cspk-sec">
          <span className="cspk-sec-t">Model</span>
          <div className="cspk-dd" data-studio-open>
            <button
              type="button"
              className="cspk-dd-btn"
              aria-haspopup="listbox"
              aria-expanded={ddOpen}
              onClick={() => setDdOpen((o) => !o)}
            >
              <span className="cspk-dd-current">
                {model.name} · {model.provider}
              </span>
              <svg className="cspk-dd-chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                <path fill="currentColor" d="M7.4 9.4 12 14l4.6-4.6L18 10.8l-6 6-6-6z" />
              </svg>
            </button>
            <div className="cspk-dd-panel" hidden={!ddOpen}>
              <div className="cspk-models">
                {audioModels.map((m) => (
                  <label key={m.id} className="cspk-model">
                    <input
                      type="radio"
                      name="cspk_model"
                      value={m.id}
                      checked={m.id === modelId}
                      onChange={() => {
                        setModelId(m.id);
                        // a voice from the old model would be rejected upstream
                        setVoice(m.voices[0]);
                        setVfilter("");
                        setDdOpen(false);
                      }}
                    />
                    <span className="cspk-model-inner">
                      <span className={`cspk-ava cspk-ava-${m.provider.toLowerCase().replace(/\W+/g, "-")}`}>
                        {m.name.charAt(0).toUpperCase()}
                      </span>
                      <span className="cspk-model-meta">
                        <span className="cspk-model-name">{m.name}</span>
                        <span className="cspk-model-sub">{m.provider}</span>
                      </span>
                      <span className="cspk-model-right">
                        <span className="cspk-model-tag">{TAG[m.tier]}</span>
                        <span className="cspk-model-price">{priceLabel(m)}</span>
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="cspk-sec">
          <span className="cspk-sec-t">Your script</span>
          <textarea
            ref={textRef}
            className="cspk-text"
            maxLength={model.maxChars}
            rows={7}
            placeholder={`Type or paste the text you want spoken — up to ${model.maxChars.toLocaleString()} characters…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="cspk-meter">
            <span className="cspk-est">{text.length ? `≈ ${fmtCredits(cost)} credits` : ""}</span>
            <span className="cspk-count">
              <span>{text.length}</span> / {model.maxChars.toLocaleString()}
            </span>
          </div>
          <div className="cspk-quick">
            <button type="button" className="cspk-chip" onClick={() => setText(SAMPLE)}>
              Sample text
            </button>
            <button type="button" className="cspk-chip" onClick={() => setText("")}>
              Clear
            </button>
          </div>
        </div>

        <div className="cspk-sec">
          <span className="cspk-sec-t">Voice</span>
          <input
            type="text"
            className="cspk-vfilter"
            placeholder="Filter voices…"
            style={{ display: model.voices.length > 8 ? "" : "none" }}
            value={vfilter}
            onChange={(e) => setVfilter(e.target.value)}
          />
          <div className="cspk-voices">
            {voices.map((v) => (
              <label key={v} className={`cspk-voice${v === voice ? " is-on" : ""}`}>
                <input type="radio" name="cspk_voice" value={v} checked={v === voice} onChange={() => setVoice(v)} />
                <span>{v}</span>
              </label>
            ))}
          </div>
          <p className="cspk-vnote">{model.languages}</p>
        </div>

        <div className="cspk-sec">
          <span className="cspk-sec-t">Format</span>
          <div className="cspk-formats">
            {FORMATS.map((f) => (
              <label key={f} className="cspk-format">
                <input
                  type="radio"
                  name="cspk_format"
                  value={f}
                  checked={format === f}
                  onChange={() => setFormat(f)}
                />
                <span>{f.toUpperCase()}</span>
              </label>
            ))}
            <span className="cspk-format-note">
              {format === "mp3" ? "small files · everywhere" : format === "wav" ? "lossless · large" : "efficient · modern"}
            </span>
          </div>
        </div>

        {credits && !credits.signedIn && (
          <p className="cspk-login">
            <Link href="/login">Log in</Link> to generate and use your credits.
          </p>
        )}

        <div className="cspk-genwrap">
          <button type="button" className="cspk-gen" disabled={busy} onClick={generate}>
            <span className="cspk-gen-ico">✦</span>
            <span className="cspk-gen-label">{busy ? "Generating…" : "Generate Speech"}</span>
            <span className="cspk-gen-cost">{text.length ? `· ${fmtCredits(cost)}` : ""}</span>
          </button>
        </div>

        {status && (
          <div className={`cspk-status${status.type ? ` is-${status.type}` : ""}`} role="status" style={{ display: "block" }}>
            {status.msg}
          </div>
        )}
      </div>

      {/* ============ RIGHT: MAIN ============ */}
      <div className="cspk-main">
        <div className="cspk-greet">
          <h2 className="cspk-greet-t">What should we say today?</h2>
          <div className="cspk-wallet">
            <span className="cspk-balance" title="Shared balance — also used by the image, video & audio generators">
              <span className="cspk-bdot" />
              <span>{credits?.signedIn && credits.cap > 0 ? fmtCredits(credits.remaining) : "—"}</span>
            </span>
            <button type="button" className="cspk-topup" onClick={() => setView("payment")}>
              Top up
            </button>
          </div>
        </div>

        <div className="cspk-view cspk-paywrap" hidden={view !== "payment"}>
          <div className="cspk-tiles">
            {packages.map((p) => (
              <Link key={p.id} href="/pricing" className="cspk-tile">
                <span className="cspk-tile-art">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span className="cspk-tile-name">{p.name}</span>
                <span className="cspk-tile-desc">
                  {fmtCredits(p.credits)} credits · ${p.price.toFixed(2)}/mo
                </span>
              </Link>
            ))}
          </div>
        </div>

        <div className="cspk-view" hidden={view !== "generate"}>
        <div className="cspk-tiles">
          {highlights.map((m) => (
            <button
              key={m.id}
              type="button"
              className="cspk-tile"
              onClick={() => {
                setModelId(m.id);
                setVoice(m.voices[0]);
              }}
            >
              <span className={`cspk-tile-art cspk-ava-${m.provider.toLowerCase().replace(/\W+/g, "-")}`}>
                <i />
                <i />
                <i />
                <i />
                <i />
              </span>
              <span className="cspk-tile-name">{m.name}</span>
              <span className="cspk-tile-desc">
                {TAG[m.tier]} · {priceLabel(m)}
              </span>
            </button>
          ))}
        </div>

        <p className="cspk-view-hint">
          Paste your script on the left and press Generate. Finished takes land in the Library.
        </p>
        </div>

        {/* ---- LIBRARY ---- */}
        <div className="cspk-view" hidden={view !== "library"}>
        <div className="cspk-libhead">
          <span className="cspk-sec-t">Library</span>
          <div className="cspk-filters">
            <button
              type="button"
              className={`cspk-filter${filter === "all" ? " is-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`cspk-filter${filter === "liked" ? " is-active" : ""}`}
              onClick={() => setFilter("liked")}
            >
              ♡ Liked
            </button>
          </div>
        </div>

        <div className="cspk-lib">
          {visible.map((clip, i) => (
            <div
              key={clip.job_id}
              className={`cspk-clip${nowPlaying?.job_id === clip.job_id ? " is-current" : ""}`}
              data-id={clip.job_id}
            >
              <button type="button" className="cspk-clip-play" aria-label="Play" onClick={() => playIndex(i)}>
                ▶
              </button>
              <div className="cspk-clip-meta">
                <span className="cspk-clip-text" title={clip.prompt}>
                  {trackTitle(clip)}
                </span>
                <span className="cspk-clip-sub">
                  {audioModels.find((m) => m.id === clip.model)?.name ?? clip.model}
                  {clip.voice ? ` · ${clip.voice}` : ""}
                  {clip.format ? ` · ${clip.format.toUpperCase()}` : ""}
                </span>
              </div>
              <div className="cspk-clip-btns">
                <button
                  type="button"
                  className={`cspk-mini${clip.liked ? " is-liked" : ""}`}
                  aria-label="Like"
                  onClick={() => toggleLike(clip)}
                >
                  {clip.liked ? "♥" : "♡"}
                </button>
                <a className="cspk-mini" href={clip.url} download aria-label="Download">
                  ⬇
                </a>
                <button
                  type="button"
                  className="cspk-mini"
                  aria-label="Reuse"
                  onClick={() => {
                    setText(clip.prompt);
                    if (clip.voice) setVoice(clip.voice);
                    textRef.current?.focus();
                  }}
                >
                  ↺
                </button>
                <button
                  type="button"
                  className="cspk-mini cspk-mini-danger"
                  aria-label="Remove"
                  onClick={() => removeClip(clip)}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>

        <p className="cspk-empty" style={{ display: visible.length ? "none" : "" }}>
          Nothing here yet — everything you generate is saved to this library.
        </p>
        </div>

        {/* ---- CREDITS ---- */}
        <div className="cspk-view" hidden={view !== "credits"}>
          <div className="cspk-paywrap">
            <span className="cspk-sec-t">Your credits</span>
            <p className="cspk-vnote">
              {credits?.signedIn && credits.cap > 0
                ? `${fmtCredits(credits.remaining)} of ${fmtCredits(credits.cap)} monthly credits left. One balance for voice, music, images, video and chat — it resets with your billing period.`
                : "Voice generation is included in every paid package, billed from the same monthly credits as everything else."}
            </p>
          </div>
        </div>
      </div>

      {/* ============ NOW PLAYING ============ */}
      <div className="cspk-player" hidden={!nowPlaying}>
        <div className="cspk-player-cover">🗣️</div>
        <div className="cspk-player-meta">
          <span className="cspk-player-title">{nowPlaying ? trackTitle(nowPlaying) : ""}</span>
          <span className="cspk-player-sub">
            {nowPlaying ? (audioModels.find((m) => m.id === nowPlaying.model)?.name ?? nowPlaying.model) : ""}
          </span>
        </div>
        <button
          type="button"
          className="cspk-pbtn cspk-pbtn-main"
          aria-label="Play / pause"
          onClick={() => {
            const a = audioRef.current;
            if (!a?.src) return;
            if (a.paused) void a.play();
            else a.pause();
          }}
        >
          <svg className="cspk-ico-play" viewBox="0 0 24 24" width="20" height="20" style={{ display: playing ? "none" : "" }}>
            <path fill="currentColor" d="M8 5v14l11-7z" />
          </svg>
          <svg className="cspk-ico-pause" viewBox="0 0 24 24" width="20" height="20" style={{ display: playing ? "" : "none" }}>
            <path fill="currentColor" d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        </button>
        <div className="cspk-player-seek">
          <span className="cspk-ptime">{fmtClock(cur)}</span>
          <input
            type="range"
            className="cspk-seek"
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
          <span className="cspk-ptime">{fmtClock(dur)}</span>
        </div>
        <a className="cspk-pbtn cspk-pdl" href={nowPlaying?.url ?? "#"} download aria-label="Download">
          <svg viewBox="0 0 24 24" width="18" height="18">
            <path fill="currentColor" d="M12 3v10.6l3.3-3.3 1.4 1.4L12 17.4 7.3 11.7l1.4-1.4 3.3 3.3V3zM5 19h14v2H5z" />
          </svg>
        </a>
        <audio
          ref={audioRef}
          preload="none"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
          onLoadedMetadata={(e) => setDur(e.currentTarget.duration)}
          onTimeUpdate={(e) => {
            if (!seekingRef.current) setCur(e.currentTarget.currentTime);
          }}
        />
      </div>
    </div>
  );
}
