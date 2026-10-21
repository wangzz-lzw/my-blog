import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const revalidate = 60;

export default async function TagsPage() {
  const tags = await prisma.tag.findMany({
    include: { _count: { select: { posts: true } } },
    orderBy: { name: "asc" },
  });

  if (tags.length === 0) {
    return <p style={{ color: "var(--muted)", marginTop: "2rem" }}>暂无标签。</p>;
  }

  return (
    <div>
      <h1 style={{ marginTop: "1.5rem" }}>全部标签</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1.5rem 0" }}>
        {tags.map((t) => (
          <Link key={t.id} href={`/tags/${t.slug}`} className="tag" style={{ padding: "0.4rem 0.9rem", fontSize: "0.9rem" }}>
            {t.name}（{t._count.posts}）
          </Link>
        ))}
      </div>
    </div>
  );
}
