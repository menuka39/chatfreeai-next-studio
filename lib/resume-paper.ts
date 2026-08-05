/**
 * Paper sizes, shared by both export paths.
 *
 * Previously declared twice — in resume-pdf.ts and in the since-removed
 * resume-print.ts — and already drifted: the same option was labelled
 * "Letter (US)" in one and "Letter" in the other, so which label a user saw
 * depended on which module the UI happened to import from (it took the type
 * from one and the options from the other). One definition, one source.
 */

export type PaperSize = "a4" | "a3" | "letter";

/** Portrait dimensions in millimetres. */
export const PAPER_MM: Record<PaperSize, { w: number; h: number }> = {
  a4: { w: 210, h: 297 },
  a3: { w: 297, h: 420 },
  letter: { w: 215.9, h: 279.4 },
};

export const PAPER_OPTIONS: { id: PaperSize; label: string }[] = [
  { id: "a4", label: "A4" },
  { id: "letter", label: "Letter (US)" },
  { id: "a3", label: "A3" },
];
