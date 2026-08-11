export type ToolCategory = "Generate" | "Work";

export interface Tool {
  slug: string;
  name: string;
  category: ToolCategory;
  tagline: string;
  description: string;
}

export const tools: Tool[] = [
  {
    slug: "image-generator",
    name: "Image Generator",
    category: "Generate",
    tagline: "Prompt to artwork in seconds",
    description:
      "GPT Image 1.5, Imagen 4, Seedream 4.5, FLUX.2 Pro and Nano Banana — every top image model, on your monthly plan.",
  },
  {
    slug: "video-generator",
    name: "Video Generator",
    category: "Generate",
    tagline: "Prompts and images become clips",
    description:
      "Veo 3.1, Sora 2 Pro, Kling v3, Seedance and more — every top video model in one place, on your monthly plan.",
  },
  {
    slug: "audio-generator",
    name: "Voice Generator",
    category: "Generate",
    tagline: "Natural voice, in one pass",
    description: "Grok Voice and Kokoro — narration and voiceovers on your plan.",
  },
  {
    slug: "music-generator",
    name: "Music Generator",
    category: "Generate",
    tagline: "Full songs from a prompt",
    description:
      "Lyria 3 for songs and clips with vocals and timed lyrics, plus GPT Audio for speech — on any paid plan.",
  },
  {
    slug: "resume-builder",
    name: "Resume Builder",
    category: "Work",
    tagline: "Recruiter-ready, styled",
    description: "Structured editor, 40 templates, live preview, ATS score, and AI help for every field.",
  },
  {
    slug: "resume-screener",
    name: "Resume Screener",
    category: "Work",
    tagline: "Screen applicants faster",
    description: "Score candidates against your job description with the evidence and gaps spelled out.",
  },
  {
    slug: "document-forge",
    name: "AI Document Forge",
    category: "Work",
    tagline: "Draft structured documents",
    description: "Reports, proposals, letters, policies and SOPs — a finished draft from a short brief.",
  },
  {
    slug: "product-recommender",
    name: "Product Recommender",
    category: "Work",
    tagline: "Describe it, get matches",
    description: "Describe the need and the constraints, get ranked options with the tradeoffs explained.",
  },
  {
    slug: "knowledge-bot",
    name: "Document Q&A",
    category: "Work",
    tagline: "Ask your own documents",
    description: "Paste a document and ask questions about it — answers come only from your text, never guessed.",
  },
  /* ---- Prompt Studio ------------------------------------------------
     Eight tools that write prompts rather than answers. They share the
     streaming text-tool pipeline, so they bill from the same monthly
     credits as everything else. ------------------------------------- */
  {
    slug: "prompt-generator",
    name: "AI Prompt Generator",
    category: "Work",
    tagline: "Turn a rough idea into a usable prompt",
    description:
      "Type an idea in plain language and get a structured prompt with a defined role, task, constraints and output format.",
  },
  {
    slug: "prompt-checker",
    name: "Prompt Checker",
    category: "Work",
    tagline: "Score and rewrite a prompt you already have",
    description:
      "A score out of ten, what works, what is holding it back, and a stronger rewrite you can use straight away.",
  },
  {
    slug: "image-prompt-generator",
    name: "Image Prompt Generator",
    category: "Work",
    tagline: "Midjourney, DALL-E, Stable Diffusion, Flux",
    description:
      "One detailed image prompt covering subject, setting, composition, lighting, palette and mood — with Midjourney flags when you need them.",
  },
  {
    slug: "video-prompt-generator",
    name: "Video Prompt Generator",
    category: "Work",
    tagline: "Text-to-video prompts for Veo and friends",
    description:
      "Scene, subject and action, camera movement and shot type, lighting, colour grade and pacing — sized to the duration you pick.",
  },
  {
    slug: "song-prompt-generator",
    name: "Song Prompt Generator",
    category: "Work",
    tagline: "Style tags and structure for Suno and Udio",
    description:
      "A style-tag line with genre, mood, vocal and instrumentation, a song-structure outline, and a one-line lyrical theme.",
  },
  {
    slug: "story-prompt-generator",
    name: "Story Prompt Generator",
    category: "Work",
    tagline: "Openings that leave room to write",
    description:
      "An evocative writing prompt that sets up a scene or situation and stops there, so the story is still yours to write.",
  },
  {
    slug: "character-prompt-generator",
    name: "Character Prompt Generator",
    category: "Work",
    tagline: "Personas for stories, games and chatbots",
    description:
      "A character profile with a name, core traits, speech style, a background hook and what drives them.",
  },
  {
    slug: "video-to-prompt",
    name: "Video to Prompt",
    category: "Generate",
    tagline: "Reverse-engineer a prompt from a clip",
    description:
      "Upload a video and get the text-to-video prompt that would recreate it — scene, camera movement, lighting, colour grade and pacing.",
  },
  {
    slug: "logo-prompt-generator",
    name: "Logo Prompt Generator",
    category: "Work",
    tagline: "Brand marks for Midjourney and Ideogram",
    description:
      "Composition, line quality and negative-space direction, finished with the modifiers that keep a mark clean and scalable.",
  },
];

export interface Post {
  slug: string;
  title: string;
  excerpt: string;
  date: string;
  readMins: number;
  tag: string;
}

/**
 * The blog index.
 *
 * These are the listing entries; the body of each post lives in the
 * `blog_posts` table and is written through /admin/blog. This array is what
 * the sitemap and the /blog page fall back to when the database is
 * unreachable, so the slugs here and the slugs there have to match.
 *
 * The three topics are not chosen by taste. Each one answers a query cluster
 * Search Console already shows the site ranking for on page 2-3 with almost no
 * clicks — ranking that exists with no page behind it. Chasing a keyword the
 * site has never ranked for would take a year; answering one it half-ranks for
 * already is a much shorter road.
 */
export const posts: Post[] = [
  {
    // "chatgpt free unlimited" and its variants: ~17,000 impressions at
    // position 11-18, the largest winnable cluster in the whole report
    slug: "unlimited-free-ai-chat",
    title: 'Unlimited free AI chat: what "unlimited" actually means in 2026',
    excerpt:
      "The word appears on almost every free AI chat page and means something different on each one. How to read the claim, the four limits hiding behind it, and which services are genuinely uncapped.",
    date: "2026-08-09",
    readMins: 8,
    tag: "Guides",
  },
  {
    // "chat gpt free online", "free chat gpt no login", "chat gpt login free":
    // ~900 US impressions at position 18-33, nearly all with zero clicks
    slug: "chatgpt-free-online-no-account",
    title: "ChatGPT free online: how to use it without an account",
    excerpt:
      "You can use ChatGPT-class models in a browser tab with no sign-up and no card. What free actually gets you, where the limits sit, and how the no-account routes compare.",
    date: "2026-08-08",
    readMins: 7,
    tag: "Guides",
  },
  {
    // "ai chat free", "free ai chat", "chat ai free": high volume, position
    // 47-67 — indexed and effectively invisible. This query wants a comparison.
    slug: "best-free-ai-chat-2026",
    title: "The best free AI chat tools in 2026, compared",
    excerpt:
      "Eight free AI chat services: what each is actually good at, where its free tier stops, and which to pick for coding, writing, research or long conversations.",
    date: "2026-08-07",
    readMins: 9,
    tag: "Comparisons",
  },
];
