"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Props = {
  email: string;
  onEmailChange: (value: string) => void;
  code: string;
  onCodeChange: (value: string) => void;
  /** register：注册；bind：给已登录账号补绑邮箱 */
  purpose: "register" | "bind";
  /** 补绑时邮箱可能是只读的（沿用当前账号），这里允许外部锁住 */
  emailReadOnly?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 邮箱 + 验证码字段。
 * 点「获取验证码」调 /api/auth/email-code，成功进入 60 秒倒计时；
 * 服务端给的剩余秒数优先于前端自己算的（前端那 60 秒只是表象）。
 */
export function EmailCodeField({
  email,
  onEmailChange,
  code,
  onCodeChange,
  purpose,
  emailReadOnly = false,
}: Props) {
  const [sending, setSending] = useState(false);
  const [left, setLeft] = useState(0);
  const [hint, setHint] = useState<string>("");
  const timerRef = useRef<number>(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  const startCountdown = useCallback((seconds: number) => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setLeft(seconds);
    timerRef.current = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          window.clearInterval(timerRef.current);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
  }, []);

  async function requestCode() {
    const value = email.trim().toLowerCase();
    if (!EMAIL_RE.test(value)) {
      setHint("请先填写有效邮箱");
      return;
    }
    setSending(true);
    setHint("");
    try {
      const res = await fetch("/api/auth/email-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value, purpose }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        cooldown?: number;
        retryAfter?: number;
      };
      if (!res.ok) {
        setHint(data.error ?? "发送失败，请稍后重试");
        if (res.status === 429 && data.retryAfter) {
          startCountdown(data.retryAfter);
        }
        return;
      }
      startCountdown(data.cooldown ?? 60);
      setHint("验证码已发送，请查收邮箱（含垃圾箱）");
    } catch {
      setHint("网络异常，请稍后重试");
    } finally {
      setSending(false);
    }
  }

  const disabled = sending || left > 0;

  return (
    <>
      <div className="field">
        <label>邮箱 *</label>
        <input
          type="email"
          value={email}
          onChange={(e) => onEmailChange(e.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          readOnly={emailReadOnly}
          required
        />
      </div>

      <div className="field">
        <label>验证码 *</label>
        <div className="code-row">
          <input
            value={code}
            onChange={(e) => onCodeChange(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="6 位数字"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            aria-describedby="email-code-hint"
            required
          />
          <button
            type="button"
            className="btn-code"
            onClick={requestCode}
            disabled={disabled}
          >
            {sending ? "发送中…" : left > 0 ? `${left}s 后重发` : "获取验证码"}
          </button>
        </div>
        <p className="field-hint" id="email-code-hint" aria-live="polite">
          {hint}
        </p>
      </div>
    </>
  );
}