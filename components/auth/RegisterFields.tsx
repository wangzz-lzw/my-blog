"use client";

import { useEffect, useRef, useState } from "react";
import { signIn } from "next-auth/react";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { EmailCodeField } from "@/components/auth/EmailCodeField";

/**
 * 注册表单体：字段、校验、`POST /api/register` 与随后的自动登录。
 *
 * 分两步（见 openspec: auth-panel）：
 *   第 1 步 用户名 / 邮箱 / 验证码 —— 取验证码有网络往返与倒计时，放在这一步末尾
 *   第 2 步 密码 / 确认密码 —— 只有两个框，面板高度自然收窄
 * 提交仍在第 2 步一次性发出：接口是一次创建账号，拆成两次请求会留下
 * "账号已建但密码没设"的中间态。
 *
 * 步骤状态只在组件内，不进 URL —— `/register` 永远指向第 1 步。
 */

type Step = 1 | 2;

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function RegisterFields({ onSuccess }: { onSuccess: () => void }) {
  const [step, setStep] = useState<Step>(1);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [stepError, setStepError] = useState("");
  const { alert: notify } = useFeedback();

  const passwordRef = useRef<HTMLInputElement | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);

  /** 进入第 2 步时把焦点交给第一个密码框；退回第 1 步找用户名 */
  useEffect(() => {
    const target = step === 2 ? passwordRef.current : usernameRef.current;
    target?.focus({ preventScroll: true });
  }, [step]);

  /** 第 1 步 → 第 2 步：只做本地校验，不发请求 */
  function goNext(e: React.FormEvent) {
    e.preventDefault();
    setStepError("");

    if (!USERNAME_RE.test(username.trim())) {
      setStepError("用户名需 2-20 位字母、数字、下划线或中文");
      return;
    }
    if (!EMAIL_RE.test(email.trim().toLowerCase())) {
      setStepError("请填写有效邮箱");
      return;
    }
    if (!/^\d{6}$/.test(code.trim())) {
      setStepError("请填写 6 位邮箱验证码");
      return;
    }
    setStep(2);
  }

  function goBack() {
    setStepError("");
    setStep(1);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStepError("");

    if (password.length < 8) {
      setStepError("密码至少 8 位");
      return;
    }
    if (password !== confirm) {
      setStepError("两次密码不一致");
      return;
    }

    setLoading(true);
    try {
      // 一次提交：第 1 步填的三项 + 第 2 步的密码
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), email: email.trim().toLowerCase(), code: code.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error ?? "请稍后重试";
        // 验证码类错误把用户送回第 1 步，让他重新取码——停在第 2 步改不了
        if (/验证码/.test(message)) {
          setStep(1);
          setCode("");
          setStepError(message);
          return;
        }
        notify({ title: "注册失败", description: message });
        setLoading(false);
        return;
      }

      // 注册成功直接登录
      const signInRes = await signIn("credentials", {
        identifier: username.trim(),
        password,
        redirect: false,
      });
      setLoading(false);
      if (signInRes?.error) {
        notify({
          title: "账号已创建",
          description: "但自动登录没成功，请用刚才的账号手动登录一次。",
        });
        return;
      }
      window.dispatchEvent(new Event("auth:changed"));
      onSuccess();
    } catch {
      notify({ title: "注册失败", description: "网络异常，请稍后重试" });
      setLoading(false);
    }
  }

  return (
    <div className="register-body">
      {/* 步骤指示：等宽数字，与站点其它"机器嗓子"一致。
          两个数字之间给一句给读屏听的说明，否则会被连读成"零一零二"。 */}
      <p className="register-steps" aria-live="polite">
        <span className="register-step" data-current={step === 1}>
          01
        </span>
        <span className="register-step-sep" aria-hidden="true" />
        <span className="register-step" data-current={step === 2}>
          02
        </span>
        <span className="sr-only">，第 {step} 步，共 2 步</span>
        <span className="register-step-label">
          {step === 1 ? "账号与邮箱" : "设置密码"}
        </span>
      </p>

      {step === 1 ? (
        <form className="login-form" noValidate onSubmit={goNext}>
          <div className="field">
            <label>用户名 *</label>
            <input
              ref={usernameRef}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="2-20 位字母 / 数字 / 下划线 / 中文"
              autoComplete="username"
              minLength={2}
              maxLength={20}
              required
            />
          </div>
          <EmailCodeField
            email={email}
            onEmailChange={setEmail}
            code={code}
            onCodeChange={setCode}
            purpose="register"
          />
          <StepError message={stepError} />
          <button className="btn btn-block" type="submit">
            下一步
          </button>
        </form>
      ) : (
        <form className="login-form" noValidate onSubmit={handleSubmit}>
          <div className="field">
            <label>密码 *</label>
            <input
              ref={passwordRef}
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
          <StepError message={stepError} />
          <button className="btn btn-block" type="submit" disabled={loading}>
            {loading ? "注册中…" : "注册并登录"}
          </button>
          <button type="button" className="btn-back" onClick={goBack} disabled={loading}>
            ← 上一步
          </button>
        </form>
      )}
    </div>
  );
}

/** 步骤内的错误提示：不弹窗，就地说明（弹窗会遮住刚填的字段） */
function StepError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p className="register-error" role="alert">
      {message}
    </p>
  );
}
