import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import { CommentForm } from "@/components/CommentForm";
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
    <article className="article">
      <h1>{post.title}</h1>
      <div className="post-meta">
        <span>{formatDate(post.publishedAt)}</span>
        {post.tags.map((t) => (
          <Link key={t.id} href={`/tags/${t.slug}`} className="tag">
            {t.name}
          </Link>
        ))}
      </div>
      <div className="prose">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {post.content}
        </ReactMarkdown>
      </div>
      <section className="comments">
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
        <CommentForm slug={post.slug} />
      </section>
    </article>
  );
}
