# Tasks

## 1. 源码行号注入

- [x] 1.1 在 `components/Markdown.tsx` 新增 `rehypeSourceLine` 插件：只对块级白名单（`h1~h6, p, pre, ul, ol, blockquote, table, hr, figure`）把 `position.start.line` 写成 `data-src`；插到现有 rehype 链尾部（`rehypeHighlight` 之后），不影响既有插件顺序。验证：后台预览里取 `document.querySelectorAll('.editor-prose [data-src]')`，数量与 `.editor-prose` 下块级元素数量一致，且行号都是正整数。
- [x] 1.2 校验行号语义：把某个块的 `data-src` 减一，取 `content.split("\n")` 对应下标，与该块内容对得上（标题块应取到 `## …`、代码块应取到围栏行）。验证：写一段含标题/段落/代码块/列表/引用的样稿，逐个块断言（至少覆盖这 5 类）。
- [x] 1.3 确认行内元素未被标记，且前台文章页无回归：`/posts/[slug]` 的块级元素同样带 `data-src`，段落内的 `strong/em/a/code` 不带；对比改动前后页面既有选择器（`.prose h2`、`.heading-anchor`、`.code-block`）的结构与数量不变。验证：真实浏览器取改动前后两版 DOM 快照做结构对比，并检查前台视觉无位移。

## 2. 联动算法（纯逻辑）

- [x] 2.1 新建 `components/admin/editor-scroll-sync.ts`，导出可独立调用的纯函数：`lineToTop(line, lineHeight, paddingTop)`、`topToLine(top, lineHeight, paddingTop)`、`findBlockIndex(lines, line)`（二分，返回最后一个 `lines[i] <= line`）。验证：对边界值写断言脚本并跑通——`line` 小于首块、等于某块、大于末块、空数组四种情况。
- [x] 2.2 实现 `SyncController`（类或闭包）：持有两侧元素、块行号与块偏移缓存、`driver` 状态、受控标记；方法 `measure()`、`syncFromWrite()`、`syncFromPreview()`、`setEnabled()`。验证：在 Node 环境下用假元素（提供 `scrollTop/scrollHeight/clientHeight` 的普通对象）跑单测，断言「驱动一次只产生一次对侧写入」「受控侧事件被忽略」。
- [x] 2.3 回声消除：写入对侧时记录 `{side, target}`，受控侧 `scroll` 回调里若 `scrollTop` 已等于 target 则直接返回；另叠 120ms 兜底窗口处理「目标等于当前位置、不触发 scroll」的情形。验证：单测模拟「写入 → 对侧触发 scroll → 反向再触发」的序列，断言总写入次数为 1 而不是 2、4、8。

## 3. 编辑区自绘滚动条

- [x] 3.1 新建 `components/ui/PlainScrollbar.tsx`：给原生滚动的元素（`targetRef`）叠一根只读轨道，按 `scrollTop/(scrollHeight-clientHeight)` 画滑块与刻度，沿用 `--sb-*` 与 `--accent`/`--fg` token，`position: absolute` 落在宿主右缘、不参与布局。验证：预览区与编辑区滑块宽度、刻度间距在肉眼与 computed style 上一致。
- [x] 3.2 接通事件：宿主 `scroll` 驱动滑块位置（`rAF` 合并）；handle 上 pointer 拖拽反向写 `targetRef.scrollTop`；`ResizeObserver` 观察宿主重算比例。验证：在编辑区用滚轮滚动、拖动滑块、拖高 textarea（`resize: vertical`）三种操作后，滑块位置都与真实滚动位置吻合。
- [x] 3.3 隐藏原生条且只在挂载后生效：`.editor-textarea[data-synced] { scrollbar-width: none }`，`data-synced` 由组件在挂载后打上（**不要**用只对 `/` 生效的 `html.js-ready`）。验证：禁用 JS 打开编辑器页，编辑区仍有可见的原生滚动条且可滚；启用 JS 后原生条消失、自绘条出现。

## 4. 接入 PostEditor

- [x] 4.1 在 `editor-toolbar-right` 加联动开关（`role="switch"` + `aria-checked` + 「滚动联动」文案），默认开启；状态存组件内不持久化。验证：键盘 Tab 可聚焦并用空格切换，`aria-checked` 随之改变；刷新页面后回到默认开启。
- [x] 4.2 接两侧 ref：预览侧从 `ScrollArea` 取出内部 viewport（`viewportOf`），编辑侧直接用 `textareaRef`；仅在 `mode === "split"` 且开关开启时挂监听与计算，切走时解绑并清缓存。验证：切到「编辑」「预览」单栏视图后滚动不产生对侧移动，控制台无报错；切回分屏立即恢复联动。
- [x] 4.3 双向联动接线：编辑区滚动 → 按当前顶部行找到块并顶到预览可视区；预览滚动 → 取当前可见块的行号换算成编辑区 `scrollTop`。`prefers-reduced-motion` 与常规路径都直接赋值（无动画）。验证：真实浏览器里两侧各滚一次，按 `data-src` 断言对侧落在同一块上（见第 6 组）。
- [x] 4.4 位置缓存与重测：`content` 变化（debounce 200ms）、`mode`/`fsMode` 变化、`ResizeObserver`（预览内容 + textarea 自身 + 两侧容器）都触发重测；内容变化后以编辑区为基准重新对齐。验证：在文首插入几段后继续滚动仍对齐；预览图片加载完成后仍对齐；进出全屏后仍对齐。

## 5. 样式与文档

- [x] 5.1 在 `app/globals.css` 与 `app/redesign.css` 写开关与自绘轨道的样式，只用现有 token（不新增色值）。验证：`grep` 该批新增规则内无十六进制色值；六套主题（含 `daylight`）逐个切换，两根条配色随主题变化且与页面其他滚动条一致。
- [x] 5.2 更新 `docs/DEVELOPMENT.md`：在「内容链路 → 写作台」补一段说明分屏联动的坐标依据（源码行号）、开关位置与回声消除策略；在滚动体系一节补一句「textarea 不走 `viewportOf()`」。验证：按文档描述能在代码里找到对应实现，且描述与实测行为一致。

## 6. 集成验证

- [x] 6.1 `npx tsc --noEmit` 与 `pnpm build` 通过；构建后重启 `pnpm dev` 确认无旧 chunk。
- [x] 6.2 真实浏览器全量核对（1600×1000 视口）：编辑区滚到中部后断言预览首个可见块的 `data-src <= 编辑区顶部行` 且最接近；反向再测一次；关闭开关后两侧互不影响；快速来回滚动 3 秒后两侧仍对齐且无来回抖动。
- [x] 6.3 边界场景核对：单栏「编辑」/「预览」互不干扰；全屏与站内回退两种模式下联动正常；390px 窄屏（默认进「编辑」视图）不报错；禁用 JS 时两侧可正常原生滚动、内容不被裁切。

## Workflow follow-up

- 通过评审后归档本变更（`/openspec-archive-change`），把 `editor-scroll-sync` 同步进 `openspec/specs/`。
- 归档后复核 `docs/DEVELOPMENT.md` 中关于编辑器与滚动体系的描述是否仍准确。