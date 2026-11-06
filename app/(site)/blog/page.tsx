import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { readTime } from "@/lib/read-time";
import { toSiteImageUrl } from "@/lib/image-url";
import type { PostWithTags } from "@/lib/types";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { ListScrollPane } from "@/components/blog/ListScrollPane";

// 列表必须读运行时数据：镜像构建阶段没有真实数据库（Dockerfile 用的是临时空库），
// 一旦预渲染就会把"空列表"打进镜像，部署后前台永远 0 篇。这里强制动态渲染。
export const dynamic = "force-dynamic";

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

/**
 * 封面：右栏的一块"样本"，不是开场大图。
 * 标题先被读到，图只做旁证；装饰性的，对辅助技术与 Tab 序都隐藏。
 */
function EntryCover({ slug, cover }: { slug: string; cover: string }) {
  return (
    <Link
      href={`/posts/${slug}`}
      className="entry-cover"
      aria-hidden="true"
      tabIndex={-1}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={toSiteImageUrl(cover)} alt="" loading="lazy" />
    </Link>
  );
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
    <div className="list-host">
      <div className="sheet sheet--scroll">
        <ListScrollPane>
          <p className="ledger-intro">
            开发笔记与生活随想。按时间倒排，越新的越靠上。
          </p>
          {featured ? (
            <article
              className={`entry entry--lead${featured.cover ? " has-cover" : ""}`}
            >
              <div className="entry-when">
                <span className="entry-day">{stamp(featured.publishedAt).day}</span>
                <span className="entry-ym">{stamp(featured.publishedAt).ym}</span>
              </div>
              <div className="entry-body">
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
              {featured.cover && <EntryCover slug={featured.slug} cover={featured.cover} />}
            </article>
          ) : (
            <p className="entry-empty">
              还没有已发布的文章。登录后台写下第一篇，这里就会出现内容。
            </p>
          )}

          {rest.map((post) => (
            <article
              className={`entry${post.cover ? " has-cover" : ""}`}
              key={post.id}
            >
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
              {post.cover && <EntryCover slug={post.slug} cover={post.cover} />}
            </article>
          ))}

          {featured && rest.length === 0 && (
            <p className="ledger-end">
              更多文章会按时间排在这条线下面。
            </p>
          )}
        </ListScrollPane>

        <ScrollArea className="rail" role="complementary" ariaLabel="侧栏">
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
        </ScrollArea>
      </div>
    </div>
  );
}