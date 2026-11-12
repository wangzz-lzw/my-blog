/**
 * 把已发布文章切成 DocChunk（见 openspec: rag-indexing）。
 *
 * 跑法：
 *   npx tsx --env-file=.env scripts/backfill-chunks.ts
 *   npx tsx --env-file=.env scripts/backfill-chunks.ts --quiet   # 只打一行摘要
 *
 * 实际逻辑在 `lib/rag/index.ts` 的 `reindexAll()`——启动回填与写接口用的是同一个函数，
 * 这里只是 CLI 外壳与人类可读的输出。
 *
 * 幂等：按 [postId, order] upsert，重复执行不会产生重复块；
 * 文章块数变少时多出来的旧块会被删掉；孤儿块（文章已删/已转草稿）一并清理。
 *
 * 向量不在这里生成：本地没有 pgvector，embedding 列不存在。
 */
import { prisma } from "../lib/prisma";
import { reindexAll } from "../lib/rag/index";

const QUIET = process.argv.includes("--quiet");

async function main() {
  const r = await reindexAll();

  if (!QUIET) {
    for (const p of r.perPost) {
      console.log(`  ${p.title}  → ${p.chunks} 块 / ${p.chars} 字`);
    }
    console.log("\n=== 回填完成 ===");
    console.log(`扫描文章: ${r.scanned}`);
    console.log(`新建块  : ${r.created}`);
    console.log(`更新块  : ${r.updated}`);
    console.log(`清理旧块: ${r.removed}`);
    console.log(`孤儿块  : ${r.orphanRemoved}`);
    console.log(`表内总块数: ${r.totalChunks}`);
  } else {
    // --quiet 也要留一行摘要：完全无声会让「索引到底建没建」变成只能靠猜的问题
    console.log(
      `[rag] 索引就绪：文章 ${r.scanned} 篇 / 块 ${r.totalChunks} 个` +
        `（新建 ${r.created}，更新 ${r.updated}，清理 ${r.removed + r.orphanRemoved}）`
    );
  }
}

main()
  .catch((e) => {
    // 启动回填失败不该阻断服务，调用方会捕获；这里给 CLI 一个非零退出码
    console.error("[rag] 回填失败：", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
