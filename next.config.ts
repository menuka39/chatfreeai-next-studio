import type { NextConfig } from "next";

/**
 * Redirects for the URLs the old WordPress site left in Google's index.
 *
 * These are 301s to the CLOSEST live page, not to the homepage. That
 * distinction is the whole point: Google treats a redirect to an unrelated
 * page — the homepage above all — as a "soft 404". The URL gets dropped from
 * the index anyway, none of its ranking value carries over, and Search Console
 * starts reporting problems that hide the real ones. A category archive
 * belongs on /blog; a chat page belongs on the chat.
 *
 * Anything not matched here keeps returning a real 404, which is the correct
 * answer for a URL that never existed and is what keeps Search Console's error
 * report meaningful.
 */
const wordpressLeftovers = [
  /* ---- the 26 URLs Google actually has indexed ----------------------------
     Taken from Search Console's coverage export rather than guessed, and each
     one points at the page that genuinely replaced it. That is what carries
     the ranking value across; a redirect to something less relevant is read
     as a soft 404 and the URL is dropped from the index anyway. ---------- */

  // prompt tools — one-to-one replacements
  { source: "/prompt-generator", destination: "/tools/prompt-generator", permanent: true },
  { source: "/prompt-checking-page", destination: "/tools/prompt-checker", permanent: true },
  { source: "/image-prompts-generator", destination: "/tools/image-prompt-generator", permanent: true },
  { source: "/text-to-video-prompts", destination: "/tools/video-prompt-generator", permanent: true },
  { source: "/song-prompts", destination: "/tools/song-prompt-generator", permanent: true },
  { source: "/story-prompts", destination: "/tools/story-prompt-generator", permanent: true },
  { source: "/character-prompts-generator", destination: "/tools/character-prompt-generator", permanent: true },
  { source: "/logo-prompts-generator", destination: "/tools/logo-prompt-generator", permanent: true },

  // generators and other tools
  { source: "/image-genarator-unlimited", destination: "/tools/image-generator", permanent: true },
  { source: "/ai-audio-generator-unlimited", destination: "/tools/audio-generator", permanent: true },
  { source: "/ai-resume-builder-unlimited", destination: "/tools/resume-builder", permanent: true },
  { source: "/ai-resume-screener", destination: "/tools/resume-screener", permanent: true },
  { source: "/ai-product-recommender", destination: "/tools/product-recommender", permanent: true },
  { source: "/ai-tool-submissions", destination: "/tools/submit", permanent: true },
  { source: "/ai-tool-free", destination: "/tools", permanent: true },

  // A PDF summariser is what the knowledge bot does — answering questions from
  // a document — so that is the honest replacement rather than the tool index.
  { source: "/pdf-summarizer", destination: "/tools/knowledge-bot", permanent: true },

  // No dedicated page replaced these two: the chat is what does the work now,
  // and it does it better than the old single-purpose pages did.
  { source: "/code-explainer-unlimited-chat-free-ai", destination: "/", permanent: true },
  { source: "/instagram-caption", destination: "/", permanent: true },

  // account and policy pages
  { source: "/register", destination: "/login", permanent: true },
  { source: "/terms-and-conditions", destination: "/terms", permanent: true },
  { source: "/contact-us", destination: "/contact", permanent: true },

  /* ---- the rest of the earning pages, from the 16-month performance export
     ------------------------------------------------------------------------
     The coverage export listed 26 "valid" URLs; this is the wider set that
     still pulls impressions. Together they were carrying 227,000 impressions
     at positions 6-10 — page one — straight into a 404. Ranking that took a
     year to build disappears the day it stops resolving, and it does not come
     back on its own. ------------------------------------------------------ */

  // model landing pages: every one of these models is in the chat itself now
  { source: "/online-chat-ai", destination: "/", permanent: true },
  { source: "/deepseek-ai-unlimited-free", destination: "/", permanent: true },
  { source: "/qwen-ai-unlimited-free", destination: "/", permanent: true },
  { source: "/gemini-ai-unlimited-free", destination: "/", permanent: true },
  { source: "/xai-unlimited-free", destination: "/", permanent: true },
  { source: "/character-ai-unlimited-free", destination: "/", permanent: true },
  { source: "/chat-gpt-tool-free", destination: "/", permanent: true },
  { source: "/chat-gpt-without-restrictions", destination: "/", permanent: true },
  { source: "/ai-video-generator-unlimited", destination: "/tools/video-generator", permanent: true },

  // writing and text tools -> the chat, which is what replaced them
  { source: "/ai-rewriter-free", destination: "/", permanent: true },
  { source: "/article-ai-writer", destination: "/", permanent: true },
  { source: "/article-rewrite-ai-tool", destination: "/", permanent: true },
  { source: "/ai-online-editor-text", destination: "/", permanent: true },
  { source: "/ai-online-editor-text-2", destination: "/", permanent: true },
  { source: "/text-editor", destination: "/", permanent: true },
  { source: "/essay-writing-ai-tool", destination: "/", permanent: true },
  { source: "/writing-ai-tool", destination: "/", permanent: true },
  { source: "/paraphrasing-tool-online-free", destination: "/", permanent: true },
  { source: "/grammar-ai-checker-tool", destination: "/", permanent: true },
  { source: "/grammar-ai-checker-tool-2", destination: "/", permanent: true },
  { source: "/grammar-correction", destination: "/", permanent: true },
  { source: "/ai-quotes-generator", destination: "/", permanent: true },
  { source: "/random-quote-generator", destination: "/", permanent: true },
  { source: "/counter-of-words", destination: "/", permanent: true },
  { source: "/title-generator", destination: "/", permanent: true },
  { source: "/blog-post-title-generator", destination: "/", permanent: true },
  { source: "/instagram-ai-generator", destination: "/", permanent: true },
  { source: "/facebook-post-caption", destination: "/", permanent: true },
  { source: "/meta-description", destination: "/", permanent: true },
  { source: "/seo-keyword-research-generator", destination: "/", permanent: true },
  { source: "/ai-local-seo-booster-tool", destination: "/", permanent: true },
  { source: "/marketing-email-tool", destination: "/", permanent: true },

  // one-to-one replacements
  { source: "/text-to-speech-free", destination: "/tools/audio-generator", permanent: true },
  { source: "/text-to-speech", destination: "/tools/audio-generator", permanent: true },
  { source: "/ai-generator-prompt", destination: "/tools/prompt-generator", permanent: true },
  { source: "/ai-faceless-video-script-prompt-generator", destination: "/tools/video-prompt-generator", permanent: true },
  { source: "/ai-summarizer-pdf", destination: "/tools/knowledge-bot", permanent: true },
  { source: "/advanced-pdf-summarizer-tool", destination: "/tools/knowledge-bot", permanent: true },
  { source: "/question-answer-ai", destination: "/tools/knowledge-bot", permanent: true },
  { source: "/ai-legal-contract-simplifier-tool", destination: "/tools/document-forge", permanent: true },

  // tool directories
  { source: "/ai-tools", destination: "/tools", permanent: true },
  { source: "/free-online-tools", destination: "/tools", permanent: true },
  { source: "/services", destination: "/tools", permanent: true },
  { source: "/resources", destination: "/tools", permanent: true },

  /*
   * No equivalent exists for these. They still go to the tool index rather
   * than 404 because a file converter and a BMI calculator are at least the
   * same kind of thing as what is there — a page of small free utilities.
   */
  { source: "/online-pdf-merge", destination: "/tools", permanent: true },
  { source: "/image-to-text-converter", destination: "/tools", permanent: true },
  { source: "/jpg-to-png-converter-tool", destination: "/tools", permanent: true },
  { source: "/free-online-comma-separator-tool", destination: "/tools", permanent: true },
  { source: "/weight-calculator-bmi", destination: "/tools", permanent: true },

  // site furniture
  { source: "/about-us", destination: "/", permanent: true },
  { source: "/faq", destination: "/", permanent: true },
  { source: "/sample-page", destination: "/", permanent: true },
  { source: "/login-page", destination: "/login", permanent: true },
  { source: "/classification", destination: "/", permanent: true },
  { source: "/career-development", destination: "/", permanent: true },
  { source: "/active-recall", destination: "/", permanent: true },

  /* ---- shapes an old WordPress install leaves behind ------------------- */
  { source: "/category/:slug*", destination: "/blog", permanent: true },
  { source: "/tag/:slug*", destination: "/blog", permanent: true },
  { source: "/author/:slug*", destination: "/blog", permanent: true },
  { source: "/archives/:slug*", destination: "/blog", permanent: true },
  // dated permalinks: /2025/04/some-post -> /blog/some-post
  { source: "/:year(\\d{4})/:month(\\d{2})/:slug", destination: "/blog/:slug", permanent: true },
  { source: "/:year(\\d{4})/:month(\\d{2})/:day(\\d{2})/:slug", destination: "/blog/:slug", permanent: true },
  { source: "/:year(\\d{4})/:month(\\d{2})", destination: "/blog", permanent: true },
  { source: "/:year(\\d{4})", destination: "/blog", permanent: true },
  { source: "/feed", destination: "/blog", permanent: true },
  { source: "/:path*/feed", destination: "/blog", permanent: true },
  { source: "/comments/feed", destination: "/blog", permanent: true },

  /*
   * /wp-login.php and /wp-admin are deliberately NOT redirected.
   *
   * They are not in the indexed set, and the traffic they get is bots probing
   * for a WordPress install to break into. Answering with a redirect confirms
   * the host is alive and worth retrying; a plain 404 says there is nothing
   * here, which is both true and the quieter answer.
   */

  // common alternates
  { source: "/chat", destination: "/", permanent: true },
  { source: "/chat/:path*", destination: "/", permanent: true },
  { source: "/tool/:slug", destination: "/tools/:slug", permanent: true },
  { source: "/tools/:slug/amp", destination: "/tools/:slug", permanent: true },
  { source: "/blog/:slug/amp", destination: "/blog/:slug", permanent: true },
  { source: "/plans", destination: "/pricing", permanent: true },
  { source: "/plan", destination: "/pricing", permanent: true },
  { source: "/price", destination: "/pricing", permanent: true },
  { source: "/privacy", destination: "/privacy-policy", permanent: true },
  { source: "/refund", destination: "/return-policy", permanent: true },
  { source: "/refund-policy", destination: "/return-policy", permanent: true },
  { source: "/about", destination: "/", permanent: true },
  { source: "/home", destination: "/", permanent: true },
  { source: "/index.php", destination: "/", permanent: true },
];

const nextConfig: NextConfig = {
  async redirects() {
    return wordpressLeftovers;
  },
};

export default nextConfig;
