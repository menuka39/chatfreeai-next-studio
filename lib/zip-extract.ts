/**
 * Reads a code archive (.zip) in the browser and turns it into readable text.
 *
 * The use case is "here's my plugin, find the bug" — which needs the files, not
 * the binary. Everything happens client-side, so the archive never reaches our
 * servers.
 *
 * THREE THINGS THIS GUARDS AGAINST
 *
 * 1. ZIP BOMBS. A 40KB archive can expand to gigabytes and hang the tab. Entry
 *    sizes are summed from the directory BEFORE anything is decompressed, and
 *    the whole archive is refused past a ceiling.
 *
 * 2. RUNAWAY TOKEN COST. This is the single most expensive attachment we
 *    support — a plugin can hold hundreds of files. Noise directories are
 *    skipped, only source-like files are read, and hard caps apply on file
 *    count and total characters. The user is told exactly what was included.
 *
 * 3. MISLEADING PATHS. Entries can carry names like `../../etc/passwd`. We
 *    never write to disk so there's nothing to traverse, but such a path must
 *    not be shown to the model as if it were a real project path, so names are
 *    normalised.
 */

import { unzipSync, strFromU8 } from "fflate";

export interface ZipFileEntry {
  path: string;
  text: string;
  bytes: number;
}

export interface ZipExtractResult {
  files: ZipFileEntry[];
  /** every path in the archive, so the model sees the shape of the project */
  tree: string[];
  totalEntries: number;
  skipped: number;
  truncated: boolean;
  chars: number;
}

/** Refuse archives whose uncompressed contents exceed this — bomb protection. */
export const ZIP_MAX_UNCOMPRESSED = 40 * 1_048_576;
export const ZIP_MAX_FILES = 60;
export const ZIP_MAX_CHARS = 100_000;
/** A single enormous file (a minified bundle, a data dump) is not worth reading. */
export const ZIP_MAX_FILE_BYTES = 200_000;

/** Directories that are noise in a code review and enormous in token terms. */
const SKIP_DIRS = [
  "node_modules/", ".git/", "vendor/", "dist/", "build/", ".next/", "__pycache__/",
  ".venv/", "venv/", "coverage/", ".cache/", "bower_components/", ".idea/", ".vscode/",
];

const SKIP_FILE_PATTERNS = [/\.min\.(js|css)$/i, /\.map$/i, /package-lock\.json$/i, /yarn\.lock$/i, /composer\.lock$/i];

const TEXT_EXT = [
  ".php", ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".css", ".scss", ".html", ".htm",
  ".json", ".xml", ".yml", ".yaml", ".md", ".txt", ".py", ".rb", ".go", ".rs", ".java",
  ".c", ".h", ".cpp", ".cs", ".sh", ".sql", ".env.example", ".ini", ".conf", ".toml",
  ".gitignore", ".htaccess", ".pot", ".po",
];

const isTextPath = (p: string) => {
  const lower = p.toLowerCase();
  if (SKIP_FILE_PATTERNS.some((re) => re.test(lower))) return false;
  return TEXT_EXT.some((ext) => lower.endsWith(ext));
};

/** Strip traversal segments and leading slashes so a path is safe to display. */
function normalisePath(raw: string): string {
  return raw
    .replace(/\\/g, "/")
    .split("/")
    .filter((seg) => seg && seg !== "." && seg !== "..")
    .join("/");
}

const skipDir = (p: string) => SKIP_DIRS.some((d) => p === d.slice(0, -1) || p.includes(`/${d}`) || p.startsWith(d));

export async function extractZip(file: File): Promise<ZipExtractResult> {
  const buffer = new Uint8Array(await file.arrayBuffer());

  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(buffer);
  } catch {
    throw new Error(`${file.name} couldn't be opened — it may be corrupt or password-protected.`);
  }

  const names = Object.keys(entries);
  if (!names.length) throw new Error(`${file.name} is empty.`);

  // Bomb check BEFORE reading anything into strings.
  const uncompressed = names.reduce((n, k) => n + entries[k].length, 0);
  if (uncompressed > ZIP_MAX_UNCOMPRESSED) {
    throw new Error(
      `${file.name} expands to ${Math.round(uncompressed / 1_048_576)}MB, which is too large to read here. ` +
        `Attach the specific files you want reviewed instead.`,
    );
  }

  const tree: string[] = [];
  const files: ZipFileEntry[] = [];
  let skipped = 0;
  let chars = 0;
  let truncated = false;

  for (const raw of names) {
    const path = normalisePath(raw);
    if (!path || path.endsWith("/")) continue; // directory entry

    tree.push(path);

    if (skipDir(path) || !isTextPath(path)) {
      skipped++;
      continue;
    }
    const data = entries[raw];
    if (data.length > ZIP_MAX_FILE_BYTES) {
      skipped++;
      continue;
    }
    if (files.length >= ZIP_MAX_FILES || chars >= ZIP_MAX_CHARS) {
      truncated = true;
      skipped++;
      continue;
    }

    let text: string;
    try {
      text = strFromU8(data);
    } catch {
      skipped++;
      continue;
    }
    // a stray binary that slipped past the extension check
    if (text.includes("\u0000")) {
      skipped++;
      continue;
    }

    const room = ZIP_MAX_CHARS - chars;
    if (text.length > room) {
      text = `${text.slice(0, room)}\n[... truncated]`;
      truncated = true;
    }
    files.push({ path, text, bytes: data.length });
    chars += text.length;
  }

  if (!files.length) {
    throw new Error(
      `No readable source files found in ${file.name}. It may contain only binaries, or everything sits under a skipped folder like node_modules.`,
    );
  }

  return { files, tree, totalEntries: names.length, skipped, truncated, chars };
}

/** Render the archive as one document the model can read. */
export function zipToText(name: string, r: ZipExtractResult): string {
  const shownTree = r.tree.slice(0, 200);
  const header =
    `Archive: ${name}\n` +
    `${r.totalEntries} entries, ${r.files.length} source files included, ${r.skipped} skipped` +
    `${r.truncated ? " (limit reached)" : ""}\n\n` +
    `Project structure:\n${shownTree.join("\n")}` +
    `${r.tree.length > shownTree.length ? `\n… ${r.tree.length - shownTree.length} more` : ""}\n`;

  const body = r.files
    .map((f) => `\n--- ${f.path} ---\n\`\`\`\n${f.text}\n\`\`\``)
    .join("\n");

  return `${header}${body}`;
}
