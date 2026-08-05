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

export type DirectProvider = "openai" | "anthropic" | "gemini" | "deepseek" | "xai" | "ollama";

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

export interface ResolvedRoute {
  kind: "direct" | "openrouter";
  provider?: DirectProvider;
  baseUrl: string;
  apiKey: string;
  /** the model id to send — provider-native when direct, OpenRouter's otherwise */
  model: string;
  openaiCompatible: boolean;
}

/**
 * Decide where one request goes.
 *
 * `directModel` is the provider's own id for the model (`gpt-4o-mini`),
 * which is not always the tail of the OpenRouter id — so it is stated
 * explicitly rather than derived by string-splitting, which would break
 * silently the first time a naming convention differed.
 */
export function resolveRoute(opts: {
  openrouterModel: string;
  provider?: DirectProvider;
  directModel?: string;
}): ResolvedRoute {
  const openrouter: ResolvedRoute = {
    kind: "openrouter",
    baseUrl: `${process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai"}/api/v1`,
    apiKey: process.env.OPENROUTER_API_KEY ?? "",
    model: opts.openrouterModel,
    openaiCompatible: true,
  };

  if (!opts.provider || !opts.directModel) return openrouter;

  const spec = PROVIDERS[opts.provider];
  const key = process.env[spec.envKey] ?? "";
  const baseUrl = (spec.envBaseUrl ? process.env[spec.envBaseUrl] : "") || spec.baseUrl;

  // Ollama is enabled by having somewhere to reach it; everyone else by a key
  const configured = spec.keyless ? Boolean(spec.envBaseUrl && process.env[spec.envBaseUrl]) : Boolean(key);
  if (!configured) return openrouter;

  return {
    kind: "direct",
    provider: opts.provider,
    baseUrl,
    apiKey: key,
    model: opts.directModel,
    openaiCompatible: spec.openaiCompatible,
  };
}

/** Which providers are configured — for the admin screen and startup logging. */
export function configuredProviders(): { id: DirectProvider; label: string; ready: boolean }[] {
  return (Object.keys(PROVIDERS) as DirectProvider[]).map((id) => {
    const spec = PROVIDERS[id];
    const ready = spec.keyless
      ? Boolean(spec.envBaseUrl && process.env[spec.envBaseUrl])
      : Boolean(process.env[spec.envKey]);
    return { id, label: spec.label, ready };
  });
}

/* ------------------------------------------------------------------ *
 * Circuit breaker
 * ------------------------------------------------------------------ */

/**
 * Stop hammering a provider that is failing.
 *
 * Plain fallback retries every request: the first user waits for a timeout
 * and then a retry, and so does the hundredth. A breaker remembers instead —
 * after a few consecutive failures it stops trying that provider entirely
 * for a cooling-off period and goes straight to OpenRouter, so only the
 * requests that discovered the outage pay for it.
 *
 * Deliberately not backed by Redis. State is per server instance, which
 * means several instances each learn independently — a few extra failed
 * requests during an outage. The alternative is a network round-trip on
 * every single chat request to check a shared flag, which costs more, all
 * the time, than the thing it saves.
 */

const FAILURE_THRESHOLD = 3;
const OPEN_MS = 2 * 60 * 1000;

interface BreakerState {
  failures: number;
  openedAt: number | null;
  lastError: string;
}

const breakers = new Map<DirectProvider, BreakerState>();

const stateFor = (p: DirectProvider): BreakerState =>
  breakers.get(p) ?? { failures: 0, openedAt: null, lastError: "" };

/** Whether this provider is currently allowed to take traffic. */
export function providerAvailable(provider: DirectProvider): boolean {
  const s = stateFor(provider);
  if (s.openedAt === null) return true;
  if (Date.now() - s.openedAt < OPEN_MS) return false;
  // cooling-off elapsed — let one request through to test the water. It
  // either succeeds and closes the circuit, or fails and re-opens it.
  breakers.set(provider, { ...s, openedAt: null, failures: FAILURE_THRESHOLD - 1 });
  return true;
}

export function recordProviderSuccess(provider: DirectProvider): void {
  const s = stateFor(provider);
  if (s.failures === 0 && s.openedAt === null) return;
  breakers.set(provider, { failures: 0, openedAt: null, lastError: "" });
  console.log(`[provider] ${provider} recovered — direct routing resumed`);
}

export function recordProviderFailure(provider: DirectProvider, reason: string): void {
  const s = stateFor(provider);
  const failures = s.failures + 1;
  const opening = failures >= FAILURE_THRESHOLD && s.openedAt === null;
  breakers.set(provider, {
    failures,
    openedAt: opening ? Date.now() : s.openedAt,
    lastError: reason.slice(0, 200),
  });
  if (opening) {
    // Loud on purpose. A silent fallback means a broken key can sit
    // unnoticed for months while every request quietly costs more.
    console.error(
      `[provider] ${provider} failed ${failures}x — falling back to OpenRouter for ` +
        `${OPEN_MS / 60000} minutes. Last error: ${reason.slice(0, 200)}`,
    );
  }
}

export interface ProviderStatus {
  id: DirectProvider;
  label: string;
  /** a key (or base URL) is present */
  configured: boolean;
  /** currently taking traffic */
  healthy: boolean;
  failures: number;
  openedAt: number | null;
  lastError: string;
}

/** Everything the admin screen needs to see what is actually happening. */
export function providerStatuses(): ProviderStatus[] {
  return (Object.keys(PROVIDERS) as DirectProvider[]).map((id) => {
    const spec = PROVIDERS[id];
    const configured = spec.keyless
      ? Boolean(spec.envBaseUrl && process.env[spec.envBaseUrl])
      : Boolean(process.env[spec.envKey]);
    const s = stateFor(id);
    return {
      id,
      label: spec.label,
      configured,
      healthy: s.openedAt === null,
      failures: s.failures,
      openedAt: s.openedAt,
      lastError: s.lastError,
    };
  });
}
