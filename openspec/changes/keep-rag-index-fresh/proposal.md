# Proposal

## Why

线上问答「问啥都是不知道」。根因不在阈值，也不在模型——**检索索引是空的**。

`DocChunk` 这张表只在本地由 `scripts/backfill-chunks.ts` 手工回填过。生产环境的启动链路是：

```
npx prisma migrate deploy   → 建出空的 DocChunk 表
npx prisma db seed          → 只同步管理员与示例文章，不碰 DocChunk
npm run start               → 开始服务
```

没有任何一步会往 `DocChunk` 里写数据。所以每次检索都返回 0 条，分数 0 低于任何阈值，代码正确地拒绝了所有提问——**拒答逻辑本身是对的，是它拿不到任何依据**。

而且不止初装：`app/api/posts/route.ts`（新建）与 `app/api/posts/[id]/route.ts`（更新 / 删除）都只写 `Post`，不同步 `DocChunk`。即使手工回填一次，之后编辑过的文章立刻变成「旧内容」，新发布的文章则永远检索不到。这个索引会随着内容维护持续偏离。

## What Changes

- **容器启动时回填**：Dockerfile 的启动命令在 `seed` 与 `start` 之间插入一步索引回填，让每次部署后索引与文章对齐。
- **文章写操作同步索引**：新建、更新、删除文章的接口在同一事务里重建该文章的块，删文时清掉它的块。
- **回填逻辑收敛到一处**：把现在躺在 `scripts/backfill-chunks.ts` 里的切块入库逻辑抽成 `lib/rag/index.ts`，
  脚本、启动流程、API 都调用同一个函数——三处各写一遍必然走形。
- **可观测**：`/api/ask` 在拒答时把 `mode`、`topScore`、`threshold`、`hits` 写进服务端日志，
  排查「为什么拒答」不用靠猜。

## Capabilities

### New Capabilities

- `rag-indexing`: 检索索引的生命周期契约 —— 何时建、何时更新、何时删、启动时如何保证与文章一致、
  空索引时如何暴露问题而不是静默拒答。

## Impact

- **代码**：
  - 新增 `lib/rag/index.ts`：`reindexPost(postId)`、`removePostIndex(postId)`、`reindexAll()`。
  - `scripts/backfill-chunks.ts`：改为调用 `reindexAll()`（保留 CLI 入口与幂等报告）。
  - `app/api/posts/route.ts`、`app/api/posts/[id]/route.ts`：写 Post 后调用索引函数。
  - `Dockerfile`：启动命令插入回填步骤。
  - `app/api/ask/route.ts`：拒答时输出诊断日志。
- **数据**：不改表结构。启动回填对已存在的块是 upsert，幂等。
- **风险**：
  - **启动变慢**：回填要遍历所有已发布文章并逐块 upsert。语料小时（当前 7 篇）是毫秒级；
    文章多了会拖慢启动，且并发实例可能同时回填。需要设计成可控（见 design）。
  - **写接口变慢 / 失败传播**：重建块要切块 + 批量写。若索引失败不该让文章保存失败——
    但静默吞掉又会让索引静默失效，需要明确取舍。
  - **部署顺序**：老容器还在跑时新容器的回填不影响它，但两个实例同时写同一批块需要幂等。
- **验证口径**：干净数据库 → 启动容器 → `DocChunk` 行数 > 0 且与文章块数一致；
  新建文章后立刻能问答命中；改文章后问答回到新内容；删文章后不再命中；`tsc` 与 `build` 通过。
- **不在本次范围**：向量回填（`embedding` 列）的自动化——本地无 pgvector，线上启用向量后需单独处理；
  索引增量更新的性能优化（当前全量重建单篇的块，语料规模下足够）。
