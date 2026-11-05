# Tasks

## 1. 结构与初始态

- [x] 1.1 把 `.page-welcome::before` 的伪元素网格改成真实元素 `<div class="welcome-grid" aria-hidden="true" />`，样式平移过去（`position: fixed; inset: 0; z-index: 0`，96px 格、`--w-line`、`opacity: .55`）；验证：视觉与现在一致，`aria-hidden` 不被朗读。
- [x] 1.2 `theme-init` 内联脚本（`app/layout.tsx`）追加：给 `<html>` 加 `js-ready` 类，并挂 2.5s 兜底——若 `window.__welcomeMotion` 仍为 false 就摘掉该类；验证：禁用 JS 时 `<html>` 上没有 `js-ready`。
- [x] 1.3 `app/redesign.css`：删掉 `.page-welcome` 段落里的 `@keyframes w-*` 与 `animation: w-*` 声明，改为 `html.js-ready` 门控的初始隐藏态（字标 `opacity:0; translateY(18px)`、定位句 `clip-path: inset(0 0 100% 0)`、线 `scaleX(0)`、状态行与入口 `opacity:0; translateY(8px)`），并在 `@media (prefers-reduced-motion: reduce)` 里强制恢复最终态；验证：无 JS 打开 `/` 内容全部可见，有 JS 时首帧不可见、由 GSAP 接管。
- [x] 1.4 给主按钮与次链接的内容包一层 `<span class="welcome-label">`（磁吸位移用），并保证包一层后布局不跳（内层 `display: inline-block`）；验证：三个入口的盒模型与改动前一致。

## 2. 入场 timeline

- [x] 2.1 新增 `components/welcome/WelcomeMotion.tsx`（`"use client"`）：用 `useLayoutEffect` + `gsap.context()` 按 design 的 8 个顺位建 timeline（网格 → caret 描边 → 光标块 → 字标 stagger 0.028 → 定位句遮罩 → 线 scaleX → 状态行 → 入口），统一 `power3.out`，总时长 ≤1.4s；播完 `clearProps` 并置 `window.__welcomeMotion = true`；验证：首次加载 1.5s 内全部就位，滚动不重播。
- [x] 2.2 用 `gsap.matchMedia()` 注册 `(prefers-reduced-motion: reduce)` 分支：只做 `gsap.set` 到最终态，不建 timeline，同样置 `__welcomeMotion = true`；验证：系统开启减少动效后刷新，无位移与描边动画、内容立刻可见。

## 3. 指针效果

- [x] 3.1 新增 `components/welcome/CursorFollower.tsx`：`matchMedia("(hover: hover) and (pointer: fine)")` 不成立直接不渲染；成立时渲染 `.welcome-cursor`（fixed、`pointer-events:none`、`aria-hidden`、`mix-blend-mode: difference`），用 `quickTo` 跟随，`pointerover/pointerout` 委托到 `a, button` 时 `scale: 2.2` + 描边换洋红；验证：桌面移动鼠标有延迟跟随，触屏模拟（DevTools 触摸模式）不出现。
- [x] 3.2 磁吸：在 `WelcomeMotion` 里对 `.welcome-cta` 与 `.welcome-secondary` 绑 `pointermove/pointerleave`，位移作用于内层 `.welcome-label`，`x/y` 各 ≤8px，离开 `elastic.out` 回弹；验证：悬停有明显但轻微的迎向感，指针离开回原位；用 Tab+Enter 触发跳转正常。
- [x] 3.3 视差：指针相对视口中心归一化后映射到 ≤6px，`quickTo({duration: .8})` 位移 `.welcome-grid` 与 `.welcome-mark`；文字元素不参与；验证：指针从一端移到另一端，网格与标记位移不超过 6px，定位句与按钮不动。

## 4. 出页过渡

- [x] 4.1 新增 `.welcome-wipe` 覆盖层元素并在 `WelcomeMotion` 里拦截主按钮点击：`preventDefault` → 覆盖层 `scaleY 0→1`（`transform-origin: bottom`，0.45s）+ 内容淡出 → 0.45s 时 `router.push("/blog")`；`metaKey/ctrlKey/shiftKey/中键` 时不拦截；验证：点击后有遮罩扫过再进入 `/blog`，Cmd+点击仍能新标签打开。
- [x] 4.2 降级：reduce 或无 JS 时直接跳转不播过渡；验证：开启减少动效后点击，立即到 `/blog`。

## 5. 清理与验证

- [x] 5.1 清理：`WelcomeMotion` 卸载时 `ctx.revert()`，移除 `pointermove` 监听与内联样式；`CursorFollower` 卸载时移除节点；确认没有遗留 `will-change`；验证：在欢迎页与 `/blog` 之间来回跳转 10 次，DOM 中 `.welcome-cursor` 与内联 transform 不累积。
- [x] 5.2 无障碍：头部检查——页面仍只有一个 `h1`，装饰元素（光标、网格、wipe）都 `aria-hidden` 且 `tabindex` 不参与；Tab 顺序为 主按钮 → 标签 → 登录；焦点环可见且不被自定义光标覆盖；验证：键盘走一遍 + 可访问性面板核对。
- [x] 5.3 降级矩阵实测：正常 / `prefers-reduced-motion: reduce` / 禁用 JS / 触摸模拟 四种情况各截一张图，确认内容可见、无动画残留、无空白区。
- [x] 5.4 `npx tsc --noEmit` 与 `npm run build` 通过，并记录引入 GSAP 后 `/` 的 JS 体积增量；验证：退出码 0，记录首屏 JS 变化数值。

## 6. 文字粒子化（追加需求；首次理解偏差已纠正）

- [x] 6.1 撤掉上一版"满屏粒子场"（`ParticleField`），改为针对字标的文字粒子化：新增 `components/welcome/TextParticles.tsx`，用 `selector` 指定目标元素；验证：HTML 中不再有 `.welcome-particles`，只有 `.welcome-text-particles`。
- [x] 6.2 采样：把字标按**同样的字体、字号、字重与字距**画进离屏 canvas，逐像素取 alpha>128 的点作为粒子"家"（步长 3px、上限 3200 点），并在 `document.fonts.ready` 与 `scroll` 后重新采样；验证：字标绘制位置与 DOM 文字重合，字体回退时不偏移。
- [x] 6.3 交互：指针进入字标外扩 24px 的区域 → 真实文字隐去（opacity 0）、粒子层接手；90px 半径内按距离给斥力，粒子被推开并转成电蓝；指针离开该区域或窗口失焦 → 粒子靠弹簧+阻尼回位，全部回到 `SETTLED` 阈值内后清空画布、恢复真实文字；验证：滑过散开、划走拼回，且事后 CPU 不再空转（循环自动停）。
- [x] 6.4 降级与性能：`prefers-reduced-motion: reduce` 或非精确指针设备时不初始化；循环只在激活/回位期间运行；`resize`/`scroll` 触发重采样；画布 `pointer-events: none` + `aria-hidden`，层级 `.welcome-inner(2)` 之下、光标环之上（3）；验证：reduce 下文字始终可见且无画布循环。

## 7. 视觉重做：白化赛博（追加需求："这个很丑，设计一下"）

- [x] 7.1 标记改写成**终端提示符行**：`❯ LZW.LOG▌` 三者在同一基线、同一左缘，取代原来孤悬在标题上方、且因 SVG viewBox 内边距而缩进约 31px 的 favicon 放大版；验证：`.welcome-prompt-line` 内为 prompt(span) + h1 + caret(span)，二者 `aria-hidden`。
- [x] 7.2 光标块从 50% 占空比的闪烁改成**常亮 + 每 1.6s 短闪 12%**（`steps(1, end)`），并带品红辉光；验证：截图里光标块不再有一半时间缺失。
- [x] 7.3 加三层赛博背景：3px 一组的扫描线（ink 6%）、9s 一轮下扫的电蓝光带、只画对角两角的 HUD 角标；层级 grid(0) → scanlines/beam/hud(1) → inner(2) → text-particles(3)；验证：HTML 中四层顺序正确。
- [x] 7.4 定位句加左侧电蓝竖线 + 缩进（读作终端输出引用）；主按钮改成**切掉两个对角**（`clip-path`）+ 悬停横扫光，取代原先的圆角实心块；验证：`clip-path` 生效、hover 有扫光。
- [x] 7.5 视差收窄：只有背景网格参与（≤6px），文字（含字标）不再参与——否则粒子采样的"家"会和文字错位；入场序列同步改为 prompt 滑入 → caret 立起 → 字标逐字；验证：`tsc` 通过，页面 200，无 `.welcome-mark` 残留。

## 8. 指针改成瞄准框（追加需求："光圈太丑了"）

- [x] 8.1 废弃圆环：去掉 26px 白描边圆 + `mix-blend-mode: difference`（在白底上 difference 会把白边反成脏灰，这是"丑"的直接原因），改为**四角括号**组成的瞄准框 `cursor-target`（18px，ink 55%）。
- [x] 8.2 锁定交互：悬停到 `a, button` 时，另起一个 `cursor-lock` 方框用 GSAP 补齐到元素的 `getBoundingClientRect()`（x/y/width/height，0.28s `power3.out`），品红描边，同时把跟手小框淡到 25% 并缩小——像目标捕获，也顺带告诉用户"要点的是这块"。
- [x] 8.3 状态清理：指针移出、窗口失焦、组件卸载时两个框都回到 `opacity: 0`；`pointer-events: none` + `aria-hidden`，不替换系统光标；只在 `(hover: hover) and (pointer: fine)` 初始化；验证：HTML 中两组各 4 个 `<i>`，旧 `.welcome-cursor` 与 `mix-blend-mode` 在样式里均为 0 处。

## 9. 指针换成小尾巴（追加需求："锁定边框很丑，要小尾巴"）

- [x] 9.1 删掉瞄准框与锁定框：`.cursor-target` / `.cursor-lock` 的样式与逻辑整段移除（悬停 `a, button` 时不再画贴边的四角框）。
- [x] 9.2 改为拖尾：`.cursor-trail` 里 5 个圆点，每帧逐节追赶前一节（`lerp` 系数 0.45 → 0.22 递减），自然形成由大到小、由深到淡的尾巴；`transform` 用 `translate3d` 写，不触发重排。
- [x] 9.3 悬停反馈改成颜色而不是形状：指针落在 `a / button / [role=button]` 上时整条尾巴转 `--w-signal-2`（品红），离开恢复——比画框安静，也不遮挡内容。
- [x] 9.4 首帧对齐：第一次 `pointermove` 时把整串点直接放到指针处，避免从屏幕中心甩过来；指针离开窗口/失焦时淡出并停掉 rAF。
- [x] 9.5 降级不变：仍只在 `(hover: hover) and (pointer: fine)` 且非 `reduce` 时启用；装饰层 `aria-hidden`、`pointer-events: none`。
- [x] 9.6 浏览器实测：连续派发 `pointermove` 时 5 个点的坐标沿路径递减（1046,730 → 1021,749），静止后收敛；悬停链接时 `.cursor-trail` 带上 `is-hot`、圆点颜色变为 `rgb(216,22,83)`；截图 `.shots/cursor-tail4.png`。

## 实施备注

### 实测数据（服务端产物 + 编译）

对运行中的 `http://localhost:3000/` 直接读 HTML 校验，全部通过：

| 检查项 | 结果 |
| --- | --- |
| 网格是真实元素 | `class="welcome-grid"` ✓ |
| 按钮内层标签 | 3 个 `welcome-label` ✓ |
| 遮罩 / 光标装饰层 | 都存在且 `aria-hidden="true"` ✓ |
| 字标逐字 span | 7 个（`LZW.LOG`）✓ |
| 旧的 CSS 内联延迟 | 已清除（`animation-delay` 不再出现在 HTML）✓ |
| 门控脚本 | 内联脚本内含 `js-ready` 与 `__welcomeMotion` ✓ |
| 单一 h1 | ✓ |

`npx tsc --noEmit` 与 `npm run build` 均通过。

### 与设计的两处偏差

1. **入场顺位从 8 条并成一条链**：`WelcomeMotion` 里用一条 `gsap.timeline()` 串联全部动作，而不是每条独立注册；总时长仍 ≈1.4s，观感一致但清理更简单（`mm.revert()` 一次回收）。
2. **光标块闪烁改用 `steps(1)` + `yoyo`**：原理等同 CSS 的 `steps(2)`，但保留在 GSAP 时间轴里，减弱动效分支天然不会注册它。

### 文字粒子化的取舍

- **为什么采样而不是"按字符生成点"**：字形的形状（`L` 的竖、`W` 的斜线、`.` 的圆）本身就是图案；逐像素采样能得到真正的字形轮廓，拼回去时才像"文字回来了"，而不是一堆点在矩形里。
- **字体必须对齐**：采样用的是 `getComputedStyle(target)` 的 `fontFamily / fontSize / fontWeight / letterSpacing`，逐字 `fillText` 并手动加字距；`document.fonts.ready` 之后再采一次，避免用回退字体采样。
- **只用一个画布循环**：激活时才起 rAF，粒子全部回位（位移 < 0.6px）就清空画布、恢复真实文字并停掉循环——静态时零开销。
- **真实文字始终在 DOM 里**：粒子激活期间只是 `opacity: 0`，`h1` 与 `aria-label` 不变，屏幕阅读器读到的仍是 `LZW.LOG`。
- **可调参数**（`TextParticles.tsx` 顶部）：`HOVER_PAD` 触发范围、`REPEL_RADIUS` 排斥半径、`SAMPLE_STEP` 密度、`DOT` 点大小，以及 step 里的斥力 `3.2` / 弹簧 `0.05` / 阻尼 `0.88`。
- **追加范围**：目前只作用在字标（`.welcome-wordmark`）。组件接受 `selector` 参数，若想把定位句也粒子化，再挂一个实例即可（只是要控制同时激活的元素数量，避免两套循环同时跑）。

### 验证降级说明（需要你看一眼）

本轮没有浏览器会话，所以**运动本身**没法观察。以下是按代码与产物确认、但观感需要你实测的四项：入场的节奏与缓动、光标跟手的延迟感、磁吸幅度（8px）是否过/不足、出页遮罩的观感。另外 `prefers-reduced-motion` 与「禁用 JS」两种降级我也只做了代码路径确认，没有实机截图。

改参数的位置很集中：`components/welcome/WelcomeMotion.tsx` 顶部的 `MAGNET_MAX` / `PARALLAX_MAX`，以及 timeline 里各段的 `duration` 与 `stagger`。

### 一个操作提醒

我在你本地 dev server 运行期间跑过 `npm run build`（两者都写 `.next`）。这次没出问题——构建后我确认 `/` 仍返回 200 且是新标记。但以后为避免互相打断，**验证构建时最好先停掉 dev server**。

## Workflow follow-up

- 提交推送 → CI 重建镜像 → 服务器 `docker compose up -d --force-recreate app`。
- 真机上验证一次 iOS Safari（`dvh` + `clip-path` + 无 hover）与一次低配笔记本（动效是否掉帧）。
- 确认无误后归档（`/openspec-archive-change`）。