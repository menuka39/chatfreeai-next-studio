import Link from "next/link";
import type { Metadata } from "next";
import { packages as staticPackages, FREE_RESTRICTIONS } from "@/lib/packages";
import { effectiveLimits } from "@/lib/plan-limits";
import { baseModels, premiumModels, modelById } from "@/lib/models";
import { videoModelById, videoCredits, videoModels } from "@/lib/video-models";
import { imageModelById, imagePrice, imageModels } from "@/lib/image-models";
import { audioModels, audioModelById } from "@/lib/audio-models";
import { RESUME_PASS } from "@/lib/resume-pass";
import { ASSIST_CAPS as RESUME_ASSIST_CAPS } from "@/lib/resume-access";
import SignalBars from "@/components/SignalBars";
import { resumeTemplates } from "@/lib/resume-templates";

export const metadata: Metadata = {
  title: "Pricing — Chat Free AI",
  description:
    "All 8 core AI models are free for everyone, no account needed. Upgrade for more credits and the newest premium models.",
};

const planCols = ["free", "starter", "pro", "promax"] as const;
const rank = { free: 0, starter: 1, pro: 2, promax: 3 };

function planExamples(credits: number) {
  const veo = videoModelById("veo-31-lite")!;
  const sora = videoModelById("sora-2-pro")!;
  const imgFast = imageModelById("imagen-4-fast")!;
  const imgBest = imageModelById("gpt-image-15")!;
  const chatCheap = modelById("deepseek")!;
  const voice = audioModelById("grok-voice-tts")!;
  const chatBest = modelById("claude-sonnet-46")!;
  return {
    videosCheap: Math.floor(credits / videoCredits(veo, 8)),
    videosPremium: Math.floor(credits / videoCredits(sora, 8)),
    imagesCheap: Math.floor(credits / imagePrice(imgFast).credits),
    imagesBest: Math.floor(credits / imagePrice(imgBest).credits),
    chatCheapM: Math.round(credits / chatCheap.weight / 1_000_000),
    chatBestK: Math.round(credits / chatBest.weight / 1_000),
    voiceChars: Math.floor(credits / voice.creditsPerChar),
  };
}

export default async function PricingPage() {
  // Admin-adjustable in /admin/limits — shadows the static imports so every
  // reference below (many `.map()` calls over `packages`, `FREE_LIMITS.guest`
  // etc.) picks up the live values without rewriting the rest of this page.
  const effective = await effectiveLimits();
  const packages = staticPackages.map((p) => ({
    ...p,
    credits: effective[p.id].credits,
    price: effective[p.id].price ?? p.price,
  }));
  const FREE_LIMITS = { guest: effective.guest.credits, free: effective.free.credits };
  const resumePass = { price: effective.resume_pass.price!, aiAssistDaily: effective.resume_pass.credits, days: RESUME_PASS.days };

  return (
    <section className="px-6 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Pricing</p>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
            All 8 core models. Free for everyone.
          </h1>
          <p className="mt-4 text-ink-mute">
            ChatGPT, Claude, Gemini, Deepseek, Meta, Qwen, Perplexity and Grok — no account, no
            card. Every package adds AI image and video generation and unlocks every premium
            model; bigger plans simply carry more credits.
          </p>
        </div>

        {/* Free tier */}
        <div className="card-shadow mx-auto mt-12 max-w-3xl rounded-2xl border border-line bg-surface p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2.5 font-display text-xl font-semibold">
                Free — always on <SignalBars level={1} />
              </h2>
              <p className="mt-1 text-sm text-ink-mute">
                Every core model included. Resets daily at midnight UTC.
              </p>
            </div>
            <Link
              href="/#chat"
              className="rounded-lg border border-line px-5 py-2.5 text-sm font-semibold text-ink hover:border-brand"
            >
              Start chatting
            </Link>
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl bg-canvas p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">No account</p>
              <p className="mt-2 font-display text-2xl font-semibold">
                {FREE_LIMITS.guest.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-ink-mute">tokens / day</span>
              </p>
              <p className="mt-2 text-sm text-ink-mute">
                All 8 core models · replies up to {FREE_RESTRICTIONS.guest.maxOutputTokens.toLocaleString()} tokens
              </p>
            </div>
            <div className="rounded-xl bg-mint-tint p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-mint">Free account</p>
              <p className="mt-2 font-display text-2xl font-semibold">
                {FREE_LIMITS.free.toLocaleString()}
                <span className="ml-1 text-sm font-medium text-ink-mute">tokens / day</span>
              </p>
              <p className="mt-2 text-sm text-ink-mute">
                Same models · longer replies · saved chat history
              </p>
            </div>
          </div>
          <p className="mt-5 text-sm text-ink-mute">
            When the daily allowance runs out it stays out until the next day — no top-ups on the
            free plan. Heavier models use the allowance faster.
          </p>
        </div>

        {/* Packages */}
        <div className="mt-14 grid gap-6 lg:grid-cols-3">
          {packages.map((pkg, i) => (
            <div
              key={pkg.id}
              className={`card-shadow relative flex flex-col rounded-2xl border bg-surface p-7 ${
                pkg.highlight ? "border-brand ring-1 ring-brand" : "border-line"
              }`}
            >
              {pkg.highlight && (
                <span className="absolute -top-3 left-7 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="flex items-center gap-2.5 font-display text-xl font-semibold">
                {pkg.name} <SignalBars level={i + 2} />
              </h3>
              <p className="mt-1.5 text-sm text-ink-mute">{pkg.blurb}</p>
              <p className="mt-5 font-display text-4xl font-semibold">
                ${pkg.price}
                <span className="ml-1 text-base font-medium text-ink-mute">/month</span>
              </p>
              {(() => {
                const ex = planExamples(pkg.credits);
                return (
                  <div className="mt-5 rounded-xl bg-canvas px-4 py-3.5 text-[13px] leading-relaxed text-ink-mute">
                    <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
                      What {pkg.credits >= 1_000_000_000 ? `${pkg.credits / 1_000_000_000}B` : `${pkg.credits / 1_000_000}M`} credits gets you*
                    </p>
                    <p>
                      ≈ <span className="font-semibold text-ink">{ex.videosCheap} videos</span> (8s each)
                    </p>
                    <p>
                      or ≈ <span className="font-semibold text-ink">{ex.imagesCheap.toLocaleString()} images</span>
                    </p>
                  </div>
                );
              })()}
              <ul className="mt-5 flex-1 space-y-3">
                {pkg.features.map((f) => (
                  <li key={f} className="flex gap-2.5 text-sm text-ink">
                    <svg
                      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" className="mt-0.5 shrink-0 text-mint" aria-hidden
                    >
                      <path d="M20 6L9 17l-5-5" />
                    </svg>
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/account"
                className={`mt-7 rounded-lg px-5 py-3 text-center text-[15px] font-semibold transition-colors ${
                  pkg.highlight
                    ? "bg-brand text-white hover:bg-brand-deep"
                    : "border border-line text-ink hover:border-brand"
                }`}
              >
                Choose {pkg.name}
              </Link>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[12.5px] text-ink-faint">
          * Based on the most credit-efficient model in each category — every video and image model
          in your plan is unlocked, and pricier ones use more credits per video or image. Full
          breakdown below.
        </p>

        {/* What each plan makes */}
        <div className="mt-16">
          <h2 className="font-display text-2xl font-semibold">Each plan in real numbers</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-mute">
            Credits are one shared pool — mix chat, images and video however you like. These are
            what a full month&apos;s credits produce if spent on one thing.
          </p>
          <div className="card-shadow mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">If you spend it all on…</th>
                  {packages.map((p) => (
                    <th key={p.id} className="px-5 py-3.5 font-semibold">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">Videos — budget</span>
                    <span className="ml-2 text-xs text-ink-faint">8s · Veo 3.1 Lite</span>
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-ink">
                      ≈ {planExamples(p.credits).videosCheap}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">Videos — cinematic</span>
                    <span className="ml-2 text-xs text-ink-faint">8s · Sora 2 Pro</span>
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-ink">
                      ≈ {planExamples(p.credits).videosPremium}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">Images — budget</span>
                    <span className="ml-2 text-xs text-ink-faint">Imagen 4 Fast</span>
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-ink">
                      ≈ {planExamples(p.credits).imagesCheap.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">Images — top quality</span>
                    <span className="ml-2 text-xs text-ink-faint">GPT Image 1.5</span>
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-ink">
                      ≈ {planExamples(p.credits).imagesBest.toLocaleString()}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">Voice</span>
                    <span className="ml-2 text-xs text-ink-faint">Grok Voice TTS</span>
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-ink">
                      ≈ {Math.round(planExamples(p.credits).voiceChars / 1000).toLocaleString()}k chars
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">Chat — everyday</span>
                    <span className="ml-2 text-xs text-ink-faint">Deepseek V4 Flash</span>
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-ink">
                      ≈ {planExamples(p.credits).chatCheapM}M tokens
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5">
                    <span className="font-medium text-ink">Chat — flagship</span>
                    <span className="ml-2 text-xs text-ink-faint">Claude Sonnet 4.6</span>
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-ink">
                      ≈ {planExamples(p.credits).chatBestK.toLocaleString()}k tokens
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[12px] text-ink-faint">
            *Approximate — actual counts depend on the models, lengths and sizes you choose.
          </p>
        </div>

        {/* Model matrix */}
        <div className="mt-16">
          <h2 className="font-display text-2xl font-semibold">Model access by plan</h2>
          <div className="card-shadow mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Model</th>
                  {planCols.map((c) => (
                    <th key={c} className="px-5 py-3.5 font-semibold capitalize">
                      {c === "promax" ? "Pro Max" : c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr className="bg-canvas/60">
                  <td colSpan={5} className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    Core models — free for everyone
                  </td>
                </tr>
                {baseModels.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-ink">{m.name}</span>
                      <span className="ml-2 text-xs text-ink-faint">{m.strength}</span>
                    </td>
                    {planCols.map((c) => (
                      <td key={c} className="px-5 py-3.5 font-semibold text-mint">✓</td>
                    ))}
                  </tr>
                ))}
                <tr className="bg-canvas/60">
                  <td colSpan={5} className="px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    New premium models — included with every package
                  </td>
                </tr>
                {premiumModels.map((m) => (
                  <tr key={m.id}>
                    <td className="px-5 py-3.5">
                      <span className="font-medium text-ink">{m.name}</span>
                      <span className="ml-2 rounded bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold uppercase text-brand">
                        New
                      </span>
                      <span className="ml-2 text-xs text-ink-faint">{m.strength}</span>
                    </td>
                    {planCols.map((c) => (
                      <td key={c} className="px-5 py-3.5">
                        {rank[c] >= rank[m.minPlan] ? (
                          <span className="font-semibold text-mint">✓</span>
                        ) : (
                          <span className="text-ink-faint">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-ink-mute">
            Bigger models use credits faster — Perplexity Sonar Reasoning Pro costs far more per message than
            Deepseek or Qwen. Your remaining credits are always shown in the chat.
          </p>
        </div>

        {/* Image & video models */}
        <div className="mt-16">
          <h2 className="font-display text-2xl font-semibold">Image, video &amp; voice models included</h2>
          <p className="mt-2 max-w-2xl text-sm text-ink-mute">
            Every paid plan includes all of these — no separate image, video or voice subscription. They
            draw from the same monthly credits as chat.
          </p>
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            <div className="card-shadow rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">Video · {videoModels.length} models</h3>
                <Link href="/tools/video-generator" className="text-sm font-semibold text-brand hover:text-brand-deep">
                  Open →
                </Link>
              </div>
              <ul className="mt-4 space-y-2">
                {videoModels.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="text-ink">
                      {m.name}
                      <span className="ml-2 text-xs text-ink-faint">{m.provider}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {(m.resolutions[0].creditsPerSec / 1000).toLocaleString()}k / sec
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-shadow rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">Image · {imageModels.length} models</h3>
                <Link href="/tools/image-generator" className="text-sm font-semibold text-brand hover:text-brand-deep">
                  Open →
                </Link>
              </div>
              <ul className="mt-4 space-y-2">
                {imageModels.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {m.name}
                      <span className="ml-2 text-xs text-ink-faint">{m.provider}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      from {(m.credits / 1000).toLocaleString()}k
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card-shadow rounded-2xl border border-line bg-surface p-6">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-lg font-semibold">Voice · {audioModels.length} models</h3>
                <Link href="/tools/audio-generator" className="text-sm font-semibold text-brand hover:text-brand-deep">
                  Open →
                </Link>
              </div>
              <ul className="mt-4 space-y-2">
                {audioModels.map((m) => (
                  <li key={m.id} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      {m.name}
                      <span className="ml-2 text-xs text-ink-faint">{m.provider}</span>
                    </span>
                    <span className="shrink-0 text-xs text-ink-faint">
                      {(m.creditsPerChar * 1000 / 1000).toLocaleString()}k / 1k chars
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        {/* Resume Pass — separate one-off product */}
        <div id="resume" className="mt-20 scroll-mt-24">
          <div className="card-shadow overflow-hidden rounded-2xl border border-mint/25 bg-surface">
            <div className="grid gap-0 md:grid-cols-[1.2fr_1fr]">
              <div className="p-7">
                <p className="inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-mint">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                  One-off · not a subscription
                </p>
                <h2 className="mt-2 font-display text-2xl font-semibold">{RESUME_PASS.name}</h2>
                <p className="mt-2 text-ink-mute">
                  A one-off pass for the resume builder — no subscription, nothing to cancel. Buy it,
                  build your resume, download it. It simply expires after {resumePass.days} days.
                </p>
                <ul className="mt-5 grid gap-2 sm:grid-cols-2">
                  {[RESUME_PASS.features[0], RESUME_PASS.features[1], RESUME_PASS.features[2],
                    `${resumePass.aiAssistDaily.toLocaleString()} AI suggestions a day (free tier gets ${RESUME_ASSIST_CAPS.free})`,
                    ...RESUME_PASS.features.slice(3)].map((f) => (
                    <li key={f} className="flex gap-2 text-[14px] text-ink">
                      <span className="text-mint">✓</span>
                      {f}
                    </li>
                  ))}
                </ul>
                <p className="mt-4 text-[12.5px] leading-relaxed text-ink-faint">
                  &ldquo;Unlimited&rdquo; means the builder itself: unlimited resumes, edits, template
                  switches and PDF downloads — those are free for everyone, on every tier, forever.
                  What a pass adds is AI suggestion volume: {resumePass.aiAssistDaily.toLocaleString()} a day instead of{" "}
                  {RESUME_ASSIST_CAPS.free}. Writing one resume typically uses 20-40, so the cap only ever binds on automated abuse.
                </p>
              </div>
              <div className="flex flex-col justify-center border-t border-line bg-canvas p-7 md:border-l md:border-t-0">
                <p className="font-display text-4xl font-semibold">
                  ${resumePass.price}
                  <span className="ml-1 text-base font-medium text-ink-mute">/ {resumePass.days} days</span>
                </p>
                <p className="mt-1 text-[13px] text-ink-mute">One payment. No auto-renewal.</p>
                <Link
                  href="/account#pass"
                  className="mt-5 rounded-xl bg-brand px-5 py-3 text-center text-[15px] font-semibold text-white hover:bg-brand-deep"
                >
                  Get the Resume Pass
                </Link>
                <Link href="/tools/resume-builder" className="mt-3 text-center text-[13px] font-semibold text-brand hover:text-brand-deep">
                  Browse all {resumeTemplates.length} templates first →
                </Link>
                <p className="mt-4 text-[12px] leading-relaxed text-ink-faint">
                  Already on a monthly package? The resume builder is <strong className="text-ink-mute">included</strong> —
                  no pass needed, and AI suggestions there don&apos;t touch your monthly credits.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Limits table */}
        <div className="mt-14">
          <h2 className="font-display text-2xl font-semibold">Limits by plan</h2>
          <div className="card-shadow mt-5 overflow-x-auto rounded-2xl border border-line bg-surface">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="border-b border-line text-xs uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-5 py-3.5 font-semibold">Limit</th>
                  <th className="px-5 py-3.5 font-semibold">Free</th>
                  {packages.map((p) => (
                    <th key={p.id} className="px-5 py-3.5 font-semibold">{p.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                <tr>
                  <td className="px-5 py-3.5 font-medium">Credits</td>
                  <td className="px-5 py-3.5 text-ink-mute">
                    {FREE_LIMITS.free.toLocaleString()} / day
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 text-ink-mute">
                      {p.credits >= 1_000_000_000 ? `${p.credits / 1_000_000_000}B` : `${(p.credits / 1_000_000).toLocaleString()}M`} / month
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-medium">Max reply length</td>
                  <td className="px-5 py-3.5 text-ink-mute">
                    {FREE_RESTRICTIONS.free.maxOutputTokens.toLocaleString()} tokens
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 text-ink-mute">
                      {p.limits.maxOutputTokens.toLocaleString()} tokens
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-medium">Conversation memory</td>
                  <td className="px-5 py-3.5 text-ink-mute">
                    {FREE_RESTRICTIONS.free.historyMessages} messages
                  </td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 text-ink-mute">
                      {p.limits.historyMessages} messages
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-medium">Image, video &amp; voice tools</td>
                  <td className="px-5 py-3.5 text-ink-faint">—</td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 font-semibold text-mint">✓</td>
                  ))}
                </tr>
                <tr>
                  <td className="px-5 py-3.5 font-medium">Chats at once</td>
                  <td className="px-5 py-3.5 text-ink-mute">{FREE_RESTRICTIONS.free.concurrency}</td>
                  {packages.map((p) => (
                    <td key={p.id} className="px-5 py-3.5 text-ink-mute">{p.limits.concurrency}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
