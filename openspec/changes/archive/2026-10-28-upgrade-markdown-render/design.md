# Design

## Context

- 现状：`app/posts/[slug]/page.tsx` 直接渲染 `<ReactMarkdown remarkPlugins={[remarkGfm]}>`，无高亮、无锚点、外链无区分。
- 约束：Next 16 App Router + React 19；文章页为 ISR（`revalidate = 60`），管线必须 SSR 安全；页面已有 `.prose` 样式块与赛博朋克色板（`--accent` 青 / `--accent-2` 品红）。
- 本地终端可装包；沙箱不能代跑 `npm install`。

## Goals / Non-Goals

**Goals:**
- 一条可复用的渲染管线（文章页 + 后台预览同源），高亮在 SSR 完成
- 代码卡交互（复制）与赛博主题视觉统一
- 改动面小：详情页换组件 + 新组件 + CSS，不动数据模型与 API

**Non-Goals:**
- 公式（katex）、mermaid、图片懒加载优化、TOC 侧栏——本期不做
- 不改变 Markdown 源码存储格式（仍是纯 Markdown 文本）

## Decisions

1. **插件选 rehype-highlight（highlight.js）而非 shiki / react-syntax-highlighter**
   - highlight.js：纯 CSS 类方案，SSR 出 HTML 即带 class，客户端零 JS；theme CSS 可整体覆盖为霓虹色板；bundle 约 +40KB
   - 备选 shiki（效果最接近 VSCode）：需要按语言生成内联样式，SSR 首包大、构建慢，对博客过重；react-syntax-highlighter：组件级渲染，与 react-markdown 的 components 映射冲突多。→ 选 highlight.js
   - 仅注册常用语言（js/ts/tsx/py/bash/json/css/html/xml/yaml/sql/dockerfile/jsonc 等）控制体积；未知语言 highlight.js 静默跳过（满足 spec「无语言不报错」）

2. **管线统一封装在 `components/Markdown.tsx`（服务端组件）**
   - `remarkPlugins=[gfm, breaks]`，`rehypePlugins=[slug, autolinkHeadings({properties:{class:'heading-anchor',...}}), externalLinks({target:'_blank', rel:['noopener','noreferrer']}), highlight({ignoreMissing:true, languagePrefix:'hljs-'}))]`
   - 顺序关键：`slug` 必须在 `autolinkHeadings` 之前；`externalLinks` 在 rehype 阶段晚于 slug 不影响
   - `components={{ pre: CodeBlock, a: 外链包装, code: 行内代码样式 }}`
   - 备选：管线内联在详情页 → 后台预览将来要复制一遍管线，违背 spec「渲染入口一致性」。→ 抽组件

3. **复制按钮 = 客户端小组件 `components/CodeBlock.tsx` 内的按钮**
   - `navigator.clipboard.writeText`，失败降级 `execCommand` 路径 + 「请手动复制」提示；按钮态 1.5s「已复制 ✓」
   - 代码块外观：终端窗口卡——顶栏 `~/<lang>` + 复制按钮，边框切角 + 品红左边线（与 `.prose pre` 现有风格一致但升级为窗口卡）
   - 备选：全局 tailwind-code 类方案 → 无 tailwind，弃

4. **主题：不 import 现成 highlight.js 深色 theme，直接写覆盖**
   - 现成 theme（atom-one-dark 等）色板与赛博霓虹不搭；在 globals.css 用 `.hljs-*` 类覆盖约 10 个 token 角色（keyword 青、string 品红、comment 灰蓝、function 亮白…），高亮在 SSR 时已完成，theme 纯 CSS 无运行时依赖

## Risks / Trade-offs

- [bundle +~40KB] → 只注册常用语言；高亮类名方案无运行时 JS（复制按钮除外，~0.5KB）
- [旧文章围栏无语言标记 → 不高亮] → spec 已声明为预期；后台编辑可用 AI 摘要按钮旁的提示引导补语言标记（不做自动推断）
- [rehype-external-links 判断「站内」= 无 host 或 host === window.location.host] → 服务端渲染时 host 判断依赖运行环境 host，部署域名变化无需改代码；站内相对链接（/posts/…）天然不触发外链样式
- [highlight.js 对 JSX/TSX 支持有限] → 已知取舍，ts 语法覆盖 90% 场景；不满意可换 shiki（管线只换 rehype 插件，不影响 spec）

## Migration Plan

1. 本地 `npm i rehype-highlight rehype-slug rehype-autolink-headings rehype-external-links remark-breaks`（用户终端）
2. 代码上线：详情页换 `Markdown` 组件；旧文章无需迁移（纯渲染层变更）
3. 回滚：详情页切回裸 `ReactMarkdown`，依赖保留不影响

## Open Questions

- 后台编辑器当前若无 Markdown 预览，「渲染入口一致性」场景以文章页为唯一入口先验收；预览上线时复用 `Markdown.tsx` 即达标
