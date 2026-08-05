/**
 * Video generation catalogue — OpenRouter /api/v1/videos (async jobs).
 *
 * PRICING: OpenRouter bills video per second of output, and for several models
 * the rate DEPENDS ON RESOLUTION — Veo 3.1 Lite is $0.05/s at 720p but
 * $0.08/s at 1080p, and Seedance bills by pixels
 * (tokens = height × width × duration × 24 / 1024), so 1080p is ~2.25× 720p.
 * Each resolution therefore carries its own price and credit rate:
 *
 *   creditsPerSec = costPerSec (USD) × 8,000,000
 *
 * That puts 1M credits at ~$0.125 of cost across chat, image and video, so a
 * credit is worth the same wherever it's spent. Packages are sized to leave
 * ~$5-6/month profit (see lib/packages.ts).
 *
 * Worked example, Veo 3.1 Lite 720p (verified $0.05/s, Jul 2026):
 *   8s video → our cost  = 8 × $0.05 = $0.40
 *            → user pays = 8 × 400k  = 3.2M credits
 *   The same clip at 1080p costs $0.64 and charges 5.12M credits.
 *
 * GENERATION TIME: jobs are async, 1–6 minutes depending on tier.
 *
 * ⚠️ Rates marked `estimated` weren't verifiable on the OpenRouter model page
 * at build time — check before launch. Charging a flat rate when a provider
 * bills per pixel is how you lose money on every high-res generation.
 */

export interface VideoResolution {
  /** shown in the UI and sent to the provider, e.g. "720p" */
  label: string;
  /** USD per second at this resolution */
  costPerSec: number;
  /** package credits per second at this resolution */
  creditsPerSec: number;
  estimated?: boolean;
}

export interface VideoModelConfig {
  id: string;
  name: string;
  provider: string;
  openrouter: string;
  /** cheapest first — the first entry is the default */
  resolutions: VideoResolution[];
  durations: number[];
  defaultDuration: number;
  aspectRatios: string[];
  audio: boolean;
  genTime: string;
  tier: "fast" | "standard" | "premium";
  blurb: string;

  /* ---- capabilities (OpenRouter normalises these across providers) ---- */
  /** animate a starting image — frame_images[frame_type=first_frame] */
  imageToVideo?: boolean;
  /** also pin the closing frame — frame_images[frame_type=last_frame] */
  lastFrame?: boolean;
  /** style/character guidance images — input_references */
  references?: boolean;
  /** reproducible output for the same prompt + seed */
  seed?: boolean;
  /**
   * Cost multiplier when native audio is switched on.
   *
   * Providers that generate synced audio generally charge more for it — Google
   * has historically priced Veo roughly double with audio. Getting this wrong
   * means losing money on every audio clip, so anything unverified carries 2×,
   * matching the SAFETY_FACTOR convention in lib/price-oracle.ts. Verify and
   * lower it before launch; never raise the risk by guessing lower.
   */
  audioSurcharge?: number;
}

export const videoModels: VideoModelConfig[] = [
  /* ---------- fast & affordable ---------- */
  {
    id: "veo-31-lite",
    name: "Veo 3.1 Lite",
    provider: "Google",
    openrouter: "google/veo-3.1-lite",
    // verified: $0.05/s at 720p, $0.08/s at 1080p
    resolutions: [
      { label: "720p", costPerSec: 0.05, creditsPerSec: 400_000 },
      { label: "1080p", costPerSec: 0.08, creditsPerSec: 640_000 },
    ],
    durations: [4, 6, 8],
    defaultDuration: 8,
    aspectRatios: ["16:9", "9:16"],
    audio: true,
    genTime: "~1–2 min",
    tier: "fast",
    blurb: "Cheapest way to a clean clip — with native audio.",
    imageToVideo: true, audioSurcharge: 2, seed: true,
  },
  {
    id: "seedance-20-fast",
    name: "Seedance 2.0 Fast",
    provider: "ByteDance",
    openrouter: "bytedance/seedance-2.0-fast",
    // billed per pixel: 1080p is 2.25x the pixels of 720p
    resolutions: [
      { label: "720p", costPerSec: 0.0538, creditsPerSec: 430_000 },
      { label: "1080p", costPerSec: 0.121, creditsPerSec: 970_000, estimated: true },
    ],
    durations: [4, 6, 8, 10],
    defaultDuration: 6,
    aspectRatios: ["16:9", "9:16", "1:1"],
    audio: false,
    genTime: "~1–2 min",
    tier: "fast",
    blurb: "Fast iterations, strong reference-image control.",
    imageToVideo: true, references: true, seed: true,
  },
  {
    id: "hailuo-23",
    name: "Hailuo 2.3",
    provider: "MiniMax",
    openrouter: "minimax/hailuo-2.3",
    resolutions: [{ label: "1080p", costPerSec: 0.0817, creditsPerSec: 650_000 }],
    durations: [6, 10],
    defaultDuration: 6,
    aspectRatios: ["16:9", "9:16", "1:1"],
    audio: false,
    genTime: "~2–3 min",
    tier: "fast",
    blurb: "Expressive characters and realistic motion.",
    imageToVideo: true, seed: true,
  },

  /* ---------- standard quality ---------- */
  {
    id: "wan-26",
    name: "Wan 2.6",
    provider: "Alibaba",
    openrouter: "alibaba/wan-2.6",
    resolutions: [{ label: "1080p", costPerSec: 0.1, creditsPerSec: 800_000, estimated: true }],
    durations: [5, 10, 15],
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    audio: true,
    genTime: "~2–4 min",
    tier: "standard",
    blurb: "Multi-shot storytelling with synced audio and lip-sync.",
    imageToVideo: true, seed: true,
  },
  {
    id: "kling-30-std",
    name: "Kling v3.0 Standard",
    provider: "Kuaishou",
    openrouter: "kwaivgi/kling-v3.0-std",
    resolutions: [{ label: "1080p", costPerSec: 0.126, creditsPerSec: 1_000_000 }],
    durations: [3, 5, 10, 15],
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    audio: true,
    genTime: "~2–4 min",
    tier: "standard",
    blurb: "First/last-frame control for precise scene composition.",
    imageToVideo: true, lastFrame: true, audioSurcharge: 2, seed: true,
  },
  {
    id: "veo-31-fast",
    name: "Veo 3.1 Fast",
    provider: "Google",
    openrouter: "google/veo-3.1-fast",
    resolutions: [
      { label: "720p", costPerSec: 0.15, creditsPerSec: 1_200_000 },
      { label: "1080p", costPerSec: 0.2, creditsPerSec: 1_600_000, estimated: true },
    ],
    durations: [4, 6, 8],
    defaultDuration: 8,
    aspectRatios: ["16:9", "9:16"],
    audio: true,
    genTime: "~2–3 min",
    tier: "standard",
    blurb: "Veo quality with faster turnaround and native audio.",
    imageToVideo: true, audioSurcharge: 2, seed: true,
  },

  /* ---------- premium / cinematic ---------- */
  {
    id: "kling-30-pro",
    name: "Kling v3.0 Pro",
    provider: "Kuaishou",
    openrouter: "kwaivgi/kling-v3.0-pro",
    resolutions: [{ label: "1080p", costPerSec: 0.252, creditsPerSec: 2_000_000, estimated: true }],
    durations: [3, 5, 10, 15],
    defaultDuration: 5,
    aspectRatios: ["16:9", "9:16", "1:1"],
    audio: true,
    genTime: "~3–5 min",
    tier: "premium",
    blurb: "Kling's premium tier — noticeably richer detail.",
    imageToVideo: true, lastFrame: true, audioSurcharge: 2, seed: true,
  },
  {
    id: "sora-2-pro",
    name: "Sora 2 Pro",
    provider: "OpenAI",
    openrouter: "openai/sora-2-pro",
    resolutions: [{ label: "1080p", costPerSec: 0.5, creditsPerSec: 4_000_000, estimated: true }],
    durations: [4, 8, 12],
    defaultDuration: 8,
    aspectRatios: ["16:9", "9:16", "1:1"],
    audio: true,
    genTime: "~3–6 min",
    tier: "premium",
    blurb: "Film-grade realism and the best motion coherence.",
    imageToVideo: true, seed: true,
  },
];

export const videoModelById = (id: string) => videoModels.find((m) => m.id === id);

export function videoResolution(model: VideoModelConfig, label?: string) {
  return model.resolutions.find((r) => r.label === label) ?? model.resolutions[0];
}

export function videoCredits(model: VideoModelConfig, seconds: number, resolution?: string) {
  return Math.ceil(seconds * videoResolution(model, resolution).creditsPerSec);
}

/** Real USD cost of one generation — for margin logging only. */
export function videoRealCost(model: VideoModelConfig, seconds: number, resolution?: string) {
  return seconds * videoResolution(model, resolution).costPerSec;
}
