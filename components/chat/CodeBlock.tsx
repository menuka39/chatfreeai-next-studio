"use client";

import { useRef, useState } from "react";

/**
 * A code block with a language label and a copy button.
 *
 * Copying is the single most common thing anyone does with a code answer, and
 * selecting a long block by hand on a phone is genuinely painful — so the
 * button is always visible on touch and appears on hover on desktop, rather
 * than being hidden behind a hover-only interaction that never fires on mobile.
 */
export default function CodeBlock({
  language,
  children,
}: {
  language: string | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    const text = ref.current?.innerText ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setFailed(false);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // clipboard is blocked on insecure origins and in some embedded webviews
      setFailed(true);
      setTimeout(() => setFailed(false), 2600);
    }
  }

  return (
    <div className="group relative my-3 overflow-hidden rounded-xl border border-line bg-[#0e0e12]">
      <div className="flex items-center justify-between border-b border-line/60 px-3 py-1.5">
        <span className="font-mono text-[11px] uppercase tracking-wide text-ink-faint">
          {language || "code"}
        </span>
        <button
          onClick={copy}
          aria-label="Copy code"
          className="rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-ink-mute transition-colors hover:border-brand hover:text-ink"
        >
          {copied ? "Copied ✓" : failed ? "Press Ctrl+C" : "Copy"}
        </button>
      </div>
      <pre ref={ref} className="overflow-x-auto p-3.5 text-[13px] leading-relaxed">
        {children}
      </pre>
    </div>
  );
}
