import type { MetadataRoute } from "next";
import { tools } from "@/lib/data";
import { listPublishedPosts } from "@/lib/blog";

const BASE = process.env.SITE_URL ?? "https://chatfreeai.com";

// same reasoning as app/icon.tsx, app/apple-icon.tsx, app/manifest.ts and the
// root layout: this route reads from the database now (published blog
// posts), and without force-dynamic it can be statically generated once at
// build time, silently freezing whatever posts existed then — a post
// published later through /admin/blog would never appear here
export const dynamic = "force-dynamic";

/**
 * Blog posts are DB-driven now (see /admin/blog) — this used to import the
 * static `posts` array, which meant a post published later through the
 * admin panel never got a sitemap entry at all (undiscoverable except via
 * internal links), and a post that was unpublished or deleted stayed listed
 * here forever, pointing search engines at a URL that no longer resolves.
 * `listPublishedPosts()` is the same DB-first, static-fallback function the
 * public /blog pages already use, so this always matches what's actually live.
 */
/**
 * The newest post is the only date this site can honestly vouch for.
 *
 * Everything else — the tool pages, the policies — changes when it is deployed
 * and there is no per-page record of when that was. Stamping them all with the
 * current time, which this used to do, is the documented way to make lastmod
 * worthless: Google only trusts the value while it is verifiably accurate, and
 * a sitemap where all 31 URLs change every time it is fetched teaches it to
 * ignore the field entirely — including on the blog posts, where the dates are
 * real and useful.
 *
 * So lastmod goes on the posts and nowhere else. Omitting it is not a gap;
 * it is the honest answer to "when did this last change?"
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const posts = await listPublishedPosts();

  /*
   * `priority` is gone. Google states plainly that it ignores the field — it
   * was abused into meaninglessness years ago — and it was never a ranking
   * input, only an occasional hint about crawl order within one site.
   *
   * `changeFrequency` stays: Google ignores it too, but some of the engines
   * IndexNow reaches still read it, and the values here match how the pages
   * actually behave rather than claiming everything is urgent.
   */
  const page = (path: string, changeFrequency: "daily" | "weekly" | "monthly" | "yearly") => ({
    url: `${BASE}${path}`,
    changeFrequency,
  });

  return [
    // trailing slash on purpose: this is the form Google already has indexed
    page("/", "daily"),
    page("/pricing", "weekly"),
    page("/tools", "weekly"),
    page("/tools/submit", "weekly"),
    ...tools.map((t) => page(`/tools/${t.slug}`, "weekly")),
    page("/blog", "weekly"),
    ...posts.map((p) => ({
      url: `${BASE}/blog/${p.slug}`,
      // a real date, from the post itself
      lastModified: new Date(p.date),
      changeFrequency: "monthly" as const,
    })),
    page("/terms", "yearly"),
    page("/privacy-policy", "yearly"),
    page("/return-policy", "yearly"),
    page("/disclaimer", "yearly"),
    page("/contact", "yearly"),
  ];
}
