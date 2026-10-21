import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/date";

export const revalidate = 60;
export const dynamicParams = true;

export default async function TagPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const tag = await prisma.tag.findUnique({
    where: { slug },
    include: {
      posts: { where: { published: true }, orderBy: { publishedAt: "desc" } },
    },
  });

  if (!tag) notFound();

  return (
    <div>
      <h1 style={{ marginTop: "1.5rem" }}>标签：# {tag.name}</h1>
      {tag.posts.length === 0 && (
        <p style={{ color: "var(--muted)" }}>该标签下暂无已发布的文章。</p>
      )}
      <ul className="post-list">
        {tag.posts.map((post) => (
          <li key={post.id}>
            <h2>
              <Link href={`/posts/${post.slug}`}>{post.title}</Link>
            </h2>
            <div className="post-meta">
              <span>{formatDate(post.publishedAt)}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
