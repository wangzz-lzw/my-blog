import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { readTime } from "@/lib/read-time";
import { toSiteImageUrl } from "@/lib/image-url";
import type { PostWithTags } from "@/lib/types";
import { GsapReveal } from "@/components/GsapReveal";

export const revalidate = 60;

export const metadata = {
  title: "文章",
  description: "按时间倒排的全部文章。",
};

/** 列表日期栏用的「日 / 年.月」两行写法 */
function stamp(d: Date | null) {
  const date = d ?? new Date();
  return {
    day: String(date.getDate()).padStart(2, "0"),
    ym: `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}`,
  };
}

export default async function HomePage() {
  const [posts, allTags, popular, latestComments] = await Promise.all([
    prisma.post.findMany({
      where: { published: true },
      include: { tags: true },
      orderBy: { publishedAt: "desc" },
    }),
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

  return (
    <GsapReveal>
      <div className="sheet">
        <div className="ledger">
          <p className="ledger-intro" data-reveal>
            开发笔记与生活随想。按时间倒排，越新的越靠上。
          </p>
          {featured ? (
            <article className="entry entry--lead" data-reveal>
              <div className="entry-when">
                <span className="entry-day">{stamp(featured.publishedAt).day}</span>
                <span className="entry-ym">{stamp(featured.publishedAt).ym}</span>
              </div>
              <div className="entry-body">
                {featured.cover && (
                  <Link
                    href={`/posts/${featured.slug}`}
                    className="entry-figure"
                    aria-hidden="true"
                    tabIndex={-1}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={toSiteImageUrl(featured.cover)} alt="" />
                  </Link>
                )}
                <h2 className="entry-title">
                  <Link href={`/posts/${featured.slug}`}>{featured.title}</Link>
                </h2>
                {featured.excerpt && (
                  <p className="entry-excerpt">{featured.excerpt}</p>
                )}
                <p className="entry-meta">
                  <span>{readTime(featured.content)} 分钟</span>
                  <span>
                    <span className="num">{featured.views || 0}</span> 次浏览
                  </span>
                  {featured.tags.length > 0 && (
                    <span className="entry-tags">
                      {featured.tags.map((t) => (
                        <Link key={t.id} href={`/tags/${t.slug}`}>
                          {t.name}
                        </Link>
                      ))}
                    </span>
                  )}
                </p>
              </div>
            </article>
          ) : (
            <p className="entry-empty">
              还没有已发布的文章。登录后台写下第一篇，这里就会出现内容。
            </p>
          )}

          {rest.map((post) => (
            <article className="entry" key={post.id}>
              <div className="entry-when">
                <span className="entry-day">{stamp(post.publishedAt).day}</span>
                <span className="entry-ym">{stamp(post.publishedAt).ym}</span>
              </div>
              <div className="entry-body">
                <h2 className="entry-title">
                  <Link href={`/posts/${post.slug}`}>{post.title}</Link>
                </h2>
                {post.excerpt && (
                  <p className="entry-excerpt">{post.excerpt}</p>
                )}
                <p className="entry-meta">
                  <span>{readTime(post.content)} 分钟</span>
                  <span>
                    <span className="num">{post.views || 0}</span> 次浏览
                  </span>
                  {post.tags.length > 0 && (
                    <span className="entry-tags">
                      {post.tags.map((t) => (
                        <Link key={t.id} href={`/tags/${t.slug}`}>
                          {t.name}
                        </Link>
                      ))}
                    </span>
                  )}
                </p>
              </div>
            </article>
          ))}

          {featured && rest.length === 0 && (
            <p className="ledger-end">
              更多文章会按时间排在这条线下面。
            </p>
          )}
        </div>

        <aside className="rail" aria-label="侧栏" data-reveal>
          <section className="rail-block">
            <h3>标签</h3>
            {tagCloud.length === 0 ? (
              <p className="rail-note">还没有标签。</p>
            ) : (
              <ul className="rail-tags">
                {tagCloud.map((t) => (
                  <li key={t.id}>
                    <Link href={`/tags/${t.slug}`}>
                      {t.name}
                      <span className="n">{t.count}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rail-block">
            <h3>被读得最多</h3>
            {popularTop.length === 0 ? (
              <p className="rail-note">还没有浏览记录。</p>
            ) : (
              <ol className="rail-rank">
                {popularTop.map((p) => (
                  <li key={p.id}>
                    <Link href={`/posts/${p.slug}`}>{p.title}</Link>
                    <span className="n">{p.views || 0}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="rail-block">
            <h3>最近评论</h3>
            {latestComments.length === 0 ? (
              <p className="rail-note">还没有评论。登录后可以在文章页留言。</p>
            ) : (
              latestComments.map((c) => (
                <div className="rail-comment" key={c.id}>
                  <div className="rail-comment-head">
                    <span className="who">{c.author}</span>
                    <span>{stamp(c.createdAt).ym}</span>
                  </div>
                  <p>
                    {c.content.slice(0, 40)}
                    {c.content.length > 40 && "…"}
                  </p>
                  <Link href={`/posts/${c.post.slug}`}>在原文下</Link>
                </div>
              ))
            )}
          </section>

          <section className="rail-block">
            <h3>关于</h3>
            <p className="rail-note">
              一个个人博客：开发笔记与生活随想，阅读优先，无广告，评论需登录。
            </p>
            <p className="rail-sys">
              next.js · postgresql · gsap
              <br />
              <b>{posts.length}</b> 篇文章 / <b>{tagCloud.length}</b> 个在用标签
            </p>
          </section>
        </aside>
      </div>
    </GsapReveal>
  );
}