import { notFound } from "next/navigation";
import { serviceQuery } from "@/lib/supabase/server";
import { isValidId } from "@/lib/admin";
import BlogEditor from "@/components/admin/BlogEditor";

interface PostRow {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tag: string;
  read_mins: number;
  status: "draft" | "published";
  cover_image_url: string | null;
}

export default async function EditBlogPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isValidId(id)) return notFound();
  const rows = await serviceQuery<PostRow[]>(`blog_posts?id=eq.${id}&select=*`);
  const post = rows?.[0];
  if (!post) return notFound();

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Edit post</h1>
      <div className="mt-6">
        <BlogEditor
          initial={{
            id: post.id,
            title: post.title,
            slug: post.slug,
            excerpt: post.excerpt,
            content: post.content,
            tag: post.tag,
            readMins: post.read_mins,
            status: post.status,
            coverImageUrl: post.cover_image_url,
          }}
        />
      </div>
    </div>
  );
}
