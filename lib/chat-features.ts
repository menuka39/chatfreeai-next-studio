/**
 * Which chat features each tier gets, and how they're metered.
 *
 * COST REALITY THAT SHAPES THIS FILE: an OpenRouter web search costs $0.005
 * per request (Exa, up to 10 results) on top of the tokens the results add to
 * the prompt. At our credit rate that's ~39,700 credits — roughly FIVE TIMES a
 * guest's entire 8,000-credit daily allowance. Billing search from the credit
 * pool would mean a guest could never complete even one search, and a free
 * user would burn their whole day on two.
 *
 * So search and research are metered in CALLS PER DAY, separately from
 * credits, with caps chosen from what they actually cost us:
 *
 *   guest    3 searches/day  = $0.015/day  (no revenue — this is pure spend)
 *   free    15 searches/day  = $0.075/day
 *   starter 60 searches/day  = $0.30/day   vs ~$5.61 monthly profit
 *   pro    150 searches/day  = $0.75/day   vs ~$6.16
 *   promax 300 searches/day  = $1.50/day   vs ~$6.02
 *
 * The paid caps are ceilings against scripted abuse, not expected usage — a
 * heavy human day is 10-30 searches. The GUEST tier is the one to watch: it is
 * the only tier where the spend has no revenue behind it at all.
 */

import type { Session } from "./session";
import { passActive } from "./resume-pass";

export type ChatTier = "guest" | "free" | "starter" | "pro" | "promax";

export interface ChatFeatures {
  tier: ChatTier;
  label: string;
  paid: boolean;

  /** live web results merged into the answer */
  webSearch: boolean;
  webSearchDaily: number;

  /** multi-step research: several searches, then a synthesised answer */
  research: boolean;
  researchDaily: number;
  /** how many searches one research run may make */
  researchDepth: number;

  /** attach images (vision) and text documents */
  attachments: boolean;
  maxAttachments: number;
  maxAttachmentMb: number;
  /** images need a vision-capable model */
  imageAttachments: boolean;
  /**
   * PDF text extraction. Restricted to monthly packages — not because
   * extraction costs us anything (it runs in the browser), but because a long
   * PDF is the one attachment that can genuinely inflate token spend, and a
   * package holder pays for those tokens from their own pool.
   */
  pdfAttachments: boolean;
  /**
   * Read .zip code archives. Packages only — it's the most token-hungry
   * attachment we support, and a package holder pays those tokens from a pool
   * they bought, which keeps it self-limiting.
   */
  zipAttachments: boolean;

  /** saved reusable instruction presets */
  skills: boolean;
  maxSkills: number;

  /** group chats under a project with shared context */
  projects: boolean;
  maxProjects: number;
}

const TIERS: Record<ChatTier, Omit<ChatFeatures, "tier" | "label" | "paid">> = {
  guest: {
    webSearch: true,
    webSearchDaily: 3,
    research: false,
    researchDaily: 0,
    researchDepth: 0,
    attachments: false,
    maxAttachments: 0,
    maxAttachmentMb: 0,
    imageAttachments: false,
    pdfAttachments: false,
    zipAttachments: false,
    skills: false,
    maxSkills: 0,
    projects: false,
    maxProjects: 0,
  },
  free: {
    webSearch: true,
    webSearchDaily: 15,
    research: true,
    researchDaily: 2,
    researchDepth: 3,
    attachments: true,
    maxAttachments: 3,
    maxAttachmentMb: 5,
    imageAttachments: true,
    pdfAttachments: false,
    zipAttachments: false,
    skills: true,
    maxSkills: 5,
    projects: true,
    maxProjects: 3,
  },
  starter: {
    webSearch: true,
    webSearchDaily: 60,
    research: true,
    researchDaily: 10,
    researchDepth: 5,
    attachments: true,
    maxAttachments: 6,
    maxAttachmentMb: 10,
    imageAttachments: true,
    pdfAttachments: true,
    zipAttachments: true,
    skills: true,
    maxSkills: 25,
    projects: true,
    maxProjects: 20,
  },
  pro: {
    webSearch: true,
    webSearchDaily: 150,
    research: true,
    researchDaily: 30,
    researchDepth: 6,
    attachments: true,
    maxAttachments: 10,
    maxAttachmentMb: 20,
    imageAttachments: true,
    pdfAttachments: true,
    zipAttachments: true,
    skills: true,
    maxSkills: 100,
    projects: true,
    maxProjects: 100,
  },
  promax: {
    webSearch: true,
    webSearchDaily: 300,
    research: true,
    researchDaily: 60,
    researchDepth: 8,
    attachments: true,
    maxAttachments: 20,
    maxAttachmentMb: 30,
    imageAttachments: true,
    pdfAttachments: true,
    zipAttachments: true,
    skills: true,
    maxSkills: 500,
    projects: true,
    maxProjects: 500,
  },
};

const LABELS: Record<ChatTier, string> = {
  guest: "Free — sign in to unlock files, research, skills and projects",
  free: "Free account",
  starter: "Starter",
  pro: "Pro",
  promax: "Pro Max",
};

export function chatFeatures(session: Session): ChatFeatures {
  const pkg = session.packageId;
  let tier: ChatTier;

  // A monthly package always wins — it must never give less than a free account
  if (pkg === "promax" || pkg === "pro" || pkg === "starter") tier = pkg;
  else if (session.userId || passActive(session.resumePassExpiresAt)) tier = "free";
  else tier = "guest";

  return {
    tier,
    label: LABELS[tier],
    paid: tier !== "guest" && tier !== "free",
    ...TIERS[tier],
  };
}

/** Per-day counter keys, kept separate from the credit pools. */
export function featureKey(kind: "search" | "research", session: Session, ipHash: string) {
  const day = new Date().toISOString().slice(0, 10);
  return session.userId ? `q:${kind}:u:${session.userId}:${day}` : `q:${kind}:g:${ipHash}:${day}`;
}

/**
 * Ceiling on the total characters one request may carry, per tier.
 *
 * Attachments are inlined into the message content, so from the server's point
 * of view "a 40-page PDF" and "a very long paste" are the same thing: a large
 * prompt we pay the provider for. Capping characters is therefore the honest
 * enforcement point — it limits what a request can cost us regardless of how
 * the client chose to build it, including a client we didn't write.
 *
 * Sized to comfortably fit each tier's legitimate use: a free user's 3 files,
 * a package holder's PDF or code archive.
 */
export const MAX_REQUEST_CHARS: Record<ChatTier, number> = {
  guest: 24_000,
  free: 120_000,
  starter: 400_000,
  pro: 700_000,
  promax: 1_200_000,
};

/** Rough USD cost of one search, for margin logging. */
export const WEB_SEARCH_USD = 0.005;
