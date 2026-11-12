# Proposal

## Why

从网页复制内容再粘进 Markdown 时，剪贴板里往往带着内联 HTML：

```html
<font style="color:rgb(79, 79, 79);background-color:rgb(238, 240, 244);">actions.js</font>
```

导入后这些标签被原样显示成文字——读者看到的是 `<font style="color:rgb(...)">actionTypes.js</font>`，
不是本该出现的 `actionTypes.js`。同样的问题会污染标题：目录里出现一整条被样式属性撑长的乱码项，
正文里也看不到应有的层级。

**根因**：渲染管线没有开启 HTML 支持。`components/Markdown.tsx` 用的是 `react-markdown`，
它默认把原始 HTML 当作纯文本转义输出；而导入链路（`lib/markdown-import.ts`）对正文完全不做处理，
原样透传。两边都不管，标签就只能作为文字露出来。

让作者手工删掉每一处标签既不现实（长文里几十上百处），也容易漏.

## What Changes

- **渲染层开启 HTML**：接入 `rehype-raw`，让正文里的内联 HTML 按 HTML 渲染
  （`<font>` 这类展示性标签恢复成正常文字，表格 / 上标 / 换行等复制来的结构也能保住）。
- **同时接入 `rehype-sanitize`**：`rehype-raw` 会把 HTML 当代码执行，页面里会出现
  `<script>`、`onerror=` 这类注入面。**开启 raw 必须配 sanitize，两者是一个决定，不是两个。**
  白名单按「展示性标签」裁剪，去掉脚本类、事件属性、`javascript:` 协议。
- **导入时清洗**：`lib/markdown-import.ts` 增加一步 HTML 规整，把复制带来的
  无意义包裹（如只有样式的 `<font>`）就地转成纯文本或等价的 Markdown，
  避免把一整包编辑器脏标签存进数据库。
- **存量数据清洗脚本**：扫已存文章，报告哪些含 HTML、各自多少处、是什么标签，
  支持 `--dry-run` 预览差异后再写回。
- **目录（TOC）不受污染**：标题文本里若含标签，目录项要显示干净的标题。

## Capabilities

### New Capabilities

- `markdown-rendering`: Markdown 渲染管线对「正文里可能含有内联 HTML」这一事实的契约 ——
  渲染什么、过滤掉什么、标题与目录如何取纯文本、导入时如何规整。

## Impact

- **代码**：
  - `components/Markdown.tsx`：`rehypePlugins` 增加 `rehypeRaw` 与 `rehypeSanitize`（顺序：raw 在 sanitize 之前）。
  - `lib/markdown-import.ts`：新增 HTML 规整逻辑（纯函数，浏览器与 Node 都能用）。
  - `components/blog/PostOutline.tsx`：标题取文本时剥掉残留标签。
  - 新增 `scripts/clean-post-html.ts`：存量清洗，带 `--dry-run`。
- **依赖**：新增 `rehype-raw`、`rehype-sanitize`（以及它们的传递依赖 `hast-util-sanitize`、
  `parse5` 等）。这是本次唯一的体积代价。
- **数据**：改的是文章正文文本，需要一次「先 dry-run 看差异、再写回」的操作；
  不涉及表结构。
- **风险**：
  - **XSS**：`rehype-raw` 不配 sanitize 就是漏洞。虽然文章写入需要管理员权限，
    但管理员账号被盗 / 误粘贴恶意内容仍会执行脚本，所以 sanitize 是硬要求。
  - **过度清洗**：白名单太严会把复制来的合法排版（表格、`<sup>`、`<br>`）也打掉；
    太松则留下注入面。需要在 design 里明确白名单范围并用真实样本验证。
  - **清洗破坏代码块**：代码块里出现 `<class '...'>`（Python 类型输出的常见写法）是
    **合法代码内容**，绝不能被当 HTML 处理。清洗必须跳过 fenced code 与行内代码。
  - **存量写回不可逆**：脚本必须默认 dry-run，写回前展示差异。
- **验证口径**：含 `<font>` 的样本在页面上显示为干净文字、目录项正常、代码块里的
  `<class ...>` 原样保留、`<script>` 与 `onerror` 被剥离、`tsc` 与 `build` 通过。
- **不在本次范围**：把 HTML 转成等价 Markdown 的完整转换器（复杂结构仍保留为 HTML，
  由 sanitize 白名单约束）；Word/PDF 粘贴的特殊结构；富文本编辑器。
