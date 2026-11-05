import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { TagManager } from "@/components/admin/TagManager";

export const dynamic = "force-dynamic";

export const metadata = { title: "标签管理" };

export default async function AdminTagsPage() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { posts: true } } },
    orderBy: [{ posts: { _count: "desc" } }, { name: "asc" }],
  });

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>标签管理</h1>
          <p className="admin-sub">
            共 {tags.length} 个标签。改名会保留旧地址（旧链接永久跳转），
            删除只摘掉标签与文章的关联，文章本身不受影响。
          </p>
        </div>
      </header>

      <TagManager
        initialTags={tags.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          aliases: t.aliases,
          count: t._count.posts,
          created: formatDate(t.createdAt),
        }))}
      />
    </div>
  );
}