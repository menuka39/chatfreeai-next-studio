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
}

export async function callGemini(req: GeminiRequest): Promise<Response> {
  const systemFromMessages = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const system = [req.system, systemFromMessages].filter(Boolean).join("\n\n");

  const contents = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({
      // Gemini calls the assistant "model"; anything else is treated as user
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

  const url = `${req.baseUrl}/models/${encodeURIComponent(req.model)}:streamGenerateContent?alt=sse`;

  return fetch(url, {
    method: "POST",
    headers: {
      "x-goog-api-key": req.apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      generationConfig: { maxOutputTokens: req.maxTokens },
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
              usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
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
              completionTokens = ev.usageMetadata.candidatesTokenCount ?? completionTokens;
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
