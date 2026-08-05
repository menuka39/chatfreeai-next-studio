"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import RichEditor, { type RichEditorHandle } from "./RichEditor";
import AssistantModal from "./AssistantModal";
import Markdown from "@/components/chat/Markdown";

export interface EditorPost {
  id?: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tag: string;
  readMins: number;
  status: "draft" | "published";
  coverImageUrl: string | null;
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80);

export default function BlogEditor({ initial }: { initial: EditorPost }) {
  const router = useRouter();
  const isNew = !initial.id;
  const [post, setPost] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [assistOpen, setAssistOpen] = useState(false);
  const [selection, setSelection] = useState("");
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverError, setCoverError] = useState<string | null>(null);
  const editorHandle = useRef<RichEditorHandle | null>(null);

  async function uploadCoverImage(file: File) {
    setCoverBusy(true);
    setCoverError(null);
    try {
      const form = new FormData();
      form.set("image", file);
      const res = await fetch("/api/admin/blog/upload-image", { method: "POST", body: form });
      const json = await res.json();
      if (!res.ok) {
        setCoverError(json.message ?? "Could not upload the image.");
        return;
      }
      setPost((p) => ({ ...p, coverImageUrl: json.url }));
    } catch {
      setCoverError("Connection lost. Try again.");
    } finally {
      setCoverBusy(false);
    }
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[14.5px] outline-none placeholder:text-ink-faint focus:border-brand";

  function applyAssistResult(result: string, wasSelection: boolean) {
    if (wasSelection && editorHandle.current) {
      editorHandle.current.replaceSelection(result);
    } else if (editorHandle.current) {
      editorHandle.current.replaceAll(result);
    } else {
      setPost((p) => ({ ...p, content: result }));
    }
  }

  async function save(status: "draft" | "published") {
    setBusy(true);
    setError(null);
    const payload = { ...post, status };
    try {
      const res = await fetch(isNew ? "/api/admin/blog" : `/api/admin/blog/${post.id}`, {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Could not save.");
        return;
      }
      router.push("/admin/blog");
      router.refresh();
    } catch {
      setError("Connection lost. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card-shadow max-w-3xl rounded-2xl border border-line bg-surface p-6">
      <div>
        <label className="text-sm font-semibold">Title</label>
        <input
          value={post.title}
          onChange={(e) => {
            const title = e.target.value;
            setPost((p) => ({ ...p, title, slug: slugTouched ? p.slug : slugify(title) }));
          }}
          className={field}
        />
      </div>

      <div className="mt-4">
        <label className="text-sm font-semibold">Slug</label>
        <div className="mt-1.5 flex items-center gap-1.5">
          <span className="text-[13.5px] text-ink-faint">/blog/</span>
          <input
            value={post.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setPost((p) => ({ ...p, slug: e.target.value }));
            }}
            className="w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 font-mono text-[13.5px] outline-none focus:border-brand"
          />
        </div>
      </div>

      <div className="mt-4">
        <label className="text-sm font-semibold">Excerpt</label>
        <textarea
          value={post.excerpt}
          onChange={(e) => setPost((p) => ({ ...p, excerpt: e.target.value }))}
          rows={2}
          className={field + " resize-y"}
          maxLength={220}
        />
      </div>

      <div className="mt-4">
        <label className="text-sm font-semibold">Featured image</label>
        <p className="mt-0.5 text-[11.5px] text-ink-faint">
          Shown on the blog list, at the top of the post, and when the link is shared.
        </p>
        <div className="mt-2 flex items-center gap-4">
          <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-line bg-canvas">
            {post.coverImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={post.coverImageUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="text-[11px] text-ink-faint">No image</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="cursor-pointer rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink hover:border-brand">
              {coverBusy ? "Uploading…" : post.coverImageUrl ? "Change image" : "Choose image"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={coverBusy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadCoverImage(file);
                  e.target.value = "";
                }}
              />
            </label>
            {post.coverImageUrl && (
              <button
                type="button"
                onClick={() => setPost((p) => ({ ...p, coverImageUrl: null }))}
                className="text-[12px] text-ink-faint hover:text-warn"
              >
                Remove
              </button>
            )}
          </div>
        </div>
        {coverError && <p className="mt-1.5 text-[12px] font-semibold text-warn">{coverError}</p>}
      </div>

      <div className="mt-4">
        <div className="flex items-center justify-between">
          <label className="text-sm font-semibold">Content</label>
          <div className="flex overflow-hidden rounded-md border border-line text-[11.5px] font-semibold">
            <button
              type="button"
              onClick={() => setTab("write")}
              className={`px-2.5 py-1 ${tab === "write" ? "bg-brand text-white" : "text-ink-mute hover:text-ink"}`}
            >
              Write
            </button>
            <button
              type="button"
              onClick={() => setTab("preview")}
              className={`px-2.5 py-1 ${tab === "preview" ? "bg-brand text-white" : "text-ink-mute hover:text-ink"}`}
            >
              Preview
            </button>
          </div>
        </div>
        <div className="mt-1.5">
          {tab === "write" ? (
            <RichEditor
              value={post.content}
              onChange={(content) => setPost((p) => ({ ...p, content }))}
              onOpenAssist={() => {
                setSelection(editorHandle.current?.getSelectionText() ?? "");
                setAssistOpen(true);
              }}
              handleRef={editorHandle}
            />
          ) : (
            <div className="cfai-md min-h-[280px] rounded-lg border border-line bg-canvas px-4 py-3">
              {post.content.trim() ? (
                <Markdown content={post.content} />
              ) : (
                <p className="text-[13.5px] text-ink-faint">Nothing to preview yet.</p>
              )}
            </div>
          )}
        </div>
        <p className="mt-1.5 text-[11.5px] text-ink-faint">
          Preview shows exactly what /blog renders — the same component the public page uses.
        </p>
      </div>

      {assistOpen && (
        <AssistantModal
          selectedText={selection}
          fullText={post.content}
          onApply={applyAssistResult}
          onClose={() => setAssistOpen(false)}
        />
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-semibold">Tag</label>
          <input value={post.tag} onChange={(e) => setPost((p) => ({ ...p, tag: e.target.value }))} className={field} />
        </div>
        <div>
          <label className="text-sm font-semibold">Read time (minutes)</label>
          <input
            type="number"
            min={1}
            max={60}
            value={post.readMins}
            onChange={(e) => setPost((p) => ({ ...p, readMins: Number(e.target.value) || 1 }))}
            className={field}
          />
        </div>
      </div>

      {error && <p className="mt-4 text-[13.5px] font-semibold text-warn">{error}</p>}

      <div className="mt-6 flex flex-wrap gap-2.5">
        <button
          onClick={() => save("draft")}
          disabled={busy || !post.title.trim()}
          className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink hover:border-brand disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save draft"}
        </button>
        <button
          onClick={() => save("published")}
          disabled={busy || !post.title.trim() || !post.content.trim()}
          className="rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? "Saving…" : post.status === "published" ? "Update" : "Publish"}
        </button>
        {post.status === "published" && (
          <a
            href={`/blog/${post.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-ink-mute hover:text-ink"
          >
            View live →
          </a>
        )}
      </div>
    </div>
  );
}
