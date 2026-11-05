"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "首页" },
  { href: "/blog", label: "文章" },
  { href: "/tags", label: "标签" },
];

/** 页头主导航：标出当前所在页，避免「点进去以后图案看不出自己在哪」 */
export function SiteNav() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {LINKS.map((l) => {
        const active =
          l.href === "/"
            ? pathname === "/"
            : // /blog 在文章详情页（/posts/...）也算当前区
              pathname === l.href ||
              pathname.startsWith(l.href + "/") ||
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