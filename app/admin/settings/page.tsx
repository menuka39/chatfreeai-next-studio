import { serviceQuery } from "@/lib/supabase/server";
import SettingsForm from "@/components/admin/SettingsForm";

interface SettingRow {
  key: string;
  value: string | null;
}

export default async function AdminSettingsPage() {
  const rows = await serviceQuery<SettingRow[]>("site_settings?select=key,value");
  const map = Object.fromEntries((rows ?? []).map((r) => [r.key, r.value]));

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Site settings</h1>
      <p className="mt-1 text-ink-mute">Logo and site identity, shown across every page.</p>
      <div className="mt-6">
        <SettingsForm
          initialSiteName={map.site_name ?? "Chat Free AI"}
          initialTagline={map.tagline ?? ""}
          initialLogoUrl={map.logo_url ?? null}
        />
      </div>
    </div>
  );
}
