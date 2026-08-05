/**
 * Client-side PDF text extraction.
 *
 * Runs entirely in the browser, like every other attachment — the file never
 * reaches our servers, so we carry no upload bandwidth, no storage, and none
 * of the responsibility that comes with holding someone's documents.
 *
 * THE HONEST LIMIT: this reads the text LAYER of a PDF. A scanned document or
 * a photo saved as a PDF has no text layer, so extraction returns nothing.
 * That case is detected and reported rather than sending an empty attachment
 * and letting the user pay tokens for a model that received no content.
 *
 * COST CONTROL: a long PDF is the one attachment that can genuinely blow up a
 * bill — a 200-page report is easily 400k characters, and it would be re-sent
 * with every follow-up message. Extraction is capped by pages and characters,
 * and the caller is told exactly what was trimmed.
 */

export interface PdfExtractResult {
  text: string;
  pages: number;
  pagesRead: number;
  truncated: boolean;
  /** true when the PDF has no text layer (a scan or image-only export) */
  imageOnly: boolean;
}

export const PDF_MAX_PAGES = 40;
export const PDF_MAX_CHARS = 60_000;

/**
 * pdf.js is ~1MB, so it is imported dynamically — only someone who actually
 * attaches a PDF pays that download.
 */
export async function extractPdfText(file: File): Promise<PdfExtractResult> {
  const pdfjs = await import("pdfjs-dist");

  // The worker must be told where to load from; using the bundled module URL
  // keeps it working without copying files into /public.
  pdfjs.GlobalWorkerOptions.workerSrc = (
    await import("pdfjs-dist/build/pdf.worker.min.mjs?url" as string).catch(() => ({ default: "" }))
  ).default || new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

  const buffer = await file.arrayBuffer();
  // destroy() lives on the loading task, not the document — keep the handle so
  // the worker and its buffers are released when we're done
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const doc = await loadingTask.promise;

  const pages = doc.numPages;
  const pagesRead = Math.min(pages, PDF_MAX_PAGES);
  const chunks: string[] = [];
  let chars = 0;
  let truncated = pages > PDF_MAX_PAGES;

  for (let n = 1; n <= pagesRead; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (text) {
      if (chars + text.length > PDF_MAX_CHARS) {
        chunks.push(text.slice(0, Math.max(0, PDF_MAX_CHARS - chars)));
        truncated = true;
        break;
      }
      chunks.push(text);
      chars += text.length;
    }
    // free the page as we go — a long PDF otherwise holds every page in memory
    page.cleanup();
  }

  await loadingTask.destroy();

  const text = chunks.join("\n\n").trim();
  return {
    text,
    pages,
    pagesRead,
    truncated,
    // no extractable text at all across the pages we read means there is no
    // text layer — almost always a scan
    imageOnly: text.length === 0,
  };
}
