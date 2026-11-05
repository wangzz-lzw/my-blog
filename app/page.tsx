import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { BrandMark } from "@/components/BrandMark";
import { SITE_NAME } from "@/lib/site";

// 欢迎页上的文章数 / 标签数 / 更新日期都来自数据库：构建镜像时数据库是空的，
// 预渲染会把这些数字烘死在 HTML 里。强制动态渲染。
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "欢迎",
  description: "记录开发中的判断与失误，偶尔写点别的。",
};

/** 2026.11.05 这种紧凑写法，不用站内的长日期格式 */
function stamp(date: Date | null): string {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

const WORDMARK = SITE_NAME.split("");

export default async function WelcomePage() {
  const [postCount, tagCount, latest] = await Promise.all([
    prisma.post.count({ where: { published: true } }),
    prisma.tag.count({ where: { posts: { some: { published: true } } } }),
    prisma.post.findFirst({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    }),
  ]);

  const updatedAt = stamp(latest?.publishedAt ?? null);

  return (
    <main className="shell page-welcome">
      <div className="welcome-inner">
        <BrandMark className="welcome-mark" />

        <h1 className="welcome-wordmark" aria-label={SITE_NAME}>
          {WORDMARK.map((char, i) => (
            <span
              key={`${char}-${i}`}
              className="welcome-letter"
              style={{ animationDelay: `${720 + i * 22}ms` }}
              aria-hidden="true"
            >
              {char}
            </span>
          ))}
        </h1>

        <p className="welcome-lead">
          记录开发中的判断与失误，偶尔写点别的。
        </p>

        <div className="welcome-rule" aria-hidden="true" />

        <p className="welcome-state">
          {postCount === 0 ? (
            <span>新站刚开张，还没有文章</span>
          ) : (
            <>
              <span>{postCount} 篇文章</span>
              <span>{tagCount} 个在用标签</span>
              {updatedAt && <span>更新于 {updatedAt}</span>}
            </>
          )}
        </p>

        <nav className="welcome-actions" aria-label="进入博客">
          <Link href="/blog" className="welcome-cta">
            进入博客
          </Link>
          <Link href="/tags" className="welcome-secondary">
            标签
          </Link>
          <Link href="/login" className="welcome-secondary">
            登录
          </Link>
        </nav>
      </div>
    </main>
  );
}