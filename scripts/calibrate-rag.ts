// 检索层验证与阈值标定（openspec: add-ai-qa，任务 2.1 / 2.2 / 3.3）
// 跑法：npx tsx --env-file=.env scripts/calibrate-rag.ts
export {};
import { FulltextRetriever, detectRetriever, getRetriever, minScoreFor } from "../lib/rag/retrieve";
import { prisma } from "../lib/prisma";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

/** 站内能答的问题（文章里确实讲过） */
const IN_DOMAIN = [
  "LangChain 的 Agent 和 Chain 有什么区别",
  "怎么初始化模型",
  "系统提示词是什么",
  "如何使用 Model 类",
  "本地图片怎么处理",
  "环境变量怎么配置",
  "LangChain 有哪些核心组件",
];

/** 站外无关问题（文章里绝对没写） */
const OUT_DOMAIN = [
  "今天北京的天气怎么样",
  "红烧肉怎么做才好吃",
  "如何用 Rust 写操作系统内核",
  "量子纠缠的物理机制是什么",
  "推荐几部 2025 年的科幻电影",
  "如何训练一个扩散模型",
  "苹果公司的市值是多少",
];

async function main() {
  console.log("=== 2.2 运行时探测 ===");
  const det = await detectRetriever();
  console.log("  模式:", det.mode, " 原因:", det.reason);
  check("本地探测结果为 fulltext（无 pgvector）", det.mode === "fulltext", det);

  const retriever = await getRetriever();
  check("getRetriever 返回 FulltextRetriever", retriever.mode === "fulltext", { mode: retriever.mode });

  const total = await prisma.docChunk.count();
  console.log(`  表内块数: ${total}`);
  check("表里有可检索的块", total > 0, { total });

  console.log("\n=== 2.1 召回质量（站内问题）===");
  const ft = new FulltextRetriever();
  const inScores: number[] = [];
  for (const q of IN_DOMAIN) {
    const hits = await ft.retrieve(q, 6);
    const top = hits[0]?.score ?? 0;
    inScores.push(top);
    console.log(`  [${top.toFixed(3)}] ${q}`);
    console.log(`         → ${hits[0]?.heading ?? "(无标题)"}  (${hits.length} 块)`);
  }

  console.log("\n=== 2.1 召回质量（站外问题）===");
  const outScores: number[] = [];
  for (const q of OUT_DOMAIN) {
    const hits = await ft.retrieve(q, 6);
    const top = hits[0]?.score ?? 0;
    outScores.push(top);
    console.log(`  [${top.toFixed(3)}] ${q}`);
  }

  console.log("\n=== 3.3 阈值标定 ===");
  console.log(`  站内问题最低分: ${Math.min(...inScores).toFixed(3)}`);
  console.log(`  站外问题最高分: ${Math.max(...outScores).toFixed(3)}`);

  // 全文检索的固有局限：措辞与原文差得远时召不回（如"环境变量怎么配置"）。
  // 这不是 bug —— 字面检索本来就这样，向量模式就是为解决它而存在的。
  // 阈值取"可靠拒答"优先：宁可在个别站内问题上保守（答不出），也不在站外问题上乱答。
  const current = minScoreFor("fulltext");
  console.log(`  当前常量 MIN_SCORE_FULLTEXT = ${current}`);

  const inPass = inScores.filter((s) => s >= current).length;
  const outPass = outScores.filter((s) => s < current).length;
  console.log(`  用该阈值:`);
  console.log(`    站内问题能答: ${inPass}/${inScores.length}`);
  console.log(`    站外问题被拒: ${outPass}/${outScores.length}`);

  check("站外问题全部被正确拒绝（不乱答是底线）", outPass === outScores.length, {
    outPass,
    total: outScores.length,
  });
  check("多数站内问题能答（≥70%）", inPass >= Math.ceil(inScores.length * 0.7), {
    inPass,
    total: inScores.length,
  });

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
