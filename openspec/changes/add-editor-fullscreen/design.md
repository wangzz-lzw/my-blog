# Design

## Context

见 `proposal.md` 的 Why。实现前需要知道的现状（已核对代码）：

- `components/admin/PostEditor.tsx` 是 `"use client"` 组件，根节点是 `<form className="editor">`，内部顺序固定为：`.editor-head`（标题 + 活跃动作：立即发布 / AI 摘要 / 保存）→ `.editor-meta`（5 个字段的 3 列网格）→ `.editor-split.mode-{write|split|preview}`（左 `.editor-write`：工具栏 + textarea + 状态；右 `.editor-preview`：预览头 + 预览体）。
- 视图模式是组件内 state `mode: "split" | "write" | "preview"`，窄屏（<900px）挂载时自动置为 `write`。
- 后台外壳是 `.admin-shell`（`display:flex`）→ `.admin-side`（`position:sticky` 侧栏）+ `.admin-body > main.admin-main`。`.admin-shell` 与其祖先都没有 `transform` / `filter` / `perspective`，因此后代用 `position: fixed` 是相对视口定位的——站内回退方案可行。
- 现有样式：`.editor` 是纵向 flex（gap 1.25rem），`.editor-split` 是两列 grid，`.editor-textarea` 有 `min-height: 520px` 与 `resize: vertical`，`.editor-preview .preview-body` 有自己的高度规则。全屏时必须覆盖这几条，否则内容撑不到满屏或出现双滚动条。
- 站点已有一层新的视觉层 `app/redesign.css`（覆盖页头/页脚/表单/按钮），编辑器样式仍全部在 `app/globals.css`。本次改动只碰编辑器相关选择器，不引入新的视觉语言。

## Goals / Non-Goals

**Goals:**

- 全屏进入/退出是一次纯前端的视图切换：同一套 JSX 结构只换 class，不重新挂载，因此内容、视图模式、光标天然保持。
- 原生全屏与站内回退共用同一套布局类，差别只在"谁负责尺寸"（浏览器 vs `position: fixed`），避免两套布局各写一遍、日后漂移。
- 退出路径收敛到单一真源：原生全屏以 `fullscreenchange` 为准，不靠本地布尔推断，避免"用户按了系统 Esc，按钮还写着退出全屏"。

**Non-Goals:**

- 不做全屏内保存/发布，不做自动保存与草稿（按讨论结论，退出后再保存）。
- 不做分屏比例拖拽、不做打字机模式/聚焦行高亮。
- 不做全屏偏好的跨会话记忆：原生全屏必须由用户手势触发，自动进入会被浏览器拒绝。
- 不改动 Markdown 管线、预览渲染与任何接口。

## Decisions

### D1. 三态状态机：`off | native | immersive`

```ts
const [fs, setFs] = useState<"off" | "native" | "immersive">("off");
const isFullscreen = fs !== "off";
```

进入：`requestFullscreen()` 成功 → `native`；抛错、被拒绝、或 `document.fullscreenEnabled === false` → `immersive`。退出：若 `document.fullscreenElement` 存在则先 `exitFullscreen()`，再把状态置回 `off`。

用三态而不是布尔，是因为两条路径的退出方式、清理责任不同：原生全屏由浏览器负责尺寸与 Esc，站内回退由应用负责定位、滚动锁与 Esc。一个布尔无法区分"现在该不该自己处理 Esc"。

- 替代方案：只用布尔 + 一个 `native: boolean`。等价但更容易出现"两个变量不同步"的状态，弃用。
- 替代方案：只用原生全屏，不做回退。在 iOS Safari 上元素级全屏不可用，点了没反应；已被需求排除。

### D2. 原生全屏以 `fullscreenchange` 为唯一真源

监听 `document.addEventListener("fullscreenchange", ...)`：当 `document.fullscreenElement` 变为 `null` 且当前是 `native`，把状态置回 `off`。用户用浏览器 UI 或系统快捷键退出时，界面因此能立刻同步——不依赖我们自己的按钮。

站内回退的 Esc 由应用自己处理：`keydown` 里仅当 `fs === "immersive"` 时响应 `Escape`。两者互不重叠：原生全屏下 Esc 被浏览器接管，我们的处理器不会重复触发。

同时必须在**卸载时**清理：保存成功会 `router.push("/admin/posts")`，组件卸载但浏览器仍停在全屏态。`useEffect` 的 cleanup 里判断 `document.fullscreenElement === rootRef.current` 就调用一次 `exitFullscreen()`，并移除监听、解除 body 滚动锁。

### D3. 两套定位，同一套内部布局

```css
/* 共用：原生与站内回退都一样 */
.editor.is-fullscreen { display: flex; flex-direction: column; gap: 0; height: 100dvh; padding: 0.8rem 1rem; background: var(--bg); }
.editor.is-fullscreen .editor-head,
.editor.is-fullscreen .editor-meta { display: none; }
.editor.is-fullscreen .editor-split { flex: 1; min-height: 0; }
.editor.is-fullscreen .editor-write,
.editor.is-fullscreen .editor-preview { height: 100%; min-height: 0; }
.editor.is-fullscreen .editor-textarea { flex: 1; height: auto; min-height: 0; resize: none; }
.editor.is-fullscreen .preview-body { flex: 1; min-height: 0; overflow: auto; }

/* 只有站内回退需要自己定位 */
.editor.is-immersive { position: fixed; inset: 0; z-index: 90; }
body.editor-fs-lock { overflow: hidden; }
```

要点：

- `height: 100dvh` 而不是 `100vh`：移动端地址栏收起/展开时 `100vh` 会溢出；`dvh` 跟随可视视口。原生全屏下 `:fullscreen` 元素本来就被浏览器设为视口大小，`100dvh` 取到的也是视口高度，无副作用。
- `min-height: 0` 是让 grid/flex 子项能真正收缩的关键：不加的话 textarea 的 `min-height: 520px` 会顶穿容器，出现整页滚动而不是面板内滚动。
- `z-index: 90`：高于主题菜单（70）与侧栏，低于全屏遮罩层的常规上限（100），不与其他浮层打架。
- 原生全屏还需要 `::backdrop`：浏览器默认给黑色背景，浅色主题下会突兀，故 `.editor:fullscreen::backdrop { background: var(--bg-deep); }`。

- 替代方案：站内回退也改 `.admin-shell` 的 display 来"藏侧栏"。会牵动后台其他页面与 `body:has(.admin-shell)` 的选择器，副作用大，弃用。

### D4. 入口在页头、退出在工具栏

未全屏时，`.editor-head .editor-actions` 里加「全屏写作」按钮（和保存同级，但不抢主按钮位置，用 `ghost` 样式）。全屏后 `.editor-head` 被隐藏，退出按钮移到 `.editor-toolbar` 右端（与视图切换同区），保证"任何时候都能立刻退出"。

两个位置共用一个 `<FullscreenButton>` 或直接写两段条件渲染。`aria-pressed` 用同一个值，`aria-label` 在两种状态下分别是「进入全屏写作」/「退出全屏」，图标用文本符号（`⛶` / `⤢`）避免引入图标库。

- 替代方案：只在工具栏放一个"全屏"图标（`position: sticky` 跟随）。工具栏在 `write`/`preview` 单栏模式下位置会变，且发现性差，弃用。

### D5. 进出全屏后的焦点与位置

退出时把焦点交还 textarea：`requestAnimationFrame(() => textareaRef.current?.focus())`。进入时不主动抢焦点（保持用户当前在标题栏或正文里的操作位置）。

不重新挂载 `.editor-split`、不给 textarea 换 `key`，因此输入内容、选择区间、面板内滚动位置都由浏览器保留；`mode` 是组件 state，自然不变。

### D6. 窄屏与模式

全屏不改变 `mode`。窄屏本来就默认 `write`，全屏后即"正文占满 + 工具栏在顶部换行"，符合预期。若用户在全屏前手动选了 `split`，窄屏下两栏会各占一半——这是用户的选择，不做自动改写，但工具栏的可换行与 `min-width: 0` 保证不会横向溢出。

### D7. 不提供全屏内保存

按讨论结论，全屏内只留正文与预览。风险是"写完想存但找不到按钮"，缓解有三条：退出按钮常驻工具栏右端、Esc 一条键退出、退出后表单内容与光标原样恢复。

记录为可后续追加的选项：若日后要做"全屏内保存"，只需在工具栏加一个提交按钮并把 `.editor-actions` 的主按钮用 `form="editor-form"` 关联进来，不影响本次结构。

## Risks / Trade-offs

- [祖先有 transform 会让 `position: fixed` 相对祖先定位] → 已核对 `.admin-shell` / `.admin-body` / `.admin-main` 均无 `transform`/`filter`；实现后仍需在 1280 与 390 两档实测覆盖是否贴合视口。
- [原生全屏下容器被提升到 top layer，`height: 100dvh` 与浏览器给出的尺寸可能差 1–2px，出现细滚动条] → 面板内统一 `min-height: 0` + 各自 `overflow: auto`，外层 `overflow: hidden`，把滚动限制在内层。
- [卸载时未退出原生全屏，用户保存后停在"像卡死"的全屏态] → cleanup 中主动 `exitFullscreen()`；并在 tasks 里加一条"保存成功后退出全屏"的实测。
- [Esc 处理器误吞普通输入] → 只在 `immersive` 分支注册与响应，且不 `preventDefault` 其他按键；`native` 分支完全不监听 Esc。
- [浅色主题下原生全屏的黑色 backdrop 突兀] → `::backdrop` 跟随 `--bg-deep`。
- [iOS Safari 的 `100dvh` 与地址栏动画] → 使用 `dvh`；若旧浏览器不支持则回退 `100vh`（CSS 双写），不引入 JS 测量。
- [全屏里隐藏了带 `required` 的标题输入] → 全屏内没有提交按钮，且 textarea 内 Enter 不会提交表单；退出后标题字段重新可见，原生校验恢复正常。

## Migration Plan

纯前端改动，无数据库、无环境变量、无接口变更。

1. 本地 `npm run dev`，在新建/编辑文章页手测四条路径（原生进入→按钮退出、原生进入→系统 Esc、站内回退进入→Esc、站内回退→按钮），并在六套主题与 390px 下各看一次。
2. `npx tsc --noEmit` 与 `npm run build` 通过后提交，走既有 GitHub Actions 部署。
3. 回滚：`git revert` 该提交即可；不涉及数据，回滚后编辑器回到"无全屏入口"的现状。

## Open Questions

（无。全屏形态、全屏内保留内容、是否在全屏内存档均已在对话中确认。）