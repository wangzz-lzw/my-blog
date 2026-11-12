// 导入规整单测（openspec: fix-markdown-inline-html，任务 4.1 / 4.2）
export {};
import { normalizeInlineHtml, parseMarkdownDocument } from "../lib/markdown-import";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail === undefined ? "" : "  " + JSON.stringify(detail)}`);
};

console.log("=== 4.1 normalizeInlineHtml ===");

/* 1) font 包裹 —— 核心场景 */
{
  const input = `<font style="color:rgb(79,79,79);background-color:rgb(238,240,244);">actions.js</font>`;
  const out = normalizeInlineHtml(input);
  check("font 包裹被剥掉", out === "actions.js", { out });
}

/* 2) span 包裹 */
{
  const out = normalizeInlineHtml(`<span style="color:red">红色文字</span>`);
  check("span 包裹被剥掉", out === "红色文字", { out });
}

/* 3) 无属性的 font */
{
  const out = normalizeInlineHtml(`<font>纯文字</font>`);
  check("无属性 font 被剥掉", out === "纯文字", { out });
}

/* 4) br 转换行 */
{
  const out = normalizeInlineHtml("第一行<br>第二行");
  check("br 转成换行", out.includes("第一行") && out.includes("第二行") && !out.includes("<br"), {
    out: JSON.stringify(out),
  });
}

/* 5) 代码块内不动 —— 最关键 */
{
  const input = "```python\nprint(type(m))  # <class 'langchain_deepseek'>\n```";
  const out = normalizeInlineHtml(input);
  check("代码块内的 <class '...'> 原样保留", out === input, { changed: out !== input });
}
{
  const input = "```html\n<font style=\"color:red\">x</font>\n```";
  const out = normalizeInlineHtml(input);
  check("代码块内的 font 标签不被剥", out === input, { out });
}

/* 6) 行内代码内不动 */
{
  const input = "行内代码 `<font style=\"color:red\">` 应保留";
  const out = normalizeInlineHtml(input);
  check("行内代码内的标签不被剥", out.includes("`<font style="), { out });
}

/* 7) 有结构的 HTML 保留 */
{
  const cases = ["<table><tr><td>a</td></tr></table>", "<sup>2</sup>", "<mark>高亮</mark>"];
  for (const c of cases) {
    const out = normalizeInlineHtml(c);
    check(`结构标签保留: ${c.slice(0, 20)}`, out === c, { out });
  }
}

/* 8) 纯 Markdown 完全不变 */
{
  const input = "# 标题\n\n普通段落，带 **粗体** 和 `代码`。\n\n- 列表项\n- 第二项\n\n| a | b |\n|---|---|\n| 1 | 2 |";
  const out = normalizeInlineHtml(input);
  check("纯 Markdown 逐字节不变", out === input, { same: out === input });
}

/* 9) 围栏切换正确（~~~ 也要识别） */
{
  const input = "~~~\n<font>保留</font>\n~~~";
  const out = normalizeInlineHtml(input);
  check("~~~ 围栏也被识别", out === input, { out });
}

console.log("\n=== 4.2 parseMarkdownDocument 集成 ===");
{
  const md = `---\ntitle: 测试标题\ntags: [a, b]\n---\n\n## <font style="color:red">小节</font>\n\n正文`;
  const parsed = parseMarkdownDocument(md);
  check("标题解析正确", parsed?.title === "测试标题", { title: parsed?.title });
  check("标签解析正确", JSON.stringify(parsed?.tags) === '["a","b"]', { tags: parsed?.tags });
  check("正文里的 font 被剥掉", !parsed?.body?.includes("<font"), { body: parsed?.body?.slice(0, 60) });
  check("正文保留小节文字", Boolean(parsed?.body?.includes("小节")), {});
}

{
  const plain = `---\ntitle: 纯文本\n---\n\n## 小节\n\n**粗体** 与 \`代码\``;
  const parsed = parseMarkdownDocument(plain);
  check("无 HTML 的文件正文不受影响", parsed?.body === "## 小节\n\n**粗体** 与 `代码`", {
    body: parsed?.body,
  });
}

{
  // 代码块在 frontmatter 之后，确保整体链路都对
  const md = `---\ntitle: 代码测试\n---\n\n\`\`\`python\nprint(type(m))  # <class 'x'>\n\`\`\``;
  const parsed = parseMarkdownDocument(md);
  check("整链路：代码块内 <class '...'> 保留", Boolean(parsed?.body?.includes("<class 'x'>")), {
    body: parsed?.body,
  });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exitCode = 1;
