# Design

## Context

现状（已核对代码）：

- `/` 是 `app/page.tsx`，**服务端组件、零客户端 JS**（构建产物里曾经是 `○ /` 静态页，现在因为要塞实时计数改成了 `ƒ` 动态）。内容结构：`.page-welcome > .welcome-inner`，里面依次是 `BrandMark`（内联 SVG，caret 路径 + 光标块）、`h1.welcome-wordmark`（每个字母一个 `span.welcome-letter`，带内联 `animation-delay`）、`p.welcome-lead`、`.welcome-rule`、`p.welcome-state`、`nav.welcome-actions`（一个 `.welcome-cta` 主按钮 + 两个 `.welcome-secondary`）。
- 现在的入场是**纯 CSS keyframes**（写在 `app/redesign.css` 的 `.page-welcome` 段落里），网格靠 `.page-welcome::before` 伪元素画。
- GSAP 已在依赖里（`gsap ^3.15.0`），`components/GsapReveal.tsx` 已经在用，写法是 `useEffect` + `gsap.context()`。
- `gsap` 的 **SplitText 是付费插件**，不能用在商业项目；逐行拆字要么自己写，要么不做。
- 根布局的 `theme-init` 内联脚本是 `beforeInteractive`，会在首屏前执行——可以顺手给 `<html>` 打标记。

## 设计要点

### 动效的语气

参考站那类作品集的共同点是"页面在听你说话"：入场像一次开机自检，鼠标靠近时元素有反应，离开时有交代。我们要的是**同一语气、更克制**的版本：

- 入场是**一次**的，之后画面完全静止（唯一的持续动作是光标闪烁）。
- 指针效果幅度都很小（视差 ≤6px、磁吸 ≤8px），像有质量的纸，不是弹簧玩具。
- 光标环只是提示"这里可以点"，不替代系统光标。

### D1. 内容留在服务端，动效做成"增强层"

`app/page.tsx` 保持服务端组件不变；新增 `components/welcome/WelcomeMotion.tsx`（客户端），它**不渲染可见内容**，只按 `data-welcome` 选择器拿到已有 DOM 并用 GSAP 操作。同理 `CursorFollower.tsx` 只渲染一个装饰元素。

- 好处：内容永远是 SSR 先出来的，禁 JS 也完整；动效失败最多是"没有动效"，不会白屏。
- 替代方案：把整页包成客户端组件。会让首屏内容依赖 hydration，且 `no-JS 完整可读` 这条要求会被打破，弃用。

### D2. 初始隐藏用 `html.js-ready` 门控，兜底 2.5s 自动摘除

CSS 里把"隐藏态"写成 `html.js-ready .welcome-letter { opacity: 0; transform: translateY(...) }`，而 `js-ready` 这个类由 `theme-init` 内联脚本**在首屏前**加上（和 `data-theme` 同一个脚本）。

- 有 JS：类先加上 → 元素起始隐藏 → GSAP 接管播放 → 播放完恢复可见。
- 无 JS：类不存在 → 内容是可见的最终态。
- 脚本 404/报错：内联脚本里再挂一个 `setTimeout`，2.5 秒内若 `WelcomeMotion` 没报到就摘掉 `js-ready`，避免"永久隐藏"。

`prefers-reduced-motion: reduce` 的分支里，CSS 直接无视 `js-ready` 把元素拍到最终态（双保险，防止 GSAP 分支没执行时内容被藏住）。

### D3. 入场 timeline（总时长 1.4s，上限 1.8s）

| 顺位 | 元素 | 动作 | 起始 | 时长 |
| --- | --- | --- | --- | --- |
| 1 | `.welcome-grid` | opacity 0 → .55 | 0 | 0.5s |
| 2 | `.w-mark-caret` | `strokeDashoffset` 20 → 0 | 0.1s | 0.5s |
| 3 | `.w-mark-cursor` | `scaleX` 0 → 1 | 0.55s | 0.16s |
| 4 | `.welcome-letter` | 逐字 `y:18 → 0` + opacity，`stagger 0.028` | 0.62s | 0.42s |
| 5 | `.welcome-lead` | `clipPath inset(0 0 100% 0) → inset(0 0 0% 0)` + `y:10 → 0` | 0.98s | 0.5s |
| 6 | `.welcome-rule` | `scaleX` 0 → 1（`transform-origin: left`） | 1.12s | 0.35s |
| 7 | `.welcome-state` | y 8 → 0 + opacity | 1.22s | 0.3s |
| 8 | `.welcome-actions` | y 8 → 0 + opacity | 1.32s | 0.3s |

缓动统一 `power3.out`；字标与定位句用 `will-change: transform, opacity`，播完由 GSAP 自动清掉（`clearProps`）。

**逐行揭示的取舍**：定位句只有一句、最宽 22em，做逐行需要拆行工具。GSAP 的 SplitText 是付费插件，自研行拆分在字体加载与窗口缩放后要重算、容易出错。所以定位句用**整块遮罩揭示**（clip-path 自下而上），视觉上仍然是"文字被揭开"，但不是逐行。

### D4. 光标跟随：`quickTo` + 命中检测，只在精确指针设备启用

- DOM：`.welcome-cursor`（fixed，`pointer-events: none`，`aria-hidden`，`mix-blend-mode: difference`）。
- 位置：`gsap.quickTo(el, "x", { duration: 0.35, ease: "power3" })`，避免每次 `pointermove` 新建 tween。
- 放大：用 `pointerover` / `pointerout` 委托（匹配 `a, button, [data-magnetic]`），在命中元素时 `scale: 2.2` 并把描边换成洋红。
- 启用条件：`matchMedia("(hover: hover) and (pointer: fine)")`；不满足就不初始化（触屏设备连 DOM 都不挂）。
- 不替换系统光标：`cursor` 保持默认，环只是叠在上面的装饰。

### D5. 磁吸：位移作用于内层，不改命中区

`transform` 会改变命中测试区域。为了满足"MUST NOT 改变可点击区域"，磁吸的位移作用在**按钮内部的 span**（内容层）上，外层按钮盒保持不动：指针能命中的始终是原来的矩形。

- 幅度：`x/y` 各取 `clamp(-8..8)` 的指针偏移的 35%，最大 8px。
- 回弹：离开时 `gsap.to(target, { x: 0, y: 0, duration: 0.5, ease: "elastic.out(1, 0.45)" })`。
- 作用对象：`.welcome-cta` 与 `.welcome-secondary`（内层包一个 span）。

### D6. 视差：网格与标记，≤6px，慢跟随

- 目标：`.welcome-grid`（把原来的伪元素网格改成真实 div，才能被 GSAP 直接位移）与 `.welcome-mark`。
- 映射：指针相对视口中心的归一化坐标 × 6px，`quickTo` 的 `duration: 0.8`（慢于光标环，制造层次）。
- 禁区：`.welcome-lead`、`.welcome-state`、`.welcome-actions` 一律不参与，保证文字稳定。

### D7. 出页过渡：拦一次 `onClick`，播完再 `router.push`

主按钮仍是 `<Link href="/blog">`（无 JS 时可直接跳）。客户端拿到点击后：

1. `preventDefault()`；
2. `.welcome-wipe` 覆盖层 `scaleY: 0 → 1`（`transform-origin: bottom`，0.45s）+ 内容 `opacity → 0`；
3. `router.push("/blog")` 在 0.45s 时执行。

只做"出"，不做"入"：进入 `/blog` 时的过渡需要给那个页面也加 JS，与"只在欢迎页用 GSAP"的结论冲突，明确不做。

### D8. 降级矩阵

| 条件 | 行为 |
| --- | --- |
| 正常 | 全部动效 |
| `prefers-reduced-motion: reduce` | 不建 timeline、不初始化光标/磁吸/视差；CSS 直接给最终态；CTA 直接跳转 |
| 无 JS | `js-ready` 不存在 → 内容可见；无动效；CTA 原生跳转 |
| 触屏 / `hover: none` | 入场照播；光标与磁吸不初始化；视差依赖指针，跳过 |
| 脚本失败 | 2.5s 兜底摘除 `js-ready`，内容恢复可见 |

### D9. 依赖与清理

不引入 `@gsap/react`：用 `useLayoutEffect` + `gsap.context(fn, scopeRef)`，返回的 `ctx.revert()` 在卸载时清理所有 tween、内联样式与选择器。所有 `matchMedia` 分支用 `gsap.matchMedia()` 注册，`revert()` 一并回收。

## Risks / Trade-offs

- [`js-ready` 门控若与 hydration 顺序冲突会导致内容闪一下] → 类在 `beforeInteractive` 脚本里加，早于首次绘制；GSAP 在 `useLayoutEffect` 里同步 `gsap.set`，首帧即隐藏到位。
- [自研遮罩揭示在长文案换行时可能裁掉半行] → `clip-path: inset(...)` 作用于整块元素本身，换行不影响；`y` 位移加 padding 余量避免字底被切。
- [`mix-blend-mode: difference` 在白底上会把光标环反成深色，但叠在图片上可能发灰] → 欢迎页没有图片，只有纸色与细网格，安全。
- [磁吸给内层 span 加 transform 会破坏 `display: inline-flex` 的对齐] → 内层 span 用 `display: inline-block` 并继承父级 gap。
- [出页过渡拦截点击可能吞掉 Cmd/Ctrl+点击（新标签打开）] → 处理函数里 `if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;` 放行默认行为。
- [GSAP 与现有的 `GsapReveal` 抢同一批元素] → 欢迎页不使用 `GsapReveal`（它只作用于 `[data-reveal]`），互不干涉。
- [体积] → 只 import `gsap` 核心与 `quickTo`（本身在核心内），不引 ScrollTrigger/SplitText；首屏额外 JS 约 40–50KB gzip。

## Migration Plan

纯前端增强，无数据迁移：

1. 把伪元素网格改成 `.welcome-grid` 真实元素，CSS 初始态改为 `html.js-ready` 门控，删掉原 CSS keyframes。
2. 加 `WelcomeMotion`（timeline + 磁吸 + 视差 + 出页过渡）与 `CursorFollower`。
3. 逐条验证降级矩阵（reduce / 无 JS / 触屏模拟），再跑 `tsc` 与 `build`。
4. 回滚：删两个组件 + 恢复 CSS keyframes 即可，路由与内容不受影响。

## Open Questions

（无。五类效果与"只在欢迎页用 GSAP"已在对话中确认。参考站无法抓取实际动画，视为风格参考而非逐帧复刻。）