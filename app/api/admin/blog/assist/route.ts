import { NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
export const maxDuration = 30;

function deny(status: number, code: string, message: string) {
  return Response.json({ error: code, message }, { status });
}

const OPENROUTER_URL = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/chat/completions`;

const ACTIONS = {
  improve: "Improve the writing — clearer sentences, better flow, same meaning and facts. Don't invent new claims.",
  grammar: "Fix grammar, spelling and punctuation only. Don't change the meaning, tone, or add/remove content.",
  shorter: "Make this noticeably more concise without losing the key points.",
  longer: "Expand this with more useful detail and examples, in the same voice — don't pad with filler.",
  continue: "Continue writing from where this leaves off, matching the tone and topic. Write only the continuation, not a repeat of the input.",
} as const;
type ActionId = keyof typeof ACTIONS;

const MAX_INPUT_CHARS = 12_000;

/**
 * POST { action, text } — a writing assist for the admin blog editor only.
 *
 * No credit metering here, unlike every public-facing AI feature elsewhere
 * in the app: this endpoint is reachable exclusively by an authenticated
 * admin (requireAdmin, same gate as every other /api/admin/* route), not by
 * site visitors, so there's no per-user quota to enforce — the protection
 * against runaway cost is the admin gate itself plus the input/output size
 * caps below, not a billing system.
 */
export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (!gate.ok) return gate.response;

  let body: { action?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const action = body.action as ActionId;
  if (!ACTIONS[action]) return deny(400, "bad_request", "Unknown action.");

  const text = (body.text ?? "").trim();
  if (!text) return deny(400, "bad_request", "Nothing to work with — write something first.");
  if (text.length > MAX_INPUT_CHARS) {
    return deny(400, "too_long", `That's too long for one request (max ${MAX_INPUT_CHARS.toLocaleString()} characters) — try it in smaller pieces.`);
  }

  const apiKey = openRouterKey();
  if (!apiKey) return deny(500, "not_configured", "OPENROUTER_API_KEY is not set on the server.");

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL ?? "https://chatfreeai.com",
      "X-Title": "Chat Free AI - Blog Assistant",
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      messages: [
        {
          role: "system",
          content:
            "You edit blog post content written in Markdown for an AI-tools website. " +
            "Preserve all Markdown syntax (headings, links, lists, code) exactly where it's structurally meaningful. " +
            "Return ONLY the edited text — no preamble, no explanation, no wrapping it in quotes or a code fence.",
        },
        { role: "user", content: `${ACTIONS[action]}\n\n---\n\n${text}` },
      ],
      max_tokens: 2000,
      temperature: 0.5,
    }),
    signal: AbortSignal.timeout(25_000),
  }).catch(() => null);

  if (!upstream || !upstream.ok) {
    return deny(502, "upstream_error", "The AI assistant didn't respond. Try again in a moment.");
  }

  const json = await upstream.json().catch(() => null);
  const result = json?.choices?.[0]?.message?.content?.trim();
  if (!result) return deny(502, "upstream_error", "The AI assistant returned nothing usable.");

  return Response.json({ result });
}
