import { buildResumePdf } from "../lib/resume-pdf.ts";
import { sampleResume, PHOTO_PLACEHOLDER } from "../lib/resume.ts";
import { resumeTemplates, templateBySlug } from "../lib/resume-templates.ts";

const data = sampleResume();

/**
 * pdfjs takes ownership of the ArrayBuffer it is given and detaches it, so
 * the caller's view reads as zero-length afterwards. Hand it a copy and the
 * original stays measurable.
 */
async function extractText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true }).promise;
  let out = "";
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    // pdf.js types a text item as a union with marked-content, which has no
    // `str`. Narrowing to the shape we read keeps the check without pulling in
    // the library's types for a throwaway script.
    out += content.items
      .map((i) => (i as { str?: string }).str ?? "")
      .join(" ") + "\n";
  }
  return out;
}

const results: { name: string; pass: boolean; note: string }[] = [];

// --- 1. single-column template: is the text really extractable? ---
{
  const t = templateBySlug("atlas")!;
  const doc = buildResumePdf(data, t, t.accent, { paper: "a4", filename: "x.pdf" });
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const text = await extractText(bytes);

  const mustContain = [
    data.fullName,
    data.email,
    "Senior Frontend Engineer",
    "Example Technologies",
    "checkout",
  ];
  const missing = mustContain.filter((m) => !text.includes(m));
  results.push({
    name: "atlas (single col): text is extractable",
    pass: missing.length === 0,
    note: missing.length ? `MISSING: ${missing.join(" | ")}` : `${bytes.length} bytes, ${text.length} chars of text`,
  });
}

// --- 2. sidebar template: sidebar content must also be real text ---
{
  const t = templateBySlug("vector")!;
  const doc = buildResumePdf(data, t, t.accent, { paper: "a4", filename: "x.pdf" });
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const text = await extractText(bytes);
  const missing = [data.fullName, data.email, "Example Technologies"].filter((m) => !text.includes(m));
  results.push({
    name: "vector (sidebar): text is extractable",
    pass: missing.length === 0,
    note: missing.length ? `MISSING: ${missing.join(" | ")}` : `${bytes.length} bytes`,
  });
}

// --- 3. ATS mode must flatten and still contain everything ---
{
  const t = templateBySlug("vector")!;
  const doc = buildResumePdf(data, t, t.accent, { paper: "a4", filename: "x.pdf", atsMode: true });
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const text = await extractText(bytes);
  const missing = [data.fullName, data.email, "Example Technologies"].filter((m) => !text.includes(m));
  results.push({
    name: "vector + atsMode: still complete",
    pass: missing.length === 0,
    note: missing.length ? `MISSING: ${missing.join(" | ")}` : "ok",
  });
}

// --- 4. every one of the 40 templates must build without throwing ---
{
  const failures: string[] = [];
  for (const t of resumeTemplates) {
    try {
      const doc = buildResumePdf(data, t, t.accent, { paper: "a4", filename: "x.pdf" });
      const size = (doc.output("arraybuffer") as ArrayBuffer).byteLength;
      if (size < 800) failures.push(`${t.slug} (suspiciously small: ${size}b)`);
    } catch (err) {
      failures.push(`${t.slug}: ${(err as Error).message}`);
    }
  }
  results.push({
    name: `all ${resumeTemplates.length} templates build`,
    pass: failures.length === 0,
    note: failures.length ? failures.slice(0, 5).join(" | ") : "no throws",
  });
}

// --- 5. a long resume must paginate, not overflow off the page ---
{
  const long = sampleResume();
  long.experience = Array.from({ length: 9 }, (_, i) => ({
    id: `e${i}`, role: `Role Number ${i + 1}`, company: `Company ${i + 1}`,
    location: "Colombo", start: `${2010 + i}`, end: `${2011 + i}`, current: false,
    bullets: [
      "Delivered a substantial piece of work with a measurable outcome attached to it.",
      "Worked across teams to ship something that mattered, with numbers to back it up.",
      "Third bullet to make each of these roles genuinely tall on the page.",
    ],
  }));
  const t = templateBySlug("atlas")!;
  const doc = buildResumePdf(long, t, t.accent, { paper: "a4", filename: "x.pdf" });
  const bytes = new Uint8Array(doc.output("arraybuffer") as ArrayBuffer);
  const text = await extractText(bytes);
  const pages = doc.getNumberOfPages();
  // the last role must survive pagination — that's what the old image slicer broke
  results.push({
    name: "long resume paginates and keeps the last item",
    pass: pages > 1 && text.includes("Role Number 9"),
    note: `${pages} pages; last role present: ${text.includes("Role Number 9")}`,
  });
}


// --- 6. photo templates: a real upload embeds, the SVG placeholder is skipped ---
{
  // what the editor actually produces on upload: canvas.toDataURL("image/jpeg")
  const REAL_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCeiiivQOcKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==";
  const t = templateBySlug("canvas")!;

  const withPhoto = sampleResume();
  withPhoto.photo = REAL_JPEG;
  const a = buildResumePdf(withPhoto, t, t.accent, { paper: "a4", filename: "x.pdf" });
  const withBytes = (a.output("arraybuffer") as ArrayBuffer).byteLength;

  const withPlaceholder = sampleResume();
  withPlaceholder.photo = PHOTO_PLACEHOLDER;
  const b = buildResumePdf(withPlaceholder, t, t.accent, { paper: "a4", filename: "x.pdf" });
  const placeholderBytes = (b.output("arraybuffer") as ArrayBuffer).byteLength;

  // a genuinely embedded image makes the file measurably bigger; the SVG
  // placeholder must be skipped rather than throwing or embedding junk
  results.push({
    name: "photo template: real JPEG embeds, SVG placeholder skipped",
    pass: withBytes > placeholderBytes + 300,
    note: `with photo ${withBytes}b vs placeholder ${placeholderBytes}b`,
  });
}


// --- 7. non-sidebar photo templates draw their photo too ---
{
  // `palette` is a band layout with a centred photo — it previously rendered
  // with no photo at all in the PDF while the preview showed one
  const REAL_JPEG = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAAwADADASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwCeiiivQOcKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigD//2Q==";
  const t = templateBySlug("palette")!;
  const withPhoto = sampleResume();
  withPhoto.photo = REAL_JPEG;
  const noPhoto = sampleResume();
  noPhoto.photo = "";
  const a = (buildResumePdf(withPhoto, t, t.accent, { paper: "a4", filename: "x.pdf" }).output("arraybuffer") as ArrayBuffer).byteLength;
  const b = (buildResumePdf(noPhoto, t, t.accent, { paper: "a4", filename: "x.pdf" }).output("arraybuffer") as ArrayBuffer).byteLength;
  results.push({
    name: "band template (palette): photo is drawn",
    pass: a > b + 300,
    note: `with photo ${a}b vs without ${b}b`,
  });
}

console.log();
let allPass = true;
for (const r of results) {
  if (!r.pass) allPass = false;
  console.log(`${r.pass ? "PASS" : "FAIL"}  ${r.name}`);
  console.log(`      ${r.note}`);
}
console.log();
console.log(allPass ? "ALL PASS" : "SOME FAILED");
if (!allPass) process.exit(1);
