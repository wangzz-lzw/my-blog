import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { AuthTrigger } from "@/components/welcome/AuthTrigger";
import { WelcomeOrbit, type OrbitPost } from "@/components/welcome/WelcomeOrbit";
import { WelcomeMotion } from "@/components/welcome/WelcomeMotion";
import { CursorFollower } from "@/components/welcome/CursorFollower";
import { TextParticles } from "@/components/welcome/TextParticles";
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
  const [postCount, tagCount, latest, session, orbitPosts] = await Promise.all([
    prisma.post.count({ where: { published: true } }),
    prisma.tag.count({ where: { posts: { some: { published: true } } } }),
    prisma.post.findFirst({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      select: { publishedAt: true },
    }),
    // 会话读取失败不影响页面渲染，按未登录处理
    auth().catch(() => null),
    prisma.post.findMany({
      where: { published: true },
      orderBy: { publishedAt: "desc" },
      take: 6,
      select: {
        id: true,
        slug: true,
        title: true,
        cover: true,
        publishedAt: true,
        tags: { select: { name: true } },
      },
    }),
  ]);

  const orbitData: OrbitPost[] = orbitPosts.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    cover: p.cover,
    date: stamp(p.publishedAt),
    tags: p.tags.map((t) => t.name),
  }));

  const loggedIn = Boolean(session?.user);
  const isAdmin = session?.user?.role === "ADMIN";
  const updatedAt = stamp(latest?.publishedAt ?? null);

  return (
    <main className="shell page-welcome">
      {/* 背景细网格：真实元素（原先的 ::before）才能被 GSAP 做视差 */}
      <div className="welcome-grid" aria-hidden="true" />
      {/* 赛博层：扫描线 + 下扫光带 + HUD 角标 */}
      <div className="welcome-scanlines" aria-hidden="true" />
      <div className="welcome-beam" aria-hidden="true" />
      <div className="welcome-hud" aria-hidden="true" />

      <div className="welcome-inner">
        <div className="welcome-copy">
          {/* 提示符行：caret + 词标 + 闪烁光标块，同一基线同一左缘 */}
          <div className="welcome-prompt-line">
          <span className="welcome-prompt" aria-hidden="true">
            ❯
          </span>
          <h1 className="welcome-wordmark" aria-label={SITE_NAME}>
            {WORDMARK.map((char, i) => (
              <span
                key={`${char}-${i}`}
                className="welcome-letter"
                aria-hidden="true"
              >
                {char}
              </span>
            ))}
          </h1>
          <span className="welcome-caret" aria-hidden="true" />
        </div>

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
            {/* 磁吸位移作用在这层：外层的可点击区域保持不变 */}
            <span className="welcome-label">进入博客</span>
          </Link>
          <Link href="/tags" className="welcome-secondary">
            <span className="welcome-label">标签</span>
          </Link>
          {loggedIn ? (
            isAdmin ? (
              <Link href="/admin" className="welcome-secondary">
                <span className="welcome-label">后台</span>
              </Link>
            ) : (
              <Link href="/profile" className="welcome-secondary">
                <span className="welcome-label">个人资料</span>
              </Link>
            )
          ) : (
            <AuthTrigger />
          )}
        </nav>
        </div>

        {/* 右栏：环形文章导航 + 登录面板的落点 */}
        <div className="welcome-stage">
          <WelcomeOrbit posts={orbitData} />
          <div className="welcome-auth-slot" id="welcome-auth-slot" />
        </div>
      </div>

      {/* 动效增强层：不渲染可见内容，只操作上面已有的 DOM */}
      <WelcomeMotion />
      <CursorFollower />
      {/* 字标粒子化：鼠标靠近时散开，移开后拼回文字 */}
      <TextParticles selector=".welcome-wordmark" />
    </main>
  );
}