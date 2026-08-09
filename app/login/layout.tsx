import type { Metadata } from "next";

/**
 * Keeps the sign-in page out of search results.
 *
 * A sign-in form has nothing for a searcher to read, and indexing it splits
 * link signals away from the pages that do. It was listed in the sitemap while
 * being an obvious no-index candidate — two instructions pointing opposite
 * ways; it is now in neither.
 *
 * This lives in a layout because the page itself is a client component, and
 * `metadata` is only read from server components.
 */
export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
