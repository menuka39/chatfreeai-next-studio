import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedPost } from "@/lib/blog";
import Markdown from "@/components/chat/Markdown";

/**
 * Posts are DB-driven (see /admin/blog) and read live on every request —
 * verified empirically that relying on the root layout's force-dynamic
 * alone (Header/Footer's live branding) wasn't sufficient; a newly published
 * post didn't reliably appear without this stated directly here too (same
 * finding, same fix, as app/blog/page.tsx). With force-dynamic in effect,
 * static generation never happens for this route, so pre-generating params
 * for a fixed set of fallback slugs would be dead code — removed rather than
 * left looking like it still does something.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return {};
  return {
    title: post.title,
    description: post.excerpt,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: "article",
      title: post.title,
      description: post.excerpt,
      url: `/blog/${slug}`,
      publishedTime: new Date(post.date).toISOString(),
      ...(post.coverImageUrl ? { images: [{ url: post.coverImageUrl }] } : {}),
    },
  };
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return notFound();

  return (
    <article className="px-6 py-16">
      <div className="mx-auto max-w-2xl">
        <Link href="/blog" className="text-sm font-medium text-ink-faint hover:text-ink">
          ← Blog
        </Link>
        <p className="mt-6 text-xs font-semibold uppercase tracking-wide text-brand">
          {post.tag} · {post.readMins} min read
        </p>
        <h1 className="mt-3 font-display text-4xl font-semibold leading-tight tracking-tight">
          {post.title}
        </h1>
        <p className="mt-4 text-lg text-ink-mute">{post.excerpt}</p>

        {post.coverImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={post.coverImageUrl}
            alt=""
            className="mt-8 w-full rounded-2xl border border-line object-cover"
          />
        )}

        <div className="mt-10">
          {post.content ? (
            <Markdown content={post.content} />
          ) : (
            <p className="text-ink-mute">This post doesn&apos;t have body content yet.</p>
          )}
        </div>
      </div>
    </article>
  );
}
