"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { loadHistory } from "@/lib/video-history";
import {
  loadProjects,
  saveProjects,
  newProject,
  projectTouchedAt,
  type Project,
} from "@/lib/projects";

/**
 * The projects library.
 *
 * Projects previously existed only as a collapsible panel above the composer,
 * which meant they vanished the moment a chat opened — there was no way to
 * see what you had, or to come back to one. This is the page that makes them
 * a thing you own rather than a setting on the current turn.
 *
 * Stored in the browser, like the chats they group. That is a real limit —
 * clearing site data loses them, and they don't follow you to another device —
 * so the page says so rather than letting someone find out the hard way.
 */
export default function ProjectsLibrary() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"updated" | "created" | "name">("updated");
  const [editing, setEditing] = useState<Project | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [migrated, setMigrated] = useState(0);
  /**
   * How much work lives in each project.
   *
   * A project card that shows only a name and a date tells you nothing about
   * whether it's the one you want. Counts are read straight from the same
   * browser stores the chat and video tools already write to, so nothing new
   * has to be kept in sync.
   */
  const [counts, setCounts] = useState<Record<string, { chats: number; clips: number }>>({});
  useEffect(() => {
    const tally: Record<string, { chats: number; clips: number }> = {};
    const bump = (id: string | null | undefined, key: "chats" | "clips") => {
      if (!id) return;
      tally[id] ??= { chats: 0, clips: 0 };
      tally[id][key] += 1;
    };
    try {
      const chats = JSON.parse(localStorage.getItem("cfai_chats") ?? "[]");
      if (Array.isArray(chats)) for (const c of chats) bump(c?.projectId, "chats");
    } catch {
      /* unreadable store — counts simply stay at zero */
    }
    try {
      for (const v of loadHistory()) bump(v.projectId, "clips");
    } catch {
      /* as above */
    }
    // Reading the browser's own state on mount — localStorage, the URL, the
    // server's feature flags. That has to happen after mount or the server's
    // HTML and the client's first render disagree, and this rule can't tell a
    // one-shot external read from a render loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCounts(tally);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // show the local copy immediately so the page isn't blank while the
      // request is in flight
      const local = loadProjects();
      if (!cancelled) setProjects(local);

      try {
        const res = await fetch("/api/projects");
        const data = await res.json();
        if (cancelled) return;
        if (!data.signedIn) return; // guest — the local copy is the real one

        setSignedIn(true);

        /**
         * Move anything created while signed out into the account.
         *
         * Someone who wrote a brief as a guest and then signed in should not
         * have to write it again, and matching by name avoids duplicating a
         * project they had already synced from another device.
         */
        const serverNames = new Set((data.projects as Project[]).map((p) => p.name.toLowerCase()));
        const seen = new Set<string>();
        const toMigrate = local.filter((p) => {
          // The API rejects a nameless project, so an unnamed local one would
          // POST, 400, and vanish along with whatever brief was in it. Give it
          // a name rather than dropping someone's writing.
          if (!p.name.trim()) p.name = "Untitled project";
          const key = p.name.toLowerCase();
          // guard against two local projects sharing a name creating two rows
          if (serverNames.has(key) || seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        if (toMigrate.length) {
          await Promise.all(
            toMigrate.map((p) =>
              fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: p.name, emoji: p.emoji, brief: p.brief }),
              }),
            ),
          );
          const again = await (await fetch("/api/projects")).json();
          if (!cancelled) {
            setProjects(again.projects);
            setMigrated(toMigrate.length);
            // clear the local copy only after the server has them, so a
            // failed migration never loses the originals
            saveProjects([]);
          }
          return;
        }
        setProjects(data.projects);
      } catch {
        /* offline or misconfigured — the local copy still works */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Local-only fallback for guests; signed-in writes go through the API. */
  function persist(next: Project[]) {
    setProjects(next);
    if (!signedIn) saveProjects(next);
  }

  const visible = useMemo(() => {
    if (!projects) return [];
    const q = query.trim().toLowerCase();
    const filtered = q
      ? projects.filter(
          (p) => p.name.toLowerCase().includes(q) || p.brief.toLowerCase().includes(q),
        )
      : projects;
    const sorted = [...filtered];
    if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "created") sorted.sort((a, b) => b.createdAt - a.createdAt);
    else sorted.sort((a, b) => projectTouchedAt(b) - projectTouchedAt(a));
    return sorted;
  }, [projects, query, sort]);

  function createProject() {
    // Created locally either way; a signed-in user's copy is written to the
    // server on save, once it has a name worth keeping.
    const p = newProject();
    persist([p, ...(projects ?? [])]);
    setEditing(p);
  }

  async function saveEdit(p: Project) {
    const next = { ...p, updatedAt: Date.now() };
    persist((projects ?? []).map((x) => (x.id === p.id ? next : x)));
    setEditing(null);

    if (!signedIn) return;
    try {
      // A project that only exists locally has never been sent, so PATCH
      // would 404 — POST it instead and adopt the id the server assigns.
      //
      // The id itself says which is which: the server assigns UUIDs
      // (gen_random_uuid), while lib/projects.ts generates an 8-character
      // base36 id. An earlier version guessed from `createdAt !== updatedAt`,
      // which answers a different question entirely — a server project that
      // simply had not been edited yet looked local and got POSTed, creating
      // a duplicate every time it was saved.
      const known = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(p.id);
      const res = await fetch("/api/projects", {
        method: known ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: p.id, name: p.name, emoji: p.emoji, brief: p.brief }),
      });
      const data = await res.json();
      if (res.ok && data.project) {
        setProjects((cur) => (cur ?? []).map((x) => (x.id === p.id ? data.project : x)));
      }
    } catch {
      /* keep the optimistic copy; a reload re-reads the server */
    }
  }

  async function remove(id: string) {
    persist((projects ?? []).filter((p) => p.id !== id));
    setEditing(null);
    if (!signedIn) return;
    try {
      await fetch(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch {
      /* removed locally; the next load reconciles */
    }
  }

  const field =
    "mt-1.5 w-full rounded-lg border border-line bg-canvas px-3.5 py-2.5 text-[14.5px] outline-none placeholder:text-ink-faint focus:border-brand";

  return (
    <section className="px-6 py-10">
      <div className="mx-auto max-w-5xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-3xl font-semibold">Projects</h1>
            <p className="mt-1 text-[14px] text-ink-mute">
              A project&apos;s brief is sent with every chat inside it, so you stop re-explaining
              your setup.
            </p>
          </div>
          <button
            onClick={createProject}
            className="shrink-0 rounded-lg bg-brand px-4 py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-deep"
          >
            New project
          </button>
        </div>

        {projects && projects.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects…"
              className="w-full max-w-xs rounded-lg border border-line bg-canvas px-3.5 py-2 text-[14px] outline-none placeholder:text-ink-faint focus:border-brand"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] outline-none focus:border-brand"
              aria-label="Sort projects"
            >
              <option value="updated">Last updated</option>
              <option value="created">Recently created</option>
              <option value="name">Name</option>
            </select>
          </div>
        )}

        {!projects ? (
          <p className="mt-8 text-ink-mute">Loading…</p>
        ) : !projects.length ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line p-10 text-center">
            <p className="font-display text-lg font-semibold text-ink">No projects yet</p>
            <p className="mx-auto mt-1.5 max-w-md text-[14px] text-ink-mute">
              Start one for a piece of work you keep coming back to — a plugin you&apos;re building,
              a client, a course. Every chat inside it gets the same background.
            </p>
            <button
              onClick={createProject}
              className="mt-5 rounded-lg bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-deep"
            >
              Create your first project
            </button>
          </div>
        ) : !visible.length ? (
          <p className="mt-8 text-ink-mute">Nothing matches “{query}”.</p>
        ) : (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {visible.map((p) => (
              <button
                key={p.id}
                onClick={() => setEditing(p)}
                className="card-shadow rounded-xl border border-line bg-surface p-5 text-left transition-colors hover:border-brand"
              >
                <div className="flex items-start gap-2.5">
                  <span className="text-[18px] leading-none">{p.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">{p.name}</p>
                    <p className="mt-1 text-[12px] text-ink-faint">
                      {new Date(projectTouchedAt(p)).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                    {p.brief.trim() && (
                      <p className="mt-2 line-clamp-2 text-[13px] text-ink-mute">{p.brief}</p>
                    )}
                    {(counts[p.id]?.chats || counts[p.id]?.clips) && (
                      <p className="mt-2 text-[12px] text-ink-faint">
                        {[
                          counts[p.id]?.chats
                            ? `${counts[p.id].chats} chat${counts[p.id].chats === 1 ? "" : "s"}`
                            : null,
                          counts[p.id]?.clips
                            ? `${counts[p.id].clips} clip${counts[p.id].clips === 1 ? "" : "s"}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {migrated > 0 && (
          <p className="mt-6 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-[12.5px] text-ink">
            Moved {migrated} project{migrated === 1 ? "" : "s"} from this browser into your account.
          </p>
        )}

        <p className="mt-6 text-[12px] text-ink-faint">
          {signedIn
            ? "Saved to your account — these follow you to any device you sign in on."
            : "Stored in this browser. Sign in and they move to your account, so clearing site data won't lose them."}
        </p>

        <p className="mt-8 text-[13px]">
          <Link href="/" className="font-semibold text-brand hover:text-brand-deep">
            ← Back to chat
          </Link>
        </p>
      </div>

      {/* editor */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="card-shadow w-full max-w-lg rounded-2xl border border-line bg-surface p-6">
            <h2 className="font-display text-lg font-semibold">Project</h2>

            <label className="mt-4 block text-sm font-semibold">Name</label>
            <input
              autoFocus
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="WordPress plugin"
              className={field}
            />

            <label className="mt-3 block text-sm font-semibold">Emoji</label>
            <input
              value={editing.emoji}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value.slice(0, 4) })}
              className={field + " w-24"}
            />

            <label className="mt-3 block text-sm font-semibold">Brief</label>
            <textarea
              value={editing.brief}
              onChange={(e) => setEditing({ ...editing, brief: e.target.value })}
              rows={5}
              maxLength={2000}
              placeholder="We're building a WordPress plugin that… The stack is… Prefer answers that…"
              className={field + " resize-y"}
            />
            <p className="mt-1 text-[11.5px] text-ink-faint">
              Sent at the start of every chat in this project. Keep it to the background that
              doesn&apos;t change — the specifics belong in the message.
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-2">
              <button
                onClick={() => saveEdit(editing)}
                disabled={!editing.name.trim()}
                className="rounded-lg bg-brand px-5 py-2.5 text-[13.5px] font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
              >
                Save
              </button>
              <button
                onClick={() => setEditing(null)}
                className="text-[13px] font-semibold text-ink-faint hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={() => remove(editing.id)}
                className="ml-auto text-[13px] font-semibold text-ink-faint hover:text-warn"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
