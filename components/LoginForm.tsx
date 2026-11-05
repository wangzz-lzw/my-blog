"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GsapReveal } from "@/components/GsapReveal";
import { LoginFields } from "@/components/auth/LoginFields";

export function LoginForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  return (
    <GsapReveal className="login-wrap">
      <div className="login-card" data-reveal>
        <p className="sysline">
          &gt; AUTH.SYS 身份验证
          <span className="cursor">▌</span>
        </p>
        <h1>登录</h1>
        <p className="login-sub">登录后可发表评论、进入后台写作。</p>

        <LoginFields
          onSuccess={() => {
            router.push(returnTo || "/admin");
            router.refresh();
          }}
        />

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
          <Link href="/blog" className="back-link">
            ← 返回文章列表
          </Link>
        </div>
      </div>
    </GsapReveal>
  );
}