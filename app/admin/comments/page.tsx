"use client";

import { useEffect, useState } from "react";
import { formatDate } from "@/lib/date";

type CommentRow = {
  id: string;
  author: string;
  email: string | null;
  content: string;
  approved: boolean;
  createdAt: string;
  post: { id: string; title: string; slug: string };
};

export default function AdminCommentsPage() {
  const [rows, setRows] = useState<CommentRow[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/comments", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d)) setRows(d);
        else setError("加载失败");
      })
      .catch(() => setError("加载失败"));
  }, []);

  async function setApproved(id: string, approved: boolean) {
    const res = await fetch(`/api/comments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approved }),
    });
    if (res.ok) {
      setRows((prev) =>
        prev?.map((r) => (r.id === id ? { ...r, approved } : r)) ?? null
      );
    }
  }

  async function remove(id: string) {
    if (!window.confirm("确定删除这条评论？")) return;
    const res = await fetch(`/api/comments/${id}`, { method: "DELETE" });
    if (res.ok) {
      setRows((prev) => prev?.filter((r) => r.id !== id) ?? null);
    }
  }

  if (error) return <p className="notice error">{error}</p>;

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>评论管理</h1>
          <p className="admin-sub">
            {rows ? `共 ${rows.length} 条评论，${rows.filter((r) => !r.approved).length} 条待审核。` : "加载中…"}
          </p>
        </div>
      </header>

      {!rows ? (
        <p className="empty-note">加载中…</p>
      ) : rows.length === 0 ? (
        <p className="empty-note">暂无评论。</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>文章</th>
                <th>作者</th>
                <th>内容</th>
                <th>状态</th>
                <th>时间</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id}>
                  <td className="cell-title">{c.post.title}</td>
                  <td>
                    {c.author}
                    {c.email && (
                      <span className="cell-muted"> {c.email}</span>
                    )}
                  </td>
                  <td className="cell-content">{c.content}</td>
                  <td>
                    <span className={`pill ${c.approved ? "ok" : "warn"}`}>
                      {c.approved ? "已通过" : "待审核"}
                    </span>
                  </td>
                  <td className="cell-muted">{formatDate(c.createdAt)}</td>
                  <td className="cell-actions">
                    {!c.approved ? (
                      <button
                        className="btn btn-sm"
                        onClick={() => setApproved(c.id, true)}
                      >
                        通过
                      </button>
                    ) : (
                      <button
                        className="btn btn-sm ghost"
                        onClick={() => setApproved(c.id, false)}
                      >
                        撤销
                      </button>
                    )}
                    <button
                      className="btn btn-sm danger"
                      onClick={() => remove(c.id)}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
