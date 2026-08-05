/**
 * Single source of truth for site identity — name, tagline, logo — read from
 * the admin-editable site_settings table (see /admin/settings), with a
 * fallback whenever nothing's been set yet.
 *
 * Used by Header.tsx, app/icon.tsx, app/apple-icon.tsx, and app/manifest.ts,
 * so a logo uploaded once in the admin panel appears everywhere the site's
 * identity is shown — the header, the browser tab, the phone home-screen
 * icon, and the "Add to Home Screen" manifest — instead of four places each
 * quietly drifting out of sync.
 *
 * No caching directive on the underlying fetch, so a change from
 * /admin/settings is live on the very next request everywhere it's read.
 */

import { serviceQuery } from "./supabase/server";

export interface Branding {
  siteName: string;
  tagline: string;
  logoUrl: string | null;
}

interface SettingRow {
  key: string;
  value: string | null;
}

const DEFAULT_SITE_NAME = "Chat Free AI";

export async function loadBranding(): Promise<Branding> {
  const rows = await serviceQuery<SettingRow[]>("site_settings?select=key,value");
  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));
  return {
    siteName: map.site_name || DEFAULT_SITE_NAME,
    tagline: map.tagline || "",
    logoUrl: map.logo_url || null,
  };
}
