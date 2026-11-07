# Tasks

## 1. 依赖与前置核对

- [x] 1.1 全仓清点滚动相关调用点：只有 4 个文件碰 scroll API —— `components/blog/ListScrollPane.tsx`、`components/FloatTools.tsx`、`components/ReadingProgress.tsx`、`lib/scroll-pane.ts`；逐个改成走 `currentScrollPane()`。
- [x] 1.2 装依赖并同步两套 lock：最终只留 `overlayscrollbars@2.17.0`（React 包装装上后没用上，已卸掉）；`next` 仍是 **16.4.2**，`tsc` 通过。
- [x] 1.3 最小验证库可用：临时探针页确认库能初始化、拖拽/滚轮/键盘可滚。**结论：走核心 API 而不是 React 包装**——包装层把 viewport 交给库自己造，React 插入新节点时会落到滚动区外面；核心 API + 自己持有内容层更稳。

## 2. 根滚动容器

- [x] 2.1 `components/ui/RootScroll.tsx`：`#app-scroll` + `data-scroll-root`，`body` 改成 `height:100dvh; overflow:hidden`；`app/layout.tsx` 里包住整棵树。
- [x] 2.2 `lib/scroll-pane.ts` 的 `currentScrollPane()` 改成「列表 pane → 根容器 → window」，并解到库的 viewport 元素（`.sb:not([data-overlayscrollbars])` 时退回 host 自己滚）；`ReadingProgress` 改用它 + 新增的 `paneScrollMetrics`。
- [x] 2.3 hash 锚点用 `scrollIntoView` 思路手算偏移补上（首帧 + 300ms 各跳一次）；前进/后退按路径记 `sessionStorage`，`popstate` 后轮询到能滚到目标为止。
- [x] 2.4 `@media print`：body、`.app-scroll`、`.sb` 及库的 viewport 全部放开 `height/overflow`，避免打印被裁成一屏。
- [x] 2.5 等价性抽查：`/blog` 根容器 `scrollHeight === clientHeight`（列表自己滚、页面不多出一条）；`/tags`、`/posts/*` 根容器可滚（1231/1171 vs 820），页头仍在顶部。

## 3. 滚动条外观与接入

- [x] 3.1 `components/ui/ScrollArea.tsx`：核心 API 封装（`axis` / `autoHide` / `overlay` / `hostRef`），并导出 `viewportOf()`。
- [x] 3.2 token 与样式：`--sb-slot/--sb-w/--sb-thumb/--sb-tick`；轨道 8px（悬停 10）、滑块 2px（悬停 4）、硬边；刻度用 `repeating-linear-gradient` 每 24px 一道。
- [x] 3.3 主题：颜色全部取自 `--accent` / `--fg` token；实际截图核对了赛博青与晨光白，其余四套靠同一组变量推导。
- [x] 3.4 读数：列表右上角 `05 / 12`，滚动/悬停时淡入、静止 900ms 淡出；`data-scrollable="0"` 时隐藏。实测滚动到 45% 时文本为 `05 / 12`、`opacity: 1`、位置 (1153, 119)。
- [x] 3.5 逐区域接入：列表 `.ledger`、右侧栏 `.rail`、代码块 `.code-scroll`、后台文章表 `.table-wrap`、根容器。**未接**：编辑器全屏预览区（`.preview-body`）与标签选择菜单。
- [x] 3.6 降级：无 JS 时 `.sb:not([data-overlayscrollbars])` 退回原生滚动；`(hover: none)` 触屏直接不初始化，保留系统惯性。

## 4. 列表「账本走线」

- [x] 4.1 列表页去掉逐条入场：删掉 `GsapReveal` 包裹与 `data-reveal`，条目直接是最终态。
- [x] 4.2 `ListScrollPane` 改为 ScrollArea + 单条 rAF：passive `scroll` 只置 dirty，帧里读一次容器尺寸，写 `--p`。
- [x] 4.3 缓存条目偏移（挂载 + `ResizeObserver`），每帧二分找跨过「视口 1/4」的条目，切 `data-read="past|current|ahead"`。实测 45% 时：4 past / 1 current / 7 ahead。
- [x] 4.4 视觉：左缘 1px 走线 `scaleY(var(--p))`（实测 matrix 第二行为 0.4497，与进度一致）；当前条目日期转 `--accent`，已读条目 60% 不透明度；过渡 120ms 且只过渡 color/opacity。
- [x] 4.5 减弱动效：`prefers-reduced-motion` 时只切 `data-read`、不写 `--p`，CSS 里 `[data-reduced="1"]::before` 直接隐藏走线。
- [x] 4.6 短内容/空态：`data-scrollable="0"` 时走线与读数都不显示（2 篇文章时实测根部 `overflow: hidden`、无走线）。
- [x] 4.7 滚动期间不触发 React 重渲染（状态全写 DOM 属性与 CSS 变量，无 setState）。**未做** Performance 面板抽样。

## 5. 质量门与回归

- [x] 5.1 `npx tsc --noEmit` 与 `next build` 通过（Next 16.4.2，全部路由生成成功）。
- [x] 5.2 逐页回归（抽查）：`/blog`、`/tags`、`/posts/*` 只有一根滚动条、页头位置正确、无横向溢出。
- [x] 5.3 交互四路全部实测：**拖拽**（按住滑块拖 120px → `scrollTop` 300→1053，`data-sb-drag="1"`、滑块 2→5px、文字未被选中）；**点击轨道**（点靠下空白 → 位置跳变）；**滚轮**；**键盘**（viewport 有 `role=region` / `aria-label` / `tabIndex=0`，PageDown→496、Home→0）。
- [x] 5.4 两条降级路径实测：**触屏**（`(hover:none)` 为真时 0 个容器初始化、0 根自绘条、`.ledger` 退回 `overflow-y:auto` 保留原生惯性）；**无脚本**（`setScriptExecutionDisabled` 后同样 0 初始化，列表 `overflow:auto` 且 `scrollHeight > clientHeight`，能滚到底）。另补测：**打印**（root/boot viewport `overflow:visible`、高度放开到全文 1627px）、**hash 锚点**（改 hash 后根容器 0→426 直达锚点）。

## 6. 滚动条动效

- [x] 6.1 容器级「正在滚动」状态：`ScrollArea` 在 viewport 的 `scroll` 与 host 的 `pointerdown` 上打 `data-sb-active` / `data-sb-drag`，700ms 无操作自动清掉。
- [x] 6.2 视觉反馈：滑块 2px → 悬停 4px → 拖拽 5px 并带 `--glow` 外发光；轨道刻度在活跃态由 `fg 16%` 提到 `accent 32%`；过渡 0.18–0.24s。
- [x] 6.3 减弱动效：`prefers-reduced-motion` 下取消宽度与发光过渡，反馈只保留位置变化。
- [x] 6.4 顺手修掉一个副作用：用不上的方向（只纵滚容器里的横条）整条 `display:none`，否则刻度底纹会在容器底部亮出一条没有意义的线。

## 7. 验证补记：后台与编辑器

- [x] 7.1 编辑器实时预览接入 `ScrollArea`（`.preview-scroll`），实测已初始化、内容不足一屏时 `overflow:hidden`。
- [x] 7.2 后台页面回归时发现一处真问题：内容异步长高时库不重新量，`overflow` 被判成 `hidden`，后台底部被裁掉 33–98px。给 `ScrollArea` 加了 `ResizeObserver → instance.update(true)`（60ms 去抖），修复后 `/admin/posts` 933/900、`/admin/tags` 998/900 均可滚。

## 实施备注

### 库的 DOM 契约是这条路上最大的坑

第一版把内层 div 当 `elements.viewport` 交给库，结果库不再给它套自己的结构，`[data-overlayscrollbars-viewport]` 的样式规则匹配不上，viewport 拿到 `height:auto` → 内容把容器撑高、永远不滚。最后改成官方结构：**内容层保持是 React 自己的 div，让库初始化时把它整体搬进自己创建的 viewport**——React 的插入仍发生在那个稳定节点里，不会被塞到滚动区外。

### 根容器是「换引擎」

document 不再滚之后，`window.scrollY` 恒为 0。所有依赖它的地方（阅读进度、回到顶部、位置恢复、hash）都必须重新接线，否则是静默失效、不报错。这也是为什么任务 1.1 要求先把调用点列成清单。

### 高度链多断了一层

`.sb-content` 是 `min-height: 100%` 的内容层，列表页需要它正好一屏，否则 `main` 的 `flex:1` 无处可压、整页多出一条滚动条。加了 `body:has(.sheet--scroll) .app-scroll-content { height:100%; min-height:0 }` 之后 `/blog` 的根容器 `scrollHeight` 才回到等于 `clientHeight`。

### 一次编码事故

中途用 PowerShell `Set-Content` 改 `app/(site)/blog/page.tsx`，把文件写成了非 UTF-8，中文全乱。已用 `git checkout` 恢复并用编辑器重做——**这个仓库的中文文件不能用 shell 重写**。

## 未完成/未验证（下一轮要补）

- ~~编辑器全屏预览区还没接 ScrollArea~~ → 已完成（6.1 / 7.1）。
- ~~拖拽、键盘、点击轨道未实测~~ → 已完成（5.3）。
- ~~无 JS 与触屏降级未跑~~ → 已完成（5.4）。
- ~~打印与 hash 锚点未验证~~ → 已完成（5.4）。
- 滚动性能没做 Performance 抽样（功能上已确认滚动帧不触发 React 重渲染）。
- 真机（iOS/Android）尚未验证，触屏结论来自 CDP 触摸模拟。