import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import { CodeBlock } from "@/components/CodeBlock";
import { toSiteImageUrl } from "@/lib/image-url";

/**
 * 统一 Markdown 渲染管线（SSR 安全，文章页与后台预览共用）：
 * - remark：gfm（表格/删除线/任务列表）+ breaks（单换行）
 * - rehype：slug（标题锚点）→ autolink-headings（悬停 #）→ external-links（新标签页）
 *   → highlight（代码高亮，ignoreMissing：无语言/未知语言静默跳过）
 *   → source-line（块级元素标源码起始行，供后台分屏联动用）
 *   → raw（把正文里的内联 HTML 解析成节点）→ sanitize（过滤危险节点）
 * - 组件映射：pre → 终端风代码卡（复制按钮）；a → 外链视觉标记
 *
 * 为什么需要 raw：从网页复制内容粘进 Markdown 时，剪贴板常带内联 HTML，
 * 典型如 `<font style="color:rgb(79,79,79)">actions.js</font>`。
 * react-markdown 默认把原始 HTML 当文本转义，读者会看到尖括号和 style 属性。
 *
 * 为什么 raw 必须配 sanitize：raw 会把 HTML 真的送进 DOM，`<script>`、`onerror=`
 * 这类内容就能在读者浏览器执行。文章正文虽然只有管理员能写，但误粘贴与账号被盗
 * 都仍然成立，所以这两件事是一个决定，不能只装 raw。
 *
 * 两者顺序不能反：sanitize 必须在 raw 之后，否则它看不到 HTML 节点，等于没过滤。
 */

/**
 * 内联 HTML 的白名单。
 *
 * 裁剪原则是「按展示需要」，不是「按 HTML 规范完整」：
 * - 保留 `className`：rehype-highlight 给 code 加 `hljs language-xxx`，
 *   autolink-headings 给锚点加 `heading-anchor`，组件映射靠 `language-*` 判断语言。
 *   拦住 class 会让代码高亮、标题锚点、语言标签一起失效。
 * - 丢掉 `style`：`<font style="...">` 这类「样式包裹但文字有用」的内容，
 *   去掉 style 后退化成普通文字，正是想要的结果。
 * - 丢掉所有 `on*`：defaultSchema 本来就不含，这里显式说明是刻意的。
 * - 去掉 `input`：defaultSchema 允许它，但文章正文不需要表单控件。
 */
const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []).filter((t) => t !== "input"),
    // 复制粘贴常见但 defaultSchema 未收录的展示性标签
    "font",
    "mark",
    "figure",
    "figcaption",
    "center",
  ],
  attributes: {
    ...defaultSchema.attributes,
    // 全局放行 class：高亮、锚点、CodeBlock 都依赖它。
    // 用字符串 "className" 而不是 ["className", {}]：后者是「带校验的元组」写法，
    // 实测会把 hljs 这类多值 class 过滤掉一部分（defaultSchema 对 code 就是这种写法，
    // 结果只剩 language-*，hljs 丢了）。字符串写法放行全部值。
    "*": [...(defaultSchema.attributes?.["*"] ?? []), "className"],
    code: ["className"],
    pre: ["className"],
    span: ["className"],
    div: ["className"],
    table: ["className"],
    thead: ["className"],
    tbody: ["className"],
    tr: ["className"],
    th: ["className"],
    td: ["className"],
    h1: ["className"],
    h2: ["className"],
    h3: ["className"],
    h4: ["className"],
    h5: ["className"],
    h6: ["className"],
    // 注意：这里必须**整体覆盖** a 的属性规则，不能 `...defaultSchema.attributes.a`
    // 再追加 "className" —— defaultSchema 里有一条 ["className", "data-footnote-backref"]，
    // 它把 className 限制成「只能是 data-footnote-backref 这个值」；只要这条还在，
    // 无论怎么追加都解不开限制，autolink-headings 加的 heading-anchor 会被剥光（实测）。
    a: ["className", "href"],
    img: [...(defaultSchema.attributes?.img ?? []), "className"],
    font: ["color", "size", "face"],
  },
  // 协议白名单：不含 javascript: / data:（defaultSchema 本就不含，这里显式收窄）
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
    src: ["http", "https"],
  },
};
type HastNode = {
  tagName?: string;
  type?: string;
  position?: { start?: { line?: number } };
  properties?: Record<string, unknown> & { className?: unknown };
  children?: HastNode[];
};

/**
 * 给块级元素标上它在 Markdown 源码里的起始行号（`data-src`）。
 *
 * 用途只有一个：后台分屏写作时，让「左侧源码的某一行」和「右侧渲染出来的某个块」
 * 之间有真正的对应关系。按滚动比例联动在长文里必然漂移（一段 5 行源码可能渲染成
 * 50px，也可能 400px），行号是两边唯一稳定的共同坐标。
 *
 * 只标块级：行内元素数量是块级的十几倍，写进去只会让 HTML 膨胀，对定位毫无用处。
 * 属性会同时出现在前台文章页（同一管线），每块约 14 字节，不含任何内容信息。
 */
const BLOCK_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "pre",
  "ul",
  "ol",
  "blockquote",
  "table",
  "hr",
  "figure",
]);

function rehypeSourceLine() {
  // 手写递归而不是引 unist-util-visit：后者只是传递依赖，
  // 直接 import 会变成幽灵依赖，装依赖时有炸掉的可能。
  const walk = (node: HastNode) => {
    const children = node.children;
    if (!Array.isArray(children)) return;
    for (const child of children) {
      if (child.type === "element" && child.tagName && BLOCK_TAGS.has(child.tagName)) {
        const line = child.position?.start?.line;
        if (typeof line === "number" && line > 0) {
          child.properties = { ...(child.properties ?? {}), "data-src": String(line) };
        }
      }
      // 继续深入：列表项的段落、引用里的块、表格里的行都属于块级嵌套
      walk(child);
    }
  };
  return (tree: HastNode) => walk(tree);
}

/** 从 pre 的 hast 节点里取出 <code class="hljs language-xxx"> 的语言 */
function codeLanguage(node: unknown): string | undefined {
  const pre = node as HastNode | undefined;
  const code = pre?.children?.find((c) => c?.tagName === "code");
  const raw = code?.properties?.className;
  const classes = Array.isArray(raw) ? raw.map(String) : [];
  const hit = classes.find((c) => c.startsWith("language-"));
  return hit ? hit.slice("language-".length) : undefined;
}

const components: Components = {
  // 语言在服务端就解析好并作为 prop 传入：客户端不再读 children.props，
  // 否则 SSR 显示 ts、hydration 后显示 text，导致不一致。
  // data-src 是 rehypeSourceLine 标的源码行号，必须显式透传——这个映射渲染的是
  // CodeBlock 自己的 div，不转发的话 pre 那一层就丢了行号，分屏联动会跳过所有代码块。
  pre: ({ node, children, ...props }) => (
    <CodeBlock
      language={codeLanguage(node)}
      sourceLine={(props as { "data-src"?: string })["data-src"]}
    >
      {children}
    </CodeBlock>
  ),
  // 图片：地址统一收口到站内 /img（历史 OSS 直链也在这里改写），懒加载 + 异步解码
  img: ({ node, src, ...props }) => (
    // eslint-disable-next-line jsx-a11y/alt-text
    <img
      {...props}
      src={toSiteImageUrl(typeof src === "string" ? src : undefined)}
      loading="lazy"
      decoding="async"
    />
  ),
  // 必须把 node 从 props 里摘掉：否则会作为 node="[object Object]" 落到 DOM；
  // className 也要保留（标题锚点 .heading-anchor 靠它），只追加外链标记。
  a: ({ node, children, className, ...props }) => {
    const href = props.href;
    const isExternal = typeof href === "string" && /^https?:\/\//.test(href);
    const cls =
      [className, isExternal ? "link-external" : ""].filter(Boolean).join(" ") ||
      undefined;
    return (
      <a
        {...props}
        className={cls}
        target={isExternal ? "_blank" : undefined}
        rel={isExternal ? "noopener noreferrer" : undefined}
      >
        {children}
        {isExternal && (
          <span className="ext-icon" aria-hidden="true">
            ↗
          </span>
        )}
      </a>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      // 注意：unified 的 use() 把数组条目当「attacher」再调用一次——
      // 必须传「插件函数 + options」，不能传已实例化的插件（实例会被
      // 无参调用，transformer 收到 undefined tree 直接 500）
      rehypePlugins={[
        // 【顺序很重要】内联 HTML 必须尽早解析成节点，且必须在 highlight 之前：
        // rehype-highlight 会把代码切成大量 <span class="hljs-*">，之后 rehype-raw
        // 再想把这些 hast 节点序列化回 HTML 重新解析会直接报
        // "Cannot compile `code` node"，class 全丢、代码块塌掉（实测踩到）。
        rehypeRaw,
        rehypeSlug,
        [
          rehypeAutolinkHeadings,
          {
            // v7：content 必须是 hast Element（非字符串）；properties 用 className
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
        [
          rehypeExternalLinks,
          { target: "_blank", rel: ["noopener", "noreferrer"] },
        ],
        rehypeHighlight,
        // 放在最后：等 highlight 把 pre>code 改造完再标行号，位置才对应真实块
        rehypeSourceLine,
        // 安全过滤必须在所有会产出 HTML 的插件之后
        [rehypeSanitize, sanitizeSchema],
      ]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
