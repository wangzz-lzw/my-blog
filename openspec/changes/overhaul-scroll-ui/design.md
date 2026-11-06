# Design

## Context

核对过的现状（动机见 proposal.md - Why）：

- **滚动条现状**：`redesign.css` 里 `.sheet--scroll .ledger` / `.rail` 只做了 `overflow-y: auto` + `scrollbar-gutter: stable`，外观交给系统；`.sheet--scroll` 上声明了 `color-scheme` 让原生条跟着主题变深浅。上一轮实测（Chrome 156 / Windows）确认：一旦接管 `::-webkit-scrollbar`，Chrome 退回经典渲染并带出上下三角箭头，且压不掉；因此当时**没有**接管外观。
- **页面滚动现状**：除 `/blog`（`body:has(.sheet--scroll)` 把视口高度收进 `.ledger`）外，其余页面都是 **document 滚动**；`components/ReadingProgress.tsx` 直接读 `document.documentElement.scrollTop`，`components/FloatTools.tsx` 通过 `lib/scroll-pane.ts` 的 `currentScrollPane()` 找滚动层（当前返回 `[data-scroll-pane]` 或 `window`）。
- **列表容器**：`components/blog/ListScrollPane.tsx` 渲染 `<div class="ledger" data-scroll-pane role="region" tabindex=0>`，并用 `sessionStorage` + 模块级 `popstate` 标记做后退恢复。
- **其它可滚区域**：`.prose pre` / `.code-card pre`（横向）、`.table-wrap`（后台表格横向）、编辑器全屏预览区（`redesign.css` 1567 附近）、标签选择菜单（`.tag-picker-menu`）。
- **动效现状**：`components/GsapReveal.tsx` 在列表页给 `[data-reveal]` 元素做一次 `opacity + y` 入场；GSAP 3.15 自带 ScrollTrigger（免费，已在 `node_modules/gsap/ScrollTrigger.js`）。
- **依赖约束**：`pnpm-lock.yaml` 与 `package-lock.json` 双 lockfile（Docker 用 `npm ci`）；`next` 必须钉在 16.4.2；六套主题 token 在 `app/globals.css`，`--accent` / `--accent-2` / `--font-mono` 可直接复用。

## Goals / Non-Goals

**Goals**

- 滚动条成为站点视觉的一部分（而不是浏览器的默认控件），且行为不回退。
- 列表的动效回答「我读到哪」，而不是「页面加载完了」。

**Non-Goals**

- 不做平滑滚动（ScrollSmoother 一类），它会与原生惯性、辅助技术打架。
- 不改列表的信息结构（不加年份吸顶、不加卡片）。
- 不动 `blog-list-scrolling` 已定的三条行为契约。

## 视觉方案

### 概念：读数尺（The Instrument）

滚动条不是装饰条，而是一把**量具**：轨道是一条几乎看不见的发丝线，滑块是一小段亮青，轨道上每隔固定距离有一道刻度。它把站点已有的「账本 / 终端」语言（等宽数字、发丝线、硬边）延伸到控件层——刻度不是花纹，它编码内容长度。

**为什么不是常见做法**：`::-webkit-scrollbar` 画一条 6px 圆角灰条是到处都能看到的默认答案；「隐身滚动条 + 悬停变色」同样是默认答案。选刻度尺，是因为这个站点的内容本来就是"按时间排的账"，量具是它的母语。

### 色彩（全部取自已有 token，不新增色相）

| 角色 | 取值 | 说明 |
| --- | --- | --- |
| 轨道 rail | `color-mix(in srgb, var(--fg) 6%, transparent)` | 暗色下几乎不可见，只留厚度 |
| 刻度 tick | `color-mix(in srgb, var(--fg) 16%, transparent)` | 比轨道亮一档，1px × 5px |
| 滑块 thumb | `var(--accent)`（赛博青 `#00f0ff`） | 全站唯一"亮"的东西 |
| 滑块悬停 | `var(--accent)` + `--glow` 外发光 | 只有悬停/拖拽时出现 |
| 读数底 | `var(--bg-2)`（`#090e18`）+ `1px var(--rule)` 边 | 等宽数字 `var(--fg-bright)` |
| 亮色主题 | 同一组 token 自动切换（`daylight` 下 accent 为 `#0a6f92`） | 对比度 ≥ 3:1 |

### 字体

不引入新字体。读数用站点既有的 `--font-mono`（Share Tech Mono / Cascadia / JetBrains Mono）0.62rem、`font-variant-numeric: tabular-nums`——数字要能原地变化而不抖动。

### 版式与尺寸

- 轨道视觉宽 **8px**（悬停/拖拽 10px），滑块 **2px**（悬停 4px），硬边（圆角 0，与站点 1–2px 的规矩一致）。
- 容器右侧预留 **8px 槽**（`padding-right`），内容不因滚动条出现而抖动；不再依赖 `scrollbar-gutter`。
- 列表左缘另有一条 **2px 走线**，从列表顶部起随进度向下生长，末端一个 4px 方点标位置。

```
┌───────────────────────────────────────────────┬───────┐
│ 页头（sticky）                                 │       │
├───────────────────────────────────────────────┼───────┤
│ 开发笔记与生活随想…                            │ 标签  │
│ ┌──┬────────────────────────────────────┐  ▐  │ 前端  │
│ │▐ │ 05   微前端                        │  ▐  │ …     │
│ │▐ │ 2026.11                            │  ▐  │       │
│ │▐ ├────────────────────────────────────┤  ▐  │       │
│ │▐ │ 05   2026年9月份面试题             │  ▐  │       │
│ │▓ │                                    │  ░  │       │
│ └──┴────────────────────────────────────┘  ░  │       │
│   ↑ 走线（scaleY 跟随进度）        ↑ 轨道/滑块/刻度     │
└───────────────────────────────────────────────┴───────┘
```

### 动效（三处，克制）

1. **走线推进**：`transform: scaleY(var(--p))`，`--p` 每帧写一次，线性、无缓动——它是仪表，不是动画。
2. **阅读线状态切换**：条目跨过阅读线（视口 1/4 处）时日期转 `--accent`，滚过之后整条降权到 60% 不透明度；过渡 120ms，只过渡 `color` / `opacity`。
3. **读数出现**：悬停/拖拽/键盘滚动时，读数从 4px 下方淡入 80ms；静止 900ms 后隐去。除此之外不加任何入场动画——列表不再逐条淡入上浮。

### 自检：哪里不像默认答案

- 没有用 `::-webkit-scrollbar` 的圆角灰条，也没做「隐身 + 悬停发光」；
- 没有逐条 fade-up（这是最明显的生成式痕迹），改成连续的位置状态；
- 没有为了动效给每条加大圆角卡片、渐变或阴影；
- 按"出门前摘掉一件配饰"：删掉了最初想做的**年份吸顶标签**——它和走线表达同一件事，留一个就够。

## 实现决策

### D1. 滚动条库：`overlayscrollbars` v2

- **为什么不是 `simplebar`**：它的滚动条是纯装饰 div，拖拽与键盘要自己补；嵌套滚动支持弱。
- **为什么不是 `react-custom-scrollbars-2`**：多年停更，React 19 未验证。
- **为什么不是手写**：要自己处理 resize 观察、指针捕获、点击轨道、RTL、macOS 覆盖式滚动条——一次性成本高且长期要维护。
- 落地用 `overlayscrollbars` + `overlayscrollbars-react`（薄包装）。**备选路径**：若 React 19 / Next 16 下包装层出问题，直接对 `overlayscrollbars` 核心 API 写 40 行自有组件（`ScrollArea`），不引入第二套库。

### D2. 页面滚动迁到根容器（不得不做）

document 的滚动条由浏览器绘制，没有 API 能改它的外观。要"全站同一套"，只能让 `body` 不滚、由我们自己的容器滚：

```
<html> <body style="height:100dvh; overflow:hidden">
  <div id="app-scroll" style="height:100%; overflow:auto">  ← 库接管
    header / main / footer
  </div>
</body> </html>
```

连带要处理（写进 tasks 的清单，不靠记性）：

| 受影响 | 处理 |
| --- | --- |
| `window.scrollY` / `document.documentElement.scrollTop` | 全部改走 `currentScrollPane()`；`currentScrollPane()` 改成优先返回根容器 |
| `ReadingProgress` | 读根容器的 `scrollTop` |
| `FloatTools` 回到顶部 | 已走 `currentScrollPane()`，跟着换目标 |
| `html { scroll-behavior: smooth }` | 移到根容器的 CSS |
| hash 锚点（`#top` 等） | 客户端 `scrollIntoView` 兜底 |
| 浏览器后退恢复 | 沿用 `ListScrollPane` 的 sessionStorage 方案，新增根容器位置恢复 |
| 打印 | `@media print { #app-scroll { height:auto; overflow:visible } }` |
| `body:has(.sheet--scroll)` 高度链 | 仍成立（`.list-host` 在根容器里），但要复核 `100dvh` 的参照 |

**为什么不用「隐藏原生条 + 自绘假条」**：拖动要做 hit-test、缩放要重算、辅助技术拿不到真实滚动语义；用库把这一层一次性解决。

### D3. 外观：变量 + 属性选择器，不额外插 DOM

- 轨道与滑块由库渲染；样式锚定 `[data-overlayscrollbars-viewport]` 与本地类名（`.sb`、`.sb--list`）。
- **刻度**用 `repeating-linear-gradient` 铺在轨道上（每 24px 一道 1px 亮痕），零额外 DOM。
- **读数**库不提供：列表页由 `ListScrollPane` 渲染一个 `<span class="sb-readout">`，用 `top` 定位到指针高度，文本 `03 / 14`；只在悬停/拖拽/键盘滚动时显示。
- 尺寸与颜色全走 CSS 变量（`--sb-w`、`--sb-thumb`、`--sb-track`），六套主题自动跟随。

### D4. 列表联动：一条 rAF，禁用 setState

```
scroll(passive) ──► dirty = true ──► rAF:
   p = scrollTop / (scrollHeight - clientHeight)        // 写 --p
   comp = 视口 1/4 处的 y → 二分找条目（offsets 已缓存） // 切 data-read
```

- 条目 offset 在挂载与 `ResizeObserver` 回调里缓存，滚动帧里**不读布局**（只读一次容器三件套）。
- 状态用 `data-read="past|current|ahead"` 直接改 DOM，不触发 React 重渲染。
- 走线与读数点用 `transform` / `scaleY`，不触碰 `top`（避免重排）。
- `prefers-reduced-motion` 时只写 `data-read`，不写 `--p`。

### D5. 与既有入场动画的关系

列表页移除 `GsapReveal` 的逐条 `[data-reveal]`（其余页面不动）：两套动画并存时，入场位移会让"阅读线"在首帧算错位置，而且逐条 fade-up 正是要避免的模板感。保留至多一次 120ms 的整体淡入。

### D6. 降级三件套

- **无 JS**：隐藏原生条只发生在库初始化后的容器上（`[data-overlayscrollbars]` 存在才隐藏），所以脚本不可用时系统滚动条照旧。
- **触屏**：`(hover: none)` 不初始化库，保留原生惯性与橡皮筋。
- **打印**：根容器与列表在 `@media print` 下放开 `overflow` 与固定高度。

### D7. 依赖与 lockfile

`pnpm add overlayscrollbars overlayscrollbars-react` → 立刻 `npm install --package-lock-only` 生成 npm lock（Docker 走 `npm ci`）→ 核对 `next` 仍是 **16.4.2**、`@next/swc` 对齐。任何一个动作把 `next` 顶版本，都要立刻钉回去（历史上这一步曾导致"HTML 正常但全站不水合"）。

### D8. 数据与配置

无 schema 变更、无新环境变量。

## Risks / Trade-offs

- [库与 React 19 / Next 16 不兼容] → 先做一个最小验证（单个容器 + 拖拽 + 键盘），不通过就走 D1 的备选路径（核心 API 直连）。
- [根容器改变"谁在滚"，漏改 `window.scrollY` 调用点会静默失灵] → tasks 第一步先全仓 grep `scrollY|scrollTop|documentElement.scrollTop|scrollIntoView|scrollTo` 列出清单再动手。
- [sticky 页头 / 页脚行为变化] → sticky 相对最近滚动祖先，理论上仍成立；验收单列一条（滚动态页头必须仍在顶部）。
- [iOS Safari `100dvh` + 嵌套容器] → 触屏不初始化库，走原生。
- [滚动条压住内容] → 用容器 `padding-right: 8px` 预留槽位，不用 `scrollbar-gutter`（库接管后它不再可靠）。
- [每帧写样式导致掉帧] → 一条 rAF、只写 transform/opacity/CSS 变量；验收看 Performance 面板抽样。
- [库的体积] → 约十几 KB gzip；个人博客可接受，换来跨浏览器一致的控件外观。
- [滚动条与"减少动态效果"冲突] → 滚动条本身不做动画（只有宽度/透明度过渡 80ms），减弱动效下只去掉读数淡入。

## Migration Plan

1. **第一步：根容器**（先不接自定义条）。验证 hash、后退、打印、sticky、`FloatTools`、`ReadingProgress` 全部等价；这一步可独立回滚。
2. **第二步：元素级滚动条**（列表、侧栏、代码块、后台表格、编辑器预览）。逐页截图对比，确认没有双条。
3. **第三步：列表动效**（走线 + 阅读线 + 读数），并移除列表的逐条入场。
4. 回滚粒度：动效是纯增量（删类名即回）；滚动条可退化为"原生条 + color-scheme"；根容器可退回 document 滚动。

## Open Questions

（无。范围与动效方向已在对话中确认：全站可滚区域统一换、动效走"账本走线"这一路。）