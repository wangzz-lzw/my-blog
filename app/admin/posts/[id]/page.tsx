import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { PostEditor } from "@/components/admin/PostEditor";

export const dynamic = "force-dynamic";

export default async function EditPostPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { tags: true },
  });
  if (!post) notFound();

  const editorPost = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    excerpt: post.excerpt,
    cover: post.cover,
    content: post.content,
    published: post.published,
    tags: post.tags.map((t) => ({ id: t.id, name: t.name, slug: t.slug })),
  };

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 1rem" }}>编辑文章</h1>
      <PostEditor post={editorPost} />
    </div>
  );
}
