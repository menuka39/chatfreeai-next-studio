import BlogEditor from "@/components/admin/BlogEditor";

export default function NewBlogPostPage() {
  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">New post</h1>
      <div className="mt-6">
        <BlogEditor initial={{ title: "", slug: "", excerpt: "", content: "", tag: "Guides", readMins: 5, status: "draft", coverImageUrl: null }} />
      </div>
    </div>
  );
}
