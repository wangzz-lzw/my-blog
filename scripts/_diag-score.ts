// 诊断某问题的检索分数与关键词
export {};
import { FulltextRetriever, extractKeywords, scoreChunk } from "../lib/rag/retrieve";
import { prisma } from "../lib/prisma";

const qs = [
  "如何创建智能体",
  "怎么初始化模型",
  "系统提示词是什么",
  "LangChain 的 Agent 和 Chain 有什么区别",
  "今天北京的天气怎么样",
];

async function main() {
  const ft = new FulltextRetriever();
  for (const q of qs) {
    const kws = extractKeywords(q);
    const hits = await ft.retrieve(q, 6);
    console.log(`\n问题: ${q}`);
    console.log(`  关键词(${kws.length}): ${kws.join(" | ")}`);
    console.log(`  召回块数: ${hits.length}  最高分: ${(hits[0]?.score ?? 0).toFixed(3)}`);
    if (hits[0]) console.log(`  首块: ${hits[0].heading ?? "(无标题)"}`);
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
