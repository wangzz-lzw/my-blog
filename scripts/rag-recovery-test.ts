// 模拟线上故障：清空索引 → 回填 → 验证问答恢复（任务 5.2）
export {};
import { prisma } from "../lib/prisma";
import { reindexAll } from "../lib/rag/index";
import { detectRetriever, getRetriever, minScoreFor } from "../lib/rag/retrieve";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

async function main() {
  const question = "如何创建智能体";

  /* ---------- 1) 清空索引，模拟线上状态 ---------- */
  console.log("=== 模拟线上：清空 DocChunk ===");
  const before = await prisma.docChunk.count();
  await prisma.docChunk.deleteMany({});
  const empty = await prisma.docChunk.count();
  console.log(`  清空前 ${before} 块 → 清空后 ${empty} 块`);
  check("索引已清空", empty === 0, { empty });

  // 此时检索应返回 0 条 → 被拒答
  const mode1 = await detectRetriever();
  const r1 = await getRetriever();
  const hits1 = await r1.retrieve(question, 6);
  const top1 = hits1[0]?.score ?? 0;
  const wouldRefuse = hits1.length === 0 || top1 < minScoreFor(mode1.mode);
  console.log(`  空索引下检索：${hits1.length} 条，最高分 ${top1.toFixed(3)}，会拒答=${wouldRefuse}`);
  check("空索引时确实会拒答（复现线上现象）", wouldRefuse, {
    hits: hits1.length,
    top: top1,
    threshold: minScoreFor(mode1.mode),
  });

  /* ---------- 2) 回填 ---------- */
  console.log("\n=== 执行回填（模拟容器启动那一步）===");
  const t0 = Date.now();
  const r = await reindexAll();
  const ms = Date.now() - t0;
  console.log(`  回填 ${r.scanned} 篇 → ${r.totalChunks} 块，耗时 ${ms}ms`);
  check("回填后索引非空", r.totalChunks > 0, { totalChunks: r.totalChunks });
  check("回填耗时在可接受范围（<3s）", ms < 3000, { ms });

  /* ---------- 3) 检索恢复 ---------- */
  console.log("\n=== 回填后检索 ===");
  const mode2 = await detectRetriever();
  const r2 = await getRetriever();
  const hits2 = await r2.retrieve(question, 6);
  const top2 = hits2[0]?.score ?? 0;
  const passes = hits2.length > 0 && top2 >= minScoreFor(mode2.mode);
  console.log(`  「${question}」→ ${hits2.length} 条，最高分 ${top2.toFixed(3)}，通过=${passes}`);
  if (hits2[0]) console.log(`  首块：${hits2[0].heading ?? "(无标题)"} / ${hits2[0].postTitle}`);

  check("回填后检索能命中", hits2.length > 0, { hits: hits2.length });
  check("回填后分数过阈值（不再拒答）", passes, {
    top: top2,
    threshold: minScoreFor(mode2.mode),
  });

  /* ---------- 4) 多问题覆盖 ---------- */
  console.log("\n=== 多个站内问题 ===");
  const questions = [
    "如何创建智能体",
    "什么是Agent",
    "系统提示词是什么",
    "浏览器插件怎么开发",
  ];
  let passCount = 0;
  for (const q of questions) {
    const hs = await r2.retrieve(q, 6);
    const top = hs[0]?.score ?? 0;
    const ok = hs.length > 0 && top >= minScoreFor(mode2.mode);
    if (ok) passCount += 1;
    console.log(`  [${top.toFixed(3)}] ${ok ? "可答" : "拒答"}  ${q}`);
  }
  check("多数站内问题可答（≥3/4）", passCount >= 3, { passCount, total: questions.length });

  const failed = results.filter((x) => !x).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
