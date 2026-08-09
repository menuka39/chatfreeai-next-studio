/**
 * Model catalogue.
 *
 * TWO GROUPS:
 *  1. BASE models  (plan: "free")  — available to EVERYONE: guests, logged-in
 *     free users, and paid users. No gate at all.
 *  2. PREMIUM models (plan: starter/pro/business) — the newer, heavier models.
 *     These are what the packages actually unlock.
 *
 * `weight` is the credit multiplier: credits_charged = tokens * weight.
 *
 * WEIGHTS ARE DERIVED, NOT GUESSED:
 *   blended = price.in * 0.4 + price.out * 0.6      (conservative: assumes
 *             output-heavy usage, which is the expensive direction)
 *   weight  = ceil(blended / 0.126)                 (0.126 = target $ per 1M
 *             credits, matching image and video)
 * Rounding UP guarantees no model can ever cost more than $0.126 per 1M
 * credits, so a user cannot pick a model combination that produces a loss.
 * If you change a price, recompute the weight with this formula.
 * It is NOT a restriction — every tier can reach every base model. It just
 * makes an expensive model burn the allowance faster, so a guest running the
 * priciest model costs us the same as one running the cheapest.
 *
 * Baseline (weight 1) = ~$0.126 blended per 1M tokens (60% in / 40% out).
 *
 * ⚠️ Prices verified Jul 2026. Model slugs for the newer models change often —
 *    run `npm run verify:models` before launch to check every slug against the
 *    live OpenRouter catalogue.
 */

export type Plan = "free" | "starter" | "pro" | "promax";

import type { DirectProvider } from "./providers";

export interface ModelConfig {
  id: string;
  name: string;
  /** chatbot brand this version belongs to — the picker groups by this */
  brand: string;
  /** version label shown under the brand, e.g. "GPT-5.4 Nano" */
  version: string;
  openrouter: string;
  /**
   * Optional direct route. When the provider's key is set, requests go
   * straight there instead of through OpenRouter; otherwise nothing changes.
   * `directModel` is the provider's own id, stated rather than derived from
   * the OpenRouter one — the two don't always share a suffix.
   */
  provider?: DirectProvider;
  directModel?: string;
  strength: string;
  /** OpenRouter list price, USD per 1M tokens — for margin auditing */
  price: { in: number; out: number };
  /** credit multiplier */
  weight: number;
  /** lowest plan that unlocks this model. "free" = everyone, no login needed */
  minPlan: Plan;
  /**
   * Free with no daily credit cap.
   *
   * Reserved for the cheapest models we run, because "unlimited" is only
   * honest if it costs little enough to mean it. Pace is still limited (see
   * lib/quota.ts) — that stops a script, not a person, and every service that
   * says unlimited works the same way.
   */
  unlimited?: boolean;
  /** shown as a "New" pill in the UI */
  isNew?: boolean;
  /** price is a guess — the oracle applies SAFETY_FACTOR when live data is
   *  unavailable. Removed by `npm run verify:prices` once confirmed. */
  estimated?: boolean;
}

/* ------------------------------------------------------------------ */
/* BASE — free for guests, free accounts and paid accounts alike       */
/* ------------------------------------------------------------------ */

export const baseModels: ModelConfig[] = [
  {
    id: "chatgpt",
    brand: "ChatGPT",
    version: "GPT-4o Mini",
    name: "ChatGPT",
    openrouter: "openai/gpt-4o-mini-2024-07-18",
    provider: "openai",
    directModel: "gpt-4o-mini-2024-07-18",
    strength: "Fluid, balanced writing",
    price: { in: 0.15, out: 0.6 },
    weight: 4,
    minPlan: "free",
  },
  {
    id: "claude",
    brand: "Claude AI",
    version: "Claude 3 Haiku",
    name: "Claude AI",
    openrouter: "anthropic/claude-3-haiku",
    provider: "anthropic",
    directModel: "claude-3-haiku-20240307",
    strength: "Careful, structured answers",
    price: { in: 0.25, out: 1.25 },
    weight: 7,
    minPlan: "free",
  },
  {
    id: "gemini",
    brand: "Gemini",
    version: "2.5 Flash Lite",
    name: "Gemini",
    openrouter: "google/gemini-2.5-flash-lite",
    provider: "gemini",
    directModel: "gemini-2.5-flash-lite",
    strength: "Fast, up to date",
    price: { in: 0.1, out: 0.4 },
    weight: 3,
    minPlan: "free",
  },
  {
    id: "deepseek",
    brand: "Deepseek",
    version: "V4 Flash",
    name: "Deepseek",
    openrouter: "deepseek/deepseek-v4-flash",
    provider: "deepseek",
    directModel: "deepseek-v4-flash",
    strength: "Reasoning & code",
    price: { in: 0.09, out: 0.18 },
    weight: 2,
    minPlan: "free",
    unlimited: true,
  },
  {
    id: "meta",
    brand: "Meta AI",
    version: "Llama 4 Maverick",
    name: "Meta AI",
    openrouter: "meta-llama/llama-4-maverick",
    strength: "Fast, casual replies",
    price: { in: 0.2, out: 0.8 },
    weight: 5,
    minPlan: "free",
  },
  {
    id: "qwen",
    brand: "Qwen",
    version: "3.5 Flash",
    name: "Qwen",
    openrouter: "qwen/qwen3.5-flash-02-23",
    strength: "Multilingual strength",
    price: { in: 0.065, out: 0.26 },
    weight: 2,
    minPlan: "free",
    unlimited: true,
  },
  {
    id: "perplexity",
    brand: "Perplexity",
    version: "Sonar",
    name: "Perplexity",
    openrouter: "perplexity/sonar",
    strength: "Cited, sourced answers",
    price: { in: 1.0, out: 1.0 },
    weight: 8,
    minPlan: "free",
  },
  {
    id: "grok",
    brand: "Grok",
    version: "Build 0.1",
    name: "Grok",
    openrouter: "x-ai/grok-build-0.1",
    provider: "xai",
    directModel: "grok-build-0.1",
    strength: "Agentic coding workflows",
    price: { in: 1.0, out: 2.0 },
    weight: 13,
    minPlan: "free",
  },
];

/* ------------------------------------------------------------------ */
/* PREMIUM — the newer models the packages unlock                      */
/* ------------------------------------------------------------------ */

export const premiumModels: ModelConfig[] = [
  // ⚠️ Two variants per brand where available: the cheapest new-generation
  //    model AND the flagship new-generation model. ALL paid plans unlock ALL
  //    of these. Run `npm run verify:models` before launch.
  //    Meta has no premium entry (Behemoth was never released for inference).

  /* ---- budget new-generation variants ---- */
  {
    id: "deepseek-pro",
    brand: "Deepseek",
    version: "V4 Pro",
    name: "Deepseek V4 Pro",
    openrouter: "deepseek/deepseek-v4-pro",
    provider: "deepseek",
    directModel: "deepseek-v4-pro",
    strength: "Deep reasoning, newest Deepseek",
    price: { in: 0.435, out: 0.87 },
    weight: 6,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gemini-31-flash-lite",
    brand: "Gemini",
    version: "3.1 Flash Lite",
    name: "Gemini 3.1 Flash Lite",
    openrouter: "google/gemini-3.1-flash-lite",
    provider: "gemini",
    directModel: "gemini-3.1-flash-lite",
    strength: "Newest Gemini, fast and lean",
    price: { in: 0.25, out: 1.5 },
    weight: 8,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gpt-54-nano",
    brand: "ChatGPT",
    version: "GPT-5.4 Nano",
    name: "ChatGPT 5.4 Nano",
    openrouter: "openai/gpt-5.4-nano",
    provider: "openai",
    directModel: "gpt-5.4-nano",
    strength: "Newest GPT, fast and light",
    // 4x GPT-5 nano per OpenAI's published multiplier — verify before launch
    price: { in: 0.2, out: 1.25 },
    weight: 8,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "qwen-35-plus",
    brand: "Qwen",
    version: "3.5 Plus",
    name: "Qwen3.5 Plus",
    openrouter: "qwen/qwen3.5-plus",
    strength: "1M context, always-on reasoning",
    price: { in: 0.26, out: 1.56 },
    weight: 9,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "claude-haiku-45",
    brand: "Claude AI",
    version: "Haiku 4.5",
    name: "Claude Haiku 4.5",
    openrouter: "anthropic/claude-haiku-4.5",
    provider: "anthropic",
    directModel: "claude-haiku-4-5",
    strength: "Current-generation Claude, fast",
    price: { in: 1.0, out: 5.0 },
    weight: 27,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "sonar-reasoning-pro",
    brand: "Perplexity",
    version: "Sonar Reasoning Pro",
    name: "Sonar Reasoning Pro",
    openrouter: "perplexity/sonar-reasoning-pro",
    strength: "Deep cited research, reasoning",
    price: { in: 2.0, out: 8.0 },
    weight: 45,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "grok-45",
    brand: "Grok",
    version: "Grok 4.5",
    name: "Grok 4.5",
    openrouter: "x-ai/grok-4.5",
    provider: "xai",
    directModel: "grok-4.5",
    strength: "Newest Grok, frontier quality",
    price: { in: 2.0, out: 6.0 },
    weight: 35,
    minPlan: "starter",
    isNew: true,
  },

  /* ---- flagship new-generation variants ---- */
  {
    id: "gemini-3-flash",
    brand: "Gemini",
    version: "3 Flash",
    name: "Gemini 3 Flash",
    openrouter: "google/gemini-3-flash",
    provider: "gemini",
    directModel: "gemini-3-flash",
    strength: "Flagship-grade Gemini, long context",
    price: { in: 1.5, out: 1.5 },
    weight: 12,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gpt-54-mini",
    brand: "ChatGPT",
    version: "GPT-5.4 Mini",
    name: "ChatGPT 5.4 Mini",
    openrouter: "openai/gpt-5.4-mini",
    provider: "openai",
    directModel: "gpt-5.4-mini",
    strength: "Stronger GPT 5.4 tier",
    // 4x GPT-5 mini per OpenAI's published multiplier — verify before launch
    price: { in: 0.75, out: 4.5 },
    weight: 29,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "qwen-max",
    brand: "Qwen",
    version: "3.7 Max",
    name: "Qwen3.7 Max",
    openrouter: "qwen/qwen3.7-max",
    strength: "Agentic, long-horizon tasks",
    price: { in: 1.2, out: 6.0 },
    weight: 33,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "sonar-pro",
    brand: "Perplexity",
    version: "Sonar Pro",
    name: "Perplexity Sonar Pro",
    openrouter: "perplexity/sonar-pro",
    strength: "Advanced agentic web search",
    price: { in: 3.0, out: 15.0 },
    weight: 81,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "claude-sonnet-46",
    brand: "Claude AI",
    version: "Sonnet 4.6",
    name: "Claude Sonnet 4.6",
    openrouter: "anthropic/claude-sonnet-4.6",
    provider: "anthropic",
    directModel: "claude-sonnet-4-6",
    strength: "Flagship Claude quality",
    price: { in: 3.0, out: 15.0 },
    weight: 81,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "grok-43",
    brand: "Grok",
    version: "Grok 4.3",
    name: "Grok 4.3",
    openrouter: "x-ai/grok-4.3",
    provider: "xai",
    directModel: "grok-4.3",
    strength: "Grok flagship, real-time events",
    price: { in: 3.0, out: 15.0 },
    weight: 81,
    minPlan: "starter",
    isNew: true,
  },

  /* ---- flagship "best of brand" tiers ---- */
  {
    id: "gpt-54",
    brand: "ChatGPT",
    version: "GPT-5.4",
    name: "ChatGPT 5.4",
    openrouter: "openai/gpt-5.4",
    provider: "openai",
    directModel: "gpt-5.4",
    strength: "OpenAI's strongest model",
    // 4x GPT-5 per OpenAI's published multiplier — verify before launch
    price: { in: 2.5, out: 15.0 },
    weight: 95,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "claude-opus-48",
    brand: "Claude AI",
    version: "Opus 4.8",
    name: "Claude Opus 4.8",
    openrouter: "anthropic/claude-opus-4.8",
    provider: "anthropic",
    directModel: "claude-opus-4-8",
    strength: "Anthropic's strongest model",
    price: { in: 5.0, out: 25.0 },
    weight: 135,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gemini-31-pro",
    brand: "Gemini",
    version: "3.1 Pro",
    name: "Gemini 3.1 Pro",
    openrouter: "google/gemini-3.1-pro",
    provider: "gemini",
    directModel: "gemini-3.1-pro",
    strength: "Google's strongest model",
    // output price estimated from Gemini Pro tier pattern — verify before launch
    price: { in: 2.0, out: 12.0 },
    weight: 64,
    minPlan: "starter",
    estimated: true,
    isNew: true,
  },

  /* ----------------------------------------------------------------
   * Newer flagship models.
   *
   * Every one is marked `estimated`: their prices here are conservative
   * placeholders, not confirmed list prices, so the oracle applies
   * SAFETY_FACTOR and charges double until a live price is seen. That
   * errs toward overcharging, which is refundable, rather than
   * undercharging, which is not.
   *
   * Run `npm run verify:prices` once these appear in OpenRouter's live
   * feed — it rewrites the numbers and drops the `estimated` flag.
   *
   * All are `minPlan: "starter"`: they cost far too much per token to sit
   * in the free tier, where a single long answer would outspend a whole
   * day's allowance.
   * ---------------------------------------------------------------- */
  {
    id: "gpt-56-terra",
    brand: "ChatGPT",
    version: "GPT-5.6 Terra",
    name: "GPT-5.6 Terra",
    openrouter: "openai/gpt-5.6-terra",
    provider: "openai",
    directModel: "gpt-5.6-terra",
    strength: "Broad general reasoning",
    price: { in: 1.0, out: 6.0 },
    weight: 38,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gpt-56-sol",
    brand: "ChatGPT",
    version: "GPT-5.6 Sol",
    name: "GPT-5.6 Sol",
    openrouter: "openai/gpt-5.6-sol",
    provider: "openai",
    directModel: "gpt-5.6-sol",
    strength: "Deeper reasoning, longer tasks",
    price: { in: 5.0, out: 30.0 },
    weight: 189,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gpt-56-luna-pro",
    brand: "ChatGPT",
    version: "GPT-5.6 Luna Pro",
    name: "GPT-5.6 Luna Pro",
    openrouter: "openai/gpt-5.6-luna-pro",
    provider: "openai",
    directModel: "gpt-5.6-luna-pro",
    strength: "Top-end OpenAI reasoning",
    price: { in: 0.2, out: 1.6 },
    weight: 10,
    minPlan: "pro",
    isNew: true,
  },
  {
    id: "gpt-5-mini",
    brand: "ChatGPT",
    version: "GPT-5 Mini",
    name: "GPT-5 Mini",
    openrouter: "openai/gpt-5-mini",
    provider: "openai",
    directModel: "gpt-5-mini",
    strength: "Fast and inexpensive",
    price: { in: 0.25, out: 2.0 },
    weight: 13,
    minPlan: "starter",
  },
  {
    id: "claude-opus-5-fast",
    brand: "Claude AI",
    version: "Opus 5 Fast",
    name: "Claude Opus 5 Fast",
    openrouter: "anthropic/claude-opus-5-fast",
    provider: "anthropic",
    directModel: "claude-opus-5-fast",
    strength: "Opus quality at speed",
    price: { in: 10.0, out: 50.0 },
    weight: 318,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "claude-opus-5",
    brand: "Claude AI",
    version: "Opus 5",
    name: "Claude Opus 5",
    openrouter: "anthropic/claude-opus-5",
    provider: "anthropic",
    directModel: "claude-opus-5",
    strength: "Anthropic's most capable",
    price: { in: 5.0, out: 25.0 },
    weight: 159,
    minPlan: "pro",
    isNew: true,
  },
  {
    id: "claude-fable-5",
    brand: "Claude AI",
    version: "Fable 5",
    name: "Claude Fable 5",
    openrouter: "anthropic/claude-fable-5",
    provider: "anthropic",
    directModel: "claude-fable-5",
    strength: "Long-form writing and narrative",
    price: { in: 10.0, out: 50.0 },
    weight: 318,
    minPlan: "pro",
    isNew: true,
  },
  {
    id: "claude-sonnet-5",
    brand: "Claude AI",
    version: "Sonnet 5",
    name: "Claude Sonnet 5",
    openrouter: "anthropic/claude-sonnet-5",
    provider: "anthropic",
    directModel: "claude-sonnet-5",
    strength: "Balanced everyday Claude",
    price: { in: 2.0, out: 10.0 },
    weight: 64,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gemini-36-flash",
    brand: "Gemini",
    version: "3.6 Flash",
    name: "Gemini 3.6 Flash",
    openrouter: "google/gemini-3.6-flash",
    provider: "gemini",
    directModel: "gemini-3.6-flash",
    strength: "Fast, current Gemini",
    price: { in: 1.5, out: 7.5 },
    weight: 48,
    minPlan: "starter",
    isNew: true,
  },
  {
    id: "gemini-35-flash",
    brand: "Gemini",
    version: "3.5 Flash",
    name: "Gemini 3.5 Flash",
    openrouter: "google/gemini-3.5-flash",
    provider: "gemini",
    directModel: "gemini-3.5-flash",
    strength: "Quick, broadly capable",
    price: { in: 1.5, out: 9.0 },
    weight: 57,
    minPlan: "starter",
  },
  {
    id: "gemini-35-flash-lite",
    brand: "Gemini",
    version: "3.5 Flash Lite",
    name: "Gemini 3.5 Flash Lite",
    openrouter: "google/gemini-3.5-flash-lite",
    provider: "gemini",
    directModel: "gemini-3.5-flash-lite",
    strength: "Cheapest Gemini tier",
    price: { in: 0.3, out: 2.5 },
    weight: 16,
    minPlan: "starter",
  },

];

export const models: ModelConfig[] = [...baseModels, ...premiumModels];

/** Brand order for the picker — matches the original chatbot lineup. */
export const brandOrder = [
  "ChatGPT",
  "Claude AI",
  "Gemini",
  "Deepseek",
  "Meta AI",
  "Qwen",
  "Perplexity",
  "Grok",
] as const;

/** Versions grouped under each brand: free version first, then premium. */
export function modelsByBrand() {
  return brandOrder.map((brand) => ({
    brand,
    versions: models
      .filter((m) => m.brand === brand)
      .sort((a, b) => (a.minPlan === "free" ? -1 : 0) - (b.minPlan === "free" ? -1 : 0)),
  }));
}

export const modelById = (id: string) => models.find((m) => m.id === id);

const planRank: Record<Plan, number> = { free: 0, starter: 1, pro: 2, promax: 3 };

/** `plan` is the user's plan — guests and free accounts are both "free". */
export function canUseModel(model: ModelConfig, plan: Plan) {
  return planRank[plan] >= planRank[model.minPlan];
}

export function modelsForPlan(plan: Plan) {
  return models.filter((m) => canUseModel(m, plan));
}

/** Real USD cost — for margin logging, not billing. */
export function realCost(model: ModelConfig, inTokens: number, outTokens: number) {
  return (inTokens * model.price.in + outTokens * model.price.out) / 1_000_000;
}

/** Credits (weighted tokens) to deduct, using the catalogue weight. */
export function creditsFor(model: ModelConfig, inTokens: number, outTokens: number) {
  return Math.ceil((inTokens + outTokens) * model.weight);
}

/**
 * Weight recomputed from the LIVE OpenRouter price for this exact request.
 *
 * The catalogue weight assumes a 40/60 input/output blend. A real request has
 * a known split, and the live price may differ from what we wrote down — so we
 * price the actual tokens at the actual rate and take whichever weight is
 * higher. That makes a stale or under-estimated catalogue price harmless.
 */
export async function effectiveWeight(
  model: ModelConfig,
  inTokens: number,
  outTokens: number,
  live: Map<string, { promptPerM?: number; completionPerM?: number }>,
): Promise<{ weight: number; usd: number; source: "live" | "catalogue" }> {
  const total = inTokens + outTokens;
  const catalogueUsd =
    (inTokens * model.price.in + outTokens * model.price.out) / 1_000_000;

  const l = live.get(model.openrouter);
  if (l?.promptPerM !== undefined && l?.completionPerM !== undefined && total > 0) {
    const liveUsd = (inTokens * l.promptPerM + outTokens * l.completionPerM) / 1_000_000;
    // CREDIT_RATE is 0.126 USD per 1M credits
    const liveWeight = liveUsd / 0.126 / (total / 1_000_000) / 1_000_000;
    if (liveWeight > model.weight) {
      return { weight: liveWeight, usd: liveUsd, source: "live" };
    }
    return { weight: model.weight, usd: liveUsd, source: "live" };
  }

  // No live price: fall back to the catalogue, and if that price is a guess,
  // charge SAFETY_FACTOR times as many credits so a 2x underestimate is still
  // profitable. Keep this factor in sync with lib/price-oracle.ts.
  const SAFETY_FACTOR = 2;
  const weight = model.estimated ? model.weight * SAFETY_FACTOR : model.weight;
  return { weight, usd: catalogueUsd, source: "catalogue" };
}

/** Models a signed-out visitor can use without a daily credit cap. */
export const unlimitedModels = baseModels.filter((m) => m.unlimited);
