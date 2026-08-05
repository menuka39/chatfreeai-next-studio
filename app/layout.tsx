import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { GoogleAnalytics } from "@next/third-parties/google";
import { AdSenseLoader } from "@/components/AdSense";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

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
  title: "Chat Free AI — 24 AI models, one chat. 8 free for everyone.",
  description:
    "Use ChatGPT, Gemini, Deepseek, Claude and more from one free chat — no account needed. Every paid plan unlocks every premium model version.",
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
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  const showAnalytics = Boolean(gaId) && process.env.NODE_ENV === "production";

  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-canvas text-ink">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
        {showAnalytics && <GoogleAnalytics gaId={gaId!} />}
        {/* self-gates on "configured + production" internally, same as the GA condition above */}
        <AdSenseLoader />
      </body>
    </html>
  );
}
