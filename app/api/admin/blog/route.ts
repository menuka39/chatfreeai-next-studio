import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { serviceQuery } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 15;

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

interface PostRow {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  content: string;
  tag: string;
  cover_image_url: string | null;
  read_mins: number;
  status: string;
  published_at: string | null;
  updated_at: string;
}

/** GET — every post, drafts included (admin-only; the public site only ever sees status='published'). */
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const rows = await serviceQuery<PostRow[]>("blog_posts?select=*&order=updated_at.desc");
  return Response.json({ posts: rows ?? [] });
}

/** POST — create a new post (draft by default). */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  let body: Partial<{
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    tag: string;
    coverImageUrl: string | null;
    readMins: number;
    status: "draft" | "published";
  }>;
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const title = body.title?.trim();
  if (!title) return deny(400, "validation_failed", "Title is required.");
  const slug = body.slug?.trim() ? slugify(body.slug) : slugify(title);
  if (!slug) return deny(400, "validation_failed", "Could not derive a slug from that title.");

  const status = body.status === "published" ? "published" : "draft";
  const insertBody = {
    slug,
    title,
    excerpt: body.excerpt?.trim() ?? "",
    content: body.content ?? "",
    tag: body.tag?.trim() || "Guides",
    cover_image_url: body.coverImageUrl ?? null,
    read_mins: Math.max(1, Math.min(60, Number(body.readMins) || 5)),
    status,
    published_at: status === "published" ? new Date().toISOString() : null,
    author_id: gate.session.userId,
  };

  const created = await serviceQuery<PostRow[]>("blog_posts", { method: "POST", body: JSON.stringify(insertBody) });
  if (!created?.length) {
    return deny(409, "slug_taken", `A post with the slug "${slug}" already exists, or the database write failed.`);
  }
  return Response.json({ post: created[0] }, { status: 201 });
}
