# Tasks

## 1. 实施前诊断

- [x] 1.1 浏览器 devtools 确认三态实际渲染：SSR HTML 仅含 `.header-auth-slot`；hydration 后未登录→登录链接、已登录→头像；若占位永久不消失（水合故障），先修复客户端边界再进入 2.x，并重新验证

## 2. 共享退出组件

- [x] 2.1 新建 `components/LogoutControl.tsx`（客户端：`signOut` 落地 `/`，支持标签文案变体），并将 `components/admin/LogoutButton.tsx` 改为复用；验证后台页退出行为不变（退出后 /admin 重定向 /login）

## 3. HeaderAuth 三态升级

- [x] 3.1 未登录：`.login-link` 升级为霓虹描边按钮（描边 + 底色 + 圆角 + hover 辉光，类名不变）；验证未登录态下页头登录入口与导航文字明显可区分
- [x] 3.2 已登录：头像圆牌升级为「圆牌 + 标签」chip（标签 = name 或 email 前缀，超 10 字符截断 + …；点击仍进 /admin）；验证 admin 账号显示「A + admin」
- [x] 3.3 加载占位：`.header-auth-slot` 加可见描边（+ 轻微动画）；验证首屏占位可见、会话返回后被替换不闪跳
- [x] 3.4 页头在 chip 旁放置 `LogoutControl`（文字「退出」，hover 品红预警 + title 提示）；验证点击退出后页头切换为登录按钮、`/admin` 访问被重定向到 /login

## 4. 移动端与验收

- [x] 4.1 720px 断点验证：页头允许换行、三件套不溢出（F12 375px 视口检查）
- [x] 4.2 逐条核对 spec 五场景（未登录入口 / 导航区分 / 已登录标签 / 退出 / 加载占位）+ 静态渲染安全（curl 文章页 HTML 无用户名/头像内容；登录前后首页 ISR 输出一致）
- [x] 4.3 验证 `npx tsc --noEmit` 通过
