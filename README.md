# Chat Free AI — Next.js

Multi-model AI chat (OpenRouter) — 8 core models free for everyone, 8 newer
premium models unlocked by monthly packages.

## Design

Dark professional theme (near-black canvas, bright indigo `#7C6CFF` + mint
`#3DDC97` accents) with the Geist typeface (Sans + Mono), self-hosted in
`app/fonts/` — no external font requests. All colors are CSS variables in
`app/globals.css`; change the palette there and every page follows.

Performance: every page is statically generated (SSG), fonts are local
variable woff2 with `display: swap`, and there are no client-side libraries
beyond React itself.

## Deploying

See **DEPLOY.md**. The one thing you cannot skip: set
`UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`, or the daily free
limits are not enforced on serverless and free users cost you real money.

## Setup

```bash
npm install
cp .env.example .env.local   # add your OPENROUTER_API_KEY
npm run dev
```

## Model tiers

**Base (free for guests, free accounts, everyone):** ChatGPT (4o-mini),
Claude 3 Haiku, Gemini 2.5 Flash Lite, Deepseek V4 Flash, Llama 4 Maverick,
Qwen 3.5 Flash, Perplexity Sonar, Grok Build 0.1.

**Premium (any paid plan unlocks ALL 13 — budget + flagship variant of each
brand's newest generation):**
- Budget: Deepseek V4 Pro, Gemini 3.1 Flash Lite, ChatGPT 5.4 Nano,
  Qwen3.5 Plus, Claude Haiku 4.5, Sonar Reasoning Pro, Grok 4.5
- Mid: Gemini 3 Flash, ChatGPT 5.4 Mini, Qwen3.7 Max,
  Perplexity Sonar Pro, Claude Sonnet 4.6, Grok 4.3
- Flagship ("best of brand"): GPT-5.4, Claude Opus 4.8, Gemini 3.1 Pro

Plans differ only in credits and limits. The weight system keeps flagship
usage margin-safe: a GPT-5.4 message burns 151 credits per token vs 5 for Deepseek V4 Pro, so cost per credit stays ~$0.13/1M regardless.

Meta has no premium entry: Llama 4 Behemoth is a teacher model never released
for inference. Add one to `premiumModels` if Meta ships a newer Llama.

⚠️ ChatGPT 5.4 Nano/Mini prices are derived from OpenAI's published 4x multiplier —
`npm run verify:models --write` pulls live prices and recalculates weights.
Run it before launch, and monthly after.

⚠️ Premium model slugs are newer and change often. Run `npm run verify:models`
before launch — it checks every slug against OpenRouter's live catalogue and
can rewrite prices/weights with `--write`.

## How the money works

`lib/models.ts` records each model's OpenRouter list price and a **credit
weight**; users are charged `tokens × weight`. Weights normalise cost to
~$0.13 of OpenRouter spend per 1M credits regardless of model.

| Plan | Price | Credits | All-in cost | Profit |
|---|---|---|---|---|
| Starter | $14.99 | 65M | ~$9.4 | ~$5.6 |
| Pro | $44.99 | 280M | ~$38.8 | ~$6.2 |
| Pro Max | $139.99 | 975M | ~$134.0 | ~$6.0 |

**Margins are intentionally slim (~4%).** All-in cost includes OpenRouter's
5.5% credit top-up fee and ~2.9% + $0.30 card processing. Before launch you
MUST verify every price marked `estimated` — a wrong estimate can still
wipe out a package's profit. The free tier (guests + free accounts) also costs real
money with no revenue attached, and there is no longer a fat margin covering
it; budget for it separately or tighten the free limits.

Free daily allowances: guests 8,000 credits, free accounts 20,000. Heavy models
burn the allowance faster (Grok Build = 11× Deepseek), so free usage costs are
capped at roughly $0.003/guest/day worst-case.

Per-plan restrictions (enforced server-side in the chat route):
max reply length (`max_tokens`), conversation memory (history trim), and
concurrency (see `FREE_RESTRICTIONS` / package `limits`). Concurrency is
defined but not yet enforced — add an in-flight counter alongside the quota
store when you wire Redis.

Set `LOG_MARGIN=1` to print real USD cost per completion.
Top up OpenRouter credits in $25+ amounts — the $0.80 minimum purchase fee
makes small top-ups expensive.

## Free-limit enforcement

`lib/quota.ts` counts credits server-side only:
- Guests keyed on **both** sha256(ip+deviceId) and sha256(ip) — clearing
  cookies or incognito still hits the IP counter.
- Keys embed the UTC day: allowance refills at 00:00 UTC, no early top-up.
- `RESERVE_CREDITS` reserved before each request blocks parallel-request abuse.

> Storage switches automatically: in-memory for local dev, Upstash Redis when
> `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` are set. Redis makes
> charging atomic (INCRBY) and survives across instances. If the store is
> unreachable, charging fails **closed** — requests are refused rather than
> giving away unmetered usage. In production without Redis the server logs a
> warning at boot.

## Video generation

`/tools/video-generator` runs on OpenRouter's async `/api/v1/videos` API with
8 models (Veo 3.1 Lite/Fast, Seedance 2.0 Fast, Hailuo 2.3, Wan 2.6,
Kling v3 Std/Pro, Sora 2 Pro). Paid plans only; charged from the SAME monthly
credit pool as chat at `creditsPerSec = costPerSec × 2.4M` — e.g. an 8s
Veo 3.1 Lite clip costs us $0.40 and the user 960k credits (~$1.44 retail on
Starter, ~72% gross margin; ~64% worst-case on Pro Max). Credits are charged
up front and auto-refunded when a job fails. Verified per-second prices
(Jul 2026): Veo Lite $0.05, Seedance Fast $0.0538, Hailuo $0.0817,
Kling Std $0.126; Wan 2.6, Kling Pro and Sora 2 Pro are estimates — check
their OpenRouter pages before launch.

## Tools

| Tool | Route | How it bills |
|---|---|---|
| Chat | `/` | tokens × weight |
| Image Generator | `/tools/image-generator` | per image (per megapixel for FLUX) |
| Video Generator | `/tools/video-generator` | per second, per resolution |
| Voice Generator | `/tools/audio-generator` | per character of input text |
| Resume Builder | `/tools/resume-builder` | tokens × weight (small requests, per field) |
| Resume Screener | `/tools/resume-screener` | tokens × weight |
| Document Forge | `/tools/document-forge` | tokens × weight |
| Product Recommender | `/tools/product-recommender` | tokens × weight |
| Document Q&A | `/tools/knowledge-bot` | tokens × weight |

Everything draws from the **same monthly credit pool**. There is no per-tool
subscription and no separate rate — 1M credits costs us ~$0.126 whichever tool
spends it.

Resume Builder is a dedicated build (`components/resume/`, `lib/resume.ts`,
`lib/resume-templates.ts`, `lib/resume-pass.ts`,
`app/api/resume/assist/route.ts`):

- **40 templates** across 8 role categories. One renderer
  (`TemplateRenderer.tsx`) draws all of them from a config of layout engine +
  header style + heading treatment + typography + density + photo, so content
  handling stays identical and only presentation varies. Gallery cards are
  REAL scaled renders, not screenshots — they can't go stale.
- **Honest ATS ratings** (excellent / good / styled). Multi-column and photo
  templates are labelled as riskier for big-company portals rather than sold
  as universally safe. Categories describe role fit — no fabricated corporate
  endorsements.
- Structured editor, live preview with zoom, ATS panel with 9 concrete checks,
  per-field AI assist (summary, bullets, skills, headline), photo upload
  (downscaled client-side, never uploaded to us).
- Autosaves to localStorage; exports .txt, .json, and a real PDF.

### Resume builder entitlements

The builder itself — editing, all 40 templates, switching designs, PDF/txt/json
export — is **unlimited on every tier including guests**, because none of it
costs us anything per use.

Only AI suggestions are metered, and in CALLS PER DAY rather than credits
(`lib/resume-access.ts`):

| Tier | AI suggestions/day |
|---|---|
| Guest | 10 |
| Free account | 30 |
| Resume Pass ($2.99 / 5 days) | 300 |
| Starter | 200 |
| Pro | 400 |
| Pro Max | 800 |

Writing one resume takes roughly 20-40 suggestions, so these are abuse
ceilings, not budgets. Worst case cost at the cap is $0.24-$0.96/month for
package tiers against $5.61-$6.16 profit.

**Why calls and not credits:** an assist is ~160 tokens ≈ $0.00004. Billing it
to the credit pool made the tool feel metered and produced a backwards
outcome — a $2.99 pass holder got assists free of credits while a $14.99
subscriber paid for every one. A subscriber must never get the worse deal, so
packages now include resume AI outright and their monthly credits stay
untouched by it.

### Resume PDF export

Two routes, because they win in different cases:

**Print / Save as PDF (default, `lib/resume-print.ts`)** — writes the resume
into a hidden, isolated iframe with its own `@page` size and prints that. The
browser renders real **vector text**: crisp at any zoom, selectable and
searchable. The iframe is a clean document, so the app's dark theme can't leak
in (that was the black-page cause). Single-page mode measures the content and
scales it to one sheet; otherwise the browser paginates real text across pages.
Waits on the iframe's own `document.fonts.ready` first, so glyph widths are
correct and text never overlaps.

**Download as image PDF (`lib/resume-pdf.ts`)** — for when someone wants a file
saved directly with no dialog. Rasterises the resume onto white with
html2canvas-pro and places it in jsPDF. Text is an image (not selectable), but
it's one click. Flow mode slices the canvas into real page-height pixel strips,
so no blank or black trailing pages.

#### html2canvas notes

`window.print()` was replaced. The print dialog inherited the app's dark theme,
so the exported page came out **black** — the resume's white background lost to
the painted body colour, which print-CSS visibility tricks don't reliably
override. It also gave no paper-size control.

Now the rendered template node is rasterised with **html2canvas-pro** (the fork
that understands modern CSS colour functions like oklch; the original throws on
them) onto an explicit white background, then placed in a **jsPDF** page:

- **Paper sizes:** A4, Letter (US), A3.
- **Single page** (default) scales the whole resume onto one page; the template
  is authored at exactly the A4 ratio (1.414), so it fits any paper size with
  no distortion. **Multi-page** keeps natural size and splits long CVs.
- The PDF is captured from the full-size node, never the zoomed preview — a
  ref points at the unscaled `.resume-page`, kept separate from the on-screen
  zoom wrapper. Fixing that separation also fixed the squished-preview bug,
  where the zoom transform was distorting the on-screen render.

**Resume Pass** (`lib/resume-pass.ts`) is a one-off purchase via the PayPal
Orders API — not a subscription, nothing to cancel, expires after 5 days.

The other four text tools share one config file (`lib/text-tools.ts`), one
API route (`app/api/tool/route.ts`) and one UI component
(`components/TextTool.tsx`).
Adding a tool means adding a config entry with its fields and prompt — no new
route, no new billing path. Prompts are assembled server-side, so users can't
edit them; `toClientTool()` strips the builder before the config crosses to the
browser.

Text tools are usable on the **free daily allowance** too (they're just chat
under the hood). Image, video and voice are paid-plan only, because a single
generation can cost more than an entire day's free credits.

## Image generation

`/tools/image-generator` uses OpenRouter's unified Image API with 9 models
(GPT Image 1 Mini/1.5, GPT-5.4 Image 2, Imagen 4 Fast/4, Nano Banana 1/2,
Seedream 4.5, FLUX.2 Pro). Same rules as video: paid plans only, charged from
the shared monthly pool at `credits = costPerImage × 8M` (uniform ~$0.126 per 1M credits), charged up front and refunded on failure — OpenRouter itself
never bills failed image generations. Most models are flat-priced per image;
FLUX.2 Pro bills per megapixel, so its credits scale with the selected size.
Verified prices (Jul 2026): Seedream 4.5 $0.04 flat, FLUX.2 $0.03/MP,
GPT Image 1 Mini $0.005, Imagen 4 Fast $0.02, GPT Image 1.5 $0.04.
Nano Banana 2 and GPT-5.4 Image 2 prices are estimates — verify before launch.

## Pricing page: real numbers

The pricing page translates credits into concrete output — each package card
shows "≈ N videos / N images / N chat tokens", and a comparison table breaks
it down across budget vs premium models. All of it is computed live from
`lib/models.ts`, `lib/video-models.ts` and `lib/image-models.ts`, so changing
a price or weight updates the marketing numbers automatically. Never hardcode
these counts.

## No-loss guarantee — two layers

**Layer 1: the app prices from LIVE OpenRouter rates.** `lib/price-oracle.ts`
fetches the real price for a model before charging (cached 1h, one request per
hour per process). Credits are then `cost / 0.126 × 1M`. A hardcoded price
being wrong — or a provider raising it after you deploy — cannot cost you
money, because the charge is derived from the price that's actually in effect.

**Layer 2: a safety factor on unverified prices.** If the live lookup fails
(network down, endpoint changed), the catalogue is used as a fallback — and
any entry marked `estimated: true` is charged at **2× its catalogue price**.
That covers a real price up to double the guess. Verified prices are used
as-is.

Chat works the same way: `effectiveWeight()` recomputes the weight from the
live price and the request's actual input/output split, and takes whichever
weight is higher.

Static weights are still derived, never guessed:

    blended = price.in * 0.4 + price.out * 0.6   (conservative: output-heavy)
    weight  = ceil(blended / 0.126)

Run `npm run audit:margins` after any price change (it models the safety
factor, so it reflects what the app really charges), and
`npm run audit:live` to additionally verify every slug still exists on
OpenRouter.

### Closing the estimate gap

11 entries are currently marked `estimated: true` (4 chat, 5 video
resolutions, 2 image). Each is charged at 2× when the live lookup fails. To
make the fallback exact as well:

```bash
export OPENROUTER_API_KEY=sk-or-...
npm run verify:prices          # report: what's live vs what we guessed
npm run verify:prices:write    # write the real prices, drop the flags
npm run audit:margins          # confirm still no loss
```

The script fetches the live price for every flagged entry, writes the real
number, recomputes credits (video/image) or the weight (chat) at the $0.126
rate, and removes the flag. Anything it can't find on OpenRouter is reported
and left flagged — it never silently "confirms" a price it didn't see. A slug
it can't find will also 404 in production, so fix the slug first.

Do this once before launch, then whenever you add a model.

## Video generator features

Built on OpenRouter's normalised video schema, so one code path covers every
provider:

| Feature | Field | Notes |
|---|---|---|
| Text to video | `prompt` | |
| **Animate an image** | `frame_images[first_frame]` | the most-used mode in real products |
| **Closing frame** | `frame_images[last_frame]` | Kling v3.0 Std/Pro |
| **Reference images** | `input_references` | style/character guidance |
| **Native audio** | `generate_audio` | Veo 3.1 family, Kling v3.0 |
| **Seed** | `seed` | reproducible retries |

Capabilities are declared per model and enforced on BOTH sides: the UI hides
what a model can't do, and the API rejects it with a specific message rather
than passing it upstream to fail.

**Audio is charged.** Providers bill extra for synced audio, so
`audioSurcharge` multiplies the per-second rate (default 2× where unverified,
matching the SAFETY_FACTOR convention). The cost preview includes it — a
quote that omitted it would understate what the user is about to spend.

Two things that raise output quality more than any model choice:

- **Prompt enhancer** (`/api/video/enhance`) rewrites a weak prompt into a
  specific one covering subject, camera move, lighting and lens. A ~$0.00005
  chat call ahead of a generation costing dollars. Metered per day by tier
  (guest 5 / free 25 / paid 300), never from the credit pool.
- **Preset chips** for camera, framing, lighting, look and motion. They
  APPEND to what the user wrote instead of replacing it.

### Extending a clip

OpenRouter's video API takes images, not video — there is **no native extend**.
So "Continue this scene" chains clips: the closing frame of one generation
becomes the opening frame of the next. That works with any image-to-video
model and produces a continuous sequence.

**One click.** "Extend +8s" runs all three steps automatically — read the
final frame, generate a continuation, join it on — and the player comes back
showing one longer video. That matches what people expect from tools like
Runway; making the user drive each step separately is what made it feel
broken.

Under the hood it is still a new generation, and the button says so by
printing the credit price before you click. Joining is incremental: the
already-joined blob is concatenated with the new part rather than
re-downloading every clip each time.

**Every part is kept.** If joining fails, the clips are still listed
individually with download buttons — footage the user already paid for must
never be lost to a post-processing error.

### Downloads (`lib/download-video.ts`)

`<a href="https://provider.example/x.mp4" download>` does **not** download.
Browsers ignore the `download` attribute on cross-origin URLs, so every
per-clip "Download" was silently opening a tab instead of saving a file.
Provider links are always cross-origin, so this affected the parts list, the
history list and the join panel.

Fixed by fetching through the signed proxy — the response is then same-origin,
and a blob URL saves properly with a filename we choose:

- `veo-3-1-lite-scene-24s.mp4` — the joined video
- `veo-3-1-lite-part-2-8s.mp4` — an individual part
- `kling-v3-0-standard-clip-5s.mp4` — a single clip

Buttons state the duration (`Download full 24s video ↓`) so nobody has to
guess whether they're getting 8 seconds or 32. "Save all" spaces downloads out,
because browsers throttle rapid programmatic saves, and collects failures
instead of aborting on the first expired link.

### Joining clips in the browser

`lib/join-clips.ts` combines a chain into one MP4 with ffmpeg.wasm, entirely
client-side. Nothing is uploaded, so we carry no bandwidth, storage or privacy
burden for people's video.

Chained clips share a model and resolution, so they share codec and
dimensions — which lets the concat demuxer **stream-copy** them: no re-encode,
no quality loss, and fast. If a chain does mix formats the copy is detected as
failed (including the case where it "succeeds" but writes an empty file) and
it falls back to a real re-encode rather than handing over a broken download.

The ~30MB ffmpeg core is fetched from a CDN **only when someone clicks Join** —
the build itself only carries a 40KB wrapper. The single-threaded core is used
deliberately: the multithreaded one needs COOP/COEP headers, which would break
embeds and third-party scripts across the whole site.

Reading the last frame needs the file on our own origin — a cross-origin
`<video>` taints the canvas. `/api/video/proxy` streams it back, and only for
URLs **signed by our own poll endpoint** (`lib/video-token.ts`). Without that
signature the route would be a textbook SSRF hole; with it, an attacker can't
invent a URL to fetch. Set `VIDEO_URL_SECRET` in production.

**History** (`components/video/VideoHistory.tsx`) keeps the last 30
generations in localStorage with reuse-settings and download. The UI states
plainly that provider links expire and this is a convenience list, not
storage.

## Video resolutions — a real cost trap

Every priced option — 24 chat models, 8 video models × their resolutions,
9 image models × their quality tiers (47 in total) — is capped at **$0.126 of
cost per 1M credits**. Chat weights are derived, never guessed:

    blended = price.in * 0.4 + price.out * 0.6   (conservative: output-heavy)
    weight  = ceil(blended / 0.126)

Rounding up means no model can exceed the cap, so there is no combination of
models a user can pick that produces a loss. Worst case across all 47 options
leaves ~$5.6-6.2 profit per package.

`scripts/audit-margins.mjs` re-runs this audit — run it after ANY price or
weight change.

## Video generator features

Built on OpenRouter's normalised video schema, so one code path covers every
provider:

| Feature | Field | Notes |
|---|---|---|
| Text to video | `prompt` | |
| **Animate an image** | `frame_images[first_frame]` | the most-used mode in real products |
| **Closing frame** | `frame_images[last_frame]` | Kling v3.0 Std/Pro |
| **Reference images** | `input_references` | style/character guidance |
| **Native audio** | `generate_audio` | Veo 3.1 family, Kling v3.0 |
| **Seed** | `seed` | reproducible retries |

Capabilities are declared per model and enforced on BOTH sides: the UI hides
what a model can't do, and the API rejects it with a specific message rather
than passing it upstream to fail.

**Audio is charged.** Providers bill extra for synced audio, so
`audioSurcharge` multiplies the per-second rate (default 2× where unverified,
matching the SAFETY_FACTOR convention). The cost preview includes it — a
quote that omitted it would understate what the user is about to spend.

Two things that raise output quality more than any model choice:

- **Prompt enhancer** (`/api/video/enhance`) rewrites a weak prompt into a
  specific one covering subject, camera move, lighting and lens. A ~$0.00005
  chat call ahead of a generation costing dollars. Metered per day by tier
  (guest 5 / free 25 / paid 300), never from the credit pool.
- **Preset chips** for camera, framing, lighting, look and motion. They
  APPEND to what the user wrote instead of replacing it.

### Extending a clip

OpenRouter's video API takes images, not video — there is **no native extend**.
So "Continue this scene" chains clips: the closing frame of one generation
becomes the opening frame of the next. That works with any image-to-video
model and produces a continuous sequence.

**One click.** "Extend +8s" runs all three steps automatically — read the
final frame, generate a continuation, join it on — and the player comes back
showing one longer video. That matches what people expect from tools like
Runway; making the user drive each step separately is what made it feel
broken.

Under the hood it is still a new generation, and the button says so by
printing the credit price before you click. Joining is incremental: the
already-joined blob is concatenated with the new part rather than
re-downloading every clip each time.

**Every part is kept.** If joining fails, the clips are still listed
individually with download buttons — footage the user already paid for must
never be lost to a post-processing error.

### Downloads (`lib/download-video.ts`)

`<a href="https://provider.example/x.mp4" download>` does **not** download.
Browsers ignore the `download` attribute on cross-origin URLs, so every
per-clip "Download" was silently opening a tab instead of saving a file.
Provider links are always cross-origin, so this affected the parts list, the
history list and the join panel.

Fixed by fetching through the signed proxy — the response is then same-origin,
and a blob URL saves properly with a filename we choose:

- `veo-3-1-lite-scene-24s.mp4` — the joined video
- `veo-3-1-lite-part-2-8s.mp4` — an individual part
- `kling-v3-0-standard-clip-5s.mp4` — a single clip

Buttons state the duration (`Download full 24s video ↓`) so nobody has to
guess whether they're getting 8 seconds or 32. "Save all" spaces downloads out,
because browsers throttle rapid programmatic saves, and collects failures
instead of aborting on the first expired link.

### Joining clips in the browser

`lib/join-clips.ts` combines a chain into one MP4 with ffmpeg.wasm, entirely
client-side. Nothing is uploaded, so we carry no bandwidth, storage or privacy
burden for people's video.

Chained clips share a model and resolution, so they share codec and
dimensions — which lets the concat demuxer **stream-copy** them: no re-encode,
no quality loss, and fast. If a chain does mix formats the copy is detected as
failed (including the case where it "succeeds" but writes an empty file) and
it falls back to a real re-encode rather than handing over a broken download.

The ~30MB ffmpeg core is fetched from a CDN **only when someone clicks Join** —
the build itself only carries a 40KB wrapper. The single-threaded core is used
deliberately: the multithreaded one needs COOP/COEP headers, which would break
embeds and third-party scripts across the whole site.

Reading the last frame needs the file on our own origin — a cross-origin
`<video>` taints the canvas. `/api/video/proxy` streams it back, and only for
URLs **signed by our own poll endpoint** (`lib/video-token.ts`). Without that
signature the route would be a textbook SSRF hole; with it, an attacker can't
invent a URL to fetch. Set `VIDEO_URL_SECRET` in production.

**History** (`components/video/VideoHistory.tsx`) keeps the last 30
generations in localStorage with reuse-settings and download. The UI states
plainly that provider links expire and this is a convenience list, not
storage.

## Video resolutions — a real cost trap

Several providers charge MORE for higher resolution: Veo 3.1 Lite is
**$0.05/s at 720p but $0.08/s at 1080p**, and Seedance bills by pixels
(`h × w × duration × 24 / 1024`), making 1080p ~2.25× the price of 720p.
Charging one flat per-second rate would lose money on every 1080p job.

So each model carries a `resolutions[]` array with its own `costPerSec` and
`creditsPerSec`, the UI shows a resolution selector (with the per-second
credit rate on each option), and the API validates the label server-side.
Models with a single resolution hide the selector.

Result: an 8s Veo 3.1 Lite clip is 3.2M credits at 720p and 5.12M at 1080p —
Starter buys 20 of the former or 12 of the latter, and margin holds either way.
**When adding a model, always check whether its price varies by resolution.**

## Aspect ratios

`components/AspectRatioPicker.tsx` renders each ratio as a box drawn in its
true proportion (shared by the image and video generators). Only ratios the
selected model actually accepts are shown, and both API routes validate the
ratio server-side — sending an unsupported one returns `bad_aspect_ratio`
rather than letting the provider reject it.

Image dimensions are derived from ratio + megapixel budget via
`dimensionsFor()`, rounded to multiples of 16 (what image models expect):
1:1 → 992×992, 16:9 → 1328×752, 3:2 → 1232×816. FLUX.2 Pro bills per
megapixel, so it also gets a Standard/High/Max resolution selector that
scales both dimensions and credits.

## Chat history

Conversations are Claude-style: a sidebar with **New chat**, a recents list
(auto-titled from the first message), per-thread model memory, and delete.
Threads persist in `localStorage` (capped at 50) — device-local only. When you
wire auth, sync `cfai_chats` to the server on login and switch reads to the DB.

## Still to wire up

- **Auth** — `lib/session.ts` is a cookie shim; replace `getSession`.
- **Checkout** — `/checkout?package=…` links exist; hook up Stripe/PayPal and
  set `pkg` + `period` on the session after payment.
- **Concurrency limits** — declared per plan, not yet enforced.
- **Homepage testimonials & stats are placeholders** — replace with real data
  before launch.

## Chat features and who gets them

| | Guest | Free account | Starter / Pro / Pro Max |
|---|---|---|---|
| Web search | 3/day | 15/day | 60 / 150 / 300 per day |
| Research | — | 2/day | 10 / 30 / 60 per day |
| Images + text files | — | ✓ | ✓ |
| **PDF reading** | — | — | **✓** |
| **Code archives (.zip)** | — | — | **✓** |
| Skills | — | 5 | 25 / 100 / 500 |
| Projects | — | 3 | 20 / 100 / 500 |

**Web search is metered in calls, not credits.** One OpenRouter search costs
$0.005 — about 39,700 credits, roughly FIVE TIMES a guest's entire 8,000-credit
daily allowance. Billing it from the pool would make the feature unusable for
the people we're giving it to, so the caps above are sized from what they cost:
guest 3/day is $0.015/day of pure spend with no revenue behind it. That is the
tier to watch as traffic grows — the number lives in `lib/chat-features.ts`.

### PDF reading (`lib/pdf-extract.ts`)

Text is extracted from the PDF's text layer **in the browser** with pdf.js, so
the file never reaches our servers. pdf.js (~1MB) is imported dynamically —
verified absent from the page load, it downloads only when someone actually
attaches a PDF.

Two cases handled explicitly rather than silently:

- **Scanned PDFs** have no text layer, so extraction returns nothing. Attaching
  it anyway would spend the user's tokens on an empty document, so it's refused
  with a clear message.
- **Long PDFs** are capped at 40 pages / 60,000 characters and the chip says
  what was read ("40 of 60 pages"). A long PDF is the one attachment that can
  genuinely inflate token spend, since it is re-sent with every follow-up.

PDF is restricted to monthly packages — not because extraction costs us
anything, but because those tokens come out of a pool the user has paid for.

### Code archives (`lib/zip-extract.ts`)

Attach a `.zip` — a plugin, a repo export — and the source files are read in the
browser with fflate (~8KB, chosen over JSZip since we only ever read). Packages
only: it is the most token-hungry attachment we support, and a package holder
pays those tokens from a pool they bought, which keeps it self-limiting.

Three guards, in order of how badly they'd bite:

1. **Zip bombs.** A 57KB archive can expand to 60MB and hang the tab. Entry
   sizes are summed from the directory *before* anything is decompressed;
   anything over 40MB uncompressed is refused. Verified against a real bomb.
2. **Runaway token cost.** `node_modules`, `vendor`, `.git`, `dist`, `.min.js`,
   lockfiles and binaries are skipped, with hard caps of 60 files / 100k chars /
   200KB per file. On a realistic WordPress plugin this took 20 entries down to
   the 5 that matter.
3. **Misleading paths.** Entries can be named `../../etc/passwd`. Nothing is
   written to disk so there's nothing to traverse, but the path is normalised
   so the model is never shown a fabricated project structure.

The model receives a project tree followed by each file fenced under its path,
so it can reason about structure as well as content.

### Attachments persist for the conversation

Attachments used to clear after one send, which meant "explain this plugin"
worked and "now fix that bug" silently sent no code — the model would answer
confidently from nothing. They now stay pinned until removed (or until a new
chat starts), and the composer says plainly that they're re-sent every message
and cost credits each turn.

### Generating a .zip (`lib/build-zip.ts`)

The reverse direction: ask for a plugin, get an archive. Any assistant reply
containing labelled files grows a "Download N files as .zip" bar, packed in the
browser with fflate. Available to everyone — it costs us nothing, it's just the
reply the user already paid for, reorganised.

Four labelling styles are parsed, because that's what models actually emit:

    ```php my-plugin/admin.php        (path on the fence)
    ```js title="app.js"              (title attribute)
    **includes/helper.php**           (bold line above the fence)
    // file: assets/style.css         (first-line comment)

Unlabelled snippets are ignored, so an explanatory `npm install` block never
lands in the archive. The **Build me files** built-in skill instructs the model
to label every file, which makes the button reliable rather than incidental.

**Zip slip is the security point here.** A zip entry named `../../.bashrc`
escapes the extraction folder in many tools — and we are the ones building the
archive, so a model that emits such a path (confused, or steered by a prompt
injection inside an attached file) would hand the user an archive that attacks
their own machine. Every path is stripped of traversal segments, drive letters
and leading slashes. Verified against `../../.bashrc`, `/etc/shadow`,
`C:\Windows\...`, `..\..\autoexec.bat` and `good/../../../bad.sh` — all
neutralised.

Caps are 80 files / 5MB. An oversized file is **skipped and named**, not fatal:
an earlier version broke out of the loop, so one huge file silently discarded
every smaller file after it and the download failed with nothing to show.

## Markdown replies (`components/chat/Markdown.tsx`)

Replies used to render with `whitespace-pre-wrap` — raw text. Every code answer
arrived with literal ``` fences, `##` in front of headings and `**` around bold
text, so correct answers looked broken. They are now rendered as markdown with
GFM tables, task lists, and syntax-highlighted code blocks that carry a language
label and a copy button.

**XSS: `rehype-raw` is deliberately not used.** Without it react-markdown
escapes raw HTML, so a model emitting `<script>`, `<img onerror>`,
`<div onclick>` or `<svg onload>` — by accident, or because a prompt injection
inside an attached PDF/zip told it to — renders as visible text rather than
executing in the page. All four were verified escaped, and `javascript:` links
are neutralised. Links get `rel="noopener noreferrer nofollow"`.

**Streaming performance.** The parent re-renders on every chunk, so markdown is
re-parsed as a reply arrives. Measured on a 3KB reply:

| | per parse |
|---|---|
| no highlighting | 11.5 ms |
| highlighting + autodetect | 54.2 ms |
| highlighting, no autodetect | 39.3 ms |

Two fixes followed: highlighting is skipped **while streaming** and applied once
the reply completes, and auto-detection is off permanently (it was the expensive
part). Deltas are also buffered and flushed every 60ms instead of committing per
token, with a tail flush so the end of a reply is never dropped.

**Bundle cost:** the app went from ~200KB to **296KB gzipped**. That is the
honest price of markdown plus highlighting, paid on the chat page where it is
the point.

## Stop, regenerate and edit

`send()`, `regenerate()` and `saveEdit()` all funnel into one `runTurn()`, so
the three paths share identical billing, error handling and abort behaviour
instead of drifting apart.

- **Stop** aborts the fetch. Whatever already streamed stays on screen — it was
  paid for, so discarding it would be throwing away the user's credits.
- **Regenerate** re-answers the last user message. It is a fresh generation and
  is charged as one.
- **Edit** replaces a user message and answers again from there, dropping the
  turns after it since they replied to a question that no longer exists. The
  editor says so before you commit.

### Stopping has to cancel the provider, not just the screen

`req.signal` is forwarded to the upstream fetch. Without it, pressing Stop would
hide the answer while OpenRouter kept generating — and billing us — for every
remaining token. Verified against a slow mock: the provider connection closes at
the moment the user stops.

### Billing a stopped reply

A cancelled stream never delivers OpenRouter's usage block, so completion tokens
are estimated from the characters actually streamed (~4 chars/token) and settled
on the way out. Leaving it at the reserve alone would let repeated
start-and-stop generations run essentially free.

The settle call lives in the stream's `finally`, not only in `cancel()`. An
abort makes `reader.read()` throw inside `start()`, so control reaches
catch/finally and `cancel()` never fires — an earlier version put it only in
`cancel()` and silently billed nothing. Measured:

    normal finish   in=100 out=200  ->  600 credits
    stopped at 59   in=1   out=87   ->  176 credits   [cancelled]

## Composer layout

The tool buttons used to sit in a row **above** the input box, which read as a
separate toolbar rather than part of the message you were writing. They now live
inside the same rounded container as the text:

    ┌──────────────────────────────────────────┐
    │  [attachment chips, if any]              │
    │  Message DeepSeek (V3)…                  │
    │  [+]  [🌐 Web search] [🔬 Research]  [↑] │
    └──────────────────────────────────────────┘

`+` opens a menu with **Attach files**, **Skills** and **Add to project** —
actions you reach for occasionally. Web search and Research stay as visible
toggles because they change what the *next* message does, so hiding their state
behind a menu would mean not knowing whether search was on.

Each menu row carries a subtitle stating what it does and, when locked, why
("Sign in to attach files"), so a disabled control explains itself instead of
just being greyed out.

`useAttachmentPicker` holds the file-reading logic. The old `AttachmentBar`
rendered both its trigger and the attachment chips; once the toolbar moved
inside the box those two pieces had to be drawn in different places, so the
behaviour moved to a hook and the composer decides where each part goes.

## Bot protection (`lib/turnstile.ts`)

Guests get free tokens plus 3 web searches a day, and a search costs us $0.005
with no revenue behind it. The only thing separating guests was an IP hash and a
**device id the browser generates itself and keeps in localStorage** — a script
can mint a fresh one per request, and rotating IPs defeats the other half.

Cloudflare Turnstile now gates the guest tier. Signed-in users are never
challenged; their account is the accountability.

**Server-side enforcement, not just hidden buttons.** The composer hides what a
tier can't use, but a hidden button is not a limit — anyone can post to
`/api/chat` directly. An audit found exactly that hole: a guest could send
images by calling the endpoint. The server now rejects image parts when the tier
doesn't allow them, and caps total request characters per tier
(`MAX_REQUEST_CHARS`). Characters are the honest checkpoint because attachments
are inlined into the message, so "a 40-page PDF" and "a very long paste" are the
same cost to us.

**The check runs before anything is spent** — before credits are reserved and
before the request reaches the provider — so a bot never costs us a call.

**One challenge, not one per message.** Turnstile tokens are single-use and
short-lived, so solving on every message would be hostile and would hammer
Cloudflare. A passing verification mints an HMAC-signed, httpOnly cookie good
for two hours. Verified: two messages produced exactly **one** verification call.

The cookie is signed server-side because an unsigned "I am human" flag is the
same as no check at all. Rejection verified for:

| Cookie | Result |
|---|---|
| Future expiry, junk signature | 403 |
| `9999999999.x` | 403 |
| Non-numeric expiry | 403 |
| No signature at all | 403 |
| Correctly signed but expired | 403, re-challenged |

**Failure modes are deliberate.** If the keys aren't set the check is skipped and
a warning is logged, so local development still works. If Cloudflare itself is
unreachable the request is allowed rather than taking the whole guest tier
offline over someone else's outage — the per-day quotas remain the real spend
ceiling. If the widget can't load in the browser (ad blocker, network filter),
the user is told that plainly and pointed at signing in, rather than being left
staring at a widget that will never appear.

Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in production.

## Design system — "Switchboard"

The site reads as a signal/switchboard idea rather than the generic
"near-black + one violet accent" AI-SaaS default: chatfreeai.com puts a dozen
frontier models behind one free chat box, so the identity leans into that
literally — many threads, one live line.

**Palette** (`app/globals.css`, `:root`) — every existing CSS variable NAME was
kept, only the values changed, so all ~40 pages re-skin automatically without
per-page edits:

| Token | Value | Role |
|---|---|---|
| `--canvas` | `#0A0A0E` (Void) | cool near-black, not flat |
| `--surface` | `#15161B` (Panel) | cards |
| `--brand` | `#FF7A33` (Signal) | the one live/action colour |
| `--mint` | `#3FCFC0` (Wire) | secondary/data accent, used sparingly |
| `--ink` | `#F3F1EA` (Paper) | warm off-white text |

Two named accents with different jobs (Signal = action, Wire = data) rather
than one bright colour doing everything, and a cool-tinted near-black rather
than flat `#000` — a deliberate step away from the generic dark-SaaS look.

**Contrast, verified with real WCAG luminance math, not eyeballed:** Signal on
Void is 7.6:1 (great for `text-brand`, used in ~25 files as eyebrows/links).
But that same orange fails white button text (2.6:1) — so rather than touch
those 25 files, `.bg-brand.text-white { color: var(--canvas) }` forces dark
text on Signal buttons. It's unlayered CSS, confirmed by inspecting the
compiled output's actual byte offsets to sit *after* `@layer utilities`
closes — unlayered rules always win over layered ones per the CSS Cascade
Layers spec, so this is a standard Tailwind v4 technique, not a hack.

**Type:** Space Grotesk Variable (`@fontsource-variable/space-grotesk` — ships
its own woff2, no external font CDN needed) for display headings, Geist for
body, Geist Mono for model IDs/credits — kept because the mono face fits an
aggregator's "engineering precision" personality.

**Signature element** (`components/SignalConverge.tsx`): every AI-aggregator
site lists model logos in a row, which names the feature without showing it.
This draws it instead — the real model names (ChatGPT, Claude, Gemini, Grok,
Deepseek, Perplexity, Meta AI, Qwen) sit on thin curved threads that converge
into one point above the hero chat box, enacting "many models, one place to
talk to them." One orchestrated load-in (threads draw, nodes fade in, the
convergence point settles into a soft pulse) rather than several competing
effects. Desktop/tablet only — fitting eight labelled threads on a phone
without clutter isn't worth forcing. `prefers-reduced-motion` disables the
draw-in and pulse; verified present in the compiled CSS.

**Honest scope:** the token system and hero got full attention this pass.
Every other page inherits the new palette/type automatically because they're
all built on the same CSS variables (verified: zero leftover hardcoded
old-palette hex anywhere in the codebase) — but only the homepage hero got a
bespoke layout treatment. No screenshots were possible in this sandbox (no
browser); verification here is build success, WCAG contrast math, and byte-level
inspection of the compiled CSS/HTML rather than a visual check — worth an eyeball
pass after deploy.

## Design system, part 2 — pricing, tools, resume gallery

Bespoke treatment beyond the inherited palette, each tied to something true
about the page rather than decoration:

**Pricing** (`components/SignalBars.tsx`) — each tier name carries a 4-bar
signal-strength indicator (Free=1 bar ... Pro Max=4). This is a justified
structural device, not arbitrary numbering: the tiers ARE a real ordered
progression, which is exactly the case the frontend-design skill allows a
marker to encode. The Resume Pass card was retinted from Signal orange to Wire
teal — a deliberate, meaningful use of the second accent, since it's genuinely
a different kind of purchase (one-off, not a subscription) and the colour
marks that at a glance. Its CTA button stays Signal orange, because orange
still means exactly one thing site-wide: click here.

**Tools grid** — Generate and Work categories now carry the same two accents
as the hero (Signal = live creative output, Wire = data/productivity) on the
category header bar, card hover border, corner dot, and the "Try it →" text.
Reusing the hero's duo here means it carries one consistent meaning across the
site instead of being a homepage-only flourish.

**Resume templates — a real bug this pass caught:** the "ATS good" badge was
using Signal orange, the same colour as every CTA button on the site. That
dilutes the accent's meaning (it should mean exactly one thing: action) and
made a passive status badge visually compete with real buttons. Fixed in both
places it was duplicated (`TemplateGallery.tsx` and `ResumeBuilder.tsx`) — the
badge is neutral now, so the only two colours that appear on ATS badges are
Wire teal (genuinely safe) and warn amber (genuinely worth a second look).

**Verification note:** raw `curl | grep` counts on Next.js App Router pages
are unreliable — the response embeds a duplicate RSC hydration payload, so
even long-untouched text like the pre-existing "Most popular" badge counts
2× despite appearing once on screen. Confirmed this against source (exactly
one `<SignalBars>` call for the free tier, one inside the 3-item `packages.map`)
rather than trusting the raw text count.

## AI Tool Submissions (`/tools/submit`)

Two lanes for listing a tool: a free FIFO queue, or paid Priority Listing with
a guaranteed turnaround. Monthly package holders get 5 free 24-hour priority
slots a month as a subscriber perk.

**Free queue ETA is computed live, never stored as a stale estimate**
(`lib/tool-submission.ts`) — position in the free-tier queue ×
`FREE_REVIEW_INTERVAL_HOURS`. That constant is calibrated so the very first
submitter into an empty queue sees exactly **44 days 22 hours** — deliberately
slow. The original calibration (3 reviews/day) gave a first-in-line submitter
an 8-hour ETA, which quietly kills the product: nobody pays $44.99 for a
6-hour Priority Listing when free is already faster. At 44d22h, every paid
tier is a real, honest improvement instead of a rounding error. It's the one
constant to revisit once real review throughput is known. Priority submissions
are reviewed outside this queue entirely, which is the whole point of selling
priority, not a modelling shortcut.

**Pricing:** 6h $44.99 (Fastest) · 24h $32.99 (Next day) · 48h $20.99 (2 days)
· 72h $12.99 (3 days) — one-off PayPal Orders API payments per submission, not
subscriptions (`createToolSubmissionOrder`/`captureToolSubmissionOrder` in
`lib/paypal.ts`).

**The monthly perk** (`lib/submission-access.ts`) is gated by `session.packageId`
being a real paid package — never by anything the client claims — and metered
with the same `charge()` primitive used everywhere else in the app, keyed to
the user's billing period so it resets exactly when their other limits do.

**Payment integrity, tested end-to-end against mock PayPal + Supabase servers:**
- A submission row is created as `awaiting_payment` BEFORE the PayPal redirect,
  so the filled-in form survives the round trip — the alternative (losing the
  draft while the user is off at PayPal) is a bad experience for a real cost.
- Capture is driven entirely by what PayPal's response reports (submission id
  via `custom_id`, amount actually paid), never by anything the browser sends.
- **Ownership check**: capturing an order for a submission that isn't yours is
  rejected (403) even with a technically-valid orderId — verified live with a
  second account attempting to capture the first account's order.
- **Amount check**: the captured amount must match the submission's actual
  tier price, independent of what was requested.
- **Idempotent**: capturing the same order twice (double-click, back-button)
  returns success both times without reactivating or double-processing —
  verified live.
- **Perk refund on failure**: if reserving a monthly free-priority slot
  succeeds but the database write fails afterward, the slot is given back —
  verified live (5/5 remaining → attempted submission fails → still 5/5, not
  4/5 lost to a transient error).

**Abuse ceilings**, generous rather than tight: max 3 pending free submissions
and 10 pending total (any tier) per account — high enough that no legitimate
user ever notices, there only to stop one account flooding the queue.

Requires sign-in for every tier (including free) — ties abuse prevention to an
account and lets a submitter track their own listings' status.

**Not built this pass:** a moderation UI. Approving a submission (flipping
`status` to `live` or `rejected`) is a service-role-only write with no client
path yet — review the `tool_submissions` table directly in the Supabase
dashboard for now, or ask for an admin page in a follow-up.

## Admin panel (`/admin`)

WordPress-style admin, layered on the SAME account system every visitor
already uses (magic link / password / Google) — there's no separate admin
login. `profiles.is_admin` is the flag, and it's never client-writable (no
RLS insert/update policy touches it): the first admin is set once, directly
in the database —

    update public.profiles set is_admin = true where email = 'you@example.com';

**Gated twice, independently.** `app/admin/layout.tsx` blocks every admin
*page* server-side, checked fresh on every request; `requireAdmin()` blocks
every `/api/admin/*` *route* independently, so the API is never protected only
by the page-level check being absent from a client's request. A signed-in
non-admin hitting a page is bounced to `/` (not a 404 — that would confirm an
`/admin` section exists at all); hitting an API route gets a 403.

Both the page gate and `Header.tsx`'s admin-link visibility share one
`isAdminPageRequest()` helper (`lib/admin.ts`) rather than three copies of the
same logic — it mirrors `lib/session.ts`'s two paths (real Supabase session,
or the DEV cookie shim's `admin=1` cookie when Supabase isn't configured), so
a page gate and an API gate can never quietly disagree about who's an admin,
and the whole panel is testable locally without a real Supabase project.

### Site settings — logo upload

`/admin/settings` uploads to a public Supabase Storage bucket
(`public-assets` — created in `supabase/schema.sql`, public read, service-role
write only) and updates `site_settings.logo_url`. `Header.tsx` reads it fresh
on every request (no caching) with a graceful fallback to the original text
wordmark, so a change is live on the next page load and the header never
breaks if nothing's been uploaded yet.

### API keys — rotate without a redeploy

**The actual point of this module, verified live, not just built:** an admin
rotates the OpenRouter key in `/admin/api-keys`, and the very next chat
request uses it. Proved with a mock upstream that echoes back the
`Authorization` header it received — confirmed `Bearer sk-DB-ROTATED-...`
reached the request, not the stale environment variable.

`managed_secrets` (`lib/secrets.ts`) has **zero RLS policies**, which means
Postgres RLS default-denies every client request against it, admin sessions
included — only the service-role key (server-only, never shipped to the
browser) can read it. The admin UI itself never receives a real value, only a
last-4-characters preview computed server-side (`maskedSecrets()`); rotating
a key is write-only from the browser's point of view. `getSecret()` checks
the DB first and falls back to the matching environment variable, so nothing
breaks before the panel has been touched — wired into the two places that
matter most: the chat route's OpenRouter key and `lib/paypal.ts`'s PayPal
client id/secret (`paypalConfigured()` became async to check both sources).

### Blog CMS

`blog_posts` replaces the hardcoded array that used to live in `lib/data.ts`
— full create/edit/publish/delete at `/admin/blog`, drafts hidden from the
public site until published (RLS: public `select` only where
`status = 'published'`). The 3 original posts are migrated via a seed insert
in `supabase/schema.sql` so nothing is lost — their bodies were never written
(the old detail page rendered literal placeholder text), seeded as drafts to
finish in the CMS rather than as finished articles.

Public `/blog` and `/blog/[slug]` (`lib/blog.ts`) read from Supabase first,
falling back to the original static array only when the query result is
`null` — genuinely unreachable or unconfigured — never when it's a real empty
array, so a site with zero published posts shows an honest empty state
instead of silently resurrecting stale hardcoded content.

**A real bug this surfaced:** `serviceQuery()`'s shared DELETE path called
`res.json()` on every response regardless of body — a successful DELETE
returns `204 No Content` with no body, and `res.json()` throws on empty
input, silently caught and returned as `null`, indistinguishable from a real
failure. The blog delete route would have reported "failed" on its very first
successful delete. Fixed at the shared `lib/supabase/server.ts` level (empty
body → truthy sentinel) rather than papering over it in the one caller, since
any future DELETE route would have hit the same bug.

Verified end-to-end against a mock Postgrest server: create draft → appears
in the admin list → publish → appears on the public `/blog` and renders real
Markdown content at `/blog/[slug]` → delete → confirmed gone (200, not a
false 500) → confirmed absent from a fresh list.

## Admin panel security — a follow-up audit

Asked directly "is this actually safe" after the admin panel shipped. Rather
than just reassure, checked three concrete things and fixed two real gaps.

**CSRF — checked, genuinely fine.** Supabase's SSR auth cookie defaults to
`sameSite: "lax"` (confirmed from `@supabase/ssr`'s own source, not assumed).
Lax cookies aren't sent on cross-site POST/PATCH/DELETE, so a forged
cross-origin request to `/api/admin/*` won't carry the admin's session.

**Gap 1 — the dev cookie shim had no production guard, and this is the one
that mattered most.** `lib/session.ts`'s general auth shim (used for
spoofing a package/plan locally without Supabase configured) already
warns-and-*allows* in production — a deliberate, documented tradeoff for a
lower-stakes feature. The admin check copied that same shim path but with
**no warning at all**, and admin's blast radius is categorically worse: a
misconfigured production deploy (Supabase env vars simply missing) would let
anyone who sets a cookie `admin=1` rotate API keys, delete every blog post,
and change the site logo — silently, with nothing in the logs.

Fixed by making the admin-specific check strictly *stricter* than the general
one: in production, if Supabase isn't configured, admin access is refused
outright (not shimmed), with a loud `console.error`. Verified live —

    production + admin=1 cookie  -> 307 redirect (page), 403 (API)  [refused]
    next dev    + admin=1 cookie -> 200 (page)                      [still works]

so local testability is unaffected; only a real, misconfigured production
deploy is affected, and it now fails closed instead of failing open.

**Gap 2 — SVG was an accepted logo format.** An SVG can carry `<script>`, and
Supabase Storage serves the upload from a public URL. Embedding it via
`<img>` (the only way this codebase uses it) doesn't execute that script, but
a browser *navigated directly* to the raw storage URL would — so an admin
account handling an untrusted image, or a compromised admin session, could
plant a script hosted on the site's own domain and share that link. Fixed by
restricting logo uploads to PNG/JPEG/WebP only — no real loss of
functionality, since SVG wasn't required for "upload a logo." Verified live:
an SVG with an embedded `<script>` is rejected (400 `bad_file_type`) before
it reaches storage; a real PNG passes the same check.

**Not changed, and worth knowing:** admin sessions use the same auth as
everyone else, with no additional step-up check (like re-entering a password)
before a sensitive action like rotating a key — if an admin's session is
ever hijacked via XSS elsewhere on the site, the attacker has full admin
access for as long as that session is valid. `managed_secrets` records
`updated_by`, but `blog_posts`/`site_settings` don't track *who* made a given
change beyond `updated_at` — fine for a single admin, worth adding if there
are ever several. Neither was in scope for this pass; flagging both plainly
rather than letting a security answer imply more was checked than was.

## Second security pass — asked to recheck for anything remaining

Two more real, fixable gaps found. Both concrete, both verified live.

**Gap 3 — the logo upload trusted the request's declared Content-Type, which
is entirely client-controlled.** `curl -F "file=@x;type=image/png"` proves any
bytes can claim any type — the earlier SVG fix removed one dangerous format
from the allow-list, but never checked that a file actually WAS what it
claimed to be. Fixed with real magic-byte detection (`lib/file-signature.ts`):
the file's own header bytes decide PNG/JPEG/WebP, not the request. Verified
live —

    <script>...</script> labelled image/png  -> rejected (bad_file_type)
    a real PNG labelled text/plain           -> accepted (content, not label, decides)

**Gap 4 — several routes built PostgREST query strings by interpolating a
dynamic value (an id, a slug, `session.userId`) directly, unescaped, into the
URL.** `blog_posts?id=eq.${id}` looks safe until that value can contain `&` —
then it stops being one filter and becomes as many query parameters as the
value contains. The one place this was already caught (`lib/blog.ts`,
public-facing) used `encodeURIComponent()`; a dozen admin and account routes
didn't. Demonstrated directly:

    unescaped: profiles?id=eq.abc123&status=active&package_id=promax
               -> three separate, attacker-supplied filters
    encoded:   profiles?id=eq.abc123%26status%3Dactive%26package_id%3Dpromax
               -> one opaque value, matches nothing

Fixed everywhere this pattern appeared — the admin blog routes, `lib/admin.ts`
and `lib/session.ts`'s profile lookups, both account routes, the tool
submission routes, and the PayPal webhook handler. The blog `[id]` route
turned out to already have a stricter, pre-existing UUID-format check
(`isValidId()`) that independently blocks this exact class of payload for
that specific route — the encoding fix there is now genuinely
belt-and-suspenders. For the others (notably `session.userId` in the DEV
cookie shim path, which is a raw, unvalidated cookie value with no format
check anywhere), the encoding fix is the only protection layer, not a
redundant one.

Practical severity note, stated plainly rather than oversold: PostgREST ANDs
multiple filters together, so an injected extra filter narrows a match rather
than broadening it — today's specific endpoints likely weren't exploitable to
leak or affect *more* than intended through this specific class of payload.
That's a property of today's query shapes, not a reason to leave the
injection primitive in place; it's cheap, standard, and correct to close it
regardless of which endpoints currently happen to be safe by luck of their
filter combination.

## Site icon and branding consistency

Asked for a site icon; the real gap was that no favicon existed at all — the
default `app/favicon.ico` was create-next-app's stock Next.js logo, never
replaced. Added, code-only, reusing the "Switchboard" design system and the
same `ImageResponse` technique already used for the OG image:

- `app/icon.tsx` (32×32), `app/apple-icon.tsx` (180×180) — an admin-uploaded
  logo if one exists, else the generated "first letter on Signal orange" mark.
- `app/manifest.ts` — PWA "Add to Home Screen" support, reflecting the
  admin-set site name and tagline.
- `viewport.themeColor` (`#0A0A0E`) on the root layout — colours the mobile
  browser's own chrome to match the design instead of leaving it default white.

All of this reads from one new shared module, `lib/branding.ts`, which
`Header.tsx`, `Footer.tsx`, `icon.tsx`, `apple-icon.tsx` and `manifest.ts` all
call — a logo uploaded once in `/admin/settings` now appears everywhere the
site's identity is shown, not just the header.

**Two real bugs found while wiring this up, both fixed and verified live:**

**1. Static generation froze branding at build time.** `icon.tsx`,
`apple-icon.tsx` and `manifest.ts` were being statically generated once at
`next build` — so whatever `site_settings` said *at build time* got baked in
permanently, and a later logo change from `/admin/settings` never showed up
without a full rebuild. Same root cause, once discovered, turned out to
affect the entire site: `Header`/`Footer` sit in the root layout, so **every**
page silently froze its branding fetch at build time too.

Tried ISR (`revalidate = 60`, matching the pattern the blog pages already use)
first, but its background-regeneration timing in a self-hosted `next start`
process (as opposed to Vercel's platform) couldn't be pinned down with
confidence — requests well past the 60-second window kept serving the
build-time snapshot in testing. Given the entire point of the admin panel is
that a change is genuinely, predictably live, `export const dynamic =
"force-dynamic"` on the root layout was the honest fix: every page now trades
some static-generation performance for a guaranteed "reflects the database on
the very next request" — the same trade already made for `/admin/*` itself.
Verified by removing it and rebuilding (homepage reverted to fully static,
branding reverted to the frozen snapshot) and re-adding it (branding correctly
live again) — so the fix is confirmed necessary, not just present.

**2. `Footer.tsx` had its own, completely disconnected hardcoded brand mark**
— a second "C" badge and "Chat Free AI" wordmark, never wired to
`site_settings` at all, sitting right next to a `Header` that *was* correctly
wired. An admin uploading a new logo would see it in the header and then see
the old default sitting a few hundred pixels below in the footer. Wired to the
same `lib/branding.ts` source; the copyright line now reads the site name too.

**A methodology note worth being honest about:** debugging step 1 above
initially looked like Header was broken, based on `grep`-ing the whole HTML
document for the old default text. That was the wrong test — the match was
coming from the page's `<title>` tag and JSON-LD (deliberately still
hardcoded, see below) and, unknowingly at the time, that exact
disconnected `Footer`. Re-tested against the *specific* header element once
that was clear, which is what actually surfaced both real bugs above instead
of chasing a phantom one.

**Deliberately left alone:** the `<title>` tag, Open Graph headline, and
JSON-LD `name` fields on the homepage still say "Chat Free AI" as hardcoded
text, not reading from `site_settings`. That's not an oversight — the title
and OG copy were carefully keyword-tuned against real Search Console data in
an earlier pass (see the SEO section above), and letting an admin's arbitrary
site-name edit silently rewrite that tested copy risks quietly regressing it.
If admin-editable SEO title/description turns out to be wanted, it should be
its own deliberate field in `/admin/settings`, not an implicit side effect of
renaming the site.

## Admin-controlled limits & pricing (`/admin/limits`)

Asked for admin control over limits — the real risk with this specific
feature isn't a security bug, it's an *accidental self-inflicted loss*: this
is the one admin panel screen that can quietly make every purchase of a
package lose money if a number is fat-fingered. Scoped narrowly on purpose
(credits + price for the 3 paid packages, plus the guest/free daily
allowances) rather than trying to make every scattered limit in the codebase
admin-editable — pricing is the highest-value, most bounded lever, and every
other limit (attachment sizes, per-feature daily caps, output token limits)
stays where it already lived.

**The safety mechanism, not just a UI:** `lib/margin.ts` reuses the exact
formula `scripts/audit-margins.mjs` already uses to prove no catalogue price
can lose money — verified numerically against that script's own documented
numbers (Starter/Pro/Pro Max profit within a cent). A save computes
worst-case profit (a subscriber spends every credit on the single most
expensive thing on the site) and is **refused outright** — 409, not a
warning — if that number is ≤ $0. Verified live:

    500M credits @ $14.99  -> 409 refused, "a loss of $52.21 per purchase"
    500M credits @ $75.00  -> 200 accepted, profit $6.06

The client-side panel mirrors the same formula so the admin sees the profit
preview update as they type, before the real (server-enforced) check — but
the enforcement lives entirely server-side; the client preview is UX, not the
safety boundary.

**Six call sites had to change, not the one I found first.** A narrow search
for the quota-check pattern found 5 (chat, image, video, audio, tool routes).
A broader sweep of every `packageById()` call site turned up a 6th that would
otherwise have been silently wrong: `account/subscription/route.ts` uses a
package's price to actually create the PayPal subscription. Without fixing
that one too, an admin's price change would grant the *new* credit amount
while still charging the *old* price via PayPal — quietly mismatched billing.
`ensurePlanId()` already handles a changed price correctly (PayPal plans are
effectively immutable per-price, and it creates/finds the matching one), so
the fix was simply reading the effective price before calling it, not
touching PayPal integration logic.

Public `/pricing` reads the same effective values — an admin's change is
visible to visitors immediately, not just enforced silently server-side,
since showing a stale price would be actively misleading.

**Verified end-to-end against a mock Postgrest server:** non-admin blocked →
losing combination refused with the exact numbers in the message → safe
combination accepted → pricing page reflects the override → revert restores
the exact hardcoded default (65,000,000 / $14.99, unchanged) → full site
regression clean, including the two admin routes correctly redirecting
(307) rather than being reachable without a session.

## Legacy-subscriber protection for `/admin/limits`

Follow-up to the limits feature above, after working through exactly what
"safe" needed to mean: the original margin check validated only the new
price/credits combination being saved — but PayPal subscription plans lock a
subscriber to the price they signed up at (`ensurePlanId` creates a *new*
plan per price rather than altering existing ones), while credits are read
fresh on every quota check with no such lock. Raising credits without
checking against *every* price the package has ever been sold at would
silently hand the new, larger allowance to subscribers still on an older,
cheaper legacy plan — a combination the original check never saw.

**`plan_limit_history`** now records every price a package has ever had — the
original hardcoded default plus every subsequent admin change — and
`computeMarginAgainstHistory()` (`lib/margin.ts`) checks new credits against
the *worst* of all of them, not just the one being typed in right now.

**Proven with the exact scenario that would have slipped through the
price-only check:** raise a package's price from $14.99 to $20 first (safe,
big margin — and this records $14.99 into history as the price being
replaced). Then try 120M credits at that new $20 price:

    price-only check:    120M @ $20    -> profit $3.17  (would have been ACCEPTED)
    history-aware check: 120M @ $14.99 -> profit -$1.70 (correctly REFUSED)

Refused with a message naming the actual problem: *"a subscriber still on
this package's original price of $14.99 would get 120,000,000 credits for
that price — worst-case cost is $16.69, a loss of $1.70 per purchase."* A
genuinely safe change (credits raised enough to still clear the legacy floor
too) was verified to still go through normally — this doesn't block raising
credits, only raising them past what every price the package has ever had can
support.

The admin panel's live preview reflects the same historical floor, so what
the admin sees while typing matches what the server will actually enforce —
no client-side "looks safe" followed by a surprise server refusal.

## Blog editor toolbar + AI Assistant

Asked for the admin blog editor to look more like a real editor — Bold,
Italic, lists, quote, link, alignment-style buttons, and an AI "Assistant"
button, matching a WordPress/TinyMCE-style toolbar.

**Stayed Markdown underneath, not a switch to HTML.** Blog content is stored
and rendered as Markdown — the exact same pipeline (`components/chat/Markdown.tsx`)
already built, tested, and live for both chat and the public `/blog` pages.
Switching to a true WYSIWYG editor would mean either changing that storage
format (touching an already-working public rendering pipeline) or pulling in
a Markdown-aware rich-text library. Instead, `MarkdownToolbar` buttons
wrap/insert the right Markdown syntax at the cursor (bold wraps `**selection**`,
a list button prefixes every selected line with `- `, etc.), and a
Write/Preview tab renders the result through that same `Markdown` component —
so what the admin sees on Preview is exactly what a visitor will see, using
code that's already proven correct rather than a second rendering path to keep
in sync.

**✨ Assistant** (`/api/admin/blog/assist`) sends the current selection (or
the whole post, if nothing's selected) to the site's AI model — the same
admin-rotatable OpenRouter key from `/admin/api-keys` — with one of five
actions: improve writing, fix grammar, make shorter, make longer, continue
writing. No credit metering, unlike every public-facing AI feature elsewhere
in the app: this endpoint is reachable only by an authenticated admin (the
same `requireAdmin` gate every other `/api/admin/*` route uses), so there's no
per-visitor quota to protect — the admin gate itself, plus input/output size
caps, is the safeguard against runaway cost.

**A real bug this caught:** the assist route's `X-Title` header used an
em-dash ("Chat Free AI — Blog Assistant") — invalid in an HTTP header, which
must be ByteString/Latin-1, not arbitrary Unicode. Every request failed with
a cryptic `TypeError: Cannot convert argument to a ByteString`. Checked every
other route setting the same header (chat, image, video, audio, tool, resume
assist) — all of them use plain "Chat Free AI" with no em-dash, so this was
isolated to the one new route, not a wider regression. Fixed by using a plain
hyphen.

Verified live: admin can run all five actions and get a result back; a
non-admin gets 403; an unknown action or empty/oversized input is rejected
before anything reaches the AI call.

## True WYSIWYG for the blog editor

Follow-up after seeing the previous toolbar in action: clicking Bold or H2
inserted literal `**text**` / `## ` characters into the textarea — correct
Markdown, but not what "rich editor" means. Replaced with a genuine
WYSIWYG editor (TipTap): bold text looks bold while typing, a heading looks
like a heading, no raw syntax characters ever visible.

**Still Markdown underneath — this is a bridge, not a rewrite.** Blog content
is still stored and publicly rendered as Markdown, through the exact same
`components/chat/Markdown.tsx` pipeline already live for chat and `/blog`.
`tiptap-markdown` is what makes that possible: it parses Markdown into
TipTap's rich document on load and serializes back to a Markdown string on
every edit (`storage.markdown.getMarkdown()`) — the editor's internal
representation is rich nodes while the admin is typing, but what reaches the
database is the same plain Markdown text as before. The save API, the public
rendering pipeline, and the Assistant (which still sends/receives Markdown
text) are all unchanged.

Toolbar buttons now call real editor commands (`toggleBold()`,
`toggleHeading()`, etc.) instead of inserting text, and show which formatting
is active at the cursor (a highlighted "B" when the selection is already
bold). The Assistant's selection-awareness moved from textarea
`selectionStart`/`selectionEnd` to TipTap's own selection state
(`editor.state.selection`), and applies its result back through
`insertContentAt`/`setContent` — parsed as Markdown, not dropped in as plain
text, so an AI-rewritten paragraph still renders with real formatting rather
than literal asterisks.

Preview stayed as a separate tab (not merged away just because editing is now
WYSIWYG) — it's still useful as a ground-truth check: TipTap has its own
rendering, `Markdown.tsx` has its own, and Preview confirms they agree on
something as subtle as code block syntax highlighting or link styling, not
just "does this look roughly right while editing."

**Honest limitation:** this sandbox has no real browser, so actual
click-and-type interaction (does Bold really toggle, does the cursor land in
the right place after AI-replaces-selection) couldn't be exercised the way
API routes could. What was verified: the build type-checks cleanly, the full
site regression is clean, and the edit page — with real Markdown content
including a heading, bold/italic text, a list, and a blockquote — server-
renders without error (200, no error markers) and correctly shows TipTap's
`immediatelyRender: false` loading fallback in the SSR output, which is the
expected, documented way to avoid a TipTap+Next.js hydration mismatch, not a
bug. Worth a manual click-through after deploying.

## Pricing audit — making sure every price is actually admin-adjustable

Asked to check whether *every* price on the site was covered, not just
packages. It wasn't: Resume Pass ($2.99) and the 4 Priority Listing tiers
($44.99/$32.99/$20.99/$12.99) were still hardcoded, completely outside the
admin panel.

**Resume Pass** joined the same margin-checked system as packages
(`lib/plan-limits.ts`'s `resume_pass` id), but with its own cost formula —
it's metered in AI-assist *calls*, not credits (see the earlier
`RESUME_ASSIST_COST_PER_CALL` work), so reusing the credits-based
`computeMargin()` would have been quietly wrong. Wired into every real
consumption point: the actual PayPal order amount, the capture verification,
the live daily-assist quota enforcement, and every page that displays the
price (account page, resume builder, pricing page).

**A real, pre-existing bug this surfaced:** `lib/resume-access.ts` had `pass:
300` as a *second*, independently hardcoded constant — completely
disconnected from `RESUME_PASS.aiAssistDaily` in `lib/resume-pass.ts`. The two
could already drift apart before either was admin-adjustable; making the pass
cap admin-facing was the forcing function to fix it instead of teaching a
third place the same number. Also found and fixed: a pricing-page bug that
substituted the wrong constant entirely (chat credits instead of the actual
resume-builder free-tier cap) while wiring the dynamic feature text — caught
because the two numbers looked plausible next to each other but weren't the
same thing.

**Priority Listing tiers** got their own admin section (`lib/priority-pricing.ts`,
`/admin/priority-pricing`) — deliberately *not* folded into the margin-checked
system, since paying for priority grants no metered resource at all (it just
skips the free queue), so there's no "worst-case spend" to validate a price
against. The safeguard there is simpler: a real, positive number.

**A genuine architectural bug, found by testing "set a price, read it back
immediately"** rather than trusting the code by inspection: `lib/plan-limits.ts`
and `lib/priority-pricing.ts` both cached reads in memory for 30 seconds.
`invalidatePlanLimitsCache()` only clears the *current process's* memory — in
any real multi-instance deployment (serverless functions, several server
processes), a write handled by one instance and a read handled by a different
one would still see the stale cached value, since the invalidation call never
reaches that other instance. Confirmed this wasn't theoretical: a direct query
against the database showed the new price was really there while the API's
own GET still returned the old one.

Fixed with two different approaches depending on call frequency:
`effectiveCredits()` (hit on every chat/image/video/audio/tool-run request
site-wide) keeps its cache — a brief window of eventual consistency on a
credit *limit* is an honest, reasonable trade against adding a database
round-trip to the hottest path in the app. Admin-facing reads and priority
pricing (both far lower frequency) now skip the cache entirely, since there's
no real cost to always being exactly right there.

**A second bug, initially mistaken for the same caching issue:** after fixing
the above, Resume Pass's admin GET *still* showed a stale price. Direct
database verification ruled caching out this time — the write was really
there. The actual cause was different and more interesting: the endpoint
computes the worst-case profit against `historicalPrices` (see the earlier
legacy-subscriber protection work), and that computation's result object
carries its own `price` field — deliberately the *worst-case* price being
checked against, not necessarily the real current one. Spreading that result
directly into the response silently overwrote the real price with the
worst-case one. Packages don't hit this, because their non-history preview
computation is run against the actual price directly. Fixed by explicitly
restoring the real price after the spread, while deliberately keeping
`allInCost`/`profit`/`safe` as the worst-case figures — genuinely useful
information ("if a legacy subscriber applies, here's your real profit"), just
no longer clobbering the price field next to it.

Both fixes verified live, in sequence, against the same running server: write
a price, read it back immediately, get the real value — for Resume Pass, for
Priority Listing, and via the public-facing endpoints a real visitor would
hit, not just the admin ones.

## Full recheck pass — asked to audit everything again for real bugs

Asked to check and recheck the whole build once more before calling it done.
Went methodically: fresh dependency install, `npm audit`, a search for the
same bug *class* that hit Resume Pass earlier, admin-gating consistency
across every route, a codebase-wide search for any price still hardcoded
outside the admin panel, and a full lint pass. Found and fixed real things at
every step rather than stopping at "the build passes."

**Dependency CVEs — production-relevant, not just dev tooling.** A fresh
install surfaced 12 high-severity advisories. Sorted by what actually matters:
Next.js itself had several (SSRF via server actions, cache confusion,
unauthenticated disclosure of internal server-function endpoints) — fixed
with a same-major patch bump (16.2.10 → 16.2.11, not a breaking change).
`sharp` and `postcss` were vulnerable *transitive* dependencies Next bundles
internally, each pinned by Next below the patched version — fixed via
`package.json`'s `overrides` field (the standard way to patch a transitive
dependency without waiting for the parent to release), verified the build
still compiles and the CSS output is byte-identical in the tokens that
matter. Left the remaining ~10 advisories alone: they're entirely in the
`eslint`/`eslint-config-next` dev-tooling chain, never shipped to production,
and the available fix is a breaking eslint major-version bump — not a
sensible trade for a linter's own supply chain. `npm audit --omit=dev`: **0
vulnerabilities.**

**A second critical money bug, found by hunting the same bug class again.**
The Resume Pass field-clobbering bug earlier in this file was one instance of
"a cache or computed value doesn't account for a value that's now
admin-adjustable." Searched for the same *shape* of problem elsewhere and
found a real one: `lib/paypal.ts`'s `ensurePlanId()` cached the PayPal plan id
by **package id alone**, not package id + price. PayPal plans are genuinely
different objects per price (confirmed: `planName()` already correctly
encodes price into the plan's name) — but the cache short-circuited past that
correct logic entirely. Concretely: subscriber A signs up for Starter at
$14.99 (cached). Admin raises the price to $24.99 through `/admin/limits`
(margin-checked, accepted). Subscriber B signs up — and would have silently
been placed on subscriber A's **cached $14.99 plan**, undercutting every
margin-safety guarantee this whole system exists for, invisibly, with no
error anywhere.

This predates the admin panel entirely — it's always been *possible*, just
never *exercised*, because the price never actually changed before there was
a way to change it. Verified live against a mock PayPal: subscriber A creates
`PLAN1` at $14.99, the admin price change happens, subscriber B correctly
creates a **new** `PLAN2` at $24.99 — confirmed by the actual plan-creation
calls hitting the mock, not just the API's own response.

**Admin gating, checked exhaustively rather than by memory:** every exported
HTTP method (`GET`/`POST`/`PATCH`/`DELETE`) across all 7 `/api/admin/*` route
files individually confirmed to call `requireAdmin()` — the one exception
(`settings` route's `GET`) is deliberate, since site branding is meant to be
publicly readable. Every `/admin/*` page confirmed to route through the single
`app/admin/layout.tsx` gate, with no competing layout that could bypass it.

**A codebase-wide sweep for any other hardcoded price** turned up nothing
missed — every remaining `$` figure in `lib/` is cost-model documentation
(what the AI *provider* charges, tracked live via `price-oracle.ts`, never
something a business owner sets) rather than a price the site charges.

**Lint, run project-wide rather than only against recently-touched files:**
found and fixed 3 real issues in `app/pricing/page.tsx` (plain `<a>` tags for
internal navigation instead of `<Link>`, meaning those 3 links triggered full
page reloads instead of Next's client-side navigation) — pre-existing, from
before this session, but a real, easy, worthwhile fix. Also surfaced ~40
pre-existing findings concentrated in `components/resume/TemplateRenderer.tsx`
and a few other files from much earlier in this project, mostly a newer,
stricter React hooks lint rule (`react-hooks/static-components`,
`react-hooks/set-state-in-effect`) flagging patterns that are functionally
correct and used consistently throughout the codebase — not bugs, a
code-style preference. Deliberately not refactored in this pass: fixing ~20
occurrences in unfamiliar legacy code carries real risk of introducing an
actual bug while chasing lint purity on something that isn't dangerous.
Flagging this honestly as a known, low-priority cleanup item rather than
either hiding it or over-fixing it under time pressure.

Full regression (every public route, every admin route's redirect gate, the
margin audit script, `npm audit`) run clean after every fix in this pass, not
just at the end.

## Pricing page — Pro/Pro Max looked worse than Starter, and misleading model names

Two real problems, both visible directly in screenshots of the live page.

**Pro's card looked sparser than the cheaper Starter tier below it.** Starter
listed 10 explicit checkmarks; Pro compressed most of that into one line,
"Everything in Starter," plus 4 of its own — visually landing at 6 items
against Starter's 10. For an upsell tier (Pro is marked "Most popular"),
looking *less* loaded than the cheaper option undermines the entire point of
showing it. Pro Max had the same problem one level up ("Everything in Pro").

Fixed by making each package's feature list fully self-contained rather than
compressing into "Everything in X" — Pro now explicitly lists all of
Starter's items (with its own upgraded numbers where they differ, e.g. 4,000
token replies instead of 2,000) plus its own additions, and Pro Max does the
same one level further. Counts now correctly escalate: Starter 10, Pro 13,
Pro Max 15 — verified against the actual rendered page, not just the source
array (checkmark SVGs counted directly in the served HTML). Every added line
matches the package's real backend limits (`concurrency`, `historyMessages`
from `lib/packages.ts`), not invented copy — Pro Max's "10 chats at once"
matches its real `concurrency: 10`, its "100 messages" matches
`historyMessages: 100`, both checked directly against the object doing the
actual enforcement.

**The credit-equivalent box named one specific model as if it were the only
one included.** "≈ 20 videos (8s, Veo 3.1 Lite)" reads like Veo 3.1 Lite is
what you get — every package actually unlocks all 8 video and 9 image models,
Veo 3.1 Lite is just the cheapest one used to compute a best-case "how far
this stretches" number. Removed the model name from that box for all three
packages (it's one shared code path, so the fix applies everywhere at once,
verified: 0 remaining occurrences of the old text). Left the *separate*,
detailed budget-vs-premium comparison table further down the page exactly as
it was — model names are exactly right there, since that table's whole point
is naming and comparing specific models row by row; only the compact card
summary was misleading.

**A small pre-existing gap fixed in the same area:** the box's header always
had a dangling `*` with no footnote anywhere on the page explaining what it
meant — more noticeable now that the model name that used to hint at "this is
the efficient option" is gone. Added one: "Based on the most credit-efficient
model in each category... Full breakdown below," pointing at the detailed
table, so the asterisk now means something and the two sections read as one
coherent story instead of a summary that doesn't explain itself.

## SEO re-audit — "is SEO actually still good?"

Asked directly whether the SEO work was still solid. Given how much has
changed since the original SEO pass (blog went from a static array to a
database, the whole admin panel was built, the pricing page was rewritten
today), the honest answer required actually re-checking rather than assuming
the earlier work was untouched. It wasn't — two real, concrete gaps had
opened up since.

**`sitemap.xml` still imported the static blog `posts` array**, frozen at
whatever `lib/data.ts` contained — from before the blog became DB-driven. A
post published later through `/admin/blog` would never get a sitemap entry
at all (undiscoverable except through internal links), and the reverse: if a
post were ever unpublished or deleted, its URL would stay listed in the
sitemap indefinitely, pointing search engines at something that no longer
resolves. Fixed by making `sitemap()` async and calling
`listPublishedPosts()` — the same DB-first function the public `/blog` pages
already use, so the sitemap can never disagree with what's actually live.

**`robots.ts` didn't disallow `/admin` at all.** The admin pages already carry
their own `noindex, nofollow` meta tag, but that only deindexes *after* a
crawl — `robots.txt`-level disallow is the earlier, stronger signal that
stops a crawl before it happens, and it was simply missing. Added `/admin`
to the disallow list alongside the existing `/api/`, `/account`, `/auth/`.

**A genuine "does the fix actually work" test, not just a code read,
surfaced a third issue while verifying the first two.** Publishing a post
and immediately checking the sitemap worked correctly on the first test — but
checking the *blog list page itself* right after publishing showed the new
post not appearing at all. Both `/blog` and `/blog/[slug]` had
`export const revalidate = 60`, and — same root cause as the Header/Footer
branding staleness found earlier — the route being *dynamically rendered*
(confirmed `ƒ` in the build output, inherited from the root layout's
`force-dynamic`) turned out not to guarantee the underlying data fetch was
actually fresh. Fixed with the same already-validated remedy: `force-dynamic`
stated directly on both blog routes rather than relying on an inherited
property from the parent layout. This also made `generateStaticParams()`
on the detail page meaningless (nothing to pre-render once nothing is ever
statically generated) — removed it and its now-unused `staticFallbackSlugs()`
helper rather than leave dead code that looks like it still does something.

One methodology note from testing this: `npm run start` always runs in
production mode (a fact this whole project has run into repeatedly), and the
admin dev-shim correctly *hard-refuses* there per the earlier security work —
so a first attempt at re-verifying the fix returned `forbidden` and looked
like the fix hadn't worked. It had; the test needed `next dev`, not
`next start`, to get past a gate that's supposed to be there. Re-tested
correctly: publish once, and the list page, the detail page, and the sitemap
all reflected it immediately, with no wait.

## Blog images — featured image and inline images

Asked for the missing option to add a featured image and images inside a
post. Checked what actually existed first: `cover_image_url` was already a
real column in `blog_posts`, and the admin blog API already read and wrote
it — but nothing in `lib/blog.ts` (the public data layer), the public
`/blog`/`/blog/[slug]` pages, or `BlogEditor.tsx` ever referenced it. The
backend plumbing was there; there was no way to actually use it.

**`/api/admin/blog/upload-image`** — one shared upload endpoint for both the
featured image and inline images, admin-gated, same magic-byte validation as
the site logo upload (the request's declared Content-Type is client
-controlled and proves nothing; the file's own header bytes decide the real
type). Unlike the logo's fixed `logo.png` path, every blog image gets a
random filename — a post can have many images, and there can be many posts,
so collisions matter here in a way they don't for one site-wide logo.

**Featured image** — a field in `BlogEditor.tsx` with upload/preview/remove,
wired through `lib/blog.ts`'s `BlogPost` interface end to end: shown as a
thumbnail on the `/blog` list, a hero image at the top of the post, and —
tying back into the earlier SEO/social-sharing work — overrides the
site-wide Open Graph image with the post's own when sharing that specific
link, instead of every shared post looking identical.

**Inline images** — an image button in the rich editor's toolbar
(`@tiptap/extension-image`), uploads through the same endpoint and inserts
at the cursor. Still Markdown underneath, same as every other formatting
button: an inserted image is a real `![](url)` in the stored content, so it
round-trips through save/reload and renders correctly via the exact same
`Markdown` component the public page uses — not a TipTap-only feature that
would break once the post left the editor.

**A real styling gap surfaced while building this:** `.cfai-md` (the shared
CSS class between the editable rich editor and the read-only public
renderer) had no `img` rule at all — an inserted image would have rendered
at its raw upload dimensions with no rounding or spacing, breaking the
reading flow. Added `max-width: 100%`, rounded corners, and margin, shared by
both the editor and the public page since they use the same class.

Verified live end-to-end: upload endpoint blocks non-admins and rejects
spoofed file types (a `<script>` tag labelled `image/png` correctly refused);
a post created with a cover image persists it to the database, and the
public list thumbnail, the detail page's hero image, and the per-post
`og:image` override all correctly reflect it.

## Supabase custom domains — a validator that rejected the right answer

`lib/supabase/url.ts` sanity-checks `NEXT_PUBLIC_SUPABASE_URL` against the
anon key. It used to do this by pulling the project ref out of the hostname
and refusing anything it couldn't parse:

```ts
const urlRef = projectRefFromUrl(url);
if (!urlRef) return `NEXT_PUBLIC_SUPABASE_URL doesn't look like a Supabase project URL: ${url}`;
```

That is wrong for the one configuration most worth having. Google's consent
screen shows the root domain of the OAuth callback URL, so stock Supabase Auth
makes users read "to continue to `<20 random letters>.supabase.co`" while
handing over a Google account. The supported fix is a Supabase **Custom
Domain**, after which the URL is `https://auth.chatfreeai.com` — which carries
no project ref at all, and so was reported as not looking like a Supabase URL.

A second, quieter false positive was only found by writing the case table out:
a **vanity subdomain** (`https://chatfreeai.supabase.co`) does still end in
`.supabase.co`, so the old `([a-z0-9]+)` pattern happily matched and returned
`"chatfreeai"` as the project ref. That never equals the real ref inside the
key, so a correctly configured project was reported as a *project mismatch* —
a more misleading error than the first, because it names two refs and invites
you to go "fix" working config. Project refs are always 20 lowercase letters,
so the pattern is now `([a-z]{20})`, which a vanity label won't match.

The rule now: a null ref means "can't tell from the URL", not "bad URL". The
checks that don't need the ref still run — that the value parses as an https
URL, and that the key isn't a secret key pasted into the public slot — and the
ref comparison is skipped when either side lacks one, exactly as it already
was for `sb_publishable_…` keys.

Verified against ten cases: default URL (with and without a trailing slash),
custom domain, vanity subdomain, custom domain with a new-style key, a real
project mismatch, a secret key in the public slot, a bare hostname with no
scheme, and an empty value. The three genuine errors are still caught; the
supported setups all pass.

Worth noting this was latent — `supabaseConfigProblem` has no callers today.
It was fixed anyway because the failure mode is a trap: it would have fired on
the day the custom domain was switched on, blaming the config change that was
actually correct.


## Google Analytics 4

Added on request, using the real Measurement ID given (`G-PZCSS9P5TT`).
`<Analytics />` sits in the root layout, so it covers every route.

**Correction to an earlier version of this section.** It previously said the
`@next/third-parties/google` `<GoogleAnalytics>` component "handles
client-side route-change page views automatically, no manual `usePathname`
wiring needed". That was wrong, and wrong in a way worth spelling out,
because the symptom is invisible from the code side.

That component's entire body is `gtag('js')` plus `gtag('config', gaId)`.
There is no router hook in it. It fires once, on first load. Every
subsequent link click is a soft navigation — URL changes, no reload — and
the component never hears about it.

Per-page numbers still appeared for sites using it, but they were coming
from GA4's **Enhanced Measurement > "page changes based on browser history
events"**, a checkbox in the GA4 dashboard. So page-view tracking was
resting on a setting outside the repo: switch it off and the reports quietly
fall back to landing-page hits only, while the build stays perfectly clean.
It also reads `document.title` at history-change time, which in the App
Router is often still the *previous* page's title.

`components/Analytics.tsx` now sends `page_view` from the router itself
(`usePathname` + `useSearchParams`), with `send_page_view: false` in the
gtag config so the automatic first-load hit doesn't double up — that flag is
precisely what `@next/third-parties` gives no way to set, which is why it is
hand-rolled with `next/script`, same as `components/AdSense.tsx`. Titles are
read after two animation frames so the new route's metadata has landed.

**Required GA4 dashboard change:** Admin → Data streams → the web stream →
Enhanced measurement → turn **OFF** "Page changes based on browser history
events". Leaving it on alongside this double-counts every soft navigation.
Leave the rest of Enhanced Measurement (scrolls, outbound clicks, file
downloads, site search) ON — those don't overlap with `page_view`.

Sanity check after deploying: open GA4 → Reports → Realtime, click through
three or four pages on the live site, and confirm the path count goes up by
one per click, not two and not zero.

Optional, matching every other integration in this app (`OPENROUTER_API_KEY`,
`PAYPAL_*`, Turnstile, etc.) — the site works fine with
`NEXT_PUBLIC_GA_MEASUREMENT_ID` unset, the script simply doesn't render.
The id is validated against `G-…` shape, so a half-filled value is treated
as unconfigured rather than loading a broken tag.

`NEXT_PUBLIC_GA_MEASUREMENT_ID` must NOT be marked "Sensitive" in Vercel. It
is inlined into the browser bundle at build time by definition — that is what
`NEXT_PUBLIC_` means — so the flag protects nothing and Vercel flags the
combination. Changing it also requires a redeploy **with the build cache
cleared**, since the value is baked in at build time, not read at runtime.

**Skipped in local `next dev` on purpose, even when the env var is set** —
without this, every page load while building or testing locally would report
as real traffic, quietly inflating whatever numbers an admin reads later.
Verified live, three ways: env var unset → no GA script in the rendered HTML
at all; env var set + `next start` (production) → the script renders with
the correct ID (`googletagmanager.com/gtag/js?id=G-PZCSS9P5TT` present); env
var set + `next dev` → still absent, confirming the dev-skip works
independently of whether the ID itself is configured.

`NEXT_PUBLIC_*` variables are inlined at *build* time, not read at runtime —
worth remembering when rotating the ID later: changing it needs a rebuild,
not just a restart.

## Google AdSense — scaffolding (not live yet)

Asked to build the AdSense integration with a placeholder id, since a real
`ca-pub-…` publisher id only exists after Google approves the site. This is
the plumbing, wired and tested, waiting for that id.

`@next/third-parties` has no AdSense component (checked the installed
package — it ships ga/gtm/maps/youtube only), so this is hand-rolled with
`next/script`, mirroring the GoogleAnalytics pattern already in the layout.

**Three pieces:**
- `lib/adsense.ts` — the publisher id and a `adsenseConfigured` check
- `components/AdSense.tsx` — the site-wide loader, plus a reusable `<AdSlot>`
- `app/ads.txt/route.ts` — the IAB authorised-sellers file Google requires

**"Configured" deliberately excludes the placeholder.** Any id containing
`XXXX` counts as unconfigured, so today: no ad script loads, `<AdSlot>`
renders nothing, and `/ads.txt` serves an empty body. That last one matters —
publishing an ads.txt naming a nonexistent publisher as an authorised seller
is worse than having no file at all. Dropping `<AdSlot>` into a page now is
safe: invisible today, live the moment a real id is set, no code change.

**Skipped in local `next dev` even with a real id** — same rule as GA, but
the stakes are higher here: Google treats invalid traffic as a policy
violation, and a developer refreshing their own ad-bearing pages all day is
exactly the pattern that gets accounts suspended. `/ads.txt` still serves in
dev, since a static declaration file isn't an impression.

**A real bug caught by testing rather than by the build:** `/ads.txt`
returned a 500 on first run. The constants originally lived in
`components/AdSense.tsx`, which is `"use client"` — importing them into a
server route meant the client boundary rewrote what the route received, so
`ADSENSE_CLIENT_ID` arrived as a client-reference object instead of a string
and `.replace()` threw. The build reported entirely clean; only actually
requesting the route surfaced it. Fixed by extracting the shared values into
plain `lib/adsense.ts` — values both sides need belong in a plain module,
not behind a client boundary.

Verified across all three states: placeholder id → no script, `/ads.txt` 200
with an empty body; realistic id + production → script loads with the correct
client id and `/ads.txt` emits `google.com, pub-…, DIRECT, f08c47fec0942fa0`
(the `ca-` prefix correctly stripped, as Google's format requires); realistic
id + `next dev` → no script, but `/ads.txt` still served.

**When approval comes through:** set `NEXT_PUBLIC_ADSENSE_CLIENT_ID` to the
real id and rebuild (it's a `NEXT_PUBLIC_*` var — inlined at build time, so a
restart alone won't pick it up), then replace the placeholder ids in
`AD_SLOTS` (`lib/adsense.ts`) with the real `data-ad-slot` numbers from the
AdSense dashboard. A wrong slot number doesn't error — the unit just never
fills — so check AdSense Realtime afterwards rather than assuming.

### Placement: above the chat, never inside it

One unit is placed so far: a responsive banner directly above the chat box on
the home page (`app/page.tsx`), between the hero and `<Chat />`.

It sits in the page, **outside the `<Chat />` component**, and that is the
whole point rather than an implementation detail:

- An ad among message bubbles or under the composer reads as part of the
  conversation. That is the worst possible outcome for a chat product and an
  AdSense policy problem — units have to be distinguishable from content.
- An ad next to a control the user is about to click harvests accidental
  clicks. Invalid-traffic patterns are what get accounts disabled, and the
  send button is the most-clicked element on the site.
- Keeping it outside the chat frame also means it never re-renders while
  messages stream.
- On a chat product, ads inside the interface would compete directly with the
  paid-tier upsell.

### Auto ads must stay OFF — the code cannot enforce this

Worth being exact about the limit of the guarantee above, because it is easy
to read it as stronger than it is.

In the code, ads inside the chat are impossible: `components/Chat.tsx`
contains no ad markup of any kind, and the single `<AdSlot>` in the project is
a sibling of `<Chat />` in `app/page.tsx`, not a descendant. Nothing in this
repo can put an ad among the messages or beside the send button.

That guarantee ends at the repo boundary. Since October 2019, Auto ads no
longer requires its own snippet — any page carrying an AdSense unit is
eligible, and the placement model then chooses positions on its own, the chat
interface included. So a toggle in the AdSense dashboard can override the
placement decision made here, with no code change and nothing to see in a diff.

This is the same shape of problem as the GA Enhanced Measurement setting
described above: behaviour that looks like it lives in the code actually
depends on a dashboard checkbox outside it. Both are recorded in `DEPLOY.md`
for that reason.

The stakes are higher here than "an ad in an awkward spot". An ad rendered
next to the send button collects accidental clicks, and invalid-click patterns
are the usual reason AdSense accounts get disabled.

**Do not hide auto-placed ads with CSS.** Hiding a served ad still counts the
impression while nobody can see it — a policy violation on its own. If Auto
ads must be enabled, use *Ad settings → Excluded areas* to exclude the chat
region, and recheck it whenever the home page layout changes; the durable
answer is leaving Auto ads off and using manual units only.

`<AdSlot>` reserves space per breakpoint (`minHeight={{ base, sm, lg }}`)
because a responsive unit is not one size — roughly a 100px banner on phones,
a ~90px leaderboard from `sm` up. A single fixed number would over-reserve on
one and under-reserve on the other, and an unreserved unit shifts the whole
page down when it fills, which is a Core Web Vitals (CLS) hit. `label` adds an
"Advertisement" caption — AdSense permits exactly that word or "Sponsored
Links", nothing more inviting.

Verified in the built output, both states: with no publisher id the home page
contains zero `adsbygoogle` markup (the slot returns null, so adding it changed
nothing on the live site today); with a realistic id the `<ins>` renders with
the right client/slot/format, the custom properties come through as
`--ad-h:100px; --ad-h-sm:90px`, and Tailwind emits all three `min-h-[var(…)]`
utilities including inside the `sm:` and `lg:` media queries.

## Resume builder — PDF export rewritten, plus a pass over the tool

Asked to look hard at the resume builder, fix the download problems, and make
it genuinely professional. The download issue turned out to be the serious
one, and it was worse than a rough edge.

**The export contradicted the entire product.** `lib/resume-pdf.ts` rendered
the resume with html2canvas and embedded the result as a JPEG. The "text" in
every downloaded PDF was a flat picture of text — not selectable, not
searchable, blurry in print, megabytes in size, and unreadable to any
Applicant Tracking System. Meanwhile the page title advertises "40
ATS-friendly designs", templates carry "ATS excellent" badges, the editor
shows an ATS readiness score, and the paid pass sells "ATS readiness score
with specific fixes". Every resume this tool produced would have scored zero
on the automated screen at most large employers regardless of template. The
last step silently undid the one thing the product promised.

Rewritten to draw real text with jsPDF's text API. Verified by extracting the
text back out of a generated file rather than trusting the code: **4.7KB**
(was megabytes), complete content in correct reading order, PDF 1.3, base-14
fonts, **zero embedded images**. The base-14 families are deliberate — no
embedding, universal parser support, tiny files; the exact letterforms differ
slightly from the on-screen web fonts, which is the right trade for a
document whose job is to be read by software as well as people.

**Page breaks no longer cut through text.** The old path sliced the canvas at
a fixed pixel offset, splitting words across the page boundary. Every block
now measures before drawing, and a single line is treated as indivisible.

**Added "Maximum ATS safety"** as an explicit download option: keeps the
person's chosen template by default, or flattens multi-column layouts to a
strictly linear document — the single biggest cause of parsers reading a
resume out of order. Offered as a real choice rather than silently changing
the design they picked.

**Layout coverage.** Timeline (3 templates) and two-column (2 templates) were
falling through to plain single column, so 5 of 40 templates produced a PDF
that didn't match the preview. Both now implemented and visually verified.

**A latent bug found while building that.** In sidebar layouts the main
column started wherever the sidebar finished — so a long skills list that
pushed the sidebar onto page 2 would leave page 1 containing nothing but the
sidebar, with all the actual content on page 2. Fixed by rewinding to the
starting page, and `newPage()` now reuses an existing page instead of always
appending (which is also what makes two-column flow correct).

**Photos.** Real uploads embed correctly — confirmed by rendering one. The
app's own `PHOTO_PLACEHOLDER` is an inline SVG data URL and jsPDF cannot
embed SVG, so on a photo template with no picture, `addImage` threw and the
catch swallowed it. Now checked up front so the skip is deliberate rather
than an exception that happens to be caught — and skipping is the right
output anyway: a generic grey avatar on a resume sent to an employer looks
worse than no photo.

**Dead code and stale references removed:**
- `ResumePreview.tsx` (271 lines) — superseded by `TemplateRenderer`, zero importers
- The old four-template block in `lib/resume.ts`, orphaned by the 40-template catalogue
- An ATS hint telling users to *"Use Classic or Compact"* — neither template exists any more; they were names from the removed renderer. Now points at the durable "ATS excellent" badge and the new ATS-safe export instead
- `PaperSize`/`PAPER_OPTIONS` were declared in two files and had already drifted ("Letter (US)" vs "Letter"), with the UI importing the type from one and the options from the other. Consolidated into `lib/resume-paper.ts`
- A dead conditional in `AtsPanel` where two branches returned the same class, so an intended three-tier score only ever rendered two

**`import jsPDF from "jspdf"` was wrong** — jsPDF's default export is a
namespace object, not the constructor; only the bundler's CJS interop made it
work. Switched to the named import, which is correct everywhere.

**`npm run test:resume-pdf`** now guards all of this, following the existing
`audit:margins` pattern: text really extracts, sidebar and ATS modes stay
complete, all 40 templates build, a long resume paginates without losing its
last entry, and a real photo embeds while the SVG placeholder is skipped.

### Photo size — corrected to the standard

The photo was far too large in the exported PDF: it filled the sidebar width,
roughly **57 mm**, which is over 2.5x what the on-screen preview showed
(the preview renders it at 84-96 px, about 22-25 mm) and much larger than
anything a recruiter expects on a page.

Checked the actual convention rather than picking a number: the international
standard for a CV photo is **35 x 45 mm**, a shoulders-up portrait crop. The
US equivalent is a 2 x 2 inch square, though US, UK, Canadian and Australian
resumes usually omit the photo altogether.

Set to **35 mm**, capped so it can never exceed the sidebar it sits in on
narrower sidebars or smaller paper. Applied as a square rather than the
35 x 45 portrait, and that is deliberate: this app's uploader centre-crops to
a square and the templates display it round or as a rounded square, so
forcing the 45 mm height onto a square source would stretch every face
vertically by about a third. The standard's dimension is honoured; its aspect
ratio doesn't apply to a square-cropped design.

**A second gap found while fixing this:** `drawHeader` never drew a photo at
all, so `palette` — a band layout with a centred photo — exported with no
photo while showing one in the preview. The four other photo templates are
sidebar layouts, which draw their own, so this affected exactly one template
and was easy to miss. Now handled for both the band and plain header paths,
with test coverage so it stays fixed.

### Photo shape, and removing the print option

**The exported photo was square while the preview showed a circle.** Every
photo template renders the picture with `rounded-full`, so on screen it is a
circle — but jsPDF can only place a rectangular image, so the download came
out hard-edged and didn't match what the person had approved.

Fixed by masking the photo to a circle on a canvas before it enters the PDF.
The mask is baked in rather than relying on PDF transparency: the corners are
filled with whatever sits behind the photo (the sidebar tint, or the white
page for a header photo) and flattened to JPEG. That renders identically in
every viewer, where alpha-channel PNGs are handled inconsistently by some.
If there's no DOM or anything fails, the original image is used unchanged —
a missing round-off must never cost someone their photo.

Verifying this was awkward and worth being straight about: the masking runs
on a browser canvas, which the Node test harness has no access to. So the
*outcome* was verified instead — a photo pre-masked with the identical
algorithm was pushed through the real generator, the PDF rasterised, and the
pixels sampled: all four corners match the sidebar colour exactly while the
centre holds the photo, and the width measures 35.2 mm against the 35 mm
standard. The first run of that check failed and looked like a bug, but the
cause was the test itself baking a teal backdrop into a template whose accent
is purple — a useful accident, since it demonstrates precisely the seam that
appears if the backdrop and the sidebar ever disagree. They can't: both
derive from the same `accentHex || template.accent` expression.

**Removed "Print / Save as PDF"** as requested. It was a second route to the
same goal that needed several extra clicks and a manual destination change in
the browser dialog, and it existed mainly because the old export produced an
unusable image PDF. With the direct download now emitting real text, it had
nothing left to offer. Removing it orphaned `lib/resume-print.ts` entirely,
plus `PAPER_PX` and the `pageRef` that only existed to hand the DOM to the
print iframe — all deleted rather than left behind.

**A real bug surfaced by that cleanup:** `pdfError` was being set whenever an
export failed but was never rendered anywhere in the component, so a failed
download gave the user no feedback at all — the button just returned to
normal as though nothing had happened. The lint pass flagged it as an unused
variable, which is what made it visible. Now displayed.

## Removed: admin-editable API keys

`/admin/api-keys` let an admin rotate the OpenRouter key and the PayPal
client id/secret from the browser, stored in a `managed_secrets` table that
`getSecret()` checked ahead of the environment variable. Removed on request,
and it was the right call: those three were the only secrets in the feature,
so the whole thing goes.

The reason it's worth removing rather than hardening: a hijacked admin
session could have swapped in an attacker's PayPal credentials, and from that
moment every subscription and every one-off payment would have gone to the
attacker's account. Nothing would look broken — checkout would still succeed —
so it could run for a long time before anyone noticed. The convenience it
bought was rotating a key without a deploy, which is not worth that.

Deleted: the admin page, its panel component, `/api/admin/secrets`,
`lib/secrets.ts`, and the `managed_secrets` table (the schema now carries a
`drop table` note for anyone who already ran the older version). All four
call sites read `process.env` directly again, and `paypalConfigured()` went
back to being synchronous since it no longer touches the database — its three
callers were updated to match rather than leaving a misleading `async`.

**Four dangling references were left behind by the deletion**, found by
grepping rather than assuming: the admin dashboard still had a card linking
to the removed page (a genuinely broken link), the blog assistant's error
message told users to "check /admin/api-keys", and two comments referenced
the deleted module. All fixed.

Verified live: `/admin/api-keys` and `/api/admin/secrets` both return 404,
the remaining admin pages still load, and the blog assistant reaches its
upstream call — proving the OpenRouter key is being found in the environment
rather than falling through to "not configured".

## Pre-launch hardening: the misconfigured-deploy fallback

Found while answering "is this ready to publish". `getSession()` fell back to
a development cookie shim whenever the Supabase env vars were absent, and the
code comment claimed that branch was "never reachable in production". That
was wrong. It is exactly reachable in production — by a deploy where the
Supabase variables are missing or mistyped, which is one of the easiest
mistakes to make on a first launch.

In that state the shim read `packageId` straight from a browser cookie, so
anyone could open devtools, set `pkg=promax`, and hand themselves the top
paid tier. The only protection was a one-time `console.warn` in a server log
nobody is watching, while the site otherwise looked completely healthy.

Production now degrades to a plain signed-out guest session instead: nobody
can log in, which gets noticed within minutes, and nothing is given away in
the meantime. Development keeps the shim, since that is what makes local
testing possible without a database. The log line was upgraded from `warn` to
`error` and now names the three variables to set.

Verified in production mode with Supabase deliberately unset: a request
carrying `uid=attacker; pkg=promax` comes back `signedIn: false` with no
package perks, and the admin gate separately returns 307 as it already did.

## Login: "Sign-in failed: session_not_found"

Reported from the live deploy. My first read blamed Supabase's redirect
configuration, and the pushback that it was a code problem was correct —
worth recording, because the config issue was real but was a *different*
issue that happened to be visible at the same time.

`app/account/page.tsx` redirected to `/login?error=session_not_found`
whenever `getUser()` returned nothing. That fires for the ordinary case of
someone who simply has not signed in yet — a first-time visitor clicking
"Account" got told sign-in had *failed*, in internal jargon, when nothing had
failed at all.

Now redirects to `/login?notice=signin_required`, and the login page
distinguishes a prompt from a failure: notices render in neutral text
("Sign in to see your account"), real failures keep the warning styling.

While there, Supabase's raw error codes were also being shown to users
verbatim as `Sign-in failed: otp_expired` and similar. The handful that
actually reach a person are now translated into plain English with a next
action ("That sign-in link has expired. Request a new one below."), while
anything unrecognised still falls through to the raw code — a wrong guess
would be worse than an unfamiliar code.

Verified against a running server: a signed-out request to `/account` returns
307 to `/login?notice=signin_required`.

**The separate, genuine configuration issue** — Google sign-in bouncing to
`http://localhost:3000` — is not a code bug. The app builds its redirect from
`window.location.origin`, which is correct; Supabase validates that against
its own allowlist and silently substitutes its configured Site URL when the
origin is not listed. Fix in Supabase → Authentication → URL Configuration:
set Site URL to the deployed URL and add both it and `http://localhost:3000`
(with `/**`) as Redirect URLs. This has to be redone when a custom domain is
attached, alongside the `SITE_URL` env var.
