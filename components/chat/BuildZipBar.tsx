"use client";

import { useMemo, useState } from "react";
import { parseFiles, buildZip, suggestZipName } from "@/lib/build-zip";

/**
 * Appears under an assistant reply that contains labelled files, and packs them
 * into a .zip the user can download.
 *
 * It only shows when there are at least two files, or one file inside a folder
 * — a single loose snippet is faster to copy than to download, and a button on
 * every code block would be noise.
 */
export default function BuildZipBar({ markdown }: { markdown: string }) {
  const files = useMemo(() => parseFiles(markdown), [markdown]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const worthZipping = files.length > 1 || (files.length === 1 && files[0].path.includes("/"));
  if (!worthZipping) return null;

  function download() {
    setBusy(true);
    setError(null);
    try {
      const { blob, skipped } = buildZip(files);
      if (skipped.length) {
        setError(`Packed everything except ${skipped.length} oversized file(s): ${skipped.join(", ")}`);
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestZipName(files);
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not build the archive.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2 rounded-lg border border-line bg-canvas px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={download}
          disabled={busy}
          className="rounded-lg bg-brand px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy ? "Packing…" : `⬇ Download ${files.length} files as .zip`}
        </button>
        <button
          onClick={() => setShowList((v) => !v)}
          aria-expanded={showList}
          className="text-[12px] font-semibold text-ink-mute hover:text-ink"
        >
          {showList ? "Hide files" : "What's inside?"}
        </button>
        <span className="text-[11.5px] text-ink-faint">{suggestZipName(files)}</span>
      </div>

      {showList && (
        <ul className="mt-2 space-y-0.5">
          {files.map((f) => (
            <li key={f.path} className="font-mono text-[11.5px] text-ink-mute">
              {f.path}
              <span className="ml-2 text-ink-faint">{f.code.length.toLocaleString()} chars</span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="mt-1.5 text-[12px] font-semibold text-warn">{error}</p>}
    </div>
  );
}
