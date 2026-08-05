/**
 * Four bars showing how many of the four tiers this plan represents.
 *
 * Ties the pricing ladder to the site's signal/switchboard idea — "how strong
 * is your line" — and it's a justified structural device rather than
 * decoration: the tiers ARE a real ordered progression (Free < Starter < Pro
 * < Pro Max), which is exactly the case where a marker is allowed to encode
 * real information instead of just numbering things for its own sake.
 */
export default function SignalBars({ level, total = 4 }: { level: number; total?: number }) {
  return (
    <span className="inline-flex items-end gap-[3px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full"
          style={{
            height: `${6 + i * 3.5}px`,
            backgroundColor: i < level ? "var(--brand)" : "var(--line)",
          }}
        />
      ))}
    </span>
  );
}
