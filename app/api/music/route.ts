import { NextRequest } from "next/server";
import { musicModelById } from "@/lib/music-models";
import { getSession, planFor } from "@/lib/session";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import { charge, userMonthlyKey } from "@/lib/quota";
import { uploadPublicAsset } from "@/lib/storage";

export const runtime = "nodejs";
// Lyria Pro can take a couple of minutes for a full song.
export const maxDuration = 300;

const MONTH_TTL = 60 * 60 * 24 * 40;

const OPENROUTER_CHAT = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/chat/completions`;

function deny(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: code, message, ...extra }, { status });
}

/**
 * Pull the audio out of an OpenRouter SSE stream.
 *
 * Shape confirmed by calling the API directly rather than inferring it:
 * each chunk is `data: {...}` and the audio arrives base64-encoded at
 * `choices[0].delta.audio.data`. The stream also carries
 * `: OPENROUTER PROCESSING` keep-alive comments and a final `data: [DONE]`,
 * both of which are skipped.
 *
 * The audio came back in a single chunk in testing, but it is accumulated
 * across chunks anyway — a stream is free to split it, and finding that out
 * in production would mean truncated songs people had already paid for.
 */
async function readAudioStream(body: ReadableStream<Uint8Array>): Promise<{ base64: string; text: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let base64 = "";
  let text = "";

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // process complete lines only; a chunk can split one mid-way
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(":")) continue;      // keep-alive comment
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === "[DONE]") continue;

      try {
        const parsed = JSON.parse(payload);
        const delta = parsed?.choices?.[0]?.delta;
        if (typeof delta?.audio?.data === "string") base64 += delta.audio.data;
        if (typeof delta?.content === "string") text += delta.content;
      } catch {
        // a malformed chunk shouldn't discard the audio already collected
      }
    }
  }
  return { base64, text };
}

export async function POST(req: NextRequest) {
  const session = await getSession(req);

  let body: { modelId?: string; prompt?: string; lyrics?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid request body.");
  }

  const model = musicModelById(body.modelId ?? "");
  if (!model) return deny(400, "unknown_model", "That music model is not available.");

  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return deny(400, "bad_request", "Describe the music you want.");
  if (prompt.length > 2000) return deny(400, "bad_request", "That description is too long.");

  // Paid plans only. A Lyria clip costs $0.04 and a full song $0.08 — roughly
  // 1,500x a chat message — so the free daily allowance could never cover one,
  // and offering it would only ever produce a limit message.
  const plan = planFor(session);
  if (plan === "free") {
    return deny(402, "upgrade_required", "Music generation is included in every paid plan.", {
      upgradeUrl: "/pricing",
    });
  }

  // One budget: the package's monthly credits, the same pool chat, images,
  // video and speech draw from. Music used to carry a separate track cap on
  // top; it doesn't any more, so the credits are the only thing that stops a
  // generation — and the balance the studio shows is the real one.
  const credits = model.creditsPerGeneration;
  const pkgCredits = await effectiveCredits(session.packageId! as LimitId);
  const creditKey = userMonthlyKey(session.userId!, session.periodStart);
  const creditRes = await charge(creditKey, session.periodStart, pkgCredits, credits, MONTH_TTL);
  if (!creditRes.ok) {
    if ("storeDown" in creditRes && creditRes.storeDown) {
      return deny(503, "quota_store_unavailable", "Something went wrong on our side. Please try again in a moment.");
    }
    return deny(429, "package_exhausted", "You've used all the credits in your package for this billing period.", {
      used: creditRes.used,
      cap: pkgCredits,
    });
  }

  // give the credits back if we don't end up with audio
  const refund = async () => {
    await charge(creditKey, session.periodStart, Number.MAX_SAFE_INTEGER, -credits, MONTH_TTL);
  };

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    await refund();
    return deny(500, "not_configured", "Music generation isn't set up yet.");
  }

  const userPrompt = body.lyrics?.trim()
    ? `${prompt}\n\nLyrics:\n${body.lyrics.trim().slice(0, 4000)}`
    : prompt;

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_CHAT, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: model.openrouter,
        // Both are required: the provider refuses audio output without
        // stream:true — "Audio output requires stream: true" — and without
        // the audio modality it just answers in text.
        modalities: ["text", "audio"],
        stream: true,
        messages: [{ role: "user", content: userPrompt }],
      }),
      signal: AbortSignal.timeout(280_000),
    });
  } catch {
    await refund();
    return deny(502, "upstream_error", "Could not reach the music provider. Your credits were not charged.");
  }

  if (!upstream.ok || !upstream.body) {
    await refund();
    const detail = await upstream.text().catch(() => "");
    console.error("[music] provider error", upstream.status, detail.slice(0, 500));
    return deny(502, "upstream_error", "The music provider returned an error. Your credits were not charged.");
  }

  const { base64, text } = await readAudioStream(upstream.body);
  if (!base64) {
    await refund();
    console.error("[music] stream carried no audio", { model: model.openrouter, text: text.slice(0, 200) });
    return deny(502, "no_audio", "The provider didn't return any audio. Your credits were not charged.");
  }

  // Store it ourselves. The base64 only exists in this response, so without
  // this the track would be gone the moment the page reloads.
  const bytes = Buffer.from(base64, "base64");
  const stored = await uploadPublicAsset(`music/${crypto.randomUUID()}.mp3`, bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, "audio/mpeg");
  if (!stored) {
    await refund();
    console.error("[music] storage upload failed — check the public-assets bucket exists");
    return deny(502, "storage_error", "Could not save the track. Your credits were not charged.");
  }

  return Response.json({
    url: stored.publicUrl,
    modelId: model.id,
    modelName: model.name,
    credits,
    bytes: bytes.byteLength,
    remaining: Math.max(0, pkgCredits - creditRes.used),
    cap: pkgCredits,
  });
}
