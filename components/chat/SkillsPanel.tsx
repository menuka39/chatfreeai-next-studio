"use client";

import { useState } from "react";
import { BUILT_IN_SKILLS, newSkill, saveCustomSkills, type Skill } from "@/lib/skills";

/** Pick, create and edit reusable instruction presets. */
export default function SkillsPanel({
  skills,
  setSkills,
  activeIds,
  setActiveIds,
  maxSkills,
  onClose,
}: {
  skills: Skill[];
  setSkills: (s: Skill[]) => void;
  activeIds: string[];
  setActiveIds: (ids: string[]) => void;
  maxSkills: number;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState<Skill | null>(null);
  const [error, setError] = useState<string | null>(null);

  const custom = skills.filter((s) => !s.builtIn);

  function toggle(id: string) {
    setActiveIds(activeIds.includes(id) ? activeIds.filter((x) => x !== id) : [...activeIds, id]);
  }

  function save() {
    if (!editing) return;
    if (!editing.name.trim() || !editing.instruction.trim()) {
      setError("Give the skill a name and an instruction.");
      return;
    }
    const exists = custom.some((s) => s.id === editing.id);
    if (!exists && custom.length >= maxSkills) {
      setError(`You can save up to ${maxSkills} skills on this plan.`);
      return;
    }
    const nextCustom = exists ? custom.map((s) => (s.id === editing.id ? editing : s)) : [...custom, editing];
    setSkills([...BUILT_IN_SKILLS, ...nextCustom]);
    saveCustomSkills(nextCustom);
    setEditing(null);
    setError(null);
  }

  function remove(id: string) {
    const nextCustom = custom.filter((s) => s.id !== id);
    setSkills([...BUILT_IN_SKILLS, ...nextCustom]);
    saveCustomSkills(nextCustom);
    setActiveIds(activeIds.filter((x) => x !== id));
  }

  const field =
    "mt-1 w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-faint focus:border-brand";

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[13px] font-semibold">Skills</p>
          <p className="text-[11.5px] text-ink-faint">
            Saved instructions applied to this chat. Combine as many as you like.
          </p>
        </div>
        <button onClick={onClose} className="text-[12px] font-semibold text-ink-faint hover:text-ink">
          Close
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {skills.map((s) => {
          const on = activeIds.includes(s.id);
          return (
            <button
              key={s.id}
              onClick={() => toggle(s.id)}
              aria-pressed={on}
              title={s.instruction}
              className={`rounded-lg border px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                on ? "border-brand bg-brand-tint text-brand-deep" : "border-line text-ink-mute hover:text-ink"
              }`}
            >
              {s.emoji} {s.name}
              {!s.builtIn && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditing(s);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && setEditing(s)}
                  className="ml-1.5 text-ink-faint hover:text-ink"
                >
                  ✎
                </span>
              )}
            </button>
          );
        })}
        <button
          onClick={() => {
            setEditing(newSkill());
            setError(null);
          }}
          className="rounded-lg border border-dashed border-line px-2.5 py-1 text-[12px] font-semibold text-ink-mute hover:border-brand hover:text-ink"
        >
          + New skill
        </button>
      </div>

      {editing && (
        <div className="mt-3 rounded-lg border border-line bg-canvas p-3">
          <div className="flex gap-2">
            <input
              value={editing.emoji}
              onChange={(e) => setEditing({ ...editing, emoji: e.target.value.slice(0, 2) })}
              aria-label="Skill emoji"
              className={`${field} w-14 text-center`}
            />
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value.slice(0, 40) })}
              placeholder="Skill name"
              aria-label="Skill name"
              className={field}
            />
          </div>
          <textarea
            rows={3}
            value={editing.instruction}
            onChange={(e) => setEditing({ ...editing, instruction: e.target.value.slice(0, 2000) })}
            placeholder="How should the model answer? e.g. Be concise, show your working, use British spelling."
            aria-label="Skill instruction"
            className={`${field} resize-y`}
          />
          {error && <p className="mt-1.5 text-[12px] font-semibold text-warn">{error}</p>}
          <div className="mt-2 flex gap-2">
            <button onClick={save} className="rounded-lg bg-brand px-3.5 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-deep">
              Save skill
            </button>
            <button onClick={() => setEditing(null)} className="rounded-lg border border-line px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-mute hover:text-ink">
              Cancel
            </button>
            {custom.some((s) => s.id === editing.id) && (
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
