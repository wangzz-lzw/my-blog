import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSlug from "rehype-slug";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeExternalLinks from "rehype-external-links";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "@/components/CodeBlock";

/**
 * 统一 Markdown 渲染管线（SSR 安全，文章页与后台预览共用）：
 * - remark：gfm（表格/删除线/任务列表）+ breaks（单换行）
 * - rehype：slug（标题锚点）→ autolink-headings（悬停 #）→ external-links（新标签页）
 *   → highlight（代码高亮，ignoreMissing：无语言/未知语言静默跳过）
 * - 组件映射：pre → 终端风代码卡（复制按钮）；a → 外链视觉标记
 */
type HastNode = {
  tagName?: string;
  properties?: { className?: unknown };
  children?: HastNode[];
};

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
  // 否则 SSR 显示 ts、hydration 后显示 text，导致不一致
  pre: ({ node, children }) => (
    <CodeBlock language={codeLanguage(node)}>{children}</CodeBlock>
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
      ]}
      components={components}
    >
      {children}
    </ReactMarkdown>
  );
}
