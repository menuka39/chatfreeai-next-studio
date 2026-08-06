import Link from "next/link";
import type { Metadata } from "next";
import Chat from "@/components/Chat";
import SignalConverge from "@/components/SignalConverge";
import { tools, posts } from "@/lib/data";
import { baseModels, premiumModels } from "@/lib/models";

const SITE_URL = process.env.SITE_URL ?? "https://chatfreeai.com";

/**
 * Homepage-specific metadata.
 *
 * The page previously had none of its own and silently inherited the root
 * layout's generic title/description — which named the product but matched
 * none of the phrasings real searchers use. Search Console data (973 tracked
 * queries, 3 months) shows exactly what to fix: Google already shows this
 * page for "chatgpt free" (1,141 impressions), "free chatgpt" (402), "chat
 * gpt free" (349), "ai chat free" (215) and near-identical variants — real
 * demand, correctly recognised as relevant — but ranks it position 20-70 for
 * nearly all of them (page 3+, functionally invisible; site-wide CTR was
 * 1.73% against a 35.5 average position). The one query that ranks #1 is the
 * brand name itself, which is exact-title-match — the strongest evidence the
 * title tag is the lever to pull first.
 *
 * Title covers the two dominant phrasings ("chatgpt free" AND "chat gpt
 * free" — Google apparently treats the space as a distinct token, since the
 * two ranked 12 positions apart) plus the true differentiator (multiple
 * models, no sign-up) rather than restating the brand alone.
 */
export const metadata: Metadata = {
  // absolute: this one already carries the brand, and the root template
  // would otherwise append it a second time
  title: { absolute: "Chat GPT Free, Gemini & Claude — No Sign-Up | Chat Free AI" },
  description:
    "Chat free with ChatGPT, Gemini, Claude, Grok and more — no sign-up, no login, no daily cap. Compare answers side by side, free forever.",
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: "Chat GPT Free, Gemini & Claude — No Sign-Up",
    description:
      "Chat free with ChatGPT, Gemini, Claude, Grok and more — no sign-up, no daily cap. Free forever, premium tools priced clearly.",
    url: SITE_URL,
    siteName: "Chat Free AI",
    type: "website",
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Chat Free AI — every model, one free chat" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Chat GPT Free, Gemini & Claude — No Sign-Up",
    description: "Chat free with ChatGPT, Gemini, Claude, Grok and more — no sign-up, no daily cap.",
    images: ["/opengraph-image"],
  },
};

const stats = [
  { value: "24", label: "AI models — 8 free for all" },
  { value: "120k+", label: "Chats every month" },
  { value: "0", label: "Sign-ups required" },
  { value: "4.8/5", label: "Average user rating" },
];

const trustPoints = [
  {
    title: "Free chat, forever",
    body: "The multi-model chat is free with no daily cap. No trial countdowns, no bait-and-switch.",
  },
  {
    title: "Clear, upfront pricing",
    body: "Premium tools show the exact price before you run anything. Pay per use — no subscriptions forced on you.",
  },
  {
    title: "Secure payments",
    body: "Card and PayPal payments are processed by Stripe and PayPal. We never see or store your card details.",
  },
  {
    title: "Private by default",
    body: "Chat without an account. We don't sell your data, and you can use every tool anonymously.",
  },
];


const faqs = [
  {
    q: "Is the chat really free, with no login?",
    a: "Yes. Open the page and start chatting — no account, no card, no daily cap. Only selected premium tools are paid, and their price is shown before you run them.",
  },
  {
    q: "Which AI models can I use?",
    a: "All 8 core models — ChatGPT, Claude, Gemini, Deepseek, Meta AI, Qwen, Perplexity and Grok — are free for everyone. Every paid plan also unlocks all 16 premium versions, from budget picks like ChatGPT 5.4 Nano up to flagships like GPT-5.4, Claude Opus 4.8 and Gemini 3.1 Pro.",
  },
  {
    q: "How do paid tools work?",
    a: "Premium tools use simple pay-per-use credits. You see the exact cost upfront, pay by card or PayPal, and unused credits never expire.",
  },
  {
    q: "Is my payment information safe?",
    a: "Payments are handled entirely by Stripe and PayPal over encrypted connections. Your card details never touch our servers.",
  },
  {
    q: "Can I get a refund?",
    a: "If a paid generation fails or clearly doesn't work as described, contact us and we'll re-run it or refund the credits. See our Return Policy for details.",
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="hero-glow relative overflow-hidden border-b border-line px-6 pb-16 pt-16 sm:pt-20">
        <SignalConverge />

        <div className="relative z-10 mx-auto max-w-6xl">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-medium text-ink-mute">
              <span className="h-1.5 w-1.5 rounded-full bg-mint" />
              Free chat · No account · No daily limits
            </p>
            <h1 className="mt-5 font-display text-[40px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[52px]">
              Chat free with ChatGPT, Gemini &amp; Claude
              <br />
              <span className="text-brand">— all in one line.</span>
            </h1>
            <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed text-ink-mute">
              ChatGPT, Gemini, Deepseek, Claude and more — one free AI chat, no sign-up, no
              daily limits. Compare answers side by side and see what actually works.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-3">
              <a
                href="#chat"
                className="rounded-lg bg-brand px-6 py-3 text-[15px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep"
              >
                Start chatting free
              </a>
              <Link
                href="/tools"
                className="rounded-lg border border-line bg-surface px-6 py-3 text-[15px] font-semibold text-ink transition-colors hover:border-ink-faint"
              >
                Explore AI tools
              </Link>
            </div>
          </div>

          <div id="chat" className="mt-14 scroll-mt-24">
            <Chat />
          </div>

          {/* Stats bar */}
          <div className="mt-12 grid grid-cols-2 gap-6 border-t border-line pt-8 sm:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="text-center">
                <p className="font-display text-3xl font-semibold text-ink">{s.value}</p>
                <p className="mt-1 text-sm text-ink-mute">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Model strip */}
      <section className="border-b border-line bg-surface px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3">
          <p className="text-[13px] font-medium uppercase tracking-wide text-ink-faint">Models on board</p>
          {baseModels.map((m) => (
            <span key={m.id} className="font-display text-[15px] font-medium text-ink-mute">
              {m.name}
            </span>
          ))}
          <span className="text-[13px] text-ink-faint">
            + {premiumModels.length} new premium models on paid plans
          </span>
        </div>
      </section>

      {/* Trust / why pay us */}
      <section className="border-b border-line px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-wide text-brand">Built on trust</p>
            <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Free where it can be. Honest where it can&apos;t.
            </h2>
            <p className="mt-4 text-ink-mute">
              Chat stays free. Heavy tools — video, bulk generation, enterprise search — cost real
              compute, so we charge for those transparently instead of hiding limits behind a
              &quot;free&quot; label.
            </p>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {trustPoints.map((t) => (
              <div key={t.title} className="card-shadow rounded-xl border border-line bg-surface p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-tint text-brand">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </span>
                <h3 className="mt-4 font-display text-[17px] font-semibold">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-mute">{t.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Tools */}
      <section className="border-b border-line bg-surface px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wide text-brand">More than chat</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                A full suite of AI tools
              </h2>
            </div>
            <Link href="/tools" className="text-sm font-semibold text-brand hover:text-brand-deep">
              View all tools →
            </Link>
          </div>

          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {tools.slice(0, 4).map((tool) => (
              <Link
                key={tool.slug}
                href={`/tools/${tool.slug}`}
                className="card-shadow group rounded-xl border border-line bg-surface p-6 transition-colors hover:border-brand"
              >
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{tool.category}</p>
                <h3 className="mt-3 font-display text-[17px] font-semibold">{tool.name}</h3>
                <p className="mt-2 text-sm text-ink-mute">{tool.tagline}</p>
                <span className="mt-4 inline-block text-sm font-semibold text-brand opacity-0 transition-opacity group-hover:opacity-100">
                  Try it →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Blog teaser */}
      <section className="border-b border-line bg-surface px-6 py-16">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-wide text-brand">From the blog</p>
              <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                Guides &amp; comparisons
              </h2>
            </div>
            <Link href="/blog" className="text-sm font-semibold text-brand hover:text-brand-deep">
              All posts →
            </Link>
          </div>

          <div className="mt-10 grid gap-8 sm:grid-cols-3">
            {posts.map((p) => (
              <Link key={p.slug} href={`/blog/${p.slug}`} className="group border-t-2 border-line pt-5 transition-colors hover:border-brand">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                  {p.tag} · {p.readMins} min
                </p>
                <h3 className="mt-3 font-display text-lg font-semibold leading-snug group-hover:text-brand-deep">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-ink-mute">{p.excerpt}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">FAQ</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Questions, answered honestly
          </h2>
          <div className="mt-8 divide-y divide-line">
            {faqs.map((f) => (
              <details key={f.q} className="group py-5">
                <summary className="cursor-pointer list-none font-display text-[17px] font-semibold marker:content-none">
                  <span className="flex items-center justify-between gap-4">
                    {f.q}
                    <span className="text-ink-faint transition-transform group-open:rotate-45">+</span>
                  </span>
                </summary>
                <p className="mt-3 text-[15px] leading-relaxed text-ink-mute">{f.a}</p>
              </details>
            ))}
          </div>

          <div className="card-shadow mt-12 rounded-2xl border border-brand/40 bg-brand-tint p-8 text-center sm:p-10">
            <h3 className="font-display text-2xl font-semibold sm:text-3xl">Start free. Upgrade only if you need to.</h3>
            <p className="mx-auto mt-3 max-w-md text-ink-mute">
              No contracts, no card required for chat. Premium tools priced clearly, per use.
            </p>
            <a
              href="#chat"
              className="mt-6 inline-block rounded-lg bg-brand px-6 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-brand-deep"
            >
              Start chatting free
            </a>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------------------
       * Structured data (JSON-LD)
       *
       * WebSite + Organization: entity/brand signals, WebSite additionally
       * carries a SearchAction in case Google ever offers a sitelinks
       * searchbox for this domain.
       *
       * SoftwareApplication: a LIVE Google rich-result type as of 2026 (shows
       * price/rating in the SERP) — unlike FAQ below, this one still earns
       * visible SERP real estate. Deliberately NO aggregateRating: Google
       * treats a rating that doesn't match genuinely visible, verifiable
       * review data as spam structured data, and nothing on this site
       * currently collects real reviews. Add ratingValue/ratingCount only
       * once there's a real review source to point at — never before.
       *
       * FAQPage: Google retired the FAQ rich-result SERP feature on 7 May
       * 2026 (confirmed via Google Search Central's own deprecation notice —
       * this was a live, current check, not stale knowledge). The type is
       * still valid schema.org and still parsed to understand the page, and
       * AI answer engines (ChatGPT, Perplexity, and RAG crawlers generally)
       * still read FAQPage markup — so it's kept for that value, with no
       * expectation of a Google SERP rich snippet. The questions/answers
       * here are the exact `faqs` array rendered visibly below — schema must
       * describe real on-page content, never text that only exists in the
       * markup.
       * ------------------------------------------------------------------ */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            {
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Chat Free AI",
              url: SITE_URL,
              potentialAction: {
                "@type": "SearchAction",
                target: `${SITE_URL}/tools?q={search_term_string}`,
                "query-input": "required name=search_term_string",
              },
            },
            {
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "Chat Free AI",
              url: SITE_URL,
              logo: `${SITE_URL}/opengraph-image`,
            },
            {
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: "Chat Free AI",
              url: SITE_URL,
              applicationCategory: "BrowserApplication",
              operatingSystem: "Web Browser",
              description:
                "Chat free with ChatGPT, Gemini, Claude, Grok and more AI models in one place — no sign-up, no daily cap. Premium image, video, voice and resume tools priced clearly per use.",
              offers: {
                "@type": "Offer",
                price: "0",
                priceCurrency: "USD",
                description: "Free multi-model chat, no account required.",
              },
            },
            {
              "@context": "https://schema.org",
              "@type": "FAQPage",
              mainEntity: faqs.map((f) => ({
                "@type": "Question",
                name: f.q,
                acceptedAnswer: { "@type": "Answer", text: f.a },
              })),
            },
          ]),
        }}
      />
    </>
  );
}
