"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GsapReveal } from "@/components/GsapReveal";
import { AuthSwitcher, type AuthTab } from "@/components/auth/AuthSwitcher";

/**
 * 独立页的认证卡片（`/login` 与 `/register` 共用）。
 *
 * 关键约束（见 openspec: auth-panel 的「两个入口共用同一套切换」）：
 * 切换 tab 只同步 URL，**不能让组件树重建**——一旦 AuthSwitcher 被重建，
 * 已经填好的输入就没了、动画也会从头开始。所以：
 *   - tab 状态放这里，是唯一真相，AuthSwitcher 受控；
 *   - 地址栏同步用 `history.replaceState` 而不是 `router.replace`：
 *     后者会触发 RSC 重渲染，组件树重建，输入丢失（实测踩到）。
 */
export function AuthCard({
  initialTab,
  returnTo,
}: {
  initialTab: AuthTab;
  returnTo: string;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<AuthTab>(initialTab);

  const syncUrl = (next: AuthTab) => {
    setTab(next);
    const target = next === "login" ? "/login" : "/register";
    if (typeof window === "undefined") return;
    if (window.location.pathname === target) return;
    window.history.replaceState(
      null,
      "",
      `${target}?returnTo=${encodeURIComponent(returnTo)}`
    );
  };

  return (
    <GsapReveal className="login-wrap">
      <div className="login-card" data-reveal>
        <p className="sysline">
          &gt; AUTH.SYS {tab === "login" ? "身份验证" : "注册新账号"}
          <span className="cursor">▌</span>
        </p>

        <AuthSwitcher
          variant="page"
          tab={tab}
          onTabChange={syncUrl}
          onLoginSuccess={() => {
            router.push(returnTo || "/admin");
            router.refresh();
          }}
          onRegisterSuccess={() => {
            router.push(returnTo || "/");
            router.refresh();
          }}
        />
      </div>
    </GsapReveal>
  );
}
