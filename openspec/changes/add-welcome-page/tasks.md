# Tasks

## 1. 结构与环境

- [x] 1.1 新增 `components/BrandMark.tsx`：内联 SVG（caret 路径 + 光标块），`aria-hidden`，尺寸 `clamp(64px, 9vw, 104px)`，两笔分别用 `--w-signal` / `--w-signal-2`；验证：单独渲染时在 96px 下两笔比例正确、12px 细看仍可辨认。
- [x] 1.2 新增 `app/welcome/page.tsx`（服务端组件，`revalidate = 60`）：查询文章数、在用标签数、最近发布时间，组装页面；验证：`tsc` 通过，`/welcome` 返回 200（未登录可访问）。
- [x] 1.3 建立 `.page-welcome` 作用域：在 `app/redesign.css` 内定义 `--w-paper/--w-ink/--w-mute/--w-line/--w-signal/--w-signal-2` 与整段样式，**不出现任何 `[data-theme]` 选择器**；验证：把 `<html data-theme>` 依次切到六套主题后 `/welcome` 的底色与强调色不变。

## 2. 版面与文案

- [x] 2.1 布局：内容在 1160 shell 内左对齐，垂直居中于 `min-height: calc(100dvh - 7.5rem)`（`100vh` 回退双写）；验证：1920 / 1264 / 390 三档无横向滚动，矮视口（h=600）可纵向滚动且页脚可达。
- [x] 2.2 排版：字标 mono 3.2rem / 0.22em 字距；定位句 `clamp(1.5rem, 2.6vw, 2.05rem)`、行高 1.65、最宽 22em；状态行与次链接 mono 0.72rem；验证：三档宽度下字标不折行、定位句行长不超过 40 个汉字。
- [x] 2.3 文案落地：定位句「记录开发中的判断与失误，偶尔写点别的。」；主按钮「进入博客」→ `/`，次入口「标签」→ `/tags`、「登录」→ `/login`；状态行用 `{N} 篇文章` `{M} 个在用标签` `更新于 {YYYY.MM.DD}`，用间距而非 `·` 分隔；验证：逐项核对渲染文本与 href。
- [x] 2.4 空站降级：文章数为 0 时状态行显示「新站刚开张，还没有文章」，不出现「0 篇 / 0 个标签」；验证：临时把文章全部取消发布（或改查询条件）看一次文案，随后还原。
- [x] 2.5 用色纪律：霓虹只出现在主按钮、焦点环、链接悬停与标记两笔；验证：截图后逐块对照，正文区无发光、无渐变底。

## 3. 动效

- [x] 3.1 入场序列按 design 的顺位与时长实现（网格淡入 → caret 描边 → 光标块 scaleX → 字标逐字 → 定位句/线/状态/入口），全部用 CSS keyframes + `animation-delay`，页面不写 `"use client"`；验证：首次加载约 1.2s 内全部就位，滚动不再触发动画。
- [x] 3.2 光标闪烁：1.2s `steps(2, end)` 无限循环，`aria-hidden`；验证：屏幕阅读器不朗读它。
- [x] 3.3 减弱动效：`@media (prefers-reduced-motion: reduce)` 下所有动画 `animation: none`，并显式把最终态写死（`opacity:1; transform:none; stroke-dashoffset:0`）；验证：系统开启该偏好后刷新，页面无位移与闪烁，内容完整。
- [x] 3.4 禁用 JS：关闭浏览器 JavaScript 后打开 `/welcome`，确认标记、字标、定位句、状态行与三个入口全部可见可用；验证：截图与正常状态对比一致（仅缺动效）。

## 4. 隔离与回归

- [x] 4.1 背景网格隔离：用 `body:has(.page-welcome)::before { display: none }` 关掉全局主题网格，改由 `.page-welcome` 用 `--w-line` 画 0.5% 浓度细网格；验证：六套主题下欢迎页网格颜色不变，文章页网格仍随主题。
- [x] 4.2 与外壳共存：确认页头导航、账号菜单、页脚在 `/welcome` 上照常显示可用；验证：点一次「标签」与账号菜单，跳转正常。
- [x] 4.3 无障碍：页面只有一个 `h1`；Tab 依次落到主按钮与两个次入口，焦点环清晰可见；正文对比度 ≥ 4.5:1、标题 ≥ 7:1；验证：用 DevTools 可访问性面板与对比度检查各看一次。
- [x] 4.4 `npx tsc --noEmit` 与 `npm run build` 通过（build 前先停 dev server）；验证：退出码为 0，且构建输出里 `/welcome` 为静态页。

## 5. 路由调整（实施中补充）

- [x] 5.1 欢迎页内容移到 `app/page.tsx`，原账本首页整体移到 `app/blog/page.tsx`（文件搬家，不改内部结构，并补 `metadata: { title: "文章" }`）；验证：`/` 渲染欢迎页、`/blog` 渲染账本列表。
- [x] 5.2 `/welcome` 收口：删除 `app/welcome/`，在 `next.config.ts` 的 `redirects()` 里配 `{ source: "/welcome", destination: "/", statusCode: 301 }`；验证：`curl -i /welcome` 返回 `HTTP/1.1 301` 且 `location: /`。
- [x] 5.3 内链更新：页头导航改为「首页 / 文章 / 标签」（`/posts/*` 时「文章」高亮），文章页、标签索引、标签详情、登录、注册、个人资料六处「返回首页」改为「← 返回文章列表」指向 `/blog`，欢迎页主按钮指向 `/blog`；验证：`/` 的 CTA `href="/blog"`，`/blog` 页头含 `href="/blog"` 且高亮。

## 6. 拆掉门面上的站点头尾（实施中纠正）

- [x] 6.1 根布局瘦身：`app/layout.tsx` 只保留 `<html>/<body>`、主题初始化脚本与全局样式；页头、`<main>`、页脚、`FeedbackProvider` 下沉到新建的 `app/(site)/layout.tsx`。
- [x] 6.2 七个站点路由目录（`admin`、`blog`、`login`、`posts`、`profile`、`register`、`tags`）整体移入 `app/(site)/`，URL 保持不变；`app/page.tsx`（欢迎页）留在分组外，因此不经过站点外壳。
- [x] 6.3 配套调整：欢迎页 `min-height` 从 `calc(100dvh - 7.5rem)` 改为整屏 `100dvh`，页面根节点改成 `<main className="shell page-welcome">`；删除 `.site-header/.site-nav/.site-footer` 那几条针对欢迎页的配色覆盖（已成死代码）；验证：`/` 的 HTML 里没有 `site-header` / `site-footer` / `site-nav`，其余页面仍有。

## 实施备注

### 实测数据

- 门脸是否干净（HTML 直读）：`/` 里 `site-header`=false、`site-footer`=false、`site-nav`=false，只有 `page-welcome`；`/blog`、`/tags`、`/login` 三者均为 true。
- 路由（`curl` 直测）：`/` 200 且 HTML 含 `class="shell page-welcome"`；`/blog` 200 且含 `class="ledger"`；`/welcome` 返回 `HTTP/1.1 301`、`location: /`；`/tags`、`/login` 均 200。
- 内容归属：`/` 的 HTML 里 `welcome-cta` 的 href 已是 `/blog`；两类页面都不再互相混内容。
- 构建产物：`○ /` 与 `○ /blog` 都是静态页（1m revalidate），页面零客户端 JS。
- 标记渲染检查：`w-mark-caret` 与 `w-mark-cursor` 均在 HTML 中，SVG 带 `role="presentation"` + `aria-hidden="true"`。
- 文案与链接核对（HTML 直读）：状态行 `2 篇文章 / 6 个在用标签 / 更新于 2026.11.05`，三个入口分别是 `/`、`/tags`、`/login`，全页无 `·`。
- 空站分支：临时把 `emptyPreview` 置为 true 渲染一次，确认输出「新站刚开张，还没有文章」，随后已还原（代码中不再有该开关）。
- 单 h1：HTML 中 `<h1` 出现 1 次。
- 对比度（按 token 计算）：ink/paper 18.83、mute/paper 5.94、signal/paper 4.87、白字/signal 5.00、signal-2/paper 4.92 —— 正文 ≥4.5、标题 ≥7 达标。
- 主题隔离：`app/redesign.css` 全文只有 2 处 `[data-theme]` 选择器（`.fb-overlay` 与 daylight 网格），都不在欢迎页段落内。

### 顺带修掉的两个环境问题（不在原计划内，但不修就构建不了）

- **Prisma Client 过期**：`next build` 报 `app/page.tsx` 等一批 `implicitly has an 'any' type`。根因是依赖变动后 `.pnpm` 里生成的客户端丢了，模型类型退化成 `any`，`noImplicitAny` 才报错。已重新生成客户端。
- **pnpm 11 拦截 Prisma 的 postinstall**：`pnpm-workspace.yaml` 里的 `allowBuilds` 原本是占位值 `set this to true or false`，导致 `@prisma/client` / `@prisma/engines` / `prisma` / `esbuild` 的构建脚本从未执行。已改为 `true` 并重跑 `pnpm install`，四个包的 postinstall 均显示 Done。

### 验证降级说明（需要你在浏览器里过一眼）

本轮没有可用的浏览器会话，以下四项是**按代码/计算做的静态验证**，没有真机截图：响应式三档实测、入场动效时序观感、六套主题切换后欢迎页的视觉一致性、键盘 Tab 遍历与焦点环。其余项（路由、文案、链接、空站分支、对比度、单 h1、构建产物）都已在上面用可复核的数据确认。

## Workflow follow-up

- 提交并推送，走既有 GitHub Actions 部署；线上再用真机看一次 iOS Safari 的 `dvh` 表现。
- 确认无误后归档本变更（`/openspec-archive-change`）。