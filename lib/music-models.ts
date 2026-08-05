/**
 * Music and conversational-audio models.
 *
 * These are a different family from lib/audio-models.ts and must not be
 * merged with it. The TTS models there are called through
 * `/api/v1/audio/speech` with `input` + `voice`; everything here is called
 * through `/api/v1/chat/completions` with an audio output modality. That
 * distinction is not cosmetic — it is why `openai/gpt-audio` returned a
 * 166-byte error when it was briefly listed as a TTS model: the id is real,
 * it simply does not serve the speech endpoint.
 *
 * Billing also differs. TTS is priced per character; these are priced per
 * generated piece — a flat rate per song or per clip — so the cost is known
 * before the request rather than derived from input length.
 *
 * Prices below are OpenRouter's published list prices. The two marked
 * `estimated` are not published per-generation and are a deliberately
 * conservative guess; the price oracle still settles the real cost after
 * each call, so an over-estimate is refunded rather than pocketed.
 */

export interface MusicModelConfig {
  id: string;
  name: string;
  provider: string;
  openrouter: string;
  /** USD for one generation — these bill per piece, not per token */
  costPerGeneration: number;
  /** package credits charged up front for one generation */
  creditsPerGeneration: number;
  /** what the model is actually for */
  kind: "music" | "speech";
  /** roughly how long the output runs */
  length: string;
  formats: string[];
  /** true when the model writes and sings lyrics, not just instrumentals */
  vocals: boolean;
  genTime: string;
  tier: "fast" | "standard" | "premium";
  blurb: string;
  /** price is inferred rather than published — see the note above */
  estimated?: boolean;
}

export const musicModels: MusicModelConfig[] = [
  {
    id: "lyria-3-clip",
    name: "Lyria 3 Clip",
    provider: "Google",
    openrouter: "google/lyria-3-clip-preview",
    costPerGeneration: 0.04,
    creditsPerGeneration: 317_461,
    kind: "music",
    length: "~30 seconds",
    formats: ["mp3"],
    vocals: true,
    genTime: "~20–40 s",
    tier: "fast",
    blurb: "Short clips, loops and previews. 48kHz stereo.",
  },
  {
    id: "lyria-3-pro",
    name: "Lyria 3 Pro",
    provider: "Google",
    openrouter: "google/lyria-3-pro-preview",
    costPerGeneration: 0.08,
    creditsPerGeneration: 634_921,
    kind: "music",
    length: "full song",
    formats: ["mp3", "wav"],
    vocals: true,
    genTime: "~60–120 s",
    tier: "premium",
    blurb: "Full-length songs with verses, choruses and bridges. 48kHz stereo.",
  },
  {
    id: "gpt-audio-mini",
    name: "GPT Audio Mini",
    provider: "OpenAI",
    openrouter: "openai/gpt-audio-mini",
    costPerGeneration: 0.02,
    creditsPerGeneration: 158_731,
    kind: "speech",
    length: "conversational reply",
    formats: ["mp3"],
    vocals: false,
    genTime: "~5–15 s",
    tier: "fast",
    blurb: "Spoken answers with natural delivery — cheaper, quicker.",
    estimated: true,
  },
  {
    id: "gpt-audio",
    name: "GPT Audio",
    provider: "OpenAI",
    openrouter: "openai/gpt-audio",
    costPerGeneration: 0.06,
    creditsPerGeneration: 476_191,
    kind: "speech",
    length: "conversational reply",
    formats: ["mp3"],
    vocals: false,
    genTime: "~10–25 s",
    tier: "standard",
    blurb: "Spoken answers with richer expression and better reasoning.",
    estimated: true,
  },
];

export const musicModelById = (id: string) => musicModels.find((m) => m.id === id);
