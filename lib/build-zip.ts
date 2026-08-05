/**
 * Turns files written in an assistant reply into a downloadable .zip.
 *
 * The reverse of lib/zip-extract.ts: the model writes a plugin or a project,
 * and the user gets an archive instead of copying twenty code blocks by hand.
 * Everything is packed in the browser, so nothing generated here touches our
 * servers.
 *
 * THE SECURITY POINT THAT MATTERS — "ZIP SLIP". A zip entry named
 * `../../.bashrc` will, in many extraction tools, write OUTSIDE the folder the
 * user chose. We are building the archive, so a model that emits such a path —
 * whether confused or steered there by a prompt injection in an attached file —
 * would hand the user an archive that attacks their own machine on extract.
 * Every path is therefore stripped of traversal segments, drive letters and
 * leading slashes before it goes in, and anything that normalises to nothing is
 * dropped.
 */

import { zipSync, strToU8 } from "fflate";

export interface BuiltFile {
  path: string;
  code: string;
  lang: string;
}

/** Caps: a reply shouldn't be able to produce an unreasonable archive. */
export const BUILD_MAX_FILES = 80;
export const BUILD_MAX_BYTES = 5 * 1_048_576;

/**
 * Make a zip entry path safe to extract anywhere.
 * Returns null when nothing usable is left.
 */
export function safeEntryPath(raw: string): string | null {
  const cleaned = raw
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\\/g, "/")
    .replace(/^[a-zA-Z]:/, "")  // drive letter
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")   // traversal
    // A leading `~` or `~user` used as a DIRECTORY is a home reference that a
    // shell-based extraction script could expand. A filename that merely starts
    // with a tilde is legitimate (`~$report.docx`), so only strip the segment
    // when something follows it.
    .filter((seg, i, arr) => !(i === 0 && arr.length > 1 && /^~[a-z0-9_-]*$/i.test(seg)))
    .map((seg) => seg.replace(/[\u0000-\u001f]/g, "").trim())
    .filter(Boolean)
    .join("/");

  if (!cleaned) return null;
  // a path is a path, not a sentence — reject prose that happened to match
  if (cleaned.length > 200 || /\s{2,}/.test(cleaned)) return null;
  return cleaned;
}

/** Does this look like a file path rather than a language name or a sentence? */
function looksLikePath(s: string): boolean {
  const t = s.trim().replace(/^["'`]|["'`]$/g, "");
  if (!t || t.length > 200) return false;
  if (/\s/.test(t) && !t.includes("/")) return false;
  return /\.[a-z0-9]{1,10}$/i.test(t) || t.includes("/");
}

const FIRST_LINE_PATH = [
  /^\s*\/\/\s*(?:file:|filename:)?\s*(\S+\.[a-z0-9]{1,10})\s*$/i,
  /^\s*#\s*(?:file:|filename:)?\s*(\S+\.[a-z0-9]{1,10})\s*$/i,
  /^\s*<!--\s*(?:file:|filename:)?\s*(\S+\.[a-z0-9]{1,10})\s*-->\s*$/i,
  /^\s*\/\*\s*(?:file:|filename:)?\s*(\S+\.[a-z0-9]{1,10})\s*\*\/\s*$/i,
];

/**
 * Pull labelled files out of a markdown reply.
 *
 * Handles the ways models actually label code: an info string
 * (```php includes/foo.php), a title attribute, a bold/heading line just above
 * the fence, or a `// file:` comment on the first line.
 */
export function parseFiles(markdown: string): BuiltFile[] {
  const files: BuiltFile[] = [];
  const seen = new Set<string>();
  const fence = /^([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^\1\2[ \t]*$/gm;

  let match: RegExpExecArray | null;
  while ((match = fence.exec(markdown)) !== null) {
    const info = match[3].trim();
    let body = match[4];

    // 1. info string: ```php path/to/file.php   or   ```php title="file.php"
    const titleAttr = info.match(/title\s*=\s*["']([^"']+)["']/i);
    const infoParts = info.split(/\s+/);
    const lang = infoParts[0]?.replace(/[^a-z0-9+#-]/gi, "") ?? "";
    let path: string | null = null;

    if (titleAttr) path = titleAttr[1];
    else if (infoParts.length > 1 && looksLikePath(infoParts.slice(1).join(" "))) {
      path = infoParts.slice(1).join(" ");
    } else if (looksLikePath(info) && infoParts.length === 1 && info.includes(".")) {
      path = info; // ```my-plugin.php
    }

    // 2. a first-line comment naming the file
    if (!path) {
      const firstLine = body.split("\n", 1)[0] ?? "";
      for (const re of FIRST_LINE_PATH) {
        const m = firstLine.match(re);
        if (m) {
          path = m[1];
          body = body.slice(firstLine.length + 1); // drop the marker line
          break;
        }
      }
    }

    // 3. a bold or heading line immediately above the fence
    if (!path) {
      const before = markdown.slice(0, match.index).trimEnd().split("\n").pop() ?? "";
      const label = before.match(/^\s*(?:#{1,6}\s*)?\*{0,2}`?([^`*\n]+?)`?\*{0,2}\s*:?\s*$/);
      if (label && looksLikePath(label[1])) path = label[1];
    }

    if (!path) continue;
    const safe = safeEntryPath(path);
    if (!safe || seen.has(safe)) continue;

    seen.add(safe);
    files.push({ path: safe, code: body.replace(/\n$/, ""), lang });
    if (files.length >= BUILD_MAX_FILES) break;
  }

  return files;
}

/** Suggest an archive name from the file set. */
export function suggestZipName(files: BuiltFile[]): string {
  const roots = files.map((f) => (f.path.includes("/") ? f.path.split("/")[0] : null)).filter(Boolean);
  const root = roots.length && roots.every((r) => r === roots[0]) ? roots[0]! : null;
  const base = root ?? files[0]?.path.replace(/\.[^.]+$/, "") ?? "project";
  return `${base.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-|-$/g, "") || "project"}.zip`;
}

export interface BuildResult {
  blob: Blob;
  fileCount: number;
  bytes: number;
  /** files left out because they alone exceeded the size budget */
  skipped: string[];
}

export function buildZip(files: BuiltFile[]): BuildResult {
  if (!files.length) throw new Error("No labelled files found in that reply.");

  const entries: Record<string, Uint8Array> = {};
  let bytes = 0;

  const skipped: string[] = [];

  for (const f of files.slice(0, BUILD_MAX_FILES)) {
    // safeEntryPath already ran in parseFiles, but this function is exported —
    // never trust the caller to have sanitised for us
    const safe = safeEntryPath(f.path);
    if (!safe) continue;
    const data = strToU8(f.code.endsWith("\n") ? f.code : `${f.code}\n`);

    // Skip a file that doesn't fit and keep going. Breaking here meant one
    // oversized file discarded every smaller file after it, and the whole
    // download failed with nothing to show for it.
    if (bytes + data.length > BUILD_MAX_BYTES) {
      skipped.push(safe);
      continue;
    }
    entries[safe] = data;
    bytes += data.length;
  }

  const count = Object.keys(entries).length;
  if (!count) {
    throw new Error(
      skipped.length
        ? "Those files are too large to package here — copy them individually instead."
        : "None of those file paths were usable.",
    );
  }

  const zipped = zipSync(entries, { level: 6 });
  return {
    blob: new Blob([zipped as unknown as BlobPart], { type: "application/zip" }),
    fileCount: count,
    bytes,
    skipped,
  };
}
