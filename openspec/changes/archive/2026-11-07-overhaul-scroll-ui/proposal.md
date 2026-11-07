# Proposal

## Why

滚动条是这一版最扎眼的一处「外来件」：15px 宽、带上下三角箭头、颜色由操作系统决定。上次做列表内部滚动时已经确认过——只要接管 `::-webkit-scrollbar`，Chrome 就退回这套经典渲染，那对箭头还压不掉；当时的结论是「不接管外观、只声明 `color-scheme`」，把问题绕过去了，**但丑这件事没解决**。

另一半是「读起来的感觉」：列表的滚动只完成了归属（列表自己滚），没有完成方位感——滚到哪一屏、读到第几条，全靠自己数；条目之间也没有随滚动产生的层次。

所以这次做两件事：**把系统绘制的那条滚动条换成自己画的**（全站可滚区域统一），并**给文章列表加一层跟随阅读位置的连续动画**（不是逐条淡入上浮那种模板效果）。

## What Changes

- **引入滚动条库**：`overlayscrollbars`（v2，含 React 包装）。原生滚动条被隐藏，轨道与滑块由我们渲染——这才是能做成「读数尺」外观的前提（细轨 + 刻度薄片 + 悬停读数），同时保住拖拽、点击轨道跳转、键盘可达。
- **全站可滚区域统一**：列表、右侧栏、正文与后台的代码块、后台表格、编辑器分栏，换成同一套。
- **页面滚动也归这套管**：给应用套一层根滚动容器（`body` 不再滚），否则每页最右侧那根系统滚动条仍是旧的。代价是 hash 定位、后退恢复、打印、`window.scrollY` 相关逻辑都要逐一对齐（见 Impact）。
- **外观**：8px 视觉宽的细轨、2px 亮青滑块叠刻度纹理，悬停/拖拽时滑块加宽并浮出等宽数字读数（`03 / 14` 或百分比）；六套主题全部跟随。
- **列表的「账本走线」**：列表左缘一条随滚动推进的细线（进度）+ 一个当前读数点；跨过阅读线的条目日期点亮，已读条目压暗；滚动条刻度与条目数对齐。
- **降级**：触屏隐藏自定义条、保留原生惯性滚动；无 JS 时退回原生滚动条（内容照常可滚）；`prefers-reduced-motion` 时取消动画但保留静态位置提示。

## Capabilities

### New Capabilities

- `custom-scrollbars`: 全站滚动条的契约 —— 覆盖哪些区域、外观如何随主题变、滑块比例与最小尺寸、拖拽/轨道点击/键盘行为、嵌套滚动、触屏与无 JS 降级，以及「页面滚动迁到根容器后行为不变」这条等价性要求。
- `ledger-scroll-motion`: 文章列表随滚动产生的连续动效 —— 进度走线、阅读线状态（点亮/压暗）、读数出现时机、与既有入场动画的关系、减弱动效与性能边界。

### Modified Capabilities

（无。`blog-list-scrolling` 的三条契约——列表是滚动容器、键盘可达、后退恢复位置——一条都没变；本变更只换它的外观与动效，不改这些行为。）

## Impact

- **依赖**：新增 `overlayscrollbars`（+ React 包装）。本仓库同时有 `pnpm-lock.yaml` 与 `package-lock.json`，Docker 走 `npm ci`，**两个 lock 都要更新**；`next` 必须保持 16.4.2（任何 `pnpm add` 都可能顺手顶版本，导致 HTML 正常但全站不水合）。
- **代码**：新增 `components/ui/ScrollArea.tsx`（元素级滚动容器）与 `components/ui/RootScroll.tsx`（根滚动容器）；改 `app/layout.tsx`、`app/globals.css`、`app/redesign.css`、`components/blog/ListScrollPane.tsx`、`lib/scroll-pane.ts`、`components/FloatTools.tsx`、`components/ReadingProgress.tsx`。
- **行为面**：页面滚动从 document 迁到根容器后，`window.scrollY` 恒为 0 —— hash 锚点、浏览器后退恢复、打印、`position: sticky` 的参照物、`body:has()` 限高等都要重新核对。
- **风险**：库与 React 19 / Next 16 的兼容性；根容器对既有高度链（`body` 100dvh、`.list-host`）的连带影响；iOS 惯性滚动与 `overscroll-behavior` 的相互干扰；滚动条节流不当会让滚动掉帧。
- **验证口径**：六套主题外观一致；拖拽 / 点击轨道 / 键盘 / 触屏四路可用；hash 与后退位置仍正确；走线与读数跟手；无 JS 时能滚；`tsc` 与 `build` 通过；滚动期间主线程无长任务。
- **不在本次范围**：ScrollSmoother 式平滑滚动（与原生惯性打架）、把滚动条做成"地图缩略图"、移动端自定义手势、滚动条上做可点击的分段导航。