import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { providerStatuses } from "@/lib/providers";

export const runtime = "nodejs";
// Breaker state lives in the serving instance's memory, so this must never be
// answered from a cache — a stale "healthy" reading is worse than none.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;
  return Response.json({ providers: providerStatuses() });
}
