import { notFound } from "next/navigation";
import { indexNowKey } from "@/lib/indexnow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Serves the IndexNow key file at /<key>.txt.
 *
 * Ownership is proved by hosting a file named after the key whose only content
 * is the key. Serving it from the environment variable rather than committing
 * a text file means rotating the key is a dashboard change, and the key never
 * sits in the repository.
 *
 * Everything else 404s, so this catch-all cannot shadow a real route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ indexnowkey: string }> },
) {
  const key = indexNowKey();
  const { indexnowkey } = await params;
  if (!key || indexnowkey !== `${key}.txt`) return notFound();

  return new Response(key, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=86400" },
  });
}
