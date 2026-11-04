import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export default async function TagsPage() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { posts: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="shell page">
      <header className="page-head">
        <h1 className="index-title">标签索引</h1>
        <p className="index-sub">
          共 {tags.length} 个标签，按名称排序。点开任意一个，可以看到该分类下的全部文章。
        </p>
      </header>

      {tags.length === 0 ? (
        <p className="entry-empty">还没有标签。</p>
      ) : (
        <div className="tag-index">
          {tags.map((t) => (
            <Link key={t.id} href={`/tags/${t.slug}`} className="tag-row">
              <span className="tag-row-name">{t.name}</span>
              <span className="tag-row-count">{t._count.posts} 篇</span>
            </Link>
          ))}
        </div>
      )}

      <p className="page-back">
        <Link href="/" className="back-link">
          ← 返回首页
        </Link>
      </p>
    </div>
  );
}