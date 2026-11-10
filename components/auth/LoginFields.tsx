"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

/**
 * 登录表单体：只负责字段、校验与请求。
 * 成功后做什么交给 onSuccess——`/login` 页面是跳转，欢迎页抽屉是收起面板再进 /blog。
 */
export function LoginFields({ onSuccess }: { onSuccess: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { alert: notify } = useFeedback();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!identifier || !password) return;
    setLoading(true);
    const res = await signIn("credentials", {
      identifier,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      void notify({
        title: "登录失败",
        description: "用户名 / 邮箱或密码不正确，请重新输入。",
      });
      return;
    }
    // 通知页头重新拉取登录态（布局不会因客户端跳转重挂载）
    window.dispatchEvent(new Event("auth:changed"));
    onSuccess();
  }

  // noValidate：交给 handleSubmit 统一校验并用站点提示，
  // 否则浏览器原生气泡会先拦住提交，用户只看到系统样式的提示
  return (
    <form className="login-form" noValidate onSubmit={handleSubmit}>
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
  );
}