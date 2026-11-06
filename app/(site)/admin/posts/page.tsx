import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { ScrollArea } from "@/components/ui/ScrollArea";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
  const posts = await prisma.post.findMany({
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>文章管理</h1>
          <p className="admin-sub">共 {posts.length} 篇文章。</p>
        </div>
        <Link href="/admin/posts/new" className="btn">
          + 写文章
        </Link>
      </header>

      <ScrollArea axis="x" className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>状态</th>
              <th>评论</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => (
              <tr key={p.id}>
                <td className="cell-title">
                  <Link href={`/admin/posts/${p.id}`}>{p.title}</Link>
                </td>
                <td>
                  <span className={`pill ${p.published ? "ok" : ""}`}>
                    {p.published ? "已发布" : "草稿"}
                  </span>
                </td>
                <td>{p._count.comments}</td>
                <td className="cell-muted">{formatDate(p.updatedAt)}</td>
                <td className="cell-actions">
                  <Link href={`/admin/posts/${p.id}`}>编辑</Link>
                  {p.published && <Link href={`/posts/${p.slug}`}>查看</Link>}
                </td>
              </tr>
            ))}
            {posts.length === 0 && (
              <tr>
                <td colSpan={5} className="cell-empty">
                  暂无文章
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}
