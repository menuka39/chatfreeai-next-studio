import { audioModels } from "./audio-models";
import { musicModels } from "./music-models";
import { resumeTemplates } from "./resume-templates";
import { imageModels } from "./image-models";
import { videoModels } from "./video-models";

/**
 * Feature lines quote these counts, so they are read from the model lists
 * rather than typed in. The audio line said "all 4 models" while only 2
 * still worked — two OpenAI ids had been removed after they turned out not
 * to serve the speech endpoint, and the marketing copy kept advertising
 * them. Deriving the number means that can't happen again.
 */
const MODEL_COUNTS = {
  audio: audioModels.length,
  image: imageModels.length,
  video: videoModels.length,
  music: musicModels.length,
  templates: resumeTemplates.length,
};

/**
 * Plans and packages.
 *
 * ALL paid plans unlock ALL models (chat, image and video). Plans differ only
 * in monthly credits and limits.
 *
 * PRICING TARGET: ~$5-6 profit per package per month — deliberately slim so
 * users get near-cost usage, but with enough buffer to survive a price change.
 * Credits are sized against the WORST case: every credit spent on the most
 * expensive thing available.
 *
 *   1M credits costs us ~$0.126 (uniform across chat, image and video)
 *   OpenRouter credit top-ups carry a 5.5% purchase fee
 *   Card processing is ~2.9% + $0.30
 *
 *   Starter  $14.99  -> 65M  credits -> ~$9.4 all-in   -> ~$5.6 profit
 *   Pro      $44.99  -> 280M credits -> ~$38.8 all-in  -> ~$6.2 profit
 *   Pro Max  $139.99 -> 975M credits -> ~$134.0 all-in -> ~$6.0 profit
 *
 * ⚠️ Margins are ~4% — thin. Before launch:
 *   1. Verify every `estimated` price in models/video-models/image-models.
 *      A wrong estimate can still wipe out the profit on a package.
 *   2. The free tier (guests + free accounts) costs real money and earns
 *      nothing. Budget for it separately — roughly one paid Starter customer
 *      covers ~50-60 daily guests.
 *   3. If a provider raises its price, cut the package credits. Don't absorb.
 */

import type { Plan } from "./models";

export interface Package {
  id: Exclude<Plan, "free">;
  name: string;
  price: number;
  credits: number;
  blurb: string;
  /** headline restrictions, shown on the pricing card */
  limits: {
    maxOutputTokens: number;
    historyMessages: number;
    /** parallel chats / requests in flight */
    concurrency: number;
  };
  features: string[];
  highlight?: boolean;
}

/** Daily free allowances — hard reset at 00:00 UTC, no carry-over, no top-ups. */
export const FREE_LIMITS = {
  guest: 8_000,
  free: 20_000,
} as const;

/** Restrictions that apply to the free tiers. */
export const FREE_RESTRICTIONS = {
  guest: { maxOutputTokens: 600, historyMessages: 6, concurrency: 1 },
  free: { maxOutputTokens: 1_000, historyMessages: 10, concurrency: 1 },
} as const;

export const packages: Package[] = [
  {
    id: "starter",
    name: "Starter",
    price: 14.99,
    credits: 65_000_000,
    blurb: "Every model, for everyday use.",
    limits: { maxOutputTokens: 2_000, historyMessages: 20, concurrency: 2 },
    features: [
      "65M credits every month — no daily caps",
      "ALL 24 chat models unlocked",
      `AI video generation — all ${MODEL_COUNTS.video} models`,
      `AI image generation — all ${MODEL_COUNTS.image} models`,
      `AI voice generation — all ${MODEL_COUNTS.audio} models`,
      `AI music generation — all ${MODEL_COUNTS.music} models`,
      `Resume Builder — ${MODEL_COUNTS.templates} templates, AI suggestions don't use credits`,
      "5 free 24-hour Priority tool listings a month",
      "Document, screening & Q&A tools",
      "Longer replies (2,000 tokens)",
      "Chat history saved to your account",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 44.99,
    credits: 280_000_000,
    blurb: "For daily heavy work — research, code, long documents.",
    limits: { maxOutputTokens: 4_000, historyMessages: 40, concurrency: 4 },
    features: [
      "280M credits every month — 4x Starter",
      "ALL 24 chat models unlocked",
      `AI video generation — all ${MODEL_COUNTS.video} models`,
      `AI image generation — all ${MODEL_COUNTS.image} models`,
      `AI voice generation — all ${MODEL_COUNTS.audio} models`,
      `AI music generation — all ${MODEL_COUNTS.music} models`,
      `Resume Builder — ${MODEL_COUNTS.templates} templates, AI suggestions don't use credits`,
      "5 free 24-hour Priority tool listings a month",
      "Document, screening & Q&A tools",
      "Chat history saved to your account",
      "Longer replies (4,000 tokens)",
      "Deeper memory (40 messages)",
      "Priority routing — faster responses",
      "Export chats to TXT and PDF",
    ],
    highlight: true,
  },
  {
    id: "promax",
    name: "Pro Max",
    price: 139.99,
    credits: 975_000_000,
    blurb: "For teams and all-day, every-model usage.",
    limits: { maxOutputTokens: 8_000, historyMessages: 100, concurrency: 10 },
    features: [
      "975M credits every month — 15x Starter",
      "ALL 24 chat models unlocked",
      `AI video generation — all ${MODEL_COUNTS.video} models`,
      `AI image generation — all ${MODEL_COUNTS.image} models`,
      `AI voice generation — all ${MODEL_COUNTS.audio} models`,
      `AI music generation — all ${MODEL_COUNTS.music} models`,
      `Resume Builder — ${MODEL_COUNTS.templates} templates, AI suggestions don't use credits`,
      "5 free 24-hour Priority tool listings a month",
      "Document, screening & Q&A tools",
      "Chat history saved to your account",
      "Longest replies (8,000 tokens)",
      "10 chats at once, deepest memory (100 messages)",
      "Priority routing — faster responses",
      "Export chats to TXT and PDF",
      "Best credit rate per dollar",
      "Email support within 24 hours",
    ],
  },
];

export const packageById = (id: string) => packages.find((p) => p.id === id);

/** Runtime restrictions for whichever plan the request belongs to. */
export function restrictionsFor(plan: Plan, isGuest: boolean) {
  if (plan === "free") return isGuest ? FREE_RESTRICTIONS.guest : FREE_RESTRICTIONS.free;
  return packageById(plan)!.limits;
}
