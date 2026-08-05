/**
 * Anthropic adapter.
 *
 * Unlike OpenAI, DeepSeek and xAI — which all speak the same protocol and
 * need nothing but a base URL — Anthropic differs in both directions, so the
 * translation happens here rather than being smeared through the chat route:
 *
 *  REQUEST   `system` is a top-level field, not a message with role "system".
 *            Auth is `x-api-key`, not a bearer token, and an
 *            `anthropic-version` header is mandatory.
 *
 *  RESPONSE  Text arrives as `content_block_delta` events rather than
 *            `choices[].delta.content`, and token usage is split across two
 *            events: input counts land on `message_start`, output counts on
 *            `message_delta` at the very end.
 *
 * Everything is converted back into the OpenAI chunk shape the route already
 * parses, so quota settlement, the margin oracle and the client stream reader
 * keep working untouched.
 */

const ANTHROPIC_VERSION = "2023-06-01";

export interface AnthropicRequest {
  baseUrl: string;
  apiKey: string;
  model: string;
  messages: { role: string; content: string }[];
  system?: string;
  maxTokens: number;
  signal?: AbortSignal;
}

export async function callAnthropic(req: AnthropicRequest): Promise<Response> {
  // Anthropic rejects a "system" role inside messages, so any system turn is
  // lifted out. A conversation that started elsewhere can legitimately
  // contain one, which is why this filters rather than assuming.
  const systemFromMessages = req.messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const system = [req.system, systemFromMessages].filter(Boolean).join("\n\n") || undefined;

  const messages = req.messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content }));

  return fetch(`${req.baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": req.apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: req.model,
      // required by Anthropic, unlike the OpenAI protocol where it's optional
      max_tokens: req.maxTokens,
      stream: true,
      ...(system ? { system } : {}),
      messages,
    }),
    signal: req.signal,
  });
}

/**
 * Re-emit an Anthropic SSE stream as OpenAI-shaped chunks.
 *
 * Usage is accumulated rather than forwarded per event: input tokens are only
 * known at the start and output tokens only at the end, so both are held and
 * emitted together in a final chunk. Reporting them separately would leave
 * the route settling a charge against half the real cost.
 */
export function anthropicToOpenAIStream(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const chunk = (obj: unknown) => encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);

  return new ReadableStream({
    async start(controller) {
      const reader = body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // process whole lines only — a network chunk can split one in half
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            const trimmed = line.trim();
            // `event:` lines duplicate the type already inside the JSON, and
            // ping events carry nothing
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (!payload) continue;

            let ev: {
              type?: string;
              delta?: { type?: string; text?: string; stop_reason?: string };
              message?: { usage?: { input_tokens?: number; output_tokens?: number } };
              usage?: { output_tokens?: number };
            };
            try {
              ev = JSON.parse(payload);
            } catch {
              continue; // a malformed event must not kill a working stream
            }

            if (ev.type === "message_start") {
              inputTokens = ev.message?.usage?.input_tokens ?? 0;
              outputTokens = ev.message?.usage?.output_tokens ?? 0;
            } else if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
              controller.enqueue(
                chunk({ choices: [{ delta: { content: ev.delta.text ?? "" }, index: 0 }] }),
              );
            } else if (ev.type === "message_delta") {
              // final output count arrives here, and it supersedes the
              // placeholder from message_start
              if (typeof ev.usage?.output_tokens === "number") outputTokens = ev.usage.output_tokens;
            } else if (ev.type === "error") {
              controller.enqueue(chunk({ error: { message: "The model provider reported an error." } }));
            }
          }
        }

        // one usage chunk at the end, in the shape the route already reads
        controller.enqueue(
          chunk({
            choices: [{ delta: {}, index: 0, finish_reason: "stop" }],
            usage: {
              prompt_tokens: inputTokens,
              completion_tokens: outputTokens,
              total_tokens: inputTokens + outputTokens,
            },
          }),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });
}
