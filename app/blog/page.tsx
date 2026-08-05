import Link from "next/link";
import type { Metadata } from "next";
import { listPublishedPosts } from "@/lib/blog";

export const metadata: Metadata = {
  title: "Blog — Chat Free AI",
  description: "Guides and comparisons on free AI chat, models, and tools.",
};
/**
 * This page is already forced dynamic by the root layout (Header/Footer read
 * live branding), but that alone wasn't enough on its own — verified live
 * that a newly published post didn't appear immediately despite the route
 * building as dynamically rendered. force-dynamic stated directly here is
 * the same fix already validated for icon.tsx/apple-icon.tsx/manifest.ts:
 * don't rely on an inherited property from a parent, state it explicitly on
 * the route that actually needs it.
 */
export const dynamic = "force-dynamic";

export default async function BlogIndex() {
  const posts = await listPublishedPosts();

  return (
    <section className="px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <p className="text-sm font-semibold uppercase tracking-wide text-brand">Blog</p>
        <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
          Guides &amp; comparisons
        </h1>
        <p className="mt-4 max-w-xl text-ink-mute">
          Practical write-ups on free AI models and tools — tested claims, no fluff.
        </p>

        {posts.length === 0 && <p className="mt-12 text-ink-mute">No posts published yet.</p>}

        <div className="mt-12 divide-y divide-line">
          {posts.map((p) => (
            <Link
              key={p.slug}
              href={`/blog/${p.slug}`}
              className="group flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex flex-1 items-center gap-4">
                {p.coverImageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.coverImageUrl}
                    alt=""
                    className="hidden h-16 w-24 shrink-0 rounded-lg border border-line object-cover sm:block"
                  />
                )}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {p.tag} · {p.readMins} min read
                  </p>
                  <h2 className="mt-2 font-display text-2xl font-semibold group-hover:text-brand-deep">
                    {p.title}
                  </h2>
                  <p className="mt-2 max-w-xl text-sm text-ink-mute">{p.excerpt}</p>
                </div>
              </div>
              <span className="shrink-0 text-sm text-ink-faint">
                {new Date(p.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
