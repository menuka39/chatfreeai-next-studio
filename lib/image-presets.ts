/**
 * Prompt building blocks for images.
 *
 * Appended to the user's own words, never replacing them — a preset that
 * overwrites your idea is worse than no preset. These exist because the gap
 * between a weak and a strong image prompt is usually subject detail, lighting
 * and lens, which most people don't think to specify.
 */

export interface ImagePresetGroup {
  id: string;
  label: string;
  hint: string;
  options: { label: string; append: string }[];
}

export const imagePresets: ImagePresetGroup[] = [
  {
    id: "style",
    label: "Style",
    hint: "The overall rendering approach.",
    options: [
      { label: "Photorealistic", append: "photorealistic, highly detailed" },
      { label: "Cinematic", append: "cinematic still, dramatic composition" },
      { label: "Illustration", append: "digital illustration, clean linework" },
      { label: "Watercolour", append: "watercolour painting, soft edges" },
      { label: "Oil painting", append: "oil painting, visible brushwork" },
      { label: "3D render", append: "3D render, octane, soft global illumination" },
      { label: "Anime", append: "anime style, cel shaded" },
      { label: "Flat vector", append: "flat vector illustration, bold shapes" },
      { label: "Pixel art", append: "pixel art, limited palette" },
      { label: "Line art", append: "black and white line art, minimal" },
    ],
  },
  {
    id: "light",
    label: "Lighting",
    hint: "Light does more for an image than almost anything else.",
    options: [
      { label: "Golden hour", append: "warm golden hour light, long shadows" },
      { label: "Soft daylight", append: "soft diffused daylight" },
      { label: "Studio", append: "studio lighting, soft key and rim light" },
      { label: "Dramatic", append: "dramatic chiaroscuro lighting, deep shadows" },
      { label: "Neon", append: "neon lighting, colourful reflections" },
      { label: "Backlit", append: "backlit, glowing rim light" },
      { label: "Overcast", append: "flat overcast light" },
    ],
  },
  {
    id: "camera",
    label: "Camera",
    hint: "Lens and framing choices.",
    options: [
      { label: "Close-up", append: "close-up shot" },
      { label: "Wide", append: "wide angle shot" },
      { label: "Macro", append: "macro photography, extreme detail" },
      { label: "Portrait 85mm", append: "85mm portrait lens, shallow depth of field" },
      { label: "Top-down", append: "top-down flat lay" },
      { label: "Low angle", append: "low angle shot" },
      { label: "Bokeh", append: "creamy bokeh background" },
    ],
  },
  {
    id: "mood",
    label: "Mood",
    hint: "The feeling the image should carry.",
    options: [
      { label: "Calm", append: "calm, serene atmosphere" },
      { label: "Moody", append: "moody, atmospheric" },
      { label: "Vibrant", append: "vibrant saturated colours" },
      { label: "Muted", append: "muted desaturated palette" },
      { label: "Minimal", append: "minimalist, lots of negative space" },
      { label: "Cosy", append: "warm cosy atmosphere" },
    ],
  },
  {
    id: "use",
    label: "Made for",
    hint: "Shapes the composition for where it will be used.",
    options: [
      { label: "Logo", append: "simple logo mark, centred, plain background" },
      { label: "Sticker", append: "die-cut sticker with a clean outline" },
      { label: "Icon", append: "simple icon, flat, single subject" },
      { label: "Product shot", append: "product photograph on a clean background" },
      { label: "Thumbnail", append: "bold high-contrast composition for a small thumbnail" },
      { label: "Wallpaper", append: "wallpaper composition, subject off-centre" },
      { label: "Book cover", append: "book cover composition with space for a title" },
    ],
  },
];

export const imageIdeas = [
  "A ceramic mug of tea on a windowsill, morning light, shallow depth of field, photorealistic",
  "A minimalist mountain logo mark, single line, black on white, centred",
  "A red tuk-tuk on a rainy Colombo street at night, neon reflections, cinematic",
  "Flat lay of fresh vegetables on a wooden table, top-down, soft daylight",
  "A cat astronaut floating above Earth, 3D render, soft rim light",
  "Watercolour illustration of a fishing boat at dawn, muted palette",
];
