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

export const posts: Post[] = [
  {
    slug: "best-free-chatgpt-alternative-2026",
    title: "The best free ChatGPT alternative in 2026, tested",
    excerpt:
      "No account, no card, no cap — we compared the free multi-model chat tools worth your time this year.",
    date: "2026-07-12",
    readMins: 6,
    tag: "Comparisons",
  },
  {
    slug: "chatgpt-vs-gemini-vs-deepseek",
    title: "ChatGPT vs Gemini vs Deepseek: which one for which task",
    excerpt: "A practical breakdown of where each model actually wins — writing, research, and code.",
    date: "2026-06-28",
    readMins: 5,
    tag: "Guides",
  },
  {
    slug: "ai-image-generator-no-signup",
    title: "Generating AI images without signing up — what actually works",
    excerpt: "A short field guide to free image generation, and what \"free\" quietly costs elsewhere.",
    date: "2026-06-14",
    readMins: 4,
    tag: "Guides",
  },
];
