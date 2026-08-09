import Link from "next/link";
import { isAdminPageRequest } from "@/lib/admin";
import { loadBranding } from "@/lib/branding";

const navLinks = [
  { href: "/#chat", label: "Chat" },
  { href: "/tools", label: "Tools" },
  { href: "/pricing", label: "Pricing" },
  { href: "/blog", label: "Blog" },
];


export default async function Header() {
  const [{ siteName, logoUrl }, admin] = await Promise.all([loadBranding(), isAdminPageRequest()]);
  const showAdminLink = admin.isAdmin;

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[17px] font-semibold tracking-tight">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt={siteName}
              width={32}
              height={32}
              className="h-8 w-8 rounded-lg object-contain"
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand font-display text-sm font-bold text-white">
              {siteName.charAt(0).toUpperCase()}
            </span>
          )}
          {siteName}
        </Link>

        <nav className="hidden items-center gap-7 text-sm font-medium text-ink-mute md:flex">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="transition-colors hover:text-ink">
              {link.label}
            </Link>
          ))}
          {showAdminLink && (
            <Link href="/admin" className="flex items-center gap-1.5 text-brand transition-colors hover:text-brand-deep">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Admin
            </Link>
          )}
        </nav>

        <div className="flex items-center gap-3">
          <Link href="/account" className="hidden text-sm font-medium text-ink-mute hover:text-ink sm:block">
            Account
          </Link>
          <Link
            href="/#chat"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-deep"
          >
            Start free
          </Link>
        </div>
      </div>
    </header>
  );
}
