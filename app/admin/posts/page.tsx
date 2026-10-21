import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function AdminPostsPage() {
  const posts = await prisma.post.findMany({
    include: { _count: { select: { comments: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: 0 }}>文章管理</h1>
        <Link href="/admin/posts/new" className="btn">
          写文章
        </Link>
      </div>
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
              <td>
                <Link href={`/admin/posts/${p.id}`}>{p.title}</Link>
              </td>
              <td>{p.published ? "已发布" : "草稿"}</td>
              <td>{p._count.comments}</td>
              <td>{formatDate(p.updatedAt)}</td>
              <td>
                <Link href={`/admin/posts/${p.id}`}>编辑</Link>
                {p.published && (
                  <>
                    {" "}
                    · <Link href={`/posts/${p.slug}`}>查看</Link>
                  </>
                )}
              </td>
            </tr>
          ))}
          {posts.length === 0 && (
            <tr>
              <td colSpan={5}>暂无文章</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
