/**
 * 把文章正文切成检索用的块（见 openspec: add-ai-qa 的 D1）。
 *
 * 为什么按标题切而不是固定字数：文章的小标题本身就是作者给出的语义边界。
 * 按 500 字硬切会把同一个概念的上下半句分到两块里，命中一块时上下文是断的。
 *
 * 但只有按标题切还不够——单个 h2 下面可能堆了 8000 字，整块喂给模型会挤掉其它候选。
 * 所以超过 MAX 字时再按段落边界细切（不切代码块内部）。
 */

export type Chunk = {
  /** 文章内第几块，从 0 开始 */
  order: number;
  /** 所属小节标题；块首也会带上它，供模型理解上下文 */
  heading: string | null;
  text: string;
  chars: number;
};

/** 单块上限：能独立讲清一件事，又不至于稀释检索分数 */
export const MAX_CHUNK_CHARS = 800;

/** 代码块标记：``` 或 ~~~ 开头的行。块内不切，避免把代码劈成两半 */
const FENCE_RE = /^\s*(```|~~~)/;

type Section = {
  heading: string | null;
  /** 该小节下的正文行（不含标题行本身，但含代码块） */
  lines: string[];
};

/**
 * 按 h2 / h3 把正文分段。
 *
 * 只在顶层的 h2/h3 处切——h4 及更深属于段内层次，跟着所在小节一起走。
 * 代码块里的 `## xxx` 不算标题（那是代码注释），靠 fence 状态跟踪。
 */
function splitByHeadings(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let current: Section = { heading: null, lines: [] };
  let inFence = false;

  for (const line of lines) {
    if (FENCE_RE.test(line)) inFence = !inFence;

    const isHeading = !inFence && /^#{2,3}\s+/.test(line);
    if (isHeading) {
      // 收掉上一节（正文为空也保留，标题本身可能是独立论点）
      sections.push(current);
      const heading = line.replace(/^#{2,3}\s+/, "").trim();
      current = { heading, lines: [] };
      continue;
    }
    current.lines.push(line);
  }
  sections.push(current);

  // 去掉开头的空 section（正文从 h2 之前开始时会有），但把它的内容并进第一节
  return sections.filter((s) => s.lines.some((l) => l.trim() !== "") || s.heading);
}

/** 把一段正文按段落边界细切，保证每块不超过 MAX；代码块整块保留 */
function splitByParagraphs(lines: string[], max: number): string[][] {
  const out: string[][] = [];
  let buf: string[] = [];
  let bufLen = 0;
  let inFence = false;

  const flush = () => {
    if (buf.length) {
      out.push(buf);
      buf = [];
      bufLen = 0;
    }
  };

  for (const line of lines) {
    const isFenceLine = FENCE_RE.test(line);
    if (isFenceLine) inFence = !inFence;

    const lineLen = line.length + 1;

    // 代码块内部无论多长都不切（切开就不是代码了）；
    // 注意闭合围栏这一行也要走这个分支——它进来时 inFence 已经翻成 false，
    // 若按普通行处理可能先 flush，导致围栏被拆到下一块
    if (inFence || (isFenceLine && bufLen > 0)) {
      buf.push(line);
      bufLen += lineLen;
      continue;
    }

    const isBlank = line.trim() === "";
    // 空行是段落边界：此时若已超限就断开
    if (isBlank && bufLen >= max) {
      flush();
      continue;
    }

    if (bufLen + lineLen > max && bufLen > 0) {
      flush();
    }

    buf.push(line);
    bufLen += lineLen;
  }
  flush();
  return out;
}

/**
 * 把一块正文整理成最终文本：去掉首尾空行，块首拼上小节标题。
 *
 * 为什么把标题拼进去：检索是拿块文本去匹配问题的，没有标题的块在向量空间里
 * 少了最关键的语义锚点（"这一节在讲什么"）。
 */
function render(heading: string | null, lines: string[]): string {
  const body = lines.join("\n").replace(/^\n+/, "").replace(/\s+$/, "");
  if (!heading) return body;
  // 标题已经出现在正文里就不再重复（防止用户手写了同名标题）
  if (body.startsWith(heading)) return body;
  return `## ${heading}\n\n${body}`;
}

/**
 * 把一篇 Markdown 正文切成块。
 *
 * 返回的块按出现顺序编号；空块（只有标题没有正文）也会保留——那本身是"作者写了个空小节"的信息，
 * 且能让章节结构完整。
 */
export function chunkMarkdown(markdown: string, max = MAX_CHUNK_CHARS): Chunk[] {
  const sections = splitByHeadings(markdown);
  const chunks: Chunk[] = [];
  let order = 0;

  for (const section of sections) {
    const groups = splitByParagraphs(section.lines, max);
    if (groups.length === 0) {
      // 只有标题、没有正文的小节：仍然记一块，便于回答"有哪些小节"
      const text = render(section.heading, []);
      if (!text.trim()) continue;
      chunks.push({ order: order++, heading: section.heading, text, chars: text.length });
      continue;
    }
    for (const g of groups) {
      const text = render(section.heading, g);
      if (!text.trim()) continue;
      chunks.push({ order: order++, heading: section.heading, text, chars: text.length });
    }
  }

  return chunks;
}
