import Link from "next/link";
import { notFound } from "next/navigation";
import { Markdown } from "@/components/Markdown";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { readTime } from "@/lib/read-time";
import { CommentForm } from "@/components/CommentForm";
import { GsapReveal } from "@/components/GsapReveal";
import { ImmersiveToggle } from "@/components/ImmersiveToggle";
import { ReadingProgress } from "@/components/ReadingProgress";
import { PostViewBeacon } from "@/components/PostViewBeacon";
import type { SafeComment } from "@/lib/types";

export const revalidate = 60;
export const dynamicParams = true;

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

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
      <div className="container container-read">
      <article className="article post-detail">
        <header className="post-header" data-reveal>
          <Link href="/" className="back-link">
            ← 返回首页
          </Link>
          <h1>{post.title}</h1>
          <div className="post-meta">
            <span>
              {formatDate(post.publishedAt)} · {readTime(post.content)} 分钟 · 👁{" "}
              {post.views || 0}
            </span>
          </div>
          {post.tags.length > 0 && (
            <div className="post-tags">
              {post.tags.map((t) => (
                <Link key={t.id} href={`/tags/${t.slug}`} className="tag">
                  {t.name}
                </Link>
              ))}
            </div>
          )}
        </header>
        <div className="prose" data-reveal>
          <Markdown>{post.content}</Markdown>
        </div>
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
      <ImmersiveToggle />
    </GsapReveal>
  );
}
