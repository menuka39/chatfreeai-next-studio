"use client";

import type { AtsCheck } from "@/lib/resume";
import { atsScore } from "@/lib/resume";

export default function AtsPanel({ checks }: { checks: AtsCheck[] }) {
  const score = atsScore(checks);
  // two tiers, not three: the palette has mint (good) and warn (amber) but no
  // red, and amber reads correctly for anything still needing work
  const color = score >= 80 ? "text-mint" : "text-warn";

  return (
    <div className="rounded-xl border border-line bg-canvas p-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-ink-faint">ATS readiness</p>
        <p className={`text-lg font-bold ${color}`}>{score}%</p>
      </div>
      <div className="mt-2 space-y-1.5">
        {checks.map((c) => (
          <div key={c.id} className="flex items-start gap-2">
            <span className={`mt-0.5 text-[12px] ${c.pass ? "text-mint" : "text-ink-faint"}`}>{c.pass ? "✓" : "○"}</span>
            <div>
              <p className={`text-[12.5px] ${c.pass ? "text-ink-mute" : "font-medium text-ink"}`}>{c.label}</p>
              {!c.pass && <p className="text-[11px] text-ink-faint">{c.hint}</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
