"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/blog", label: "文章" },
  { href: "/tags", label: "标签" },
];

/** 页头主导航：标出当前所在页。首页（欢迎页）走左上角的品牌标记，不占导航位 */
export function SiteNav() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {LINKS.map((l) => {
        const active =
          pathname === l.href ||
          pathname.startsWith(l.href + "/") ||
          // 文章详情页（/posts/...）也算「文章」区
          (l.href === "/blog" && pathname.startsWith("/posts"));
        return (
          <Link
            key={l.href}
            href={l.href}
            className={active ? "is-active" : undefined}
            aria-current={active ? "page" : undefined}
          >
            {l.label}
          </Link>
        );
      })}
    </>
  );
}