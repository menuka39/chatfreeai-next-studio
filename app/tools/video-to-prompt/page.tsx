import Link from "next/link";
import type { Metadata } from "next";
import VideoToPrompt from "@/components/VideoToPrompt";

export const metadata: Metadata = {
  title: "Video to Prompt — Chat Free AI",
  description:
    "Upload a video and get the text-to-video prompt that would recreate it — scene, subject, camera movement, lighting, colour grade and pacing. Included with any paid package.",
};

export default function VideoToPromptPage() {
  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← All tools
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Video to Prompt</h1>
        <p className="mt-2 text-ink-mute">
          Upload a clip and get back the prompt that would recreate it: scene and setting, subject
          and action, camera movement, lighting, colour grade, mood and pacing — written to paste
          straight into a video generator.
        </p>
        <div className="mt-8">
          <VideoToPrompt />
        </div>
      </div>
    </section>
  );
}
