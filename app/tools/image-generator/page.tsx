import Link from "next/link";
import type { Metadata } from "next";
import ImageStudio from "@/components/studio/ImageStudio";
import { listGuess } from "@/lib/showcase";
import { imageModels } from "@/lib/image-models";

export const metadata: Metadata = {
  alternates: { canonical: "/tools/image-generator" },
  title: "AI Image Generator",
  description:
    "Generate images with GPT Image 1.5, Imagen 4, Seedream 4.5, FLUX.2 Pro and Nano Banana — included in every paid plan, charged from your monthly credits.",
};

export default async function ImageGeneratorPage() {
  // fetched server-side with the page, same as the video generator — the Guess
  // tab should be filled on first paint rather than after a client round trip
  const guess = await listGuess("image");
  return (
    <section className="px-6 py-14">
      <div className="mx-auto max-w-6xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← Tools
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Image Generator</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              The world&apos;s best image models, one page
            </h1>
            <p className="mt-3 text-ink-mute">
              {imageModels.length} top models — GPT Image, Imagen 4, Seedream, FLUX.2 Pro and Nano
              Banana. Included in every paid plan and charged from the same monthly credits as chat
              and video. No separate image subscription.
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
          <ImageStudio guess={guess} />
        </div>

        <p className="mt-8 text-[13px] text-ink-faint">
          Every generation shows its exact credit price before you run it. Failed generations are
          never charged — the credits go straight back to your balance.
        </p>
      </div>
    </section>
  );
}
