"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function CommentForm({ slug }: { slug: string }) {
  const router = useRouter();
  const [author, setAuthor] = useState("");
  const [email, setEmail] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<
    "idle" | "submitting" | "done" | "error"
  >("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!author.trim() || !content.trim()) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, author, email, content }),
      });
      if (res.ok) {
        setStatus("done");
        setContent("");
        setEmail("");
        setAuthor("");
        router.refresh();
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done") {
    return <p className="notice info">评论已提交，审核通过后显示。</p>;
  }

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <div className="row">
        <input
          value={author}
          onChange={(e) => setAuthor(e.target.value)}
          placeholder="昵称 *"
          required
          maxLength={60}
        />
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="邮箱（选填）"
          type="email"
          maxLength={200}
        />
      </div>
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写下你的评论… *"
        required
        maxLength={2000}
      />
      {status === "error" && (
        <p className="notice error">提交失败，请稍后重试。</p>
      )}
      <div>
        <button className="btn" disabled={status === "submitting"} type="submit">
          {status === "submitting" ? "提交中…" : "发表评论"}
        </button>
      </div>
    </form>
  );
}
