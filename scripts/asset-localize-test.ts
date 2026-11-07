// 图片资源本地化的纯逻辑测试（openspec: localize-import-assets，任务 1.1 - 1.3）
// 跑法：npx tsx scripts/asset-localize-test.ts
import {
  findLocalImageRefs,
  rewriteRefs,
  basename,
  indexFiles,
  planLocalization,
} from "../lib/asset-localize";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};
const eq = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  got=${JSON.stringify(actual)} want=${JSON.stringify(expected)}`);
};

/* ---------- basename ---------- */
eq("basename ./images/a.png", basename("./images/a.png"), "a.png");
eq("basename ../assets/b.jpg", basename("../assets/b.jpg"), "b.jpg");
eq("basename a.png", basename("a.png"), "a.png");
eq("basename 带反斜杠", basename("images\\sub\\c.webp"), "c.webp");
eq("basename 带查询串", basename("a.png?v=1"), "a.png");

/* ---------- 1.1 找出本地引用 ---------- */
{
  const md = [
    "![图示](./images/a.png)",
    "![](a.png)",
    "![x](../assets/b.jpg)",
    "![远程](https://example.com/c.png)",
    "![内联](data:image/png;base64,AAAA)",
    "![锚点](#section)",
    "![已本地化](/img/abc.png)",
  ].join("\n\n");
  const refs = findLocalImageRefs(md);
  const targets = refs.map((r) => r.target);
  check("1.1 只找出 3 处本地引用", refs.length === 3, { count: refs.length, targets });
  eq("1.1 相对路径被找出", targets.includes("./images/a.png"), true);
  eq("1.1 无前缀路径被找出", targets.includes("a.png"), true);
  eq("1.1 上级目录被找出", targets.includes("../assets/b.jpg"), true);
  eq("1.1 http 不被找出", targets.includes("https://example.com/c.png"), false);
  eq("1.1 data: 不被找出", targets.some((t) => t.startsWith("data:")), false);
  eq("1.1 #锚点 不被找出", targets.includes("#section"), false);
  eq("1.1 站内绝对路径不被找出", targets.includes("/img/abc.png"), false);
}

/* ---------- 1.2 替代文字含特殊字符时不被破坏 ---------- */
{
  const md = "前文 ![系统架构图（v2）](./images/arch.png) 后文";
  const rewritten = rewriteRefs(md, new Map([["arch.png", "/img/abc.png"]]));
  eq(
    "1.2 替代文字与前后文完整保留",
    rewritten.content,
    "前文 ![系统架构图（v2）](/img/abc.png) 后文"
  );
  eq("1.2 替换计数", rewritten.replaced, 1);
  eq("1.2 无未匹配", rewritten.unmatched, []);
}
{
  // alt 里带方括号的情况
  const md = "![a [1]](x.png)";
  const refs = findLocalImageRefs(md);
  check("1.2 alt 含方括号仍能匹配", refs.length === 1, { count: refs.length });
}
{
  // 尖括号包裹的含空格路径
  const md = "![](<./my images/a b.png>)";
  const refs = findLocalImageRefs(md);
  check("1.2 尖括号包裹的含空格路径", refs.length === 1 && refs[0].target === "./my images/a b.png", {
    refs: refs.map((r) => r.target),
  });
}

/* ---------- 1.2 部分匹配 ---------- */
{
  const md = [
    "![一](./a.png)",
    "![二](./missing.png)",
    "![三](./b.jpg)",
  ].join("\n\n");
  const r = rewriteRefs(md, new Map([["a.png", "/img/1.png"], ["b.jpg", "/img/3.jpg"]]));
  eq("1.2 部分匹配替换 2 处", r.replaced, 2);
  eq("1.2 未匹配清单长度 1", r.unmatched.length, 1);
  eq("1.2 未匹配项是 missing.png", r.unmatched[0], "./missing.png");
  check("1.2 未匹配引用原样保留", r.content.includes("![二](./missing.png)"), {
    content: r.content,
  });
  check("1.2 已匹配的换成站内地址", r.content.includes("/img/1.png") && r.content.includes("/img/3.jpg"));
}
{
  // 全部未匹配
  const md = "![a](./a.png)\n\n![b](./b.png)";
  const r = rewriteRefs(md, new Map());
  eq("1.2 全部未匹配时正文不变", r.content, md);
  eq("1.2 全部未匹配时 replaced=0", r.replaced, 0);
  eq("1.2 全部未匹配时列出 2 项", r.unmatched.length, 2);
}

/* ---------- 1.2 多处替换下标不错位 ---------- */
{
  const md = "![a](a.png) 中间 ![b](b.png) 结尾 ![c](c.png)";
  const r = rewriteRefs(
    md,
    new Map([
      ["a.png", "/img/A.png"],
      ["b.png", "/img/B.png"],
      ["c.png", "/img/C.png"],
    ])
  );
  eq("1.2 三处全部替换且顺序正确", r.content, "![a](/img/A.png) 中间 ![b](/img/B.png) 结尾 ![c](/img/C.png)");
  eq("1.2 计数 3", r.replaced, 3);
}

/* ---------- 1.3 幂等：改完再找应为 0 ---------- */
{
  const md = "![a](./a.png)";
  const once = rewriteRefs(md, new Map([["a.png", "/img/x.png"]]));
  const again = findLocalImageRefs(once.content);
  eq("1.3 已本地化的正文不再有本地引用", again.length, 0);
  const twice = rewriteRefs(once.content, new Map([["a.png", "/img/x.png"]]));
  eq("1.3 再跑一次正文不变", twice.content, once.content);
}

/* ---------- indexFiles 重名处理 ---------- */
{
  const f1 = new File(["a"], "dup.png", { type: "image/png" });
  const f2 = new File(["b"], "dup.png", { type: "image/png" });
  const f3 = new File(["c"], "uniq.png", { type: "image/png" });
  const { byName, duplicates } = indexFiles([f1, f2, f3]);
  eq("重名只保留第一个", byName.get("dup.png"), f1);
  eq("重名被记录", duplicates, ["dup.png"]);
  eq("不重名的都在", byName.size, 2);
}

/* ---------- planLocalization（确认条用的摘要） ---------- */
{
  const md = "![a](./a.png)\n![b](./b.png)\n![c](./c.png)";
  const files = [new File(["a"], "a.png", { type: "image/png" })];
  const plan = planLocalization(md, files);
  eq("摘要：引用 3 处", plan.refs.length, 3);
  eq("摘要：匹配 1 张", plan.matched.length, 1);
  eq("摘要：缺失 2 处", plan.missing.length, 2);
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
