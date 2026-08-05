import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { serviceQuery } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Server-side projects, for signed-in users.
 *
 * Anonymous visitors keep the browser-local copy — there is nowhere to put
 * theirs, and a guest's project is cheap to recreate. Once someone signs in,
 * their projects live in the database instead: a brief they have written and
 * a subscription they are paying for should survive clearing site data and
 * should be there on their phone.
 *
 * Every query is scoped by `user_id` here AND by RLS in the database. The
 * duplication is deliberate: a bug in this file cannot expose another user's
 * project, because the policy would reject the row regardless.
 */

interface Row {
  id: string;
  name: string;
  emoji: string;
  brief: string;
  created_at: string;
  updated_at: string;
}

const toClient = (r: Row) => ({
  id: r.id,
  name: r.name,
  emoji: r.emoji,
  brief: r.brief,
  createdAt: new Date(r.created_at).getTime(),
  updatedAt: new Date(r.updated_at).getTime(),
});

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

export async function GET(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return Response.json({ projects: [], signedIn: false });

  const rows = await serviceQuery<Row[]>(
    `projects?user_id=eq.${session.userId}&select=*&order=updated_at.desc`,
  );
  return Response.json({ projects: (rows ?? []).map(toClient), signedIn: true });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return deny(401, "signin_required", "Sign in to save projects to your account.");

  let body: { name?: string; emoji?: string; brief?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid request body.");
  }
  const name = (body.name ?? "").trim();
  if (!name) return deny(400, "bad_request", "A project needs a name.");

  const rows = await serviceQuery<Row[]>("projects", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      user_id: session.userId,
      name: name.slice(0, 120),
      emoji: (body.emoji ?? "📁").slice(0, 8),
      brief: (body.brief ?? "").slice(0, 4000),
    }),
  });
  if (!rows?.length) return deny(500, "db_error", "Could not save that project.");
  return Response.json({ project: toClient(rows[0]) });
}

export async function PATCH(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return deny(401, "signin_required", "Sign in to edit projects.");

  let body: { id?: string; name?: string; emoji?: string; brief?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid request body.");
  }
  if (!body.id) return deny(400, "bad_request", "Missing id.");

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim().slice(0, 120);
  if (body.emoji !== undefined) patch.emoji = body.emoji.slice(0, 8);
  if (body.brief !== undefined) patch.brief = body.brief.slice(0, 4000);

  // the user_id filter is what stops one account editing another's row even
  // if an id is guessed; RLS would also reject it
  const rows = await serviceQuery<Row[]>(
    `projects?id=eq.${encodeURIComponent(body.id)}&user_id=eq.${session.userId}`,
    { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) },
  );
  if (!rows?.length) return deny(404, "not_found", "That project no longer exists.");
  return Response.json({ project: toClient(rows[0]) });
}

export async function DELETE(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) return deny(401, "signin_required", "Sign in to delete projects.");

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return deny(400, "bad_request", "Missing id.");

  const res = await serviceQuery(
    `projects?id=eq.${encodeURIComponent(id)}&user_id=eq.${session.userId}`,
    { method: "DELETE" },
  );
  if (res === null) return deny(500, "db_error", "Could not delete that project.");
  return Response.json({ ok: true });
}
