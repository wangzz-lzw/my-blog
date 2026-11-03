"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { GsapReveal } from "@/components/GsapReveal";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier || !password) return;
    setError("");
    setLoading(true);
    const res = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError("用户名/邮箱或密码错误");
    } else {
      // 通知页头重新拉取登录态（布局不会因客户端跳转重挂载）
      window.dispatchEvent(new Event("auth:changed"));
      router.push(returnTo || "/admin");
      router.refresh();
    }
  }

  return (
    <GsapReveal className="login-wrap">
      <div className="login-card" data-reveal>
        <p className="sysline">
          &gt; AUTH.SYS 身份验证
          <span className="cursor">▌</span>
        </p>
        <h1>登录</h1>
        <p className="login-sub">登录后可发表评论、进入后台写作。</p>

        {error && <p className="notice error">{error}</p>}

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="field">
            <label>用户名 / 邮箱</label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="用户名或邮箱"
              autoComplete="username"
              required
            />
          </div>
          <div className="field">
            <label>密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>
          <button className="btn btn-block" type="submit" disabled={loading}>
            {loading ? "登录中…" : "登录"}
          </button>
        </form>

        <div className="login-foot">
          <span className="comment-hint">还没有账号？</span>
          <Link
            href={`/register?returnTo=${encodeURIComponent(returnTo)}`}
            className="back-link"
          >
            去注册
          </Link>
        </div>
        <div className="login-foot">
          <Link href="/" className="back-link">
            ← 返回首页
          </Link>
        </div>
      </div>
    </GsapReveal>
  );
}
