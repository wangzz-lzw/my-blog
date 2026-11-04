import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { HeaderAuth } from "@/components/HeaderAuth";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import { SITE_NAME } from "@/lib/site";
import "./globals.css";
import "./redesign.css";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "个人博客",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" data-scroll-behavior="smooth" suppressHydrationWarning>
      <body>
        {/* 首屏前定好主题，避免闪烁（beforeInteractive 会注入到 head）：
            显式选过就用本地记录；没选过则跟随系统深浅偏好（浅色 → 晨光白）。
            localStorage / matchMedia 都可能抛错（隐私模式），兜底为不设 data-theme＝默认深色。 */}
        <Script id="theme-init" strategy="beforeInteractive">
          {"try{var t=localStorage.getItem('theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'daylight':'cyber'}document.documentElement.dataset.theme=t}catch(e){}"}
        </Script>
        <header id="top" className="site-header">
          <div className="container">
            <Link href="/" className="site-brand glitch" data-text={SITE_NAME}>
              {SITE_NAME}
            </Link>
            <nav className="site-nav">
              <Link href="/">首页</Link>
              <Link href="/tags">标签</Link>
              <ThemeSwitcher />
              <HeaderAuth />
            </nav>
          </div>
        </header>
        <main className="site-main">{children}</main>
        <footer className="site-footer">
          <div className="container">
            <span>© {new Date().getFullYear()} {SITE_NAME}</span>
            <nav className="footer-links">
              <Link href="/tags">标签</Link>
              <Link href="/admin">管理</Link>
              <a href="#top">回到顶部 ↑</a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
