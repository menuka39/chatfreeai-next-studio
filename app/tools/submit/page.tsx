import Link from "next/link";
import type { Metadata } from "next";
import SubmitToolForm from "@/components/submit/SubmitToolForm";

export const metadata: Metadata = {
  alternates: { canonical: "/tools/submit" },
  title: "Submit Your AI Tool",
  description:
    "List your AI tool on Chat Free AI. Free listings are reviewed in the order received, or skip the line with Priority Listing — live in as little as 6 hours.",
};

export default function SubmitToolPage() {
  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-4xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← Tools
        </Link>
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-brand">Tool directory</p>
        <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          Submit your AI tool
        </h1>
        <p className="mt-3 max-w-2xl text-ink-mute">
          Free listings go through a queue, reviewed in the order they arrive. Need it live sooner?
          Priority Listing skips the queue entirely, with a guaranteed turnaround from 6 hours.
        </p>

        <div className="mt-10">
          <SubmitToolForm />
        </div>
      </div>
    </section>
  );
}
