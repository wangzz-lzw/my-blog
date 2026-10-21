import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";
import type { PostWithTags } from "@/lib/types";

export const revalidate = 60;

export default async function HomePage() {
  const posts: PostWithTags[] = await prisma.post.findMany({
    where: { published: true },
    include: { tags: true },
    orderBy: { publishedAt: "desc" },
  });

  if (posts.length === 0) {
    return (
      <p style={{ color: "var(--muted)", marginTop: "2rem" }}>
        还没有文章，去后台发布第一篇吧。
      </p>
    );
  }

  return (
    <ul className="post-list">
      {posts.map((post) => (
        <li key={post.id}>
          <h2>
            <Link href={`/posts/${post.slug}`}>{post.title}</Link>
          </h2>
          <div className="post-meta">
            <span>{formatDate(post.publishedAt)}</span>
            {post.tags.map((t) => (
              <Link key={t.id} href={`/tags/${t.slug}`} className="tag">
                {t.name}
              </Link>
            ))}
          </div>
          {post.excerpt && <p className="post-excerpt">{post.excerpt}</p>}
        </li>
      ))}
    </ul>
  );
}
