"use client";

import { useState } from "react";
import type { ResumeData, ResumeExperience, ResumeEducation } from "@/lib/resume";
import { emptyExperience, emptyEducation, emptyProject, emptyCertification, uid } from "@/lib/resume";

const inputCls =
  "w-full rounded-lg border border-line bg-canvas px-3 py-2 text-[13.5px] outline-none placeholder:text-ink-faint focus:border-brand";
const labelCls = "text-[11.5px] font-semibold text-ink-mute";

/** Small AI-assist button — shared shape for every field that offers one. */
function AssistButton({ busy, onClick, label = "AI" }: { busy: boolean; onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="shrink-0 rounded-md bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand-deep transition-colors hover:bg-brand/20 disabled:opacity-50"
    >
      {busy ? "…" : `✨ ${label}`}
    </button>
  );
}

export default function ResumeEditor({
  data,
  onChange,
  targetRole,
  onAssist,
}: {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  targetRole: string;
  /** calls the AI-assist API; returns generated text or null on failure (caller shows the error) */
  onAssist: (action: "summary" | "bullet" | "skills" | "headline", notes: string) => Promise<string | null>;
}) {
  const set = <K extends keyof ResumeData>(key: K, value: ResumeData[K]) => onChange({ ...data, [key]: value });
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, action: "summary" | "bullet" | "skills" | "headline", notes: string, apply: (text: string) => void) => {
    setBusy(key);
    const text = await onAssist(action, notes);
    if (text) apply(text);
    setBusy(null);
  };

  /* ---------------- experience ---------------- */
  const updateExp = (id: string, patch: Partial<ResumeExperience>) =>
    set("experience", data.experience.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeExp = (id: string) => set("experience", data.experience.filter((e) => e.id !== id));
  const addExp = () => set("experience", [...data.experience, emptyExperience()]);

  const updateBullet = (expId: string, i: number, text: string) =>
    updateExp(expId, { bullets: data.experience.find((e) => e.id === expId)!.bullets.map((b, bi) => (bi === i ? text : b)) });
  const addBullet = (expId: string) => {
    const e = data.experience.find((x) => x.id === expId)!;
    updateExp(expId, { bullets: [...e.bullets, ""] });
  };
  const removeBullet = (expId: string, i: number) => {
    const e = data.experience.find((x) => x.id === expId)!;
    updateExp(expId, { bullets: e.bullets.filter((_, bi) => bi !== i) });
  };

  /* ---------------- education ---------------- */
  const updateEdu = (id: string, patch: Partial<ResumeEducation>) =>
    set("education", data.education.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const removeEdu = (id: string) => set("education", data.education.filter((e) => e.id !== id));

  return (
    <div className="space-y-6">
      {/* ---- contact ---- */}
      <section>
        <h3 className="font-display text-[15px] font-semibold">Contact</h3>
        <div className="mt-2 grid grid-cols-2 gap-2.5">
          <input className={inputCls} placeholder="Full name" value={data.fullName} onChange={(e) => set("fullName", e.target.value)} />
          <div className="flex items-center gap-1.5">
            <input className={inputCls} placeholder="Headline — e.g. Senior Frontend Engineer" value={data.headline} onChange={(e) => set("headline", e.target.value)} />
            <AssistButton
              busy={busy === "headline"}
              onClick={() => run("headline", "headline", data.headline || targetRole, (t) => set("headline", t))}
            />
          </div>
          <input className={inputCls} placeholder="Email" value={data.email} onChange={(e) => set("email", e.target.value)} />
          <input className={inputCls} placeholder="Phone" value={data.phone} onChange={(e) => set("phone", e.target.value)} />
          <input className={inputCls} placeholder="Location" value={data.location} onChange={(e) => set("location", e.target.value)} />
        </div>
        <div className="mt-2 space-y-2">
          {data.links.map((l) => (
            <div key={l.id} className="flex gap-2">
              <input
                className={`${inputCls} w-28`}
                placeholder="Label"
                value={l.label}
                onChange={(e) => set("links", data.links.map((x) => (x.id === l.id ? { ...x, label: e.target.value } : x)))}
              />
              <input
                className={inputCls}
                placeholder="linkedin.com/in/you"
                value={l.url}
                onChange={(e) => set("links", data.links.map((x) => (x.id === l.id ? { ...x, url: e.target.value } : x)))}
              />
              <button onClick={() => set("links", data.links.filter((x) => x.id !== l.id))} className="text-[12px] text-ink-faint hover:text-warn">
                ✕
              </button>
            </div>
          ))}
          <button
            onClick={() => set("links", [...data.links, { id: uid(), label: "LinkedIn", url: "" }])}
            className="text-[12px] font-semibold text-brand hover:text-brand-deep"
          >
            + Add link
          </button>
        </div>
      </section>

      {/* ---- summary ---- */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold">Summary</h3>
          <AssistButton busy={busy === "summary"} onClick={() => run("summary", "summary", `${targetRole}\n${data.summary}`, (t) => set("summary", t))} label="Write for me" />
        </div>
        <textarea
          rows={3}
          className={`${inputCls} mt-2 resize-y`}
          placeholder="2-4 sentences on what you do and your strongest result."
          value={data.summary}
          onChange={(e) => set("summary", e.target.value)}
        />
      </section>

      {/* ---- experience ---- */}
      <section>
        <h3 className="font-display text-[15px] font-semibold">Experience</h3>
        <div className="mt-2 space-y-4">
          {data.experience.map((exp) => (
            <div key={exp.id} className="rounded-xl border border-line p-3.5">
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Role" value={exp.role} onChange={(e) => updateExp(exp.id, { role: e.target.value })} />
                <input className={inputCls} placeholder="Company" value={exp.company} onChange={(e) => updateExp(exp.id, { company: e.target.value })} />
                <input className={inputCls} placeholder="Location" value={exp.location} onChange={(e) => updateExp(exp.id, { location: e.target.value })} />
                <div className="grid grid-cols-3 items-center gap-1.5">
                  <input className={inputCls} placeholder="Start" value={exp.start} onChange={(e) => updateExp(exp.id, { start: e.target.value })} />
                  <input
                    className={inputCls}
                    placeholder="End"
                    value={exp.end}
                    disabled={exp.current}
                    onChange={(e) => updateExp(exp.id, { end: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-[11px] text-ink-mute">
                    <input type="checkbox" checked={exp.current} onChange={(e) => updateExp(exp.id, { current: e.target.checked })} />
                    Current
                  </label>
                </div>
              </div>

              <div className="mt-3">
                <p className={labelCls}>Bullets</p>
                <div className="mt-1.5 space-y-1.5">
                  {exp.bullets.map((b, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      <textarea
                        rows={1}
                        className={`${inputCls} resize-none`}
                        placeholder="What you did and the result — rough notes are fine"
                        value={b}
                        onChange={(e) => updateBullet(exp.id, i, e.target.value)}
                      />
                      <AssistButton
                        busy={busy === `${exp.id}-${i}`}
                        onClick={() => run(`${exp.id}-${i}`, "bullet", `${exp.role} at ${exp.company}\n${b}`, (t) => updateBullet(exp.id, i, t))}
                        label="Improve"
                      />
                      <button onClick={() => removeBullet(exp.id, i)} className="mt-1.5 text-[12px] text-ink-faint hover:text-warn">
                        ✕
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addBullet(exp.id)} className="text-[12px] font-semibold text-brand hover:text-brand-deep">
                    + Add bullet
                  </button>
                </div>
              </div>

              <button onClick={() => removeExp(exp.id)} className="mt-3 text-[12px] font-semibold text-ink-faint hover:text-warn">
                Remove this role
              </button>
            </div>
          ))}
        </div>
        <button onClick={addExp} className="mt-3 rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-ink hover:border-brand">
          + Add role
        </button>
      </section>

      {/* ---- education ---- */}
      <section>
        <h3 className="font-display text-[15px] font-semibold">Education</h3>
        <div className="mt-2 space-y-3">
          {data.education.map((edu) => (
            <div key={edu.id} className="rounded-xl border border-line p-3.5">
              <div className="grid grid-cols-2 gap-2">
                <input className={inputCls} placeholder="Degree" value={edu.degree} onChange={(e) => updateEdu(edu.id, { degree: e.target.value })} />
                <input className={inputCls} placeholder="Institution" value={edu.institution} onChange={(e) => updateEdu(edu.id, { institution: e.target.value })} />
                <input className={inputCls} placeholder="Start year" value={edu.start} onChange={(e) => updateEdu(edu.id, { start: e.target.value })} />
                <input className={inputCls} placeholder="End year" value={edu.end} onChange={(e) => updateEdu(edu.id, { end: e.target.value })} />
              </div>
              <button onClick={() => removeEdu(edu.id)} className="mt-2 text-[12px] font-semibold text-ink-faint hover:text-warn">
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={() => set("education", [...data.education, emptyEducation()])}
          className="mt-3 rounded-lg border border-line px-3.5 py-2 text-[13px] font-semibold text-ink hover:border-brand"
        >
          + Add education
        </button>
      </section>

      {/* ---- skills ---- */}
      <section>
        <div className="flex items-center justify-between">
          <h3 className="font-display text-[15px] font-semibold">Skills</h3>
          <AssistButton
            busy={busy === "skills"}
            onClick={() =>
              run("skills", "skills", `${targetRole}\n${data.skills.join(", ")}`, (t) =>
                set("skills", [...new Set([...data.skills, ...t.split(",").map((s) => s.trim()).filter(Boolean)])]),
              )
            }
            label="Suggest"
          />
        </div>
        <textarea
          rows={2}
          className={`${inputCls} mt-2 resize-y`}
          placeholder="Comma-separated: React, TypeScript, Node.js…"
          value={data.skills.join(", ")}
          onChange={(e) => set("skills", e.target.value.split(",").map((s) => s.trim()))}
        />
      </section>

      {/* ---- projects ---- */}
      <section>
        <h3 className="font-display text-[15px] font-semibold">Projects (optional)</h3>
        <div className="mt-2 space-y-2">
          {data.projects.map((p) => (
            <div key={p.id} className="flex gap-2">
              <input className={inputCls} placeholder="Project name" value={p.name} onChange={(e) => set("projects", data.projects.map((x) => (x.id === p.id ? { ...x, name: e.target.value } : x)))} />
              <input className={inputCls} placeholder="One-line detail" value={p.detail} onChange={(e) => set("projects", data.projects.map((x) => (x.id === p.id ? { ...x, detail: e.target.value } : x)))} />
              <button onClick={() => set("projects", data.projects.filter((x) => x.id !== p.id))} className="text-[12px] text-ink-faint hover:text-warn">
                ✕
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => set("projects", [...data.projects, emptyProject()])} className="mt-2 text-[12px] font-semibold text-brand hover:text-brand-deep">
          + Add project
        </button>
      </section>

      {/* ---- certifications ---- */}
      <section>
        <h3 className="font-display text-[15px] font-semibold">Certifications (optional)</h3>
        <div className="mt-2 space-y-2">
          {data.certifications.map((c) => (
            <div key={c.id} className="flex gap-2">
              <input className={inputCls} placeholder="Certification" value={c.name} onChange={(e) => set("certifications", data.certifications.map((x) => (x.id === c.id ? { ...x, name: e.target.value } : x)))} />
              <input className={`${inputCls} w-20`} placeholder="Year" value={c.year} onChange={(e) => set("certifications", data.certifications.map((x) => (x.id === c.id ? { ...x, year: e.target.value } : x)))} />
              <button onClick={() => set("certifications", data.certifications.filter((x) => x.id !== c.id))} className="text-[12px] text-ink-faint hover:text-warn">
                ✕
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => set("certifications", [...data.certifications, emptyCertification()])} className="mt-2 text-[12px] font-semibold text-brand hover:text-brand-deep">
          + Add certification
        </button>
      </section>
    </div>
  );
}
