# Design

## Context

动机见 `proposal.md`；契约见 `specs/rag-indexing/spec.md`。这里记录实现依据的现状与已核实的事实。

**生产启动链路**（`Dockerfile` 的 `CMD`）：

```
npx prisma migrate deploy   → 建表（含空的 DocChunk）
npx prisma db seed          → 同步管理员与示例文章；不碰 DocChunk
npm run start               → 服务开始
```

**已核实的事实**：

| 项 | 结果 |
|---|---|
| `prisma/seed.ts` | 全文搜索 `docChunk` **零命中**，不建索引 |
| 写文章的接口 | `app/api/posts/route.ts`（POST 新建）、`app/api/posts/[id]/route.ts`（PUT 更新、DELETE 删除）都**只写 Post** |
| 现有索引代码 | 只在 `scripts/backfill-chunks.ts` 里，靠手工执行 |
| 本地数据 | `DocChunk` 72 块、已发布 3 篇（含一篇临时条目），检索正常（最高分 0.368~0.531） |
| 本地扩展 | 无 pgvector，走全文检索（`fulltext`），阈值 0.3 |
| 本地检索对照 | 「如何创建智能体」0.368、「系统提示词」0.531 → 都过阈值，说明**代码没问题，是线上没数据** |

**「你好呀」在本地也拿到 0.368 并会去调模型**——这是另一个质量问题（阈值偏低），不在本变更范围，
但会在 design 里记录，避免和索引问题混为一谈。

## Goals / Non-Goals

**Goals:**

- 线上部署后索引自动就位，不需要人记得跑脚本。
- 文章增删改后索引立刻跟随，不随时间漂移。
- 索引出问题时能看出来，而不是继续「礼貌地拒绝一切」。

**Non-Goals:**

- 不处理 `embedding` 列的回填（本地无 pgvector，且向量启用是独立话题）。
- 不做增量块级 diff（单篇全量重建在该语料规模下成本可忽略）。
- 不改检索算法与阈值（那是 `add-ai-qa` 的事）。

## Decisions

### D1 索引逻辑收敛到 `lib/rag/index.ts`

```ts
export async function reindexPost(postId: string): Promise<number>  // 返回块数
export async function removePostIndex(postId: string): Promise<void>
export async function reindexAll(): Promise<{ posts: number; chunks: number }>
```

- **为什么必须收敛**：现在切块入库的逻辑写在脚本里。加启动回填 + API 同步后会有三条路径，
  各写一遍必然在「删旧块」「更新 slug/标题」这些细节上分叉，最后表现成「某个入口存进去的文章检索不到」。
- `reindexPost` 的语义定为**先按文章重建、再清理多余块**（与现有脚本的 upsert + stale 删除一致）。
- 抽出来后 `scripts/backfill-chunks.ts` 只保留 CLI 外壳与输出格式，逻辑全部调用 `reindexAll()`。

### D2 启动回填：放进 `CMD`，但做成「尽力而为 + 可跳过」

```sh
npx prisma migrate deploy
npx prisma db seed
npx tsx scripts/backfill-chunks.ts --quiet   # 新增
exec npm run start
```

- **为什么不在 seed 里做**：seed 的语义是「同步管理员与示例数据」，把索引重建塞进去会让
  `prisma db seed` 在开发时也重建全量索引，语义混乱且慢。单独一行更清楚。
- **为什么允许跳过**：文章量大之后全量回填会拖慢启动。留一个环境变量
  `SKIP_RAG_BACKFILL=1` 显式跳过，让运维在文章变多后有权衡空间。
- **失败不阻断启动**：回填失败时打日志并**继续启动**，因为站点本身（浏览文章）不该因为问答索引而不可用。
  但——根据 spec「索引为空不得静默」，失败会同时让 `/api/ask` 在拒答时把
  `hits=0` 与 `indexEmpty=true` 写进日志，运维能看见。

> 取舍说明：`--quiet` 时仍打印一行摘要，而不是完全无声。完全无声会让「部署后索引到底有没有建」
> 变成一个只能靠猜的问题。

### D3 写接口同步：保存优先，索引尽力

```ts
const post = await prisma.post.update({ ... });
try {
  await reindexPost(post.id);
} catch (e) {
  console.error("[rag] 索引更新失败", { postId: post.id, error: e });
}
return NextResponse.json({ id: post.id });
```

- **为什么不让索引失败回滚文章**：作者刚写完的正文丢掉的代价，远大于索引暂时旧一点。
  索引可以重建，正文不能。
- **为什么不 fire-and-forget**：等待它完成能让「保存后立刻问答」在大多数情况下就是对的；
  纯异步会在保存后的几秒内检索到旧内容，制造难解释的「刚改完却答错」。
- 索引失败**必须打日志**（带 `postId`），否则就是 spec 里禁止的「静默」。

### D4 草稿与删除：块必须移除

- 更新接口里 `published` 变为 `false` → 调 `removePostIndex`（而不是 `reindexPost`）。
- 删除接口在 `prisma.post.delete` 之后调 `removePostIndex`。
- **为什么草稿要移除**：spec 的「检索依据仅限已发布文章」是 `add-ai-qa` 已有的要求，
  索引里留着草稿内容会让它被检索到——这是内容泄露，不只是质量问题。

### D5 拒答日志：只加日志，不改拒答行为

```ts
console.log("[ask] refused", { mode, topScore, threshold, hits, indexEmpty: chunks.length === 0 });
```

- **为什么现在加**：线上这次排查全靠猜——`hits=0` 与「有命中但分数低」是两种完全不同的故障，
  却表现为同一个「不知道」。一行日志就能分开。
- **不改拒答行为**：拒答逻辑本身是对的，本变更只让它可被观察。

## Risks / Trade-offs

- **[启动变慢]** → 当前 7 篇 / 3.7 万字，回填毫秒级；提供 `SKIP_RAG_BACKFILL` 作为文章变多后的出口。
- **[多实例同时回填]** → upsert 按 `[postId, order]` 幂等，并发不会产生重复块；代价是可能的短暂锁竞争，可接受。
- **[保存时索引拖慢响应]** → 单篇重建是几十次 upsert，语料规模下 < 100ms；若将来变慢，再改成队列。
- **[索引失败被吞]** → D3 明确要求打日志；spec 有对应场景。
- **[seed 与回填顺序]** → 回填放在 seed 之后，因为 seed 可能创建示例文章，顺序反了会漏掉它们。

## Migration Plan

1. 抽 `lib/rag/index.ts`，把脚本逻辑搬进去。
2. `scripts/backfill-chunks.ts` 改为调用 `reindexAll()`。
3. `Dockerfile` 的 `CMD` 插入回填步骤（带 `SKIP_RAG_BACKFILL` 判断）。
4. 三个写接口接入 `reindexPost` / `removePostIndex`。
5. `/api/ask` 加拒答诊断日志。
6. **回滚**：去掉 `CMD` 里那一行即回到旧行为；API 里的索引调用可单独回退，不影响文章功能。

## Open Questions

- 「你好呀」这类闲聊在全文模式下也能拿到 0.368 分（高于阈值 0.3）并触发模型生成。
  这属于阈值标定问题，建议在 `add-ai-qa` 里用线上真实问题集重新标定后调整，
  不在本变更里改——两件事混在一起会让「到底是索引问题还是阈值问题」更难分辨。
