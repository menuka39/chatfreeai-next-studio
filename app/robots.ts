import type { MetadataRoute } from "next";

const BASE = process.env.SITE_URL ?? "https://chatfreeai.com";

/**
 * One rule, for every crawler.
 *
 * An earlier version repeated the same block for GPTBot, ClaudeBot,
 * PerplexityBot and eight others, to state on the record that answer engines
 * are welcome. It read well and was quietly dangerous: naming a user-agent
 * makes that crawler use ONLY its own block and ignore the wildcard entirely.
 * So the day someone tightens the `*` rules, eleven named crawlers keep the
 * old permissions — and nothing reports it.
 *
 * The welcome is a decision, not a directive. It belongs in this comment,
 * where changing it costs nothing, rather than in eleven copies of a rule that
 * have to be kept in step by hand.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        /*
         * Auth, account, API and admin surfaces have nothing for a searcher.
         * Admin also carries its own noindex meta (app/admin/layout.tsx), but
         * disallowing here is the earlier, stronger signal: it stops the crawl
         * happening rather than only deindexing after one has.
         *
         * Nothing else is blocked, deliberately. Answer engines — GPTBot,
         * ClaudeBot, PerplexityBot, Google-Extended, Applebot-Extended, CCBot
         * — are covered by this rule and stay welcome: a site absent from
         * those crawlers is absent from the answers they write.
         */
        disallow: ["/api/", "/account", "/auth/", "/admin"],
      },
    ],
    /*
     * The Sitemap line is the one non-RFC directive every major engine
     * honours — Google, Bing and Yandex all read it — so it earns its place.
     *
     * `Host:` used to sit here and no longer does. Google dropped support for
     * it before 2019 and does not mention it in its documentation; Yandex
     * points to 301s and canonical tags instead. This site has one domain, a
     * canonical on every page and redirects for the old URLs, which is what
     * both engines now say to use. A directive nobody reads is just a line
     * that can be wrong later.
     */
    sitemap: `${BASE}/sitemap.xml`,
  };
}
