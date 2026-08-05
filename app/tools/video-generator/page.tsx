import Link from "next/link";
import type { Metadata } from "next";
import VideoStudio from "@/components/studio/VideoStudio";
import { listShowcase } from "@/lib/showcase";
import { videoModels } from "@/lib/video-models";

export const metadata: Metadata = {
  title: "AI Video Generator — Chat Free AI",
  description:
    "Generate video from text with Veo 3.1, Sora 2 Pro, Kling v3, Seedance, Hailuo and Wan — included in every paid plan, charged from your monthly credits.",
};

export default async function VideoGeneratorPage() {
  // fetched here so the gallery is server-rendered with the page — it is the
  // first thing a cold visitor sees, and should not wait on a client fetch
  const showcase = await listShowcase();
  return (
    <section className="px-6 py-14">
      <div className="mx-auto max-w-6xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← Tools
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Video Generator</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              The world&apos;s best video models, one page
            </h1>
            <p className="mt-3 text-ink-mute">
              {videoModels.length} top models — Google Veo, OpenAI Sora, Kling, Seedance, Hailuo and
              Wan. Included in every paid plan and charged from the same monthly credits as chat.
              No separate video subscription.
            </p>
          </div>
          <Link
            href="/pricing"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand"
          >
            See packages
          </Link>
        </div>

        <div className="mt-10">
          <VideoStudio showcase={showcase} />
        </div>

        <p className="mt-8 text-[13px] text-ink-faint">
          Every generation shows its exact credit price before you run it. If a job fails, the
          credits go straight back to your balance. Videos are produced asynchronously and are
          usually ready within a few minutes.
        </p>
      </div>
    </section>
  );
}
