"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DropdownMenu } from "radix-ui";
import { signOut } from "next-auth/react";
import { applyTheme, currentTheme, THEMES, type ThemeId } from "@/lib/theme";
import { toSiteImageUrl } from "@/lib/image-url";

export type MenuUser = {
  name?: string | null;
  username?: string | null;
  email?: string | null;
  avatar?: string | null;
  role?: "ADMIN" | "READER";
};

/**
 * 页头账号菜单（Radix DropdownMenu）：
 * 点击用户筹码展开——个人资料 / 后台（管理员）/ 配色主题（子菜单）/ 退出登录。
 * 焦点管理、方向键、Esc、点击外部关闭、typeahead 全部交给 Radix，我们只给样式。
 */
export function UserMenu({ user }: { user: MenuUser }) {
  const [theme, setTheme] = useState<ThemeId>("cyber");

  useEffect(() => {
    setTheme(currentTheme());
  }, []);

  const isAdmin = user.role === "ADMIN";
  const displayName =
    user.name?.trim() || user.username?.trim() || user.email || "用户";
  const label =
    displayName.length > 10 ? displayName.slice(0, 10) + "…" : displayName;
  const initial = displayName.charAt(0).toUpperCase();
  const handle = user.username
    ? `@${user.username}`
    : (user.email ?? "");
  const avatar = toSiteImageUrl(user.avatar);
  const activeTheme = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger className="user-chip" aria-label="账号菜单">
        <span className="user-avatar">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" />
          ) : (
            initial
          )}
        </span>
        <span className="user-label">{label}</span>
        <span className="user-caret" aria-hidden="true">
          ▾
        </span>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="user-menu" align="end" sideOffset={10}>
          <div className="user-menu-head">
            <span className="user-menu-name">{displayName}</span>
            {handle && <span className="user-menu-handle">{handle}</span>}
          </div>

          <DropdownMenu.Separator className="user-menu-sep" />

          <DropdownMenu.Item className="user-menu-item" asChild>
            <Link href="/profile">个人资料</Link>
          </DropdownMenu.Item>

          {isAdmin && (
            <DropdownMenu.Item className="user-menu-item" asChild>
              <Link href="/admin">后台管理</Link>
            </DropdownMenu.Item>
          )}

          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className="user-menu-item">
              <span>配色主题</span>
              <span className="user-menu-value">{activeTheme.name}</span>
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent
                className="user-menu user-menu-sub"
                sideOffset={8}
                alignOffset={-4}
              >
                <DropdownMenu.RadioGroup
                  value={theme}
                  onValueChange={(value) => {
                    const next = value as ThemeId;
                    setTheme(next);
                    applyTheme(next);
                  }}
                >
                  {THEMES.map((t) => (
                    <DropdownMenu.RadioItem
                      key={t.id}
                      value={t.id}
                      className="user-menu-item user-menu-theme"
                    >
                      <span className="theme-dots" aria-hidden="true">
                        {t.swatch.map((c) => (
                          <i key={c} style={{ background: c }} />
                        ))}
                      </span>
                      <span>{t.name}</span>
                    </DropdownMenu.RadioItem>
                  ))}
                </DropdownMenu.RadioGroup>
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>

          <DropdownMenu.Separator className="user-menu-sep" />

          <DropdownMenu.Item
            className="user-menu-item user-menu-danger"
            onSelect={() => {
              void signOut({ callbackUrl: "/" });
            }}
          >
            退出登录
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}