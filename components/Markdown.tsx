import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "@/components/CodeBlock";
import { toSiteImageUrl } from "@/lib/image-url";

/**
 * 统一 Markdown 渲染管线（SSR 安全，文章页与后台预览共用）：
 * - remark：gfm（表格/删除线/任务列表）+ breaks（单换行）
 * - rehype：slug（标题锚点）→ autolink-headings（悬停 #）→ external-links（新标签页）
 *   → highlight（代码高亮，ignoreMissing：无语言/未知语言静默跳过）
 *   → source-line（块级元素标源码起始行，供后台分屏联动用）
 * - 组件映射：pre → 终端风代码卡（复制按钮）；a → 外链视觉标记
 */
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
      ]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
