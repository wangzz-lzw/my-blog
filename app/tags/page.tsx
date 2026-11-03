import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export default async function TagsPage() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { posts: true } } },
    orderBy: { name: "asc" },
  });

  return (
    <div className="container container-read page">
      <header className="page-head" data-reveal>
        <p className="sysline">
          &gt; TAGS.SYS 标签索引
          <span className="cursor">▌</span>
        </p>
        <h1 className="page-title">全部标签</h1>
        <p className="page-sub">
          共 {tags.length} 个标签，按名称排序。点击标签查看该分类下的文章。
        </p>
      </header>

      {tags.length === 0 ? (
        <p className="empty-note">暂无标签。</p>
      ) : (
        <div className="tag-grid" data-reveal>
          {tags.map((t) => (
            <Link key={t.id} href={`/tags/${t.slug}`} className="tag-card">
              <span className="tag-card-name"># {t.name}</span>
              <span className="tag-card-count">{t._count.posts} 篇</span>
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
