import Link from "next/link";
import BlogList from "@/components/admin/BlogList";

export default function AdminBlogPage() {
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Blog posts</h1>
          <p className="mt-1 text-ink-mute">Drafts stay hidden from the public site until published.</p>
        </div>
        <Link href="/admin/blog/new" className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep">
          + New post
        </Link>
      </div>
      <div className="mt-6">
        <BlogList />
      </div>
    </div>
  );
}
