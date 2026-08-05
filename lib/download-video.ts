/**
 * Forces a real file download for generated videos.
 *
 * THE BUG THIS FIXES: `<a href="https://provider.example/x.mp4" download>` does
 * nothing useful. Browsers ignore the `download` attribute on cross-origin
 * URLs, so the click opens the video in a tab (or navigates away from the
 * page) instead of saving it. Provider links are always cross-origin, so every
 * "Download" on an individual clip was silently not downloading.
 *
 * Fetching the bytes through our own signed proxy makes the response
 * same-origin, and a blob URL then downloads properly with the filename we
 * choose.
 */

export interface DownloadOptions {
  onProgress?: (loadedBytes: number, totalBytes: number | null) => void;
  signal?: AbortSignal;
}

/** Filesystem-safe filename. */
export function videoFilename(parts: (string | number | undefined)[], ext = "mp4") {
  const base = parts
    .filter((p) => p !== undefined && p !== "")
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "video"}.${ext}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // give the browser a moment to start the download before revoking
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * @param source  a Blob, a blob: URL, or a SAME-ORIGIN url (use the signed
 *                proxy for provider links — a raw provider URL will fail CORS)
 */
export async function downloadVideo(
  source: string | Blob,
  filename: string,
  { onProgress, signal }: DownloadOptions = {},
): Promise<void> {
  if (source instanceof Blob) {
    saveBlob(source, filename);
    return;
  }

  const res = await fetch(source, { signal });
  if (!res.ok) {
    throw new Error(
      res.status === 502
        ? "That link has expired — regenerate the clip to download it."
        : `Download failed (${res.status}).`,
    );
  }

  // stream so a large file can report progress instead of hanging silently
  const total = Number(res.headers.get("content-length")) || null;
  if (!res.body || !onProgress) {
    saveBlob(await res.blob(), filename);
    return;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress(loaded, total);
  }
  saveBlob(new Blob(chunks as BlobPart[], { type: "video/mp4" }), filename);
}

/**
 * Save several clips one after another.
 *
 * Browsers throttle or block rapid programmatic downloads, so these are spaced
 * out. Failures are collected rather than thrown, so one expired link doesn't
 * cancel the rest.
 */
export async function downloadAll(
  items: { source: string | Blob; filename: string }[],
  onStatus?: (index: number, total: number) => void,
): Promise<{ failed: string[] }> {
  const failed: string[] = [];
  for (let i = 0; i < items.length; i++) {
    onStatus?.(i + 1, items.length);
    try {
      await downloadVideo(items[i].source, items[i].filename);
    } catch {
      failed.push(items[i].filename);
    }
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 800));
  }
  return { failed };
}
