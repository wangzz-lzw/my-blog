"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { GsapReveal } from "@/components/GsapReveal";
import { RegisterFields } from "@/components/auth/RegisterFields";

export function RegisterForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();

  return (
    <GsapReveal className="login-wrap">
      <div className="login-card" data-reveal>
        <p className="sysline">
          &gt; AUTH.SYS 注册新账号
          <span className="cursor">▌</span>
        </p>
        <h1>注册</h1>
        <p className="login-sub">注册后即可发表评论；管理后台仅限管理员。</p>

        <RegisterFields
          onSuccess={() => {
            router.push(returnTo || "/");
            router.refresh();
          }}
        />

        <div className="login-foot">
          <span className="comment-hint">已有账号？</span>
          <Link
            href={`/login?returnTo=${encodeURIComponent(returnTo)}`}
            className="back-link"
          >
            去登录
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