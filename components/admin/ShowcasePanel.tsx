"use client";

import { useEffect, useMemo, useState } from "react";
import type { ShowcaseClip, ShowcaseSurface } from "@/lib/showcase";

/**
 * One panel for both galleries.
 *
 * The video generator and the image generator each have a "Get inspired"
 * gallery and a "Guess" tab. Rather than four separate admin screens, this is
 * one list with a surface tab and a Guess tick per item — the same clip is
 * usually wanted in both places, and separate lists would mean uploading it
 * twice and keeping them in step by hand.
 */

const SURFACES: { id: ShowcaseSurface; label: string; accept: string; ratio: string; hint: string }[] = [
  {
    id: "video",
    label: "Video",
    accept: "video/mp4,video/webm",
    ratio: "aspect-[9/16]",
    hint: "Portrait (9:16) works best — that's the shape the gallery renders. MP4 or WebM, under 50MB.",
  },
  {
    id: "image",
    label: "Image",
    accept: "image/png,image/jpeg,image/webp",
    ratio: "aspect-square",
    hint: "PNG, JPEG or WebP, under 8MB. Square reads best in the image generator's grid.",
  },
];

export default function ShowcasePanel() {
  const [clips, setClips] = useState<ShowcaseClip[] | null>(null);
  const [surface, setSurface] = useState<ShowcaseSurface>("video");
  const [prompt, setPrompt] = useState("");
  const [modelName, setModelName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [poster, setPoster] = useState<File | null>(null);
  const [inGuess, setInGuess] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const cfg = SURFACES.find((s) => s.id === surface)!;

  const load = () =>
    fetch("/api/admin/showcase")
      .then((r) => r.json())
      .then((d) => setClips(d.clips ?? []))
      .catch(() => setClips([]));

  useEffect(() => {
    load();
  }, []);

  // The list is fetched whole, then split here — one request, instant tab switch.
  const visible = useMemo(() => (clips ?? []).filter((c) => c.surface === surface), [clips, surface]);

  async function upload() {
    if (!file || !prompt.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("media", file);
      form.set("surface", surface);
      form.set("prompt", prompt.trim());
      form.set("inGuess", inGuess ? "true" : "false");
      if (modelName.trim()) form.set("modelName", modelName.trim());
      if (surface === "video" && poster) form.set("poster", poster);
      const res = await fetch("/api/admin/showcase", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: json.message ?? "Upload failed." });
        return;
      }
      setMessage({ ok: true, text: inGuess ? "Added to the gallery and Guess." : "Added to the gallery." });
      setPrompt("");
      setModelName("");
      setFile(null);
      setPoster(null);
      await load();
    } catch {
      setMessage({ ok: false, text: "Connection lost. Try again." });
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: string, body: Record<string, unknown>) {
    await fetch("/api/admin/showcase", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
    await load();
  }

  async function remove(id: string) {
    await fetch(`/api/admin/showcase?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[14px] outline-none placeholder:text-ink-faint focus:border-brand";

  return (
    <div>
      <div className="flex gap-2">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            onClick={() => setSurface(s.id)}
            className={`rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors ${
              surface === s.id
                ? "border-brand bg-brand/10 text-ink"
                : "border-line text-ink-mute hover:border-ink-faint"
            }`}
          >
            {s.label}
            <span className="ml-2 text-[11.5px] text-ink-faint">
              {(clips ?? []).filter((c) => c.surface === s.id).length}
            </span>
          </button>
        ))}
      </div>

      <div className="card-shadow mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-[15px] font-semibold">
          Add {surface === "video" ? "a clip" : "an image"}
        </h2>
        <p className="mt-1 text-[12px] text-ink-faint">
          {cfg.hint} The file is copied into your own storage, so it won&apos;t expire the way a
          provider link does.
        </p>

        <label className="mt-4 block text-sm font-semibold">
          {surface === "video" ? "Video file" : "Image file"}
        </label>
        <input
          key={`${surface}-media-${file ? "set" : "empty"}`}
          type="file"
          accept={cfg.accept}
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-[13px] text-ink-mute"
        />

        {surface === "video" && (
          <>
            <label className="mt-3 block text-sm font-semibold">Poster still (optional)</label>
            <input
              key={`poster-${poster ? "set" : "empty"}`}
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setPoster(e.target.files?.[0] ?? null)}
              className="mt-1.5 block w-full text-[13px] text-ink-mute"
            />
            <p className="mt-1 text-[11.5px] text-ink-faint">
              Strongly recommended. Without a poster the card is a blank rectangle until the video
              buffers — and on phones it often never paints a frame at all, so the gallery looks
              empty.
            </p>
          </>
        )}

        <label className="mt-3 block text-sm font-semibold">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder={
            surface === "video"
              ? "A neon city at night, cinematic, slow dolly shot"
              : "A lone fisherman casting a net at sunrise, warm light"
          }
          className={field + " resize-y"}
        />
        <p className="mt-1 text-[11.5px] text-ink-faint">
          Visitors tap the card to load this into the prompt box, so write it as something worth
          reusing.
        </p>

        <label className="mt-3 block text-sm font-semibold">Model name (optional)</label>
        <input
          value={modelName}
          onChange={(e) => setModelName(e.target.value)}
          placeholder={surface === "video" ? "Veo 3.1 Lite" : "Imagen 4"}
          className={field}
        />

        <label className="mt-4 flex items-start gap-2.5 text-[13px]">
          <input
            type="checkbox"
            checked={inGuess}
            onChange={(e) => setInGuess(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-semibold text-ink">Also show on Guess</span>
            <span className="mt-0.5 block text-[11.5px] text-ink-faint">
              The Guess tab shows built-in text prompts only, until items are ticked here.
            </span>
          </span>
        </label>

        <button
          onClick={upload}
          disabled={busy || !file || !prompt.trim()}
          className="mt-4 rounded-lg bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Add to gallery"}
        </button>
        {message && (
          <p className={`mt-2 text-[12.5px] ${message.ok ? "text-mint" : "font-semibold text-warn"}`}>
            {message.text}
          </p>
        )}
      </div>

      <h2 className="mt-8 font-display text-[15px] font-semibold">
        In the {cfg.label.toLowerCase()} gallery
      </h2>
      {!clips ? (
        <p className="mt-2 text-ink-mute">Loading…</p>
      ) : !visible.length ? (
        <p className="mt-2 text-ink-mute">
          Nothing yet — the {cfg.label.toLowerCase()} gallery falls back to built-in prompt ideas
          until you add something.
        </p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visible.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              {c.surface === "image" ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={c.videoUrl} alt="" className={`${cfg.ratio} w-full bg-black object-cover`} />
              ) : (
                <video
                  src={c.videoUrl}
                  poster={c.posterUrl ?? undefined}
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  controls
                  className={`${cfg.ratio} w-full bg-black object-cover`}
                />
              )}
              <div className="p-3">
                <p className="line-clamp-2 text-[12px] text-ink">{c.prompt}</p>
                {c.surface === "video" && !c.posterUrl && (
                  <p className="mt-1 text-[11px] font-semibold text-warn">
                    No poster — may look blank on phones
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="number"
                    defaultValue={c.sortOrder}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (v !== c.sortOrder) patch(c.id, { sortOrder: v });
                    }}
                    title="Lower numbers appear first"
                    className="w-16 rounded-md border border-line bg-canvas px-2 py-1 text-[12px]"
                  />
                  <button
                    onClick={() => patch(c.id, { published: !c.published })}
                    className="rounded-md border border-line px-2 py-1 text-[11.5px] font-semibold text-ink hover:border-brand"
                  >
                    {c.published ? "Hide" : "Show"}
                  </button>
                  <label
                    title="Show this one on the Guess tab too"
                    className={`flex cursor-pointer items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] font-semibold ${
                      c.inGuess ? "border-brand text-ink" : "border-line text-ink-faint"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={c.inGuess}
                      onChange={(e) => patch(c.id, { inGuess: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                    Guess
                  </label>
                  <button
                    onClick={() => remove(c.id)}
                    className="ml-auto text-[11.5px] font-semibold text-ink-faint hover:text-warn"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
