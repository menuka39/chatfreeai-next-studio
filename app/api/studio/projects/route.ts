import { NextRequest } from "next/server";
import { getSession } from "@/lib/session";
import { serviceQuery } from "@/lib/supabase/server";
import type { StudioProject } from "@/lib/studio-projects";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The account copy of a studio library (image / video / audio / speech).
 *
 * Guests are answered with `signedIn: false` and nothing else — they keep the
 * browser copy, which is the only place a guest library can live. For a
 * signed-in user the whole list is stored as one JSON blob per kind, mirroring
 * how the WordPress studio kept it in user meta: the client owns the ordering
 * and the merge, the server just holds the bytes.
 *
 * Every query is scoped by `user_id` here AND by RLS in the database, so a bug
 * in this file still cannot hand one account another account's library.
 */

const KINDS = ["image", "video", "audio", "speech"] as const;
type Kind = (typeof KINDS)[number];

const isKind = (v: string): v is Kind => (KINDS as readonly string[]).includes(v);

/** ~4MB of JSON. A library is URLs and prompts, never the media itself. */
const MAX_BYTES = 4_000_000;

interface Row {
  data: StudioProject[];
}

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  if (!isKind(kind)) return deny(400, "bad_request", "Unknown studio kind.");

  const session = await getSession(req);
  if (!session.userId) return Response.json({ projects: [], signedIn: false });

  const rows = await serviceQuery<Row[]>(
    `studio_projects?user_id=eq.${session.userId}&kind=eq.${kind}&select=data`,
  );
  const projects = rows?.[0]?.data;
  return Response.json({
    projects: Array.isArray(projects) ? projects : [],
    signedIn: true,
  });
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);
  if (!session.userId) {
    // Not an error worth surfacing: a guest saving locally is the normal path.
    return Response.json({ ok: false, signedIn: false });
  }

  let body: { kind?: string; projects?: unknown };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid request body.");
  }

  const kind = body.kind ?? "";
  if (!isKind(kind)) return deny(400, "bad_request", "Unknown studio kind.");
  if (!Array.isArray(body.projects)) return deny(400, "bad_request", "projects must be an array.");

  const payload = JSON.stringify(body.projects);
  if (payload.length > MAX_BYTES) {
    return deny(413, "too_large", "That library is too large to sync. Delete a few projects.");
  }

  // one row per (user, kind) — resolution=merge-duplicates turns this into an
  // upsert on the composite primary key
  const ok = await serviceQuery("studio_projects?on_conflict=user_id,kind", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({
      user_id: session.userId,
      kind,
      data: body.projects,
      updated_at: new Date().toISOString(),
    }),
  });

  if (ok === null) return deny(500, "db_error", "Could not save your library.");
  return Response.json({ ok: true, signedIn: true });
}
