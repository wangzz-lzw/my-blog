# Proposal

## Why

站点上的提示原本是三种互不相干的东西：两处浏览器原生弹窗（`window.confirm` 删评论、`alert` 复制失败），以及散落在七个组件里的内联 `.notice` 段落。样式不一、位置不一，原生弹窗在六套主题里更是完全脱节（浅色方框、系统字体），焦点与 Esc 行为各靠浏览器默认。

## What Changes

- **引入 Radix**：`radix-ui`（无头原语，含 `AlertDialog`）作为直接依赖，只借它的行为——焦点陷阱、Esc、`role="alertdialog"`、关闭后焦点归还；样式全部用站点既有的 `data-theme` 变量，不引入 `@radix-ui/themes` 的整套皮肤。
- **统一提示入口**：新增 `useFeedback()`，提供两个 Promise 化方法 —— `alert()`（单按钮知会）、`confirm()`（双按钮确认，返回布尔）。调用方不再写 JSX，也不再碰原生弹窗。
- **迁移全部提示**：登录/注册/评论/资料保存/头像上传/密码修改/AI 摘要/复制失败/后台加载失败改为 `alert`；后台删除评论改为 `confirm`。
- 迁移完成后业务代码里不再出现 `window.confirm` / `alert()`，页面内不再渲染 `.notice`，对应的 CSS 一并删除。

## Capabilities

### New Capabilities

- `feedback-dialogs`: 全站提示交互契约 —— 两种弹窗语义与返回值、统一的命令式入口、主题跟随、可访问性（焦点陷阱/Esc/焦点归还/危险操作默认停在取消）、并发排队，以及"不得再使用原生弹窗与内联提示"的收敛规则。

### Modified Capabilities

（无。`markdown-import`、`admin-editor` 的行为契约不变：编辑器里的三选一确认条保持内联，不使用弹窗。）

## Impact

- **代码**：新增 `components/feedback/FeedbackProvider.tsx`；改 `app/layout.tsx`（包一层 Provider）；迁移 7 个调用点：`ProfileForm`、`LoginForm`、`RegisterForm`、`CommentForm`、`CodeBlock`、`app/admin/comments/page.tsx`、`components/admin/PostEditor.tsx`；`app/globals.css` 删除 `.notice` 样式。
- **依赖**：`pnpm add radix-ui@1.8.1`（已有 `@radix-ui/themes` 仍在依赖里，但本项目不 import 它）。
- **体积**：只按需引入 `AlertDialog` 相关模块，没有 `@radix-ui/themes` 那份约 800KB 的全站样式表。
- **不在本次范围**：多按钮 `choose()`（编辑器导入确认条保持内联）；toast/通知中心；把全站视觉迁到 Radix tokens。
- **验证口径**：`npx tsc --noEmit` 与 `npm run build` 通过；`grep` 确认无 `window.confirm` / `alert(` / `.notice` 残留；每个弹窗各测键盘（Esc 关闭、焦点归还）。