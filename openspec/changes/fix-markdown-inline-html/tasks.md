# Tasks

## 1. 依赖与渲染管线

- [x] 1.1 安装 `rehype-raw` 与 `rehype-sanitize`（两者必须同一个提交里进入，不允许只装 raw）。验证：`package.json` 里两个都在；`pnpm list rehype-raw rehype-sanitize` 均能列出。
- [x] 1.2 在 `components/Markdown.tsx` 定义 `sanitizeSchema`：在 `defaultSchema` 基础上放行展示性标签与 `className`，剥离所有 `on*` 事件与 `style`，限制 `href`/`src` 协议。验证：schema 里有 `className` 白名单；不含任何 `on*` 条目。
- [x] 1.3 接入插件：`rehypePlugins` 追加 `rehypeRaw` 与 `[rehypeSanitize, sanitizeSchema]`，且 raw 在 sanitize 之前（sanitize 必须在 highlight 之后仍能保留 `hljs`/`language-*` 类）。验证：`tsc` 通过；渲染含 `<font style>` 的样本时显示干净文字。
- [x] 1.4 回归既有行为：外链仍带 `target="_blank"` + `rel="noopener noreferrer"`，图片仍走 `toSiteImageUrl` 与懒加载，代码块仍有 `hljs` 类与语言标签。验证：用一篇含外链、图片、代码块的文章在页面里逐项断言。

## 2. 安全过滤

- [x] 2.1 注入样本验证：构造含 `<script>alert(1)</script>`、`<img src=x onerror=alert(1)>`、`<a href="javascript:alert(1)">` 的正文，确认渲染结果里脚本不执行、`onerror` 与 `javascript:` 被移除。验证：在页面 DOM 中断言不含 `script` 节点、不含 `onerror` 属性、`href` 非 `javascript:`。
- [x] 2.2 确认清洗没有过度：`<table>`、`<sup>`、`<br>`、`<mark>` 等展示性标签仍正常渲染。验证：构造样本并断言这些元素出现在 DOM 里。

## 3. 代码块禁区

- [x] 3.1 用库里真实样本回归：`第1节\. LangChain核心组件` 里代码块内的 `<class 'langchain_deepseek.chat_models.ChatDeepSeek'>` 必须原样显示、不被剥离。验证：页面渲染后该文本完整出现在 `code` 元素内。
- [x] 3.2 构造新的对抗样本：代码块里写 `<div>`、`<script>`、行内代码里写 `<span>`，确认它们都作为文本显示。验证：断言这些字符出现在 `pre code` 的文本内容中。

## 4. 导入时规整

- [x] 4.1 在 `lib/markdown-import.ts` 新增 `normalizeInlineHtml(body: string): string`：按行扫描并跟踪 fenced code 状态，跳过代码块与行内代码；把 `<font ...>x</font>`、无其他属性的 `<span style="...">x</span>` 还原为 `x`；`<br>`/`<br/>` 转成换行；其余 HTML 原样保留。验证：单测覆盖「font 包裹」「span 包裹」「br」「代码块内不动」「行内代码内不动」「纯 Markdown 完全不变」六种情况。
- [x] 4.2 在 `parseMarkdownDocument` 的正文收尾处调用该函数。验证：导入一份带 `<font>` 的文件后，`body` 里不再有 `font` 标签；导入一份无 HTML 的文件，返回结果与改动前逐字节一致（用同一份样本对比前后输出）。

## 5. 标题与目录

- [x] 5.1 验证目录随渲染修好：标题写成 `## <font style="...">actions.js</font> 的用法` 时，正文标题与目录项都显示「actions.js 的用法」，不含 `<font`。验证：在真实页面里断言 `.prose h2` 的文本与目录项文本都不含尖括号。
- [x] 5.2 确认 `.heading-anchor` 仍被剔除出目录文本（既有行为不回归）。验证：目录项文本不含 `#`。

## 6. 存量清洗

- [x] 6.1 新增 `scripts/clean-post-html.ts`：逐篇扫描正文，报告标签种类与处数、变更前后字符数、前若干处上下文；默认 dry-run 不写库；`--write` 才写回，且只更新确有变化的文章。验证：dry-run 后数据库 `updatedAt` 不变；`--write` 后报告更新篇数且与 dry-run 列出的受影响篇数一致。
- [x] 6.2 对当前库跑一次 dry-run，人工确认差异合理（当前 2 篇文章预期只识别到代码块内的 `<class '...'>`，且**不应**被清洗）。验证：dry-run 输出显示代码块内容被跳过，受影响篇数为 0 或仅报告不改。
- [x] 6.3 如需写回，先导出受影响文章的正文备份再执行 `--write`。验证：备份文件存在且包含原正文；写回后页面显示正常。

## 7. 集成验证与文档

- [x] 7.1 `npx tsc --noEmit` 与 `pnpm build` 通过。
- [x] 7.2 真实浏览器端到端：导入一篇带 `<font style>` 的 Markdown → 文章页显示干净文字、目录正常、代码块内容不丢；后台预览与前台显示一致。验证：截图 + DOM 断言。
- [x] 7.3 更新 `docs/DEVELOPMENT.md`：在 Markdown 渲染一节补充「为什么开 raw、为什么必须配 sanitize、白名单范围、代码块禁区」；在导入一节补充规整行为；在脚本清单里登记 `clean-post-html.ts`。验证：按文档能定位到 `Markdown.tsx` 的 schema 与 `markdown-import.ts` 的规整函数。

## Workflow follow-up

- 通过评审后归档本变更（`/openspec-archive-change`），把 `markdown-rendering` 同步进 `openspec/specs/`。
- 归档时复核「不在本次范围」里那条 `<style>` 内联块的决定是否仍成立。