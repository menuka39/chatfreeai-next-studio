/**
 * IndexNow — tell Bing, Yandex, Naver and Seznam a URL changed.
 *
 * A sitemap says a page exists; it does not say it changed five seconds ago.
 * Waiting for a recrawl means a post published today can sit unindexed for
 * days. One POST to api.indexnow.org propagates to every participating engine
 * at once, and pages typically appear within minutes rather than days.
 *
 * Google is not part of this and has said so — it keeps using the sitemap and
 * Search Console, which is why this supplements those rather than replacing
 * them. It matters more than the engine list suggests: Bing's index is what
 * several AI answer engines retrieve from, so this is also how new pages reach
 * those.
 *
 * Entirely optional. With INDEXNOW_KEY unset, every call is a no-op and
 * nothing else changes.
 */

const ENDPOINT = "https://api.indexnow.org/indexnow";

export const indexNowKey = () => process.env.INDEXNOW_KEY?.trim() || undefined;

/**
 * @param urls absolute URLs on this site that just changed
 */
export async function pingIndexNow(urls: string[]): Promise<boolean> {
  const key = indexNowKey();
  if (!key || !urls.length) return false;

  const base = process.env.SITE_URL ?? "https://chatfreeai.com";
  let host: string;
  try {
    host = new URL(base).host;
  } catch {
    return false;
  }

  // Every URL must be on the host we're claiming, or the whole batch is
  // rejected — worth filtering here rather than debugging a 422 later.
  const urlList = [...new Set(urls)].filter((u) => {
    try {
      return new URL(u).host === host;
    } catch {
      return false;
    }
  });
  if (!urlList.length) return false;

  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify({ host, key, keyLocation: `${base}/${key}.txt`, urlList }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error("[indexnow] rejected", res.status, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch {
    // Indexing is a hint, never load-bearing — a publish must not fail because
    // a search engine was unreachable.
    return false;
  }
}
