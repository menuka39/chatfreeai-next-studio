"use client";
/* eslint-disable react-hooks/static-components -- see note */
/*
 * The eleven builders below (Heading, Header, Photo, SidebarContent, the
 * section blocks) are declared inside the renderer because each one closes
 * over the template config, the accent colour and the resume data — passing
 * all four through props on every call would be noisier than the problem.
 *
 * The rule is right in general: a component created during render is a new
 * type each time, so React remounts its subtree and anything stateful inside
 * is lost. Here every one of them is pure presentation with no state, no
 * effects and no animation, so the cost is re-rendering rather than losing
 * anything — and this component only re-renders when the resume changes.
 *
 * The proper fix is to lift them out and thread the config through. That is a
 * mechanical change across a file whose whole job is pixel output, so it wants
 * doing with the templates visible side by side, not blind.
 */


import { PHOTO_PLACEHOLDER, type ResumeData } from "@/lib/resume";
import type { ResumeTemplate } from "@/lib/resume-templates";

/**
 * Renders any ResumeData in any template. One renderer covers all 40 designs
 * because a template is a set of choices (layout, header, heading treatment,
 * typography, density, photo) rather than bespoke markup — so content order
 * and data handling stay identical everywhere and only presentation changes.
 */

const FONT = {
  sans: { head: "font-sans", body: "font-sans" },
  serif: { head: "font-serif", body: "font-serif" },
  mixed: { head: "font-serif", body: "font-sans" },
} as const;

const DENSITY = {
  airy: { base: "text-[13px]", gap: "mb-6", pad: "p-10", lead: "leading-relaxed" },
  normal: { base: "text-[12.5px]", gap: "mb-4", pad: "p-8", lead: "leading-relaxed" },
  compact: { base: "text-[11.5px]", gap: "mb-3", pad: "p-7", lead: "leading-snug" },
} as const;

export default function TemplateRenderer({
  data: r,
  template: t,
  accent: accentOverride,
}: {
  data: ResumeData;
  template: ResumeTemplate;
  accent?: string;
}) {
  const accent = accentOverride || t.accent;
  const f = FONT[t.font];
  const d = DENSITY[t.density];

  const exp = r.experience.filter((e) => e.role.trim() || e.company.trim());
  const edu = r.education.filter((e) => e.degree.trim() || e.institution.trim());
  const skills = r.skills.filter((s) => s.trim());
  const projects = r.projects.filter((p) => p.name.trim());
  const certs = r.certifications.filter((c) => c.name.trim());
  // photo templates always render the frame; the placeholder shows where a
  // portrait will sit before one is uploaded
  const showPhoto = t.photo;
  const photoSrc = r.photo || PHOTO_PLACEHOLDER;

  /* ---------- shared bits ---------- */

  const Heading = ({ children, onDark = false }: { children: string; onDark?: boolean }) => {
    const color = onDark ? "rgba(255,255,255,0.75)" : accent;
    switch (t.heading) {
      case "upper":
        return (
          <h2 className={`${f.head} text-[11px] font-bold uppercase tracking-[0.14em]`} style={{ color }}>
            {children}
          </h2>
        );
      case "rule":
        return (
          <h2 className={`${f.head} border-b pb-1 text-[12px] font-bold uppercase tracking-[0.1em]`} style={{ color, borderColor: onDark ? "rgba(255,255,255,0.3)" : accent }}>
            {children}
          </h2>
        );
      case "bar":
        return (
          <h2 className={`${f.head} flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.1em]`} style={{ color }}>
            <span className="inline-block h-3 w-1 rounded-sm" style={{ backgroundColor: color }} />
            {children}
          </h2>
        );
      case "boxed":
        return (
          <h2 className={`${f.head} inline-block rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.1em] text-white`} style={{ backgroundColor: color }}>
            {children}
          </h2>
        );
      case "sidebar-caps":
        return (
          <h2 className={`${f.head} text-[10.5px] font-bold uppercase tracking-[0.16em]`} style={{ color }}>
            {children}
          </h2>
        );
      default:
        return (
          <h2 className={`${f.head} text-[13px] font-bold`} style={{ color }}>
            {children}
          </h2>
        );
    }
  };

  const Photo = ({ size = 84, round = true }: { size?: number; round?: boolean }) =>
    showPhoto ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoSrc}
        alt=""
        className={`shrink-0 object-cover ${round ? "rounded-full" : "rounded-lg"}`}
        style={{ width: size, height: size }}
      />
    ) : null;

  const contactBits = [r.email, r.phone, r.location].filter(Boolean);

  const ExperienceBlock = () => (
    <div className={t.density === "compact" ? "mt-2 space-y-2.5" : "mt-2 space-y-3.5"}>
      {exp.map((e) => (
        <div key={e.id}>
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">
              {e.role}
              {e.company && <span className="font-normal opacity-70"> — {e.company}</span>}
            </p>
            <p className="shrink-0 text-[10.5px] opacity-60">
              {e.start}
              {e.start && " – "}
              {e.current ? "Present" : e.end}
            </p>
          </div>
          {e.location && <p className="text-[10.5px] opacity-55">{e.location}</p>}
          <ul className={`mt-1 list-disc space-y-0.5 pl-4 ${d.lead} opacity-90`}>
            {e.bullets.filter((b) => b.trim()).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  const TimelineBlock = () => (
    <div className="mt-3 space-y-4">
      {exp.map((e) => (
        <div key={e.id} className="relative pl-5">
          <span className="absolute left-0 top-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
          <span className="absolute left-[3.5px] top-4 bottom-[-14px] w-px" style={{ backgroundColor: accent, opacity: 0.25 }} />
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-semibold">
              {e.role}
              {e.company && <span className="font-normal opacity-70"> — {e.company}</span>}
            </p>
            <p className="shrink-0 text-[10.5px] opacity-60">
              {e.start}
              {e.start && " – "}
              {e.current ? "Present" : e.end}
            </p>
          </div>
          <ul className={`mt-1 list-disc space-y-0.5 pl-4 ${d.lead} opacity-90`}>
            {e.bullets.filter((b) => b.trim()).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );

  const EducationBlock = () => (
    <div className="mt-2 space-y-1.5">
      {edu.map((e) => (
        <div key={e.id} className="flex items-baseline justify-between gap-2">
          <p className="font-semibold">
            {e.degree}
            {e.institution && <span className="font-normal opacity-70"> — {e.institution}</span>}
          </p>
          {(e.start || e.end) && (
            <p className="shrink-0 text-[10.5px] opacity-60">
              {e.start}
              {e.start && e.end && "–"}
              {e.end}
            </p>
          )}
        </div>
      ))}
    </div>
  );

  const ProjectsBlock = () => (
    <div className="mt-2 space-y-1.5">
      {projects.map((p) => (
        <div key={p.id}>
          <p className="font-semibold">
            {p.name}
            {p.url && <span className="font-normal opacity-60"> — {p.url}</span>}
          </p>
          {p.detail && <p className="opacity-80">{p.detail}</p>}
        </div>
      ))}
    </div>
  );

  /* ---------- header variants ---------- */

  const NameBlock = ({ align = "left", onDark = false }: { align?: "left" | "center"; onDark?: boolean }) => (
    <div className={align === "center" ? "text-center" : ""}>
      <p className={`${f.head} font-bold leading-tight ${t.density === "compact" ? "text-[22px]" : "text-[28px]"}`}>
        {r.fullName || "Your Name"}
      </p>
      {r.headline && (
        <p className="mt-0.5 text-[12.5px] font-medium" style={{ color: onDark ? "rgba(255,255,255,0.85)" : accent }}>
          {r.headline}
        </p>
      )}
    </div>
  );

  const ContactLine = ({ align = "left" }: { align?: "left" | "center" }) => (
    <p className={`mt-1.5 text-[10.5px] opacity-70 ${align === "center" ? "text-center" : ""}`}>
      {[...contactBits, ...r.links.map((l) => l.url)].filter(Boolean).join("   ·   ")}
    </p>
  );

  const Header = ({ onDark = false }: { onDark?: boolean }) => {
    switch (t.header) {
      case "centered":
        return (
          <div>
            <NameBlock align="center" onDark={onDark} />
            <ContactLine align="center" />
          </div>
        );
      case "split":
        return (
          <div className="flex items-end justify-between gap-4">
            <NameBlock onDark={onDark} />
            <div className="shrink-0 text-right text-[10.5px] leading-relaxed opacity-70">
              {contactBits.map((c) => (
                <p key={c}>{c}</p>
              ))}
              {r.links.map((l) => (
                <p key={l.id}>{l.url}</p>
              ))}
            </div>
          </div>
        );
      case "photo-left":
        return (
          <div className="flex items-center gap-4">
            <Photo />
            <div>
              <NameBlock onDark={onDark} />
              <ContactLine />
            </div>
          </div>
        );
      case "photo-right":
        return (
          <div className="flex items-center justify-between gap-4">
            <div>
              <NameBlock onDark={onDark} />
              <ContactLine />
            </div>
            <Photo />
          </div>
        );
      case "photo-center":
        return (
          <div className="flex flex-col items-center">
            <Photo size={92} />
            <div className="mt-2">
              <NameBlock align="center" onDark={onDark} />
            </div>
            <ContactLine align="center" />
          </div>
        );
      default:
        return (
          <div>
            <NameBlock onDark={onDark} />
            <ContactLine />
          </div>
        );
    }
  };

  const MainSections = ({ includeSkills = true }: { includeSkills?: boolean }) => (
    <>
      {r.summary && (
        <section className={d.gap}>
          <Heading>Summary</Heading>
          <p className={`mt-1.5 ${d.lead} opacity-90`}>{r.summary}</p>
        </section>
      )}
      {exp.length > 0 && (
        <section className={d.gap}>
          <Heading>Experience</Heading>
          {t.layout === "timeline" ? <TimelineBlock /> : <ExperienceBlock />}
        </section>
      )}
      {edu.length > 0 && (
        <section className={d.gap}>
          <Heading>Education</Heading>
          <EducationBlock />
        </section>
      )}
      {includeSkills && skills.length > 0 && (
        <section className={d.gap}>
          <Heading>Skills</Heading>
          <p className="mt-1.5 opacity-90">{skills.join("   ·   ")}</p>
        </section>
      )}
      {projects.length > 0 && (
        <section className={d.gap}>
          <Heading>Projects</Heading>
          <ProjectsBlock />
        </section>
      )}
      {certs.length > 0 && (
        <section className={d.gap}>
          <Heading>Certifications</Heading>
          <p className="mt-1.5 opacity-90">
            {certs.map((c) => `${c.name}${c.issuer ? ` — ${c.issuer}` : ""}${c.year ? ` (${c.year})` : ""}`).join("   ·   ")}
          </p>
        </section>
      )}
      {r.extraTitle.trim() && r.extraBody.trim() && (
        <section className={d.gap}>
          <Heading>{r.extraTitle}</Heading>
          <p className="mt-1.5 opacity-90">{r.extraBody}</p>
        </section>
      )}
    </>
  );

  const SidebarContent = ({ onDark }: { onDark: boolean }) => (
    <div className="space-y-5">
      {showPhoto && (
        <div className="flex justify-center">
          <Photo size={96} />
        </div>
      )}
      <div>
        <Heading onDark={onDark}>Contact</Heading>
        <div className="mt-1.5 space-y-0.5 text-[10.5px] opacity-85">
          {contactBits.map((c) => (
            <p key={c} className="break-words">{c}</p>
          ))}
          {r.links.map((l) => (
            <p key={l.id} className="break-words">{l.url}</p>
          ))}
        </div>
      </div>
      {skills.length > 0 && (
        <div>
          <Heading onDark={onDark}>Skills</Heading>
          <div className="mt-1.5 flex flex-wrap gap-1">
            {skills.map((s) => (
              <span
                key={s}
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={onDark ? { backgroundColor: "rgba(255,255,255,0.15)" } : { backgroundColor: `${accent}14`, color: accent }}
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
      {certs.length > 0 && (
        <div>
          <Heading onDark={onDark}>Certifications</Heading>
          <div className="mt-1.5 space-y-1 text-[10.5px] opacity-85">
            {certs.map((c) => (
              <p key={c.id}>
                {c.name}
                {c.year && ` · ${c.year}`}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );

  /* ---------- layouts ---------- */

  const page = `resume-page bg-white text-[#1a1a1a] ${d.base} ${f.body}`;

  if (t.layout === "sidebar-left" || t.layout === "sidebar-right" || t.layout === "sidebar-wide") {
    const wide = t.layout === "sidebar-wide";
    const onDark = wide || t.heading === "bar" || t.header.startsWith("photo");
    const sidebar = (
      <aside
        className={`${wide ? "p-6" : "p-5"} h-full`}
        style={onDark ? { backgroundColor: accent, color: "white" } : { backgroundColor: `${accent}0D` }}
      >
        <SidebarContent onDark={onDark} />
      </aside>
    );
    const main = (
      <main className={d.pad}>
        <div className="mb-5">
          <NameBlock />
        </div>
        <MainSections includeSkills={false} />
      </main>
    );
    const cols = wide ? "grid-cols-[40%_1fr]" : t.layout === "sidebar-left" ? "grid-cols-[32%_1fr]" : "grid-cols-[1fr_32%]";
    return (
      // items-stretch + a min-height on the aside keeps the coloured sidebar
      // running full height even when the main column is shorter
      <div className={`${page} grid ${cols} items-stretch`} style={{ minHeight: 1123 }}>
        {t.layout === "sidebar-right" ? (
          <>
            {main}
            {sidebar}
          </>
        ) : (
          <>
            {sidebar}
            {main}
          </>
        )}
      </div>
    );
  }

  if (t.layout === "band") {
    return (
      <div className={page}>
        <div className="px-8 py-6" style={{ backgroundColor: accent, color: "white" }}>
          <Header onDark />
        </div>
        <div className={d.pad}>
          <MainSections />
        </div>
      </div>
    );
  }

  if (t.layout === "two-col") {
    return (
      <div className={`${page} ${d.pad}`}>
        <Header />
        <hr className="my-4" style={{ borderColor: accent, opacity: 0.35 }} />
        <div className="grid grid-cols-2 gap-6">
          <div>
            {r.summary && (
              <section className={d.gap}>
                <Heading>Summary</Heading>
                <p className={`mt-1.5 ${d.lead} opacity-90`}>{r.summary}</p>
              </section>
            )}
            {exp.length > 0 && (
              <section className={d.gap}>
                <Heading>Experience</Heading>
                <ExperienceBlock />
              </section>
            )}
          </div>
          <div>
            {edu.length > 0 && (
              <section className={d.gap}>
                <Heading>Education</Heading>
                <EducationBlock />
              </section>
            )}
            {skills.length > 0 && (
              <section className={d.gap}>
                <Heading>Skills</Heading>
                <p className="mt-1.5 opacity-90">{skills.join("   ·   ")}</p>
              </section>
            )}
            {projects.length > 0 && (
              <section className={d.gap}>
                <Heading>Projects</Heading>
                <ProjectsBlock />
              </section>
            )}
            {certs.length > 0 && (
              <section className={d.gap}>
                <Heading>Certifications</Heading>
                <p className="mt-1.5 opacity-90">
                  {certs.map((c) => `${c.name}${c.year ? ` (${c.year})` : ""}`).join("   ·   ")}
                </p>
              </section>
            )}
          </div>
        </div>
      </div>
    );
  }

  /* single + timeline */
  return (
    <div className={`${page} ${d.pad}`}>
      <Header />
      <hr className="my-4" style={{ borderColor: accent, opacity: 0.35 }} />
      <MainSections />
    </div>
  );
}
