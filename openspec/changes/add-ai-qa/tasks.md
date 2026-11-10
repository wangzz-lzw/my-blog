# Tasks

## 1. 文档块表与切块

- [x] 1.1 新增 `DocChunk` 模型（`postId`、`slug`、`postTitle`、`order`、`heading`、`text`、`chars`、`createdAt`、`updatedAt`，`@@unique([postId, order])`，索引 `@@index([postId])`）并生成迁移。验证：`prisma migrate dev` 成功；既有表结构与行数不变。
- [x] 1.1b 向量列单独一条迁移：用 `DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS vector; EXCEPTION WHEN OTHERS THEN NULL; END $$;` 包住扩展创建，再条件性加 `embedding` 列。**必须保证在没有 pgvector 的本地库上 `prisma migrate dev` 也能推进**（本地 PG 18 实测 `CREATE EXTENSION vector` 被拒：`extension "vector" is not available`）。验证：本地跑迁移不报错、无 embedding 列但不阻塞；在有扩展的测试库上该列被创建。
- [x] 1.2 新建 `lib/rag/chunk.ts`：按 Markdown 的 h2/h3 切段，块超过 800 字时按段落边界二次细切；每块保留所属小标题并前置到文本开头。验证：单测覆盖「无标题的纯段落」「只有 h1」「h2 下堆 3000 字」「代码块内不切」四种情况，块总数与每块字数符合预期。
- [x] 1.3 回填脚本 `scripts/backfill-chunks.ts`：遍历已发布文章 → 切块 → 按 `[postId, order]` upsert；打印 `scanned / created / updated`。验证：跑两次，第二次 `created=0` 且表行数不变（幂等）。

## 1b. 生产镜像与 embedding 配置

- [x] 1b.1 把 `docker-compose.yml` 的 PG 镜像从 `postgres:16-alpine` 换成 `pgvector/pgvector:pg16`（同为 PG 16，`pgdata` 卷沿用，不重建库）。验证：`docker-compose.yml` 的 `image:` 已是新值；容器起得来、能连库、既有数据仍在。
- [x] 1b.2 在 `.env.example` 补 `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL`（固定 `https://dashscope.aliyuncs.com/compatible-mode/v1`）/ `EMBEDDING_MODEL` 三项（与 `AI_*` 分开，密钥不通用），注释写明"三项缺一即回落全文检索"。验证：`.env.example` 有这三项且说明清楚；`docs/DEVELOPMENT.md` 的问答一节提到它们。
- [x] 1b.3 **验证 embedding 模型 id 与维度**（门槛任务，必须在写向量列迁移之前完成）：拿到 DashScope 密钥后，用一次真实 `POST {base}/embeddings` 请求确认 `EMBEDDING_MODEL` 是可用的 embedding 模型，并记录返回向量的维度。需求里给的 `qwen3.7-text-embedding-flash` 与阿里云现有命名（`text-embedding-v3/v4`、`qwen3-embedding-<size>`）不符，需以控制台实际 id 为准。验证：请求返回 200 且 `data[0].embedding.length` 为确定的 N；把 N 与模型 id 写进 design 与本任务；若该名字不可用，记录实际可用的替代 id 并请用户确认。

## 2. 检索层（双模式）

- [x] 2.1 `lib/rag/retrieve.ts` 定义 `Retriever` 接口与 `FulltextRetriever`：`to_tsvector('simple') @@ plainto_tsquery('simple')` 用 `ts_rank` 排序 + `pg_trgm` 的 `similarity` 补充召回，两路归一加权后取前 K=6。验证：用站内能答的问题与站外无关问题各 3 个跑一遍，前者 top 块分数明显高于后者。
- [x] 2.2 实现运行时探测 `detectRetriever()`：查 `pg_extension` 是否有 `vector`、检查 `EMBEDDING_*` 三项是否齐全、表里是否有非空 embedding 行；三者全满足才返回 `VectorRetriever`，否则全文。结果进程级缓存。验证：在当前环境（无 pgvector）下强制断言返回 `fulltext`，且不抛错。
- [x] 2.3 `VectorRetriever` 骨架：调用 OpenAI 兼容的 `/embeddings` 拿问题向量，用 `<=>` 余弦距离排序。**在扩展未安装的环境里必须能编译通过但不可被选中**。验证：`tsc` 通过；探测逻辑不会选中它；调用它时给出明确错误而不是崩溃。

## 3. 回答与拒答

- [ ] 3.1 在 `lib/ai.ts` 旁边新增 `lib/rag/answer.ts`：构造 system prompt（只用给定段落作答、段落里没有就说不知道、禁止编造），调用流式 `/chat/completions` 并逐块产出文本。**不改动现有 `summarizePost`**。验证：`summarizePost` 的签名与行为不变（跑一次后台 AI 摘要仍正常）。
- [ ] 3.2 实现拒答判定：候选块最高分 < `MIN_SCORE` 时不调用模型，直接产出固定的拒答文案 + 从已发布文章的标题与标签生成的可答话题列表。验证：单测断言"高分候选 → 调模型"、"低分候选 → 不调模型且返回拒答"，用假 retriever 注入两种分数。
- [x] 3.3 标定 `MIN_SCORE`：准备一组能在站内找到答案的问题与一组站外问题，各跑检索并记录 top 分数，选一个能把两类分开的阈值，把标定结果写成注释留在常量旁。验证：标定后同组问题重跑，站内问题全部不被拒、站外问题全部被拒。

## 4. 流式接口

- [ ] 4.1 `app/api/ask/route.ts`：接收 `{ question }`，先发 `stage: retrieving`，检索后发 `sources`，再流式发 `delta`，最后 `done`；错误路径发 `error`。用 `ReadableStream` + SSE 格式，不加 `Content-Length`。验证：`curl -N` 能看到事件按序到达，而不是等全部结束才一次性收到。
- [ ] 4.2 限流：未登录按 `x-forwarded-for` 首段 10 次/5 分钟；登录按 `session.user.id` 20 次/5 分钟；超限返回 `{error, retryAfter}`。验证：脚本连续请求触发 429 并带 `retryAfter`，等待后恢复。
- [ ] 4.3 降级：AI 未配置 → 503 + 可读文案；上游失败 → 发 `error` 事件而不是让流挂住；无已发布文章 → 直接返回空状态文案且不调模型。验证：分别用改 `.env`、注入坏 baseURL、清空文章三种方式验证。

## 5. 前端悬浮问答

- [ ] 5.1 `components/ask/AskLauncher.tsx`：右下角入口（与 `FloatTools` 同侧、在其左下方），沿用 `.float-btn` 视觉；点开后渲染面板。无 JS 时不出现。验证：真实浏览器里各页面都能看到入口；禁用 JS 后入口不存在且不留空白。
- [ ] 5.2 `components/ask/AskPanel.tsx`：输入框 + 提问按钮 + 停止按钮 + 消息区；用 `fetch` + `ReadableStream` 逐块读 SSE，`delta` 累加到当前答案而不触发整树重渲染；`AbortController` 支持中途停止并保留已显示内容。验证：真实浏览器里回答逐字出现；点停止后内容保留且能再次提问。
- [ ] 5.3 引用展示：`sources` 到达即渲染文章标题列表，点击跳转对应文章。验证：回答下方列出的文章与本次检索命中的文章一致（按 slug 比对）。
- [ ] 5.4 状态与降级：检索中 / 生成中 / 拒答 / 出错 / 未配置五种状态各有明确文案；拒答时展示"能回答的话题"。验证：逐个状态人为触发并核对文案。
- [ ] 5.5 无障碍与动效：Esc 关闭并把焦点归还入口；面板内 Tab 顺序合理；`prefers-reduced-motion` 下不做展开动画。验证：键盘可完成一次提问；开启减少动效后无展开位移。

## 6. 样式

- [ ] 6.1 在 `app/redesign.css` 写面板样式，沿用站点 token（`--accent` / `--rule` / `--ink-*`），不新增字体与色值。验证：新增 CSS 内无硬编码十六进制色值；六套主题下面板配色随主题变化。
- [ ] 6.2 窄屏（≤720px）：面板占满可用高度、输入固定在底部、无横向滚动。验证：390px 视口下提问并滚动回答，`scrollWidth <= innerWidth`。

## 7. 集成验证与文档

- [ ] 7.1 `npx tsc --noEmit` 与 `pnpm build` 通过。
- [ ] 7.2 真实浏览器端到端：问一个文章里有的问题 → 流式出字 + 引用正确；问一个文章里没有的问题 → 拒答 + 话题列表；点停止 → 内容保留。三项都断言真实 DOM 与文本。
- [ ] 7.3 更新 `docs/DEVELOPMENT.md`：新增「站内问答」一节（检索双模式与探测规则、切块规则、拒答阈值与标定、流式事件格式、限流口径），并在 `lib/` 职责表与接口表补相应条目。验证：按文档能定位到 `lib/rag/*` 与 `app/api/ask/route.ts` 的对应实现。

## Workflow follow-up

- 通过评审后归档本变更（`/openspec-archive-change`），把 `ai-qa` 同步进 `openspec/specs/`。
- 若日后装上 pgvector 并启用向量模式，另开一个变更补「向量列迁移 + embedding 回填」，并在那个变更里复核本 spec 的「两种检索模式的等价」是否仍成立。