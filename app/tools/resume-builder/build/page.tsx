import Link from "next/link";
import type { Metadata } from "next";
import ResumeBuilder from "@/components/resume/ResumeBuilder";

export const metadata: Metadata = {
  title: "Resume Builder — Chat Free AI",
  description:
    "Structured resume editor with live preview, 40 templates, ATS readiness score and AI help for every field.",
};

export default async function ResumeBuildPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const { t } = await searchParams;

  return (
    <section className="px-6 py-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link href="/tools/resume-builder" className="text-sm font-medium text-ink-faint hover:text-ink">
            ← All templates
          </Link>
          <Link href="/pricing#resume" className="text-sm font-semibold text-brand hover:text-brand-deep">
            Resume Pass — unlimited for 5 days
          </Link>
        </div>

        <div className="mt-5">
          <ResumeBuilder initialTemplate={t} />
        </div>
      </div>
    </section>
  );
}
