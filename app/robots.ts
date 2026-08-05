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
    ],
    sitemap: `${BASE}/sitemap.xml`,
  };
}
