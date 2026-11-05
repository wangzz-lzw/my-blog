# Design

## Context

现状核对（前提，不是猜测）：

- **包管理是 pnpm**：根目录有 `pnpm-lock.yaml` / `pnpm-workspace.yaml` / `node_modules/.modules.yaml`。`radix-ui@1.8.1` 原本只作为 `@radix-ui/themes` 的传递依赖存在，应用代码 import 不到，因此先 `pnpm add radix-ui` 变成直接依赖。
- **布局是 server component**（`app/layout.tsx`）：`<html data-theme>` + theme-init 内联脚本 + header/main/footer，原本没有任何 provider。
- **主题机制**：`<html data-theme="cyber|indigo|ember|forest|sakura|daylight">` 决定 `globals.css` 里的 CSS 变量；弹窗只要用同一批变量，就天然跟随。
- **待迁移的调用点**：`ProfileForm`（4 处）、`LoginForm`、`RegisterForm`、`CommentForm`（2 处）、`CodeBlock`（原生 `alert`）、`admin/comments`（原生 `confirm` + 2 处）、`PostEditor`（3 处）。

## Goals / Non-Goals

**Goals:**

- 一套 API 覆盖"知会 / 确认"，调用方不写 JSX，也不再出现原生弹窗与内联提示。
- 弹窗外观跟随现有六套主题，不是另一套皮肤。
- 行为可靠：焦点陷阱、Esc、焦点归还、危险操作默认停在安全项、并发排队。

**Non-Goals:**

- 不引入 `@radix-ui/themes`：它会带一份约 800KB 的全局样式表与 `.radix-themes` 基础样式，和手写的六主题变量是两套体系，冲突风险大。只借 `AlertDialog` 的行为。
- 不做 `choose()` 多选弹窗：编辑器导入的三选一保持内联确认条。
- 不做 toast。

## Decisions

### D1. 只装 `radix-ui`，不装 themes 皮肤

```
pnpm add radix-ui   # 1.8.1，`import { AlertDialog } from "radix-ui"`
```

Radix 的行为（ARIA、焦点管理、Esc、遮罩点击）是这类组件最容易写错的部分，交给它；视觉用站点 token 自己写，避免两套主题体系打架。

- 替代方案：`@radix-ui/themes` 的 `AlertDialog`，皮肤现成，但要 `<Theme>` 包全站并注入全局 CSS。已否决。

### D2. Provider 挂在 root layout，包住 header/main/footer

`FeedbackProvider` 是 client component，接收 server children。放这一层，正文里的 `CodeBlock`、页头里的组件、后台页面都能用同一个实例；弹窗通过 Portal 渲染到 body，层级不受页面结构影响。

### D3. 命令式 API + 单一宿主，Promise 化

```ts
type Api = {
  alert(opts: { title: string; description?: string; confirmText?: string }): Promise<void>;
  confirm(opts: { title: string; description?: string; confirmText?: string;
                  cancelText?: string; tone?: "default" | "danger" }): Promise<boolean>;
};
```

宿主内部维护 `head`（当前显示）+ `queue`（FIFO）+ `headRef`（供关闭逻辑读最新值）。`resolve` 统一挂在 `AlertDialog` 的 `onOpenChange(false)` 上：按钮、Esc、点遮罩三条关闭路径共用，Promise 不会悬着。用 ref 保存队首而不是在 `setState` 回调里 `resolve`，避免 StrictMode 下重复执行副作用。

- 替代方案：每个调用点写 `<AlertDialog.Root open>` + state。7 处就是 7 套样板，焦点归还各写各的，弃用。

### D4. 危险操作的安全默认

`tone: "danger"` 时确认按钮用品红系（`--accent-2`），并且「取消」在 DOM 里排第一且 `autoFocus`——回车落在安全项上。

### D5. 编辑器里的三类提示用一个 effect 兜底

`PostEditor` 已有 `error` / `aiMsg` / `hint` 三个 state、二十多处赋值。改成直接调 `notify()` 需要逐个改调用点；改用一个 useEffect 监听这三个 state：值出现就清空并弹窗。改动面最小，行为等价。

### D6. 样式只有一层，且全用既有 token

`.fb-overlay` / `.fb-dialog` / `.fb-title` / `.fb-desc` / `.fb-actions` / `.fb-btn`（`.fb-primary` / `.fb-danger`）写在 `app/redesign.css`，颜色取自 `--bg-2`、`--rule`、`--ink-2`、`--accent`、`--accent-2`；动画只在 `prefers-reduced-motion: no-preference` 下启用。

## Risks / Trade-offs

- [Portal 弹窗与编辑器全屏（`position: fixed; z-index: 90`）层级冲突] → 弹窗用 `z-index: 200/201`，高于全屏容器；全屏导入确认条仍在内联，不受影响。
- [Provider 包住全站会让整棵树成为 client 组件的子节点] → children 仍是 server-rendered RSC 载荷，不改变渲染方式，只是多一层 context。
- [在 effect 里"读到即清空"，若弹窗被快速连续触发可能合并] → 三个 state 各自独立 effect，且 provider 自身有 FIFO 队列，不会丢。
- [删除 `.notice` 样式后若有遗漏的渲染点会裸文本] → 已用 `grep` 全仓确认 `.tsx` 内无 `className="notice"`；`.editor.is-fullscreen .notice` 这条也一并删掉。
- [移除代码块复制失败的 `alert()` 后，若剪贴板 API 在非安全上下文抛错，提示走弹窗] → 与其它提示一致，不需要额外降级。

## Migration Plan

一次性替换（无数据迁移）：

1. `pnpm add radix-ui` → 新增 `FeedbackProvider` → root layout 挂载。
2. 逐个迁移 7 个调用点；每迁移一个跑一次 `tsc`。
3. 删除 `.notice` 样式，`grep` 复核，`npm run build`。
4. 回滚：`git revert` 即可；不涉及数据库。

## Open Questions

（无。范围与皮肤来源已在对话中确认：只做 alert/confirm、沿用站点样式、编辑器导入确认条不动。）