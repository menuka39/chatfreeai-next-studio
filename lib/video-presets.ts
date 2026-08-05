/**
 * Prompt building blocks.
 *
 * These are appended to the user's own words rather than replacing them —
 * a preset that overwrites your idea is worse than no preset. They exist
 * because the difference between a weak and a strong video prompt is almost
 * always the camera, the light and the lens, which most people don't think
 * to specify.
 */

export interface PresetGroup {
  id: string;
  label: string;
  hint: string;
  options: { label: string; append: string }[];
}

export const promptPresets: PresetGroup[] = [
  {
    id: "camera",
    label: "Camera",
    hint: "How the shot moves — the single biggest lever on how professional a clip feels.",
    options: [
      { label: "Static", append: "static locked-off shot" },
      { label: "Slow dolly in", append: "slow dolly in toward the subject" },
      { label: "Dolly out", append: "slow dolly out revealing the wider scene" },
      { label: "Tracking", append: "smooth tracking shot following the subject" },
      { label: "Orbit", append: "camera orbits slowly around the subject" },
      { label: "Handheld", append: "handheld camera with subtle natural shake" },
      { label: "Crane up", append: "crane shot rising upward" },
      { label: "Drone", append: "aerial drone shot descending slowly" },
    ],
  },
  {
    id: "shot",
    label: "Framing",
    hint: "How close the camera sits to the subject.",
    options: [
      { label: "Wide", append: "wide establishing shot" },
      { label: "Medium", append: "medium shot" },
      { label: "Close-up", append: "close-up" },
      { label: "Extreme close-up", append: "extreme close-up" },
      { label: "Over shoulder", append: "over-the-shoulder shot" },
    ],
  },
  {
    id: "light",
    label: "Lighting",
    hint: "Time of day and light quality set the whole mood.",
    options: [
      { label: "Golden hour", append: "warm golden hour light, long shadows" },
      { label: "Blue hour", append: "cool blue hour twilight" },
      { label: "Overcast", append: "soft diffused overcast light" },
      { label: "Harsh sun", append: "harsh midday sun, hard shadows" },
      { label: "Neon night", append: "neon-lit night, wet reflective surfaces" },
      { label: "Candlelit", append: "warm candlelight, deep shadows" },
      { label: "Studio", append: "clean studio lighting, soft key light" },
    ],
  },
  {
    id: "look",
    label: "Look",
    hint: "The film or render style.",
    options: [
      { label: "Cinematic", append: "cinematic, shallow depth of field, anamorphic" },
      { label: "Documentary", append: "documentary realism, natural colour" },
      { label: "35mm film", append: "shot on 35mm film, subtle grain" },
      { label: "Vintage", append: "vintage 1970s film look, faded colour" },
      { label: "Animation", append: "stylised 3D animation" },
      { label: "Anime", append: "anime style, hand-drawn look" },
      { label: "Claymation", append: "stop-motion claymation" },
      { label: "Macro", append: "macro photography, extreme detail" },
    ],
  },
  {
    id: "pace",
    label: "Motion",
    hint: "How much movement happens in the clip.",
    options: [
      { label: "Subtle", append: "minimal subtle motion" },
      { label: "Natural", append: "natural everyday motion" },
      { label: "Dynamic", append: "fast dynamic motion" },
      { label: "Slow motion", append: "slow motion" },
      { label: "Time-lapse", append: "time-lapse" },
    ],
  },
];

/** Starter prompts — concrete enough to actually produce something good. */
export const promptIdeas = [
  "A lone fisherman casting a net at dawn, mist over still water, slow dolly in, golden hour light, cinematic",
  "Espresso pouring into a glass cup in slow motion, macro, warm kitchen light, shallow depth of field",
  "Aerial drone shot descending over terraced rice fields in the rain, overcast, documentary realism",
  "A street market at night, neon signs reflecting in puddles, handheld tracking shot through the crowd",
  "A paper boat drifting down a rain gutter, extreme close-up, overcast light, 35mm film grain",
  "Steam rising from a bowl of noodles, static shot, warm low light, shallow focus, cinematic",
];
