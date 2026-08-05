import LimitsPanel from "@/components/admin/LimitsPanel";
import PriorityPricingPanel from "@/components/admin/PriorityPricingPanel";

export default function AdminLimitsPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Limits &amp; pricing</h1>
      <p className="mt-1 text-ink-mute">
        Credits and prices for every tier. A save that would lose money on the worst-case usage
        pattern is refused — not just warned about.
      </p>
      <div className="mt-6">
        <LimitsPanel />
      </div>

      <h2 className="mt-10 font-display text-lg font-semibold">Tool submission — Priority Listing</h2>
      <p className="mt-1 text-ink-mute">
        No credits or AI cost tied to these — paying just skips the free review queue, so there&apos;s
        no profit check here, just real positive prices.
      </p>
      <div className="mt-4">
        <PriorityPricingPanel />
      </div>
    </div>
  );
}
