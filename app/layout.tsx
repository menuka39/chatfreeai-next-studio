import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { AdSenseLoader } from "@/components/AdSense";
import { GoogleAnalytics } from "@/components/GoogleAnalytics";
import { adsenseConfigured } from "@/lib/adsense";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

const SITE_URL = process.env.SITE_URL ?? "https://chatfreeai.com";
const GA_MEASUREMENT_ID = "G-PZCSS9P5TT";

const geist = localFont({
  src: "./fonts/Geist-Variable.woff2",
  variable: "--font-geist",
  weight: "100 900",
  display: "swap",
});

const geistMono = localFont({
  src: "./fonts/GeistMono-Variable.woff2",
  variable: "--font-geist-mono",
  weight: "100 900",
  display: "swap",
});

/**
 * Header (rendered here, on every page) reads admin-editable branding on
 * every render — so every page needs to actually re-run that fetch per
 * request, not serve a build-time snapshot.
 *
 * ISR (`revalidate = N`) was tried first, matching the pattern the blog pages
 * already use, but its self-hosted (`next start`, non-Vercel-platform)
 * background-regeneration timing couldn't be pinned down with confidence in
 * testing — requests well past the revalidate window kept serving the
 * build-time snapshot rather than the freshly-fetched value. Given the whole
 * point of the admin panel is that a change is genuinely, predictably live —
 * not "live within some timing window I can't fully verify" — force-dynamic
 * is the honest choice here: every page trades some static-generation
 * performance for a guaranteed "reflects the database on the very next
 * request," the same trade already made for /admin/* itself.
 *
 * Verified this is genuinely necessary (not a testing artifact): removing it
 * and rebuilding put the homepage back to fully static (○ in the build
 * output) and the header wordmark reverted to the build-time snapshot; with
 * it, the header correctly rendered a live-updated logo and site name.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /**
   * Resolves every relative URL in metadata — canonicals, Open Graph images,
   * alternates. Without it Next emits relative og:image paths, which most
   * crawlers and every social scraper reject, and a page-level canonical of
   * "/pricing" resolves against nothing.
   */
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Chat Free AI — 24 AI models, one chat. 8 free for everyone.",
    // Page titles read as "<page> — Chat Free AI" without each one repeating
    // the brand by hand, which is where inconsistency creeps in.
    template: "%s — Chat Free AI",
  },
  description:
    "Use ChatGPT, Gemini, Deepseek, Claude and more from one free chat — no account needed. Every paid plan unlocks every premium model version.",
  applicationName: "Chat Free AI",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    // must match the WebSite schema name on the homepage: Google reads
    // both and ignores the pair when they disagree
    siteName: "chatfreeai",
    // No `url` here on purpose: it is inherited, so setting it made every page
    // advertise the homepage as its canonical Open Graph URL. Pages that care
    // set their own alongside their canonical.
    locale: "en_US",
  },
  twitter: { card: "summary_large_image" },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      // Let Google show full text snippets, large image previews and full
      // video previews. The defaults are conservative, and a truncated
      // snippet is a smaller, less clickable result.
      "max-snippet": -1,
      "max-image-preview": "large",
      "max-video-preview": -1,
    },
  },
};

/**
 * Colours the mobile browser's own chrome (status bar, address bar,
 * task-switcher card) — Void, matching the Switchboard canvas, instead of
 * the default white strip above/below the page that clashed with a fully
 * dark design.
 */
export const viewport: Viewport = {
  themeColor: "#0A0A0E",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Optional, like every other integration in this app — the site works
  // fine with this unset. Skipped in local `next dev` on purpose: without
  // this, every page load while building/testing locally would report as
  // real traffic, quietly inflating the actual numbers an admin later reads.
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? GA_MEASUREMENT_ID;
  const showAnalytics = Boolean(gaId) && process.env.NODE_ENV === "production";
  const showAds = adsenseConfigured && process.env.NODE_ENV === "production";

  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <head>
        {/*
          Each hint is tied to the script that will actually use it. A
          preconnect the page never follows up on is not free — the browser
          holds an idle socket open for ten seconds, and a handful of those
          compete for the bandwidth the real requests need.
        */}
        {showAds && (
          <>
            <link
              rel="preconnect"
              href="https://pagead2.googlesyndication.com"
              crossOrigin="anonymous"
            />
            <link rel="dns-prefetch" href="https://googleads.g.doubleclick.net" />
          </>
        )}
        {showAnalytics && <link rel="preconnect" href="https://www.googletagmanager.com" />}
        {showAnalytics && (
          <>
            <script
              async
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            />
            <script
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  window.gtag = gtag;
                  gtag('js', new Date());
                  gtag('config', '${gaId}');
                `,
              }}
            />
          </>
        )}
      </head>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {showAnalytics && <GoogleAnalytics measurementId={gaId} />}
        {/* self-gates on "configured + production" internally, same as the GA condition above */}
        <AdSenseLoader />
      </body>
    </html>
  );
}
