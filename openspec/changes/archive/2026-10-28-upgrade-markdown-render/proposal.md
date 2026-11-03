# Proposal

## Why

文章详情页的 Markdown 目前只有 `react-markdown` + `remark-gfm`：代码块无语法高亮、标题无锚点、外链无区分、单换行不断行。开发向博客的内容主体是代码，渲染质量直接决定阅读体验；用 remark/rehype 生态的第三方插件把渲染流水线补齐。

## What Changes

- 新增统一 Markdown 渲染组件 `components/Markdown.tsx`：`react-markdown` + 插件管线
  `remark-gfm` → `remark-breaks` → `rehype-slug` → `rehype-autolink-headings` → `rehype-external-links` → `rehype-highlight`
- 终端风代码卡：自定义 `pre`/`code` 组件（顶栏：语言标签 + 复制按钮，复制按钮为客户端组件），与赛博朋克主题一致
- `.prose` 代码区 CSS：引入 `highlight.js` 深色主题并覆盖为霓虹青/品红色板
- 文章详情页（`app/posts/[slug]/page.tsx`）改用该组件；后台编辑器的 Markdown 预览（如有）复用同一管线
- 标题自动生成 id 与锚点（悬停显示 "#"，点击复制）；外链 `target="_blank"` 并加视觉标记
- 不改变 API 与数据模型；不引入公式（katex）与 mermaid，留作后续可选

## Capabilities

### New Capabilities

- `markdown-render`：博客如何渲染与呈现 Markdown 内容——插件管线、代码卡交互（复制按钮）、标题锚点、外链行为

### Modified Capabilities

（无——项目尚无既有 spec）

## Impact

- **依赖**：新增 `rehype-highlight`（自带 highlight.js）、`rehype-slug`、`rehype-autolink-headings`、`rehype-external-links`、`remark-breaks`。bundle 预计 +~40KB；高亮在 SSR 完成，基本不增加客户端 JS（仅复制按钮为客户端组件）
- **代码**：`app/posts/[slug]/page.tsx`、`components/Markdown.tsx`（新）、`components/CodeBlock.tsx`（新）、`app/globals.css`（代码卡 + 高亮主题）
- **安装**：`npm install` 由用户在本地终端执行（沙箱无法完成带网络依赖的安装），装完重启 dev 生效
- **风险**：`rehype-highlight` 对未知语言会静默跳过高亮（不报错）；旧文章无语言标记的围栏代码块不加 `language-*` 时不高亮，属预期行为
