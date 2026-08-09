import Link from "next/link";
import { loadBranding } from "@/lib/branding";
import { baseModels, premiumModels } from "@/lib/models";
import { videoModels } from "@/lib/video-models";
import { imageModels } from "@/lib/image-models";

// counted rather than typed — the hard-coded line said 24 chat models while
// the catalogue held 35, and nothing would have caught it
const chatCount = baseModels.length + premiumModels.length;

const columns = [
  {
    title: "Product",
    links: [
      { href: "/#chat", label: "AI Chat" },
      { href: "/tools/image-generator", label: "Image Generator" },
      { href: "/tools/video-generator", label: "Video Generator" },
      { href: "/tools", label: "All Tools" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/blog", label: "Blog" },
      { href: "/contact", label: "Contact us" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy-policy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms & Conditions" },
      { href: "/return-policy", label: "Return Policy" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
];

export default async function Footer() {
  const { siteName, logoUrl } = await loadBranding();

  return (
    <footer className="border-t border-line bg-navy text-ink">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid grid-cols-2 gap-10 md:grid-cols-4">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-semibold">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
              src={logoUrl}
              alt={siteName}
              width={28}
              height={28}
              className="h-7 w-7 rounded-md object-contain"
            />
              ) : (
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand text-sm font-bold">
                  {siteName.charAt(0).toUpperCase()}
                </span>
              )}
              {siteName}
            </p>
            <p className="mt-3 max-w-[24ch] text-sm text-ink-mute">
              {chatCount} chat models, {videoModels.length} video and {imageModels.length} image
              models. {baseModels.length} free for everyone, no login.
            </p>
          </div>
          {columns.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{col.title}</p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-ink-mute transition-colors hover:text-ink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-line pt-6 text-xs text-ink-faint sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} {siteName}. All rights reserved.</p>
          <p className="flex items-center gap-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
              <rect x="4" y="10" width="16" height="11" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            Secure payments · SSL encrypted
          </p>
        </div>
      </div>
    </footer>
  );
}
