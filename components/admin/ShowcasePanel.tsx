"use client";

import { useEffect, useState } from "react";
import type { ShowcaseClip } from "@/lib/showcase";

export default function ShowcasePanel() {
  const [clips, setClips] = useState<ShowcaseClip[] | null>(null);
  const [prompt, setPrompt] = useState("");
  const [modelName, setModelName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () =>
    fetch("/api/admin/showcase")
      .then((r) => r.json())
      .then((d) => setClips(d.clips ?? []))
      .catch(() => setClips([]));

  useEffect(() => {
    load();
  }, []);

  async function upload() {
    if (!file || !prompt.trim() || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      const form = new FormData();
      form.set("video", file);
      form.set("prompt", prompt.trim());
      if (modelName.trim()) form.set("modelName", modelName.trim());
      const res = await fetch("/api/admin/showcase", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setMessage({ ok: false, text: json.message ?? "Upload failed." });
        return;
      }
      setMessage({ ok: true, text: "Added to the gallery." });
      setPrompt("");
      setModelName("");
      setFile(null);
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
      <div className="card-shadow rounded-2xl border border-line bg-surface p-5">
        <h2 className="font-display text-[15px] font-semibold">Add a clip</h2>
        <p className="mt-1 text-[12px] text-ink-faint">
          Portrait (9:16) works best — that&apos;s the shape the gallery renders. The file is copied
          into your own storage, so it won&apos;t expire the way a provider link does.
        </p>

        <label className="mt-4 block text-sm font-semibold">Video file</label>
        <input
          type="file"
          accept="video/mp4,video/webm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="mt-1.5 block w-full text-[13px] text-ink-mute"
        />

        <label className="mt-3 block text-sm font-semibold">Prompt</label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={2}
          placeholder="A neon city at night, cinematic, slow dolly shot"
          className={field + " resize-y"}
        />
        <p className="mt-1 text-[11.5px] text-ink-faint">
          Visitors tap the clip to load this into the prompt box, so write it as something worth reusing.
        </p>

        <label className="mt-3 block text-sm font-semibold">Model name (optional)</label>
        <input value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Veo 3.1 Lite" className={field} />

        <button
          onClick={upload}
          disabled={busy || !file || !prompt.trim()}
          className="mt-4 rounded-lg bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? "Uploading…" : "Add to gallery"}
        </button>
        {message && (
          <p className={`mt-2 text-[12.5px] ${message.ok ? "text-mint" : "font-semibold text-warn"}`}>{message.text}</p>
        )}
      </div>

      <h2 className="mt-8 font-display text-[15px] font-semibold">In the gallery</h2>
      {!clips ? (
        <p className="mt-2 text-ink-mute">Loading…</p>
      ) : !clips.length ? (
        <p className="mt-2 text-ink-mute">Nothing yet — the section stays hidden until you add a clip.</p>
      ) : (
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {clips.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-xl border border-line bg-surface">
              <video src={c.videoUrl} muted loop playsInline preload="metadata" controls className="aspect-[9/16] w-full bg-black object-cover" />
              <div className="p-3">
                <p className="line-clamp-2 text-[12px] text-ink">{c.prompt}</p>
                <div className="mt-2 flex items-center gap-2">
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
