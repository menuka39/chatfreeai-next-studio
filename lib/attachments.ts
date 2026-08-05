/**
 * Chat attachments — images and text documents.
 *
 * Images are sent to the model as image_url parts (the OpenAI-compatible shape
 * OpenRouter normalises), which only vision-capable models accept. Text files
 * are read in the browser and inlined into the message as fenced text, because
 * that works with every model and costs nothing extra to support.
 *
 * PDFs go through lib/pdf-extract.ts, which reads the text layer in the
 * browser. Scanned PDFs have no text layer; that case is detected and reported
 * rather than attaching an empty document the user still pays tokens for.
 */

export type AttachmentKind = "image" | "text" | "pdf" | "zip";

export interface Attachment {
  id: string;
  kind: AttachmentKind;
  name: string;
  /** data: URI for images, extracted text for documents */
  content: string;
  sizeBytes: number;
  mime: string;
  /** shown under the chip, e.g. "12 of 60 pages" */
  note?: string;
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export const TEXT_EXTENSIONS = [
  ".txt", ".md", ".csv", ".json", ".xml", ".html", ".css",
  ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".c", ".cpp",
  ".go", ".rs", ".rb", ".php", ".sh", ".sql", ".yml", ".yaml",
];

export function isImage(file: File) {
  return IMAGE_TYPES.includes(file.type);
}

export function isTextFile(file: File) {
  if (file.type.startsWith("text/")) return true;
  if (file.type === "application/json") return true;
  const lower = file.name.toLowerCase();
  return TEXT_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function isPdf(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export function isZip(file: File) {
  return (
    file.type === "application/zip" ||
    file.type === "application/x-zip-compressed" ||
    file.name.toLowerCase().endsWith(".zip")
  );
}

/** Human-readable reason a file can't be attached, or null if it's fine. */
export function rejectReason(
  file: File,
  maxMb: number,
  allowPdf: boolean,
  allowZip: boolean,
): string | null {
  if (file.size > maxMb * 1_048_576) {
    return `${file.name} is larger than ${maxMb}MB.`;
  }
  if (isPdf(file)) {
    return allowPdf
      ? null
      : "PDF reading is included with the monthly packages. On the free tier, copy the text out or save it as .txt.";
  }
  if (isZip(file)) {
    return allowZip
      ? null
      : "Reading code archives is included with the monthly packages. On the free tier, attach the individual files.";
  }
  if (!isImage(file) && !isTextFile(file)) {
    return `${file.name} isn't a supported type. Attach an image, a PDF, a .zip, or a text/code file.`;
  }
  return null;
}

const uid = () => Math.random().toString(36).slice(2, 10);

/** Downscale a large image before it's inlined — the data URI goes in the prompt. */
async function imageToDataUri(file: File, maxEdge = 1568): Promise<string> {
  const raw = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error(`Could not decode ${file.name}.`));
    el.src = raw;
  });

  if (Math.max(img.width, img.height) <= maxEdge) return raw;

  const scale = maxEdge / Math.max(img.width, img.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

export async function readAttachment(file: File): Promise<Attachment> {
  if (isZip(file)) {
    // fflate is small, but there's no reason to ship it to people who never
    // attach an archive
    const { extractZip, zipToText } = await import("./zip-extract");
    const result = await extractZip(file);
    return {
      id: uid(),
      kind: "zip",
      name: file.name,
      content: zipToText(file.name, result),
      sizeBytes: file.size,
      mime: "application/zip",
      note: `${result.files.length} file${result.files.length === 1 ? "" : "s"} read${result.skipped ? `, ${result.skipped} skipped` : ""}`,
    };
  }

  if (isPdf(file)) {
    const { extractPdfText } = await import("./pdf-extract");
    const result = await extractPdfText(file);

    if (result.imageOnly) {
      // Sending this would cost tokens and return nothing useful, so refuse
      // clearly instead of failing quietly.
      throw new Error(
        `${file.name} looks like a scanned PDF — there's no text to read. Try a version exported from the original document.`,
      );
    }

    const note = result.truncated
      ? `${result.pagesRead} of ${result.pages} pages read`
      : `${result.pages} page${result.pages === 1 ? "" : "s"}`;

    return {
      id: uid(),
      kind: "pdf",
      name: file.name,
      content: result.text,
      sizeBytes: file.size,
      mime: "application/pdf",
      note,
    };
  }

  if (isImage(file)) {
    return {
      id: uid(),
      kind: "image",
      name: file.name,
      content: await imageToDataUri(file),
      sizeBytes: file.size,
      mime: file.type,
    };
  }

  const text = await file.text();
  // keep the prompt sane — a huge file would blow the context and the budget
  const MAX_CHARS = 40_000;
  const clipped = text.length > MAX_CHARS ? `${text.slice(0, MAX_CHARS)}\n\n[... truncated]` : text;
  return {
    id: uid(),
    kind: "text",
    name: file.name,
    content: clipped,
    sizeBytes: file.size,
    mime: file.type || "text/plain",
  };
}

/**
 * Build the message content the API expects. Text documents are inlined ahead
 * of the user's own words so the model reads them as context, not as the
 * question.
 */
export function buildMessageContent(text: string, attachments: Attachment[]) {
  const docs = attachments.filter((a) => a.kind !== "image");
  const images = attachments.filter((a) => a.kind === "image");

  const preamble = docs.length
    ? docs.map((d) => `Attached file: ${d.name}\n\`\`\`\n${d.content}\n\`\`\``).join("\n\n") + "\n\n"
    : "";

  if (!images.length) return `${preamble}${text}`;

  return [
    ...images.map((img) => ({ type: "image_url" as const, image_url: { url: img.content } })),
    { type: "text" as const, text: `${preamble}${text}` },
  ];
}
