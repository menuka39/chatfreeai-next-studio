import Link from "next/link";
import type { Metadata } from "next";
import SpeechStudio from "@/components/studio/SpeechStudio";
import { audioModels } from "@/lib/audio-models";

export const metadata: Metadata = {
  alternates: { canonical: "/tools/audio-generator" },
  title: "AI Voice Generator",
  description:
    "Turn text into natural speech with Grok Voice, Gemini 3.1 Flash TTS, GPT-4o Mini TTS and Kokoro — included in every paid plan, charged from your monthly credits.",
};

export default function AudioGeneratorPage() {
  return (
    <section className="px-6 py-14">
      <div className="mx-auto max-w-6xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← Tools
        </Link>
        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Voice Generator</p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              Text to natural speech
            </h1>
            <p className="mt-3 text-ink-mute">
              {audioModels.length} voice models from xAI, Google, OpenAI and hexgrad — narration,
              voiceovers and accessibility audio. Included in every paid plan and charged from the
              same monthly credits as everything else.
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
          <SpeechStudio />
        </div>

        <p className="mt-8 text-[13px] text-ink-faint">
          Voice models bill per character of text, so the exact credit price is shown before you
          generate. If a job fails, the credits go straight back to your balance.
        </p>
      </div>
    </section>
  );
}
