import { NextRequest } from "next/server";
import { requireAdmin, isValidId } from "@/lib/admin";
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
  status: string;
  published_at: string | null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isValidId(id)) return deny(400, "bad_request", "That isn't a valid post id.");
  const rows = await serviceQuery<PostRow[]>(`blog_posts?id=eq.${encodeURIComponent(id)}&select=*`);
  if (!rows?.length) return deny(404, "not_found", "That post doesn't exist.");
  return Response.json({ post: rows[0] });
}

/** PATCH — partial update. Publishing (draft -> published) stamps published_at once, on the way in. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isValidId(id)) return deny(400, "bad_request", "That isn't a valid post id.");

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

  const existing = await serviceQuery<PostRow[]>(`blog_posts?id=eq.${encodeURIComponent(id)}&select=status,published_at`);
  if (!existing?.length) return deny(404, "not_found", "That post doesn't exist.");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = body.title.trim();
  if (body.slug !== undefined) patch.slug = slugify(body.slug);
  if (body.excerpt !== undefined) patch.excerpt = body.excerpt;
  if (body.content !== undefined) patch.content = body.content;
  if (body.tag !== undefined) patch.tag = body.tag.trim() || "Guides";
  if (body.coverImageUrl !== undefined) patch.cover_image_url = body.coverImageUrl;
  if (body.readMins !== undefined) patch.read_mins = Math.max(1, Math.min(60, Number(body.readMins) || 5));
  if (body.status !== undefined) {
    patch.status = body.status;
    // stamp publish time once, the first time it goes live — republishing an
    // already-published post shouldn't reset its date
    if (body.status === "published" && !existing[0].published_at) {
      patch.published_at = new Date().toISOString();
    }
  }

  const updated = await serviceQuery<PostRow[]>(`blog_posts?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(patch) });
  if (!updated?.length) return deny(500, "db_error", "Could not save changes — the slug may already be taken.");
  return Response.json({ post: updated[0] });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  const { id } = await params;
  if (!isValidId(id)) return deny(400, "bad_request", "That isn't a valid post id.");
  const result = await serviceQuery(`blog_posts?id=eq.${encodeURIComponent(id)}`, { method: "DELETE" });
  if (result === null) return deny(500, "db_error", "Could not delete that post.");
  return Response.json({ ok: true });
}
