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
