import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import { HeaderAuth } from "@/components/HeaderAuth";
import { ThemeSwitcher } from "@/components/ThemeSwitcher";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "我的博客", template: "%s | 我的博客" },
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
        {/* 首屏前应用已保存的主题，避免闪烁（beforeInteractive 会注入到 head） */}
        <Script id="theme-init" strategy="beforeInteractive">
          {"try{var t=localStorage.getItem('theme');if(t)document.documentElement.dataset.theme=t}catch(e){}"}
        </Script>
        <header id="top" className="site-header">
          <div className="container">
            <Link href="/" className="site-brand glitch" data-text="我的博客">
              我的博客
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
            <div className="footer-row">
              <span>© {new Date().getFullYear()} 我的博客</span>
              <nav className="footer-links">
                <Link href="/tags">标签</Link>
                <Link href="/admin">管理</Link>
                <a href="#top">回到顶部 ↑</a>
              </nav>
            </div>
            <div className="footer-sysline">
              <span>&gt; powered by next.js · postgresql · gsap</span>
              <span className="footer-status">
                在线<i className="pulse-dot" />
              </span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}
