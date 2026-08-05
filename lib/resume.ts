/**
 * Resume data model, templates and ATS checks.
 * One serialisable object drives the editor, the preview, autosave and
 * export — templates just render this shape differently.
 */

export interface ResumeLink { id: string; label: string; url: string; }
export interface ResumeExperience {
  id: string; role: string; company: string; location: string;
  start: string; end: string; current: boolean; bullets: string[];
}
export interface ResumeEducation {
  id: string; degree: string; institution: string; location: string;
  start: string; end: string; detail: string;
}
export interface ResumeProject { id: string; name: string; detail: string; url: string; }
export interface ResumeCertification { id: string; name: string; issuer: string; year: string; }

export interface ResumeData {
  fullName: string; headline: string; email: string; phone: string; location: string;
  /** data: URL of a cropped portrait, only used by photo templates */
  photo?: string;
  links: ResumeLink[]; summary: string;
  experience: ResumeExperience[]; education: ResumeEducation[];
  skills: string[]; projects: ResumeProject[]; certifications: ResumeCertification[];
  extraTitle: string; extraBody: string;
}

/**
 * Neutral portrait placeholder used in template previews and wherever a photo
 * template has no image yet. Inline SVG so there's no asset to host and no
 * network request — and deliberately abstract rather than a stock face, which
 * would imply a specific person's appearance is the expected look.
 */
export const PHOTO_PLACEHOLDER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
      <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#e2e8f0"/><stop offset="100%" stop-color="#cbd5e1"/>
      </linearGradient></defs>
      <rect width="120" height="120" fill="url(#g)"/>
      <circle cx="60" cy="46" r="20" fill="#94a3b8"/>
      <path d="M20 116c0-22 18-34 40-34s40 12 40 34z" fill="#94a3b8"/>
    </svg>`.replace(/\s+/g, " "),
  );

export const uid = () => Math.random().toString(36).slice(2, 10);

export const emptyExperience = (): ResumeExperience => ({
  id: uid(), role: "", company: "", location: "", start: "", end: "", current: false, bullets: [""],
});
export const emptyEducation = (): ResumeEducation => ({
  id: uid(), degree: "", institution: "", location: "", start: "", end: "", detail: "",
});
export const emptyProject = (): ResumeProject => ({ id: uid(), name: "", detail: "", url: "" });
export const emptyCertification = (): ResumeCertification => ({ id: uid(), name: "", issuer: "", year: "" });

export const blankResume = (): ResumeData => ({
  fullName: "", headline: "", email: "", phone: "", location: "", photo: "",
  links: [], summary: "",
  experience: [emptyExperience()], education: [emptyEducation()],
  skills: [], projects: [], certifications: [],
  extraTitle: "", extraBody: "",
});

export const sampleResume = (): ResumeData => ({
  fullName: "Your Name",
  headline: "Senior Frontend Engineer",
  email: "you@example.com",
  phone: "+94 71 234 5678",
  location: "Colombo, Sri Lanka",
  photo: PHOTO_PLACEHOLDER,
  links: [
    { id: uid(), label: "LinkedIn", url: "linkedin.com/in/yourname" },
    { id: uid(), label: "GitHub", url: "github.com/yourname" },
  ],
  summary:
    "Frontend engineer with six years building production React applications. Led the rebuild of a checkout flow used by 40,000 monthly customers, cutting load time by half.",
  experience: [
    {
      id: uid(), role: "Senior Frontend Engineer", company: "Example Technologies",
      location: "Colombo", start: "2023", end: "", current: true,
      bullets: [
        "Rebuilt the checkout in React and TypeScript, reducing time-to-interactive from 4.1s to 1.9s.",
        "Introduced a shared component library now used by four product teams.",
        "Mentored three junior engineers through their first year.",
      ],
    },
  ],
  education: [
    { id: uid(), degree: "BSc in Computer Science", institution: "University of Colombo", location: "Colombo", start: "2016", end: "2020", detail: "" },
  ],
  skills: ["React", "TypeScript", "Next.js", "Node.js", "PostgreSQL", "Testing Library"],
  projects: [], certifications: [], extraTitle: "", extraBody: "",
});

export const ACCENTS = [
  { id: "slate", label: "Slate", value: "#334155" },
  { id: "indigo", label: "Indigo", value: "#4f46e5" },
  { id: "teal", label: "Teal", value: "#0f766e" },
  { id: "maroon", label: "Maroon", value: "#9f1239" },
  { id: "black", label: "Black", value: "#111827" },
] as const;

/* ---------------- ATS checks ---------------- */

export interface AtsCheck { id: string; label: string; pass: boolean; hint: string; }

const ACTION_VERBS = [
  "led","built","designed","shipped","launched","reduced","increased","improved","migrated",
  "automated","owned","delivered","scaled","created","developed","managed","introduced","cut",
  "grew","negotiated","trained","mentored","rewrote","optimised","optimized","streamlined",
];

export function atsChecks(r: ResumeData, layoutIsAtsSafe: boolean): AtsCheck[] {
  const bullets = r.experience.flatMap((e) => e.bullets.filter((b) => b.trim()));
  const withNumbers = bullets.filter((b) => /\d/.test(b));
  const startsWithVerb = bullets.filter((b) =>
    ACTION_VERBS.includes(b.trim().split(/\s+/)[0]?.toLowerCase().replace(/[^a-z]/g, "") ?? ""),
  );
  return [
    { id: "contact", label: "Email and phone present", pass: Boolean(r.email.trim() && r.phone.trim()),
      hint: "Recruiters filter on these first. Keep them as plain text, not images." },
    { id: "headline", label: "Target job title stated", pass: r.headline.trim().length > 2,
      hint: "Match the title on the job ad — many systems keyword-match against it." },
    { id: "summary", label: "Summary is 2–4 lines", pass: r.summary.trim().length >= 80 && r.summary.trim().length <= 500,
      hint: "Long enough to say what you do and your strongest result, short enough to read." },
    { id: "bullets", label: "At least 3 experience bullets", pass: bullets.length >= 3,
      hint: "One line per job isn't enough to show what you actually did." },
    { id: "verbs", label: "Bullets start with action verbs", pass: bullets.length > 0 && startsWithVerb.length >= Math.ceil(bullets.length * 0.6),
      hint: "\"Led\", \"Built\", \"Reduced\" — not \"Responsible for\" or \"Worked on\"." },
    { id: "metrics", label: "Results include numbers", pass: bullets.length > 0 && withNumbers.length >= Math.ceil(bullets.length * 0.4),
      hint: "Percentages, counts, time saved, revenue — numbers make a claim credible." },
    { id: "skills", label: "5+ skills listed", pass: r.skills.filter((s) => s.trim()).length >= 5,
      hint: "Use the exact wording from the job ad where it's honestly true of you." },
    { id: "dates", label: "Every role has dates", pass: r.experience.every((e) => !e.role.trim() || (e.start.trim() && (e.current || e.end.trim()))),
      hint: "Gaps in dates get flagged by parsers and by recruiters." },
    { id: "layout", label: "Layout parses cleanly", pass: layoutIsAtsSafe,
      hint: "Multi-column layouts can scramble in older parsers. Either pick a template badged \"ATS excellent\", or keep this one and choose \"Maximum ATS safety\" when you download." },
  ];
}

export const atsScore = (checks: AtsCheck[]) =>
  Math.round((checks.filter((c) => c.pass).length / checks.length) * 100);

export function resumeToText(r: ResumeData): string {
  const lines: string[] = [];
  const push = (s = "") => lines.push(s);
  push(r.fullName);
  if (r.headline) push(r.headline);
  push([r.email, r.phone, r.location].filter(Boolean).join(" | "));
  if (r.links.length) push(r.links.map((l) => `${l.label}: ${l.url}`).join(" | "));
  if (r.summary.trim()) { push(); push("SUMMARY"); push(r.summary.trim()); }
  const exp = r.experience.filter((e) => e.role.trim() || e.company.trim());
  if (exp.length) {
    push(); push("EXPERIENCE");
    for (const e of exp) {
      push();
      push(`${e.role}${e.company ? ` — ${e.company}` : ""}${e.location ? `, ${e.location}` : ""}`);
      push(`${e.start}${e.start ? " – " : ""}${e.current ? "Present" : e.end}`);
      for (const b of e.bullets.filter((x) => x.trim())) push(`- ${b.trim()}`);
    }
  }
  const edu = r.education.filter((e) => e.degree.trim() || e.institution.trim());
  if (edu.length) {
    push(); push("EDUCATION");
    for (const e of edu) {
      push(`${e.degree}${e.institution ? ` — ${e.institution}` : ""}${e.start || e.end ? ` (${e.start}${e.start && e.end ? "–" : ""}${e.end})` : ""}`);
      if (e.detail.trim()) push(e.detail.trim());
    }
  }
  const skills = r.skills.filter((s) => s.trim());
  if (skills.length) { push(); push("SKILLS"); push(skills.join(", ")); }
  if (r.projects.length) {
    push(); push("PROJECTS");
    for (const p of r.projects.filter((x) => x.name.trim())) {
      push(`${p.name}${p.url ? ` (${p.url})` : ""}`);
      if (p.detail.trim()) push(p.detail.trim());
    }
  }
  if (r.certifications.length) {
    push(); push("CERTIFICATIONS");
    for (const c of r.certifications.filter((x) => x.name.trim())) {
      push(`${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.year ? ` (${c.year})` : ""}`);
    }
  }
  if (r.extraTitle.trim() && r.extraBody.trim()) { push(); push(r.extraTitle.toUpperCase()); push(r.extraBody.trim()); }
  return lines.join("\n");
}
