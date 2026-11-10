import type { Metadata } from "next";
import Script from "next/script";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { RootScroll } from "@/components/ui/RootScroll";
import { AskLauncher } from "@/components/ask/AskLauncher";
import "./globals.css";
import "./redesign.css";
import { SITE_NAME } from "@/lib/site";

export const metadata: Metadata = {
  title: { default: SITE_NAME, template: `%s | ${SITE_NAME}` },
  description: "个人博客",
  icons: { icon: [{ url: "/favicon.svg", type: "image/svg+xml" }] },
};

/**
 * 根布局只负责文档外壳（html/body/主题初始化/样式）。
 * 页头页脚在 `(site)` 分组布局里——根路径 `/` 是欢迎页，是门脸，不该挂站点头尾。
 */
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
            localStorage / matchMedia 都可能抛错（隐私模式），兜底为不设 data-theme＝默认深色。

            顺带做欢迎页动效的门控：只有「JS 已就绪」才把入场元素藏起来，
            无 JS 时内容直接是最终态；2.5s 内动效没报到就自动摘掉标记，避免永久隐藏。 */}
        <Script id="theme-init" strategy="beforeInteractive">
          {"try{var d=document.documentElement,t=localStorage.getItem('theme');if(!t){t=window.matchMedia&&window.matchMedia('(prefers-color-scheme: light)').matches?'daylight':'cyber'}d.dataset.theme=t;if(location.pathname==='/'){d.classList.add('js-ready');setTimeout(function(){if(!window.__welcomeMotion){d.classList.remove('js-ready')}},2500)}}catch(e){}"}
        </Script>
        {/* 整页滚动搬进这一层：document 自己不再滚，
            这样全站（含页面级）才能用同一套自绘滚动条 */}
        <FeedbackProvider>
          <RootScroll>{children}</RootScroll>
          {/* 全站问答入口：挂在根布局，欢迎页也有 */}
          <AskLauncher />
        </FeedbackProvider>
      </body>
    </html>
  );
}