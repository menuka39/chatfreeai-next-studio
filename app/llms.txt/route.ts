import { tools } from "@/lib/data";
import { packages } from "@/lib/packages";
import { listPublishedPosts } from "@/lib/blog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BASE = process.env.SITE_URL ?? "https://chatfreeai.com";

/**
 * /llms.txt — a curated map of the site for AI answer engines.
 *
 * Assistants that cite the web read a page, not a site. Given a question about
 * pricing they land on whichever URL a crawler happened to rank, and answer
 * from that. A single plain-text index of what exists and what each thing is
 * gives them the shape of the site in one fetch, which is the difference
 * between being described accurately and being described from one stray page.
 *
 * Generated rather than written by hand for the same reason the sitemap is: a
 * tool added later would otherwise be missing here forever, and nobody would
 * notice because nothing breaks.
 */
export async function GET() {
  const posts = (await listPublishedPosts()).slice(0, 20);
  const generate = tools.filter((t) => t.category === "Generate");
  const work = tools.filter((t) => t.category === "Work");

  const line = (t: { name: string; slug: string; description: string }) =>
    `- [${t.name}](${BASE}/tools/${t.slug}): ${t.description}`;

  const body = [
    "# Chat Free AI",
    "",
    "> Chat with 24 AI models — ChatGPT, Gemini, Claude, Deepseek, Grok and more — from one page. Eight models are free with no account. Paid packages unlock every premium model plus image, video, music and voice generation from a single pool of monthly credits.",
    "",
    "Chat Free AI is a web app. There is nothing to install. Guests can chat immediately without signing up; an account is only needed for paid models and for saving work.",
    "",
    "## Chat",
    `- [Chat](${BASE}/): the main chat. Switch models mid-conversation, attach PDFs and images, and turn on web search.`,
    "",
    "## Generation tools",
    ...generate.map(line),
    "",
    "## Writing and analysis tools",
    ...work.map(line),
    "",
    "## Pricing",
    `- [Pricing](${BASE}/pricing): packages and what each includes.`,
    ...packages.map(
      (p) =>
        `- ${p.name}: $${p.price.toFixed(2)} a month for ${p.credits.toLocaleString()} credits, shared across chat, images, video, music and voice.`,
    ),
    "- The free tier is a daily allowance, not a trial. It refills every day at midnight UTC.",
    "- Failed generations are refunded automatically.",
    "",
    "## Writing",
    `- [Blog](${BASE}/blog)`,
    ...posts.map((p) => `- [${p.title}](${BASE}/blog/${p.slug}): ${p.excerpt}`),
    "",
    "## Policies",
    `- [Terms](${BASE}/terms)`,
    `- [Privacy policy](${BASE}/privacy-policy)`,
    `- [Refunds](${BASE}/return-policy)`,
    `- [Contact](${BASE}/contact)`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
