// 切块逻辑的单测（openspec: add-ai-qa，任务 1.2）
// 跑法：npx tsx scripts/chunk-test.ts
import { chunkMarkdown, MAX_CHUNK_CHARS } from "../lib/rag/chunk";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

/* ---------- 1) 无标题的纯段落 ---------- */
{
  const md = "第一段。\n\n第二段。\n\n第三段。";
  const chunks = chunkMarkdown(md);
  check("无标题：合成一块", chunks.length === 1, { count: chunks.length });
  check("无标题：heading 为 null", chunks[0].heading === null, { heading: chunks[0].heading });
  check("无标题：内容完整", chunks[0].text.includes("第一段") && chunks[0].text.includes("第三段"), {});
}

/* ---------- 2) 只有 h1（不算小节，应该整篇一块） ---------- */
{
  const md = "# 大标题\n\n正文甲。\n\n正文乙。";
  const chunks = chunkMarkdown(md);
  check("只有 h1：不按 h1 切", chunks.length === 1, { count: chunks.length });
  check("只有 h1：heading 仍为 null", chunks[0].heading === null, { heading: chunks[0].heading });
}

/* ---------- 3) h2 下堆 3000 字 → 应按段落细切 ---------- */
{
  const para = "这是一段填充文字，用来模拟长小节的内容。".repeat(10); // ~210 字
  const body = Array.from({ length: 15 }, () => para).join("\n\n"); // ~3150 字
  const md = `## 超长小节\n\n${body}`;
  const chunks = chunkMarkdown(md);
  check("长小节被细切（>1 块）", chunks.length > 1, { count: chunks.length });
  check(
    "每块不超过上限（代码块除外）",
    chunks.every((c) => c.chars <= MAX_CHUNK_CHARS + c.text.length - c.chars + 200),
    { max: Math.max(...chunks.map((c) => c.chars)) }
  );
  check(
    "每块都带小节标题",
    chunks.every((c) => c.text.startsWith("## 超长小节")),
    { heads: chunks.map((c) => c.text.slice(0, 12)) }
  );
  check(
    "order 连续递增",
    chunks.every((c, i) => c.order === i),
    { orders: chunks.map((c) => c.order) }
  );
}

/* ---------- 4) 代码块内不切 ---------- */
{
  const code = "```js\n" + Array.from({ length: 200 }, (_, i) => `const v${i} = ${i};`).join("\n") + "\n```";
  const md = `## 代码小节\n\n前言。\n\n${code}`;
  const chunks = chunkMarkdown(md);
  const withFence = chunks.filter((c) => c.text.includes("```js"));
  check("包含代码块的块存在", withFence.length === 1, { blocksWithCode: withFence.length });
  check(
    "代码围栏完整（成对出现）",
    withFence.every((c) => (c.text.match(/```/g) ?? []).length % 2 === 0),
    { fences: withFence.map((c) => (c.text.match(/```/g) ?? []).length) }
  );
  // 关键：代码块本身没有被劈开
  const codeChunk = withFence[0];
  check(
    "代码块未被拆断（一个块里有完整的 200 行）",
    codeChunk.text.includes("const v0 = 0;") && codeChunk.text.includes("const v199 = 199;"),
    { chars: codeChunk.chars }
  );
}

/* ---------- 5) 多小节结构 ---------- */
{
  const md = [
    "# 标题",
    "",
    "引言段落。",
    "",
    "## 第一节",
    "",
    "第一节内容。",
    "",
    "### 子节 1.1",
    "",
    "子节内容。",
    "",
    "## 第二节",
    "",
    "第二节内容。",
  ].join("\n");
  const chunks = chunkMarkdown(md);
  const headings = chunks.map((c) => c.heading);
  check("多小节：切出 4 块（引言 + 三种标题）", chunks.length === 4, { count: chunks.length, headings });
  check(
    "多小节：h2 与 h3 都被识别",
    headings.includes("第一节") && headings.includes("子节 1.1") && headings.includes("第二节"),
    { headings }
  );
  check("引言块 heading 为 null", chunks[0].heading === null, { first: chunks[0].heading });
}

/* ---------- 6) 空正文 ---------- */
{
  check("空字符串 → 0 块", chunkMarkdown("").length === 0, {});
  check("只有空白 → 0 块", chunkMarkdown("   \n\n  ").length === 0, {});
}

/* ---------- 7) 标题不重复拼 ---------- */
{
  const md = "## 已有标题\n\n已有标题\n\n内容。";
  const chunks = chunkMarkdown(md);
  // render() 发现正文以 heading 开头就不再拼前缀，所以整段文本里"已有标题"只出现 2 次
  // （一次是我们手写在正文里的，一次……不，其实只有 1 次，因为前缀被跳过了）
  const occurrences = (chunks[0].text.match(/已有标题/g) ?? []).length;
  check("正文已以标题开头时不再重复拼（只出现 1 次）", occurrences === 1, {
    occurrences,
    text: chunks[0].text,
  });
}

/* ---------- 8) 真实文章规模 ---------- */
{
  // 模拟那篇 6.6 万字的文章：60 个 h2，每个约 1100 字
  const md = Array.from({ length: 60 }, (_, i) =>
    `## 第 ${i + 1} 节\n\n` + "正文内容。".repeat(220)
  ).join("\n\n");
  const chunks = chunkMarkdown(md);
  check("大文章切出合理块数（>100）", chunks.length > 100, { count: chunks.length });
  const avg = Math.round(chunks.reduce((a, c) => a + c.chars, 0) / chunks.length);
  check("平均块大小在 400-900 之间", avg >= 400 && avg <= 900, { avg });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
