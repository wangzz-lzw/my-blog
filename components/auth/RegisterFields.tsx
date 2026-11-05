"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

/**
 * 注册表单体：字段、校验、`POST /api/register` 与随后的自动登录。
 * 成功去向交给 onSuccess。
 */
export function RegisterFields({ onSuccess }: { onSuccess: () => void }) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const { alert: notify } = useFeedback();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (password !== confirm) {
      void notify({
        title: "两次密码不一致",
        description: "请重新输入一次确认密码。",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        void notify({
          title: "注册失败",
          description: data.error ?? "请稍后重试",
        });
        setLoading(false);
        return;
      }

      // 注册成功直接登录
      const signInRes = await signIn("credentials", {
        identifier: username,
        password,
        redirect: false,
      });
      setLoading(false);
      if (signInRes?.error) {
        void notify({
          title: "账号已创建",
          description: "但自动登录没成功，请用刚才的账号手动登录一次。",
        });
        return;
      }
      window.dispatchEvent(new Event("auth:changed"));
      onSuccess();
    } catch {
      void notify({
        title: "注册失败",
        description: "网络异常，请稍后重试",
      });
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <div className="field">
        <label>用户名 *</label>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="2-20 位字母 / 数字 / 下划线 / 中文"
          autoComplete="username"
          minLength={2}
          maxLength={20}
          required
        />
      </div>
      <div className="field">
        <label>邮箱（选填）</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
        />
      </div>
      <div className="field">
        <label>密码 *</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="至少 8 位"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <div className="field">
        <label>确认密码 *</label>
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="再输入一次密码"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>
      <button className="btn btn-block" type="submit" disabled={loading}>
        {loading ? "注册中…" : "注册并登录"}
      </button>
    </form>
  );
}