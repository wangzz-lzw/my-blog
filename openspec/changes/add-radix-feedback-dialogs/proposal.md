# Proposal

## Why

现在站点上的提示是三种互不相干的东西：两处浏览器原生弹窗（`window.confirm` 删评论、`alert` 复制失败），六处内联的 `.notice` 段落（登录/注册/评论/资料/AI/加载失败），以及一处我上轮自己写的导入确认条。它们样式不一、位置不一，原生弹窗在六套主题里更是完全脱节（浅色方框、系统字体），焦点与 Esc 行为也各靠浏览器默认。

Radix 已装进依赖，只是没有落地：`@radix-ui/themes@3.3.0` 在 `package.json` 里，但它依赖的 `radix-ui@1.8.1` 只存在于 pnpm store 的传递依赖里，应用代码 import 不到——所以第一步是把它配置成可用，第二步才是替换。

## What Changes

- **配置 Radix**：用 pnpm 补齐依赖树（`@radix-ui/themes` 真正可解析），删除多余的 `package-lock.json`（项目是 pnpm 管理，两份锁文件会互相打架），在根布局引入 `@radix-ui/themes/styles.css`。
- **主题联动**：用 `<Theme>` 包裹全站，把现有六套主题映射成 Radix 的 `appearance`（深/浅）与 `accentColor`，弹窗不再是"深色站点里弹出的白框"；主题切换时弹窗外观同步。
- **统一提示入口**：新增 `useFeedback()`，提供三个 Promise 化的方法 —— `alert()`（单按钮知会）、`confirm()`（双按钮确认）、`choose()`（多按钮选择）。调用方不再写 JSX，也不再碰原生弹窗。
- **迁移全部 8 处提示**：删评论确认、复制失败、登录失败、注册失败、评论提交结果、资料保存结果、密码修改结果、AI 摘要结果、后台加载失败；上轮的导入确认条也改用 `choose()`，拿到 3 个出口。
- 迁移完成后代码里不再出现 `window.confirm` / `alert()`，页面内不再渲染 `.notice` 提示段落。

## Capabilities

### New Capabilities

- `feedback-dialogs`: 全站提示交互契约 —— 三种弹窗语义与返回值、统一的命令式入口、主题与语言跟随、可访问性要求（焦点陷阱/Esc/焦点归还/危险操作默认停在取消）、并发排队，以及"不得再使用原生弹窗与内联提示"的收敛规则。

### Modified Capabilities

（无。`markdown-import` 的合并策略与解析规则不变——导入确认从内联条换成弹窗属于实现手段，行为契约仍是"已有内容时先让用户选择替换/追加/取消"。）

## Impact

- **代码**：新增 `components/feedback/FeedbackProvider.tsx`（API + 弹窗宿主 + FIFO 队列）、`components/feedback/ThemeShell.tsx`（主题映射）；改 `app/layout.tsx`（引入 styles.css、包一层 Theme 与 FeedbackProvider）；改 8 个调用点：`app/admin/comments/page.tsx`、`components/CodeBlock.tsx`、`components/LoginForm.tsx`、`components/RegisterForm.tsx`、`components/CommentForm.tsx`、`components/ProfileForm.tsx`、`components/admin/PostEditor.tsx`。
- **依赖**：`@radix-ui/themes` 已是直接依赖，需 `pnpm install` 让 `radix-ui` 落到顶层；删除 `package-lock.json`；`pnpm-lock.yaml` 更新。
- **体积**：`@radix-ui/themes/styles.css` 未压缩约 800KB（gzip 后数十 KB），全站生效——这是选择"直接用皮肤"的代价，实施后需在 build 输出里确认首屏影响可接受。
- **视觉回归面**：`<Theme>` 会在全站套一层 `.radix-themes` 容器，可能影响字体继承与表单控件默认外观，因此六套主题 × 主要页面都要目检一遍。
- **不在本次范围**：不把站点的颜色/字体体系迁到 Radix tokens（仍是手写 `data-theme` 变量）；不做 toast；不改后台表格与表单的结构。
- **验证口径**：`pnpm build` 通过；每个弹窗各测键盘（Esc 关闭、Tab 不逃出、关闭后焦点回到触发元素）；六套主题下弹窗底色与强调色跟随；390px 下弹窗不溢出；`grep` 确认无 `window.confirm` / `alert(` / `notice` 残留。