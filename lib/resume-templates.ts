/**
 * Resume template catalogue.
 *
 * 40 templates built from a set of layout engines plus styling dimensions
 * (typography, heading treatment, density, accent usage, photo). This is how
 * commercial builders do it too: a handful of well-tested layouts, varied
 * deliberately, beats 40 hand-maintained one-offs that drift apart.
 *
 * HONESTY NOTE ON CATEGORIES: templates are grouped by the kind of role they
 * suit, not by fake corporate endorsements. No employer endorses these, and
 * claiming otherwise would mislead people making real job applications. The
 * "popular" flag marks the formats most widely used for that category.
 *
 * ATS RATING is the honest constraint, not marketing:
 *   excellent — single column, plain text order, no columns to scramble
 *   good      — single column with styling that parsers handle fine
 *   styled    — multi-column or photo; beautiful, but older parsers can
 *               misread column order. Fine for direct/email applications and
 *               for design-led fields, riskier for big-company portals.
 */

export type LayoutId =
  | "single"        // classic one column
  | "sidebar-left"  // 32% sidebar on the left
  | "sidebar-right" // 32% sidebar on the right
  | "sidebar-wide"  // 40% sidebar, photo-friendly
  | "two-col"       // equal two columns under a full header
  | "timeline"      // vertical timeline down the experience
  | "band";         // full-width coloured header band

export type HeaderStyle =
  | "centered"
  | "left"
  | "split"        // name left, contact right
  | "photo-left"
  | "photo-right"
  | "photo-center";

export type HeadingStyle = "plain" | "upper" | "rule" | "bar" | "boxed" | "sidebar-caps";
export type FontStyle = "sans" | "serif" | "mixed";
export type Density = "airy" | "normal" | "compact";
export type AtsRating = "excellent" | "good" | "styled";

export type Category =
  | "Tech & Engineering"
  | "Corporate & Finance"
  | "Creative & Design"
  | "Graduate & First job"
  | "Executive & Senior"
  | "Healthcare & Science"
  | "Sales & Marketing"
  | "Academic & Research";

export interface ResumeTemplate {
  slug: string;
  name: string;
  category: Category;
  layout: LayoutId;
  header: HeaderStyle;
  heading: HeadingStyle;
  font: FontStyle;
  density: Density;
  photo: boolean;
  accent: string;
  ats: AtsRating;
  blurb: string;
  popular?: boolean;
}

const T = (t: ResumeTemplate) => t;

export const resumeTemplates: ResumeTemplate[] = [
  /* ---------------- Tech & Engineering ---------------- */
  T({ slug: "atlas", name: "Atlas", category: "Tech & Engineering", layout: "single", header: "left", heading: "rule", font: "sans", density: "normal", photo: false, accent: "#1f2937", ats: "excellent", blurb: "Plain, fast to scan, zero parsing risk. The default choice for big-company portals.", popular: true }),
  T({ slug: "terminal", name: "Terminal", category: "Tech & Engineering", layout: "single", header: "left", heading: "bar", font: "sans", density: "compact", photo: false, accent: "#0f766e", ats: "excellent", blurb: "Dense single column — fits a long project and stack history on one page." }),
  T({ slug: "vector", name: "Vector", category: "Tech & Engineering", layout: "sidebar-right", header: "left", heading: "upper", font: "sans", density: "normal", photo: false, accent: "#4f46e5", ats: "styled", blurb: "Skills and tooling pinned to a right rail so they read at a glance.", popular: true }),
  T({ slug: "commit", name: "Commit", category: "Tech & Engineering", layout: "timeline", header: "left", heading: "plain", font: "sans", density: "normal", photo: false, accent: "#2563eb", ats: "good", blurb: "Timeline down the experience — good when your progression is the story." }),
  T({ slug: "kernel", name: "Kernel", category: "Tech & Engineering", layout: "single", header: "split", heading: "upper", font: "sans", density: "compact", photo: false, accent: "#111827", ats: "excellent", blurb: "Name left, contact right. Maximum content per page." }),

  /* ---------------- Corporate & Finance ---------------- */
  T({ slug: "sterling", name: "Sterling", category: "Corporate & Finance", layout: "single", header: "centered", heading: "rule", font: "serif", density: "normal", photo: false, accent: "#1e3a5f", ats: "excellent", blurb: "Conservative serif, centred header. Reads as considered and senior.", popular: true }),
  T({ slug: "ledger", name: "Ledger", category: "Corporate & Finance", layout: "single", header: "left", heading: "boxed", font: "mixed", density: "normal", photo: false, accent: "#334155", ats: "good", blurb: "Boxed section labels give structure without decoration." }),
  T({ slug: "meridian", name: "Meridian", category: "Corporate & Finance", layout: "band", header: "centered", heading: "upper", font: "serif", density: "normal", photo: false, accent: "#1e3a5f", ats: "good", blurb: "Restrained colour band across the top, everything else plain." }),
  T({ slug: "charter", name: "Charter", category: "Corporate & Finance", layout: "sidebar-left", header: "left", heading: "sidebar-caps", font: "serif", density: "normal", photo: false, accent: "#334155", ats: "styled", blurb: "Left rail for credentials and certifications." }),
  T({ slug: "audit", name: "Audit", category: "Corporate & Finance", layout: "single", header: "split", heading: "rule", font: "serif", density: "compact", photo: false, accent: "#111827", ats: "excellent", blurb: "Tight, formal, and completely parser-safe." }),

  /* ---------------- Creative & Design ---------------- */
  T({ slug: "canvas", name: "Canvas", category: "Creative & Design", layout: "sidebar-wide", header: "photo-left", heading: "sidebar-caps", font: "sans", density: "airy", photo: true, accent: "#7c3aed", ats: "styled", blurb: "Wide photo sidebar with generous space — a portfolio-style first page.", popular: true }),
  T({ slug: "palette", name: "Palette", category: "Creative & Design", layout: "band", header: "photo-center", heading: "bar", font: "sans", density: "normal", photo: true, accent: "#db2777", ats: "styled", blurb: "Colour band with a centred portrait. Bold and memorable." }),
  T({ slug: "studio", name: "Studio", category: "Creative & Design", layout: "two-col", header: "left", heading: "upper", font: "mixed", density: "airy", photo: false, accent: "#ea580c", ats: "styled", blurb: "Two balanced columns — works well when projects matter as much as roles." }),
  T({ slug: "portfolio", name: "Portfolio", category: "Creative & Design", layout: "sidebar-right", header: "photo-right", heading: "plain", font: "sans", density: "airy", photo: true, accent: "#0891b2", ats: "styled", blurb: "Portrait top-right, links and skills alongside." }),
  T({ slug: "gallery", name: "Gallery", category: "Creative & Design", layout: "sidebar-left", header: "photo-left", heading: "bar", font: "sans", density: "normal", photo: true, accent: "#9333ea", ats: "styled", blurb: "Filled left rail with photo, contact and skills." }),

  /* ---------------- Graduate & First job ---------------- */
  T({ slug: "campus", name: "Campus", category: "Graduate & First job", layout: "single", header: "centered", heading: "rule", font: "sans", density: "airy", photo: false, accent: "#2563eb", ats: "excellent", blurb: "Education first, generous spacing — designed for a short history.", popular: true }),
  T({ slug: "intern", name: "Intern", category: "Graduate & First job", layout: "single", header: "left", heading: "upper", font: "sans", density: "airy", photo: false, accent: "#0d9488", ats: "excellent", blurb: "Simple and open. Projects and coursework carry the page." }),
  T({ slug: "fresher", name: "Fresher", category: "Graduate & First job", layout: "sidebar-right", header: "centered", heading: "plain", font: "sans", density: "airy", photo: false, accent: "#16a34a", ats: "styled", blurb: "Side rail for skills and tools so a thin history still fills the page." }),
  T({ slug: "scholar-start", name: "Scholar", category: "Graduate & First job", layout: "single", header: "centered", heading: "plain", font: "serif", density: "normal", photo: false, accent: "#1e3a5f", ats: "excellent", blurb: "Quiet serif treatment for academic-leaning first roles." }),
  T({ slug: "launch", name: "Launch", category: "Graduate & First job", layout: "band", header: "left", heading: "bar", font: "sans", density: "normal", photo: false, accent: "#f59e0b", ats: "good", blurb: "A warm accent band — friendly without being unserious." }),

  /* ---------------- Executive & Senior ---------------- */
  T({ slug: "chairman", name: "Chairman", category: "Executive & Senior", layout: "single", header: "centered", heading: "rule", font: "serif", density: "airy", photo: false, accent: "#111827", ats: "excellent", blurb: "Wide margins, serif headings. Confidence through restraint.", popular: true }),
  T({ slug: "boardroom", name: "Boardroom", category: "Executive & Senior", layout: "single", header: "split", heading: "upper", font: "serif", density: "normal", photo: false, accent: "#7f1d1d", ats: "excellent", blurb: "Deep accent, formal structure, achievement-led." }),
  T({ slug: "principal", name: "Principal", category: "Executive & Senior", layout: "sidebar-left", header: "left", heading: "sidebar-caps", font: "mixed", density: "normal", photo: false, accent: "#1f2937", ats: "styled", blurb: "Left rail carries board seats, certifications and languages." }),
  T({ slug: "summit", name: "Summit", category: "Executive & Senior", layout: "band", header: "split", heading: "rule", font: "serif", density: "normal", photo: false, accent: "#1e3a5f", ats: "good", blurb: "Full-width header band with a clean body beneath." }),
  T({ slug: "legacy", name: "Legacy", category: "Executive & Senior", layout: "timeline", header: "centered", heading: "plain", font: "serif", density: "normal", photo: false, accent: "#57534e", ats: "good", blurb: "A career timeline for long, linear progressions." }),

  /* ---------------- Healthcare & Science ---------------- */
  T({ slug: "clinic", name: "Clinic", category: "Healthcare & Science", layout: "single", header: "centered", heading: "upper", font: "sans", density: "normal", photo: false, accent: "#0e7490", ats: "excellent", blurb: "Licences and credentials sit high where reviewers look first.", popular: true }),
  T({ slug: "vital", name: "Vital", category: "Healthcare & Science", layout: "sidebar-right", header: "left", heading: "upper", font: "sans", density: "normal", photo: false, accent: "#0891b2", ats: "styled", blurb: "Side rail for certifications, registrations and languages." }),
  T({ slug: "lab", name: "Lab", category: "Healthcare & Science", layout: "single", header: "left", heading: "bar", font: "sans", density: "compact", photo: false, accent: "#047857", ats: "excellent", blurb: "Compact and factual — publications and techniques fit comfortably." }),
  T({ slug: "care", name: "Care", category: "Healthcare & Science", layout: "single", header: "centered", heading: "rule", font: "mixed", density: "airy", photo: false, accent: "#0d9488", ats: "excellent", blurb: "Calm and readable, for patient-facing and community roles." }),
  T({ slug: "practice", name: "Practice", category: "Healthcare & Science", layout: "sidebar-left", header: "left", heading: "sidebar-caps", font: "serif", density: "normal", photo: false, accent: "#155e75", ats: "styled", blurb: "Left rail for registration numbers and continuing education." }),

  /* ---------------- Sales & Marketing ---------------- */
  T({ slug: "pitch", name: "Pitch", category: "Sales & Marketing", layout: "band", header: "left", heading: "bar", font: "sans", density: "normal", photo: false, accent: "#dc2626", ats: "good", blurb: "Bold band and strong headings — numbers up front.", popular: true }),
  T({ slug: "quota", name: "Quota", category: "Sales & Marketing", layout: "single", header: "split", heading: "boxed", font: "sans", density: "compact", photo: false, accent: "#ea580c", ats: "excellent", blurb: "Built to list targets, attainment and territory results." }),
  T({ slug: "funnel", name: "Funnel", category: "Sales & Marketing", layout: "sidebar-right", header: "left", heading: "upper", font: "sans", density: "normal", photo: false, accent: "#c026d3", ats: "styled", blurb: "Right rail for tools, channels and metrics." }),
  T({ slug: "brand", name: "Brand", category: "Sales & Marketing", layout: "sidebar-wide", header: "photo-left", heading: "sidebar-caps", font: "sans", density: "normal", photo: true, accent: "#7c3aed", ats: "styled", blurb: "Photo-led, for client-facing and brand-side roles." }),
  T({ slug: "reach", name: "Reach", category: "Sales & Marketing", layout: "two-col", header: "centered", heading: "rule", font: "mixed", density: "normal", photo: false, accent: "#e11d48", ats: "styled", blurb: "Two columns to balance campaigns against employment history." }),

  /* ---------------- Academic & Research ---------------- */
  T({ slug: "thesis", name: "Thesis", category: "Academic & Research", layout: "single", header: "centered", heading: "plain", font: "serif", density: "compact", photo: false, accent: "#1c1917", ats: "excellent", blurb: "CV-style: publications, teaching and grants with no decoration.", popular: true }),
  T({ slug: "citation", name: "Citation", category: "Academic & Research", layout: "single", header: "left", heading: "rule", font: "serif", density: "compact", photo: false, accent: "#374151", ats: "excellent", blurb: "Dense serif layout for multi-page academic CVs." }),
  T({ slug: "faculty", name: "Faculty", category: "Academic & Research", layout: "single", header: "centered", heading: "upper", font: "serif", density: "normal", photo: false, accent: "#4c1d95", ats: "excellent", blurb: "Formal and spacious, for faculty and fellowship applications." }),
  T({ slug: "archive", name: "Archive", category: "Academic & Research", layout: "sidebar-left", header: "left", heading: "sidebar-caps", font: "serif", density: "compact", photo: false, accent: "#44403c", ats: "styled", blurb: "Left rail for affiliations, languages and methods." }),
  T({ slug: "field", name: "Field", category: "Academic & Research", layout: "timeline", header: "left", heading: "plain", font: "mixed", density: "normal", photo: false, accent: "#166534", ats: "good", blurb: "Timeline for fieldwork, placements and research posts." }),
];

export const templateBySlug = (slug: string) => resumeTemplates.find((t) => t.slug === slug);

export const CATEGORIES: Category[] = [
  "Tech & Engineering",
  "Corporate & Finance",
  "Creative & Design",
  "Graduate & First job",
  "Executive & Senior",
  "Healthcare & Science",
  "Sales & Marketing",
  "Academic & Research",
];

export const ATS_LABEL: Record<AtsRating, { label: string; tone: "good" | "ok" | "warn" }> = {
  excellent: { label: "ATS excellent", tone: "good" },
  good: { label: "ATS good", tone: "ok" },
  styled: { label: "Styled — check the portal", tone: "warn" },
};
