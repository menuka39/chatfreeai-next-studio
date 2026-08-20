import { NextRequest } from "next/server";
import { videoModelById, videoResolution } from "@/lib/video-models";
import { effectiveCost, creditsForUsd } from "@/lib/price-oracle";
import { signVideoUrl, signRefundToken, verifyRefundToken } from "@/lib/video-token";
import { uploadPublicAsset } from "@/lib/storage";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import { charge, claimOnce, userMonthlyKey } from "@/lib/quota";
import { getSession, planFor } from "@/lib/session";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
// Vercel: submits the job and returns; polling is separate.
export const maxDuration = 60;

const OPENROUTER_VIDEOS = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/videos`;
const MONTH_TTL = 60 * 60 * 24 * 40;

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

/**
 * POST — start a video generation job.
 * Video is available on ANY paid plan and is charged from the same monthly
 * credit pool as chat. Credits are charged up front (the full clip price) and
 * refunded automatically if the job fails.
 */
export async function POST(req: NextRequest) {
  const apiKey = openRouterKey();
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  let body: {
    modelId?: string;
    prompt?: string;
    duration?: number;
    aspectRatio?: string;
    resolution?: string;
    firstFrame?: string;
    lastFrame?: string;
    references?: string[];
    generateAudio?: boolean;
    seed?: number;
  };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const model = videoModelById(body.modelId ?? "");
  if (!model) return deny(400, "unknown_model", "That video model is not available.");

  const prompt = (body.prompt ?? "").trim();

  const duration = Number(body.duration) || model.defaultDuration;
  if (!model.durations.includes(duration)) {
    return deny(400, "bad_duration", `Supported durations for ${model.name}: ${model.durations.join(", ")}s.`);
  }

  const ratio = body.aspectRatio ?? model.aspectRatios[0];
  if (!model.aspectRatios.includes(ratio)) {
    return deny(400, "bad_aspect_ratio", `${model.name} supports: ${model.aspectRatios.join(", ")}.`);
  }

  const resLabel = body.resolution ?? model.resolutions[0].label;
  if (!model.resolutions.some((r) => r.label === resLabel)) {
    return deny(
      400,
      "bad_resolution",
      `${model.name} supports: ${model.resolutions.map((r) => r.label).join(", ")}.`,
    );
  }
  const resolution = videoResolution(model, resLabel);

  const session = await getSession(req);
  const plan = planFor(session);
  if (plan === "free") {
    return deny(403, "plan_required", "Video generation is included in every paid plan.", {
      requiredPlan: "starter",
    });
  }

  // admin-adjustable in /admin/limits — falls back to lib/packages.ts if never overridden
  const pkgCredits = await effectiveCredits(session.packageId! as LimitId);
  const key = userMonthlyKey(session.userId!, session.periodStart);
  /* ---- optional capabilities ---- */

  const firstFrame = typeof body.firstFrame === "string" ? body.firstFrame.trim() : "";
  const lastFrame = typeof body.lastFrame === "string" ? body.lastFrame.trim() : "";
  const references = Array.isArray(body.references) ? body.references.filter((r) => typeof r === "string").slice(0, 3) : [];
  const wantsAudio = Boolean(body.generateAudio);
  const seed = Number.isInteger(body.seed) ? Number(body.seed) : undefined;

  const isDataUri = (v: string) => v.startsWith("data:image/");
  const isHttps = (v: string) => v.startsWith("https://");
  const validImage = (v: string) => isDataUri(v) || isHttps(v);

  if (firstFrame && !model.imageToVideo) {
    return deny(400, "unsupported", `${model.name} doesn't support animating a starting image.`);
  }
  if (lastFrame && !model.lastFrame) {
    return deny(400, "unsupported", `${model.name} doesn't support a closing frame.`);
  }
  if (references.length && !model.references) {
    return deny(400, "unsupported", `${model.name} doesn't support reference images.`);
  }
  if (wantsAudio && !model.audio) {
    return deny(400, "unsupported", `${model.name} doesn't generate audio.`);
  }
  for (const img of [firstFrame, lastFrame, ...references].filter(Boolean)) {
    if (!validImage(img)) {
      return deny(400, "bad_image", "Images must be an https URL or an uploaded file.");
    }
    // a data URI is inlined into the upstream request; keep it sane
    if (isDataUri(img) && img.length > 8_000_000) {
      return deny(400, "image_too_large", "That image is too large. Please use one under ~5MB.");
    }
  }
  if (!prompt && !firstFrame) {
    return deny(400, "bad_request", "Give a prompt, or upload a starting image.");
  }

  // Price from the LIVE OpenRouter rate when available; the catalogue is only
  // a fallback, and estimated entries carry a safety factor.
  const priced = await effectiveCost(
    model.openrouter,
    (p) => p.perSecond,
    resolution.costPerSec,
    resolution.estimated,
  );
  // Audio is generated by the provider at extra cost — charge for it or every
  // audio clip erodes the margin.
  const audioMultiplier = wantsAudio ? (model.audioSurcharge ?? 2) : 1;
  const usdCost = priced.usd * duration * audioMultiplier;
  const credits = creditsForUsd(usdCost);

  // charge the full clip up front from the monthly pool
  const res = await charge(key, session.periodStart, pkgCredits, credits, MONTH_TTL);
  if (!res.ok) {
    return deny(429, "package_exhausted", "Not enough credits left in your package for this video.", {
      needed: credits,
      remaining: res.remaining,
    });
  }

  // Credits are already deducted at this point, so every failure path below
  // MUST refund. An unhandled network throw here would charge the user and
  // return a 500 with nothing generated.
  const refund = () =>
    charge(key, session.periodStart, Number.MAX_SAFE_INTEGER, -credits, MONTH_TTL);

  // submit the async job to OpenRouter
  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_VIDEOS, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL ?? "https://chatfreeai.com",
      "X-Title": "Chat Free AI",
    },
    body: JSON.stringify({
      model: model.openrouter,
      prompt,
      duration,
      aspect_ratio: ratio,
      resolution: resolution.label,
      // The provider's schema wants all three fields on each entry, which
      // took two rejections to establish: the first complained that
      // `image_url` was a bare string and required `type: "image_url"`; with
      // that fixed, the second asked for `frame_type` back. So it is not
      // one convention or the other — it is the OpenAI content-part shape
      // *plus* a frame_type saying which end of the clip the image belongs to.
      ...(firstFrame || lastFrame
        ? {
            frame_images: [
              ...(firstFrame
                ? [{ frame_type: "first_frame", type: "image_url", image_url: { url: firstFrame } }]
                : []),
              ...(lastFrame
                ? [{ frame_type: "last_frame", type: "image_url", image_url: { url: lastFrame } }]
                : []),
            ],
          }
        : {}),
      ...(references.length
        ? { input_references: references.map((url) => ({ type: "image_url", image_url: { url } })) }
        : {}),
      ...(wantsAudio ? { generate_audio: true } : {}),
      ...(seed !== undefined ? { seed } : {}),
      }),
      signal: AbortSignal.timeout(45000),
    });
  } catch {
    await refund();
    return deny(502, "upstream_error", "Could not reach the video provider. Your credits were not charged.");
  }

  if (!upstream.ok) {
    await refund();
    const detail = await upstream.text().catch(() => "");
    console.error("openrouter video error", upstream.status, detail.slice(0, 500));
    return deny(502, "upstream_error", "The video provider returned an error. Your credits were not charged.");
  }

  let job: { id?: string; data?: { id?: string } };
  try {
    job = await upstream.json();
  } catch {
    await refund();
    return deny(502, "upstream_error", "The provider sent an unreadable response. Your credits were not charged.");
  }

  const jobId = job.id ?? job.data?.id;
  if (!jobId) {
    await refund();
    return deny(502, "upstream_error", "The provider did not return a job id. Your credits were not charged.");
  }

  if (process.env.LOG_MARGIN === "1") {
    console.log(
      `[margin][video] ${model.id} ${duration}s ${resLabel}${wantsAudio ? " +audio" : ""}` +
        `${firstFrame ? " i2v" : ""} credits=${credits} cost=$${usdCost.toFixed(3)} priced-from=${priced.source}`,
    );
  }

  return Response.json({
    jobId,
    credits,
    model: model.id,
    duration,
    resolution: resLabel,
    // Client sends this back when polling so a failed job can be refunded.
    // Signed, and bound to this job and this user — see verifyRefundToken.
    refundToken: signRefundToken({
      jobId,
      userId: session.userId!,
      period: session.periodStart,
      credits,
    }),
  });
}

/**
 * GET ?jobId=… — poll a job. On terminal failure, refunds the reserved
 * credits (once — the client stops polling after a terminal state).
 */

/**
 * Copy a finished clip into our own storage.
 *
 * Provider links are short-lived — the UI already warns that they "expire
 * after a while" — so a clip the user paid for becomes unplayable within
 * minutes, and there is nothing to come back to later. Fetching it once and
 * storing it ourselves fixes that permanently: no expiry, same origin (so no
 * CORS), and the clip survives a page reload.
 *
 * Best-effort by design. If storage isn't configured or the copy fails, the
 * caller falls back to the provider URL — a link that works for a few
 * minutes still beats no link at all.
 */
/**
 * Provider URL -> our stored copy, so a clip is only ever uploaded once no
 * matter how many times it is polled. Process-local and unbounded is fine:
 * entries are small, and a cold start simply re-uploads on the next poll.
 */
const persistedVideos = new Map<string, string>();

async function persistVideo(url: string): Promise<string | null> {
  try {
    // `unsigned_urls` means exactly that: not pre-signed, so reading one
    // needs our API key. Bare fetches came back 401. The key goes only to
    // the provider's own host — a response could name any URL, and this must
    // never hand credentials to whatever host happens to appear there.
    let headers: Record<string, string> = {};
    try {
      const host = new URL(url).hostname;
      if (/(^|\.)openrouter\.ai$/i.test(host) && openRouterKey()) {
        headers = { Authorization: `Bearer ${openRouterKey()}` };
      }
    } catch {
      return null;
    }

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(45000) });
    if (!res.ok) {
      console.error("[video] could not fetch clip to store", res.status, new URL(url).hostname);
      return null;
    }
    const bytes = await res.arrayBuffer();
    // guard against a provider returning something unexpectedly huge
    if (bytes.byteLength > 60 * 1_048_576) {
      console.error("[video] clip too large to store", bytes.byteLength);
      return null;
    }
    const type = res.headers.get("content-type") ?? "video/mp4";
    const ext = type.includes("webm") ? "webm" : "mp4";
    const stored = await uploadPublicAsset(`videos/${crypto.randomUUID()}.${ext}`, bytes, type);
    if (!stored) {
      console.error("[video] storage upload failed — check the public-assets bucket exists");
      return null;
    }
    return stored.publicUrl;
  } catch (err) {
    console.error("[video] storing clip failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function GET(req: NextRequest) {
  const apiKey = openRouterKey();
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  const jobId = req.nextUrl.searchParams.get("jobId");
  if (!jobId) return deny(400, "bad_request", "jobId is required.");

  // Polling was open to anyone. Only a signed-in account can start a job, so
  // only a signed-in account has any business asking about one — and the
  // refund below has to know whose credits it is putting back.
  const session = await getSession(req);
  if (!session.userId) {
    return deny(401, "auth_required", "Sign in to check on a video job.");
  }

  const upstream = await fetch(`${OPENROUTER_VIDEOS}/${encodeURIComponent(jobId)}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!upstream.ok) return deny(502, "upstream_error", "Could not fetch job status.");

  const raw = await upstream.json();
  const data = raw.data ?? raw;
  const status: string = data.status ?? "processing";

  // Tolerate the different shapes providers return for the file URL.
  // `unsigned_urls` is what Seedance actually sends on completion — it was
  // missing here, so a finished clip came back with no URL at all: generated,
  // charged for, and unreachable.
  const firstUrl = (v: unknown): string | null => {
    if (typeof v === "string") return v;
    if (Array.isArray(v)) {
      for (const item of v) {
        const found = firstUrl(item);
        if (found) return found;
      }
    }
    if (v && typeof v === "object") {
      const o = v as Record<string, unknown>;
      return firstUrl(o.url ?? o.video_url ?? o.signed_url ?? null);
    }
    return null;
  };

  const videoUrl: string | null =
    firstUrl(data.video_url) ??
    firstUrl(data.url) ??
    firstUrl(data.output) ??
    firstUrl(data.outputs) ??
    firstUrl(data.unsigned_urls) ??
    firstUrl(data.signed_urls) ??
    firstUrl(data.result) ??
    null;

  // Log what the provider actually sent. Without this there is no way to tell
  // a null URL apart from a URL that exists but won't play — and the user
  // pays for the clip either way, so guessing is expensive.
  if (status === "completed" || !videoUrl) {
    console.log("[video] provider result", {
      status,
      hasUrl: Boolean(videoUrl),
      url: videoUrl ? videoUrl.slice(0, 120) : null,
      keys: Object.keys(data).slice(0, 12),
      // when the URL is still missing, dump the payload — guessing at the
      // shape from key names alone is what let this slip through before
      ...(videoUrl ? {} : { raw: JSON.stringify(data).slice(0, 600) }),
    });
  }

  const failed = ["failed", "cancelled", "expired"].includes(status);

  // Once the clip is ready, take our own copy so it doesn't vanish with the
  // provider's link. Falls back to the provider URL if that doesn't work.
  let servedUrl = videoUrl;
  if (!failed && status === "completed" && videoUrl) {
    // Cache by provider URL. This runs on every poll, and polls keep arriving
    // after completion — so without this the same finished clip was fetched
    // and re-uploaded under a fresh UUID each time. That wasted storage, and
    // worse, handed the client a different URL on every poll while the token
    // was signed against whichever one that response carried.
    const cached = persistedVideos.get(videoUrl);
    if (cached) {
      servedUrl = cached;
    } else {
      servedUrl = (await persistVideo(videoUrl)) ?? videoUrl;
      if (servedUrl !== videoUrl) persistedVideos.set(videoUrl, servedUrl);
    }
  }

  if (failed) {
    const token = req.nextUrl.searchParams.get("refundToken");
    const claim = token ? verifyRefundToken(token, jobId) : null;
    // Three separate gates, because the old code had none of them:
    //  - the signature proves WE issued this amount for THIS job;
    //  - the owner check stops a valid token being replayed by someone else;
    //  - the quota key is rebuilt from the session, so it can never name
    //    another user's bucket.
    if (claim && claim.userId === session.userId) {
      // ...and the refund happens at most once, however many times the
      // client polls a job that has already failed.
      if (await claimOnce(`refunded:video:${jobId}`, MONTH_TTL)) {
        const key = userMonthlyKey(session.userId, claim.period);
        await charge(key, claim.period, Number.MAX_SAFE_INTEGER, -claim.credits, MONTH_TTL);
      }
    }
  }

  return Response.json({
    status: failed ? "failed" : status === "completed" ? "completed" : "processing",
    videoUrl: servedUrl,
    // Sign whatever we're actually serving — our stored copy or, if storing
    // failed, the provider's link. Download, extend and save all read this
    // token and treat its absence as "this clip is no longer available", so
    // it has to describe the URL the client really has.
    videoToken: servedUrl ? signVideoUrl(servedUrl) : null,
    error: failed ? (data.error ?? "Generation failed. Your credits were refunded.") : null,
  });
}
