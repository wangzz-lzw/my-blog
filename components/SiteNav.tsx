"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "首页" },
  { href: "/tags", label: "标签" },
];

/** 页头主导航：标出当前所在页，避免「点进去以后图案看不出自己在哪」 */
export function SiteNav() {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {LINKS.map((l) => {
        const active =
          l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
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