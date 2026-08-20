import { ImageResponse } from "next/og";
import { loadBranding } from "@/lib/branding";

// Branding is admin-editable at runtime — without this, Next.js statically
// generates this route once at build time and freezes whatever site_settings
// happened to say THEN, ignoring every change made afterward from /admin.
export const dynamic = "force-dynamic";

/**
 * Browser-tab favicon — Next.js's file-convention icon route.
 *
 * The previous favicon.ico was create-next-app's stock default (the generic
 * Next.js logo), never replaced — meaning every browser tab showed a mark
 * with no connection to the actual site. Generated at request time so it
 * automatically reflects an admin-uploaded logo (see /admin/settings) the
 * same way the header does; without an uploaded logo it falls back to the
 * same "first letter on Signal orange" mark Header.tsx uses, so the two
 * never disagree about what the brand mark looks like.
 */

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
  const { siteName, logoUrl } = await loadBranding();

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: logoUrl ? "#0A0A0E" : "#FF7A33",
          borderRadius: 7,
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} width={28} height={28} style={{ objectFit: "contain", borderRadius: 5 }} alt="" />
        ) : (
          <span style={{ fontSize: 20, fontWeight: 700, color: "#0A0A0E", display: "flex" }}>
            {siteName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    ),
    { ...size },
  );
}
