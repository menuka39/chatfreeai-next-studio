/**
 * Pulls plain text out of an uploaded document, in the browser.
 *
 * Resumes arrive as PDFs. Requiring someone to open each one, select all and
 * paste is the kind of friction that makes a screening tool not worth using
 * when there are twenty candidates.
 *
 * Extraction happens client-side on purpose: the file never leaves the
 * machine, only the text does. That matters for a document full of someone
 * else's name, address and phone number — and it means no upload endpoint,
 * no storage, and nothing to leak.
 */

export interface ExtractedDoc {
  name: string;
  text: string;
}

const MAX_BYTES = 15 * 1_048_576;

/** Reads a PDF, DOCX-as-text, or plain text file into a string. */
export async function extractDocText(file: File): Promise<ExtractedDoc> {
  if (file.size > MAX_BYTES) {
    throw new Error(`${file.name} is over 15MB.`);
  }

  const lower = file.name.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return { name: file.name, text: await readPdf(file) };
  }

  // .txt, .md, .rtf and similar — read as text and let the model cope with
  // any markup left behind, which is far better than refusing the file
  if (/\.(txt|md|markdown|rtf|csv)$/.test(lower)) {
    return { name: file.name, text: await file.text() };
  }

  if (/\.docx?$/.test(lower)) {
    throw new Error(
      "Word files aren't supported yet — open it and save as PDF, or paste the text.",
    );
  }

  throw new Error(`${file.name} isn't a PDF or text file.`);
}

async function readPdf(file: File): Promise<string> {
  const pdfjs = await import("pdfjs-dist");

  // pdf.js insists on a worker and refuses an empty workerSrc outright
  // ("No GlobalWorkerOptions.workerSrc specified"). Resolving the worker
  // through `new URL(..., import.meta.url)` lets the bundler emit and
  // fingerprint it as an asset, so it is served from our own origin —
  // no CDN to depend on, and no path to hardcode that breaks on deploy.
  const opts = (pdfjs as unknown as { GlobalWorkerOptions: { workerSrc: string } }).GlobalWorkerOptions;
  if (!opts.workerSrc) {
    opts.workerSrc = new URL("pdfjs-dist/build/pdf.worker.mjs", import.meta.url).toString();
  }

  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const line = content.items
      .map((it) => (typeof it === "object" && it && "str" in it ? String((it as { str: unknown }).str) : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) pages.push(line);
  }

  const text = pages.join("\n\n");
  if (!text.trim()) {
    // A scanned resume is an image with no text layer. Say so, rather than
    // handing the model an empty string and letting it score a blank.
    throw new Error(
      `No text found in ${file.name} — it may be a scan. Paste the text instead.`,
    );
  }
  return text;
}
