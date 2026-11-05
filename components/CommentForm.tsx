"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
};

/**
 * 评论框（仅登录用户可评论）：
 * - 未登录：不展示任何输入框，只提示并给出「登录后评论」入口（登录后回到本文）
 * - 已登录：以登录身份直接提交，无昵称/邮箱字段（服务端同样校验 session）
 */
export function CommentForm({
  slug,
  postUrl,
}: {
  slug: string;
  postUrl: string;
}) {
  const router = useRouter();
  // undefined = 检查中；null = 未登录；对象 = 已登录
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "done" | "error">(
    "idle"
  );
  const { alert: notify } = useFeedback();

  useEffect(() => {
    fetch("/api/auth/session")
      .then((r) => r.json())
      .then((d) => setUser(d?.user ?? null))
      .catch(() => setUser(null));
  }, []);

  // 加载中：占位，避免表单闪烁
  if (user === undefined) {
    return <p className="comment-hint">正在确认登录状态…</p>;
  }

  // 未登录：只给登录引导，不出现任何输入框
  if (!user) {
    return (
      <div className="comment-login">
        <p className="comment-login-text">登录后即可发表评论。</p>
        <Link
          href={`/login?returnTo=${encodeURIComponent(postUrl)}`}
          className="btn"
        >
          登录 / 注册
        </Link>
        <p className="comment-login-note">
          本站评论需登录账号，杜绝匿名灌水。
        </p>
      </div>
    );
  }

  const displayName = user.name?.trim() || user.email || "已登录用户";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setStatus("submitting");
    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, content }),
      });
      if (res.ok) {
        setStatus("done");
        setContent("");
        router.refresh();
        void notify({
          title: "评论已提交",
          description: "审核通过后会出现在这篇文章下面。",
        });
      } else {
        setStatus("error");
        void notify({ title: "评论提交失败", description: "请稍后重试。" });
      }
    } catch {
      setStatus("error");
      void notify({ title: "评论提交失败", description: "网络异常，请稍后重试。" });
    }
  }

  return (
    <form className="comment-form" onSubmit={handleSubmit}>
      <p className="comment-as">
        以 <b>{displayName}</b> 身份评论
      </p>

      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="写下你的评论… *"
        required
        maxLength={2000}
        rows={4}
      />

      <div className="comment-form-foot">
        <span className="comment-hint">{content.length}/2000</span>
        <button
          className="btn"
          disabled={status === "submitting"}
          type="submit"
        >
          {status === "submitting" ? "提交中…" : "发表评论"}
        </button>
      </div>
    </form>
  );
}
