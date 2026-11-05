# Design

## Context

现状核对（这些是方案的前提，不是猜测）：

- **包管理是 pnpm**：根目录同时有 `pnpm-lock.yaml`（187KB）、`pnpm-workspace.yaml`、`node_modules/.modules.yaml`，另外还躺着一个 `package-lock.json`（174KB，npm 混装留下的产物）。`node_modules/.pnpm` 是符号链接布局。
- **Radix 只写进了 `package.json`**：`@radix-ui/themes@3.3.0` 在那里，但它的依赖 `radix-ui@^1.1.3`（实际装到 1.8.1）只存在于 `.pnpm` 里并被标记为 `private`（不 hoist 到顶层），所以现在 `import { Dialog } from "radix-ui"` 或 `@radix-ui/react-dialog` 都会解析失败。
- **peer 兼容**：`@radix-ui/themes` 的 peer 声明含 `^19.0`，与项目的 React 19.3 匹配。
- **体积**：`@radix-ui/themes` 的 `styles.css` 未压缩 812KB（`components.css` 431KB、`tokens.css` 177KB、`utilities.css` 252KB）。
- **布局是 server component**（`app/layout.tsx`，65 行）：`<html data-theme>` + `theme-init` 内联脚本 + header/main/footer，没有任何 provider。
- **主题机制**：`<html data-theme="cyber|indigo|ember|forest|sakura|daylight">` 决定 `globals.css` 里的 CSS 变量；`ThemeSwitcher` 只改这个属性 + `localStorage`。
- **待迁移的 8 处**：`app/admin/comments/page.tsx`（删除确认 + 加载失败）、`components/CodeBlock.tsx`（复制失败）、`LoginForm`、`RegisterForm`、`CommentForm`（成功/失败）、`ProfileForm`（保存 + 改密两组）、`PostEditor`（保存错误、AI 结果、导入确认条）。

## Goals / Non-Goals

**Goals:**

- 一套 API 覆盖"知会 / 确认 / 多选"三种提示，调用方不写 JSX，也不再出现原生弹窗与内联提示。
- 弹窗外观跟随现有六套主题，而不是在深色站点里弹一个 Radix 默认白框。
- 行为可靠：焦点陷阱、Esc、焦点归还、危险操作默认停在安全项、并发排队。

**Non-Goals:**

- 不把全站视觉迁到 Radix tokens（`globals.css` / `redesign.css` 的手写变量继续作为唯一主题来源）。
- 不做 toast / 通知中心；所有提示一律弹窗（这是本轮明确的选择）。
- 不动后台表格、编辑器布局与表单结构。
- 不用 `@radix-ui/themes` 的排版组件（Text/Heading/Card）替换现有标记，只用它的弹窗与 Theme 容器。

## Decisions

### D1. 用 pnpm 补齐依赖树，删掉多余的 `package-lock.json`

```
pnpm install          # 让 radix-ui@1.8.1 出现在顶层可解析位置
rm package-lock.json  # 两套锁文件并存会让"装了什么"变得不可信
```

保留 `@radix-ui/themes` 作为唯一直接依赖（它内含全部原语），不额外单独装 `@radix-ui/react-dialog`——那样会出现两套版本共存的隐患。

- 替代方案：继续用 npm 安装。会产生 npm 与 pnpm 两套 node_modules 布局互相污染（当前 `package-lock.json` 就是这么来的），弃用。

### D2. `<Theme>` 包全站，而不是只包弹窗

Radix Themes 的 `Dialog.Content` / `AlertDialog.Content` 是 **Portal 渲染到 `document.body`** 的，落在 `<Theme>` 的 CSS 变量作用域之外。只包弹窗的话，弹窗内容拿不到 `--color-panel`、`--accent-9` 这些变量，等于没有皮肤。所以把 `<Theme>` 放在 `<body>` 内、包住 header/main/footer。

```tsx
<ThemeShell>            {/* client：根据 data-theme 决定 appearance / accentColor */}
  <FeedbackProvider>    {/* client：useFeedback + 弹窗宿主 */}
    {header}{main}{footer}
  </FeedbackProvider>
</ThemeShell>
```

`Theme` 参数：`radius="none"`（贴合现有的 2px 直角与发丝线语言）、`panelBackground="solid"`、`grayColor="slate"`、`scaling="100%"`。

- 替代方案：给 `body` 手写挂 `.radix-themes` 类并塞一套变量。等价但绕，且要自己维护变量清单，弃用。
- 代价：`.radix-themes` 会带来一层基础样式（字体继承、控件 reset）。这是"直接用皮肤"的已知成本，D6 用回归任务覆盖。

### D3. 主题映射：`data-theme` → appearance + accentColor

| data-theme | appearance | accentColor | 依据 |
| --- | --- | --- | --- |
| cyber | dark | cyan | 主色 #00f0ff 偏青 |
| indigo | dark | indigo | 主色靛蓝 |
| ember | dark | orange | 主色橙红 |
| forest | dark | green | 主色草绿 |
| sakura | dark | pink | 主色樱粉 |
| daylight | light | cyan | 唯一的浅色主题 |

`ThemeShell` 先用默认 `dark/cyan` 渲染，挂载后在 `useEffect` 里读 `document.documentElement.dataset.theme` 并 `MutationObserver` 监听属性变化。这样服务端与客户端首帧一致（不产生 hydration mismatch），首屏后第一帧内即校正。

- 替代方案：在 `theme-init` 脚本里同时写 `data-radix-appearance`。会让那个已经很紧张的 beforeInteractive 脚本继续膨胀，且和 React 状态两条真源，弃用。

### D4. 命令式 API + 单一宿主，Promise 化

```ts
type FeedbackApi = {
  alert(opts: { title: string; description?: string; confirmText?: string }): Promise<void>;
  confirm(opts: { title: string; description?: string; confirmText?: string;
                  cancelText?: string; tone?: "default" | "danger" }): Promise<boolean>;
  choose<T extends string>(opts: { title: string; description?: string;
                  options: { label: string; value: T; tone?: "default" | "danger" }[] }): Promise<T | null>;
};
```

宿主内部维护 `queue: Request[]` 与 `current`；`push` 时若没有 current 直接展示，否则入队；关闭（`onOpenChange(false)`）时 `resolve` 并取下一个。`resolve` 放在 `onOpenChange` 里而不是按钮回调里，是为了让"点遮罩/Esc 关闭"也走同一条路径，避免 Promise 永远悬着。

- 替代方案：每个调用点自己写 `<Dialog.Root open>` + state。8 处就是 8 套样板，且焦点归还各写各的，弃用。

### D5. 组件选型：`AlertDialog` 与 `Dialog` 分工

- `alert` / `confirm` → `AlertDialog`：语义就是"必须回应的对话框"，Radix 会给它 `role="alertdialog"`，屏幕阅读器会打断当前朗读，正合适。
- `choose` → `Dialog`：三个按钮的选择不是"确认/取消"二元语义，用普通 dialog 更准确，也允许按钮自由排布。

危险操作（删除、替换）用 Radix 的 `color="red"` 变体，并把「取消」放在 DOM 第一位并 `autoFocus`，让回车落在安全项上。

### D6. 迁移映射（8 → 3）

| 调用点 | 现状 | 改成 |
| --- | --- | --- |
| `admin/comments` 删除 | `window.confirm` | `confirm({ tone: "danger", confirmText: "删除" })` |
| `admin/comments` 加载失败 | `.notice error` | `alert({ title: "加载失败" })` |
| `CodeBlock` 复制失败 | `alert()` | `alert({ title: "复制失败", description: "请手动选中后复制" })` |
| `LoginForm` 登录失败 | `.notice error` | `alert({ title: "登录失败", description: error })` |
| `RegisterForm` 注册失败 | `.notice error` | `alert({ title: "注册失败", description: error })` |
| `CommentForm` 提交成功/失败 | `.notice info/error` | `alert({ title: "评论已提交", description: "审核通过后显示" })` / `alert({ title: "提交失败" })` |
| `ProfileForm` 保存 + 改密 | 4 处 `.notice` | 各自 `alert` |
| `PostEditor` 保存错误 / AI 结果 | `.notice error/info` | `alert` |
| `PostEditor` 导入确认条 | 自建内联条 | `choose({ options: [替换, 追加, 取消] })` |

迁移后 `.notice` 的 CSS 可能只剩未使用的定义，作为收尾任务清理。

### D7. 样式只做"贴边"微调

不重写 Radix 组件样式，只用三种手段让它不违和：`radius="none"`、`panelBackground="solid"`、给弹窗内容一个类把宽度与内边距按站点节奏调一档（`.feedback-dialog { width: min(28rem, calc(100vw - 2rem)) }` 之类）。深色弹窗的底色沿用 Radix 的 dark 面板色，不强行改成 `--bg-2`——否则两套变量叠加会出脏色。

## Risks / Trade-offs

- [`.radix-themes` 的基础样式改变全站字体/控件外观] → 六套主题 × 首页/文章/登录/后台各目检一次；若输入框或按钮被改写，加一层 `:where(.radix-themes)` 作用域覆盖把关键属性钉回现有值。
- [`styles.css` 812KB 进全站] → 先按官方推荐全量引入，构建后看首屏增量；若不可接受，改引 `tokens.css` + `components.css`（省掉 utilities），或用 Next 的 `optimizePackageImports` / 只在该弹窗组件里动态引入。这条留成实施时的实测项，而不是拍脑袋选。
- [pnpm 补装可能改动既有 node_modules 布局（当前被 npm 混装过）] → 先 `pnpm install` 再跑 `pnpm build` 与 `next dev` 冒烟；失败则删 `node_modules` 重装，并把过程写进 tasks。
- [Portal 弹窗与编辑器全屏（`position: fixed; z-index: 90`）抢层级] → Radix 弹窗走 body 顶层且 z-index 更高，需在全屏写作状态下验证一次导入 `choose()` 弹窗可见。
- [队列里的 Promise 悬空] → 所有关闭路径（按钮/Esc/遮罩/`onOpenChange`）统一 resolve；再加一个"关闭后 current 置空"的断言，避免重复 resolve。
- [焦点归还到已卸载元素] → 组件卸载时若还有 current，`resolve` 掉并清空队列；触发元素消失时焦点落到 `body`，可接受。
- [浅色主题下 Radix 灰阶偏冷] → `grayColor="slate"` 与 `daylight` 的 `#243040` 观感接近；若仍偏，可在 `[data-theme="daylight"]` 下覆盖 `--gray-*`，留作实施时的手段。

## Migration Plan

分两次提交，便于回滚与验证：

1. **配置 + 宿主**：pnpm 补装、删 `package-lock.json`、引入 `styles.css`、加 `ThemeShell` 与 `FeedbackProvider`，先把 `CodeBlock` 的 `alert` 换成新 API 跑通（一个调用点、影响面最小）。
2. **批量迁移**：其余 7 处逐个替换，每处替换后手测一次；最后清理 `.notice` 残留与 `window.confirm`。

回滚：两次提交都可独立 `git revert`；第 1 步回滚后第 2 步的调用点会编译失败，所以顺序必须是先 1 后 2、回滚时倒序。

## Open Questions

（无。覆盖范围、皮肤来源、包管理器三项已在对话中确认。）