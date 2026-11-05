import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { readTime } from "@/lib/read-time";
import { decodeSlugParam } from "@/lib/slug";

export const revalidate = 60;
export const dynamicParams = true;

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);

  const tag = await prisma.tag.findUnique({
    where: { slug },
    include: {
      posts: {
        where: { published: true },
        include: { tags: true },
        orderBy: { publishedAt: "desc" },
      },
    },
  });

  if (!tag) notFound();

  return (
    <div className="container container-read page">
      <header className="page-head" data-reveal>
        <Link href="/tags" className="back-link">
          ← 全部标签
        </Link>
        <h1 className="page-title"># {tag.name}</h1>
        <p className="page-sub">该标签下共 {tag.posts.length} 篇文章。</p>
      </header>

      {tag.posts.length === 0 ? (
        <p className="empty-note">该标签下暂无已发布的文章。</p>
      ) : (
        <ul className="post-list" data-reveal>
          {tag.posts.map((post) => (
            <li key={post.id} className="post-item">
              <h2>
                <Link href={`/posts/${post.slug}`}>{post.title}</Link>
              </h2>
              {post.excerpt && <p className="post-excerpt">{post.excerpt}</p>}
              <div className="post-meta">
                <span>{formatDate(post.publishedAt)}</span>
                <span>{readTime(post.content)} 分钟</span>
                {post.tags.length > 0 && (
                  <span className="post-meta-tags">
                    {post.tags.map((t) => (
                      <Link key={t.id} href={`/tags/${t.slug}`} className="tag">
                        {t.name}
                      </Link>
                    ))}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="page-back">
        <Link href="/" className="back-link">
          ← 返回首页
        </Link>
      </p>
    </div>
  );
}
