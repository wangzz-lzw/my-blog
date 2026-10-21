import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [postCount, publishedCount, commentCount, pendingComments] =
    await Promise.all([
      prisma.post.count(),
      prisma.post.count({ where: { published: true } }),
      prisma.comment.count(),
      prisma.comment.count({ where: { approved: false } }),
    ]);

  const stats = [
    { label: "全部文章", value: postCount },
    { label: "已发布", value: publishedCount },
    { label: "全部评论", value: commentCount },
    { label: "待审核评论", value: pendingComments },
  ];

  return (
    <div>
      <h1 style={{ fontSize: "1.5rem", margin: "0 0 1rem" }}>后台首页</h1>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "1rem",
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "1.25rem",
            }}
          >
            <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              {s.label}
            </div>
            <div style={{ fontSize: "2rem", fontWeight: 700 }}>{s.value}</div>
          </div>
        ))}
      </div>
      <p style={{ marginTop: "1.5rem" }}>
        <Link href="/admin/posts/new" className="btn">
          写一篇新文章
        </Link>
      </p>
    </div>
  );
}
