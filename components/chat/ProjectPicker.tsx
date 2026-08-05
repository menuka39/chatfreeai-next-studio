"use client";

import { useState } from "react";
import { newProject, saveProjects, type Project } from "@/lib/projects";

/** Group chats under a project whose brief is shared by every chat inside it. */
export default function ProjectPicker({
  projects,
  setProjects,
  activeId,
  setActiveId,
  maxProjects,
  onClose,
}: {
  projects: Project[];
  setProjects: (p: Project[]) => void;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  maxProjects: number;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Project | null>(null);
  const [error, setError] = useState<string | null>(null);

  function save() {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("Give the project a name.");
      return;
    }
    const exists = projects.some((p) => p.id === editing.id);
    if (!exists && projects.length >= maxProjects) {
      setError(`You can have up to ${maxProjects} projects on this plan.`);
      return;
    }
    const next = exists ? projects.map((p) => (p.id === editing.id ? editing : p)) : [...projects, editing];
    setProjects(next);
    saveProjects(next);
    setActiveId(editing.id);
    setEditing(null);
    setError(null);
  }

  function remove(id: string) {
    const next = projects.filter((p) => p.id !== id);
    setProjects(next);
    saveProjects(next);
    if (activeId === id) setActiveId(null);
  }

  const field =
    "mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-faint focus:border-brand";

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold">Projects</p>
          <p className="text-[11.5px] text-ink-faint">
            A project&apos;s brief is sent with every chat inside it, so you stop re-explaining your setup.
          </p>
        </div>
        <button onClick={onClose} className="text-[12px] font-semibold text-ink-faint hover:text-ink">
          Close
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <button
          onClick={() => setActiveId(null)}
          aria-pressed={activeId === null}
          className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
            activeId === null ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute hover:text-ink"
          }`}
        >
          No project
        </button>
        {projects.map((p) => {
          const on = activeId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => setActiveId(p.id)}
              aria-pressed={on}
              title={p.brief}
              className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                on ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute hover:text-ink"
              }`}
            >
              {p.emoji} {p.name}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation();
                  setEditing(p);
                }}
                onKeyDown={(e) => e.key === "Enter" && setEditing(p)}
                className="ml-1.5 text-ink-faint hover:text-ink"
              >
                ✎
              </span>
            </button>
          );
        })}
        <button
          onClick={() => {
            setEditing(newProject());
            setError(null);
          }}
          className="rounded-lg border border-dashed border-line px-2.5 py-1 text-[12px] font-semibold text-ink-mute hover:border-brand hover:text-ink"
        >
          + New project
        </button>
      </div>

      {editing && (
        <div className="mt-3 rounded-lg border border-line bg-canvas p-3">
          <div className="flex gap-2">
            <input
              value={editing.emoji}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value.slice(0, 2) })}
              aria-label="Project emoji"
              className={`${field} w-14 text-center`}
            />
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value.slice(0, 50) })}
              placeholder="Project name"
              aria-label="Project name"
              className={field}
            />
          </div>
          <textarea
            rows={3}
            value={editing.brief}
            onChange={(e) => setEditing({ ...editing, brief: e.target.value.slice(0, 3000) })}
            placeholder="What is this project? e.g. A WordPress plugin for AI document generation. Stack: PHP 8, WP 6.5, OpenRouter API."
            aria-label="Project brief"
            className={`${field} resize-y`}
          />
          {error && <p className="mt-1.5 text-[12px] font-semibold text-warn">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={save} className="rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-deep">
              Save project
            </button>
            <button onClick={() => setEditing(null)} className="rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-mute hover:text-ink">
              Cancel
            </button>
            {projects.some((p) => p.id === editing.id) && (
              <button
                onClick={() => {
                  remove(editing.id);
                  setEditing(null);
                }}
                className="ml-auto text-[12.5px] font-semibold text-ink-faint hover:text-warn"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
