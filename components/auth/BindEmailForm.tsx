"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { EmailCodeField } from "@/components/auth/EmailCodeField";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

/**
 * 给已登录账号补绑邮箱（老账号没有邮箱时出现）。
 * 走同一套验证码流程，用途为 bind。
 */
export function BindEmailForm() {
  const router = useRouter();
  const { alert: notify } = useFeedback();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !code.trim()) {
      void notify({ title: "还差一步", description: "请填写邮箱并输入收到的验证码。" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/me/email", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        void notify({ title: "绑定失败", description: data.error ?? "请稍后重试" });
        return;
      }
      window.dispatchEvent(new Event("auth:changed"));
      router.refresh();
    } catch {
      void notify({ title: "绑定失败", description: "网络异常，请稍后重试" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="bind-email">
      <h2>补绑邮箱</h2>
      <p className="bind-email-note">
        这个账号还没有邮箱。绑定后可以用来找回账号，也能在评论里显示身份。
      </p>
      <form className="login-form" onSubmit={onSubmit}>
        <EmailCodeField
          email={email}
          onEmailChange={setEmail}
          code={code}
          onCodeChange={setCode}
          purpose="bind"
        />
        <button className="btn btn-block" type="submit" disabled={saving}>
          {saving ? "绑定中…" : "绑定邮箱"}
        </button>
      </form>
    </section>
  );
}