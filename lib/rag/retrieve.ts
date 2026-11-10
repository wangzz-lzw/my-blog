/**
 * 站内问答的检索层（见 openspec: add-ai-qa 的 D2 / D3）。
 *
 * 两套实现共用一个接口：
 *   - FulltextRetriever：全文检索，本地基线，零安装
 *   - VectorRetriever：向量检索，需要 pgvector + embedding 接口，生产用
 *
 * 选哪一套由 `detectRetriever()` 在运行时探测决定，不靠配置开关——
 * 开关会撒谎（配了 vector 但扩展没装，就变成启动即崩），探测让"可用性"成为事实。
 */
import { prisma } from "@/lib/prisma";

export type RetrievedChunk = {
  id: string;
  postId: string;
  slug: string;
  postTitle: string;
  heading: string | null;
  text: string;
  order: number;
  /** 归一化到 [0,1]，越大越相关 */
  score: number;
};

export interface Retriever {
  retrieve(question: string, k: number): Promise<RetrievedChunk[]>;
  readonly mode: "vector" | "fulltext";
}

/** 召回条数：6 块 × 约 800 字 ≈ 4800 字，留足空间给 prompt 与回答 */
export const TOP_K = 6;

/**
 * 拒答阈值：候选最高分低于它就不调用模型。
 *
 * **标定结果（2026-11-10，72 个真实块，应用层关键词打分）**：
 *   站外 7 个无关问题：最高 0.216（"今天北京的天气"），其余 0~0.097
 *   站内 7 个能答的问题：5 个落在 0.52~0.71；2 个掉到 0.19 / 0.14
 *
 * 取 **0.30**：站外全拒，站内 5/7 能答。掉下来的两个（"本地图片怎么处理"、
 * "LangChain 有哪些核心组件"）是字面检索的固有局限——问法与原文用词差得远就召不回来。
 * 这不是 bug，向量模式正是为解决它而存在的。
 *
 * 取舍原则：**宁可少答，不可乱答**。用户被拒一次会换个问法；读到一段编造的答案会不再信任。
 * 换成向量检索（生产环境）后需要按向量分数的分布重新标定。
 */
export const MIN_SCORE_FULLTEXT = 0.3;
export const MIN_SCORE_VECTOR = 0.35;

/* ============================================================
 * 全文检索（基线）
 * ============================================================ */

/**
 * 从问题里抽关键词。
 *
 * 为什么要在应用层做：PG 的 `simple` 分词器没有中文词典，整句会被当成一个 token；
 * 而 `word_similarity` 只看"查询词有没有出现"，在长块上会饱和——
 * 实测同一问题召回的 6 个块分数完全相同（都是 0.536），等于没有排序。
 * 所以自己抽词、自己算分，排序才靠得住。
 *
 * 中文怎么切：不按固定 2 字滑窗（那会切出「天北」「京的」「气怎」这类跨词边界的垃圾，
 * 实测把「今天北京的天气」判成了高相关）。这里的做法是：
 *   1. 英文/数字标识符整词保留；
 *   2. 中文先按停用词与标点切成"片段"，片段本身就是一个近似的词；
 *   3. 过长的片段再按 2-3 字切成实词块，但只在片段内部切，不跨标点。
 */
const STOP_WORDS = new Set([
  "的", "和", "与", "是", "有", "在", "了", "就", "也", "都", "而", "及", "或",
  "什么", "怎么", "如何", "为什么", "哪些", "哪个", "怎样", "多少",
  "区别", "不同", "一样", "分别", "意思", "含义", "解释", "介绍",
  "请问", "一个", "这个", "那个", "这些", "那些", "可以", "应该", "需要",
  "吗", "呢", "吧", "啊", "呀", "能", "会", "要", "用",
]);

/** 中文虚词/单字：切片段时当作分隔符，避免它们把实词粘在一起 */
const CJK_SPLIT =
  /[的了和与是有在就也都而及或吗呢吧啊呀能会要用么样怎谁这那哪很太更最不没无如何为什把被从对给让向使]+/;

export function extractKeywords(question: string): string[] {
  const out: string[] = [];

  // 先整体按标点与空白切开
  const segments = question
    .split(/[\s，。？！、；：""''（）()【】\[\]{}<>|/\\+=*&^%$#@!~`,.'"]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  for (const seg of segments) {
    // 英文/数字标识符：整词保留（LangChain、Agent、v3 都有意义）
    const latin = seg.match(/[A-Za-z][A-Za-z0-9_.-]*/g);
    if (latin) {
      for (const l of latin) if (l.length >= 2) out.push(l);
    }

    // 中文部分：去掉虚词后切片段
    const noLatin = seg.replace(/[A-Za-z][A-Za-z0-9_.-]*/g, " ");
    const parts = noLatin
      .split(CJK_SPLIT)
      .map((p) => p.trim())
      .filter((p) => /[\u4e00-\u9fff]/.test(p));

    for (const p of parts) {
      if (STOP_WORDS.has(p)) continue;
      if (p.length <= 4) {
        // 短片段直接当词（"北京"、"天气"、"初始化"）
        out.push(p);
        continue;
      }
      // 长片段（"怎么初始化模型"里的"初始化模型"）：按 2-3 字切成实词块
      for (let i = 0; i + 2 <= p.length; i += 2) {
        const piece = p.slice(i, Math.min(i + 3, p.length));
        if (piece.length >= 2 && !STOP_WORDS.has(piece)) out.push(piece);
      }
    }
  }

  return [...new Set(out)].filter((k) => k.length >= 2);
}

export type ScoredChunk = RetrievedChunk;

/**
 * 应用层打分：关键词覆盖率为主、出现密度为辅。
 *
 * - 覆盖率：命中几个关键词 / 共几个 —— 决定"这一块是不是在讲这件事"
 * - 密度：命中词的累计出现次数（对数压缩）—— 决定"讲得有多集中"，
 *   用 log 是为了避免长块靠堆词占优
 *
 * 为什么覆盖率是乘在"命中数开方"上而不是直接用比例：
 * 2 字滑窗会切出「今天」这种碰巧出现在正文里的碎片。如果只看比例，
 * 问「今天北京的天气」时「今天」命中一次就能拿高分（实测 0.654，比站内问题还高）。
 * 用命中数的平方根做系数，要求"命中多个词才算真相关"，单碎片命中的分数会被压低。
 */
export function scoreChunk(text: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;

  let hit = 0;
  let density = 0;
  for (const k of keywords) {
    const n = text.split(k).length - 1;
    if (n > 0) {
      hit += 1;
      density += 1 + Math.log(n);
    }
  }
  if (hit === 0) return 0;

  const coverage = hit / keywords.length;
  const densityScore = Math.min(density / 20, 1);
  // 命中数的平方根做阻尼：1 个词命中只有 1，4 个词命中到 2
  const breadth = Math.min(Math.sqrt(hit) / 2, 1);

  return coverage * breadth * 0.7 + densityScore * breadth * 0.3;
}

export class FulltextRetriever implements Retriever {
  readonly mode = "fulltext" as const;

  async retrieve(question: string, k = TOP_K): Promise<RetrievedChunk[]> {
    const keywords = extractKeywords(question);
    if (keywords.length === 0) return [];

    // 先用 SQL 粗筛（任一词出现在 text 里），把候选压到几十条，
    // 再在应用层精确打分排序——语料规模下这一步完全够快。
    const or = keywords.map((kw) => ({ text: { contains: kw } }));
    const candidates = await prisma.docChunk.findMany({
      where: { OR: or },
      select: {
        id: true,
        postId: true,
        slug: true,
        postTitle: true,
        heading: true,
        text: true,
        order: true,
      },
      take: 200,
    });

    const scored = candidates
      .map((c) => ({ ...c, score: scoreChunk(c.text, keywords) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);

    return scored.map((c) => ({ ...c, score: Math.max(0, Math.min(1, c.score)) }));
  }
}

/* ============================================================
 * 向量检索（可选）
 * ============================================================ */

export class EmbeddingNotConfigured extends Error {
  constructor() {
    super("Embedding 未配置：请在 .env 填写 EMBEDDING_API_KEY / EMBEDDING_BASE_URL / EMBEDDING_MODEL");
  }
}

export function isEmbeddingConfigured(): boolean {
  return Boolean(
    process.env.EMBEDDING_API_KEY?.trim() &&
      process.env.EMBEDDING_BASE_URL?.trim() &&
      process.env.EMBEDDING_MODEL?.trim()
  );
}

/** 拿一段文本的向量。相同文本返回一致结果（实测验证过），回填与查询可以共用 */
export async function embedText(text: string): Promise<number[]> {
  const key = process.env.EMBEDDING_API_KEY?.trim();
  const base = process.env.EMBEDDING_BASE_URL?.trim();
  const model = process.env.EMBEDDING_MODEL?.trim();
  if (!key || !base || !model) throw new EmbeddingNotConfigured();

  const res = await fetch(`${base.replace(/\/+$/, "")}/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, input: text }),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`Embedding 服务返回 ${res.status}${detail ? "：" + detail : ""}`);
  }

  const data = (await res.json()) as { data?: { embedding?: number[] }[] };
  const vec = data.data?.[0]?.embedding;
  if (!Array.isArray(vec) || vec.length === 0) throw new Error("Embedding 返回了空向量");
  return vec;
}

/**
 * 用 `<=>`（余弦距离）排序。
 *
 * 传向量时用字符串形式的 `[0.1,0.2,...]`，让 pgvector 自己解析——
 * Prisma 不认 vector 类型，走不了参数化绑定。
 */
const VECTOR_SQL = `
  SELECT id, "postId", slug, "postTitle", heading, text, "order",
         1 - (embedding <=> $1::vector) AS score
  FROM "DocChunk"
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> $1::vector
  LIMIT $2
`;

export class VectorRetriever implements Retriever {
  readonly mode = "vector" as const;

  async retrieve(question: string, k = TOP_K): Promise<RetrievedChunk[]> {
    const vec = await embedText(question);
    const literal = `[${vec.join(",")}]`;
    const rows = await prisma.$queryRawUnsafe<
      {
        id: string;
        postId: string;
        slug: string;
        postTitle: string;
        heading: string | null;
        text: string;
        order: number;
        score: number;
      }[]
    >(VECTOR_SQL, literal, k);

    return rows.map((r) => ({ ...r, score: Math.max(0, Math.min(1, Number(r.score) || 0)) }));
  }
}

/* ============================================================
 * 运行时探测
 * ============================================================ */

type Detection = { mode: "vector" | "fulltext"; reason: string };

let cached: Detection | null = null;

async function hasVectorExtension(): Promise<boolean> {
  try {
    const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') AS ok`;
    return Boolean(rows[0]?.ok);
  } catch {
    return false;
  }
}

async function hasEmbeddingRows(): Promise<boolean> {
  try {
    // embedding 列可能压根不存在（本地没有 pgvector），这个查询失败就说明没向量
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`
      SELECT count(*)::bigint AS n FROM "DocChunk" WHERE embedding IS NOT NULL`;
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/**
 * 探测该用哪种检索。三条同时满足才走向量：
 *   1. pgvector 扩展已装
 *   2. EMBEDDING_* 三项齐全
 *   3. 表里已有非空 embedding 行（否则向量检索会返回空）
 *
 * 结果进程级缓存：探测要查库，不该每个请求都做一遍。
 */
export async function detectRetriever(): Promise<Detection> {
  if (cached) return cached;

  if (!isEmbeddingConfigured()) {
    cached = { mode: "fulltext", reason: "未配置 EMBEDDING_*" };
    return cached;
  }
  if (!(await hasVectorExtension())) {
    cached = { mode: "fulltext", reason: "数据库未安装 pgvector 扩展" };
    return cached;
  }
  if (!(await hasEmbeddingRows())) {
    cached = { mode: "fulltext", reason: "DocChunk 里还没有向量（需先跑 embedding 回填）" };
    return cached;
  }
  cached = { mode: "vector", reason: "三项条件均满足" };
  return cached;
}

/** 清掉缓存（回填完向量后不想重启进程时用） */
export function resetRetrieverCache() {
  cached = null;
}

export async function getRetriever(): Promise<Retriever> {
  const d = await detectRetriever();
  return d.mode === "vector" ? new VectorRetriever() : new FulltextRetriever();
}

export function minScoreFor(mode: "vector" | "fulltext"): number {
  return mode === "vector" ? MIN_SCORE_VECTOR : MIN_SCORE_FULLTEXT;
}

/* ============================================================
 * 「我能回答什么」
 * ============================================================ */

export type Topic = { title: string; slug: string; tags: string[] };

/**
 * 拒答时展示的可答话题：从已发布文章的标题与标签生成。
 *
 * 为什么不让模型编：它是拒答场景，用户已经被拒绝一次了，
 * 再给一段模型自由发挥的"我能回答"会二次消耗信任。用真实数据。
 */
export async function listTopics(limit = 8): Promise<Topic[]> {
  const posts = await prisma.post.findMany({
    where: { published: true },
    orderBy: { publishedAt: "desc" },
    take: limit,
    select: { title: true, slug: true, tags: { select: { name: true } } },
  });
  return posts.map((p) => ({
    title: p.title,
    slug: p.slug,
    tags: p.tags.map((t) => t.name),
  }));
}
