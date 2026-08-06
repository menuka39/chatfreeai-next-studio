import { NextRequest } from "next/server";
import { getSession, planFor } from "@/lib/session";
import { charge, userMonthlyKey } from "@/lib/quota";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import { callGemini, geminiToOpenAIStream, resolveGeminiModels } from "@/lib/providers/gemini";
import { PROVIDERS } from "@/lib/providers";
import { deletePublicAsset } from "@/lib/storage";
import { normalizeSupabaseUrl } from "@/lib/supabase/url";
import { modelById } from "@/lib/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Video to Prompt.
 *
 * Gemini is handed the storage URL of the uploaded clip and fetches it during
 * processing, so a 90MB video never passes through this function — only a link
 * does. That is what makes this work inside a serverless request at all.
 *
 * Billing mirrors /api/tool: reserve up front so parallel submissions can't
 * overshoot the limit, stream, then settle against the real token usage Gemini
 * reports. Video is expensive per second, so the reserve is much larger than a
 * text tool's — a minute of footage is tens of thousands of tokens.
 */

const MONTH_TTL = 60 * 60 * 24 * 40;
const RESERVE_CREDITS = 300_000;

/**
 * Which model to analyse with, in order of preference.
 *
 * Google's real model names drift — a model ships as `-preview`, goes GA under
 * a new number, and the old string starts returning 404. The resolver checks
 * these against ListModels and takes the first that exists, so a rename
 * downgrades this tool instead of breaking it.
 *
 * Flash tiers first: video is charged per second of footage, and the Pro
 * models cost several times more for a job that is description, not reasoning.
 */
const MODEL_PREFERENCE = [
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-3.1-flash",
  "gemini-3-flash",
  "gemini-3.1-pro",
];

/**
 * Any Gemini 3 or newer, tried after the named preferences, newest first.
 *
 * Stated as a floor rather than a pattern so the next major is included the
 * day it ships instead of the day someone edits this file. 2.x is excluded on
 * purpose: those are retiring, and the 2.0 family never supported reading a
 * file from an external URL — the mechanism this whole route depends on.
 */
const USABLE_MODEL = (name: string, version: number) => version >= 3 && name.includes("flash");

/** Catalogue entry used only for the credit weight, not for the API name. */
const PRICING_MODEL_ID = "gemini-36-flash";

/**
 * The analysis brief, kept from the source tool.
 *
 * The point is a prompt someone can paste into a video generator, not a
 * description of the clip — so it has to read as an instruction, and it must
 * not name real people or copyrighted characters, which would make the output
 * unusable anyway.
 */
const SYSTEM = [
  "You are an expert AI video-prompt engineer. You are given a video.",
  "Watch it and write ONE detailed text-to-video prompt that would recreate it in a modern video generator such as Veo, Kling or Sora.",
  "Cover, in flowing prose rather than a list: the scene and setting, the main subject and its action, camera shot type and movement, lighting, colour grade, mood and pacing, and any notable visual style.",
  "Describe people only by generic appearance and never by name; never name real individuals, brands, or copyrighted characters. If the video shows something you cannot describe safely, describe the setting and cinematography only.",
  "Output plain text only: the finished prompt, nothing else. No markdown, no headings, no labels, no quotation marks around the result, and no commentary before or after.",
].join("\n");

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

/** Only paths this app just handed out, in the bucket it owns. */
function safePath(path: string) {
  return /^prompt-video\/[A-Za-z0-9-]+\.[a-z0-9]{2,5}$/.test(path);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("[video-to-prompt] GEMINI_API_KEY is not set");
    return deny(503, "not_configured", "Video to Prompt isn't available right now.");
  }

  const session = await getSession(req);
  const plan = planFor(session);
  if (!session.userId || plan === "free") {
    return deny(402, "plan_required", "Video to Prompt is included in every paid plan.");
  }

  let body: { path?: string; mimeType?: string; notes?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid request body.");
  }

  const path = body.path ?? "";
  if (!safePath(path)) return deny(400, "bad_request", "Unknown upload.");

  const base = normalizeSupabaseUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
  if (!base) return deny(503, "not_configured", "Storage isn't configured.");
  const fileUri = `${base}/storage/v1/object/public/public-assets/${path}`;

  const model = modelById(PRICING_MODEL_ID);
  if (!model) return deny(503, "not_configured", "The analysis model isn't available.");

  const candidates = await resolveGeminiModels(
    PROVIDERS.gemini.baseUrl,
    apiKey,
    MODEL_PREFERENCE,
    USABLE_MODEL,
  );
  if (!candidates.length) {
    console.error("[video-to-prompt] no usable Gemini model; tried", MODEL_PREFERENCE.join(", "));
    return deny(503, "not_configured", "The analysis model isn't available right now.");
  }

  const key = userMonthlyKey(session.userId, session.periodStart);
  const limit = await effectiveCredits(session.packageId! as LimitId);

  const reserve = await charge(key, session.periodStart, limit, RESERVE_CREDITS, MONTH_TTL);
  if (!reserve.ok) {
    void deletePublicAsset(path);
    return deny(429, "package_exhausted", "Not enough credits left in your package.", {
      remaining: reserve.remaining,
    });
  }

  // give the credits back on any path that doesn't produce output
  const release = async () => {
    await charge(key, session.periodStart, limit, -RESERVE_CREDITS, MONTH_TTL);
    void deletePublicAsset(path);
  };

  const notes = (body.notes ?? "").trim().slice(0, 500);

  /**
   * Try each candidate in turn, but only move on for a quota refusal.
   *
   * Gemini quotas are per project AND per model, and a newly released model
   * often carries none at all on an unbilled project — the request fails with
   * 429 while an older Flash of the same class would have answered. Every
   * candidate here is a Flash tier, so falling back changes the bill by
   * cents, not by a category; anything else (a bad URL, a safety refusal)
   * would fail identically on the next model, so those stop immediately.
   */
  let upstream: Response | null = null;
  let geminiModel = candidates[0];
  let lastDetail = "";
  let lastStatus = 0;

  for (const candidate of candidates) {
    let res: Response;
    try {
      res = await callGemini({
        baseUrl: PROVIDERS.gemini.baseUrl,
        apiKey,
        model: candidate,
        system: SYSTEM,
        messages: [
          {
            role: "user",
            content: notes
              ? `Write the prompt for this video. Extra direction from the user: ${notes}`
              : "Write the prompt for this video.",
          },
        ],
        attachments: [{ fileUri, mimeType: body.mimeType ?? "video/mp4" }],
        maxTokens: 1500,
      });
    } catch {
      await release();
      return deny(502, "upstream_error", "Could not reach the analysis model. Your credits were not charged.");
    }

    if (res.ok && res.body) {
      upstream = res;
      if (candidate !== candidates[0]) {
        console.warn(`[video-to-prompt] answered by ${candidate} after falling back`);
      }
      geminiModel = candidate;
      break;
    }

    lastStatus = res.status;
    lastDetail = await res.text().catch(() => "");
    console.error("[video-to-prompt] gemini error", res.status, candidate, lastDetail.slice(0, 400));
    if (res.status !== 429) break;
    console.warn(`[video-to-prompt] ${candidate} is out of quota — trying the next model`);
  }

  if (!upstream) {
    await release();

    if (lastStatus === 429) {
      // Worth naming precisely: this is Google's quota on the project, not
      // anything about the video or this app's own credit limits.
      console.error(
        "[video-to-prompt] every candidate model was rate limited. Gemini quotas are " +
          "per Google Cloud project — check RPM/TPM/RPD in AI Studio, and note that a " +
          "brand-new model can have zero free-tier quota until billing is enabled.",
      );
      return deny(
        429,
        "provider_quota",
        "The video analyser is at its limit right now. Please try again in a few minutes — your credits were not charged.",
      );
    }

    // A URL Gemini can't fetch or won't accept is the other likely failure,
    // and it is worth saying so rather than blaming the model.
    const unreachable = /url_retrieval|unsafe|fetch/i.test(lastDetail);
    return deny(
      502,
      "upstream_error",
      unreachable
        ? "The model couldn't read that video. Try a different file or a shorter clip."
        : "The analysis model returned an error. Your credits were not charged.",
    );
  }

  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = geminiToOpenAIStream(upstream.body!).getReader();

  const stream = new ReadableStream({
    async start(controller) {
      let buffer = "";
      let promptTokens = 0;
      let completionTokens = 0;

      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;
            try {
              const json = JSON.parse(payload);
              if (json.usage) {
                promptTokens = json.usage.prompt_tokens ?? promptTokens;
                completionTokens = json.usage.completion_tokens ?? completionTokens;
              }
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`));
            } catch {
              /* partial frame */
            }
          }
        }
      } catch {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "stream_interrupted" })}\n\n`));
      } finally {
        // Settle against real usage. Video tokens dwarf the text, so this is
        // usually a top-up rather than a refund.
        const credits = Math.ceil((promptTokens + completionTokens) * model.weight);
        await charge(key, session.periodStart, limit, credits - RESERVE_CREDITS, MONTH_TTL);

        // The clip only existed so Gemini could read it once.
        void deletePublicAsset(path);

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ done: true, credits, model: geminiModel })}\n\n`),
        );
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
