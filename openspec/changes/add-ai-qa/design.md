# Design

## Context

动机见 `proposal.md`；契约见 `specs/ai-qa/spec.md`。这里记录实现必须依据的现状与已核实的事实。

**已核实的环境事实**：

| 项 | 实测结果 |
|---|---|
| 已发布文章 | **2 篇**，正文合计 **66736 字符**（其中一篇占 66534） |
| PostgreSQL（本地） | 18.6（Windows），`share/extension` 下 62 个扩展**无 `vector`** |
| `CREATE EXTENSION vector` | **真实执行过，被拒**：`extension "vector" is not available`（`0A000`） |
| 本地编译环境 | **无任何 C 编译器**（`cl`/`nmake`/`gcc`/`msbuild` 全无，无 Visual Studio） |
| 本机 docker | **不可用** |
| Docker PG（生产） | 现为 `postgres:16-alpine`（不带 pgvector）；**生产环境有 docker**，可换镜像 |
| AI 配置 | 已配置（OpenAI 兼容：`AI_BASE_URL` / `AI_MODEL` / `AI_API_KEY`） |

**这个结论决定了方案形态**：本地 Windows 的 PG 18 装不上 pgvector（扩展文件不存在、无编译器），
而**生产用 Docker，可以换成自带 pgvector 的镜像**。两边环境不同，所以做双模式：

- **本地**：全文检索（`to_tsvector` + `pg_trgm`），零安装，开箱即跑；
- **生产**：换镜像 + `CREATE EXTENSION vector` + 配 embedding → 探测通过后自动切向量。

两者对外行为一致（同样流式、同样引用、同样拒答），**切换由运行时探测决定，不靠配置开关**。
这不是妥协：它把"依赖外部扩展"隔离在一个可替换的边界里，本地开发不被环境阻塞，
生产又能拿到向量检索的召回质量。

**现有 AI 调用**（`lib/ai.ts`）：非流式的 `/chat/completions`，`temperature: 0.3`，
返回后 `extractJson` 解析。本次要加**流式**调用，但不能破坏 `summarizePost`（后台 AI 摘要还在用）。

**现有悬浮工具**（`components/FloatTools.tsx`）：右下角一组 40px 圆钮，`position: fixed`，
已有 `.float-tools` / `.float-btn` / `.float-bubble` 一套样式与交互语言。问答入口应当沿用它，
而不是再造一套悬浮语言。

## Goals / Non-Goals

**Goals:**

- 今天就能跑：不装任何额外东西，全文检索 + 流式回答 + 拒答。
- 拒答是**代码的确定性行为**，不依赖模型自觉。
- 引用可追溯，且与检索命中严格一致。
- 向量切换只换适配器，上层（路由、UI、拒答逻辑）一行不改。

**Non-Goals:**

- 不做多轮对话记忆（每次提问独立检索，不带历史）。
- 不做 pgvector 的自动安装与运维（那是前置条件，不是本功能的一部分）。
- 不改后台的 AI 摘要能力。
- 不做答案的人工校对流程。

## Decisions

### D1 切块：按标题切，不按固定字数硬切

```
文章 → 按 Markdown 标题（h2/h3）分段 → 每段超过 ~800 字再按段落边界细切
每块保留：文章 id、标题、块序号、块文本、所属小标题
```

- **为什么按标题切**：文章的小标题本身就是作者给出的语义边界。按固定 500 字硬切会把一个概念的
  上半句和下半句分到两块里，检索命中一块时上下文是断的。
- **为什么还要二次细切**：单篇 66534 字符，若某个 h2 下堆了 8000 字，整块喂给模型会挤掉别的候选。
- **块的上限**：约 800 字（中文按字符算）。这是"能独立讲清一件事"与"不稀释检索分数"的折中。

### D2 全文检索基线：`to_tsvector` + `pg_trgm` 双路召回

```
路 A：to_tsvector('simple', chunk) @@ plainto_tsquery('simple', question)
      —— 词命中，用 ts_rank 排序
路 B：similarity(chunk, question) > 0.05，用 pg_trgm 的 trigram 相似度
      —— 补中文分词差导致的漏召回
合并：A 的结果按 rank 归一后与 B 的 similarity 加权求和，取前 K（K=6）
```

- **为什么用 `simple` 而不是中文分词器**：PG 默认没有中文分词扩展（`zhparser` 也不在可用列表里）。
  `simple` 会按空白与标点切，中文长句会整句成一个 token——所以**必须有路 B 兜底**，
  trigram 对中文子串的相似度是有效的。
- **为什么不用 `like '%…%'`**：全文扫描在 6.7 万字上虽然够快，但无法排序，也就无法设阈值。
- **K=6**：6 块 × 800 字 ≈ 4800 字，留足空间给 system prompt 与回答，也不会让模型淹没在噪音里。

### D3 向量模式：适配器，且**运行时探测**而非配置开关

```ts
interface Retriever {
  /** 返回召回块，score ∈ [0,1]，已按相关度降序 */
  retrieve(question: string, k: number): Promise<RetrievedChunk[]>;
  /** 给 UI/日志看的内部标识，界面上不展示 */
  readonly mode: "vector" | "fulltext";
}
```

探测顺序（每次请求不做，进程启动时探一次并缓存）：

1. `SELECT 1 FROM pg_extension WHERE extname = 'vector'` —— 扩展没装就直接全文。
2. 配了 `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL` / `EMBEDDING_API_KEY`（缺一不可）。
3. 表里已有非空 embedding 的行（否则向量检索会对空索引返回空结果）。

三条全满足才用 `VectorRetriever`，否则用 `FulltextRetriever`。

- **为什么探测而不是 `RAG_MODE=vector` 这种开关**：开关会撒谎——配了 `vector` 但扩展没装，
  就变成启动即崩。探测让"可用性"成为事实判断。
- **为什么界面上不显示模式**：用户不关心检索实现；spec 的「模式不可见切换」明确要求这一点。
  日志里打出来供运维看。

**两处环境判断落地为具体改动**：

- **生产镜像换成自带 pgvector 的**：`docker-compose.yml` 的 `postgres:16-alpine` 改为
  `pgvector/pgvector:pg16`。两者同为 PostgreSQL 16、数据目录格式一致，`pgdata` 卷可直接沿用，
  **不需要重建库**。容器起来后仍需 `CREATE EXTENSION vector`（由一条迁移做）。
  本地 Windows 的 PG 18 装不上 pgvector，所以**本地走全文、生产走向量**——这正是双模式要解决的场景。
- **embedding 单独一组配置**：新增 `EMBEDDING_API_KEY` / `EMBEDDING_BASE_URL` / `EMBEDDING_MODEL`，
  不复用 `AI_*`。理由：对话与 embedding 常常是不同供应商（对话用一家、embedding 用另一家更便宜），
  合并成一组会把两个独立决策绑死。缺任一项即视为未配置，回落全文。
- **选型：阿里云百炼（DashScope）的 `qwen3.7-text-embedding-flash`**，已用真实请求验证：

  | 项 | 实测结果 |
  |---|---|
  | base URL | `https://cn-beijing.maas.qianwenaiapi.com/compatible-mode/v1` |
  | 模型 | `qwen3.7-text-embedding-flash` —— **可用** |
  | **维度** | **1024**（决定 `vector(1024)`） |
  | 批量输入 | ✅ 支持（回填可批处理，一次多条 `input`） |
  | 长文本 | 2800 字符一次调用成功（切块 800 字远低于上限） |
  | 确定性 | 相同文本两次返回完全一致 → **可缓存，回填幂等有保证** |
  | 区分度 | 不同主题余弦相似度 0.2585（不是都挤在一起） |

  ⚠️ **base URL 必须带 `/compatible-mode`**。实测 `.../api/v1/embeddings` 返回 **404**，
  而模型名本身是对的——这个 404 很有迷惑性，会被误判成"模型不存在"。
  排查时先用 `GET /models` 确认 base 是否认路，再验模型。

  密钥与对话用的 `AI_API_KEY` **不通用**，需在百炼控制台单独申请。

### D4 拒答由阈值决定，不是模型自述

```
候选块的最高分 < MIN_SCORE(0.35)  →  直接返回拒答，不调用模型
```

- **为什么**：让模型"自觉说不知道"是概率行为——同一个 prompt 在温度 0.3 下也可能给出自信的编造。
  代码在调用前就拦下来，是确定性行为，可被测试断言。
- 拒答文案固定，并附上"我能回答的话题"：从已发布文章的**标题 + 标签**生成（不是让模型编）。
- **阈值 0.35 需要标定**：用站内真实问题（能在文章里找到答案的）与站外问题各跑一批，
  取能把两者分开的位置。实现时写成常量并留下标定记录。

### D5 流式：SSE over `ReadableStream`，事件分三类

```
data: {"type":"stage","stage":"retrieving"}
data: {"type":"sources","sources":[{id,title,slug}]}
data: {"type":"delta","text":"…"}      ← 多次
data: {"type":"done"}
data: {"type":"error","message":"…"}
```

- **为什么先发 `sources` 再发正文**：引用块可以先渲染出来（用户能立刻看到"它参考了哪几篇"），
  正文再逐字填充。这样等待期间界面不是空白。
- **为什么不直接用 AI SDK 的 data stream 协议**：项目没装 SDK，且该协议为多步工具调用设计，
  这里用不上；手写 SSE 二十行就够，也便于精确控制事件顺序。
- **为什么拒答也走同一套事件**：拒答时发 `stage: refused` + `sources` 为空 + 固定文案的 `delta`，
  UI 不需要两套渲染分支。

### D6 前端渲染：逐块累加，不用虚拟列表

- 回答长度受 `max_tokens` 约束（约 800 字），不需要虚拟滚动。
- 流式期间只更新一个 ref 指向的文本节点，避免每次 delta 触发整棵树重渲染。
- 停止按钮：`AbortController` 中断 `fetch`，已渲染内容保留（spec 的场景）。

### D7 限流：按来源 + 按账号两条独立窗口

复用 `app/api/ai/summarize/route.ts` 里已有的进程内 Map 模式（单实例部署够用），
但问答是面向访客的、频率更高，因此：

- 未登录：按 `x-forwarded-for` 首段，10 次 / 5 分钟。
- 已登录：按 `session.user.id`，20 次 / 5 分钟。
- 超限返回 `{ error, retryAfter }`，前端显示"请 N 秒后再试"。

### D8 入口放在 `FloatTools` 同侧但不并入它

`FloatTools` 已经有机房断电式的圆形按钮组（沉浸阅读、回到顶部），它们只在文章页语义明确。
问答是全站入口，语义不同，因此**并列一个新组件** `AskLauncher`，定位在 `FloatTools` 的左下方，
沿用同一套 `.float-btn` 视觉（40px 圆、发丝线、等宽符号），保证不出现第二套悬浮语言。

- 无 JS：整个组件不渲染（`"use client"` + 首帧不挂载），不留空白。

## Risks / Trade-offs

- **[中文全文检索召回差]** → `pg_trgm` 双路召回兜底；拒答阈值宁可偏保守（少答不错答）。
- **[切块切断语义]** → 按标题切 + 保留小标题在块首；块上限 800 字避免稀释。
- **[流式被反代缓冲]** → Next 的 Route Handler 用 `ReadableStream` 直接返回，不加 `Content-Length`；
  Nginx 配置里 `/api/ask` 需要 `proxy_buffering off`（现有 nginx.conf 已在全局关闭）。
- **[限流用进程内 Map]** → 单实例部署够用；多实例会各算各的，接受（与现有 AI 摘要同一条取舍）。
- **[阈值标定不准]** → 保守偏向拒答；用真实问题集回归，把标定过程写进任务。
- **[向量模式装了却没回填]** → D3 的第 3 条探测（表里有非空 embedding）挡掉这种情况。
- **[模型无视上下文]** → system prompt 里强制"只能用给定段落作答，段落里没有就说不知道"，
  并且**在调用前用阈值拦住**（D4）——两层，不靠单层。

## Migration Plan

1. 新增 `DocChunk` 表（文本 + 全文索引），一条迁移。向量列**不在这一条里**。
2. 回填脚本：遍历已发布文章 → 切块 → 写表。幂等（按文章 id + 块序号 upsert）。
3. 上线检索 + 流式 + 拒答 + 悬浮入口（全文模式）。
4. **生产启用向量**：
   - `docker-compose.yml` 的 PG 镜像从 `postgres:16-alpine` 换成 `pgvector/pgvector:pg16`
     （同为 PG 16，`pgdata` 卷直接沿用，无需重建库）；
   - 容器起来后 `CREATE EXTENSION vector`（由迁移做）；
   - 配 `EMBEDDING_*` 三项；
   - 跑 embedding 回填；
   - 探测三条全满足 → 自动切向量，**不需要改代码也不需要改开关**。
5. **回滚**：
   - 想退回全文：删掉 `EMBEDDING_*` 任一项即可（探测失败自动回落），代码与数据都不用动。
   - 想彻底移除：删悬浮入口引用；`DocChunk` 表留着无害（不被读取即死数据）。

> 迁移里"向量列"这条要特别注意：若 `migration.sql` 直接写 `CREATE EXTENSION vector`，
> 在没有扩展的库里会让 `prisma migrate deploy` 整体失败。要么用
> `DO $$ BEGIN CREATE EXTENSION IF NOT EXISTS vector; EXCEPTION WHEN OTHERS THEN NULL; END $$;`
> 包住，要么把向量列做成不进自动链的补充迁移——**本地 PG 18 装不上扩展，必须让迁移链能推进**。

## Open Questions

- 拒答阈值 `MIN_SCORE` 的具体值与向量模式的相似度阈值是否共用。取决于两种模式的分数分布，
  实现后用真实问题集各标定一次再定，不影响 spec 与任务拆分。
- ~~embedding 的模型 id 与维度~~ **已定**：`qwen3.7-text-embedding-flash`，维度 **1024**，
  base 必须是 `.../compatible-mode/v1`（详见 D3 的实测表）。