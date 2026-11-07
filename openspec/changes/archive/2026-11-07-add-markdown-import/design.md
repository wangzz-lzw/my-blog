# Design

## Context

见 `proposal.md` 的 Why。实现前需要知道的现状（已核对代码）：

- `components/admin/PostEditor.tsx` 是客户端组件，已经有一处「隐藏 file input + ref」的现成写法（封面图上传：`coverFileRef` → `fetch("/api/upload")`）。导入不需要那条链路，因为目标只是把文本灌进 textarea。
- 现有 `/api/upload` 只收 JPG/PNG/WebP/GIF 并写阿里云 OSS；Markdown 导入与它无关，复用会让"OSS 未配置时导不进来"这种莫名依赖出现。
- 编辑器状态：`title / slug / excerpt / cover / content / tags / published`，错误提示走 `<p className="notice error">`；工具栏是 `.editor-toolbar`（左：Markdown 插桩按钮；右：视图切换 + 退出全屏），在分屏与全屏下都可见。
- slug 目前由 `onTitleChange` 在输入时用 `lib/slug.ts` 的 `slugify()` 生成，只在新建或 slug 为空时生效。
- 项目没有测试框架（`package.json` 无 test script），验证以样例文件手动导入 + `tsc` 为准，因此解析逻辑要写成**无副作用的纯函数**，方便在浏览器控制台或 `tsx` 里直接喂样例。

## Goals / Non-Goals

**Goals:**

- 解析与回填完全在客户端完成：不发请求、不依赖 OSS、不引入新依赖。
- 解析规则可预测、可单独验证：一个纯函数进、一个普通对象出。
- 导入失败时编辑器保持原状（原子性）：先算出完整的目标状态，再一次性落地。
- 合并策略由管理员当场选择，而不是靠猜测。

**Non-Goals:**

- 不做拖拽导入、不做从 URL 拉取、不做 zip/批量导入。
- 不做完整 YAML：只认扁平键值与一维数组（`[a, b]` 或 `- a` 行）。
- 不解析发布相关字段（`draft` / `date` / `published`）：发布保持显式动作。
- 不把导入的原文另存一份到数据库或 OSS。

## Decisions

### D1. 浏览器本地读取，不新增接口

`file.text()` 直接拿到字符串。理由：导入的产物是文本，服务端没有任何需要做的事；新增接口只会多出鉴权、大小限制、临时存储这些与需求无关的分支。

- 替代方案：复用 `/api/upload` 扩展出 `kind=markdown` 再回传文本。要动 OSS 配置与图片白名单，且"导入失败因为没配 OSS"是不可接受的耦合，弃用。

### D2. frontmatter 交给成熟包，`lib/markdown-import.ts` 只做归一化

> 本节在实施后修订：初版打算手写 frontmatter 解析器，被要求改用现成插件，故改为依赖 `front-matter@4`。

```ts
export type ParsedMarkdown = {
  body: string;
  title?: string;
  slug?: string;
  excerpt?: string;
  tags?: string[];
};
export function parseMarkdownDocument(raw: string): ParsedMarkdown | null;
```

分工：

- **`front-matter` 负责**：识别 `---` 分隔的 YAML 块、把 YAML 解析成对象、把正文切出来。
- **本文件负责**：去 BOM、CRLF → LF、把 `attributes` 归一到 `title/slug/excerpt/tags`（含 `description`/`summary`/`tag` 别名、数组与逗号字符串两种 tags 形态），以及包不提供的两条站点规则——**首个 `# 标题` 兜底**与**正文首尾空白裁剪**。

解析顺序：

1. **归一化**：去掉开头 BOM（`\uFEFF`）、`\r\n` → `\n`。
2. **frontmatter**：先用一个正则确认「第一个非空行是 `---` 且存在闭合分隔行」，才交给 `front-matter`；没有闭合分隔就整篇按正文处理（包本身对这种残缺输入的行为不稳定，这层判断留在我们手里）。
3. **YAML 写坏**：`front-matter` 抛错时只丢元信息，正文用正则切出来的部分继续导入，不让"元信息语法错误"挡住整份文稿。
4. **标题兜底**：没有 frontmatter 标题时，若第一个非空行匹配 `^#\s+(.+)$`，取为标题并从正文移除（连同其后的一个空行）。
5. **正文**：去掉首尾多余空行，保留内部空行与缩进。
6. **空结果**：正文为空且没有标题 → 返回 `null`，由调用方提示"没有可导入的内容"。

- **为什么不是 `gray-matter`**：它更主流，但 `index.js` 第 3 行就 `require('fs')`（给 `readFileSync` 用），这个模块要被客户端组件引用，打包时会报 `Can't resolve 'fs'`。改它要么动 Next 的 resolve 配置，要么把导入挪到服务端，两条都与"纯客户端、零配置"的前提冲突。
- 为什么不是 `remark-frontmatter` + `unified`：仓库里虽有 remark 渲染链，但抽取 frontmatter 只需一次字符串解析，跑完整 mdast 解析属于杀鸡用牛刀，还要多引 `unified`/`vfile-matter`/`yaml` 三个包。
- 为什么不是纯正则抽取：多行值、引号、三种数组写法混在一起，正则极易出错；交给 YAML 解析器更稳。

### D3. 合并策略：内联确认条，不用浏览器对话框

`window.confirm` 只有两个按钮，而这里需要三个选择（替换/追加/取消）。所以在工具栏上方渲染一条内联确认条（`role="alertdialog"`），三个按钮，默认焦点在「取消」，Esc 取消。

判定"已有内容"用 `[title, content, excerpt, tags].some(v => v.trim())`——只填了标题也算有内容，避免导入把标题冲掉。

### D4. 回填规则（替换 vs 追加）

| 字段 | 替换 | 追加 |
| --- | --- | --- |
| 正文 | 覆盖为文件正文 | 以空行分隔追加到末尾 |
| 标题 / slug / 摘要 | 文件提供了才覆盖，否则保留 | 只填空着的字段 |
| 标签 | 同上（提供则覆盖） | 只填空着的字段 |
| 发布勾选 | 不变 | 不变 |

slug 特殊处理：文件没给 slug 而给了标题时，**新建**文章用 `slugify(title)` 生成；**编辑**已有文章不改 slug（改 slug 会让已发布的链接失效）。

### D5. 入口放在工具栏右组

`.editor-toolbar-right` 里、视图切换与「退出全屏」之间加「导入 md」按钮。理由：工具栏在分屏、单栏、全屏三种状态下都可见，而 `.editor-head` 在全屏时会被隐藏——导入属于"我刚开始写"的动作，不该被全屏挡掉。

复用封面图的写法：隐藏 `<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain">` + ref。

### D6. 原子性靠"先算后写"

```ts
const next = mergeInto(currentState, parsed, strategy); // 纯对象计算，不碰 state
setTitle(next.title); setContent(next.content); ...      // React 19 自动批处理，一次渲染
```

读取 / 解析 / 校验全部发生在 `setState` 之前，任何一步抛错都只走 `setError`，不会出现"正文换了、标题没换"。导入成功后把光标放到正文末尾（追加）或开头（替换），并 focus textarea。

### D7. 大小与类型校验在读取之前

先看 `file.size > 1MB` 与扩展名/`type`，再 `file.text()`。1MB 纯文本解析是毫秒级；更大的文件既不常见，也没有必要为它做流式解析。

## Risks / Trade-offs

- [最小 YAML 解析器不支持多行字符串 `|` / `>`、嵌套对象] → 这类键会被当成普通字符串或忽略；文档与错误提示里说明"只支持扁平 frontmatter"，不静默改内容。
- [把正文中间的 `# 某行` 误当标题] → 只在"第一个非空行"时识别 H1，正文中间的标题不动。
- [frontmatter 分隔符与正文里的 `---` 混淆] → 只认文件开头、且必须找到闭合分隔；找不到就当没有 frontmatter。
- [导入后 slug 与已有文章冲突] → 保存时由既有接口返回 409 或唯一约束错误，编辑器展示既有错误提示，不新增处理。
- [在 1MB 附近的文件上一次性 setState 可能卡一下] → 上限固定 1MB，解析 O(n)，实测应在几十毫秒量级；若出现明显卡顿再加"正在导入"状态。
- [全屏下导入没有确认条的视觉空间] → 确认条渲染在工具栏与面板之间，全屏下仍在文档流内且不会被裁（面板 `flex:1` 会让位）。

## Migration Plan

纯前端改动，无数据迁移、无接口变更。

1. 本地 `npm run dev`，用四个样例文件跑一遍（frontmatter 全字段 / 仅 H1 / 无标题 / 代码块含 `---`），再测已有内容时的替换、追加、取消。
2. `npx tsc --noEmit` 与 `npm run build` 通过后提交，走既有 GitHub Actions。
3. 回滚：`git revert`，导入按钮消失，编辑器回到现状；不涉及数据。

## Open Questions

（无。解析范围与合并策略已在对话中确认；文件类型、1MB 上限、忽略发布字段是本次主动收窄，已记录在上面的决策与非目标里。）