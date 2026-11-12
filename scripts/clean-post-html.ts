/**
 * 清洗已存文章里的内联 HTML（见 openspec: markdown-rendering）。
 *
 * 跑法：
 *   npx tsx --env-file=.env scripts/clean-post-html.ts            # 只报告，不写库
 *   npx tsx --env-file=.env scripts/clean-post-html.ts --write    # 确认后写回
 *
 * 为什么默认不写：清洗改的是内容资产，不可逆。先看差异再决定是唯一稳妥的顺序。
 *
 * 复用的是导入链路的同一套规整逻辑（normalizeInlineHtml），保证「导入时的处理」
 * 与「事后清洗」行为一致——两边用不同规则是最容易出问题的地方。
 */
import { prisma } from "../lib/prisma";
import { normalizeInlineHtml } from "../lib/markdown-import";

const WRITE = process.argv.includes("--write");

type Report = {
  id: string;
  title: string;
  slug: string;
  published: boolean;
  before: number;
  after: number;
  changed: boolean;
  tagKinds: string[];
  tagCount: number;
  samples: { before: string; after: string }[];
};

/**
 * 统计正文里「不在代码块内」的 HTML 标签。
 *
 * 必须跳过代码块：库里真实存在 `<class 'langchain_deepseek...'>`（Python 输出样例），
 * 那是内容不是标签，报成"待清洗"会误导判断。
 */
function scanTags(content: string): { kinds: string[]; count: number } {
  const kinds = new Set<string>();
  let count = 0;
  let inFence = false;

  for (const line of content.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    // 行内代码先摘掉
    const stripped = line.replace(/`[^`\n]*`/g, "");
    const matches = stripped.match(/<\/?[a-zA-Z][a-zA-Z0-9]*(\s[^>]*)?>/g) ?? [];
    for (const m of matches) {
      const name = m.replace(/^<\/?/, "").replace(/[\s>/].*$/, "").toLowerCase();
      // 只关心「会带来视觉或安全问题」的标签，Markdown 自身产出的不在此列
      kinds.add(name);
      count += 1;
    }
  }
  return { kinds: [...kinds], count };
}

/** 找出前 N 处会被改动的上下文，供人工判断 */
function diffSamples(content: string, limit = 3): { before: string; after: string }[] {
  const out: { before: string; after: string }[] = [];
  const lines = content.split("\n");
  let inFence = false;

  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;

    const after = normalizeInlineHtml(line);
    if (after !== line) {
      out.push({
        before: line.slice(0, 160),
        after: after.slice(0, 160),
      });
      if (out.length >= limit) break;
    }
  }
  return out;
}

async function main() {
  const posts = await prisma.post.findMany({
    select: { id: true, title: true, slug: true, content: true, published: true },
    orderBy: { createdAt: "asc" },
  });

  console.log(`模式: ${WRITE ? "写回 (--write)" : "dry-run（不写库）"}`);
  console.log(`共 ${posts.length} 篇\n`);

  const reports: Report[] = [];

  for (const p of posts) {
    const normalized = normalizeInlineHtml(p.content);
    const { kinds, count } = scanTags(p.content);
    const changed = normalized !== p.content;

    reports.push({
      id: p.id,
      title: p.title,
      slug: p.slug,
      published: p.published,
      before: p.content.length,
      after: normalized.length,
      changed,
      tagKinds: kinds,
      tagCount: count,
      samples: changed ? diffSamples(p.content) : [],
    });
  }

  for (const r of reports) {
    const status = r.changed ? "需清洗" : "无需改动";
    console.log(`《${r.title}》 ${r.published ? "[已发布]" : "[草稿]"}  — ${status}`);
    console.log(`  长度 ${r.before} → ${r.after}  (${r.after - r.before >= 0 ? "+" : ""}${r.after - r.before})`);
    console.log(`  正文内 HTML 标签: ${r.tagCount} 处  ${r.tagKinds.length ? "[" + r.tagKinds.join(", ") + "]" : "无"}`);
    for (const s of r.samples) {
      console.log(`    - 前: ${s.before}`);
      console.log(`      后: ${s.after}`);
    }
    console.log();
  }

  const toChange = reports.filter((r) => r.changed);
  console.log(`=== 汇总 ===`);
  console.log(`受影响文章: ${toChange.length} / ${reports.length}`);

  if (toChange.length === 0) {
    console.log("没有需要清洗的内容。");
    return;
  }

  if (!WRITE) {
    console.log("\n这是 dry-run，数据库未改动。确认差异合理后加 --write 写回：");
    console.log("  npx tsx --env-file=.env scripts/clean-post-html.ts --write");
    return;
  }

  console.log("\n开始写回…");
  let updated = 0;
  for (const r of toChange) {
    const original = posts.find((p) => p.id === r.id)!;
    await prisma.post.update({
      where: { id: r.id },
      data: { content: normalizeInlineHtml(original.content) },
    });
    updated += 1;
    console.log(`  ✓ ${r.title}`);
  }
  console.log(`\n已更新 ${updated} 篇。`);
}

main()
  .catch((e) => {
    console.error("清洗失败：", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
