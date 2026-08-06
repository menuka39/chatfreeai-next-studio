import Link from "next/link";
import type { Metadata } from "next";

/**
 * Landing page for the video editor.
 *
 * The editor itself is a separate deployment — a fork of OpenCut (MIT) on its
 * own subdomain. Keeping it out of this app is deliberate: it is a large
 * client-side application with its own build toolchain, and coupling it to
 * this codebase would mean every editor update risks the site that sells the
 * plans. A separate origin also keeps its service worker and its storage
 * quota to itself, which is what makes the offline behaviour dependable.
 */

const EDITOR_URL = process.env.NEXT_PUBLIC_EDITOR_URL ?? "https://editor.chatfreeai.com";

export const metadata: Metadata = {
  title: "Video Editor",
  description:
    "A timeline video editor that runs entirely in your browser. Trim, split, add text and captions, then export — your footage never leaves your device, and it keeps working offline.",
  alternates: { canonical: "/tools/video-editor" },
  openGraph: {
    title: "Video Editor — Chat Free AI",
    description:
      "Timeline editing in the browser. Nothing uploads, nothing is watermarked, and it works offline.",
    url: "/tools/video-editor",
    type: "website",
  },
};

const POINTS = [
  {
    title: "Nothing is uploaded",
    body: "Your clips are read straight from your device and processed in the browser. They are never sent to a server — not ours, not anyone's.",
  },
  {
    title: "Works offline",
    body: "Once the editor has loaded, it keeps working with no connection. Projects and media are stored on your device, so closing the tab doesn't lose them.",
  },
  {
    title: "No watermark, no credits",
    body: "Editing costs nothing and adds nothing to your video. Credits only apply to the AI tools you choose to use alongside it.",
  },
];

const FEATURES = [
  "Multi-track timeline — trim, split and reorder",
  "Text and captions, with auto language detect",
  "Aspect ratio presets: 16:9, 9:16, 1:1, 4:3",
  "Blurred or coloured backgrounds for mismatched footage",
  "Shapes, effects and adjustments",
  "Export straight to a file on your device",
];

export default function VideoEditorPage() {
  return (
    <section className="px-6 py-12">
      <div className="mx-auto max-w-3xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← All tools
        </Link>
        <h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Video Editor</h1>
        <p className="mt-2 text-ink-mute">
          A timeline editor that runs in your browser. Bring in clips, cut them, add text and
          captions, and export — without uploading anything.
        </p>

        <a
          href={EDITOR_URL}
          target="_blank"
          rel="noopener"
          className="mt-8 inline-flex rounded-full bg-white px-7 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
        >
          Open the editor →
        </a>

        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {POINTS.map((p) => (
            <div key={p.title} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
              <h2 className="text-sm font-semibold">{p.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-ink-mute">{p.body}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-12 font-display text-xl font-semibold">What it does</h2>
        <ul className="mt-4 space-y-2">
          {FEATURES.map((f) => (
            <li key={f} className="flex gap-3 text-sm text-ink-mute">
              <span aria-hidden="true" className="text-ink-faint">
                —
              </span>
              {f}
            </li>
          ))}
        </ul>

        <h2 className="mt-12 font-display text-xl font-semibold">Made with the AI tools here</h2>
        <p className="mt-3 text-sm leading-relaxed text-ink-mute">
          The editor pairs with the generators on this site. Make clips in the{" "}
          <Link href="/tools/video-generator" className="underline underline-offset-2">
            video generator
          </Link>
          , a voiceover in the{" "}
          <Link href="/tools/audio-generator" className="underline underline-offset-2">
            audio generator
          </Link>
          , a soundtrack in the{" "}
          <Link href="/tools/music-generator" className="underline underline-offset-2">
            music generator
          </Link>
          , then download them and cut it together here.
        </p>

        {/*
          MIT requires the copyright notice to travel with the software. It is
          also simply the right thing to say: this is someone else's work.
        */}
        <p className="mt-12 border-t border-white/10 pt-6 text-xs leading-relaxed text-ink-faint">
          Built on{" "}
          <a
            href="https://opencut.app"
            target="_blank"
            rel="noopener"
            className="underline underline-offset-2"
          >
            OpenCut
          </a>
          , an open-source video editor released under the MIT licence. Thanks to its maintainers
          and contributors.
        </p>
      </div>
    </section>
  );
}
