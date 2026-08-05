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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const posts = await listPublishedPosts();
  return [
    { url: BASE, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${BASE}/pricing`, lastModified: now, changeFrequency: "weekly", priority: 0.9 },
    { url: `${BASE}/tools`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${BASE}/tools/submit`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    ...tools.map((t) => ({
      url: `${BASE}/tools/${t.slug}`,
      lastModified: now,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    })),
    { url: `${BASE}/blog`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    ...posts.map((p) => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: new Date(p.date),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
    { url: `${BASE}/login`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    { url: `${BASE}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/privacy-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/return-policy`, lastModified: now, changeFrequency: "yearly", priority: 0.2 },
    { url: `${BASE}/disclaimer`, lastModified: now, changeFrequency: "yearly", priority: 0.1 },
    { url: `${BASE}/contact`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
  ];
}
