import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { isAdminPageRequest } from "@/lib/admin";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const NAV = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/blog", label: "Blog posts" },
  { href: "/admin/limits", label: "Limits & pricing" },
  { href: "/admin/showcase", label: "Video Showcase" },
  { href: "/admin/settings", label: "Site settings" },
];

/**
 * Every /admin/* page is gated here, once, server-side — checked fresh on
 * every request (force-dynamic, no caching), never by hiding a nav link. A
 * non-admin is bounced to the homepage rather than shown a 404 or an error
 * page, which would confirm to a curious non-admin that an /admin section
 * exists at all.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { isAdmin, email } = await isAdminPageRequest();
  if (!isAdmin) redirect("/");

  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-6xl gap-8 px-6 py-10">
      <aside className="w-52 shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Admin</p>
        {email && (
          <p className="mt-1 truncate text-[13px] text-ink-mute" title={email}>
            {email}
          </p>
        )}
        <nav className="mt-5 space-y-0.5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block rounded-lg px-3 py-2 text-[14px] font-medium text-ink-mute transition-colors hover:bg-surface hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <Link href="/" className="mt-6 block px-3 text-[13px] text-ink-faint hover:text-ink">
          ← Back to site
        </Link>
      </aside>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
