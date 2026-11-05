import Link from "next/link";
import { HeaderAuth } from "@/components/HeaderAuth";
import { SiteNav } from "@/components/SiteNav";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import { SITE_NAME } from "@/lib/site";

/**
 * 站点外壳：页头 + 主区 + 页脚。
 * 只有 `(site)` 分组下的页面（文章、标签、登录、资料、后台）走这里；
 * 根路径 `/` 的欢迎页在分组之外，是独立门面，没有这层外壳。
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FeedbackProvider>
      <header id="top" className="site-header">
        <div className="container">
          <Link href="/" className="site-brand" aria-label={`${SITE_NAME} 首页`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon.svg"
              alt=""
              width={22}
              height={22}
              className="brand-mark"
            />
            <span className="glitch" data-text={SITE_NAME}>
              {SITE_NAME}
            </span>
          </Link>
          <nav className="site-nav" aria-label="站点导航">
            <SiteNav />
            <HeaderAuth />
          </nav>
        </div>
      </header>

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="container">
          <span>
            © {new Date().getFullYear()} {SITE_NAME}
          </span>
          <a href="#top">回到顶部 ↑</a>
        </div>
      </footer>
    </FeedbackProvider>
  );
}