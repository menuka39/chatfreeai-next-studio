import type { MetadataRoute } from "next";

const BASE = process.env.SITE_URL ?? "https://chatfreeai.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // no value in indexing auth/account/api/admin surfaces — admin
        // pages also carry their own noindex meta (app/admin/layout.tsx),
        // but disallowing here is the earlier, stronger signal: it stops a
        // crawl before it happens rather than only deindexing after one
        disallow: ["/api/", "/account", "/auth/", "/admin"],
      },
      /*
       * Answer engines are named explicitly rather than left to the wildcard.
       * They are already allowed by it, but writing them down states the
       * intent: being absent from these crawlers means being absent from the
       * answers they generate, and that is a decision worth making on purpose
       * rather than inheriting from a rule someone tightens later.
       */
      ...["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-User", "PerplexityBot", "Google-Extended", "CCBot", "Applebot-Extended", "Bingbot", "YandexBot"].map(
        (userAgent) => ({
          userAgent,
          allow: "/",
          disallow: ["/api/", "/account", "/auth/", "/admin"],
        }),
      ),
    ],
    sitemap: `${BASE}/sitemap.xml`,
    host: BASE,
  };
}
