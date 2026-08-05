"use client";

import { useState } from "react";

const OPTIONS: { id: string; label: string; hint: string }[] = [
  { id: "improve", label: "Improve writing", hint: "Clearer sentences, better flow" },
  { id: "grammar", label: "Fix grammar & spelling", hint: "No content changes" },
  { id: "shorter", label: "Make it shorter", hint: "Same points, less text" },
  { id: "longer", label: "Make it longer", hint: "More detail and examples" },
  { id: "continue", label: "Continue writing", hint: "Picks up where it stops" },
];

export default function AssistantModal({
  selectedText,
  fullText,
  onApply,
  onClose,
}: {
  /** the current textarea selection, if any — assist runs on this if present, otherwise the whole content */
  selectedText: string;
  fullText: string;
  onApply: (result: string, targetWasSelection: boolean) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const targetWasSelection = selectedText.trim().length > 0;
  const target = targetWasSelection ? selectedText : fullText;

  async function run(action: string) {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch("/api/admin/blog/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text: target }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message ?? "Could not run that.");
        return;
      }
      onApply(json.result, targetWasSelection);
      onClose();
    } catch {
      setError("Connection lost. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="font-semibold text-ink">✨ Assistant</p>
        <p className="mt-1 text-[12.5px] text-ink-mute">
          {targetWasSelection ? `Runs on your selection (${selectedText.length} characters).` : "Runs on the whole content — select text first to target just that part."}
        </p>

        <div className="mt-4 space-y-1.5">
          {OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => run(opt.id)}
              disabled={busy !== null || !target.trim()}
              className="flex w-full flex-col rounded-lg border border-line px-3 py-2 text-left hover:border-brand disabled:opacity-40"
            >
              <span className="text-[13.5px] font-semibold text-ink">
                {busy === opt.id ? "Working…" : opt.label}
              </span>
              <span className="text-[11.5px] text-ink-faint">{opt.hint}</span>
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-[12.5px] font-semibold text-warn">{error}</p>}

        <button onClick={onClose} className="mt-4 text-[12.5px] font-semibold text-ink-faint hover:text-ink">
          Cancel
        </button>
      </div>
    </div>
  );
}
