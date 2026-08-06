import Link from "next/link";
import type { Metadata } from "next";
import { tools } from "@/lib/data";

/**
 * Generate = live creative output, Work = data/precision — the same split
 * that gives the hero its two accent colours (Signal vs Wire). Reusing it
 * here on category headers and card hovers means the accent duo carries a
 * consistent meaning site-wide instead of being a homepage-only flourish.
 */
const CATEGORY_ACCENT = {
  Generate: { bar: "bg-brand", hover: "hover:border-brand", dot: "bg-brand", text: "text-brand" },
  Work: { bar: "bg-mint", hover: "hover:border-mint", dot: "bg-mint", text: "text-mint" },
} as const;

export const metadata: Metadata = {
  alternates: { canonical: "/tools" },
  title: "Free & Premium AI Tools",
  description: "Image, video, audio generation and productivity AI tools — free to try, clear pricing on premium runs.",
};

export default function ToolsIndex() {
  const categories = ["Generate", "Work"] as const;

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-6xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">Tools</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          AI tools that respect your wallet
        </h1>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <p className="mt-4 max-w-xl text-ink-mute">
            Every tool is free to try. Heavier runs use pay-per-use credits — the price is always
            shown before you generate.
          </p>
          <Link
            href="/tools/submit"
            className="mt-4 shrink-0 rounded-lg border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-brand"
          >
            Have an AI tool? List it →
          </Link>
        </div>

        {categories.map((cat) => {
          const accent = CATEGORY_ACCENT[cat];
          return (
            <div key={cat} className="mt-14">
              <h2 className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-ink-faint">
                <span className={`h-[3px] w-4 rounded-full ${accent.bar}`} />
                {cat}
              </h2>
              <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {tools
                  .filter((t) => t.category === cat)
                  .map((tool) => (
                    <Link
                      key={tool.slug}
                      href={`/tools/${tool.slug}`}
                      className={`card-shadow group relative rounded-xl border border-line bg-surface p-6 transition-colors ${accent.hover}`}
                    >
                      <span className={`absolute right-5 top-6 h-1.5 w-1.5 rounded-full opacity-40 transition-opacity group-hover:opacity-100 ${accent.dot}`} />
                      <h3 className="font-display text-[17px] font-semibold">{tool.name}</h3>
                      <p className="mt-2 text-sm text-ink-mute">{tool.tagline}</p>
                      <span className={`mt-4 inline-block text-sm font-semibold opacity-0 transition-opacity group-hover:opacity-100 ${accent.text}`}>
                        Try it →
                      </span>
                    </Link>
                  ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
