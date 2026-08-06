/**
 * Where a chat request actually goes.
 *
 * Every model still has an OpenRouter id, and that stays the default. A
 * model can additionally declare a direct provider; when the matching API
 * key is set, the request goes straight there instead. No key, no change —
 * so adding a provider is opt-in per deployment and reversible by deleting
 * an environment variable.
 *
 * WHY THE FALLBACK MATTERS: going direct trades OpenRouter's automatic
 * failover for a single upstream. If that provider has an outage, every
 * model pointed at it stops working. Keeping OpenRouter as the fallback
 * means removing one variable restores service without a deploy.
 *
 * FOUR OF THESE SPEAK THE SAME PROTOCOL. OpenAI, DeepSeek, xAI and Ollama
 * all expose an OpenAI-shaped `/chat/completions` with SSE streaming, so
 * they share one adapter and differ only by base URL and key. Anthropic and
 * Gemini have their own request and stream formats and need real adapters —
 * which is why this file describes providers rather than special-casing
 * models.
 */

export type DirectProvider =
  "openai" | "anthropic" | "gemini" | "deepseek" | "xai" | "ollama";

/**
 * PRICING NOTE — read before adding a provider.
 *
 * Users are charged from the model's catalogue price, which is OpenRouter's
 * list price, and the margin audit checks against those same numbers. Going
 * direct changes what we PAY without changing what we CHARGE.
 *
 * That is safe while a provider's own price is at or below OpenRouter's,
 * which is the normal case: OpenRouter passes list prices through and takes
 * its margin on credit purchase rather than per token. If a provider ever
 * charges MORE than the OpenRouter listing for the same model, every request
 * routed to it loses money — and the margin audit would not notice, because
 * it audits the catalogue, not the route.
 *
 * So: when adding a provider or a model, check the provider's own pricing
 * page against `price` in lib/models.ts. If direct is dearer, either raise
 * the catalogue price (which also raises what users are charged) or leave
 * that model on OpenRouter by not giving it a `provider`.
 */

interface ProviderSpec {
  label: string;
  /** environment variable holding the key */
  envKey: string;
  /** optional override, e.g. a self-hosted Ollama address */
  envBaseUrl?: string;
  baseUrl: string;
  /** true when the provider accepts OpenAI's request and stream shape */
  openaiCompatible: boolean;
  /** Ollama runs locally and has no key at all */
  keyless?: boolean;
}

export const PROVIDERS: Record<DirectProvider, ProviderSpec> = {
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    baseUrl: "https://api.openai.com/v1",
    openaiCompatible: true,
  },
  deepseek: {
    label: "DeepSeek",
    envKey: "DEEPSEEK_API_KEY",
    baseUrl: "https://api.deepseek.com/v1",
    openaiCompatible: true,
  },
  xai: {
    label: "xAI",
    envKey: "XAI_API_KEY",
    baseUrl: "https://api.x.ai/v1",
    openaiCompatible: true,
  },
  ollama: {
    label: "Ollama",
    envKey: "OLLAMA_API_KEY",
    envBaseUrl: "OLLAMA_BASE_URL",
    baseUrl: "http://localhost:11434/v1",
    openaiCompatible: true,
    // self-hosted and usually unauthenticated — presence of a base URL is
    // what enables it, not a key
    keyless: true,
  },
  anthropic: {
    label: "Anthropic",
    envKey: "ANTHROPIC_API_KEY",
    baseUrl: "https://api.anthropic.com/v1",
    openaiCompatible: false,
  },
  gemini: {
    label: "Google Gemini",
    envKey: "GEMINI_API_KEY",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    openaiCompatible: false,
  },
};

/**
 * What remains of the direct-provider layer.
 *
 * Chat used to call some providers directly and fall back to OpenRouter. The
 * saving was small and the cost was real: every provider's own protocol and
 * its own model ids to maintain, and those ids drift — a model ships as
 * `-preview`, goes GA under a new number, and the old string 404s. Chat now
 * goes through OpenRouter only, which does provider failover itself.
 *
 * The table below survives because Video to Prompt still calls Google
 * directly: it needs Gemini's external-URL file input to read an uploaded
 * clip, and no aggregator exposes that.
 */
export {};
