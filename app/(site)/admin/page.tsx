import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function AdminDashboard() {
  const [postCount, publishedCount, commentCount, pendingComments, recent] =
    await Promise.all([
      prisma.post.count(),
      prisma.post.count({ where: { published: true } }),
      prisma.comment.count(),
      prisma.comment.count({ where: { approved: false } }),
      prisma.post.findMany({
        orderBy: { updatedAt: "desc" },
        take: 5,
        select: { id: true, title: true, published: true, updatedAt: true },
      }),
    ]);

  const stats = [
    { label: "全部文章", value: postCount, href: "/admin/posts" },
    { label: "已发布", value: publishedCount, href: "/admin/posts" },
    { label: "全部评论", value: commentCount, href: "/admin/comments" },
    {
      label: "待审核评论",
      value: pendingComments,
      href: "/admin/comments",
      alert: pendingComments > 0,
    },
  ];

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>概览</h1>
          <p className="admin-sub">写作、发布与评论审核都在这里。</p>
        </div>
        <Link href="/admin/posts/new" className="btn">
          + 写文章
        </Link>
      </header>

      <div className="stat-grid">
        {stats.map((s) => (
          <Link
            key={s.label}
            href={s.href}
            className={`stat-card${s.alert ? " alert" : ""}`}
          >
            <span className="stat-label">{s.label}</span>
            <span className="stat-value">{s.value}</span>
          </Link>
        ))}
      </div>

      <section className="admin-panel">
        <div className="admin-panel-head">
          <h2>最近编辑</h2>
          <Link href="/admin/posts" className="view-all">
            全部文章 →
          </Link>
        </div>
        {recent.length === 0 ? (
          <p className="empty-note">还没有文章，点右上角「写文章」开始。</p>
        ) : (
          <ul className="admin-recent">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/admin/posts/${p.id}`}>{p.title}</Link>
                <span className="admin-recent-meta">
                  <span className={`pill ${p.published ? "ok" : ""}`}>
                    {p.published ? "已发布" : "草稿"}
                  </span>
                  {formatDate(p.updatedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {pendingComments > 0 && (
        <section className="admin-panel">
          <div className="admin-panel-head">
            <h2>待处理</h2>
          </div>
          <p className="admin-todo">
            有 <b>{pendingComments}</b> 条评论等待审核。
            <Link href="/admin/comments">去审核 →</Link>
          </p>
        </section>
      )}
    </div>
  );
}
