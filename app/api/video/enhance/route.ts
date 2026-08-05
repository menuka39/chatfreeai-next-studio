import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { modelById } from "@/lib/models";
import { charge, nextUtcMidnight } from "@/lib/quota";
import { getSession, planFor, clientIp } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER_URL = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/chat/completions`;
const DAY_TTL = 60 * 60 * 36;

/**
 * Prompt enhancer.
 *
 * Video models reward specific, visual prompts — subject, action, camera move,
 * lighting, lens, mood — and most people write "a cat in a city". Rewriting is
 * the single cheapest quality lift available: a ~200-token chat completion
 * costing about $0.00005 versus a video generation costing dollars. Getting
 * the prompt right BEFORE spending video credits is the whole point, so this
 * is metered in calls per day rather than charged against the credit pool.
 */

const CAPS: Record<string, number> = { guest: 5, free: 25, paid: 300 };

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  let body: { prompt?: string; deviceId?: string; hasImage?: boolean };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }
  const prompt = (body.prompt ?? "").trim().slice(0, 1200);
  if (!prompt) return deny(400, "bad_request", "Write something first — even a few words is enough.");

  const session = await getSession(req);
  const tier = planFor(session) !== "free" ? "paid" : session.userId ? "free" : "guest";
  const cap = CAPS[tier];

  const day = new Date().toISOString().slice(0, 10);
  const ipHash = createHash("sha256").update(clientIp(req) + (body.deviceId ?? "")).digest("hex").slice(0, 32);
  const key = session.userId ? `q:venh:u:${session.userId}:${day}` : `q:venh:g:${ipHash}:${day}`;

  const res = await charge(key, "", cap, 1, DAY_TTL);
  if (!res.ok) {
    return deny(429, "enhance_limit_reached",
      `You've used today's ${cap} prompt rewrites. They reset at ${nextUtcMidnight().slice(11, 16)} UTC.`,
      { upgrade: tier !== "paid" });
  }

  const model = modelById("deepseek")!;
  const system =
    "You rewrite short ideas into prompts for an AI video model. Return ONLY the rewritten prompt — " +
    "no preamble, no quotes, no options, no explanation. One paragraph, 40-70 words. Cover, in this " +
    "order and only where it makes sense: subject and what it does, the setting, camera movement " +
    "(e.g. slow dolly in, handheld tracking shot, static wide), lighting and time of day, lens or " +
    "film look, and mood. Keep every concrete detail the user gave and never contradict them. Do not " +
    "add people, brands, logos or text-on-screen that the user didn't ask for. Describe only what is " +
    "visible — no backstory, no sound design unless the user mentioned audio.";

  const user = body.hasImage
    ? `The user is animating an existing image. Rewrite this into a prompt describing MOTION and CAMERA only, since the look is already set by the image:\n\n${prompt}`
    : `Rewrite this into a video prompt:\n\n${prompt}`;

  const refund = () => charge(key, "", Number.MAX_SAFE_INTEGER, -1, DAY_TTL);

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
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
        max_tokens: 260,
      }),
    });
  } catch {
    await refund();
    return deny(502, "upstream_error", "Could not reach the model. Nothing was counted.");
  }

  if (!upstream.ok) {
    await refund();
    return deny(502, "upstream_error", "The model returned an error. Nothing was counted.");
  }

  const json = await upstream.json();
  const text: string = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    await refund();
    return deny(502, "upstream_error", "The model returned nothing. Nothing was counted.");
  }

  return Response.json({ prompt: text, remaining: Math.max(0, cap - res.used), cap });
}
