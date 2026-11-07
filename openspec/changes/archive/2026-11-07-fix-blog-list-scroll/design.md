# Design

## Context

核对过现状（动机见 proposal.md - Why，这里只记约束）：

- `app/globals.css`：`body { min-height: 100vh; display: flex; flex-direction: column; }`，`main.site-main { flex: 1; width: 100% }`；`.site-header { position: sticky; top: 0; z-index: 50 }`（`redesign.css` 里高 60px）；`.site-footer` 在文档流末尾。
- `app/redesign.css`：`.sheet` 是 `grid-template-columns: minmax(0,1fr) 236px`、`column-gap: 3.5rem`、`padding: 2.75rem 0 4rem`；`.ledger { display: flex; flex-direction: column }`；`.rail` 是普通块。
- `app/(site)/blog/page.tsx` 的最外层是 `<GsapReveal>`，它渲染一个**没有类名的 `div`**，里面才是 `.sheet`——这个中间层是高度传递必须单独处理的地方（`GsapReveal` 支持传 `className`）。
- 两栏断点在 `@media (max-width: 1024px)`：`.sheet` 收成单栏、`.rail` 变成两列网格；`720px` 以下日期栏折成一行。
- `components/FloatTools.tsx`：`scrollToTop()` 直接 `window.scrollTo`，"回到顶部"是否可用由 `window.scrollY > innerHeight * 0.75` 判定。
- `body` 已经有 `:has()` 的用法（`body:has(.page-welcome)`、`body:has(.admin-shell)`），作用域限定是既有做法。
- 仓库里已有细滚动条样式，但只挂在 `.prose pre` / `.code-card pre` 上。

## Goals / Non-Goals

**Goals**

- 列表列成为唯一的滚动上下文，且这个事实只由 CSS 表达（不靠 JS 量高度、不靠 `position: fixed` 布局）。
- 键盘、后退、窄屏、无脚本四种条件下都不出现"滚不动"或"内容被裁掉"。

**Non-Goals**

- 不做分页、无限滚动、虚拟化；不抽象一套通用"滚动面板"组件给全站用（只有这一处需要，抽象成本高于收益）。
- 不动文章页、标签页、后台的滚动方式。

## Decisions

### D1. 用「高度链 + 容器 overflow」而不是 JS 锁 body

```
body:has(.sheet--scroll)   → height: 100dvh; overflow: hidden      （限高，body 不再滚）
main.site-main             → min-height: 0; display: flex; flex-direction: column
.list-host (GsapReveal)    → flex: 1; min-height: 0; display: flex; flex-direction: column
.sheet--scroll             → height: 100%; min-height: 0
.ledger                    → flex: 1; min-height: 0; overflow-y: auto
```

- **为什么不用 `position: fixed` 布局**：那会把页头/页脚/侧栏一起移出文档流，主题切换、打印、焦点滚动全部要重新兜底；高度链只改"谁能滚"，其余保持不变。
- **为什么用 `:has()` 而不是给 `<body>` 加类**：`(site)` 布局是共享的，从页面组件往 `body` 加类要么用 effect（首帧会闪一下整页滚动），要么改 layout 传 prop（污染所有路由）。`:has()` 让作用域留在 CSS 里，且这个仓库已经这么做了。
- **`min-height: 0` 是这条链的命门**：flex/grid 子项默认 `min-height: auto`，只要漏一层，容器就会被内容撑高、退化成整页滚动（本地已经踩过一次类似的坑）。
- `100dvh` 而非 `100vh`：移动端地址栏收起时不留白条；桌面端两者等价。

### D2. 滚动容器就是 `.ledger`（列表列），不是 `main`

红框标在列表右缘，说明用户要的是"列表自己滚、侧栏别跟着走"。让 `main` 滚虽然写起来更省事，但滚动条会跑到窗口右缘——那正是用户抱怨的观感。代价是列表右边多一条 8px 的槽，用 `scrollbar-gutter: stable` 预留出来，避免条目宽度在"有/无滚动条"之间跳。

`.rail` 同时获得 `overflow-y: auto; overscroll-behavior: contain`：它自己不滚列表，但内容高过视口时能单独滚到底。

### D3. 无 JS 时不做任何降级分支

高度链是纯 CSS：禁用 JS 时 `.ledger` 依然 `overflow-y: auto`，内容依然完整可滚，只是没有位置恢复和入场动画——这正好满足"无脚本时内容完整可读"。所以**不需要**"JS 不可用就退回整页滚动"的开关（那反而要靠 JS 才知道 JS 没了）。

### D4. 键盘可达：一个 Tab 停留点 + 既有焦点环

给 `.ledger` 加 `role="region"`、`aria-label="文章列表"`、`tabIndex={0}`，浏览器原生支持方向键/PageDown/Home/End 滚动。

- 只加一个停留点，不加"跳过"链接：列表内部的链接本来就在 Tab 顺序里，越过去很快。
- 焦点环沿用站点 `:focus-visible` 样式，但要在容器上单独写（`outline-offset: -4px`，避免描边被 `overflow: hidden` 的父级裁掉）。

### D5. 位置恢复：`sessionStorage` + 一次 `requestAnimationFrame`

`components/blog/ListScrollPane.tsx`（客户端）：

- 挂载后 `useLayoutEffect` 读 `sessionStorage['blog:ledger-top']`，`requestAnimationFrame` 里写回 `scrollTop`（等一帧让字体/布局稳定，避免恢复后又被重排顶回去）。
- 滚动时直接写（不节流：一次 `setItem` 的成本远低于一帧，且写的是同一个键）。
- 用 `sessionStorage` 而不是 `history.state`：后退/前进都能读到，且不必侵入 Next router 的状态；用 session 而不是 local：新开标签页从头开始才符合直觉。
- 只记一个页面的一份位置，符合"列表页只有一个"的事实；不做滚动容器抽象。

### D6. `FloatTools` 找"当前滚动层"，而不是写死 `window`

新增 `lib/scroll-pane.ts`：

```ts
/** 当前页真正的滚动层：列表页是列表容器，其余是 window */
export function currentScrollPane(): HTMLElement | Window { ... }
```

判定方式是 `document.querySelector('[data-scroll-pane]')`（`.ledger` 上带这个标记），命中就返回元素、否则返回 `window`。`FloatTools` 的 `scrollToTop()` 与"是否可用"的监听都改用它，监听从 `window.scroll` 换成 `pane.addEventListener('scroll')`（元素与 window 的事件接口一致，`scrollY` 换成 `scrollTop`，`innerHeight` 换成 `clientHeight`）。

- 为什么用 DOM 标记而不是 React context：`FloatTools` 在 `(site)` 布局里，列表容器在页面里，跨层传值要么加 provider 要么加 prop 链；一个 `data-` 属性是最小的耦合面。
- 为什么不做成通用 hook：只有这一处需要，且它必须能读任意页面——hook 反而要求调用方在正确的树里。

### D7. 窄屏用同一个断点回退

`@media (max-width: 1024px)` 里把整条高度链撤销（`height: auto`、`overflow: visible`），列表回到文档流。断点与 `.sheet` 收成单栏的断点**必须完全一致**，否则会出现"单栏布局 + 内部滚动条"的别扭中间态。

### D8. 滚动条：不接管外观，只声明 `color-scheme`

原计划是用 `::-webkit-scrollbar` 画一条 8px 的细滚动条。实现时实测发现：**只要接管 `::-webkit-scrollbar`（或 `scrollbar-color`），Chrome 就退回经典滚动条渲染，首尾多出一对 ▲▼ 箭头**，而这些箭头用 `::-webkit-scrollbar-button { display: none }`（含 `:single-button`、`width/height: 0`、透明背景几种写法）都去不掉；另一边，不接管时原生滚动条本来就是这套带箭头的系统样式（和全站窗口滚动条一致）。

所以最终选择：**不接管外观**，只给滚动容器声明配色方案——

```css
.sheet--scroll { color-scheme: dark; }
[data-theme="daylight"] .sheet--scroll { color-scheme: light; }
```

这样原生滚动条跟着主题深浅走（暗色主题下轨道是深的），宽度与窗口滚动条一致（15px），也顺手满足了 spec 里"滚动条位置与粗细不变、颜色随主题改变"。`scrollbar-gutter: stable` 保留：列表长短变化时条目宽度不会一跳一跳。

## Risks / Trade-offs

- [高度链漏一层 `min-height: 0` → 悄悄退化成整页滚动，测试时容易误判"好像没生效"] → tasks 里把"窗口滚动条不出现"作为独立验收项，而不是只看"列表能滚"。
- [`.ledger` 上的 `tabIndex={0}` 让 Tab 顺序多一站] → 只加一站且焦点环清晰；比"键盘用户永远滚不到列表下方"好得多。
- [`scrollbar-gutter: stable` 在部分旧版浏览器不支持] → 不支持时退回"有滚动条时内容略窄"，不影响功能。
- [位置恢复与 GsapReveal 入场动画抢首帧] → 恢复放在 `requestAnimationFrame` 之后；动画只改 `transform/opacity`，不改布局高度。
- [侧栏内容很长时出现第二根滚动条，视觉上像"两个滚动条"] → 侧栏只在真超出时才有，并给它留了 `padding-right` 与 `scrollbar-gutter`，不会压住右侧计数。
- [`100dvh` 在老浏览器缺失] → 先写 `100vh` 再写 `100dvh` 覆盖，和仓库既有写法一致。
- [移动端 iOS 的橡皮筋] → `overscroll-behavior: contain` 抑制滚动链；窄屏本来就退回整页滚动。

## Migration Plan

1. 先加 CSS 与类名，确认宽屏行为正确（此时代码路径不变，可单独回滚）。
2. 再接 `ListScrollPane`（位置恢复）与 `FloatTools` 的滚动目标。
3. 回归检查：`/blog`、`/tags`、`/posts/*`、`/admin`、`/`（欢迎页）五个页面的滚动行为。
4. 回滚：删掉 `.sheet--scroll` 类名与对应 CSS 即可整体退回整页滚动，`ListScrollPane`、`FloatTools` 的改动都向后兼容。

## Open Questions

（无。滚动容器范围已在对话中确认：只有列表列内部滚，侧栏固定。）