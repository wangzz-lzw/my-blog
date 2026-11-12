import frontMatter from "front-matter";
import { slugify } from "@/lib/slug";

/**
 * 从 Markdown 文件里解析出的字段。
 * 只做「文本进、结构出」的纯计算：不读文件、不碰 React state。
 */
export type ParsedMarkdown = {
  body: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  tags?: string[];
};

export type ImportStrategy = "replace" | "append";

/** 代码围栏：``` 或 ~~~ 开头 */
const FENCE_RE = /^\s*(```|~~~)/;

/**
 * 规整正文里的内联 HTML（见 openspec: markdown-rendering）。
 *
 * 从网页复制内容时，剪贴板常带编辑器残留的包裹标签：
 *   `<font style="color:rgb(79,79,79)">actions.js</font>`
 * 渲染层现在能安全显示 HTML，但把这类「只有样式、没有结构意义」的包裹存进数据库
 * 既占体积又让 diff 难看，而剥掉后视觉零损失。有结构价值的（表格、上下标）原样保留，
 * 交给渲染层的白名单处理。
 *
 * **代码是禁区**：fenced code block 与行内代码里的 `<class '...'>`、`<div>` 是内容，
 * 不是标签。库里真实存在 `<class 'langchain_deepseek...'>`（Python 输出样例），
 * 被误伤就是内容损毁，所以这里逐行扫描并跟踪围栏状态。
 */
export function normalizeInlineHtml(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  let inFence = false;

  for (const raw of lines) {
    if (FENCE_RE.test(raw)) {
      inFence = !inFence;
      out.push(raw);
      continue;
    }
    if (inFence) {
      out.push(raw);
      continue;
    }
    out.push(normalizeLine(raw));
  }

  return out.join("\n");
}

/** 处理单行：先保护行内代码，再剥无意义包裹，最后还原行内代码 */
function normalizeLine(line: string): string {
  // 把行内代码整段换成占位符，避免里面的标签被处理
  const codes: string[] = [];
  const masked = line.replace(/`[^`\n]*`/g, (m) => {
    codes.push(m);
    return `\u0000CODE${codes.length - 1}\u0000`;
  });

  let s = masked;

  // 只有样式、没有其他属性的包裹标签：剥壳留文字
  // <font ...>x</font>、<span style="...">x</span>
  s = s.replace(
    /<(font|span)\b[^>]*style\s*=\s*["'][^"']*["'][^>]*>([\s\S]*?)<\/\1>/gi,
    "$2"
  );
  // 无属性的 <font>x</font>
  s = s.replace(/<font\b[^>]*>([\s\S]*?)<\/font>/gi, "$1");
  // <br> / <br/> 转成换行（Markdown 里用两空格 + 换行保留硬换行）
  s = s.replace(/<br\s*\/?>/gi, "  \n");

  // 还原行内代码
  return s.replace(/\u0000CODE(\d+)\u0000/g, (_, i) => codes[Number(i)] ?? "");
}

export type ImportTarget = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  tags: string;
};

const EXCERPT_KEYS = ["excerpt", "description", "summary"];
const TAG_KEYS = ["tags", "tag"];

/**
 * frontmatter 必须由「第一个非空行就是 ---」开始，并且有闭合分隔行。
 * 没有闭合分隔（或正文里的 ---）都不算 frontmatter。
 */
const FRONTMATTER_RE = /^(?:[ \t]*\n)*---[ \t]*\n([\s\S]*?)\n(?:---|\.\.\.)[ \t]*(?:\n|$)/;

/**
 * front-matter 只认 `---` 闭合，但 YAML 规范允许用 `...` 结束文档。
 * 这里只把「匹配到的那一段」末尾的 `...` 换成 `---`，其余原样。
 */
function toFrontMatterDialect(text: string, match: RegExpMatchArray): string {
  const block = match[0];
  const head = block.replace(/(\.\.\.)[ \t]*(\n|$)$/, "---$2");
  return head + text.slice(block.length);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

/** tags 既可能是数组，也可能是逗号分隔的字符串 */
function asTags(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    const list = value
      .map((item) => asString(item))
      .filter((item): item is string => Boolean(item));
    return list.length ? list : undefined;
  }
  const text = asString(value);
  if (!text) return undefined;
  const list = text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

/**
 * 解析一份 Markdown 文件：
 * 1. 去 BOM、CRLF → LF
 * 2. 用 front-matter（浏览器安全，不依赖 fs）解析 frontmatter；YAML 写坏时只丢元信息，正文照常导入
 * 3. 没有 frontmatter 标题时，第一个非空行的 `# 标题` 作为标题并从正文移除
 * 4. 正文去掉首尾多余空行，保留内部空行与缩进
 *
 * 返回 `null` 表示这份文件没有可以导入的内容。
 */
export function parseMarkdownDocument(raw: string): ParsedMarkdown | null {
  const text = raw.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

  const fmMatch = text.match(FRONTMATTER_RE);
  let data: Record<string, unknown> = {};
  let body = text;

  if (fmMatch) {
    try {
      const parsed = frontMatter<Record<string, unknown>>(
        toFrontMatterDialect(text, fmMatch)
      );
      data = parsed.attributes ?? {};
      body = parsed.body;
    } catch {
      // YAML 语法错误：元信息丢掉，正文用正则切出来的部分，导入不中断
      body = text.slice(fmMatch[0].length);
    }
  }

  let title = asString(data.title);

  if (!title) {
    const lines = body.split("\n");
    const idx = lines.findIndex((line) => line.trim() !== "");
    const h1 = idx >= 0 ? lines[idx].match(/^#[ \t]+(.+?)[ \t]*$/) : null;
    if (h1) {
      title = h1[1].trim();
      body = lines.slice(idx + 1).join("\n");
    }
  }

  // 规整内联 HTML：剥掉复制带来的无意义包裹，代码块与行内代码不动
  body = normalizeInlineHtml(body);
  body = body.replace(/^\n+/, "").replace(/\s+$/, "");

  if (!body.trim() && !title) return null;

  const excerpt = EXCERPT_KEYS.map((key) => asString(data[key])).find(Boolean);
  const tags = TAG_KEYS.map((key) => asTags(data[key])).find(Boolean);

  return {
    body,
    title,
    slug: asString(data.slug),
    excerpt,
    tags,
  };
}

/**
 * 把解析结果合并进编辑器现有字段。
 *
 * - 替换：正文覆盖；标题 / slug / 摘要 / 标签「文件提供了才覆盖」
 * - 追加：只在正文末尾追加（空行分隔）；元信息只回填原本为空的字段
 * - slug 例外：文件没给 slug 且有标题时，新建文章自动生成，编辑已有文章不动
 */
export function mergeImport(
  target: ImportTarget,
  parsed: ParsedMarkdown,
  strategy: ImportStrategy,
  opts: { isEdit: boolean }
): ImportTarget {
  const fillOnlyEmpty = strategy === "append";

  const meta = (current: string, from?: string): string => {
    if (!from) return current;
    return fillOnlyEmpty ? (current.trim() ? current : from) : from;
  };

  const title = meta(target.title, parsed.title);
  const excerpt = meta(target.excerpt, parsed.excerpt);
  const tags = meta(
    target.tags,
    parsed.tags && parsed.tags.length ? parsed.tags.join(", ") : undefined
  );

  const content =
    strategy === "append"
      ? (target.content.trim()
          ? target.content.replace(/\s+$/, "") + "\n\n"
          : "") + parsed.body
      : parsed.body;

  let slug = target.slug;
  const fmSlug = parsed.slug?.trim();
  if (fmSlug) {
    slug = fillOnlyEmpty
      ? target.slug.trim()
        ? target.slug
        : fmSlug
      : fmSlug;
  } else if (!target.slug.trim() && !opts.isEdit && title.trim()) {
    slug = slugify(title);
  }

  return { title, slug, excerpt, content, tags };
}