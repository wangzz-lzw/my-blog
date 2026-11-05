# Tasks

## 1. 依赖与主题配置

- [ ] 1.1 用 pnpm 补齐依赖树：执行 `pnpm install`，确认 `node_modules/radix-ui` 已落到顶层可解析位置（`Test-Path node_modules/radix-ui` 为 True，`pnpm ls @radix-ui/themes` 无 unmet peer）；验证：能 `import { Dialog } from "radix-ui"` 而不报模块解析错误。
- [ ] 1.2 删除多余的 `package-lock.json`，确认 `pnpm-lock.yaml` 仍在且被本次安装更新；验证：根目录只剩一套锁文件，`git status` 里能看到 lockfile 变更与 lock 文件删除。
- [ ] 1.3 `app/layout.tsx` 引入 `@radix-ui/themes/styles.css`（在 `globals.css`/`redesign.css` 之前引入，保证我们的样式能覆盖它），并用 `ThemeShell` 包住 body 内容；验证：页面根节点出现 `.radix-themes`，`--accent-9` 等变量存在。
- [ ] 1.4 实现 `components/feedback/ThemeShell.tsx`：按 design 的映射表把 `data-theme` 转成 `appearance` 与 `accentColor`（cyber→cyan、indigo→indigo、ember→orange、forest→green、sakura→pink、daylight→cyan+light），挂载后读 `document.documentElement.dataset.theme` 并用 `MutationObserver` 跟随切换；验证：切换六套主题时读 `.radix-themes` 的 `data-accent-color` 与 `class`（dark/light）随之变化，且首次渲染无 hydration 警告。
- [ ] 1.5 全站基础样式回归：六套主题 × 首页/文章页/登录页/后台编辑器各看一眼，重点确认字体继承、`input`/`button`/`table` 外观未被 `.radix-themes` 改写；若被改写，用 `:where(.radix-themes)` 作用域把关键属性钉回现有值；验证：截图对比改造前后同类页面，无字体或控件跳变。

## 2. FeedbackProvider

- [ ] 2.1 新建 `components/feedback/FeedbackProvider.tsx`：实现 `useFeedback()` 返回 `alert` / `confirm` / `choose` 三个 Promise 化方法，类型按 design 的 `FeedbackApi`；宿主组件用 Radix Themes 的 `AlertDialog`（alert、confirm）与 `Dialog`（choose）渲染；验证：在任一页面临时调用三种方法的返回类型被 `tsc` 正确推断。
- [ ] 2.2 实现 FIFO 队列：同一时刻只显示一个弹窗，后到的请求入队，关闭后自动展示下一个；`resolve` 统一放在 `onOpenChange(false)` 路径上（按钮、Esc、点遮罩都走它）；验证：连续触发两次 `alert`，两个 Promise 按序完成，控制台无重复 resolve 警告。
- [ ] 2.3 危险操作的安全默认：`confirm({ tone: "danger" })` 时确认按钮用红色变体，DOM 顺序上「取消」在前且 `autoFocus`；验证：打开删除弹窗后直接按回车，结果是取消而不是删除。
- [ ] 2.4 弹窗尺寸与窄屏：给弹窗内容加站点类名，宽度 `min(28rem, calc(100vw - 2rem))`，按钮在窄屏可换行堆叠；验证：390px 下三种弹窗均完整落在视口内，无横向滚动，按钮不重叠。
- [ ] 2.5 可访问性验证：键盘 Tab/Shift+Tab 在弹窗内循环、Esc 关闭、关闭后焦点回到触发按钮；确认类弹窗在 DOM 中为 `role="alertdialog"` 且标题/说明通过 `aria-labelledby`/`aria-describedby` 关联；验证：纯键盘走完三种弹窗，用 DevTools 可访问性面板核对角色与名称。

## 3. 迁移 8 处调用点

- [ ] 3.1 `components/CodeBlock.tsx`：把 `alert("复制失败，请手动选中复制")` 换成 `alert({ title: "复制失败", description: "请手动选中后复制" })`；验证：在无法写入剪贴板的场景（或临时 mock 抛错）下触发，弹窗出现且文案正确。
- [ ] 3.2 `app/admin/comments/page.tsx`：删除确认换 `confirm({ tone: "danger", confirmText: "删除" })`，加载失败换 `alert`；验证：点删除先弹确认，取消不发请求、列表不变；确认后调用接口且列表移除。
- [ ] 3.3 `components/LoginForm.tsx` 与 `components/RegisterForm.tsx`：错误提示换 `alert({ title: "登录失败"/"注册失败", description: error })`，删除内联 `.notice` 渲染；验证：故意输错密码/重复用户名，弹窗出现且关闭后表单内容保留。
- [ ] 3.4 `components/CommentForm.tsx`：提交成功与失败两处 `.notice` 换 `alert`；验证：提交成功后弹「评论已提交 / 审核通过后显示」，失败路径弹失败提示，清空输入框的既有行为不变。
- [ ] 3.5 `components/ProfileForm.tsx`：保存结果与修改密码结果共 4 处 `.notice` 换 `alert`（成功/失败各自的文案保留）；验证：两条路径各走一次，弹窗文案与原来的内联文案语义一致。
- [ ] 3.6 `components/admin/PostEditor.tsx`：保存错误与 AI 摘要结果换 `alert`；验证：构造一次保存失败（如 slug 冲突）与一次成功 AI 生成，弹窗分别出现。
- [ ] 3.7 `components/admin/PostEditor.tsx`：导入确认条改 `choose()`，三个选项分别返回 `"replace"` / `"append"` / `null`，并驱动既有 `applyImport`；验证：已有内容时导入，弹窗出现，三个出口的行为与改造前逐项一致（替换覆盖正文、追加只补空字段、取消完全不动）。
- [ ] 3.8 收敛检查：全仓检索确认业务代码中不再有 `window.confirm` / `alert(` / `window.prompt` / `.notice` 渲染；清理不再使用的 `.notice` 样式与其在 `globals.css`/`redesign.css` 的定义；验证：`grep` 结果为空（Radix 内部实现除外），`tsc` 通过。

## 4. 集成验证

- [ ] 4.1 编辑器全屏下触发导入 `choose()`：确认弹窗层级高于全屏容器（`z-index: 90`）且可见可操作；验证：全屏写作状态下导入文件，弹窗正常弹出，Esc 关闭后仍处于全屏。
- [ ] 4.2 六套主题 × 三种弹窗各截图一张，并在 390px 下重测三种弹窗；验证：深色主题弹窗为深色、`daylight` 为浅色，强调色与页面主色一致，无横向溢出。
- [ ] 4.3 `pnpm install` 后执行 `npx tsc --noEmit` 与 `pnpm build`，记录引入 Radix 后首屏 CSS/JS 的体积增量；验证：两条命令退出码为 0，并记录增量数值以便判断是否要改用按需引入。

## Workflow follow-up

- 分两次提交（先配置+宿主、再批量迁移），推送后走既有 GitHub Actions 部署。
- 确认无误后归档本变更（`/openspec-archive-change`）。