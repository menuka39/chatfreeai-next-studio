import type { MetadataRoute } from "next";
import { loadBranding } from "@/lib/branding";

// Branding is admin-editable at runtime — without this, Next.js statically
// generates this route once at build time and freezes whatever site_settings
// happened to say THEN, ignoring every change made afterward from /admin.
export const dynamic = "force-dynamic";

/**
 * Web App Manifest — lets a phone "Add to Home Screen" the site with a real
 * name and icon instead of just bookmarking a URL, and sets the colour
 * Android/Chrome paint around the page (status bar, task-switcher card) to
 * match the Switchboard palette instead of a default white.
 *
 * Points at the same request-time-generated icon as the browser tab and iOS
 * home screen (app/icon.tsx) — one icon definition, reused everywhere,
 * rather than a separate static PNG that could drift from the admin-set logo.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { siteName, tagline } = await loadBranding();

  return {
    name: siteName,
    short_name: siteName.length > 16 ? siteName.split(" ")[0] : siteName,
    description: tagline || "Free multi-model AI chat, no sign-up.",
    start_url: "/",
    display: "standalone",
    background_color: "#0A0A0E",
    theme_color: "#0A0A0E",
    icons: [
      { src: "/icon", sizes: "32x32", type: "image/png" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
