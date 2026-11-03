// 独立 unified 管线复现（绕开 react-markdown）
import { unified } from "unified";
import remarkParse from "remark-parse";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkRehype from "remark-rehype";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeHighlight from "rehype-highlight";

const md = "# 大标题\n\n正文。\n\n[外链](https://example.com/x)\n";

// 注意：unified .use() 的条目必须是「插件函数」或「[函数, options]」；
// 直接传「已实例化的插件」会在 freeze 时无参调用而炸 500（本次事故的根因）。

function tryRun(label, extra) {
  try {
    const p = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkBreaks)
      .use(remarkRehype)
      .use(...extra);
    const tree = p.parse(md);
    p.runSync(tree);
    console.log(label, "OK; type=", tree.type);
  } catch (e) {
    console.log(label, "FAIL:", e.message);
  }
}

tryRun("X0) 无额外插件", []);
tryRun("X3) +slug", [rehypeSlug]);
tryRun("X7) 全部(函数+options 形式)", [
  rehypeSlug,
  [
    rehypeAutolinkHeadings,
    {
      behavior: "append",
      properties: { className: ["heading-anchor"] },
      content: {
        type: "element",
        tagName: "span",
        properties: {},
        children: [{ type: "text", value: "#" }],
      },
    },
  ],
  [rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] }],
  rehypeHighlight,
]);

// 独立插件链（非 unified .use）验证 hast 侧 target/rel
try {
  const p2 = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype)
    .use(rehypeSlug)
    .use(rehypeExternalLinks, { target: "_blank", rel: ["noopener", "noreferrer"] });
  const t2 = p2.parse(md);
  p2.runSync(t2);
  const json = JSON.stringify(t2);
  console.log("X8) 独立链 target:", /"target":"_blank"/.test(json), "; id:", /"id":"[^"]+"/.test(json), "; href:", /"href":"https/.test(json));
  if (!/"target":"_blank"/.test(json)) console.log(json.slice(0, 800));
} catch (e) {
  console.log("X8) 独立链 FAIL:", e.message);
}
