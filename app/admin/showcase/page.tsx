import ShowcasePanel from "@/components/admin/ShowcasePanel";

export default function AdminShowcasePage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Showcase gallery</h1>
      <p className="mt-1 text-ink-mute">
        Curated clips shown on the video generator. Visitors tap one to load its prompt — so these
        are both a demo of what the tool does and a starting point for their first generation.
      </p>
      <div className="mt-6">
        <ShowcasePanel />
      </div>
    </div>
  );
}
