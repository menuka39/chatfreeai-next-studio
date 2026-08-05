"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface PostRow {
  id: string;
  slug: string;
  title: string;
  tag: string;
  status: string;
  published_at: string | null;
  updated_at: string;
}

export default function BlogList() {
  const [posts, setPosts] = useState<PostRow[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = () =>
    fetch("/api/admin/blog")
      .then((r) => r.json())
      .then((d) => setPosts(d.posts));

  useEffect(() => {
    load();
  }, []);

  async function remove(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This can't be undone.`)) return;
    setBusyId(id);
    try {
      await fetch(`/api/admin/blog/${id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  if (!posts) return <p className="text-ink-mute">Loading…</p>;

  return (
    <div className="card-shadow overflow-hidden rounded-2xl border border-line bg-surface">
      {posts.length === 0 && <p className="p-6 text-ink-mute">No posts yet.</p>}
      {posts.map((p, i) => (
        <div
          key={p.id}
          className={`flex flex-wrap items-center justify-between gap-3 p-4 ${i > 0 ? "border-t border-line" : ""}`}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-ink">{p.title}</p>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide ${
                  p.status === "published" ? "bg-mint-tint text-mint" : "bg-canvas text-ink-faint"
                }`}
              >
                {p.status}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-faint">
              /{p.slug} · {p.tag} · updated {new Date(p.updated_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {p.status === "published" && (
              <a
                href={`/blog/${p.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink-mute hover:text-ink"
              >
                View
              </a>
            )}
            <Link
              href={`/admin/blog/${p.id}`}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink hover:border-brand"
            >
              Edit
            </Link>
            <button
              onClick={() => remove(p.id, p.title)}
              disabled={busyId === p.id}
              className="rounded-lg border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink-faint hover:border-warn hover:text-warn disabled:opacity-50"
            >
              {busyId === p.id ? "…" : "Delete"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
