# Tasks

## 1. 索引逻辑收敛

- [x] 1.1 新建 `lib/rag/index.ts`，提供 `reindexPost(postId)`、`removePostIndex(postId)`、`reindexAll()`。切块复用 `lib/rag/chunk.ts`，写入按 `[postId, order]` upsert，并删除多余旧块。验证：单篇重建两次，块数不变（幂等）；正文改短后旧块被删除。
- [x] 1.2 `scripts/backfill-chunks.ts` 改为调用 `reindexAll()`，只保留 CLI 外壳与输出格式（`scanned / created / updated / removed`）。验证：脚本输出与改动前一致；对同一数据库跑两次，第二次 `created=0`。

## 2. 启动时回填

- [x] 2.1 `Dockerfile` 的 `CMD` 在 `db seed` 之后、`npm run start` 之前插入回填步骤，支持 `SKIP_RAG_BACKFILL=1` 跳过，失败时打印错误但继续启动。验证：本地用干净数据库跑一遍启动命令，`DocChunk` 行数 > 0；设 `SKIP_RAG_BACKFILL=1` 时跳过且不报错。
- [x] 2.2 确认回填对已有索引幂等：连续启动两次，块数不翻倍。验证：第二次启动后 `DocChunk` 行数与第一次相同。

## 3. 写接口同步索引

- [x] 3.1 `app/api/posts/route.ts`（POST 新建）：写 Post 成功后按 `published` 决定 `reindexPost` 或 `removePostIndex`；索引异常打日志但不影响响应。验证：新建已发布文章后立刻在库里查到该文章的块；新建草稿则不产生块。
- [x] 3.2 `app/api/posts/[id]/route.ts`（PUT 更新）：同样按 `published` 分支；正文改短时旧块被清理。验证：更新正文后块内容随之变化；把已发布改为草稿后该文章的块被删除。
- [x] 3.3 `app/api/posts/[id]/route.ts`（DELETE 删除）：删除文章后清理其全部块。验证：删除后 `DocChunk` 里该 `postId` 的行数为 0。
- [x] 3.4 索引失败不阻断文章保存：用注入的失败（临时让切块抛错）验证接口仍返回成功且日志里有 `postId`。验证：模拟异常后文章内容确实写入，且控制台出现带 `postId` 的错误行。

## 4. 拒答可观测

- [x] 4.1 `app/api/ask/route.ts`：拒答分支输出结构化日志，包含 `mode`、`topScore`、`threshold`、`hits`、`indexEmpty`。验证：触发一次拒答，服务端日志里能读到这五项；`DocChunk` 为空时 `indexEmpty` 为 `true`。

## 5. 集成验证

- [x] 5.1 `npx tsc --noEmit` 与 `pnpm build` 通过。
- [x] 5.2 端到端（本地）：清空 `DocChunk` → 跑回填 → 用 `/api/ask` 提问命中文章内容；再新建一篇已发布文章 → 不等回填，直接提问该文章独有内容 → 能命中。
- [x] 5.3 端到端（部署路径）：验证 `Dockerfile` 的启动命令在有数据与空库两种情况下都能起服务，且回填后问答可用。

## 6. 文档

- [x] 6.1 更新 `docs/DEVELOPMENT.md`：新增「检索索引的生命周期」小节（启动回填、写接口同步、草稿与删除的处理、`SKIP_RAG_BACKFILL` 开关）；在脚本清单登记 `backfill-chunks.ts` 的新语义。验证：按文档能定位到 `lib/rag/index.ts` 与 Dockerfile 中对应步骤。

## Workflow follow-up

- 部署后需在服务器上确认一次 `DocChunk` 行数与文章块数一致（`npx tsx scripts/backfill-chunks.ts` 的 dry 输出可作对照）。
- 归档本变更时，把与 `add-ai-qa` 的边界再核对一次：本变更只负责「索引有没有、新不新」，不负责「阈值准不准」。