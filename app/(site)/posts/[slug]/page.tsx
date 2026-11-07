import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { readTime } from "@/lib/read-time";
import { decodeSlugParam } from "@/lib/slug";
import { CommentForm } from "@/components/CommentForm";
import { GsapReveal } from "@/components/GsapReveal";
import { ReadingProgress } from "@/components/ReadingProgress";
import { PostViewBeacon } from "@/components/PostViewBeacon";
import { PostOutline } from "@/components/blog/PostOutline";
import type { SafeComment } from "@/lib/types";

export const revalidate = 60;
export const dynamicParams = true;

/**
 * 动态段参数在这里是「未解码」的原始片段（含中文的 slug 会以 %E7%AC%AC… 形式到达），
 * 直接用去查库必然查不到，所以统一从 lib/slug 解码一次。
 */

/** 文章页标题交给 layout 的 `%s | 站点名` 模板，避免标签页只显示站点名 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: raw } = await params;
  const slug = decodeSlugParam(raw);
  const post = await prisma.post.findUnique({
    where: { slug },
    select: { title: true, excerpt: true, published: true },
  });
  if (!post || !post.published) return {};
  return {
    title: post.title,
    description: post.excerpt ?? undefined,
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeSlugParam(rawSlug);

  const post = await prisma.post.findUnique({
    where: { slug },
    include: {
      tags: true,
      comments: {
        where: { approved: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!post || !post.published) notFound();

  const safeComments: SafeComment[] = post.comments.map((c) => ({
    id: c.id,
    author: c.author,
    content: c.content,
    createdAt: c.createdAt,
  }));

  return (
    <GsapReveal>
      <ReadingProgress />
      <div className="article-shell">
      {/* 宽屏左侧大纲：绝对定位在壳的左外侧，正文排版不受影响 */}
      <PostOutline />
      <article className="article post-detail">
        <header className="post-header" data-reveal>
          <div className="post-when">
            <span className="d">
              {String((post.publishedAt ?? post.createdAt).getDate()).padStart(2, "0")}
            </span>
            <span className="m">
              {(post.publishedAt ?? post.createdAt).getFullYear()}.
              {String((post.publishedAt ?? post.createdAt).getMonth() + 1).padStart(2, "0")}
            </span>
            <span className="extra">
              <span>{readTime(post.content)} 分钟</span>
              <span>{post.views || 0} 次浏览</span>
            </span>
          </div>
          <Link href="/blog" className="back-link">
            ← 返回文章列表
          </Link>
          <h1>{post.title}</h1>
          {post.excerpt && <p className="post-dek">{post.excerpt}</p>}
        </header>
        <div className="prose" data-reveal>
          <Markdown>{post.content}</Markdown>
        </div>
        {post.tags.length > 0 && (
          <div className="post-foot">
            <div className="post-tags">
              {post.tags.map((t) => (
                <Link key={t.id} href={`/tags/${t.slug}`} className="tag">
                  {t.name}
                </Link>
              ))}
            </div>
          </div>
        )}
        <section className="comments" data-reveal>
          <h2>评论（{safeComments.length}）</h2>
          {safeComments.length === 0 && (
            <p style={{ color: "var(--muted)" }}>暂无评论。</p>
          )}
          {safeComments.map((c) => (
            <div key={c.id} className="comment">
              <span className="comment-author">{c.author}</span>
              <span className="comment-time">{formatDate(c.createdAt)}</span>
              <p>{c.content}</p>
            </div>
          ))}
          <CommentForm slug={post.slug} postUrl={`/posts/${post.slug}`} />
        </section>
      </article>
      </div>
      <PostViewBeacon postId={post.id} />
    </GsapReveal>
  );
}
