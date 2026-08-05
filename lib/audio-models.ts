/**
 * Text-to-speech catalogue — OpenRouter /api/v1/audio/speech.
 *
 * PRICING: TTS is billed PER CHARACTER of input text, not per second of audio
 * and not per token. Grok Voice TTS 1.0 is $15 per 1M characters (verified
 * Jul 2026). So:
 *
 *   creditsPerChar = costPerChar / 0.126 * 1M  ⇒  costPerMillionChars * 7.94
 *
 * That keeps 1M credits at ~$0.126 of cost, the same rate as chat, image and
 * video — a credit is worth the same everywhere. Charged from the same monthly
 * package; there is no separate audio plan.
 *
 * Worked example, Grok Voice ($15/1M chars):
 *   1,000 characters (~150 words, ~1 min of speech)
 *     our cost  = $0.015
 *     user pays = 119,048 credits
 *   Starter (65M credits) therefore covers ~546,000 characters of speech.
 *
 * ⚠️ Entries marked `estimated` weren't verifiable at build time — the price
 * oracle applies SAFETY_FACTOR to them at runtime, and
 * `npm run verify:prices` will confirm and clear the flag.
 */

export interface AudioModelConfig {
  id: string;
  name: string;
  provider: string;
  openrouter: string;
  /** USD per 1,000,000 characters of input text */
  costPerMillionChars: number;
  /** package credits per character */
  creditsPerChar: number;
  voices: string[];
  languages: string;
  maxChars: number;
  genTime: string;
  tier: "fast" | "standard" | "premium";
  blurb: string;
  estimated?: boolean;
}

export const audioModels: AudioModelConfig[] = [
  {
    id: "kokoro-82m",
    name: "Kokoro 82M",
    provider: "hexgrad",
    openrouter: "hexgrad/kokoro-82m",
    // open-weight, lightweight — cheapest tier
    costPerMillionChars: 2,
    creditsPerChar: 16,
    voices: ["af_heart", "af_bella", "am_michael", "bf_emma", "bm_george"],
    languages: "8 languages · 54 preset voices",
    maxChars: 5000,
    genTime: "~3–8 s",
    tier: "fast",
    blurb: "Lightweight and cheap — good for bulk narration.",
    estimated: true,
  },
  {
    id: "grok-voice-tts",
    name: "Grok Voice TTS 1.0",
    provider: "xAI",
    openrouter: "x-ai/grok-voice-tts-1.0",
    // verified: $15 per 1M characters
    costPerMillionChars: 15,
    creditsPerChar: 120,
    voices: ["Eve", "Ara", "Rex", "Sal", "Leo"],
    languages: "20+ languages, auto-detected",
    maxChars: 15000,
    genTime: "~5–12 s",
    tier: "standard",
    blurb: "Inline tags control pauses, emphasis, pitch and style.",
  },
];

export const audioModelById = (id: string) => audioModels.find((m) => m.id === id);

export const FORMATS = ["mp3", "wav", "opus"] as const;
export type AudioFormat = (typeof FORMATS)[number];

export function audioCredits(model: AudioModelConfig, chars: number) {
  return Math.ceil(chars * model.creditsPerChar);
}
