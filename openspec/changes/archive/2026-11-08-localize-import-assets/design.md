# Design

## Context

动机见 `proposal.md`；契约见 `specs/import-asset-localization/spec.md`。这里只记录实现必须依据的现状。

**当前导入链路**（`components/admin/PostEditor.tsx`）：

```
工具栏「导入 md」→ <input type="file" accept=".md,.markdown,.txt">（单选，无 multiple）
  → onMarkdownFile：校验扩展名与 ≤1MB → file.text()
  → parseMarkdownDocument()（lib/markdown-import.ts，纯函数）
  → 编辑器已有内容？ 是 → setPendingImport(parsed) 弹确认条；否 → applyImport(parsed, "replace")
  → applyImport：mergeImport() 后写回 5 个 state
```

两条与本次直接相关的事实：

1. **`parseMarkdownDocument` 只做「文本进、结构出」**，文件头部注释明确写着「不读文件、不碰 React state」。
   资源本地化天然是异步 + 联网的，不能塞进这个纯函数。
2. **`applyImport` 里已有一段关于本地图片的遗憾**（`PostEditor.tsx:316-324`）：
   用正则数出本地引用数量，然后提示「博客看不到它们」。本次正是要把这段提示的成因消掉。

**当前插入图片链路**：

```
粘贴 / 拖入 → handleImageFiles() → uploadImageToOss(file) 逐个 → 拼 ![alt](url) → insertBlock()
工具栏按钮 → imageFileRef.current.click() → 同一个 handleImageFiles()
```

即：**按钮和粘贴/拖入共用同一个函数**。这正是删按钮不会损失任何能力的依据。

**上传接口约束**（`app/api/upload/route.ts`）：`MAX_SIZE = 5MB`，只接受 `image/jpeg|png|webp|gif`，
`kind` 只允许 `avatar|cover|image`。本次**不改**这个接口。

## Goals / Non-Goals

**Goals:**

- 导入一次就把文档里的本地图片全部落地，作者不用再手改路径。
- 匹配逻辑是纯函数、可单测，不依赖 DOM 或网络。
- 失败时绝不产生"半截正文"：要么按原文导入，要么完整替换。
- 删掉按钮后，粘贴/拖入的行为**一字不变**。

**Non-Goals:**

- 不做视频（`proposal.md` 的「不在本次范围」已明确；用户最初的描述里提到视频，本次收窄到图片）。
- 不解析 `text/html` 里的 `<img>`。
- 不下载远程图片转存。
- 不改上传接口的体积上限与格式白名单。
- 不修复历史文章里已存在的本地路径。

## Decisions

### D1 匹配用「文件名」，不试图还原目录结构

```ts
// 引用 ![alt](./images/a.png)  →  参与匹配的 key 是 "a.png"
// 引用 ![alt](../assets/b.jpg) →  参与匹配的 key 是 "b.jpg"
```

- **为什么**：`<input type="file" multiple>` 给到的 `File` 对象**只有 `name`，没有相对路径**；
  只有拖文件夹（`webkitRelativePath`）才有。而 `webkitRelativePath` 在"多选文件"场景下是空串，
  两种入口拿到的信息不对等。
- 统一用「路径最后一段」作匹配 key，两种入口都能工作，用户也不必关心目录怎么写。
- **代价**：两个不同目录下有同名 `a.png` 时会歧义。**处理**：按文件在本次选择顺序取第一个命中，
  并在结果里说明"有 N 个同名文件，取用了第一个"。个人博客规模下这比"要求用户保证唯一"更实用。

### D2 匹配与改写是纯函数，放在 `lib/asset-localize.ts`

```ts
export type LocalRef = { raw: string; target: string; start: number; end: number };
export function findLocalImageRefs(markdown: string): LocalRef[];
export function rewriteRefs(markdown: string, mapping: Map<string, string>): {
  content: string;
  replaced: number;
  unmatched: string[];
};
```

- `findLocalImageRefs` 只找，不上传；`rewriteRefs` 只改字符串，不联网。两者都纯，好测。
- 正则要**排除三类**：`http(s)://`、`data:`、以 `#` 开头的锚点——与现有 `applyImport` 里那段
  `(?!https?:\/\/|data:|#)` 的正则保持一致（同一个判据不该有两套写法）。
- 用 `start/end` 记录位置，`rewriteRefs` 从后往前替换，避免前面的替换把后面的下标冲掉。

### D3 上传放在确认条**之后**，不是之前

```
解析文档 → 找出本地引用 → 若编辑器已有内容：
    弹确认条（显示"将上传 N 张图片，M 处无法处理"）
    → 用户选替换/追加 → 才真正上传 → 上传完 → 写入正文
```

- **为什么不在解析后立刻上传**：用户可能只是想看看这份文档写了什么，选「取消」就不该已经在
  OSS 里留下 8 个对象。上传是不可撤销的副作用，要等到用户真正决定覆盖正文时再做。
- **为什么摘要能先算出来**：匹配只需要「文档里的引用」+「已选文件的文件名」两份信息，都是本地的，
  不需要先上传才知道"能匹配几张"。
- **代价**：点「替换」之后要等上传完成才看到正文变化。所以需要 D5 的进度反馈。

### D4 原子性：先全部上传成功，再一次性改写

```
1. 对匹配到的每张图调用 /api/upload（并发上限 4，避免一次打太多）
2. 收集 Map<文件名, 站内地址>；失败的记入 failures
3. 用 successes 构造 mapping 调用 rewriteRefs
4. rewriteRefs 的结果 + 失败的引用原样保留 → 写入正文
```

- 单张失败**不阻断整体**（spec 的「单张失败」场景），失败的那处引用因为没进 mapping 而保持原样。
- 全部失败时 mapping 为空，`rewriteRefs` 返回原字符串 + 全部 unmatched——正文等同原文。
- **不做**"失败就整体回滚"：已经传成功的图留在 OSS 里不是问题（内容寻址，下次导入还能命中），
  而整体回滚需要删除 OSS 对象，风险（删错）大于收益。

### D5 进度与并发

- 并发上限 4：一张 3MB 的图在慢网下可能要几秒，8 张串行会让「点了替换没反应」长达十几秒。
- 进度用已有的 `setHint` 通道显示 `正在上传 3/8…`，结束时清空并转为结果提示。
- 上传期间禁用导入控件，防止重复触发（spec 的「处理结束」场景要求恢复可用）。

### D6 两种入口的差异处理

| 入口 | `File.name` | `webkitRelativePath` |
|---|---|---|
| `<input multiple>` 多选 | 有 | 空串 |
| 拖入文件夹 | 有 | `folder/sub/a.png` |

- 匹配一律用 `name`（D1），所以两种入口共用一条路径，**不需要分支**。
- 拖入时用 `webkitRelativePath` 只是为了在结果提示里显示更完整的来源，不影响匹配。

### D7 删按钮的清理范围

删掉：`imageFileRef`、工具栏那个 `<button>` 与其 `<input type="file">`、`imageBusy` 的按钮文案分支。
保留：`handleImageFiles`（粘贴/拖入还在用）、`onEditorPaste`、`onEditorDrop`。

- `imageBusy` 仍需要——拖入多张图时也要显示进行中（它现在同时服务粘贴与拖入）。
- 按钮删了之后，`insertBlock` 仍被 `handleImageFiles` 与工具栏其他按钮使用，不能一起删。

## Risks / Trade-offs

- **[同名文件歧义]** → 取第一个命中并在结果里说明（D1）。
- **[上传慢导致"没反应"]** → 进度提示 + 并发 4 + 上传期禁用控件（D5）。
- **[原子性被误解为实现级事务]** → 明确不做 OSS 回滚（D4），风险与收益已在决策里写明。
- **[正文被误改]** → `rewriteRefs` 只替换图片语法里括号内的地址，不动 `alt` 与周围文本（spec 已要求）；
  单测用"替代文字含括号/中文/空格"的用例覆盖。
- **[现有 `markdown-import` 的原子性要求]** → 那条要求讲的是"解析失败不能留下部分写入"，
  本次的流程仍然是"解析成功后才有写入"，并且写入是一次性的 setState，不破坏它。
- **[1MB 的 md 限制]** → 文档本身的限制不变；图片走的是上传通道，不占这个额度。
- **[循环依赖风险]** → `lib/asset-localize.ts` 不 import `PostEditor` 或 `markdown-import`，
  只做字符串处理，避免把纯函数层绑到组件上。

## Migration Plan

纯前端改动，无数据模型与接口变化：

1. 先加 `lib/asset-localize.ts` 与单测（不影响任何现有行为）。
2. 改导入入口为多选 + 资源本地化流程（旧路径保留到新路径验证通过）。
3. 删工具栏按钮与 `imageFileRef`，确认粘贴/拖入不受影响。
4. **回滚**：恢复按钮与其 `input` 即可；`asset-localize.ts` 留着无害（不被引用即死代码）。

## Open Questions

- 并发上限具体取 2 / 4 / 8。取决于真实网络下面包屑式进度的手感，实现后用多图实测再定，
  不影响 spec、方案与任务拆分。