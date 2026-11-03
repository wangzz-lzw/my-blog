"use client";

import { signOut } from "next-auth/react";

/**
 * 共享退出控件：点击 signOut 并落地首页。
 * - variant="header"：页头紧凑「退出」按钮（.logout-link，hover 品红预警）
 * - variant="admin"：后台「退出登录」按钮（.admin-logout，行为与旧 LogoutButton 一致）
 */
export function LogoutControl({
  variant = "header",
}: {
  variant?: "header" | "admin";
}) {
  const isHeader = variant === "header";
  return (
    <button
      className={isHeader ? "logout-link" : "admin-logout"}
      title={isHeader ? "退出登录并返回首页" : "退出后台"}
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      {isHeader ? "退出" : "退出登录"}
    </button>
  );
}
