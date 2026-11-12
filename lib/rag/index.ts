/**
 * 检索索引（`DocChunk`）的维护逻辑（见 openspec: rag-indexing）。
 *
 * 三条路径共用这里的实现：启动回填、CLI 脚本、文章增删改的接口。
 * 各写一遍必然会在「删旧块」「更新 slug/标题」这些细节上分叉，
 * 最后表现成「某个入口存的文章检索不到」——所以只有一份。
 */
import { prisma } from "@/lib/prisma";
import { chunkMarkdown } from "@/lib/rag/chunk";

export type ReindexResult = {
  postId: string;
  chunks: number;
  created: number;
  updated: number;
  removed: number;
};

/**
 * 重建单篇文章的索引。
 *
 * 语义：让 DocChunk 里这篇文章的块**完全等于**当前正文切出来的块。
 * - 按 `[postId, order]` upsert：重复调用幂等
 * - 正文变短时多出来的旧块必须删除，否则检索会命中已删掉的内容
 *
 * 返回统计便于调用方打日志/报告。
 */
export async function reindexPost(postId: string): Promise<ReindexResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: { id: true, slug: true, title: true, content: true, published: true },
  });

  if (!post) throw new Error(`文章不存在：${postId}`);

  // 草稿不进索引：留着会让未发布内容被问答引用，那是内容泄露
  if (!post.published) {
    const removed = await removePostIndex(postId);
    return { postId, chunks: 0, created: 0, updated: 0, removed };
  }

  const chunks = chunkMarkdown(post.content);

  const existing = await prisma.docChunk.findMany({
    where: { postId },
    select: { id: true, order: true },
  });
  const existingOrders = new Set(existing.map((e) => e.order));

  let created = 0;
  let updated = 0;

  for (const chunk of chunks) {
    await prisma.docChunk.upsert({
      where: { postId_order: { postId, order: chunk.order } },
      create: {
        postId,
        slug: post.slug,
        postTitle: post.title,
        order: chunk.order,
        heading: chunk.heading,
        text: chunk.text,
        chars: chunk.chars,
      },
      update: {
        slug: post.slug,
        postTitle: post.title,
        heading: chunk.heading,
        text: chunk.text,
        chars: chunk.chars,
      },
    });
    if (existingOrders.has(chunk.order)) updated += 1;
    else created += 1;
  }

  // 正文变短后多出来的旧块
  const stale = existing.filter((e) => e.order >= chunks.length);
  let removed = 0;
  if (stale.length > 0) {
    const r = await prisma.docChunk.deleteMany({
      where: { id: { in: stale.map((s) => s.id) } },
    });
    removed = r.count;
  }

  return { postId, chunks: chunks.length, created, updated, removed };
}

/** 清掉一篇文章的全部索引块。文章删除或转为草稿时用。 */
export async function removePostIndex(postId: string): Promise<number> {
  const r = await prisma.docChunk.deleteMany({ where: { postId } });
  return r.count;
}

/**
 * 写接口用的安全包装：索引更新失败**不抛出**，只记日志。
 *
 * 为什么吞掉：作者刚写完的正文丢掉的代价，远大于索引暂时旧一点。索引可以重建，正文不能。
 * 为什么必须打日志：静默失败的索引会让「问答答不出」变成一个只能靠猜的问题
 * （见 openspec: rag-indexing 的「索引失败不得静默」）。
 */
export async function syncPostIndexSafe(
  postId: string,
  opts: { published: boolean }
): Promise<void> {
  try {
    if (opts.published) {
      await reindexPost(postId);
    } else {
      await removePostIndex(postId);
    }
  } catch (e) {
    console.error("[rag] 索引更新失败", {
      postId,
      published: opts.published,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}

export type ReindexAllResult = {
  scanned: number;
  totalChunks: number;
  created: number;
  updated: number;
  removed: number;
  /** 清理掉「文章已不存在或已转草稿」的孤儿块 */
  orphanRemoved: number;
  perPost: { title: string; chunks: number; chars: number }[];
};

/**
 * 重建全部已发布文章的索引（启动回填与 CLI 用）。
 *
 * 除了逐篇重建，还会清理孤儿块：文章被删除或转为草稿后，它的块不会自己消失
 * （除非当初走过写接口的清理路径）。启动时顺手扫一遍，能兜住历史遗留。
 */
export async function reindexAll(): Promise<ReindexAllResult> {
  const posts = await prisma.post.findMany({
    where: { published: true },
    select: { id: true, slug: true, title: true, content: true },
    orderBy: { publishedAt: "desc" },
  });

  let created = 0;
  let updated = 0;
  let removed = 0;
  const perPost: { title: string; chunks: number; chars: number }[] = [];

  for (const post of posts) {
    const r = await reindexPost(post.id);
    created += r.created;
    updated += r.updated;
    removed += r.removed;
    const chars = chunkMarkdown(post.content).reduce((a, c) => a + c.chars, 0);
    perPost.push({ title: post.title, chunks: r.chunks, chars });
  }

  // 孤儿块：postId 对应的文章已不存在，或已不是已发布状态
  const liveIds = new Set(posts.map((p) => p.id));
  const allPostIds = await prisma.docChunk.findMany({
    select: { postId: true },
    distinct: ["postId"],
  });
  const orphanIds = allPostIds.map((r) => r.postId).filter((id) => !liveIds.has(id));
  let orphanRemoved = 0;
  if (orphanIds.length > 0) {
    const r = await prisma.docChunk.deleteMany({ where: { postId: { in: orphanIds } } });
    orphanRemoved = r.count;
  }

  const totalChunks = await prisma.docChunk.count();

  return {
    scanned: posts.length,
    totalChunks,
    created,
    updated,
    removed,
    orphanRemoved,
    perPost,
  };
}
