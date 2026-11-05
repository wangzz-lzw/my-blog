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