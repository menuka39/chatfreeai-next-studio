import { ImageResponse } from "next/og";
import { loadBranding } from "@/lib/branding";

// Branding is admin-editable at runtime — without this, Next.js statically
// generates this route once at build time and freezes whatever site_settings
// happened to say THEN, ignoring every change made afterward from /admin.
export const dynamic = "force-dynamic";

/**
 * iOS home-screen icon (Next.js's apple-icon file convention). Same source
 * of truth as app/icon.tsx and Header.tsx, just larger — iOS wants 180x180
 * and, unlike a favicon, never shows it on a coloured browser-chrome
 * background, so it needs its own filled canvas rather than relying on the
 * tab bar for contrast.
 */

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
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
        }}
      >
        {logoUrl ? (
          <img src={logoUrl} width={140} height={140} style={{ objectFit: "contain", borderRadius: 24 }} alt="" />
        ) : (
          <span style={{ fontSize: 96, fontWeight: 700, color: "#0A0A0E", display: "flex" }}>
            {siteName.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
    ),
    { ...size },
  );
}
