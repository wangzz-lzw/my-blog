"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutControl } from "@/components/LogoutControl";

type SessionUser = {
  id: string;
  email?: string | null;
  name?: string | null;
  username?: string | null;
  avatar?: string | null;
  role?: "ADMIN" | "READER";
};

/**
 * 右上角三态：
 * - 加载中：可见虚线占位（.header-auth-slot）
 * - 未登录：霓虹描边「登录」按钮 + 「注册」链接
 * - 已登录：「头像/圆牌 + 标签」chip（点击进 /profile）+ 页头退出控件；
 *   管理员额外显示「后台」入口
 * 客户端从 /api/me 读取登录态和头像，不阻塞服务端渲染（保持 ISR）。
 */
export function HeaderAuth() {
  // undefined = 加载中；null = 未登录；对象 = 已登录
  const [user, setUser] = useState<SessionUser | null | undefined>(undefined);
  const pathname = usePathname();

  useEffect(() => {
    let alive = true;
    const load = () => {
      // /api/me 同时返回登录态与头像（头像不放在 JWT/cookie 里）
      fetch("/api/me")
        .then((r) => r.json())
        .then((d) => {
          if (alive) setUser(d?.user ?? null);
        })
        .catch(() => {
          if (alive) setUser(null);
        });
    };
    load();

    // 资料页保存 / 登录状态变化后即时刷新头像与登录态
    const onProfileUpdated = () => load();
    window.addEventListener("profile:updated", onProfileUpdated);
    window.addEventListener("auth:changed", onProfileUpdated);
    document.addEventListener("visibilitychange", onProfileUpdated);
    return () => {
      alive = false;
      window.removeEventListener("profile:updated", onProfileUpdated);
      window.removeEventListener("auth:changed", onProfileUpdated);
      document.removeEventListener("visibilitychange", onProfileUpdated);
    };
    // pathname 变化（登录/注册后跳转、页内导航）也重新拉取登录态
  }, [pathname]);

  if (user === undefined) {
    return <span className="header-auth-slot" aria-busy="true" />;
  }

  if (!user) {
    return (
      <>
        <Link href="/register" className="register-link">
          注册
        </Link>
        <Link href="/login" className="login-link">
          登录
        </Link>
      </>
    );
  }

  const isAdmin = user.role === "ADMIN";
  // 标签：昵称 / 用户名 / 邮箱 @ 前缀，超 10 字符截断
  const source =
    user.name?.trim() ||
    user.username?.trim() ||
    user.email?.split("@")[0] ||
    "user";
  const label = source.length > 10 ? source.slice(0, 10) + "…" : source;
  const initial = (user.name?.trim() || user.username || user.email || "U")
    .charAt(0)
    .toUpperCase();
  const who = user.username || user.email || user.name || "";

  return (
    <>
      {isAdmin && (
        <Link href="/admin" className="admin-entry">
          后台
        </Link>
      )}
      <Link
        href="/profile"
        className="user-chip"
        title={`已登录：${who}（个人资料）`}
      >
        <span className="user-avatar">
          {user.avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.avatar} alt="" />
          ) : (
            initial
          )}
        </span>
        <span className="user-label">{label}</span>
      </Link>
      <LogoutControl />
    </>
  );
}
