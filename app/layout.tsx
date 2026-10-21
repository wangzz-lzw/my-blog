import type { Metadata } from "next";
import Link from "next/link";
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
    <html lang="zh-CN">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/" className="site-brand">
              我的博客
            </Link>
            <nav className="site-nav">
              <Link href="/">首页</Link>
              <Link href="/tags">标签</Link>
            </nav>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
