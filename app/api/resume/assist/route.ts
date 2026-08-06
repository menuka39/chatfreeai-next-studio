import { NextRequest } from "next/server";
import { createHash } from "crypto";
import { modelById, canUseModel, effectiveWeight } from "@/lib/models";
import { livePrices } from "@/lib/price-oracle";
import { charge, nextUtcMidnight } from "@/lib/quota";
import { getSession, planFor, clientIp } from "@/lib/session";
import { resumeAccess, assistKey } from "@/lib/resume-access";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 60;

const OPENROUTER_URL = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/chat/completions`;
const DAY_TTL = 60 * 60 * 36;

type Action = "summary" | "bullet" | "skills" | "headline";
const ACTIONS: Action[] = ["summary", "bullet", "skills", "headline"];

function deny(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
  return Response.json({ error: code, message, ...extra }, { status });
}

function buildPrompt(action: Action, ctx: Record<string, string>) {
  const role = ctx.targetRole?.trim() || "the target role";
  switch (action) {
    case "summary":
      return {
        system:
          "You write resume summaries. Output ONLY the summary text, 2-4 sentences, no heading, " +
          "no quotes, no markdown. Never invent employers, titles, dates or numbers the user did not " +
          "give you — write around a gap rather than filling it.",
        user: `Target role: ${role}\nBackground notes:\n${ctx.notes?.trim() || "(none given)"}\n\nWrite the summary.`,
      };
    case "headline":
      return {
        system:
          "You write a one-line resume headline (job title, optionally with a specialism). Output ONLY " +
          "the headline, no quotes, no trailing punctuation, under 8 words.",
        user: `Notes about the person's role/background:\n${ctx.notes?.trim() || role}\n\nWrite the headline.`,
      };
    case "bullet":
      return {
        system:
          "You rewrite ONE resume bullet point to be achievement-focused: start with a strong action " +
          "verb, keep it to one line, add a measurable result ONLY if the user's notes support one — " +
          "never invent a number. Output ONLY the rewritten bullet, no quotes, no leading dash.",
        user: `Role: ${role}\nCurrent bullet or rough note:\n${ctx.notes?.trim() || "(empty)"}`,
      };
    case "skills":
      return {
        system:
          "Suggest resume skills as a comma-separated list, most relevant first, 8-14 items, no " +
          "explanations, no numbering. Base them on the target role and any notes given — do not " +
          "invent specific tools the person didn't mention unless they are near-universal for the role.",
        user: `Target role: ${role}\nNotes:\n${ctx.notes?.trim() || "(none given)"}\n\nSuggest skills.`,
      };
  }
}

/**
 * AI suggestions for individual resume fields.
 *
 * Metered in CALLS PER DAY by entitlement tier (see lib/resume-access.ts) —
 * not against the chat credit pool. That keeps credits for the genuinely
 * expensive tools and means a monthly subscriber never pays credits for a
 * feature their subscription already includes.
 */
export async function POST(req: NextRequest) {
  const apiKey = openRouterKey();
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  let body: { action?: Action; modelId?: string; targetRole?: string; notes?: string; deviceId?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }
  if (!body.action || !ACTIONS.includes(body.action)) return deny(400, "bad_request", "Unknown action.");

  const model = modelById(body.modelId ?? "deepseek");
  if (!model) return deny(400, "unknown_model", "That model is not available.");

  const session = await getSession(req);
  const access = await resumeAccess(session);
  if (!canUseModel(model, planFor(session))) {
    return deny(403, "model_locked", `${model.name} is unlocked on our ${model.minPlan} package.`);
  }

  const ipHash = createHash("sha256").update(clientIp(req) + (body.deviceId ?? "")).digest("hex").slice(0, 32);
  const key = assistKey(session, ipHash);

  // one unit per call
  const res = await charge(key, "", access.dailyAssists, 1, DAY_TTL);
  if (!res.ok) {
    return deny(429, "assist_limit_reached",
      access.paid
        ? `You've used today's ${access.dailyAssists} AI suggestions. Editing, templates and PDF downloads stay unlimited — suggestions reset at ${nextUtcMidnight().slice(11, 16)} UTC.`
        : `You've used today's ${access.dailyAssists} free AI suggestions. Editing and PDF downloads stay unlimited — or get more suggestions with a Resume Pass.`,
      { tier: access.tier, dailyAssists: access.dailyAssists, resetsAt: nextUtcMidnight(), upgrade: !access.paid },
    );
  }

  const refund = () => charge(key, "", Number.MAX_SAFE_INTEGER, -1, DAY_TTL);
  const { system, user } = buildPrompt(body.action, { targetRole: body.targetRole ?? "", notes: body.notes ?? "" });

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
        max_tokens: 300,
      }),
    });
  } catch {
    await refund();
    return deny(502, "upstream_error", "Could not reach the model provider. That suggestion wasn't counted.");
  }

  if (!upstream.ok) {
    await refund();
    const detail = await upstream.text().catch(() => "");
    console.error("resume-assist upstream error", upstream.status, detail.slice(0, 300));
    return deny(502, "upstream_error", "The model provider returned an error. That suggestion wasn't counted.");
  }

  const json = await upstream.json();
  const text: string = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) {
    await refund();
    return deny(502, "upstream_error", "The model returned nothing. That suggestion wasn't counted.");
  }

  if (process.env.LOG_MARGIN === "1") {
    const promptTokens = json.usage?.prompt_tokens ?? 0;
    const completionTokens = json.usage?.completion_tokens ?? 0;
    const { usd, source } = await effectiveWeight(model, promptTokens, completionTokens, await livePrices().catch(() => new Map()));
    console.log(
      `[margin][resume-assist:${body.action}] tier=${access.tier} ${model.id} ` +
        `in=${promptTokens} out=${completionTokens} cost=$${usd.toFixed(6)} priced-from=${source}`,
    );
  }

  return Response.json({
    text,
    tier: access.tier,
    used: res.used,
    dailyAssists: access.dailyAssists,
    remaining: Math.max(0, access.dailyAssists - res.used),
  });
}

/** GET — what this visitor is entitled to, for the builder UI. */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  const access = await resumeAccess(session);
  return Response.json({
    tier: access.tier,
    label: access.label,
    dailyAssists: access.dailyAssists,
    paid: access.paid,
    unlimitedBuilder: true,
  });
}
