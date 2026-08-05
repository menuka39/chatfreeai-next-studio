/**
 * Generates a real, text-based PDF from ResumeData.
 *
 * WHY THIS WAS REWRITTEN — the previous version rendered the resume with
 * html2canvas and embedded the result as a JPEG. That produced a PDF whose
 * "text" was a flat picture of text: not selectable, not searchable, blurry
 * when printed, several megabytes, and — the part that actually mattered —
 * completely unreadable to any Applicant Tracking System. Every resume this
 * tool exported would have scored zero on the automated screen at most large
 * employers, no matter which template was chosen, while the product page
 * advertised "40 ATS-friendly designs" and the editor showed an ATS score
 * panel. The export step silently undid the single thing the tool promised.
 *
 * This version draws real text with jsPDF's text API, so the output is
 * genuine selectable, extractable, machine-parseable text.
 *
 * FONTS: the PDF base-14 families (Helvetica / Times) are used deliberately
 * rather than embedding the web fonts. They need no embedding, every PDF
 * reader and every parser handles them, and the resulting file is a few tens
 * of kilobytes. The on-screen preview uses the web fonts and the PDF uses
 * their closest standard equivalent — the layout is faithful, the exact
 * letterforms differ slightly. That is the correct trade for a document whose
 * whole job is to be read by software as well as people.
 *
 * PAGE BREAKS: every block measures itself before drawing, so a break never
 * lands in the middle of a line of text. The old canvas path cut the image at
 * a fixed pixel offset, which sliced words in half across the page boundary.
 */

// named import, not default: jsPDF's default export is a namespace object,
// and only the bundler's CJS interop made `import jsPDF from` happen to work.
// The named export is the constructor in every environment.
import { jsPDF } from "jspdf";
import type { ResumeData } from "./resume";
import type { ResumeTemplate, Density, FontStyle, HeadingStyle } from "./resume-templates";
import { PAPER_MM, type PaperSize } from "./resume-paper";

export type { PaperSize };


export interface PdfOptions {
  paper: PaperSize;
  filename: string;
  /**
   * "ats" strips the sidebar/columns and emits a strictly linear document.
   * Multi-column layouts are the single biggest cause of parsers reading a
   * resume out of order, so this is offered as an explicit, honest choice
   * rather than silently changing the design the person picked.
   */
  atsMode?: boolean;
}

/* ------------------------------------------------------------------ *
 * type scale
 * ------------------------------------------------------------------ */

interface Scale {
  name: number; headline: number; heading: number; body: number; small: number;
  lineGap: number; sectionGap: number; itemGap: number;
}

const SCALES: Record<Density, Scale> = {
  airy:    { name: 23, headline: 11,   heading: 10.5, body: 9.6, small: 8.4, lineGap: 1.42, sectionGap: 6.2, itemGap: 3.6 },
  normal:  { name: 21, headline: 10.4, heading: 10,   body: 9.3, small: 8.2, lineGap: 1.34, sectionGap: 5.0, itemGap: 2.9 },
  compact: { name: 19, headline: 9.8,  heading: 9.4,  body: 8.8, small: 7.8, lineGap: 1.26, sectionGap: 3.9, itemGap: 2.2 },
};

const fontFor = (f: FontStyle) => ({
  heading: f === "sans" ? "helvetica" : "times",
  body: f === "serif" ? "times" : "helvetica",
});

/** #rrggbb -> [r,g,b]; falls back to near-black rather than throwing on bad input. */
function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return [31, 41, 55];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * Whether a photo source is something jsPDF can actually embed.
 *
 * jsPDF handles raster formats (JPEG/PNG/WebP) but NOT SVG. That matters
 * because the app's own PHOTO_PLACEHOLDER is an inline SVG data URL — so on
 * a photo template with no uploaded picture, addImage would throw and the
 * catch would quietly swallow it. Checking up front makes the skip
 * deliberate rather than an exception that happens to be caught.
 *
 * Skipping is also the right output, not just the safe one: a generic grey
 * avatar silhouette on a resume being sent to an employer looks unfinished
 * in a way that no photo at all does not. Real uploads are unaffected — the
 * editor stores those as `image/jpeg` data URLs, which embed fine.
 */
function isEmbeddablePhoto(src: string): boolean {
  if (!src) return false;
  if (src.startsWith("data:image/svg")) return false;
  return src.startsWith("data:image/") || /^https?:\/\//.test(src);
}

/**
 * Standard CV photo dimension, in mm.
 *
 * The international standard for a CV/resume photo is 35 x 45 mm (a
 * shoulders-up portrait crop); the US equivalent is a 2 x 2 inch square,
 * though US resumes usually omit the photo entirely.
 *
 * 35 mm is used here as a square rather than 35 x 45, because this app's
 * photo frames are square by design — the uploader centre-crops to a square
 * and the templates display it round or as a rounded square. Forcing the
 * 45 mm portrait height onto a square source would stretch faces vertically
 * by about a third. So the standard's dimension is honoured, its aspect
 * ratio doesn't apply to this design.
 *
 * The previous value filled the whole sidebar width — around 57 mm, which is
 * over 2.5x the size the on-screen preview showed and far past anything a
 * recruiter expects on a page.
 */
const PHOTO_MM = 35;

/** pt -> mm, for turning a font size into a vertical advance. */
const ptToMm = (pt: number) => pt * 0.3527777778;

/* ------------------------------------------------------------------ *
 * layout engine
 * ------------------------------------------------------------------ */

interface Column { x: number; w: number; }

/**
 * Tracks the drawing position and owns page breaks. Every write goes through
 * here so nothing can be drawn past the bottom margin.
 */
class Layout {
  doc: jsPDF;
  pageW: number;
  pageH: number;
  margin: number;
  y: number;
  col: Column;
  /** redraws persistent page furniture (e.g. a sidebar band) on each new page */
  onNewPage?: (doc: jsPDF) => void;

  constructor(doc: jsPDF, paper: PaperSize, margin: number) {
    this.doc = doc;
    this.pageW = PAPER_MM[paper].w;
    this.pageH = PAPER_MM[paper].h;
    this.margin = margin;
    this.y = margin;
    this.col = { x: margin, w: this.pageW - margin * 2 };
  }

  get bottom() { return this.pageH - this.margin; }
  get remaining() { return this.bottom - this.y; }

  /**
   * Move to the next page, reusing one that already exists rather than always
   * appending. Multi-column layouts draw one column, then rewind to the top
   * of the starting page to draw the next — so by the time the second column
   * overflows, page 2 may already be there. Blindly calling addPage() would
   * strand that column on a fresh page 3 and leave page 2 half empty.
   */
  newPage() {
    const cur = this.doc.getCurrentPageInfo().pageNumber;
    const total = this.doc.getNumberOfPages();
    if (cur < total) {
      this.doc.setPage(cur + 1);
    } else {
      this.doc.addPage();
      // only paint page furniture on a genuinely new sheet — repainting it on
      // an existing page would cover content already drawn there
      this.onNewPage?.(this.doc);
    }
    this.y = this.margin;
  }

  /** Rewind to a specific page and vertical position, for starting a new column. */
  goTo(page: number, y: number) {
    this.doc.setPage(page);
    this.y = y;
  }

  get page() { return this.doc.getCurrentPageInfo().pageNumber; }

  /** Break to a new page if `height` wouldn't fit in what's left. */
  ensure(height: number) {
    if (this.y + height > this.bottom) this.newPage();
  }

  setCol(c: Column) { this.col = c; }
}

interface TextOpts {
  size: number;
  font?: string;
  style?: "normal" | "bold" | "italic" | "bolditalic";
  color?: [number, number, number];
  /** overrides the current column width */
  width?: number;
  x?: number;
  align?: "left" | "center" | "right";
  lineGap?: number;
}

/** Draw wrapped text at the cursor and advance past it. */
function write(L: Layout, text: string, o: TextOpts): void {
  if (!text) return;
  const font = o.font ?? "helvetica";
  const gap = o.lineGap ?? 1.32;
  const w = o.width ?? L.col.w;
  const x = o.x ?? L.col.x;

  L.doc.setFont(font, o.style ?? "normal");
  L.doc.setFontSize(o.size);
  const [r, g, b] = o.color ?? [26, 26, 26];
  L.doc.setTextColor(r, g, b);

  const lines = L.doc.splitTextToSize(text, w) as string[];
  const step = ptToMm(o.size) * gap;

  for (const line of lines) {
    // a single line is the smallest indivisible unit — never split one
    L.ensure(step);
    const tx = o.align === "center" ? x + w / 2 : o.align === "right" ? x + w : x;
    L.doc.text(line, tx, L.y + ptToMm(o.size) * 0.82, { align: o.align ?? "left" });
    L.y += step;
  }
}

/* ------------------------------------------------------------------ *
 * resume blocks
 * ------------------------------------------------------------------ */

interface Ctx {
  L: Layout;
  s: Scale;
  fonts: { heading: string; body: string };
  accent: [number, number, number];
  headingStyle: HeadingStyle;
}

const INK: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [90, 95, 105];
const FAINT: [number, number, number] = [125, 130, 140];

/**
 * Section heading, honouring the template's heading treatment. Kept visually
 * close to the on-screen renderer so the PDF looks like the preview the
 * person approved, rather than a generic fallback design.
 */
function sectionHeading(c: Ctx, label: string) {
  const { L, s } = c;
  const text = c.headingStyle === "plain" ? label : label.toUpperCase();
  const h = ptToMm(s.heading) * 1.5;

  // keep a heading with at least a couple of lines of its section
  L.ensure(h + ptToMm(s.body) * 3);
  L.y += s.sectionGap * 0.45;

  if (c.headingStyle === "bar") {
    L.doc.setFillColor(...c.accent);
    L.doc.rect(L.col.x, L.y + 0.6, 2.2, ptToMm(s.heading) * 1.05, "F");
    write(L, text, { size: s.heading, font: c.fonts.heading, style: "bold", color: c.accent, x: L.col.x + 4, width: L.col.w - 4 });
  } else if (c.headingStyle === "boxed") {
    const padX = 1.8;
    L.doc.setFont(c.fonts.heading, "bold");
    L.doc.setFontSize(s.heading);
    const tw = L.doc.getTextWidth(text) + padX * 2;
    L.doc.setDrawColor(...c.accent);
    L.doc.setLineWidth(0.25);
    L.doc.rect(L.col.x, L.y, tw, ptToMm(s.heading) * 1.5);
    write(L, text, { size: s.heading, font: c.fonts.heading, style: "bold", color: c.accent, x: L.col.x + padX, width: L.col.w });
    L.y += 0.8;
  } else {
    write(L, text, { size: s.heading, font: c.fonts.heading, style: "bold", color: c.accent });
    if (c.headingStyle === "rule") {
      L.doc.setDrawColor(...c.accent);
      L.doc.setLineWidth(0.3);
      L.doc.line(L.col.x, L.y + 0.4, L.col.x + L.col.w, L.y + 0.4);
      L.y += 1.4;
    }
  }
  L.y += 1.1;
}

function experienceBlock(c: Ctx, data: ResumeData, timeline = false) {
  const items = data.experience.filter((e) => e.role.trim() || e.company.trim());
  if (!items.length) return;
  const { L, s } = c;
  sectionHeading(c, "Experience");

  // timeline templates indent the whole entry to leave room for the dot and
  // connector rail drawn in the gutter
  const rail = timeline ? 4.6 : 0;
  const baseX = L.col.x;
  const baseW = L.col.w;
  if (timeline) L.setCol({ x: baseX + rail, w: baseW - rail });

  for (const e of items) {
    const dotY = L.y + ptToMm(s.body) * 0.5;
    const dotPage = L.doc.getCurrentPageInfo().pageNumber;
    const dates = [e.start, e.current ? "Present" : e.end].filter(Boolean).join(" – ");
    // measure the role line + company line so a role never lands alone at the
    // very bottom of a page with its detail orphaned onto the next
    const head = ptToMm(s.body) * 1.35 + ptToMm(s.small) * 1.3;
    L.ensure(head + ptToMm(s.body) * 1.4);

    if (dates) {
      L.doc.setFont(c.fonts.body, "normal");
      L.doc.setFontSize(s.small);
      L.doc.setTextColor(...FAINT);
      L.doc.text(dates, L.col.x + L.col.w, L.y + ptToMm(s.body) * 0.82, { align: "right" });
    }
    const dateW = dates ? L.doc.getTextWidth(dates) + 3 : 0;
    write(L, e.role, { size: s.body, font: c.fonts.body, style: "bold", color: INK, width: L.col.w - dateW });

    const sub = [e.company, e.location].filter(Boolean).join(", ");
    if (sub) write(L, sub, { size: s.small, font: c.fonts.body, color: MUTED });

    const bullets = e.bullets.filter((b) => b.trim());
    if (bullets.length) {
      L.y += 0.8;
      for (const b of bullets) {
        const indent = 3.4;
        const bulletY = L.y + ptToMm(s.body) * 0.55;
        L.ensure(ptToMm(s.body) * s.lineGap);
        L.doc.setFillColor(...MUTED);
        L.doc.circle(L.col.x + 1.1, bulletY, 0.42, "F");
        write(L, b, { size: s.body, font: c.fonts.body, color: INK, x: L.col.x + indent, width: L.col.w - indent, lineGap: s.lineGap });
      }
    }
    if (timeline) {
      const endPage = L.doc.getCurrentPageInfo().pageNumber;
      L.doc.setFillColor(...c.accent);
      L.doc.circle(baseX + 1.3, dotY, 1.05, "F");
      // only connect within a page — a rail drawn across a page break would
      // run off the bottom of one sheet and start mid-air on the next
      if (endPage === dotPage && L.y - dotY > 4) {
        L.doc.setDrawColor(...c.accent);
        L.doc.setLineWidth(0.25);
        L.doc.line(baseX + 1.3, dotY + 1.8, baseX + 1.3, L.y - 1);
      }
    }
    L.y += s.itemGap;
  }

  if (timeline) L.setCol({ x: baseX, w: baseW });
}

function educationBlock(c: Ctx, data: ResumeData) {
  const items = data.education.filter((e) => e.degree.trim() || e.institution.trim());
  if (!items.length) return;
  const { L, s } = c;
  sectionHeading(c, "Education");

  for (const e of items) {
    const dates = [e.start, e.end].filter(Boolean).join(" – ");
    L.ensure(ptToMm(s.body) * 2.6);
    if (dates) {
      L.doc.setFont(c.fonts.body, "normal");
      L.doc.setFontSize(s.small);
      L.doc.setTextColor(...FAINT);
      L.doc.text(dates, L.col.x + L.col.w, L.y + ptToMm(s.body) * 0.82, { align: "right" });
    }
    const dateW = dates ? L.doc.getTextWidth(dates) + 3 : 0;
    write(L, e.degree, { size: s.body, font: c.fonts.body, style: "bold", color: INK, width: L.col.w - dateW });
    const sub = [e.institution, e.location].filter(Boolean).join(", ");
    if (sub) write(L, sub, { size: s.small, font: c.fonts.body, color: MUTED });
    if (e.detail) write(L, e.detail, { size: s.small, font: c.fonts.body, color: MUTED, lineGap: s.lineGap });
    L.y += s.itemGap * 0.8;
  }
}

function projectsBlock(c: Ctx, data: ResumeData) {
  const items = data.projects.filter((p) => p.name.trim());
  if (!items.length) return;
  const { L, s } = c;
  sectionHeading(c, "Projects");
  for (const p of items) {
    L.ensure(ptToMm(s.body) * 2.4);
    write(L, p.name, { size: s.body, font: c.fonts.body, style: "bold", color: INK });
    if (p.detail) write(L, p.detail, { size: s.small, font: c.fonts.body, color: MUTED, lineGap: s.lineGap });
    if (p.url) write(L, p.url, { size: s.small, font: c.fonts.body, color: c.accent });
    L.y += s.itemGap * 0.75;
  }
}

function certsBlock(c: Ctx, data: ResumeData, inline: boolean) {
  const items = data.certifications.filter((x) => x.name.trim());
  if (!items.length) return;
  const { L, s } = c;
  sectionHeading(c, "Certifications");
  if (inline) {
    const line = items
      .map((x) => `${x.name}${x.issuer ? ` — ${x.issuer}` : ""}${x.year ? ` (${x.year})` : ""}`)
      .join("   ·   ");
    write(L, line, { size: s.body, font: c.fonts.body, color: INK, lineGap: s.lineGap });
  } else {
    for (const x of items) {
      write(L, x.name, { size: s.small, font: c.fonts.body, style: "bold", color: INK });
      const sub = [x.issuer, x.year].filter(Boolean).join(" · ");
      if (sub) write(L, sub, { size: s.small, font: c.fonts.body, color: MUTED });
      L.y += 1;
    }
  }
}

function skillsBlock(c: Ctx, data: ResumeData, inline: boolean) {
  const skills = data.skills.filter((s) => s.trim());
  if (!skills.length) return;
  const { L, s } = c;
  sectionHeading(c, "Skills");
  if (inline) {
    // a plain delimited line, which parsers split reliably
    write(L, skills.join("   ·   "), { size: s.body, font: c.fonts.body, color: INK, lineGap: s.lineGap });
  } else {
    for (const skill of skills) {
      write(L, skill, { size: s.small, font: c.fonts.body, color: INK, lineGap: s.lineGap });
    }
  }
}

function summaryBlock(c: Ctx, data: ResumeData) {
  if (!data.summary.trim()) return;
  sectionHeading(c, "Summary");
  write(c.L, data.summary, { size: c.s.body, font: c.fonts.body, color: INK, lineGap: c.s.lineGap });
}

function extraBlock(c: Ctx, data: ResumeData) {
  if (!data.extraTitle.trim() || !data.extraBody.trim()) return;
  sectionHeading(c, data.extraTitle);
  write(c.L, data.extraBody, { size: c.s.body, font: c.fonts.body, color: INK, lineGap: c.s.lineGap });
}

/* ------------------------------------------------------------------ *
 * header
 * ------------------------------------------------------------------ */

function drawHeader(c: Ctx, data: ResumeData, t: ResumeTemplate, opts: { band: boolean; align: "left" | "center" }) {
  const { L, s } = c;
  const contact = [data.email, data.phone, data.location].filter(Boolean).join("   ·   ");
  const links = data.links.map((l) => l.url).filter(Boolean).join("   ·   ");

  // Photo templates that aren't sidebar layouts draw their picture here — the
  // sidebar path handles its own. Without this, `palette` (a band layout with
  // a centred photo) rendered with no photo at all in the PDF while showing
  // one in the preview.
  const headerPhoto = t.photo && data.photo && isEmbeddablePhoto(data.photo) ? data.photo : null;
  if (headerPhoto && !opts.band) {
    try {
      const px = opts.align === "center" ? L.margin + (L.pageW - L.margin * 2 - PHOTO_MM) / 2 : L.margin;
      L.doc.addImage(headerPhoto, px, L.y, PHOTO_MM, PHOTO_MM, undefined, "FAST");
      L.y += PHOTO_MM + 3;
    } catch {
      /* a corrupt data: URL must not take the export down */
    }
  }

  if (opts.band) {
    // full-bleed accent band behind the name block
    const bandH = s.name * 0.55 + (data.headline ? 8 : 4) + 10;
    L.doc.setFillColor(...c.accent);
    L.doc.rect(0, 0, L.pageW, bandH, "F");
    L.y = 9;
    write(L, data.fullName || "Your Name", {
      size: s.name, font: c.fonts.heading, style: "bold", color: [255, 255, 255], align: opts.align,
    });
    if (data.headline) {
      write(L, data.headline, { size: s.headline, font: c.fonts.body, color: [255, 255, 255], align: opts.align });
    }
    L.y = bandH + 5;
    if (headerPhoto) {
      try {
        const px = opts.align === "center" ? L.margin + (L.pageW - L.margin * 2 - PHOTO_MM) / 2 : L.margin;
        L.doc.addImage(headerPhoto, px, L.y, PHOTO_MM, PHOTO_MM, undefined, "FAST");
        L.y += PHOTO_MM + 3;
      } catch {
        /* as above */
      }
    }
  } else {
    write(L, data.fullName || "Your Name", {
      size: s.name, font: c.fonts.heading, style: "bold", color: INK, align: opts.align,
    });
    if (data.headline) {
      L.y += 0.6;
      write(L, data.headline, { size: s.headline, font: c.fonts.body, color: c.accent, align: opts.align });
    }
  }

  if (contact) {
    L.y += 1.2;
    write(L, contact, { size: s.small, font: c.fonts.body, color: MUTED, align: opts.align });
  }
  if (links) {
    write(L, links, { size: s.small, font: c.fonts.body, color: MUTED, align: opts.align });
  }

  L.y += 1.6;
  if (!opts.band && (t.heading === "rule" || t.header === "centered")) {
    L.doc.setDrawColor(...c.accent);
    L.doc.setLineWidth(0.4);
    L.doc.line(L.margin, L.y, L.pageW - L.margin, L.y);
    L.y += 2;
  }
}

/* ------------------------------------------------------------------ *
 * entry point
 * ------------------------------------------------------------------ */

const SIDEBAR_LAYOUTS = new Set(["sidebar-left", "sidebar-right", "sidebar-wide"]);

/**
 * Builds the document and hands it back without saving — this is what makes
 * the output testable: a test can pull the real text out of the returned
 * PDF and assert it's actually there, which is the whole point of the
 * rewrite. `resumeToPdf` below is the thin browser-facing wrapper.
 */
export function buildResumePdf(data: ResumeData, template: ResumeTemplate, accentHex: string, opts: PdfOptions): jsPDF {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: opts.paper, compress: true });
  const s = SCALES[template.density];
  const fonts = fontFor(template.font);
  const accent = rgb(accentHex || template.accent);

  // Document metadata — a real PDF has these; the image export had none.
  // Some parsers read the title, and it's what shows in a browser tab.
  doc.setProperties({
    title: `${data.fullName || "Resume"}${data.headline ? ` — ${data.headline}` : ""}`,
    subject: "Resume",
    author: data.fullName || "",
    creator: "Chat Free AI Resume Builder",
  });

  const margin = template.density === "compact" ? 12 : template.density === "airy" ? 17 : 14.5;
  const L = new Layout(doc, opts.paper, margin);
  const c: Ctx = { L, s, fonts, accent, headingStyle: template.heading };

  const useSidebar = !opts.atsMode && SIDEBAR_LAYOUTS.has(template.layout);
  const useBand = !opts.atsMode && template.layout === "band";
  const align: "left" | "center" = !opts.atsMode && template.header === "centered" ? "center" : "left";

  if (useSidebar) {
    const wide = template.layout === "sidebar-wide";
    const sideW = (L.pageW - margin * 2) * (wide ? 0.36 : 0.31);
    const gap = 6;
    const onLeft = template.layout !== "sidebar-right";
    const sideInnerX = onLeft ? margin : L.pageW - sideW - margin + 2;
    const mainX = onLeft ? margin + sideW + gap : margin;
    const mainW = L.pageW - margin * 2 - sideW - gap;

    // tinted sidebar band, repainted on every page so a two-page resume
    // doesn't lose the panel on page 2
    const paintSidebar = (d: jsPDF) => {
      d.setFillColor(accent[0], accent[1], accent[2]);
      d.rect(onLeft ? 0 : L.pageW - sideW - margin * 1.2, 0, sideW + margin * 1.2, L.pageH, "F");
    };
    paintSidebar(doc);

    /* ---- sidebar content ---- */
    L.setCol({ x: sideInnerX, w: sideW - 2 });
    L.y = margin;

    if (template.photo && data.photo && isEmbeddablePhoto(data.photo)) {
      try {
        // never wider than the sidebar it sits in, on narrow sidebars or
        // smaller paper sizes
        const size = Math.min(PHOTO_MM, sideW - 6);
        doc.addImage(data.photo, sideInnerX, L.y, size, size, undefined, "FAST");
        L.y += size + 4;
      } catch {
        // a corrupt data: URL must never take the whole export down
      }
    }

    const white: [number, number, number] = [255, 255, 255];
    write(L, data.fullName || "Your Name", { size: s.name * 0.72, font: fonts.heading, style: "bold", color: white });
    if (data.headline) write(L, data.headline, { size: s.small, font: fonts.body, color: white });
    L.y += 3;

    for (const line of [data.email, data.phone, data.location]) {
      if (line) write(L, line, { size: s.small, font: fonts.body, color: white, lineGap: 1.5 });
    }
    for (const l of data.links) {
      if (l.url) write(L, l.url, { size: s.small, font: fonts.body, color: white, lineGap: 1.5 });
    }

    const sideSection = (label: string, lines: string[]) => {
      if (!lines.length) return;
      L.y += 4;
      write(L, label.toUpperCase(), { size: s.small, font: fonts.heading, style: "bold", color: white });
      L.y += 1;
      for (const line of lines) write(L, line, { size: s.small, font: fonts.body, color: white, lineGap: 1.5 });
    };
    sideSection("Skills", data.skills.filter((x) => x.trim()));
    sideSection(
      "Certifications",
      data.certifications.filter((x) => x.name.trim()).map((x) => `${x.name}${x.year ? ` (${x.year})` : ""}`),
    );

    /* ---- main column ---- */
    // rewind to page 1: a long skills list can push the sidebar onto a second
    // page, and without this the main column would start there too, leaving
    // the whole first page blank apart from the sidebar
    L.onNewPage = paintSidebar;
    L.setCol({ x: mainX, w: mainW });
    L.goTo(1, margin);

    summaryBlock(c, data);
    experienceBlock(c, data);
    educationBlock(c, data);
    projectsBlock(c, data);
    extraBlock(c, data);
    return doc;
  }

  /* ---- two equal columns under a full-width header ---- */
  if (!opts.atsMode && template.layout === "two-col") {
    drawHeader(c, data, template, { band: false, align });
    const gap = 7;
    const colW = (L.pageW - margin * 2 - gap) / 2;
    const startPage = L.page;
    const startY = L.y;

    L.setCol({ x: margin, w: colW });
    summaryBlock(c, data);
    experienceBlock(c, data);

    // rewind and fill the right column from the same starting line
    L.goTo(startPage, startY);
    L.setCol({ x: margin + colW + gap, w: colW });
    educationBlock(c, data);
    skillsBlock(c, data, false);
    projectsBlock(c, data);
    certsBlock(c, data, false);
    extraBlock(c, data);

    return doc;
  }

  /* ---- single-column (and ATS mode) ---- */
  drawHeader(c, data, template, { band: useBand, align });
  summaryBlock(c, data);
  experienceBlock(c, data, !opts.atsMode && template.layout === "timeline");
  educationBlock(c, data);
  skillsBlock(c, data, true);
  projectsBlock(c, data);
  certsBlock(c, data, true);
  extraBlock(c, data);

  return doc;
}


/**
 * Masks the photo to a circle before it goes into the PDF.
 *
 * The templates render the picture with `rounded-full`, so the preview shows
 * a circle — but jsPDF can only place a rectangular image, so the export was
 * coming out as a hard-edged square and not matching what the person
 * approved on screen.
 *
 * The mask is baked in on a canvas rather than relying on PDF transparency:
 * the corners are filled with whatever colour sits behind the photo (the
 * sidebar tint, or the page for a header photo) and the result is flattened
 * to JPEG. That renders identically in every PDF viewer, whereas alpha-
 * channel PNGs are handled inconsistently by some of them.
 *
 * Returns the original source untouched if there's no DOM (the Node test
 * harness) or if anything fails — a missing round-off must never cost
 * someone their photo.
 */
async function circularPhoto(src: string, backdrop: [number, number, number]): Promise<string> {
  if (typeof document === "undefined") return src;
  try {
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("photo failed to load"));
      img.src = src;
    });

    const S = 512; // generous enough to stay crisp at 35mm in print
    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d");
    if (!ctx) return src;

    ctx.fillStyle = `rgb(${backdrop[0]},${backdrop[1]},${backdrop[2]})`;
    ctx.fillRect(0, 0, S, S);

    ctx.save();
    ctx.beginPath();
    ctx.arc(S / 2, S / 2, S / 2, 0, Math.PI * 2);
    ctx.clip();
    // cover-fit, matching the CSS object-cover the preview uses
    const scale = Math.max(S / img.width, S / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
    ctx.restore();

    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return src;
  }
}

/** Browser entry point — build, then trigger the download. */
export async function resumeToPdf(
  data: ResumeData,
  template: ResumeTemplate,
  accentHex: string,
  opts: PdfOptions,
): Promise<void> {
  let prepared = data;
  if (template.photo && data.photo && isEmbeddablePhoto(data.photo) && !opts.atsMode) {
    // sidebar layouts sit the photo on the accent tint; everything else on
    // the white page — the mask's corners have to match whichever it is
    const onAccent = SIDEBAR_LAYOUTS.has(template.layout);
    const backdrop = onAccent ? rgb(accentHex || template.accent) : ([255, 255, 255] as [number, number, number]);
    prepared = { ...data, photo: await circularPhoto(data.photo, backdrop) };
  }
  buildResumePdf(prepared, template, accentHex, opts).save(opts.filename);
}
