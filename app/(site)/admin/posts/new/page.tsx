import { prisma } from "@/lib/prisma";
import { PostEditor } from "@/components/admin/PostEditor";

// 需要读现有标签做输入候选，所以不能预渲染成静态页
export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  const tags = await prisma.tag.findMany({
    select: { name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="admin-page">
      <PostEditor knownTags={tags.map((t) => t.name)} />
    </div>
  );
}