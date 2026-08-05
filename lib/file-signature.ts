/**
 * Real file-type detection from magic bytes, not the browser-supplied
 * Content-Type header — that header is entirely client-controlled (a request
 * can declare any type for any bytes; `curl -F "file=@x;type=image/png"`
 * proves this trivially). Trusting it to gate an upload means an attacker
 * could label arbitrary content as an allowed image type and have it stored
 * with that Content-Type on a public URL.
 *
 * Detects the REAL type from the file's own header bytes and returns that —
 * callers should allow-list against this, and use it (not the claimed type)
 * for the storage Content-Type and file extension.
 */

export type DetectedImageType = "image/png" | "image/jpeg" | "image/webp" | null;

export function detectImageType(bytes: Uint8Array): DetectedImageType {
  if (bytes.length < 12) return null;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export const EXT_FOR: Record<Exclude<DetectedImageType, null>, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
