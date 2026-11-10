/**
 * 把已发布文章切成 DocChunk（见 openspec: add-ai-qa，任务 1.3）。
 *
 * 跑法：npx tsx --env-file=.env scripts/backfill-chunks.ts
 *
 * 幂等：按 [postId, order] upsert，重复执行不会产生重复块；
 * 文章块数变少时（比如删了一节）多出来的旧块会被删掉。
 *
 * 向量不在这里生成：本地没有 pgvector，embedding 列不存在。
 * 生产启用向量后，另跑 scripts/backfill-embeddings.ts 补向量。
 */
import { prisma } from "../lib/prisma";
import { chunkMarkdown } from "../lib/rag/chunk";

async function main() {
  const posts = await prisma.post.findMany({
    where: { published: true },
    select: { id: true, slug: true, title: true, content: true },
    orderBy: { publishedAt: "desc" },
  });

  if (posts.length === 0) {
    console.log("没有已发布文章，无需回填");
    return;
  }

  let scanned = 0;
  let created = 0;
  let updated = 0;
  let removed = 0;

  for (const post of posts) {
    scanned += 1;
    const chunks = chunkMarkdown(post.content);
    const totalChars = chunks.reduce((a, c) => a + c.chars, 0);

    const existing = await prisma.docChunk.findMany({
      where: { postId: post.id },
      select: { id: true, order: true },
    });
    const existingOrders = new Set(existing.map((e) => e.order));

    for (const chunk of chunks) {
      await prisma.docChunk.upsert({
        where: { postId_order: { postId: post.id, order: chunk.order } },
        create: {
          postId: post.id,
          slug: post.slug,
          postTitle: post.title,
          order: chunk.order,
          heading: chunk.heading,
          text: chunk.text,
          chars: chunk.chars,
        },
        update: {
          slug: post.slug,
          postTitle: post.title,
          heading: chunk.heading,
          text: chunk.text,
          chars: chunk.chars,
        },
      });
      if (existingOrders.has(chunk.order)) updated += 1;
      else created += 1;
    }

    // 文章变短后多出来的旧块要清掉，否则检索会命中已删除的内容
    const stale = existing.filter((e) => e.order >= chunks.length);
    if (stale.length > 0) {
      await prisma.docChunk.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
      removed += stale.length;
    }

    console.log(
      `  ${post.title}  → ${chunks.length} 块 / ${totalChars} 字（原 ${post.content.length} 字）`
    );
  }

  console.log("\n=== 回填完成 ===");
  console.log(`扫描文章: ${scanned}`);
  console.log(`新建块  : ${created}`);
  console.log(`更新块  : ${updated}`);
  console.log(`清理旧块: ${removed}`);

  const total = await prisma.docChunk.count();
  console.log(`表内总块数: ${total}`);
}

main()
  .catch((e) => {
    console.error("回填失败：", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
