import Link from "next/link";
import { serviceQuery } from "@/lib/supabase/server";

interface Counts {
  blogTotal: number;
  blogPublished: number;
}

async function loadCounts(): Promise<Counts> {
  const all = await serviceQuery<{ id: string; status: string }[]>(
    "blog_posts?select=id,status",
  );
  const rows = all ?? [];
  return {
    blogTotal: rows.length,
    blogPublished: rows.filter((r) => r.status === "published").length,
  };
}

export default async function AdminOverview() {
  const counts = await loadCounts();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Admin</h1>
      <p className="mt-1 text-ink-mute">
        Site content and configuration — changes here go live immediately.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <Link
          href="/admin/blog"
          className="card-shadow rounded-xl border border-line bg-surface p-5 hover:border-brand"
        >
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
            Blog
          </p>
          <p className="mt-2 font-display text-2xl font-semibold">
            {counts.blogPublished}{" "}
            <span className="text-base font-normal text-ink-mute">
              published
            </span>
          </p>
          <p className="mt-1 text-[13px] text-ink-faint">
            {counts.blogTotal - counts.blogPublished} draft(s)
          </p>
        </Link>
        <Link
          href="/admin/settings"
          className="card-shadow rounded-xl border border-line bg-surface p-5 hover:border-brand"
        >
          <p className="text-[13px] font-semibold uppercase tracking-wide text-ink-faint">
            Site settings
          </p>
          <p className="mt-2 text-[14px] text-ink">Logo, site name, tagline</p>
        </Link>
      </div>
    </div>
  );
}
