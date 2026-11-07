/**
 * 导入 Markdown 时的图片资源本地化（见 openspec: import-asset-localization）。
 *
 * 这里只有「找」与「改」两件纯字符串的事：不读文件、不联网、不碰 React state。
 * 上传与状态管理留在调用方（PostEditor），这样这套逻辑能脱离组件单独验证。
 */

export type LocalRef = {
  /** 完整的图片语法，如 `![alt](./images/a.png)` */
  raw: string;
  /** 括号里的原始目标，如 `./images/a.png` */
  target: string;
  /** 在原文里的起止下标（含头不含尾），供从后往前替换用 */
  start: number;
  /** `end` 指向这段图片语法的末尾（不含） */
  end: number;
};

/**
 * 图片语法：`![alt](target)` 或 `![alt](<target with space>)`。
 *
 * alt 用 `[\s\S]*?` 而非 `[^\]]*`：alt 里可能自带方括号（`![a [1]](x.png)`），
 * 靠「后面紧跟 `](`」来定界比「不能有 ]」可靠。
 */
const IMAGE_REF_RE = /!\[[\s\S]*?\]\(\s*(?:<([^>]*)>|([^)\s]+))\s*\)/g;

/**
 * 这些目标视为「不需要本地化」，直接跳过：
 * - `http(s)://` —— 已经是网络地址
 * - `data:` —— 内联数据，本身完整
 * - `#` 开头 —— 锚点
 * - `/` 开头 —— 站内绝对路径（`/img/…` 正是本地化之后的形态，必须跳过，
 *   否则改写过的正文再跑一次会被当成"新的本地引用"）
 */
function shouldSkip(target: string): boolean {
  return /^(?:https?:\/\/|data:|#|\/)/i.test(target);
}

/**
 * 路径取最后一段，作为匹配用的 key。
 *
 * 为什么只取文件名：`<input type="file" multiple>` 给的 File 只有 `name`，
 * 没有相对路径；只有拖文件夹时才有 webkitRelativePath。用文件名让两个入口共用一条路径。
 */
export function basename(target: string): string {
  const noQuery = target.split(/[?#]/)[0];
  const parts = noQuery.split(/[/\\]/);
  return parts[parts.length - 1] ?? "";
}

/** 找出正文里所有指向本地路径的图片引用，按出现顺序返回 */
export function findLocalImageRefs(markdown: string): LocalRef[] {
  const refs: LocalRef[] = [];
  // 正则是模块级的，g 标志会记住上次位置，每次调用前必须重置
  IMAGE_REF_RE.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = IMAGE_REF_RE.exec(markdown)) !== null) {
    // 尖括号形式落在 group 1，普通形式落在 group 2
    const target = match[1] ?? match[2];
    if (!target || shouldSkip(target)) continue;
    refs.push({
      raw: match[0],
      target,
      start: match.index,
      end: match.index + match[0].length,
    });
  }
  return refs;
}

export type RewriteResult = {
  content: string;
  /** 实际替换了几处 */
  replaced: number;
  /** 没能匹配、原样保留的目标（去重后按首次出现顺序） */
  unmatched: string[];
};

/**
 * 按 `文件名 → 站内地址` 的映射改写正文。
 *
 * 从后往前替换：前面替换会改变后面元素的下标，倒着来就不用重算。
 * 没匹配上的引用**原样保留**——不删除、不清空，只是记进 `unmatched` 让调用方去报告。
 */
export function rewriteRefs(
  markdown: string,
  mapping: Map<string, string>
): RewriteResult {
  const refs = findLocalImageRefs(markdown);
  if (refs.length === 0) {
    return { content: markdown, replaced: 0, unmatched: [] };
  }

  let content = markdown;
  let replaced = 0;
  const unmatched: string[] = [];
  const seen = new Set<string>();

  for (let i = refs.length - 1; i >= 0; i -= 1) {
    const ref = refs[i];
    const url = mapping.get(basename(ref.target));
    if (!url) {
      if (!seen.has(ref.target)) {
        seen.add(ref.target);
        unmatched.push(ref.target);
      }
      continue;
    }
    // 只换括号里的地址，alt 与周围正文一字不动
    const head = ref.raw.slice(0, ref.raw.indexOf("](") + 2);
    content = content.slice(0, ref.start) + `${head}${url})` + content.slice(ref.end);
    replaced += 1;
  }

  unmatched.reverse(); // 从后往前遍历收集的，翻回原顺序
  return { content, replaced, unmatched };
}

/**
 * 把一组文件按文件名建索引，供匹配用。
 *
 * 同名文件取**第一个**（D1 的取舍）：个人博客规模下比"要求用户保证唯一"更实用，
 * 但要把重名数量报上去，别让用户以为所有同名文件都被处理了。
 */
export function indexFiles(files: File[]): {
  byName: Map<string, File>;
  duplicates: string[];
} {
  const byName = new Map<string, File>();
  const duplicates: string[] = [];
  for (const file of files) {
    if (byName.has(file.name)) {
      if (!duplicates.includes(file.name)) duplicates.push(file.name);
      continue;
    }
    byName.set(file.name, file);
  }
  return { byName, duplicates };
}

/** 文档里出现了、但本次没提供文件的引用目标（用于确认条摘要） */
export function planLocalization(
  markdown: string,
  files: File[]
): {
  refs: LocalRef[];
  matched: LocalRef[];
  missing: string[];
  duplicates: string[];
} {
  const refs = findLocalImageRefs(markdown);
  const { byName, duplicates } = indexFiles(files);

  const matched: LocalRef[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const ref of refs) {
    const key = basename(ref.target);
    if (byName.has(key)) {
      matched.push(ref);
    } else if (!seen.has(ref.target)) {
      seen.add(ref.target);
      missing.push(ref.target);
    }
  }

  return { refs, matched, missing, duplicates };
}
