# Tasks

## 1. 依赖与宿主

- [x] 1.1 `pnpm add radix-ui`（1.8.1）把无头原语变成直接依赖；验证：`node_modules/radix-ui` 存在，`import { AlertDialog } from "radix-ui"` 可解析。
- [x] 1.2 新建 `components/feedback/FeedbackProvider.tsx`：`useFeedback()` 返回 `alert` / `confirm`（Promise 化），宿主用 Radix `AlertDialog` 渲染，内部维护 `head + FIFO queue`；验证：`tsc` 推断出返回类型。
- [x] 1.3 `resolve` 统一挂在 `onOpenChange(false)` 上（按钮 / Esc / 点遮罩共用）；用 ref 保存队首，避免在 setState 回调里 resolve；验证：连续触发两个 `alert`，两个 Promise 按序完成，无重复 resolve。
- [x] 1.4 `app/layout.tsx` 用 `<FeedbackProvider>` 包住 header/main/footer；验证：正文、后台页面里的组件都能取到 context（否则开发环境直接抛"必须在 Provider 内使用"）。
- [x] 1.5 `app/redesign.css` 增加弹窗样式（`.fb-overlay/.fb-dialog/.fb-title/.fb-desc/.fb-actions/.fb-btn` 及 primary/danger），颜色全部取自既有 token；`prefers-reduced-motion` 下不播动画；验证：六套主题下弹窗底色与强调色跟随。
- [x] 1.6 危险操作：`tone: "danger"` 时确认按钮用品红系，「取消」在 DOM 里排第一且 `autoFocus`；验证：打开删除弹窗直接回车，结果是取消。

## 2. 迁移调用点

- [x] 2.1 `components/ProfileForm.tsx`：头像上传结果、保存结果、密码修改（含两次输入不一致）4 处 `.notice` 换成 `alert`；验证：四条路径各走一次，弹窗文案与语义一致。
- [x] 2.2 `components/LoginForm.tsx`：登录失败换 `alert`，删除内联 `.notice`；验证：输错密码弹窗出现，关闭后表单内容保留。
- [x] 2.3 `components/RegisterForm.tsx`：注册失败/网络异常/两次密码不一致换 `alert`；验证：三条路径各一次。
- [x] 2.4 `components/CommentForm.tsx`：提交成功与失败换 `alert`，移除 `.notice` 分支；验证：提交成功后弹「评论已提交」，输入框清空的既有行为不变。
- [x] 2.5 `components/CodeBlock.tsx`：原生 `alert("复制失败…")` 换成 `alert({ title: "复制失败", … })`；验证：剪贴板写入失败路径弹窗出现。
- [x] 2.6 `app/admin/comments/page.tsx`：`window.confirm` 换 `confirm({ tone: "danger", confirmText: "删除" })`；审核失败与加载失败换 `alert`；验证：取消不发请求、确认才调用 DELETE。
- [x] 2.7 `components/admin/PostEditor.tsx`：`error` / `aiMsg` / `hint` 三个 state 各加一个 effect——出现即清空并弹窗；移除三处内联 `.notice`；验证：保存失败、AI 生成、图片上传提示都走弹窗。

## 3. 收敛与验证

- [x] 3.1 `app/globals.css` 删除 `.notice` / `.notice.error` / `.notice.info`，`app/redesign.css` 删除 `.editor.is-fullscreen .notice`；验证：`grep` 全仓 `.css` 无 `.notice` 定义。
- [x] 3.2 全仓 `grep`（`.tsx`）：`className="notice"`、`window.confirm`、`alert(` 均为 0 处；验证：grep 无输出。
- [x] 3.3 `npx tsc --noEmit` 与 `npm run build` 通过；验证：两条命令退出码为 0。
- [x] 3.4 dev server 冒烟：`/`、`/login`、`/tags`、`/profile` 正常响应；验证：状态码 200（`/profile` 未登录为 307 属预期）。

## 实施备注

- **皮肤来源改了**：原计划用 `@radix-ui/themes` 的整套皮肤 + `<Theme>` 包全站，实施时改为只装 `radix-ui` 的 `AlertDialog`（无头），样式写进 `app/redesign.css` 并复用站点 token。理由：themes 会注入约 800KB 全局 CSS 与 `.radix-themes` 基础样式，与手写的六套 `data-theme` 变量是两套体系；而且同一轮刚做的页头下拉菜单也是这个路子，保持一致。
- **`choose()` 未实现**：编辑器「导入 md」的三选一确认条保持内联（用户明确要求不动编辑器）。因此 spec 里对应的那条要求已从 delta 中删除，归档后的主 spec 只描述 `alert` / `confirm`。
- **弹窗视觉未截图**：实施时浏览器会话不可用，只做了 SSR/构建/类型与 grep 层面的验证；交互（Esc、焦点归还）依赖 Radix 自身行为。

## Workflow follow-up

- 推送后走既有 GitHub Actions 部署；线上点一次「保存修改」与后台「删除评论」确认弹窗表现。
- 归档本变更（`/openspec-archive-change`）。