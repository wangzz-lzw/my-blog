import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { readTime } from "@/lib/read-time";
import type { PostWithTags } from "@/lib/types";
import { GsapReveal } from "@/components/GsapReveal";

export const revalidate = 60;

export default async function HomePage() {
  const [posts, tagCount, commentCount, allTags, popular, latestComments] =
    await Promise.all([
      prisma.post.findMany({
        where: { published: true },
        include: { tags: true },
        orderBy: { publishedAt: "desc" },
      }),
      prisma.tag.count(),
      prisma.comment.count(),
      prisma.tag.findMany(),
      // 热门榜：取最新 10 篇，再在 JS 里按浏览量排序取前 5。
      // 不带 views 的 select/orderBy —— 旧版生成客户端的运行时 schema 尚无 views 字段，
      // 全量字段返回让新旧客户端都可用；views 缺失（旧客户端）按 0 处理。
      prisma.post.findMany({
        where: { published: true },
        orderBy: { publishedAt: "desc" },
        take: 10,
      }),
      prisma.comment.findMany({
        where: { approved: true },
        orderBy: { createdAt: "desc" },
        take: 3,
        include: { post: { select: { title: true, slug: true } } },
      }),
    ]);

  // 标签云：JS 侧统计已发布文章数（复用已加载的 tags，无额外查询）
  const countMap = new Map<string, number>();
  for (const p of posts) {
    for (const t of p.tags) countMap.set(t.id, (countMap.get(t.id) ?? 0) + 1);
  }
  const tagCloud = allTags
    .map((t) => ({ ...t, count: countMap.get(t.id) ?? 0 }))
    .filter((t) => t.count > 0)
    .sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-Hans-CN")
    );

  // 热门榜：JS 侧按浏览量取前 5（views 缺失按 0，兼容旧客户端）
  const popularTop = [...popular]
    .sort((a, b) => (b.views || 0) - (a.views || 0))
    .slice(0, 5);

  const [featured, ...rest] = posts as PostWithTags[];
  const latestDate = featured ? formatDate(featured.publishedAt) : null;

  return (
    <GsapReveal>
      <div className="container container-home">
        <div className="home-grid">
          <div className="home-main">
            {/* 英雄区：终端横幅 + 一句话介绍 + 统计 */}
            <section className="home-hero" data-reveal>
              <p className="sysline">
                &gt; BLOG.SYS 在线
                <span className="cursor">▌</span>
              </p>
              <p className="home-tagline">
                记录开发笔记与生活随想。阅读优先，无广告，评论需登录。
              </p>
              <div className="stat-chips">
                <span className="stat-chip">
                  <b>{posts.length}</b> 篇文章
                </span>
                <Link className="stat-chip" href="/tags">
                  <b>{tagCount}</b> 个标签
                </Link>
                <span className="stat-chip">
                  <b>{commentCount}</b> 条评论
                </span>
                {latestDate && (
                  <span className="stat-chip stat-chip-plain">
                    最近更新 {latestDate}
                  </span>
                )}
              </div>
            </section>

            {/* 头条文章：最新一篇 */}
            {featured ? (
              <article className="featured-post" data-reveal>
                <div className="featured-cover" aria-hidden="true">
                  {featured.title.charAt(0)}
                </div>
                <div className="featured-body">
                  <span className="badge">FEATURED · 最新</span>
                  <h2>
                    <Link href={`/posts/${featured.slug}`}>
                      {featured.title}
                    </Link>
                  </h2>
                  {featured.excerpt && (
                    <p className="post-excerpt">{featured.excerpt}</p>
                  )}
                  <div className="post-meta">
                    <span>{formatDate(featured.publishedAt)}</span>
                    <span>{readTime(featured.content)} 分钟</span>
                    <span>👁 {featured.views || 0}</span>
                  </div>
                  {featured.tags.length > 0 && (
                    <div className="tag-row">
                      {featured.tags.map((t) => (
                        <Link
                          key={t.id}
                          href={`/tags/${t.slug}`}
                          className="tag"
                        >
                          {t.name}
                        </Link>
                      ))}
                    </div>
                  )}
                  <Link
                    className="read-more"
                    href={`/posts/${featured.slug}`}
                  >
                    阅读全文 →
                  </Link>
                </div>
              </article>
            ) : (
              <section className="home-empty" data-reveal>
                <p className="sysline">&gt; 还没有已发布的文章。</p>
                <p className="home-empty-text">
                  登录后台发布第一篇，这里就会出现内容。
                </p>
              </section>
            )}

            {/* 其余文章 */}
            {rest.length > 0 && (
              <section className="section" data-reveal>
                <div className="section-head">
                  <h2>更多文章</h2>
                  <Link className="view-all" href="/tags">
                    全部标签 →
                  </Link>
                </div>
                <ul className="post-list compact">
                  {rest.map((post) => (
                    <li key={post.id} data-reveal>
                      <div className="row-head">
                        <h3>
                          <Link href={`/posts/${post.slug}`}>{post.title}</Link>
                        </h3>
                        <span className="row-meta">
                          {formatDate(post.publishedAt)} ·{" "}
                          {readTime(post.content)} 分钟 · 👁 {post.views || 0}
                        </span>
                      </div>
                      {post.excerpt && (
                        <p className="post-excerpt">{post.excerpt}</p>
                      )}
                      {post.tags.length > 0 && (
                        <div className="tag-row">
                          {post.tags.map((t) => (
                            <Link
                              key={t.id}
                              href={`/tags/${t.slug}`}
                              className="tag"
                            >
                              {t.name}
                            </Link>
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 只有一篇时的收尾引导，避免大片留白 */}
            {featured && rest.length === 0 && (
              <section className="home-empty" data-reveal>
                <p className="sysline">
                  &gt; 更多内容正在路上 — 先从标签翻翻旧文。
                </p>
                <div className="home-empty-actions">
                  <Link className="btn ghost" href="/tags">
                    按标签浏览 →
                  </Link>
                  <Link className="btn ghost" href="/posts/welcome">
                    重读这篇 →
                  </Link>
                </div>
              </section>
            )}
          </div>

          <aside className="home-side" aria-label="侧边栏">
            <div className="widget" data-reveal>
              <h3 className="widget-title">&gt; 标签</h3>
              {tagCloud.length === 0 ? (
                <p className="widget-empty">暂无标签</p>
              ) : (
                <div className="tag-cloud">
                  {tagCloud.map((t) => (
                    <Link
                      key={t.id}
                      href={`/tags/${t.slug}`}
                      className="tag-chip"
                    >
                      {t.name}
                      <span className="tag-count">{t.count}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            <div className="widget" data-reveal>
              <h3 className="widget-title">&gt; 热门</h3>
              {popularTop.length === 0 ? (
                <p className="widget-empty">暂无文章</p>
              ) : (
                <ol className="rank-list">
                  {popularTop.map((p, i) => (
                    <li key={p.id}>
                      <span className="rank-no">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <span className="rank-text">
                        <Link href={`/posts/${p.slug}`}>{p.title}</Link>
                        <span className="rank-meta">👁 {p.views || 0} 次浏览</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div className="widget" data-reveal>
              <h3 className="widget-title">&gt; 最新评论</h3>
              {latestComments.length === 0 ? (
                <p className="widget-empty">
                  还没有评论，登录后去文章页留言。
                </p>
              ) : (
                <div className="side-comment-list">
                  {latestComments.map((c) => (
                    <div key={c.id} className="side-comment">
                      <div className="side-comment-head">
                        <span className="comment-author">{c.author}</span>
                        <span className="comment-time">
                          {formatDate(c.createdAt)}
                        </span>
                      </div>
                      <p>
                        {c.content.slice(0, 48)}
                        {c.content.length > 48 && "…"}
                      </p>
                      <Link href={`/posts/${c.post.slug}`}>查看原文 →</Link>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="widget about-widget" data-reveal>
              <h3 className="widget-title">&gt; 关于本站</h3>
              <p className="widget-text">
                一个个人博客：记录开发笔记与生活随想。赛博朋克皮肤，阅读优先，无广告，评论需登录。
              </p>
              <p className="widget-powered">&gt; next.js · postgresql · gsap</p>
            </div>
          </aside>
        </div>
      </div>
    </GsapReveal>
  );
}
