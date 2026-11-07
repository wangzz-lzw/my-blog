# Tasks

## 1. 大纲组件（标题采集与渲染）

- [x] 1.1 新建 `components/blog/PostOutline.tsx`（客户端组件）：按文档顺序采集 `.prose h2[id], .prose h3[id]`，条目文本取标题的纯文本并剔除 `.heading-anchor` 的 `#`。验证：在一篇「h2 → h3 → h3 → h2」的文章上，DOM 里大纲条目顺序、层级、文本与正文标题逐条一致（可用 `document.querySelectorAll` 打印比对）。
- [x] 1.2 加入出现门槛：`matchMedia("(min-width: 1280px)")` 为真且条目标题数 ≥ 2 才构建列表，并监听该查询的 `change` 事件在跨断点时同步增删；`body.immersive` 下隐藏。验证：1279px 与 1280px 两档切换时列表节点随之出现/移除；只有 1 个标题的文章在任何宽度都不出现；进入沉浸阅读后大纲消失、退出后恢复。
- [x] 1.3 无脚本与首帧：确认组件不产生任何静态 DOM（默认不渲染节点，只在测量后插入），因此禁用 JS 时页面上没有空栏、没有多余边框。验证：浏览器禁用 JS 打开文章页，与改动前的截图对比正文位置与宽度一致。

## 2. 布局与视觉

- [x] 2.1 在 `app/redesign.css` 新增「文章大纲」小节：`.article-shell` 加 `position: relative`，`.article-rail` 绝对定位到 `right: 100%` + `margin-right: 28px`、宽 172px、`top: 0; bottom: 0`，内层 `.article-rail-inner` 用 `position: sticky; top: 84px; max-height: calc(100dvh - 116px)`。验证：改动前后各记录一次 `.prose` 第一条段落的 `getBoundingClientRect().left`，两个数必须相同；在大纲出现/消失的两种状态下也该相同。
- [x] 2.2 写视觉样式：等宽序号（h2 一级 `01`、h3 二级 `02.1`）、h3 缩进 1.1em、字号 0.72rem / 0.68rem、当前项左缘 2px 竖线与 `--accent`、未选中 `--ink-3`、悬停 `--fg`，全部只用现有 token。验证：`grep` 确认该小节内没有硬编码十六进制色值；六套主题（含 `daylight`）逐个切换，对比度与语法高亮区不互斥。
- [x] 2.3 大纲自身溢出时改用 `components/ui/ScrollArea.tsx`（`axis="y"`、`autoHide="leave"`），并给 host 加 `overscroll-behavior: contain`。验证：造一篇 40 个标题的文章，在大纲内滚到底后继续滚轮，页面滚动位置（`currentScrollPane().scrollTop`）不变；触屏模拟（`hover: none`）下大纲内滚动退化为原生且不报错。

## 3. 跳转与地址栏

- [x] 3.1 实现条目点击跳转：按缓存的标题位置 `pane.scrollTo({ top: top_i - 85 })`，落点保证标题不被页头遮挡。验证：逐个点击每个条目，实测目标标题 `getBoundingClientRect().top` ≥ 61（页头高度），且标题完整可见。
- [x] 3.2 跳转后 `history.replaceState` 写入 `#` + `encodeURIComponent(id)`（中文标题同样可用）。验证：点 3 个不同条目后 `history.length` 不变；把地址栏 URL 复制到新标签页打开，页面直达该节且该条目已是当前态。
- [x] 3.3 键盘与焦点：条目为可聚焦的 `a`/`button`，Enter 与点击行为一致；跳转后给目标标题 `tabIndex = -1` 并 `focus({ preventScroll: true })`。验证：只用键盘 Tab 到条目、Enter 跳转后 `document.activeElement` 是该标题；屏幕阅读器（或无障碍树检查）能读出「文章大纲」区域名与 `aria-current`。
- [x] 3.4 `prefers-reduced-motion: reduce` 时跳转改为瞬时（`behavior: "auto"`）。验证：系统开启减少动效后用 DevTools 覆盖该媒体特性，点击条目为瞬移、无滚动动画。

## 4. 滚动联动（当前节）

- [x] 4.1 实现定位缓存与单次布局读取：挂载首帧、`window.resize`、`ResizeObserver(观察 .prose)` 三种时机重测 `top_i`（`rect.top - paneRect.top + pane.scrollTop`）；滚动回调只做比较，用 rAF 合并一帧一次。验证：Performance 面板录制整页滚动，滚动期间无每帧重复的 layout 长任务（与改动前对比无新增 >50ms 任务）；代码里确认滚动回调内没有 `getBoundingClientRect`。
- [x] 4.2 当前项判定与状态写入：取 `top_i ≤ scrollTop + 85` 中最后一个，写 `data-active` 与 `aria-current="location"`（其余移除），不触发 React 重渲染。验证：滚动时任意时刻至多一个条目为当前态；用 React DevTools 的 highlight updates 确认滚动过程不重渲染组件树。
- [x] 4.3 处理两个边界：文首未到第一个标题时无当前项；`scrollTop + clientHeight ≥ scrollHeight - 2` 时强制当前项为最后一个。验证：页面滚到顶时无任何高亮；滚到最底时最后一条保持高亮，不闪回上一条。
- [x] 4.4 内容高度变化的跟随：正文图片懒加载完成后高亮仍指向屏幕上真实在读的一节。验证：打开一篇多图长文，滚到第 3 节后让其后图片加载完成（限速网络或滚动触发），高亮不跳错节。

## 5. 集成验证

- [x] 5.1 `npx tsc --noEmit` 与 `pnpm build` 均通过（构建输出无关于该组件的告警）；改完 `pnpm dev` 重启一次确认无旧 chunk 残留。
- [x] 5.2 真实浏览器全量核对：≥1280px 出现 / <1280px 不出现 / 单标题文章不出现 / 沉浸读模式隐藏 / 打印（`@media print`）时大纲不出现也不破坏分页；并确认文章页以外的页面（`/blog`、`/tags`、`/admin`）样式无回归。
- [x] 5.3 更新 `docs/DEVELOPMENT.md`：在滚动体系一节补一段「文章大纲也是 sticky + 自绘滚动」，并在页面清单里标注 `/posts/[slug]` 新增左侧大纲。验证：文档中描述的行为与实际一致（按文档步骤能复现断点与阈值）。

## Workflow follow-up

- 通过评审后归档本变更（`/openspec-archive-change`），把 `post-outline` 同步进 `openspec/specs/`。
- 归档后复核 `docs/DEVELOPMENT.md` 与 README 是否仍准确。