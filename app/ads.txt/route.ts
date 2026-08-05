import { ADSENSE_CLIENT_ID, adsenseConfigured } from "@/lib/adsense";

/**
 * ads.txt — the IAB file that tells ad buyers which sellers may sell this
 * site's inventory. Google requires it for AdSense, and a missing or wrong
 * one is a common reason ads silently stop filling.
 *
 * Served as a route rather than a static public/ads.txt so it derives from
 * the same publisher id the loader uses — a static file would be a second
 * copy of that id to keep in sync by hand, and the failure mode (ads quietly
 * not filling, no error anywhere) is exactly the kind that goes unnoticed.
 *
 * Serves an empty body until a real publisher id is set: publishing an
 * ads.txt with a placeholder id would actively declare a nonexistent seller
 * as authorised, which is worse than having no file at all.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const body = adsenseConfigured
    ? `google.com, ${ADSENSE_CLIENT_ID.replace(/^ca-/, "")}, DIRECT, f08c47fec0942fa0\n`
    : "";

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
