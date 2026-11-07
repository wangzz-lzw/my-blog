# Tasks

## 1. 抽出可复用的表单体

- [x] 1.1 新建 `components/auth/LoginFields.tsx`：把 `LoginForm` 里的输入 state、`signIn` 调用、错误处理搬进来，用 `onSuccess()` 回调替代页面跳转；渲染 `.login-form` 表单体本身（不含 `.login-wrap/.login-card` 外壳）；验证：`tsc` 通过。
- [x] 1.2 新建 `components/auth/RegisterFields.tsx`：同上处理 `POST /api/register` → `signIn` → 成功回调；两个表单体都保持各自的校验与错误文案不变。
- [x] 1.3 `LoginForm` / `RegisterForm` 改成薄壳：保留 `GsapReveal`、`.login-card`、标题与副标题，内部渲染对应 `*Fields`，`onSuccess` 里保留原来的跳转逻辑；验证：`/login`、`/register` 两页行为与观感不变（含登录成功后的 `returnTo` 跳转）。

## 2. 面板骨架

- [x] 2.1 新建 `components/welcome/AuthPanel.tsx`：用 `radix-ui` 的 `Dialog`（遮罩/焦点陷阱/Esc/焦点归还）搭骨架；tab 改为**手写 ARIA tabs**（`role="tablist"` / `aria-selected` / `aria-controls` / 左右方向键），原因见实施备注；验证：`tsc` 通过，两个面板同时挂载。
- [x] 2.2 `app/redesign.css` 增加 `.auth-drawer` 样式段：贴右全高、宽 `min(420px, 100vw)`、左缘 1px 发丝线、零圆角零投影、遮罩色 `color-mix(--w-ink 22%)`、输入框直角描边、切角主按钮（复用页面 CTA 的形状）；验证：六套主题切换时面板外观不变。
- [x] 2.3 层级排序：遮罩 180 / 抽屉 190 / 反馈弹窗 200–201 / 瞄准框 300；验证：面板打开时点「登录」失败的弹窗盖在抽屉之上。

## 3. 动效

- [x] 3.1 打开/关闭：遮罩淡入 + 抽屉 `x` 推入、左缘电蓝竖线扫入后淡出；关闭反向；用 `matchMedia('(prefers-reduced-motion: reduce)')` 分支直接落终态；验证：reduced-motion 下无位移动画。
- [x] 3.2 tab 切换：指示条 `x/width` 滑动（0.3s）、新面板从右侧 12px 滑入淡显；容器高度随在流面板自然变化；验证：切换时面板不跳高。
- [x] 3.3 切换不丢输入：两块面板始终挂载，非激活的用 `visibility: hidden; position: absolute` 收起（不卸载组件）；验证：登录 tab 填用户名 → 切注册 → 切回，内容还在。

## 4. 入口与已登录分支

- [x] 4.1 新建 `components/welcome/AuthTrigger.tsx`：渲染 `<a href="/login">`，`onClick` `preventDefault` 打开面板，修饰键点击放行（新标签打开）；验证：禁 JS 点击直接进 `/login`。
- [x] 4.2 `app/page.tsx` 用 `auth().catch(() => null)` 读会话：已登录渲染「进入博客」链接指向 `/blog`，未登录渲染 `AuthTrigger`；验证：未登录时页面里「进入博客」出现 1 次（主按钮）、「登录」出现 1 次（触发器）。
- [x] 4.3 成功回调：抽屉里 `handleSuccess` 先播 0.22s 收起，再 `onOpenChange(false)` + `router.push("/blog")` + `router.refresh()`（`auth:changed` 由表单体在成功时广播）；验证：登录成功后到达 `/blog` 且页头显示账号菜单。

## 5. 无障碍与降级

- [x] 5.1 焦点：Radix `Dialog` 负责焦点陷阱、Esc、关闭后焦点归还触发元素；背景滚动由 Dialog 自身锁定；验证：结构上具备，键盘实操待浏览器确认。
- [x] 5.2 390px：`.auth-drawer` 宽 `min(420px, 100vw)`，窄屏再补 `100vw` 与收窄内边距；验证：结构上具备，实测待浏览器确认。
- [x] 5.3 回归：`/login` 仍能渲染 `.login-form`、用户名占位符与「去注册」链接；`/register` 同构复用 `RegisterFields`；验证：HTML 直读确认。

## 6. 验证

- [x] 6.1 `npx tsc --noEmit` 通过（退出码 0）；`npm run build` 本轮未跑（dev server 正在运行，避免争用 `.next`）。
- [x] 6.2 `/` 与 `/login` 冒烟：`/` 200、触发器是真链接、抽屉关闭时 portal 内容不挂载；`/login` 200 且表单字段完整。

## 实施备注

### 切 tab 不许推动页面（联调第二轮反馈）

第一版把面板放在右栏的**文档流**里，切到「注册」（4 个字段）时面板变高 → grid 行高变化 → 因为 `.page-welcome` 是 `justify-content: center`，整块内容被顶着上下移动。

两层修法：

1. **宽屏（≥981px）面板绝对定位**在 `.welcome-auth-slot`（该槽位 `position: relative`）里：面板从此不参与文档流，开合与高度变化都不影响页面布局。
2. **两块表单高度对齐到较高的那块**：`AuthPanel` 在打开与切 tab 时量两块 `.auth-pane` 的 `offsetHeight`，把最大值写成 `.auth-forms` 的 `minHeight`；同时把非激活面板的 `inset: 0` 改成 `top/left/right: 0`（否则它被拉到容器高度，量不到自然高度）。这样面板自身尺寸也恒定。

窄屏（≤980px）保持静态流式：面板在文案下方，需要参与布局。

### 实施后按你的反馈做的形态调整：抽屉 → 右栏行内面板

第一版做成了右侧抽屉（遮罩 + 固定定位 + Radix `Dialog`）。你指出"登录框放到右边红框那里，不要抽屉"，于是改成**行内面板**：

- `app/page.tsx` 的 `.welcome-inner` 从单列 flex 改成两列 grid：`minmax(0,34rem) + minmax(0,1fr)`，左列是文案（包在 `.welcome-copy`），右列是 `<div id="welcome-auth-slot">`——面板打开时就落在这块，主文案位置不动。
- `AuthTrigger` 用 `createPortal` 把面板挂进槽位：入口和面板在 DOM 里可以不同位置，状态仍由同一个组件持有。
- 不再用 Radix `Dialog`（它是模态语义：遮罩、焦点陷阱、锁滚动），改为普通 `<section>`：Esc 监听文档、打开时 focus 第一个输入框、关闭把焦点还给触发按钮。
- 视觉改为一块直角描边面板：`1px --w-line` 边框 + 对角两个电蓝括号 + 顶边一截电蓝"通电标记"，与页面 HUD 一致；`.auth-drawer` / `.auth-overlay` 样式整段删除。
- 断点从 720px 提到 **980px**：窄于此改成单列，面板落到文案下方。

### 实施后修复的两个缺陷（联调时发现）

1. **`useFeedback` 抛错**：`FeedbackProvider` 原本挂在 `app/(site)/layout.tsx`，而欢迎页 `/` 是 route group 之外的独立门面，抽屉一打开 `LoginFields` 取不到 context 就抛「useFeedback 必须在 <FeedbackProvider> 内部」。已把 provider 上移到 `app/layout.tsx`（全站宿主），`(site)` 布局只留页头/主区/页脚。这也更合逻辑：提示是应用级能力。
2. **已登录时出现两个「进入博客」**：主按钮本来就指向 `/blog`，我又让账号入口也指向 `/blog`，重复。改为管理员指向「后台」`/admin`、普通用户指向「个人资料」`/profile`，并同步改了 spec 里对应的要求与场景。

设计里写"`Dialog` + `Tabs` 都借 Radix"，实施时改成 **Radix `Dialog` + 手写 ARIA tabs**。原因：Radix `Tabs.Content` 在非激活时会 `hidden`（即使 `forceMount` 也保留 `hidden` 属性），要么覆盖 UA 样式、要么面板被卸载——两者都会破坏"切换 tab 不丢输入 + 自定义滑入动画"。手写 tabs 只有约 30 行（`role/aria-selected/aria-controls/左右键`），换来了面板始终挂载。

### 层级

`auth-overlay` 180 / `auth-drawer` 190；反馈弹窗仍是 200–201，瞄准框 300。设计里写的 190/200/230 只是示意，实际取值保证"面板里登录失败的弹窗盖在抽屉之上"。

### 表单体抽出后的行为等价性

- `/login`：`onSuccess` = `router.push(returnTo || "/admin")` + `refresh()`，与原来一致；
- `/register`：`onSuccess` = `router.push(returnTo || "/")`；
- `auth:changed` 广播留在表单体内（成功即广播），两个宿主都不用重复实现；
- 注册后自动登录失败时新增了一条更具体的中文提示（原来只跳转登录页），属于体验改进，已在代码内注释。

### 验证降级说明（需要你看一眼）

本轮仍无浏览器会话，以下只能靠代码与 HTML 产物确认、需要你实测：抽屉的开合与指示条滑动手感、tab 切换时高度是否平滑、键盘焦点是否真的不出抽屉、390px 下是否全宽且不溢出、以及登录成功后的收场动画。

## Workflow follow-up

- 提交推送 → CI 重建镜像 → 服务器 `docker compose up -d --force-recreate app`。
- 真机验证一次 iOS Safari（抽屉全宽 + 键盘弹出时输入框是否被遮）。
- 确认无误后归档（`/openspec-archive-change`）。