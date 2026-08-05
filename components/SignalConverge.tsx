/**
 * The hero's signature element.
 *
 * Every AI-aggregator page lists model logos in a row — that names the
 * feature but doesn't show it. This draws it instead: real model names on
 * thin threads converging into one point above the chat box, enacting
 * "many models, one place to talk to them" rather than describing it.
 *
 * Desktop/tablet only (lg+) — fitting eight labelled threads on a phone
 * screen without clutter isn't worth forcing, and the badge + headline
 * already carry the hierarchy there. `prefers-reduced-motion` disables the
 * pulse and draw-in so the diagram still reads instantly, just static.
 */

const NODES = [
  { label: "ChatGPT", x: 90, y: 46, wire: false },
  { label: "Claude", x: 250, y: 14, wire: false },
  { label: "Gemini", x: 430, y: 0, wire: true },
  { label: "Grok", x: 620, y: 4, wire: false },
  { label: "Deepseek", x: 800, y: 22, wire: true },
  { label: "Perplexity", x: 960, y: 54, wire: false },
  { label: "Meta AI", x: 1090, y: 96, wire: false },
  { label: "Qwen", x: 40, y: 110, wire: true },
] as const;

const CONVERGE = { x: 600, y: 330 };

function threadPath(nx: number, ny: number) {
  // gentle curve rather than a straight line — reads as a signal, not a ruler
  const midY = ny + (CONVERGE.y - ny) * 0.62;
  return `M ${nx} ${ny} Q ${nx} ${midY} ${CONVERGE.x} ${CONVERGE.y}`;
}

export default function SignalConverge() {
  return (
    <svg
      viewBox="0 0 1200 340"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
      className="pointer-events-none absolute inset-x-0 top-0 z-0 hidden h-[340px] w-full lg:block"
    >
      {NODES.map((n) => (
        <path
          key={n.label}
          d={threadPath(n.x, n.y)}
          fill="none"
          stroke={n.wire ? "var(--mint)" : "var(--brand)"}
          strokeWidth="1.25"
          strokeOpacity="0.28"
          className="signal-thread"
        />
      ))}

      {NODES.map((n) => (
        <g key={`${n.label}-node`} className="signal-node">
          <circle cx={n.x} cy={n.y} r="3" fill={n.wire ? "var(--mint)" : "var(--brand)"} fillOpacity="0.85" />
          <text
            x={n.x}
            y={n.y - 12}
            textAnchor="middle"
            className="font-mono"
            fontSize="12"
            fill="var(--ink-faint)"
            letterSpacing="0.02em"
          >
            {n.label}
          </text>
        </g>
      ))}

      {/* the convergence point — where every thread meets the chat box */}
      <circle cx={CONVERGE.x} cy={CONVERGE.y} r="3.5" fill="var(--brand)" className="signal-pulse-core" />
      <circle
        cx={CONVERGE.x}
        cy={CONVERGE.y}
        r="3.5"
        fill="none"
        stroke="var(--brand)"
        strokeWidth="1.5"
        className="signal-pulse-ring"
      />
    </svg>
  );
}
