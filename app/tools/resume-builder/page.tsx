import Link from "next/link";
import type { Metadata } from "next";
import TemplateGallery from "@/components/resume/TemplateGallery";
import { RESUME_PASS } from "@/lib/resume-pass";
import { effectiveResumePass } from "@/lib/plan-limits";
import { resumeTemplates } from "@/lib/resume-templates";

export const metadata: Metadata = {
  title: "Resume Templates — 40 ATS-friendly designs | Chat Free AI",
  description:
    "Pick from 40 professionally designed resume templates, then build with a structured editor, live preview, ATS score and AI help. Free PDF download.",
};

export default async function ResumeTemplatesPage() {
  const atsSafe = resumeTemplates.filter((t) => t.ats !== "styled").length;
  const withPhoto = resumeTemplates.filter((t) => t.photo).length;
  const resumePass = await effectiveResumePass();

  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-7xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← Tools
        </Link>

        <div className="mt-5 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Resume Builder</p>
          <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
            Pick a template. Start building.
          </h1>
          <p className="mt-3 text-ink-mute">
            {resumeTemplates.length} designs across 8 role categories — {atsSafe} of them
            parser-safe for large-company application portals, {withPhoto} with a photo for markets
            and industries where that&apos;s expected. Click any template to open it in the editor;
            you can switch designs later without losing a word.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/tools/resume-builder/build"
            className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
          >
            Start with the default
          </Link>
          <Link
            href="/pricing#resume"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand"
          >
            {RESUME_PASS.name} — ${resumePass.price} for {resumePass.days} days
          </Link>
        </div>

        <div className="mt-10">
          <TemplateGallery />
        </div>

        {/* honest guidance */}
        <div className="mt-14 grid gap-5 rounded-2xl border border-line bg-surface p-6 md:grid-cols-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Which one should you pick?</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-mute">
              If you&apos;re applying through a big company&apos;s careers portal, choose a
              parser-safe layout — those systems read the file before a human ever does, and a
              two-column design can scramble the reading order.
            </p>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">About photos</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-mute">
              Norms differ by country. In much of Europe, Asia and the Middle East a photo is
              expected. In the US, UK, Canada and Australia it&apos;s usually left off, partly
              because employers avoid bias claims. Check the norm where you&apos;re applying.
            </p>
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">The design isn&apos;t the job</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-mute">
              A template makes your resume readable — it doesn&apos;t make you a stronger candidate.
              What moves the needle is specific results with numbers attached. The ATS panel in the
              editor checks for exactly that.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
