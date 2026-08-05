/**
 * Public blog reads — Supabase-backed, with a fallback to the original
 * static array.
 *
 * serviceQuery() returns `null` for two different situations: Supabase isn't
 * configured at all, or the query genuinely failed at runtime. Both are
 * reasonable to fall back on — better to show the built-in posts than a
 * broken or empty blog. `null` is distinct from an empty array `[]`, which
 * means the query succeeded and there really are zero published posts (a
 * real state, not a failure) — that case is NOT covered by the fallback.
 */

import { serviceQuery } from "./supabase/server";
import { posts as staticPosts, type Post as StaticPost } from "./data";

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  date: string;
  readMins: number;
  tag: string;
  /** null for the 3 originally-migrated static posts, which predate this field */
  coverImageUrl: string | null;
}

interface PostRow {
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  published_at: string | null;
  read_mins: number;
  tag: string;
  cover_image_url: string | null;
}

const fromStatic = (p: StaticPost): BlogPost => ({ ...p, content: "", coverImageUrl: null });

const fromRow = (r: PostRow): BlogPost => ({
  slug: r.slug,
  title: r.title,
  excerpt: r.excerpt,
  content: r.content,
  date: r.published_at ?? new Date().toISOString(),
  readMins: r.read_mins,
  tag: r.tag,
  coverImageUrl: r.cover_image_url,
});

const SELECT = "slug,title,excerpt,content,published_at,read_mins,tag,cover_image_url";

export async function listPublishedPosts(): Promise<BlogPost[]> {
  const rows = await serviceQuery<PostRow[]>(`blog_posts?status=eq.published&select=${SELECT}&order=published_at.desc`);
  if (rows === null) return staticPosts.map(fromStatic);
  return rows.map(fromRow);
}

export async function getPublishedPost(slug: string): Promise<BlogPost | null> {
  const rows = await serviceQuery<PostRow[]>(
    `blog_posts?status=eq.published&slug=eq.${encodeURIComponent(slug)}&select=${SELECT}&limit=1`,
  );
  if (rows === null) {
    const p = staticPosts.find((x) => x.slug === slug);
    return p ? fromStatic(p) : null;
  }
  if (!rows.length) return null;
  return fromRow(rows[0]);
}
