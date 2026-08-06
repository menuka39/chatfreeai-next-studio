import { NextRequest } from "next/server";
import { audioModelById, FORMATS, type AudioFormat } from "@/lib/audio-models";
import { effectiveCost, creditsForUsd } from "@/lib/price-oracle";
import { packageById } from "@/lib/packages";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import { charge, userMonthlyKey } from "@/lib/quota";
import { uploadPublicAsset } from "@/lib/storage";
import { getSession, planFor } from "@/lib/session";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
// Vercel: TTS is synchronous and returns an audio byte stream.
export const maxDuration = 120;

const OPENROUTER_SPEECH = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/audio/speech`;
const MONTH_TTL = 60 * 60 * 24 * 40;

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

/**
 * POST — synthesise speech. Paid plans only, charged from the same monthly
 * credit pool as chat/image/video. TTS bills per character, so the charge is
 * known before the call; it is refunded if the provider fails.
 */
export async function POST(req: NextRequest) {
  const apiKey = openRouterKey();
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  let body: { modelId?: string; text?: string; voice?: string; format?: string; store?: boolean };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const model = audioModelById(body.modelId ?? "");
  if (!model) return deny(400, "unknown_model", "That voice model is not available.");

  const text = (body.text ?? "").trim();
  if (!text) return deny(400, "bad_request", "Text is required.");
  if (text.length > model.maxChars) {
    return deny(400, "text_too_long", `${model.name} accepts up to ${model.maxChars.toLocaleString()} characters.`, {
      maxChars: model.maxChars,
      length: text.length,
    });
  }

  const voice = body.voice && model.voices.includes(body.voice) ? body.voice : model.voices[0];
  const format = (FORMATS as readonly string[]).includes(body.format ?? "")
    ? (body.format as AudioFormat)
    : "mp3";

  const session = await getSession(req);
  if (planFor(session) === "free") {
    return deny(403, "plan_required", "Voice generation is included in every paid plan.", {
      requiredPlan: "starter",
    });
  }

  // Price from the live per-character rate when available.
  const priced = await effectiveCost(
    model.openrouter,
    (p) => (p.promptPerM !== undefined ? p.promptPerM / 1_000_000 : undefined),
    model.costPerMillionChars / 1_000_000,
    model.estimated,
  );
  const credits = creditsForUsd(priced.usd * text.length);

  // admin-adjustable in /admin/limits — falls back to lib/packages.ts if never overridden
  const pkgCredits = await effectiveCredits(session.packageId! as LimitId);
  const key = userMonthlyKey(session.userId!, session.periodStart);

  const res = await charge(key, session.periodStart, pkgCredits, credits, MONTH_TTL);
  if (!res.ok) {
    return deny(429, "package_exhausted", "Not enough credits left in your package for this audio.", {
      needed: credits,
      remaining: res.remaining,
    });
  }

  const refund = () =>
    charge(key, session.periodStart, Number.MAX_SAFE_INTEGER, -credits, MONTH_TTL);

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_SPEECH, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SITE_URL ?? "https://chatfreeai.com",
        "X-Title": "Chat Free AI",
      },
      body: JSON.stringify({ model: model.openrouter, input: text, voice, response_format: format }),
    });
  } catch {
    await refund();
    return deny(502, "upstream_error", "Could not reach the voice provider. Your credits were not charged.");
  }

  if (!upstream.ok || !upstream.body) {
    await refund();
    const detail = await upstream.text().catch(() => "");
    console.error("openrouter tts error", upstream.status, detail.slice(0, 500));
    return deny(502, "upstream_error", "The voice provider returned an error. Your credits were not charged.");
  }

  if (process.env.LOG_MARGIN === "1") {
    console.log(
      `[margin][audio] ${model.id} chars=${text.length} credits=${credits} ` +
        `cost=$${(priced.usd * text.length).toFixed(5)} priced-from=${priced.source}`,
    );
  }

  const mime = format === "mp3" ? "audio/mpeg" : format === "wav" ? "audio/wav" : "audio/ogg";

  /**
   * `store: true` keeps the track.
   *
   * Streaming raw bytes is the cheapest path and stays the default, but a
   * caller that keeps a library needs a URL that survives a reload — an
   * object URL made from the stream dies with the page, leaving a list of
   * entries whose play buttons do nothing. So the studio asks for the stored
   * form and gets the same treatment music already had.
   */
  if (body.store) {
    const bytes = Buffer.from(await upstream.arrayBuffer());
    const ext = format === "mp3" ? "mp3" : format === "wav" ? "wav" : "ogg";
    const stored = await uploadPublicAsset(
      `speech/${crypto.randomUUID()}.${ext}`,
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      mime,
    );
    if (!stored) {
      console.error("[audio] storage upload failed — check the public-assets bucket exists");
      return deny(502, "storage_error", "Could not save the track. Your credits were not charged.");
    }
    return Response.json({ url: stored.publicUrl, credits, bytes: bytes.byteLength });
  }

  // The endpoint returns raw audio bytes — pass them straight through.
  return new Response(upstream.body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "no-store",
      "X-Credits-Charged": String(credits),
    },
  });
}
