/**
 * AI Tool Submissions — data model, pricing tiers, and the free-queue ETA math.
 *
 * Two lanes: a free FIFO queue (slow, honest about being slow) and paid
 * Priority Listing (guaranteed turnaround, reviewed outside the free queue —
 * that separation is the whole point of selling priority, not a modelling
 * shortcut). Monthly package holders additionally get a handful of free
 * 24-hour priority slots as a subscriber perk (see lib/submission-access.ts).
 */

export type SubmissionTier = "free" | "6h" | "24h" | "48h" | "72h";

export interface PriorityTier {
  id: Exclude<SubmissionTier, "free">;
  hours: number;
  price: number;
  label: string;
}

/** Fastest first — the order they should be shown in. */
export const PRIORITY_TIERS: PriorityTier[] = [
  { id: "6h", hours: 6, price: 44.99, label: "Fastest" },
  { id: "24h", hours: 24, price: 32.99, label: "Next day" },
  { id: "48h", hours: 48, price: 20.99, label: "2 days" },
  { id: "72h", hours: 72, price: 12.99, label: "3 days" },
];

export const priorityTier = (id: string) => PRIORITY_TIERS.find((t) => t.id === id) ?? null;

export const CATEGORIES = [
  "Chatbot",
  "Image generation",
  "Video generation",
  "Voice & audio",
  "Writing",
  "Coding",
  "Productivity",
  "Other",
] as const;
export type SubmissionCategory = (typeof CATEGORIES)[number];

/**
 * How long free-queue review takes, per position in line.
 *
 * This number does double duty: it's the honest estimate shown to a free
 * submitter, AND it's what makes paying for Priority Listing worth anything.
 * The original calibration (3 reviews/day) gave a first-in-line submitter an
 * ETA of 8 hours — which quietly destroys the whole product, since nobody
 * pays $44.99 for a 6-hour turnaround when free is already faster. Set
 * instead so the very first submitter into an empty queue sees exactly
 * 44 days 22 hours: slow enough that every paid tier is a real, honest
 * improvement, not a rounding error.
 *
 * This is the one constant to revisit once real review throughput is known —
 * shorten it if the free queue is actually moving faster than this (an ETA
 * that's routinely wrong erodes trust worse than a long honest one), lengthen
 * it if a backlog builds and this undersells the wait.
 */
export const FREE_REVIEW_INTERVAL_HOURS = 1078; // = 44 days 22 hours per queue slot

/** Cap so one account can't flood the free queue. */
export const MAX_PENDING_FREE_PER_USER = 3;
/** Cap across all tiers, paid included — a generous ceiling against abuse, not a normal-use limit. */
export const MAX_PENDING_TOTAL_PER_USER = 10;

export interface FreeQueueEta {
  /** 1-indexed position in the free queue */
  position: number;
  hours: number;
  days: number;
  remainderHours: number;
}

/** @param position 1-indexed place in the free queue */
export function freeQueueEta(position: number): FreeQueueEta {
  const hours = Math.max(1, position * FREE_REVIEW_INTERVAL_HOURS);
  return {
    position,
    hours,
    days: Math.floor(hours / 24),
    remainderHours: hours % 24,
  };
}

export function formatEta(eta: FreeQueueEta): string {
  const parts: string[] = [];
  if (eta.days > 0) parts.push(`${eta.days} day${eta.days === 1 ? "" : "s"}`);
  parts.push(`${eta.remainderHours} hour${eta.remainderHours === 1 ? "" : "s"}`);
  return parts.join(" ");
}

/* ------------------------------------------------------------------ */
/* Submission field validation — shared by the API and any future UI   */
/* ------------------------------------------------------------------ */

export interface SubmissionInput {
  toolName: string;
  tagline: string;
  description: string;
  websiteUrl: string;
  category: string;
  contactEmail: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Returns a field->message map; empty object means the input is valid. */
export function validateSubmission(input: Partial<SubmissionInput>): Record<string, string> {
  const errors: Record<string, string> = {};

  const name = input.toolName?.trim() ?? "";
  if (name.length < 2 || name.length > 80) errors.toolName = "Tool name should be 2-80 characters.";

  const tagline = input.tagline?.trim() ?? "";
  if (tagline.length < 10 || tagline.length > 140) errors.tagline = "Tagline should be 10-140 characters.";

  const description = input.description?.trim() ?? "";
  if (description.length < 30 || description.length > 1000)
    errors.description = "Description should be 30-1000 characters.";

  const url = input.websiteUrl?.trim() ?? "";
  if (!/^https:\/\/[^\s]+\.[^\s]+/.test(url)) errors.websiteUrl = "Enter a full https:// URL.";

  if (!CATEGORIES.includes(input.category as SubmissionCategory))
    errors.category = "Choose a category from the list.";

  const email = input.contactEmail?.trim() ?? "";
  if (!EMAIL_RE.test(email)) errors.contactEmail = "Enter a valid email address.";

  return errors;
}
