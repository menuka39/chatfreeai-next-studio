import ShowcasePanel from "@/components/admin/ShowcasePanel";

export default function AdminShowcasePage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Video Showcase</h1>
      <p className="mt-1 text-ink-mute">
        Curated media shown on the video and image generators. Visitors tap one to load its
        prompt — so these are both a demo of what the tool does and a starting point for their
        first generation. Tick <strong>Guess</strong> on an item to show it on that studio&apos;s
        Guess tab as well.
      </p>
      <div className="mt-6">
        <ShowcasePanel />
      </div>
    </div>
  );
}
