/**
 * Image generation catalogue — OpenRouter unified Image API.
 *
 * PRICING: creditsPerImage = costPerImage (USD) × 8,000,000, charged from the
 * SAME monthly package credits as chat and video. That puts 1M credits at
 * ~$0.125 of cost across every modality, so a credit is worth the same
 * wherever it's spent. Failed generations are refunded — OpenRouter itself
 * does not bill failed image generations (502, no charge).
 *
 * Most models are flat-priced per image regardless of size (Seedream 4.5 is
 * explicitly "$0.04 per output image, regardless of size"). FLUX.2 Pro bills
 * $0.03 per MEGAPIXEL, so it gets quality tiers instead of a flat price.
 *
 * ASPECT RATIOS are per-model — only list ones the provider actually accepts,
 * otherwise the API rejects the request.
 *
 * ⚠️ Prices marked `estimated` weren't verifiable at build time — check the
 * OpenRouter model pages before launch.
 */

export interface QualityTier {
  label: string;
  megapixels: number;
  credits: number;
  costUsd: number;
}

/** Resolution tier — OpenRouter normalises these to 1K/2K/4K. */
export interface ImageResolution {
  label: string;
  megapixels: number;
  credits: number;
  costUsd: number;
  estimated?: boolean;
}

export interface ImageModelConfig {
  id: string;
  name: string;
  provider: string;
  openrouter: string;
  aspectRatios: string[];

  /* ---- capabilities (from OpenRouter's image models endpoint) ---- */
  /** accepts input_references — i.e. edit an existing image */
  edit?: boolean;
  /** how many reference images the provider takes */
  maxReferences?: number;
  /** reproducible output for the same prompt + seed */
  seed?: boolean;
  /** can render a transparent background (logos, stickers, cut-outs) */
  transparent?: boolean;
  /** png is universal; webp/jpeg where the provider supports them */
  outputFormats?: string[];
  /** how many images one request may return */
  maxImages?: number;
  /**
   * Providers that accept only a fixed set of pixel sizes, keyed by aspect
   * ratio. OpenAI's GPT Image models are the case in point: they take
   * 1024x1024, 1024x1536 and 1536x1024 and reject anything else outright —
   * a computed size like 816x1232 comes back as
   * "Invalid size '816x1232'", which is what made every OpenAI image
   * generation fail. Models without this keep the computed size, which is
   * what providers like Gemini and FLUX actually want.
   */
  fixedSizes?: Record<string, string>;
  /** resolution tiers where the provider prices by output size */
  resolutions?: ImageResolution[];
  /** flat price per image — used when qualityTiers is absent */
  credits: number;
  costUsd: number;
  /** per-megapixel models expose size tiers instead of a flat price */
  qualityTiers?: QualityTier[];
  genTime: string;
  tier: "fast" | "standard" | "premium";
  blurb: string;
  estimated?: boolean;
}

/**
 * Ratio sets verified against OpenRouter's /api/v1/images/models capability
 * endpoint. These were previously hand-written from docs and did not match
 * what the providers actually accept.
 */
/** openai/gpt-image-1-mini */
const GPT_RATIOS = ["1:1", "3:2", "2:3"];
/** openai/gpt-image-2 — a wider set than the 1-mini generation */
const GPT2_RATIOS = ["1:1", "3:2", "2:3", "4:3", "3:4", "16:9", "9:16", "21:9"];
/** Gemini image family and Seedream — the common subset they all support */
const WIDE_RATIOS = ["1:1", "2:3", "3:2", "3:4", "4:3", "9:16", "16:9", "21:9"];
/** black-forest-labs/flux.2-pro */
const FLUX_RATIOS = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "21:9"];

export const imageModels: ImageModelConfig[] = [
  /* ---------- fast & affordable ---------- */
  {
    id: "gpt-image-1-mini",
    name: "GPT Image 1 Mini",
    provider: "OpenAI",
    openrouter: "openai/gpt-image-1-mini",
    aspectRatios: GPT_RATIOS,
    credits: 40_000,
    costUsd: 0.005,
    genTime: "~5–10 s",
    tier: "fast",
    blurb: "The cheapest usable image on the market.",
    edit: true, maxReferences: 4, seed: true, transparent: true, outputFormats: ["png", "jpeg", "webp"], maxImages: 4,
  },
  {
    id: "imagen-4-fast",
    name: "Imagen 4 Fast",
    provider: "Google",
    openrouter: "google/gemini-3.1-flash-lite-image",
    aspectRatios: WIDE_RATIOS,
    credits: 160_000,
    costUsd: 0.02,
    genTime: "~5–10 s",
    tier: "fast",
    blurb: "Best price-to-quality ratio for everyday images.",
    seed: true, outputFormats: ["png", "jpeg"], maxImages: 4,
  },
  {
    id: "nano-banana",
    name: "Nano Banana (Gemini 2.5 Flash Image)",
    provider: "Google",
    openrouter: "google/gemini-2.5-flash-image",
    aspectRatios: WIDE_RATIOS,
    credits: 310_000,
    costUsd: 0.039,
    genTime: "~5–15 s",
    tier: "fast",
    blurb: "Contextual edits and multi-turn image conversations.",
    edit: true, maxReferences: 3, seed: true, outputFormats: ["png", "jpeg", "webp"], maxImages: 4,
  },

  /* ---------- standard quality ---------- */
  {
    id: "seedream-45",
    name: "Seedream 4.5",
    provider: "ByteDance",
    openrouter: "bytedance-seed/seedream-4.5",
    aspectRatios: WIDE_RATIOS,
    credits: 320_000,
    costUsd: 0.04,
    genTime: "~10–15 s",
    tier: "standard",
    blurb: "Excellent editing consistency, portraits and small text.",
    edit: true, maxReferences: 4, seed: true, outputFormats: ["png", "jpeg"], maxImages: 4,
  },
  {
    id: "imagen-4",
    name: "Imagen 4",
    provider: "Google",
    openrouter: "google/gemini-3-pro-image",
    aspectRatios: WIDE_RATIOS,
    credits: 320_000,
    costUsd: 0.04,
    genTime: "~10–15 s",
    tier: "standard",
    blurb: "Google's standard tier — reliable, photoreal output.",
    seed: true, outputFormats: ["png", "jpeg"], maxImages: 4,
  },
  {
    id: "gpt-image-15",
    name: "GPT Image 1.5",
    provider: "OpenAI",
    openrouter: "openai/gpt-image-2",
    aspectRatios: GPT2_RATIOS,
    credits: 320_000,
    costUsd: 0.04,
    genTime: "~10–20 s",
    tier: "standard",
    blurb: "Quality benchmark leader (LM Arena Elo 1,264).",
    edit: true, maxReferences: 4, seed: true, transparent: true, outputFormats: ["png", "jpeg", "webp"], maxImages: 4,
  },

  /* ---------- premium ---------- */
  {
    id: "flux-2-pro",
    name: "FLUX.2 Pro",
    provider: "Black Forest Labs",
    openrouter: "black-forest-labs/flux.2-pro",
    aspectRatios: FLUX_RATIOS,
    // billed $0.03 per megapixel → credits scale with the size tier
    credits: 240_000,
    costUsd: 0.03,
    qualityTiers: [
      { label: "Standard", megapixels: 1, credits: 240_000, costUsd: 0.03 },
      { label: "High", megapixels: 2.4, credits: 570_000, costUsd: 0.071 },
      { label: "Max", megapixels: 4.2, credits: 1_010_000, costUsd: 0.126 },
    ],
    genTime: "~10–20 s",
    tier: "premium",
    blurb: "Ties for the quality crown — priced per megapixel.",
    edit: true, maxReferences: 1, seed: true, outputFormats: ["png", "jpeg", "webp"], maxImages: 4,
  },
  {
    id: "nano-banana-2",
    name: "Nano Banana 2 (Gemini 3.1 Flash Image)",
    provider: "Google",
    openrouter: "google/gemini-3.1-flash-image",
    aspectRatios: WIDE_RATIOS,
    credits: 480_000,
    costUsd: 0.06,
    genTime: "~10–15 s",
    tier: "premium",
    blurb: "Pro-level visual quality at Flash speed.",
    edit: true, maxReferences: 3, seed: true, outputFormats: ["png", "jpeg", "webp"], maxImages: 4,
    estimated: true,
  },
  {
    id: "gpt-54-image-2",
    name: "GPT-5.4 Image 2",
    provider: "OpenAI",
    openrouter: "openai/gpt-5.4-image-2",
    aspectRatios: GPT_RATIOS,
    credits: 800_000,
    costUsd: 0.1,
    genTime: "~15–25 s",
    tier: "premium",
    blurb: "OpenAI's newest image engine with GPT-5.4 reasoning.",
    edit: true, maxReferences: 4, seed: true, transparent: true, outputFormats: ["png", "jpeg", "webp"], maxImages: 2,
    estimated: true,
  },
];

export const imageModelById = (id: string) => imageModels.find((m) => m.id === id);

/** Credits + cost for a generation, honouring the quality tier when present. */
export function imagePrice(model: ImageModelConfig, tierLabel?: string) {
  if (model.qualityTiers) {
    const t = model.qualityTiers.find((q) => q.label === tierLabel) ?? model.qualityTiers[0];
    return { credits: t.credits, costUsd: t.costUsd, megapixels: t.megapixels, tier: t.label };
  }
  return { credits: model.credits, costUsd: model.costUsd, megapixels: 1, tier: null };
}

/**
 * Pixel dimensions for a ratio at a given megapixel budget, rounded to a
 * multiple of 16 (what image models expect).
 */
export function dimensionsFor(ratio: string, megapixels = 1) {
  const [rw, rh] = ratio.split(":").map(Number);
  const target = megapixels * 1_000_000;
  const unit = Math.sqrt(target / (rw * rh));
  const round16 = (n: number) => Math.max(256, Math.round(n / 16) * 16);
  return { width: round16(rw * unit), height: round16(rh * unit) };
}

export const imageSizeString = (ratio: string, megapixels = 1) => {
  const { width, height } = dimensionsFor(ratio, megapixels);
  return `${width}x${height}`;
};
