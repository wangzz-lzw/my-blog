# Design

## Context

动机见 `proposal.md`；契约见 `specs/post-outline/spec.md`。这里只记录实现必须依据的现状。

**文章页的布局底座**（`app/redesign.css`）：

- `.article-shell`：`max-width: 860px; margin: 0 auto; padding: 2.75rem 1.25rem 5rem`，单栏。
- `.post-header`：`grid-template-columns: var(--gutter) minmax(0, 1fr)`，`--gutter: 96px`，左列是日期块（`grid-row: 1 / span 3`）。
- `.prose`：`max-width: var(--measure)`（`34em`，约 544px），`font-size: 1.03rem; line-height: 1.95`；`h2` 1.35rem、`h3` 1.12rem。
- 结论：860 的壳里，正文实际只占左侧 96 + 544 ≈ 640px，**右侧有 200px 左右的常态空白**；壳外两侧各 (视口 − 860) / 2。

**标题从哪来**：`components/Markdown.tsx` 是服务端组件，管线里 `rehype-slug` 给每个标题生成 id（重名自动加后缀），`rehype-autolink-headings` 在标题内追加 `.heading-anchor`。文章标题是 `.prose` 之外的 `h1`，所以正文标题从 `h2` 开始。

**滚动**：document 不滚，整页滚动在 `#app-scroll` 的 OverlayScrollbars viewport 里；`lib/scroll-pane.ts` 的 `currentScrollPane()` 负责解析当前真正在滚的那一层，`paneScrollState()` / `onPaneScroll()` 是配套读法。触屏上库不接管，退化成 host 自身滚动。

**页头**：`.site-header` 是 `position: sticky; top: 0; z-index: 50`，`.site-header .container` 高度 60px，加 1px 下边框。

**可借鉴的既有写法**：`components/blog/ListScrollPane.tsx` 已经解决过同一类问题——滚动帧里只读一次布局、条目位置预缓存、状态全写 DOM 属性与 CSS 变量、不触发 React 重渲染；侧栏 `.rail` 也已经示范了「侧栏自己滚、不跟正文滚」。

## Goals / Non-Goals

**Goals:**

- 大纲落在正文左侧，读起来像「页边注」而不是另一张卡片；与站点的等宽体语言一致。
- 正文的位置在任何宽度下零位移（跨断点时也一样）。
- 与全站滚动体系同源：只用 `currentScrollPane()` 与 `ScrollArea`，不另造滚动状态。
- 每个 spec 场景都能用可量化的方式验证（rect、属性、地址栏）。

**Non-Goals:**

- 不改 `markdown-render` 管线，不重新解析 Markdown 取标题。
- 不做 h4、不做文内搜索、不做阅读百分比、不做折叠抽屉。
- 不引入新依赖，不改后台编辑器预览。
- 不做多篇文章的合并目录或站内全局导航。

## Decisions

### D1 标题来源：客户端扫描已渲染的 DOM

读 `.prose h2[id], .prose h3[id]`，按文档顺序建表；条目标题取 `textContent` 并剔掉 `.heading-anchor` 的 `#`。

- **为什么**：id 的唯一真相是 `rehype-slug`（内部是 github-slugger，重名要加 `-1` 后缀）。服务端再解析一遍就得复刻这套规则，一旦版本或配置变动就出现「大纲跳到一个不存在的 id」这种安静的错误。
- **代价**：无 JS 时没有大纲。spec 已把它定为增强导航（无脚本时不得出现空栏），因此可接受。
- **备选（否）**：服务端用 unified 再解析一次得到 headings 再传给客户端 —— 引入第二套 slug 实现，风险大于收益。

### D2 布局：借用左侧留白，不把壳改成两列

```
.article-shell { position: relative }                     /* 容器基准 */
.article-rail  { position: absolute; right: 100%;          /* 落在壳的左外侧 */
                 margin-right: 28px; width: 172px;
                 top: 0; bottom: 0 }                        /* 与正文等高，作为 sticky 的活动范围 */
.article-rail-inner { position: sticky; top: 84px;          /* 60px 页头 + 1px 边框 + 23px 呼吸 */
                      max-height: calc(100dvh - 116px) }
```

- **为什么**：只加宽壳会让正文整体右移，右侧空白也变多；而把大纲放进「左外边距」时，正文的排版上下文完全没变——`max-width`、居中方式、padding 全部不动，正文左缘像素级不变。
- **阈值**：宽 172 + 间距 28 = 200；壳 860 居中时左侧留白是 (W − 860) / 2，要留 10px 呼吸 → W ≥ 1280。这就是 spec 里 1280px 的来历。
- **实现后实测**：`.article-shell` 自带 `padding: 0 1.25rem`，而轨是相对壳的 padding box 定位的，所以正文到大纲的**视觉间距是 20 + 28 = 48px**（1280px 视口下轨左缘在 10px 处、不越界、不产生横向滚动）。
- **备选（否）**：`.article-shell` 改 `grid-template-columns: 180px minmax(0,1fr)` —— 正文在 1180–1308 区间右移约 68px，且右侧多出一块空白。
- **备选（否）**：把大纲做进 `.post-header` 的 96px 日期栏 —— 放不下，且会破坏「日期是时间轴」的语义。

### D3 大纲自身的滚动：内层再用一次 `ScrollArea`

`max-height` 触发溢出后，大纲内部用 `components/ui/ScrollArea.tsx`（与侧栏、代码块、列表同一套），并给 host 加 `overscroll-behavior: contain`。

- **为什么**：直接 `overflow: auto` 会让大纲里出现一根系统滚动条，和全站这套自绘条同屏并列，是这一版最扎眼的破例。
- **为什么加 `contain`**：大纲滚到底后继续滚轮，默认会链式传给页面，读者会以为「页面乱跳」；spec 明确要求不传。
- **触屏**：`ScrollArea` 在 `hover: none` 下不接管，大纲内滚动退化为原生，可接受。

### D4 当前节判定：一个偏移量 + 一次线性扫描

- 定位缓存：`top_i = rect(top) − paneRect(top) + pane.scrollTop`（与 `ListScrollPane` 同一套数学）。
- 当前项：在 `top_i ≤ pane.scrollTop + OFFSET` 里取最后一个；`OFFSET = 85`（页头 61 + 24），保证「刚滚过页头下沿」才切换。
- 文首（`scrollTop ≈ 0`、没有标题越线）：无当前项，不假装在第一节。
- 文末：`scrollTop + clientHeight ≥ scrollHeight − 2` 时强制取最后一项，避免最后一个标题太短、永远越不过线。
- 状态只写 DOM：条目 `data-active="1"` + `aria-current="location"`（其余移除），不 `setState`；滚动用 rAF 合并，同一帧只算一次。

### D5 位置重测的时机

只在三类事件后重测并重新缓存：挂载后首帧、`window.resize`、`ResizeObserver` 观察到 `.prose` 尺寸变化。

- **为什么**：正文里的图片是 `loading="lazy"`，滚动中会陆续加载并把下方标题顶下去；不重测就会出现「高亮停在上一节」。
- **为什么不放在 scroll 里**：滚动帧里读 `getBoundingClientRect` 等于每帧强制布局，40 个标题就是 40 次，是掉帧的典型来源。
- 重测用 rAF 排队 + 简单去重（同一帧多次触发的观察合并成一次）。

### D6 跳转语义：滚、写 hash、移焦点

点击/回车时：`pane.scrollTo({ top: top_i − OFFSET, behavior: reduced ? "auto" : "smooth" })`，随后 `history.replaceState(null, "", "#" + encodeURIComponent(id))`，并给目标标题 `tabIndex = -1` 后 `focus({ preventScroll: true })`。

- **为什么 `replaceState`**：spec 要求点多个条目后按返回能回上一页；用 `location.hash = …` 会为每次点击新增一条历史记录。用 `encodeURIComponent` 是因为中文标题 id 同样会进 URL。
- **为什么移焦点**：屏幕阅读器与键盘用户需要知道「位置变了」，只滚动屏幕是静默的。
- **注意**：`html { scroll-behavior: smooth }` 只作用于 document，不作用于元素；元素滚动必须显式给 `behavior`。

**实现中补的一条（原设计漏了）**：滚动停稳后要再校正一次、然后才移焦点。

- 路径上的图片是 `loading="lazy"`，平滑滚动经过时它们陆续落位，会把目标标题往下顶（实测一次偏 60px 以上），所以「算好落点直接滚过去」不可能精确。
- 目标还在视口外时 `focus()` 有概率无视 `preventScroll`，自行把它滚到视口顶部 —— 那样落点直接变成 0。
- 因此顺序改成：滚到位 → rAF 轮询到滚动位移连续 6 帧不动 → 等 200ms → 用 `behavior:"auto"` 校正残余差量 → 最后 `focus({preventScroll:true})`。用户中途滚轮/触摸/按键则立即放弃校正，避免跟人抢滚动。实测校正后 `headTop` 回到 85px（页头 61 + 呼吸 24）。

### D7 出现门槛与门控

组件用 `matchMedia("(min-width: 1280px)")` 决定是否建列表并挂滚动监听，监听其 `change` 事件以便跨断点时增删；标题数 < 2 时同样不渲染任何节点。

- **为什么用 `matchMedia` 而不是只看 CSS**：`display: none` 只藏住了视觉，spy 仍在为看不见的列表算布局、写属性；断点切换时也白跑。
- **无 JS**：组件不产生任何 DOM，因此不存在空栏（spec 的降级场景）。

### D8 视觉语言

- 一行等宽小标题「目录 CATALOGUE」压在列表上方，用 `--rule-soft` 划一道线，和侧栏 `.rail-block > h3` 是同一套。
- 条目：`font-family: var(--font-mono)`，h2 0.72rem、h3 0.68rem + 缩进 1.1em；未选中 `--ink-3`、悬停/聚焦 `--fg`、当前项 `--accent` 并在左缘给 2px 竖线（用 `::before` + `transform: scaleY`，不改变盒尺寸）。
- 序号：两级 `counter`，`01` / `02.1`，等宽对齐——这是站内已有的「机器嗓音」，也是让长目录能扫读的关键。
- 不新增字体、不新增颜色 token，全部复用 `--accent` / `--ink-2` / `--ink-3` / `--rule-soft`。
- 所有状态变化只用颜色与 `opacity`，不用位移或缩放（避免鼠标划过时列表抖动）。

## Risks / Trade-offs

- **[sticky 失效]** 祖先任何一层出现 `overflow: hidden` 都会让 sticky 退化成普通块 → 实施时沿 `.app-scroll-content` → `main.site-main` → `.article-shell` 逐层核对（当前都只有 `width`/`flex`，无 overflow），并在验证清单里留一条实测。
- **[沉浸阅读模式]** `body.immersive main.site-main { max-width: 720px }` 会把壳收窄，大纲会被推到视口外 → 沉浸模式下隐藏大纲（`body.immersive .article-rail { display: none }`）。
- **[1280 断点跳变]** 跨过断点时大纲出现/消失，但正文不动（布局不依赖大纲宽度）→ 用 rect 实测确认左缘不变。
- **[图片懒加载导致定位漂移]** 高亮落后一节 → `ResizeObserver` 观察 `.prose` 重测（D5）。
- **[触屏]** 大纲内部滚动是原生的，样式与自绘条不一致；点击跳转不受影响 → 接受，与全站其他区域的触屏降级一致。
- **[无 JS]** 没有大纲 → 接受；正文与标题锚点不受影响。
- **[与 hash 恢复的交错]** `RootScroll` 在加载后会补跳一次，首帧可能短暂没有当前项 → 跳转/重测后同一帧内修正，不额外加逻辑。
- **[超大目录]** 40+ 标题时 DOM 与测量成本上升 → 位置一次性缓存 + 滚动帧只比较，个人博客量级可接受；不设上限。

## Migration Plan

纯前端改动，无数据模型、接口、依赖变化：

1. 加组件与样式（旧页面行为不变，大纲默认不存在）。
2. 在文章页接入并验证（宽/窄、多/少标题、hash 直达、返回）。
3. 回滚 = 移除组件引用与那一节 CSS，无数据残留、无迁移脚本。

## Open Questions

- 大纲顶部的「目录 CATALOGUE」这行眉标要不要保留：视觉上它提供了分隔，但也可能显得啰嗦。这属于纯视觉微调，可以在实现后看真实截图再决定，不影响 spec 与任务拆分。