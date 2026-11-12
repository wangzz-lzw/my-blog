// 索引生命周期验证（openspec: keep-rag-index-fresh，任务 1.1 / 3.x / 5.2）
export {};
import { prisma } from "../lib/prisma";
import { reindexPost, removePostIndex, reindexAll } from "../lib/rag/index";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

async function main() {
  const postsBefore = await prisma.post.count();
  const chunksBefore = await prisma.docChunk.count();
  console.log(`初始：文章 ${postsBefore} 篇 / 块 ${chunksBefore} 个\n`);

  /* ---------- 1.1 reindexPost 幂等 ---------- */
  console.log("=== 1.1 reindexPost ===");
  const target = await prisma.post.findFirst({
    where: { published: true },
    select: { id: true, title: true },
  });
  if (!target) throw new Error("没有已发布文章可测");

  const r1 = await reindexPost(target.id);
  const r2 = await reindexPost(target.id);
  check("首次重建有块", r1.chunks > 0, { chunks: r1.chunks });
  check("二次重建 created=0（幂等）", r2.created === 0, { created: r2.created, updated: r2.updated });
  check("二次重建块数不变", r1.chunks === r2.chunks, { a: r1.chunks, b: r2.chunks });

  /* ---------- 3.2 正文变短 → 旧块清理 ---------- */
  console.log("\n=== 3.2 正文变短清理旧块 ===");
  const tmp = await prisma.post.create({
    data: {
      title: "临时索引测试",
      slug: "__idx-test__",
      content: "## 第一节\n\n" + "内容甲。".repeat(600) + "\n\n## 第二节\n\n" + "内容乙。".repeat(600),
      published: true,
      publishedAt: new Date(),
    },
  });
  const rBig = await reindexPost(tmp.id);
  console.log(`  长正文切出 ${rBig.chunks} 块`);

  // 改成很短的正文
  await prisma.post.update({
    where: { id: tmp.id },
    data: { content: "## 只剩一节\n\n短内容。" },
  });
  const rSmall = await reindexPost(tmp.id);
  const afterCount = await prisma.docChunk.count({ where: { postId: tmp.id } });
  console.log(`  短正文切出 ${rSmall.chunks} 块，表内实际 ${afterCount} 块`);

  check("正文变短后块数减少", rSmall.chunks < rBig.chunks, { big: rBig.chunks, small: rSmall.chunks });
  check("旧块被清理（表内块数 == 新块数）", afterCount === rSmall.chunks, {
    afterCount,
    expected: rSmall.chunks,
  });
  check("清理数量正确", rSmall.removed === rBig.chunks - rSmall.chunks, {
    removed: rSmall.removed,
    expected: rBig.chunks - rSmall.chunks,
  });

  /* ---------- 3.4 转草稿 → 块移除 ---------- */
  console.log("\n=== 3.4 转草稿移除块 ===");
  await prisma.post.update({ where: { id: tmp.id }, data: { published: false } });
  const rDraft = await reindexPost(tmp.id);
  const draftCount = await prisma.docChunk.count({ where: { postId: tmp.id } });
  check("转草稿后 chunks=0", rDraft.chunks === 0, { chunks: rDraft.chunks });
  check("转草稿后表内无该文章的块", draftCount === 0, { draftCount });

  /* ---------- 3.3 removePostIndex ---------- */
  console.log("\n=== 3.3 removePostIndex ===");
  await prisma.post.update({ where: { id: tmp.id }, data: { published: true } });
  await reindexPost(tmp.id);
  const beforeRemove = await prisma.docChunk.count({ where: { postId: tmp.id } });
  const removed = await removePostIndex(tmp.id);
  const afterRemove = await prisma.docChunk.count({ where: { postId: tmp.id } });
  check("删除前有块", beforeRemove > 0, { beforeRemove });
  check("removePostIndex 返回删除数", removed === beforeRemove, { removed, beforeRemove });
  check("删除后为 0", afterRemove === 0, { afterRemove });

  // 清理临时文章
  await prisma.post.delete({ where: { id: tmp.id } });

  /* ---------- reindexAll 孤儿块清理 ---------- */
  console.log("\n=== reindexAll 孤儿块 ===");
  // 造一个孤儿块（postId 不存在的文章）
  await prisma.docChunk.create({
    data: {
      postId: "orphan-post-id-not-exist",
      slug: "orphan",
      postTitle: "孤儿文章",
      order: 0,
      heading: null,
      text: "这段内容不该被检索到",
      chars: 11,
    },
  });
  const orphanBefore = await prisma.docChunk.count({ where: { postId: "orphan-post-id-not-exist" } });
  const all = await reindexAll();
  const orphanAfter = await prisma.docChunk.count({ where: { postId: "orphan-post-id-not-exist" } });
  check("孤儿块存在（前置）", orphanBefore === 1, { orphanBefore });
  check("reindexAll 清理孤儿块", orphanAfter === 0 && all.orphanRemoved >= 1, {
    orphanAfter,
    orphanRemoved: all.orphanRemoved,
  });

  /* ---------- 5.2 索引与文章一致 ---------- */
  console.log("\n=== 5.2 全量一致性 ===");
  const published = await prisma.post.count({ where: { published: true } });
  const total = await prisma.docChunk.count();
  const sumChunks = await Promise.all(
    (await prisma.post.findMany({ where: { published: true }, select: { id: true } })).map((p) =>
      prisma.docChunk.count({ where: { postId: p.id } })
    )
  );
  const sum = sumChunks.reduce((a, b) => a + b, 0);
  check("块总数 == 各已发布文章块数之和", total === sum, { total, sum });
  check("扫描文章数正确", all.scanned === published, { scanned: all.scanned, published });

  console.log(`\n最终：已发布 ${published} 篇 / 块 ${total} 个`);

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
