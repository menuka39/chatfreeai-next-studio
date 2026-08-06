import Link from "next/link";
import type { Metadata } from "next";
import AudioStudio from "@/components/studio/AudioStudio";
import { musicModels } from "@/lib/music-models";

export const metadata: Metadata = {
  alternates: { canonical: "/tools/music-generator" },
  title: "AI Music Generator",
  description:
    "Generate music and spoken audio from a text prompt. Lyria 3 for full songs and clips, GPT Audio for speech — included with any paid package.",
};

export default function MusicGeneratorPage() {
  const songModels = musicModels.filter((m) => m.kind === "music").length;
  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-6xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← All tools
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">AI Music Generator</h1>
        <p className="mt-2 max-w-2xl text-ink-mute">
          Describe a track and get 48kHz stereo audio back — {songModels} music models with vocals and
          timed lyrics, plus spoken-audio models. Part of every paid package.
        </p>
        <div className="mt-8">
          <AudioStudio />
        </div>
      </div>
    </section>
  );
}
