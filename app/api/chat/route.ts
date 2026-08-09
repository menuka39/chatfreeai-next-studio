import { NextRequest } from "next/server";
import { modelById, canUseModel, effectiveWeight, unlimitedModels } from "@/lib/models";
import {
  chatFeatures,
  featureKey,
  WEB_SEARCH_USD,
  MAX_REQUEST_CHARS,
} from "@/lib/chat-features";
import {
  turnstileConfigured,
  verifyTurnstile,
  mintHumanCookie,
  humanCookieValid,
  humanCookieOptions,
  HUMAN_COOKIE,
} from "@/lib/turnstile";
import { createHash } from "crypto";
import { livePrices } from "@/lib/price-oracle";
import { packageById, restrictionsFor, FREE_LIMITS } from "@/lib/packages";
import { effectiveCredits, type LimitId } from "@/lib/plan-limits";
import {
  takePace,
  charge,
  guestKeys,
  userDailyKey,
  userMonthlyKey,
  utcDayKey,
  nextUtcMidnight,
  limitForTier,
  RESERVE_CREDITS,
} from "@/lib/quota";
import { getSession, planFor, isGuest, clientIp } from "@/lib/session";
import { openRouterKey } from "@/lib/openrouter";

export const runtime = "nodejs";
// Vercel: streaming a long reply can outlive the default.
export const maxDuration = 300;

const OPENROUTER_URL = `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1/chat/completions`;

function deny(
  status: number,
  code: string,
  message: string,
  extra: Record<string, unknown> = {},
) {
  return Response.json({ error: code, message, ...extra }, { status });
}

export async function POST(req: NextRequest) {
  const apiKey = openRouterKey();
  if (!apiKey)
    return deny(500, "not_configured", "OPENROUTER_API_KEY is not set.");

  let body: {
    modelId?: string;
    /** content may be a string, or OpenAI-style parts when images are attached */
    messages?: { role: string; content: unknown }[];
    deviceId?: string;
    /** merge live web results into the answer */
    webSearch?: boolean;
    /** multi-search research pass — costs several searches */
    research?: boolean;
    /** system instruction assembled from skills and the active project */
    system?: string;
    /** Turnstile response, sent by guests on their first message */
    turnstileToken?: string;
  };
  try {
    body = await req.json();
  } catch {
    return deny(400, "bad_request", "Invalid JSON body.");
  }

  const model = modelById(body.modelId ?? "");
  if (!model) return deny(400, "unknown_model", "That model is not available.");
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return deny(400, "bad_request", "messages must be a non-empty array.");
  }

  const session = await getSession(req);
  const plan = planFor(session);
  const guest = isGuest(session);
  const limits = restrictionsFor(plan, guest);

  // --- premium model gating (base models are open to everyone) ------------
  if (!canUseModel(model, plan)) {
    return deny(
      403,
      "model_locked",
      `${model.name} is unlocked on our ${model.minPlan} package.`,
      {
        requiredPlan: model.minPlan,
        modelName: model.name,
      },
    );
  }

  const features = chatFeatures(session);
  const ipHash = createHash("sha256")
    .update(clientIp(req) + (body.deviceId ?? ""))
    .digest("hex")
    .slice(0, 32);

  /* ---- attachment limits, enforced HERE and not only in the UI ----------
   * The composer hides what a tier can't use, but a hidden button is not a
   * limit — anyone can post to this endpoint directly. Attachments arrive
   * inlined in the message content, so the two things worth checking on the
   * server are whether images are allowed at all (they need a vision model and
   * cost noticeably more) and how large the whole request is. */
  const hasImageParts = body.messages.some(
    (m) =>
      Array.isArray(m.content) &&
      (m.content as { type?: string }[]).some((p) => p?.type === "image_url"),
  );
  if (hasImageParts && !features.imageAttachments) {
    return deny(403, "feature_locked", "Sign in to send images.", {
      feature: "attachments",
      signIn: true,
    });
  }

  const requestChars = body.messages.reduce(
    (n, m) =>
      n +
      (typeof m.content === "string"
        ? m.content.length
        : JSON.stringify(m.content).length),
    0,
  );
  const charLimit = MAX_REQUEST_CHARS[features.tier];
  if (requestChars > charLimit) {
    return deny(
      413,
      "request_too_large",
      features.paid
        ? "That's too much text for one message — try attaching fewer or smaller files."
        : "That's too much text for this plan. Sign in, or upgrade, to send larger files.",
      { limit: charLimit, sent: requestChars, signIn: !session.userId },
    );
  }

  /* ---- bot check, guests only -------------------------------------------
   * Runs before any credit is reserved and before anything reaches the
   * provider, so a bot never costs us a request. Signed-in users skip it —
   * their account is the accountability. */
  let mintHuman = false;
  if (features.tier === "guest" && turnstileConfigured()) {
    const alreadyHuman = humanCookieValid(req.cookies.get(HUMAN_COOKIE)?.value);
    if (!alreadyHuman) {
      const token =
        typeof body.turnstileToken === "string" ? body.turnstileToken : "";
      if (!token) {
        return deny(
          403,
          "verification_required",
          "Quick check that you're not a bot.",
          {
            turnstile: true,
            siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          },
        );
      }
      const result = await verifyTurnstile(token, clientIp(req));
      if (!result.ok) {
        console.warn("[turnstile] rejected", result.codes);
        return deny(
          403,
          "verification_failed",
          "That check didn't pass. Please try again.",
          {
            turnstile: true,
            siteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
          },
        );
      }
      mintHuman = true;
    }
  }

  /* ---- web search / research entitlement ---------------------------------
   * Metered in CALLS PER DAY, not credits: one search costs $0.005, which is
   * about five times a guest's entire daily credit allowance. Billing it from
   * the pool would make the feature unusable for exactly the people we're
   * giving it to. */
  const wantsResearch = Boolean(body.research);
  const wantsSearch = Boolean(body.webSearch) || wantsResearch;

  if (wantsResearch && !features.research) {
    return deny(
      403,
      "feature_locked",
      "Research is available once you sign in.",
      { feature: "research", signIn: true },
    );
  }
  if (wantsSearch && !features.webSearch) {
    return deny(
      403,
      "feature_locked",
      "Web search isn't available on this plan.",
      { feature: "webSearch" },
    );
  }

  const DAY_TTL = 60 * 60 * 36;
  let searchCharged = 0;

  if (wantsSearch) {
    const kind = wantsResearch ? "research" : "search";
    const cap = wantsResearch
      ? features.researchDaily
      : features.webSearchDaily;
    const key = featureKey(kind, session, ipHash);
    const res = await charge(key, "", cap, 1, DAY_TTL);
    if (!res.ok) {
      return deny(
        429,
        "feature_limit_reached",
        wantsResearch
          ? `You've used today's ${cap} research runs. Normal chat and web search still work.`
          : `You've used today's ${cap} web searches. Normal chat still works${features.paid ? "" : " — signing in gives you more"}.`,
        { feature: kind, cap, signIn: !features.paid && !session.userId },
      );
    }
    searchCharged = wantsResearch ? features.researchDepth : 1;
  }

  // --- trim history: cheaper for us, and enforces the per-plan limit ------
  const messages = body.messages.slice(-limits.historyMessages);

  /* System prompt: skills and project brief come from the client, so they're
   * capped and never trusted to be small. Research adds a citation
   * instruction, because an answer built from live sources that doesn't say
   * where anything came from is worse than no search at all. */
  const clientSystem =
    typeof body.system === "string" ? body.system.slice(0, 4000).trim() : "";
  const researchSystem = wantsResearch
    ? "Answer using the web results provided. Cite the source next to each specific claim, " +
      "prefer recent and primary sources, and say plainly when the results don't answer part " +
      "of the question rather than filling the gap from memory."
    : wantsSearch
      ? "Web results are provided. Use them for anything time-sensitive and name the source for specific facts."
      : "";
  const systemPrompt =
    [clientSystem, researchSystem].filter(Boolean).join("\n\n") || null;

  // --- pick the quota bucket ---------------------------------------------
  const day = utcDayKey();
  const resetsAt = nextUtcMidnight();
  let keys: string[];
  let period: string;
  let limit: number;
  let ttl = 60 * 60 * 36;

  /*
   * Uncapped models skip the credit ledger entirely.
   *
   * Charging them and then calling the result "unlimited" would be the same
   * false promise the meta description used to make — the user hits a wall the
   * page told them was not there. Pace limiting takes its place: it stops a
   * script without ever interrupting someone typing.
   */
  const uncapped = plan === "free" && model.unlimited === true;
  if (uncapped) {
    const g = guestKeys(clientIp(req), body.deviceId ?? null);
    const pace = await takePace(session.userId ?? g.device);
    if (!pace.ok) {
      return deny(
        429,
        "too_fast",
        "That is a lot of messages at once — give it a moment and send it again.",
        { retryAfter: pace.retryAfter },
      );
    }
  }

  if (uncapped) {
    // nothing to reserve, nothing to settle
    keys = [];
    period = day;
    limit = 0;
  } else if (plan !== "free") {
    // admin-adjustable in /admin/limits — falls back to lib/packages.ts if never overridden
    const pkgCredits = await effectiveCredits(session.packageId! as LimitId);
    keys = [userMonthlyKey(session.userId!, session.periodStart)];
    period = session.periodStart;
    limit = pkgCredits;
    ttl = 60 * 60 * 24 * 40;
  } else if (!guest) {
    keys = [userDailyKey(session.userId!)];
    period = day;
    limit = limitForTier("free");
  } else {
    const g = guestKeys(clientIp(req), body.deviceId ?? null);
    keys = [g.device, g.ip]; // clearing cookies still hits the IP counter
    period = day;
    limit = limitForTier("guest");
  }

  // --- reserve up front (blocks parallel-request abuse) -------------------
  for (const key of keys) {
    const res = await charge(key, period, limit, RESERVE_CREDITS, ttl);
    if (!res.ok) {
      // the quota store being down is not the user running out of credits
      if ("storeDown" in res && res.storeDown) {
        console.error(
          "[chat] quota store unavailable:",
          res.reason ?? "unknown",
        );
        return deny(
          503,
          "quota_store_unavailable",
          "Something went wrong on our side. Please try again in a moment.",
        );
      }
      return deny(
        429,
        plan !== "free" ? "package_exhausted" : "daily_limit_reached",
        plan !== "free"
          ? "You've used all the credits in your package for this billing period."
          : "You've reached today's free limit. It refills at midnight UTC.",
        { remaining: res.remaining, limit, resetsAt, plan },
      );
    }
  }

  // --- call OpenRouter -----------------------------------------------------
  // One upstream, deliberately. Calling providers directly saved a little on
  // their list prices, but it meant maintaining each provider's own protocol
  // and its own model ids — and those ids drift: a model ships as `-preview`,
  // goes GA under a new number, and the old string starts returning 404. That
  // is a whole class of outage bought for a small discount, and OpenRouter
  // already does provider failover behind its own API.
  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.SITE_URL ?? "https://chatfreeai.com",
      "X-Title": "Chat Free AI",
    },
    body: JSON.stringify({
      model: model.openrouter,
      // A system instruction only exists when the user turned on skills or is
      // inside a project — otherwise the model behaves exactly as before.
      messages: systemPrompt
        ? [{ role: "system", content: systemPrompt }, ...messages]
        : messages,
      stream: true,
      max_tokens: wantsResearch
        ? Math.max(limits.maxOutputTokens, 2000)
        : limits.maxOutputTokens,
      // OpenRouter reports usage here; without it the margin oracle has no
      // token counts to settle against.
      usage: { include: true },
      // OpenRouter's web plugin (Exa). max_results drives the cost, so research
      // asks for more only because the user spent a research run to get it.
      ...(wantsSearch
        ? {
            plugins: [
              {
                id: "web",
                max_results: wantsResearch ? features.researchDepth * 2 : 5,
                search_prompt: wantsResearch
                  ? "Search thoroughly across several angles of this question. Prefer primary and recent sources."
                  : undefined,
              },
            ],
          }
        : {}),
    }),
    // When the user hits Stop the browser aborts this request; forwarding the
    // signal cancels the provider call too. Without it we would stop showing
    // the answer but still be billed for every token it went on to generate.
    signal: req.signal,
  });

  const active = upstream;

  if (!active.ok || !active.body) {
    const detail = await active.text().catch(() => "");
    console.error("chat upstream error", active.status, detail.slice(0, 500));
    return deny(
      502,
      "upstream_error",
      "The model provider returned an error. Please try again.",
    );
  }

  // --- stream through, settle credits at the end -------------------------
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  /** ~4 characters per token — close enough to bill a cancelled reply fairly. */
  const estimateTokens = (msgs: { role: string; content: unknown }[]) =>
    Math.ceil(
      msgs.reduce(
        (n, m) =>
          n +
          (typeof m.content === "string"
            ? m.content.length
            : JSON.stringify(m.content).length),
        0,
      ) / 4,
    );

  let streamReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let settled = false;
  let seenPromptTokens = 0;
  let streamedChars = 0;

  /**
   * Charge for what was actually produced.
   *
   * On a normal finish OpenRouter reports real usage. On a cancel it never
   * sends the usage block, so completion tokens are estimated from the
   * characters we streamed (~4 chars per token). Estimating is the honest
   * option: leaving it at the reserve alone would let repeated start-and-stop
   * generations run essentially free.
   */
  const billedModel = model;
  async function settle(
    promptTokens: number,
    completionTokens: number,
    estimated: boolean,
  ) {
    if (settled) return;
    settled = true;
    const { weight, usd, source } = await effectiveWeight(
      billedModel,
      promptTokens,
      completionTokens,
      await livePrices().catch(() => new Map()),
    );
    const credits = Math.ceil((promptTokens + completionTokens) * weight);
    const settlement = credits - RESERVE_CREDITS;
    if (settlement > 0) {
      for (const key of keys) {
        await charge(key, period, Number.MAX_SAFE_INTEGER, settlement, ttl);
      }
    }
    if (process.env.LOG_MARGIN === "1") {
      console.log(
        `[margin]${wantsSearch ? (wantsResearch ? "[research]" : "[search]") : ""}${estimated ? "[cancelled]" : ""} ` +
          `${billedModel.id} in=${promptTokens} out=${completionTokens} credits=${credits} ` +
          `cost=$${usd.toFixed(6)}${searchCharged ? ` +search=$${(searchCharged * WEB_SEARCH_USD).toFixed(4)}` : ""} priced-from=${source}`,
      );
    }
    return credits;
  }

  const stream = new ReadableStream({
    async start(controller) {
      // `active`, not `upstream` — on a fallback these are different
      // responses, and the original one has already been drained.
      //
      // Anthropic's stream is converted to OpenAI-shaped chunks first, so
      // One upstream, one wire format — nothing to translate.
      const reader = active.body!.getReader();
      streamReader = reader;
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
                completionTokens =
                  json.usage.completion_tokens ?? completionTokens;
                seenPromptTokens = promptTokens;
              }
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                streamedChars += delta.length;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`),
                );
              }
            } catch {
              /* keep-alive or partial frame */
            }
          }
        }

        // Weight is recomputed from the live price when available, so a
        // provider price rise can't make this model unprofitable.
        const credits = await settle(promptTokens, completionTokens, false);

        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ done: true, credits, resetsAt })}\n\n`,
          ),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        // An abort is the user pressing Stop, not a failure — don't surface it
        // as an error, and don't lose the billing for what did stream.
        const isAbort =
          err instanceof Error &&
          (err.name === "AbortError" || /aborted/i.test(err.message));
        if (!isAbort) {
          console.error("stream error", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "stream_failed" })}\n\n`,
            ),
          );
        }
      } finally {
        // Charge for the partial answer. settle() is idempotent, so a normal
        // finish (which already settled with real usage) is unaffected.
        await settle(
          promptTokens || seenPromptTokens || estimateTokens(messages),
          completionTokens || Math.ceil(streamedChars / 4),
          completionTokens === 0,
        );
        try {
          controller.close();
        } catch {
          /* already closed by the abort */
        }
      }
    },

    /**
     * The browser hung up — almost always because the user pressed Stop.
     * Release the provider connection so we stop being billed, then settle for
     * the partial answer they did receive.
     */
    async cancel() {
      try {
        await streamReader?.cancel();
      } catch {
        /* already gone */
      }
      const estimatedCompletion = Math.ceil(streamedChars / 4);
      await settle(
        seenPromptTokens || estimateTokens(messages),
        estimatedCompletion,
        true,
      );
    },
  });

  const response = new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

  // Remember that this browser passed, so we don't challenge every message.
  if (mintHuman) {
    response.headers.append(
      "Set-Cookie",
      `${HUMAN_COOKIE}=${mintHumanCookie()}; Max-Age=${humanCookieOptions.maxAge}; Path=/; SameSite=Lax; HttpOnly${
        humanCookieOptions.secure ? "; Secure" : ""
      }`,
    );
  }

  return response;
}

/** GET — the feature set for this visitor, so the composer can show the truth. */
export async function GET(req: NextRequest) {
  const session = await getSession(req);
  const f = chatFeatures(session);
  return Response.json({
    tier: f.tier,
    label: f.label,
    /*
     * The daily allowance, so the composer can state the real figure.
     * It is adjustable from /admin/limits, and a number typed into the UI
     * would keep claiming the old one after a change.
     */
    // names, so the composer can say which models are uncapped without
    // duplicating the catalogue on the client
    unlimitedModels: unlimitedModels.map((m) => m.name),
    dailyCredits: FREE_LIMITS.guest,
    signedInDailyCredits: FREE_LIMITS.free,
    turnstileSiteKey:
      f.tier === "guest" && turnstileConfigured()
        ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        : null,
    paid: f.paid,
    signedIn: Boolean(session.userId),
    webSearch: f.webSearch,
    webSearchDaily: f.webSearchDaily,
    research: f.research,
    researchDaily: f.researchDaily,
    attachments: f.attachments,
    maxAttachments: f.maxAttachments,
    maxAttachmentMb: f.maxAttachmentMb,
    imageAttachments: f.imageAttachments,
    pdfAttachments: f.pdfAttachments,
    zipAttachments: f.zipAttachments,
    skills: f.skills,
    maxSkills: f.maxSkills,
    projects: f.projects,
    maxProjects: f.maxProjects,
  });
}
