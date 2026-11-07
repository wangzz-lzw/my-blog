# Proposal

## Why

欢迎页唯一的账号入口是一个「登录」链接，点了就跳走——门面刚立起来的语境当场断掉，登录完还不一定能回到原处。想注册更绕：登录页再点「去注册」，又一个整页跳转。

而这页本来就是"一屏说清自己"的地方，登录/注册作为它的一个侧翼动作更合理：从右侧拉出来，办完事就走，不离开这一屏。

## What Changes

- 欢迎页的「登录」改成**右侧滑出面板**：点开有遮罩，面板从右边进入，不跳页。
- 面板内**登录 / 注册 两个 tab**：切换时指示条滑动、表单横向位移淡入、面板高度平滑过渡，已输入的内容不丢。
- 登录或注册成功后：面板收起、跳转 `/blog`（那里页头有账号菜单，能确认自己已登录），同时触发 `auth:changed` 让登录态刷新。
- **已登录的人**访问欢迎页时，入口显示「进入博客」直接去文章列表，不再弹登录框。
- 表单逻辑复用现有实现：把 `LoginForm` / `RegisterForm` 里的字段与提交逻辑抽成可复用的表单体，`/login`、`/register` 两个页面照旧可用（深链接、无 JS 回退、其它页面的入口都不受影响）。

## Capabilities

### New Capabilities

- `auth-panel`: 欢迎页右侧登录面板的行为契约 —— 入口与无 JS 降级、抽屉的打开/关闭与焦点管理、登录/注册 tab 的切换与动画、成功后的去向、移动端形态，以及面板沿用欢迎页白色赛博视觉、不跟随站点主题的隔离规则。

### Modified Capabilities

（无。`auth-affordance`（页头登录态）与既有 `/login`、`/register` 页面的行为不变，只是它们的表单体被抽出复用。）

## Impact

- **代码**：新增 `components/welcome/AuthPanel.tsx`（Radix `Dialog` + `Tabs`）、`components/welcome/AuthTrigger.tsx`；把 `components/LoginForm.tsx` / `RegisterForm.tsx` 的表单体拆成 `LoginFields` / `RegisterFields`（受控组件 + `onSubmit` 回调），两个页面组件与面板共用；`app/page.tsx` 引入服务端 `auth()` 判断是否已登录，并把「登录」换成触发组件；`app/redesign.css` 增加面板样式段。
- **依赖**：`radix-ui`（已在依赖里）的 `Dialog` 与 `Tabs`，不新增包。
- **验证口径**：`tsc` 与 `build` 通过；`/` 无 JS 时「登录」仍跳 `/login`；面板打开后 Tab 焦点不出面板、Esc 关闭、焦点回到触发按钮；tab 切换后已输入内容保留；390px 下全宽不溢出；reduce 下无位移动画。
- **不在本次范围**：忘记密码 / 邮箱验证 / 第三方登录、面板内的账号菜单、把 `/login` 页删掉。