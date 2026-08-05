/**
 * Saves generated images, with optional format conversion.
 *
 * Provider images arrive either as a data: URI (base64) or an https URL. A
 * data URI downloads fine, but `<a href="https://provider…" download>` does
 * NOT — browsers ignore the download attribute cross-origin, so that click
 * would open a tab instead of saving. Fetching to a blob first fixes both.
 *
 * Conversion runs on a canvas so people can grab a JPEG for email or a WebP
 * for the web without regenerating (and paying) again. PNG is kept lossless
 * and is the only format that preserves transparency.
 */

export type SaveFormat = "png" | "jpeg" | "webp";

export function imageFilename(parts: (string | number | undefined)[], ext: SaveFormat) {
  const base = parts
    .filter((p) => p !== undefined && p !== "")
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
  return `${base || "image"}.${ext}`;
}

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function toBlob(src: string): Promise<Blob> {
  const res = await fetch(src);
  if (!res.ok) throw new Error("That image link has expired — regenerate it to download.");
  return res.blob();
}

/** Re-encode via canvas. Returns null if the browser can't produce that type. */
async function convert(src: string, format: SaveFormat, quality = 0.92): Promise<Blob | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Could not read that image."));
    el.src = src;
  });

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // JPEG has no alpha — without this, transparency renders black
  if (format === "jpeg") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b), `image/${format}`, format === "png" ? undefined : quality),
  );
}

export async function downloadImage(src: string, filename: string, format?: SaveFormat): Promise<void> {
  const current: SaveFormat = src.startsWith("data:image/jpeg")
    ? "jpeg"
    : src.startsWith("data:image/webp")
      ? "webp"
      : "png";

  if (!format || format === current) {
    saveBlob(await toBlob(src), filename);
    return;
  }

  const converted = await convert(src, format);
  if (!converted) {
    // browser refused that type — save the original rather than failing
    saveBlob(await toBlob(src), filename);
    return;
  }
  saveBlob(converted, filename);
}

/** Copy an image to the clipboard. PNG only — the format clipboards accept. */
export async function copyImage(src: string): Promise<void> {
  if (!navigator.clipboard || !window.ClipboardItem) {
    throw new Error("This browser can't copy images to the clipboard.");
  }
  const png = (await convert(src, "png")) ?? (await toBlob(src));
  await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
}

export async function downloadAllImages(
  items: { src: string; filename: string }[],
  format?: SaveFormat,
  onStatus?: (i: number, n: number) => void,
): Promise<{ failed: number }> {
  let failed = 0;
  for (let i = 0; i < items.length; i++) {
    onStatus?.(i + 1, items.length);
    try {
      await downloadImage(items[i].src, items[i].filename, format);
    } catch {
      failed++;
    }
    // browsers throttle rapid programmatic downloads
    if (i < items.length - 1) await new Promise((r) => setTimeout(r, 700));
  }
  return { failed };
}
