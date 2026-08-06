import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { tools } from "@/lib/data";
import { textToolBySlug, textTools, toClientTool } from "@/lib/text-tools";
import TextTool from "@/components/TextTool";

export function generateStaticParams() {
  // image/video/audio/resume-builder have their own hand-built pages
  const own = new Set(["image-generator", "video-generator", "audio-generator", "resume-builder"]);
  return tools.filter((t) => !own.has(t.slug)).map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) return {};
  const text = textToolBySlug(slug);
  const title = text?.name ?? tool.name;
  const description = text?.intro ?? tool.description;
  return {
    title,
    description,
    alternates: { canonical: `/tools/${slug}` },
    openGraph: { title: `${title}`, description, url: `/tools/${slug}`, type: "website" },
  };
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const tool = tools.find((t) => t.slug === slug);
  if (!tool) return notFound();

  const text = textToolBySlug(slug);

  return (
    <section className="px-6 py-14">
      <div className="mx-auto max-w-6xl">
        <Link href="/tools" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← Tools
        </Link>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">
              {text?.tagline ?? tool.category}
            </p>
            <h1 className="mt-2 font-display text-4xl font-semibold tracking-tight">
              {text?.name ?? tool.name}
            </h1>
            <p className="mt-3 text-ink-mute">{text?.intro ?? tool.description}</p>
          </div>
          <Link
            href="/pricing"
            className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand"
          >
            See packages
          </Link>
        </div>

        <div className="mt-10">
          {text ? (
            <TextTool tool={toClientTool(text)} />
          ) : (
            <div className="card-shadow rounded-2xl border border-line bg-surface p-8">
              <h2 className="font-display text-xl font-semibold">Coming soon</h2>
              <p className="mt-3 max-w-lg text-ink-mute">
                This tool isn&apos;t live yet. In the meantime, the chat, image and video generators
                are all included in every plan.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/#chat"
                  className="rounded-lg bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep"
                >
                  Open the chat
                </Link>
                <Link
                  href="/tools"
                  className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand"
                >
                  All tools
                </Link>
              </div>
            </div>
          )}
        </div>

        {text && (
          <p className="mt-8 text-[13px] text-ink-faint">
            Runs on the same monthly credits as chat, images and video — there is no separate
            subscription for this tool. Free accounts can use it within the daily allowance.
          </p>
        )}

        {textTools.length > 1 && (
          <div className="mt-12">
            <h2 className="font-display text-lg font-semibold">Other tools</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {textTools
                .filter((t) => t.slug !== slug)
                .map((t) => (
                  <Link
                    key={t.slug}
                    href={`/tools/${t.slug}`}
                    className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand"
                  >
                    <p className="text-sm font-semibold text-ink">{t.name}</p>
                    <p className="mt-1 text-[13px] text-ink-mute">{t.tagline}</p>
                  </Link>
                ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
