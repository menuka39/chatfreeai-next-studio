import { NextRequest } from "next/server";
import { imageModelById, imagePrice, imageSizeString } from "@/lib/image-models";
import { effectiveCost, creditsForUsd } from "@/lib/price-oracle";
import { packageById } from "@/lib/packages";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import { charge, userMonthlyKey } from "@/lib/quota";
import { getSession, planFor } from "@/lib/session";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
// Vercel: image generation is synchronous, up to ~25s + retries.
export const maxDuration = 120;

const OPENROUTER_IMAGES = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/images`;
const MONTH_TTL = 60 * 60 * 24 * 40;

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

/**
 * POST — generate an image (synchronous; images take seconds).
 * Paid plans only; charged from the same monthly credit pool as chat/video.
 * Credits are charged up front and refunded if the provider fails.
 */
export async function POST(req: NextRequest) {
  const apiKey = openRouterKey();
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  let body: {
    modelId?: string;
    prompt?: string;
    aspectRatio?: string;
    quality?: string;
    /** images to edit or use as style references (data: or https:) */
    references?: string[];
    /** how many variations to return */
    n?: number;
    outputFormat?: string;
    transparent?: boolean;
    seed?: number;
  };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const model = imageModelById(body.modelId ?? "");
  if (!model) return deny(400, "unknown_model", "That image model is not available.");

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return deny(400, "bad_request", "Prompt is required.");

  const ratio = body.aspectRatio ?? model.aspectRatios[0];
  if (!model.aspectRatios.includes(ratio)) {
    return deny(400, "bad_aspect_ratio", `${model.name} supports: ${model.aspectRatios.join(", ")}.`);
  }

  /* ---- optional capabilities, validated against the model ---- */

  const references = Array.isArray(body.references)
    ? body.references.filter((r) => typeof r === "string" && r.trim()).slice(0, 8)
    : [];
  const n = Math.max(1, Math.min(Number(body.n) || 1, model.maxImages ?? 1));
  const transparent = Boolean(body.transparent);
  const seed = Number.isInteger(body.seed) ? Number(body.seed) : undefined;
  const outputFormat =
    body.outputFormat && (model.outputFormats ?? ["png"]).includes(body.outputFormat)
      ? body.outputFormat
      : (model.outputFormats ?? ["png"])[0];

  if (references.length && !model.edit) {
    return deny(400, "unsupported", `${model.name} can't edit or reference images.`);
  }
  if (references.length > (model.maxReferences ?? 0)) {
    return deny(400, "too_many_references", `${model.name} accepts up to ${model.maxReferences} reference image(s).`);
  }
  if (transparent && !model.transparent) {
    return deny(400, "unsupported", `${model.name} can't produce a transparent background.`);
  }
  if (seed !== undefined && !model.seed) {
    return deny(400, "unsupported", `${model.name} doesn't accept a seed.`);
  }
  for (const img of references) {
    if (!img.startsWith("data:image/") && !img.startsWith("https://")) {
      return deny(400, "bad_image", "Reference images must be an https URL or an uploaded file.");
    }
    if (img.startsWith("data:image/") && img.length > 8_000_000) {
      return deny(400, "image_too_large", "That image is too large. Please use one under ~5MB.");
    }
  }
  // editing needs an instruction; generating needs a description
  if (!prompt) {
    return deny(400, "bad_request", references.length ? "Say what to change." : "Prompt is required.");
  }

  const price = imagePrice(model, body.quality);
  // providers with a fixed size list reject anything computed (see
  // ImageModelConfig.fixedSizes) — use their allowed size for this ratio
  const size = model.fixedSizes?.[ratio] ?? imageSizeString(ratio, price.megapixels);

  // Live price first — per-image where the provider bills flat, per-megapixel
  // where it doesn't. The catalogue is the fallback.
  const priced = await effectiveCost(
    model.openrouter,
    (p) => (p.perImage ?? (p.perMegapixel ? p.perMegapixel * price.megapixels : undefined)),
    price.costUsd,
    model.estimated,
  );
  const credits = creditsForUsd(priced.usd * n);

  const session = await getSession(req);
  const plan = planFor(session);
  if (plan === "free") {
    return deny(403, "plan_required", "Image generation is included in every paid plan.", {
      requiredPlan: "starter",
    });
  }

  // admin-adjustable in /admin/limits — falls back to lib/packages.ts if never overridden
  const pkgCredits = await effectiveCredits(session.packageId! as LimitId);
  const key = userMonthlyKey(session.userId!, session.periodStart);

  const res = await charge(key, session.periodStart, pkgCredits, credits, MONTH_TTL);
  if (!res.ok) {
    return deny(429, "package_exhausted", "Not enough credits left in your package for this image.", {
      needed: credits,
      remaining: res.remaining,
    });
  }

  const refund = () =>
    charge(key, session.periodStart, Number.MAX_SAFE_INTEGER, -credits, MONTH_TTL);

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_IMAGES, {
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
        // `aspect_ratio` only, never `size`. Checked against OpenRouter's
        // /api/v1/images/models capability endpoint: not one image model
        // lists `size` as a supported parameter. Sending a computed one is
        // what the provider rejected — "Invalid size '816x1232'" from OpenAI
        // and the same class of failure from Seedream at 1152x864. The
        // provider picks its own dimensions from the ratio.
        aspect_ratio: ratio,
        n,
        output_format: outputFormat,
        ...(references.length
          ? { input_references: references.map((url) => ({ type: "image_url", image_url: { url } })) }
          : {}),
        ...(transparent ? { background: "transparent" } : {}),
        ...(seed !== undefined ? { seed } : {}),
      }),
    });
  } catch {
    await refund();
    return deny(502, "upstream_error", "Could not reach the image provider. Your credits were not charged.");
  }

  if (!upstream.ok) {
    await refund(); // OpenRouter doesn't bill failed generations, so neither do we
    const detail = await upstream.text().catch(() => "");
    console.error("openrouter image error", upstream.status, detail.slice(0, 500));
    return deny(502, "upstream_error", "The image provider returned an error. Your credits were not charged.");
  }

  let raw: { data?: unknown[]; output?: unknown[] };
  try {
    raw = await upstream.json();
  } catch {
    await refund();
    return deny(502, "upstream_error", "The provider sent an unreadable response. Your credits were not charged.");
  }

  const mime = outputFormat === "jpeg" ? "image/jpeg" : outputFormat === "webp" ? "image/webp" : "image/png";
  const entries = (raw.data ?? raw.output ?? []) as { url?: string; b64_json?: string }[];
  const images = entries
    .map((e) => e.url ?? (e.b64_json ? `data:${mime};base64,${e.b64_json}` : null))
    .filter((u): u is string => Boolean(u));

  if (!images.length) {
    await refund();
    return deny(502, "upstream_error", "The provider returned no image. Your credits were not charged.");
  }

  // Refund the difference if the provider returned fewer images than we billed
  // for — the user must never pay for variations they didn't receive.
  if (images.length < n) {
    const unused = creditsForUsd(priced.usd * (n - images.length));
    await charge(key, session.periodStart, Number.MAX_SAFE_INTEGER, -unused, MONTH_TTL);
  }

  if (process.env.LOG_MARGIN === "1") {
    console.log(
      `[margin][image] ${model.id} ${size} (${ratio}) n=${n}${references.length ? " edit" : ""}` +
        `${transparent ? " transparent" : ""} credits=${credits} ` +
        `cost=$${(priced.usd * n).toFixed(3)} priced-from=${priced.source}`,
    );
  }

  return Response.json({
    images,
    // kept for older clients that expect a single image
    imageUrl: images[0],
    credits: images.length < n ? creditsForUsd(priced.usd * images.length) : credits,
    model: model.id,
    modelName: model.name,
    aspectRatio: ratio,
    size,
    outputFormat,
    seed,
  });
}
