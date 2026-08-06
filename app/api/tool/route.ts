import { NextRequest } from "next/server";
import { modelById, canUseModel, effectiveWeight } from "@/lib/models";
import { livePrices } from "@/lib/price-oracle";
import { textToolBySlug } from "@/lib/text-tools";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import {
  charge,
  guestKeys,
  userDailyKey,
  userMonthlyKey,
  nextUtcMidnight,
  RESERVE_CREDITS,
} from "@/lib/quota";
import { getSession, planFor, isGuest, clientIp } from "@/lib/session";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
// Vercel: documents can be long, so allow a full streaming window.
export const maxDuration = 300;

const OPENROUTER_URL = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/chat/completions`;
const DAY_TTL = 60 * 60 * 36;
const MONTH_TTL = 60 * 60 * 24 * 40;

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

/**
 * One route for every text tool. Billing is identical to chat — the tool only
 * decides the prompt and the output cap, never the rate.
 */
export async function POST(req: NextRequest) {
  const apiKey = openRouterKey();
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  let body: { slug?: string; modelId?: string; values?: Record<string, string>; deviceId?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const tool = textToolBySlug(body.slug ?? "");
  if (!tool) return deny(400, "unknown_tool", "That tool is not available.");

  const modelId = body.modelId ?? tool.modelChoices[0];
  if (!tool.modelChoices.includes(modelId)) {
    return deny(400, "unknown_model", `${tool.name} does not offer that model.`);
  }
  const model = modelById(modelId);
  if (!model) return deny(400, "unknown_model", "That model is not available.");

  const values = body.values ?? {};
  const missing = tool.fields.filter((f) => f.required && !String(values[f.id] ?? "").trim());
  if (missing.length) {
    return deny(400, "missing_fields", `Please fill in: ${missing.map((f) => f.label).join(", ")}.`, {
      fields: missing.map((f) => f.id),
    });
  }

  const session = await getSession(req);
  const plan = planFor(session);
  const guest = isGuest(session);

  if (!canUseModel(model, plan)) {
    return deny(403, "model_locked", `${model.name} is unlocked on our ${model.minPlan} package.`, {
      requiredPlan: model.minPlan,
      modelName: model.name,
    });
  }

  // --- quota bucket: same pools as chat ----------------------------------
  const ip = clientIp(req);
  const paid = plan !== "free";
  const keys = paid
    ? [userMonthlyKey(session.userId!, session.periodStart)]
    : guest
      ? Object.values(guestKeys(ip, body.deviceId ?? null))
      : [userDailyKey(session.userId!)];
  // admin-adjustable in /admin/limits — falls back to lib/packages.ts / FREE_LIMITS if never overridden
  const limit = await effectiveCredits((paid ? session.packageId! : guest ? "guest" : "free") as LimitId);
  const ttl = paid ? MONTH_TTL : DAY_TTL;

  // Reserve up front so parallel submissions can't overshoot the limit.
  for (const key of keys) {
    const res = await charge(key, session.periodStart, limit, RESERVE_CREDITS, ttl);
    if (!res.ok) {
      return deny(429, paid ? "package_exhausted" : "daily_limit_reached",
        paid
          ? "Not enough credits left in your package."
          : `You've used today's free allowance. It resets at ${nextUtcMidnight().slice(11, 16)} UTC.`,
        { remaining: res.remaining, resetsAt: nextUtcMidnight() });
    }
  }

  const { system, user } = tool.build(values);

  let upstream: Response;
  try {
    upstream = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": process.env.SITE_URL ?? "https://chatfreeai.com",
        "X-Title": "Chat Free AI",
      },
      body: JSON.stringify({
        model: model.openrouter,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: tool.maxOutputTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
    });
  } catch {
    for (const key of keys) await charge(key, session.periodStart, limit, -RESERVE_CREDITS, ttl);
    return deny(502, "upstream_error", "Could not reach the model provider. Your credits were not charged.");
  }

  if (!upstream.ok || !upstream.body) {
    for (const key of keys) await charge(key, session.periodStart, limit, -RESERVE_CREDITS, ttl);
    const detail = await upstream.text().catch(() => "");
    console.error("openrouter tool error", upstream.status, detail.slice(0, 500));
    return deny(502, "upstream_error", "The model provider returned an error. Your credits were not charged.");
  }

  // --- stream through, then settle the real cost --------------------------
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const reader = upstream.body.getReader();

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
        // Settle: charge the real usage, minus what we already reserved.
        const { weight, usd, source } = await effectiveWeight(
          model,
          promptTokens,
          completionTokens,
          await livePrices().catch(() => new Map()),
        );
        const credits = Math.ceil((promptTokens + completionTokens) * weight);
        const delta = credits - RESERVE_CREDITS;
        for (const key of keys) await charge(key, session.periodStart, limit, delta, ttl);

        if (process.env.LOG_MARGIN === "1") {
          console.log(
            `[margin][tool:${tool.slug}] ${model.id} in=${promptTokens} out=${completionTokens} ` +
              `credits=${credits} cost=$${usd.toFixed(6)} priced-from=${source}`,
          );
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, credits })}\n\n`));
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
