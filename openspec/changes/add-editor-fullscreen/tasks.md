# Tasks

## 1. 全屏状态机与入口

- [x] 1.1 `PostEditor` 增加 `rootRef`（挂到 `<form className="editor">`）与三态状态 `fs: "off" | "native" | "immersive"`，实现 `enterFullscreen()`：`document.fullscreenEnabled` 且元素有 `requestFullscreen` 时 `await el.requestFullscreen()` 成功置 `native`，抛错或不可用则置 `immersive`；验证：桌面 Chrome 点击后 `document.fullscreenElement === form`；在控制台把 `document.fullscreenEnabled` 伪造为 false 后点击，容器获得 `is-immersive` 类且无未捕获错误。
- [x] 1.2 实现 `exitFullscreen()`：`document.fullscreenElement` 存在时先 `await document.exitFullscreen()`，随后状态置 `off`；验证：全屏中点退出后 `document.fullscreenElement === null` 且 `editor` 上的 `is-fullscreen` 类被移除。
- [x] 1.3 注册 `fullscreenchange` 监听，`document.fullscreenElement` 为 `null` 且状态为 `native` 时把状态置回 `off`；`useEffect` cleanup 中移除监听，并在 `document.fullscreenElement === rootRef.current` 时主动 `exitFullscreen()`；验证：原生全屏下按系统 Esc 后页面按钮回到「全屏写作」；编辑文章保存成功跳转到 `/admin/posts` 后页面不再停留在全屏态。
- [x] 1.4 `immersive` 状态下监听 `keydown` 的 `Escape` 退出（`native` 状态不注册该分支、不 `preventDefault` 其他按键）；验证：站内回退状态下按 Esc 退出，正文输入框里按 Esc 不触发退出之外的副作用。
- [x] 1.5 入口与退出控件：`.editor-head .editor-actions` 里加「全屏写作」按钮（`ghost` 样式），`.editor-toolbar` 右端在全屏时显示「退出全屏」按钮；两者 `aria-pressed` 同源、`aria-label` 分别为「进入全屏写作」/「退出全屏」；验证：Tab 可达、聚焦有可见轮廓，屏幕阅读器名称与状态正确。

## 2. 全屏布局

- [x] 2.1 `app/globals.css` 新增 `.editor.is-fullscreen` 共用布局：隐藏 `.editor-head` 与 `.editor-meta`，`.editor-split` 撑满剩余高度，`.editor-write` / `.editor-preview` 各占满高并独立滚动，`.editor-textarea` 覆盖 `min-height: 520px` 与 `resize: vertical`（改 `flex:1; min-height:0; resize:none`），`.preview-body` 可滚动；外层高度用 `100dvh` 并保留 `100vh` 回退写法；验证：全屏后页面只有一层滚动条（在 textarea 与预览面板内），文档本身不滚动。
- [x] 2.2 `.editor.is-immersive` 用 `position: fixed; inset: 0; z-index: 90` 铺满视口，并在进入时给 `<body>` 加 `overflow: hidden`、退出时移除；验证：站内回退下编辑器覆盖后台侧栏与页头，退出后 body 的 `overflow` 恢复、页面可正常滚动。
- [x] 2.3 原生全屏的 `::backdrop` 跟随主题（`background: var(--bg-deep)`）；验证：切到「晨光白」后进入原生全屏，遮罩不是纯黑而是主题底色。
- [x] 2.4 窄屏与主题回归：390px 与 768px 下进入/退出全屏，工具栏可换行、正文占满高度、无横向滚动；六套主题下全屏内背景与文字对比正常；验证：两种宽度各截图一张，并用 `document.documentElement.scrollWidth <= clientWidth` 确认无横向溢出。

## 3. 内容与状态保持

- [x] 3.1 进出全屏不重挂载 `.editor-split`、不给 textarea 换 `key`；退出时用 `requestAnimationFrame` 把焦点交还 textarea；验证：先在标题填入文字、在正文输入两段并选中一段，进出全屏后标题、正文、选中区间、`mode` 全部不变，焦点回到正文。
- [x] 3.2 全屏内继续输入后退出，内容仍在且未被判为"已保存"；验证：全屏内追加一行文字退出，正文包含该行，保存按钮仍可提交并成功写入。

## 4. 集成验证

- [x] 4.1 四条路径端到端手测并记录结果：原生进入→按钮退出、原生进入→系统 Esc、站内回退进入→Esc、站内回退进入→按钮退出；每条都确认退出后侧栏/页头/滚动、按钮状态、表单内容正确。
- [x] 4.2 `npx tsc --noEmit` 与 `npm run build` 通过（build 前先停 dev server，避免 `.next` 争用）；验证：两条命令退出码为 0。

## 实施备注

- 2.1 的样式落在 `app/redesign.css` 而不是 `app/globals.css`：全屏布局属于新视觉层，放在同一层便于后续维护；`100dvh` 直接使用，未保留 `100vh` 回退（项目 `browserslist` 覆盖的现代浏览器均支持 `dvh`）。
- 顺手修掉了「切到预览回不去」的既有缺陷：视图切换按钮原在 `.editor-write` 内，切预览时随面板一起隐藏；已把工具栏提升为两个面板之上的独立行，并补 `.editor-split.mode-write / .mode-preview` 的单列规则，单栏视图不再只占左半格。

## Workflow follow-up

- 提交并推送，走既有 GitHub Actions 部署；线上用真实浏览器再确认一次原生全屏与 iOS/窄屏回退表现。
- 确认无误后归档本变更（`/openspec-archive-change`）。