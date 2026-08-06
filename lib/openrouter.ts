/**
 * The OpenRouter credential, read in one place.
 *
 * Trimming matters more than it looks. Pasting a key into a hosting dashboard
 * very often carries a trailing newline or space, which travels into the
 * Authorization header and makes OpenRouter answer `401 {"message":"User not
 * found."}` — an error that reads like a deleted account rather than a stray
 * character, and which is invisible in the dashboard because the field renders
 * the same either way.
 *
 * An empty string is returned as undefined so `if (!key)` still catches a
 * variable that exists but holds nothing.
 */
export function openRouterKey(): string | undefined {
  const raw = process.env.OPENROUTER_API_KEY?.trim();
  return raw || undefined;
}

/** Base URL for OpenRouter, without a trailing slash. */
export function openRouterBase(): string {
  return (process.env.OPENROUTER_BASE_URL?.trim() || "https://openrouter.ai").replace(/\/+$/, "");
}
