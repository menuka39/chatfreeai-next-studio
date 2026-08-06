/**
 * Google Gemini adapter.
 *
 * Gemini differs from the OpenAI protocol in more places than Anthropic does:
 *
 *  ENDPOINT   The model is part of the URL, not the body, and streaming needs
 *             `?alt=sse`. WITHOUT IT GEMINI RETURNS ONE LARGE JSON ARRAY
 *             rather than a stream — the request still succeeds, so the
 *             symptom is a chat that shows nothing until the whole answer is
 *             ready, which is easy to mistake for slowness.
 *
 *  AUTH       `x-goog-api-key` header. The key can also go in the query
 *             string, but URLs end up in logs and proxies, so it stays in a
 *             header.
 *
 *  MESSAGES   `contents[]` with `parts[]`, and the assistant role is called
 *             "model". A system prompt is a separate `systemInstruction`.
 *
 *  RESPONSE   Text sits at `candidates[0].content.parts[].text` — parts is an
 *             ARRAY and a single chunk can carry several, so they are joined
 *             rather than indexed at [0]. There is no `[DONE]` terminator;
 *             the stream simply ends.
 *
 *  USAGE      `usageMetadata` repeats on every chunk with running totals, so
 *             the last value seen wins rather than being summed.
 */

export interface GeminiRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  system?: string;
  maxTokens: number;
  signal?: AbortSignal;
  /**
   * Media referenced by URL rather than uploaded.
   *
   * Gemini fetches these itself during processing, which is why a 90MB video
   * can be analysed without ever passing through our own server: we hand over
   * a link, not bytes. Limited to 100MB per request by Gemini, and the URL has
   * to be reachable without a login.
   */
  attachments?: { fileUri: string; mimeType: string }[];
  /**
   * How much of the budget the model may spend reasoning before it answers.
   *
   * On Gemini 3, maxOutputTokens is a COMBINED ceiling for thinking and
   * output, and the default level is "high" — so reasoning expands to fill
   * whatever you allow and the visible answer gets cut off mid-sentence. For
   * work that is description rather than deduction, "low" leaves the budget
   * for the thing the caller actually asked for.
   */
  thinkingLevel?: "minimal" | "low" | "medium" | "high";
}

export async function callGemini(req: GeminiRequest): Promise<Response> {
  const systemFromMessages = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const system = [req.system, systemFromMessages].filter(Boolean).join("\n\n");

  type Part = { text: string } | { file_data: { file_uri: string; mime_type: string } };

  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      // Gemini calls the assistant "model"; anything else is treated as user
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }] as Part[],
    }));

  // Media goes on the first user turn, ahead of its text, because the
  // instruction reads as being about the file that precedes it.
  if (req.attachments?.length) {
    const first = contents.find((c) => c.role === "user");
    if (first) {
      first.parts.unshift(
        ...req.attachments.map(
          (a): Part => ({ file_data: { file_uri: a.fileUri, mime_type: a.mimeType } }),
        ),
      );
    }
  }

  // Correct the model name if Google has renamed it — see resolveModelName.
  // Deliberately NOT a fallback to some other model: credits are charged on
  // the catalogue entry the caller picked, so silently answering from a
  // different tier would bill the user for a model they didn't get.
  const modelName = await resolveModelName(req.baseUrl, req.apiKey, req.model);
  const url = `${req.baseUrl}/models/${encodeURIComponent(modelName)}:streamGenerateContent?alt=sse`;

  return fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": req.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: {
        maxOutputTokens: req.maxTokens,
        ...(req.thinkingLevel ? { thinkingConfig: { thinkingLevel: req.thinkingLevel } } : {}),
      },
    }),
    signal: req.signal,
  });
}

/**
 * Re-emit a Gemini SSE stream as OpenAI-shaped chunks.
 *
 * Usage totals are carried on every chunk and are cumulative, so the final
 * values are whatever arrived last — summing them would multiply the charge
 * by the number of chunks.
 */
export function geminiToOpenAIStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let promptTokens = 0;
  let completionTokens = 0;

  const chunk = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;

            let ev: {
              candidates?: { content?: { parts?: { text?: string }[] } }[];
              usageMetadata?: {
                promptTokenCount?: number;
                candidatesTokenCount?: number;
                thoughtsTokenCount?: number;
              };
              error?: unknown;
            };
            try {
              ev = JSON.parse(payload);
            } catch {
              continue; // one malformed chunk shouldn't end a working stream
            }

            if (ev.error) {
              controller.enqueue(chunk({ error: { message: "The model provider reported an error." } }));
              continue;
            }

            // join every part — a chunk can carry more than one, and taking
            // [0] would silently drop text
            const text = (ev.candidates?.[0]?.content?.parts ?? [])
              .map((p) => p.text ?? "")
              .join("");
            if (text) {
              controller.enqueue(chunk({ choices: [{ delta: { content: text }, index: 0 }] }));
            }

            if (ev.usageMetadata) {
              // cumulative, so replace rather than add
              promptTokens = ev.usageMetadata.promptTokenCount ?? promptTokens;
              // Reasoning is reported apart from the answer but billed at the
              // same output rate, so leaving it out means paying Google for
              // tokens nobody is charged for.
              completionTokens =
                (ev.usageMetadata.candidatesTokenCount ?? 0) +
                (ev.usageMetadata.thoughtsTokenCount ?? 0) || completionTokens;
            }
          }
        }

        controller.enqueue(
          chunk({
            choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
            usage: {
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              total_tokens: promptTokens + completionTokens,
            },
          }),
        );
        // Gemini sends no terminator of its own; the route expects one
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}

/**
 * Correct a model name that Google has since renamed.
 *
 * Catalogue ids are written from announcements, and the real names drift: a
 * model ships as `-preview`, goes GA under a new number, and the old string
 * starts returning 404 — which is exactly how `gemini-3-flash` broke. Checking
 * against ListModels turns that class of failure into a no-op.
 *
 * Only name VARIANTS are accepted (exact, then prefix, so `gemini-3.1-pro`
 * still finds `gemini-3.1-pro-preview`). Never a different model: substituting
 * across tiers would change both the answer and the true cost while the user
 * is billed at the rate of the model they chose.
 *
 * If nothing matches, the requested name is returned unchanged so the caller
 * gets Google's own error rather than a guess of ours.
 */
export async function resolveModelName(
  baseUrl: string,
  apiKey: string,
  requested: string,
): Promise<string> {
  const names = await listGeminiModels(baseUrl, apiKey);
  if (!names.length) return requested;
  if (names.includes(requested)) return requested;
  const variant = names.find((n) => n.startsWith(requested));
  if (variant) {
    console.warn(`[gemini] "${requested}" not found; using "${variant}"`);
    return variant;
  }
  return requested;
}

/**
 * Pick a Gemini model name that the API will actually accept.
 *
 * Model ids in our catalogue are written from announcements, and Google's real
 * names drift: a model ships as `-preview`, goes GA under a new number, and the
 * old string starts 404ing. Hard-coding one name means a rename takes a feature
 * down until someone notices.
 *
 * So ask. ListModels is one cheap call, cached for an hour, and the answer is
 * authoritative. `preferred` is tried in order — first as an exact match, then
 * as a prefix, so `gemini-3.6-flash` still matches `gemini-3.6-flash-preview`.
 */
interface ModelCache {
  at: number;
  names: string[];
}
let modelCache: ModelCache | null = null;
const MODEL_TTL = 60 * 60 * 1000;

export async function listGeminiModels(baseUrl: string, apiKey: string): Promise<string[]> {
  if (modelCache && Date.now() - modelCache.at < MODEL_TTL) return modelCache.names;
  try {
    const res = await fetch(`${baseUrl}/models?pageSize=200`, {
      headers: { "x-goog-api-key": apiKey },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return modelCache?.names ?? [];
    const data = (await res.json()) as {
      models?: { name?: string; supportedGenerationMethods?: string[] }[];
    };
    const names = (data.models ?? [])
      // only models we can actually stream text from
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => (m.name ?? "").replace(/^models\//, ""))
      .filter(Boolean);
    if (names.length) modelCache = { at: Date.now(), names };
    return names;
  } catch {
    return modelCache?.names ?? [];
  }
}

export async function resolveGeminiModels(
  baseUrl: string,
  apiKey: string,
  preferred: string[],
  /**
   * Also accept anything this returns true for, after the named preferences,
   * newest version first.
   *
   * Named preferences go stale the moment Google ships a new number — the list
   * has to be edited and redeployed before the model can be used at all. A
   * predicate picks up successors on its own, so a release adds a fallback
   * instead of requiring one. It takes the parsed version precisely so a
   * caller can say "3 or newer" rather than pattern-matching a major it has
   * to guess in advance.
   */
  alsoMatch?: (name: string, version: number) => boolean,
): Promise<string[]> {
  const names = await listGeminiModels(baseUrl, apiKey);
  // Nothing to check against (ListModels blocked or down) — trust the
  // preferences as written rather than failing outright.
  if (!names.length) return preferred;

  const out: string[] = [];
  for (const want of preferred) {
    const hit = names.find((n) => n === want) ?? names.find((n) => n.startsWith(want));
    if (hit && !out.includes(hit)) out.push(hit);
  }

  if (alsoMatch) {
    const rest = names
      .filter((n) => !out.includes(n) && alsoMatch(n, versionOf(n)))
      // highest version first: "4" beats "3.6" beats "3.5"
      .sort((a, b) => versionOf(b) - versionOf(a));
    out.push(...rest);
  }
  return out;
}

/** The numeric version in a model id, e.g. "gemini-3.6-flash" -> 3.6. */
function versionOf(name: string): number {
  const m = /gemini-(\d+(?:\.\d+)?)/.exec(name);
  return m ? parseFloat(m[1]) : 0;
}

export async function resolveGeminiModel(
  baseUrl: string,
  apiKey: string,
  preferred: string[],
): Promise<string | null> {
  return (await resolveGeminiModels(baseUrl, apiKey, preferred))[0] ?? null;
}
