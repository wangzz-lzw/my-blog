# Proposal

## Why

页头右上角的登录入口在两种状态下都不可辨识：未登录时是纯文字「登录」链接（混在导航里，不像按钮）；已登录时只有一个 34px 的字母头像圆圈，无文字、无退出入口。用户反馈「登录按钮不展示」，实际是**登录态的可见性与可辨识性**问题，而非链接缺失（`/api/auth/session` 正常、切换逻辑正确已验证）。

## What Changes

- **未登录**：「登录」升级为霓虹描边按钮（沿用 `.login-link` 类，视觉升级为按钮形态，与切角霓虹风格一致）
- **已登录**：头像圆圈升级为**带标签的 chip**（首字母圆牌 + 名称/邮箱前缀），并在其旁提供明确的**退出登录**入口（复用现有 `components/admin/LogoutButton.tsx` 的 signOut 逻辑，抽成可共享组件）
- **加载中**：占位方块加可见描边，避免"右上角什么都没有"的错觉
- 不改动认证 API 与会话机制：继续客户端 fetch `/api/auth/session`，保持首页/文章页 ISR 兼容
- **实施前置验证**：实现时先确认浏览器实际处于哪种状态（未登录却空白 = 水合故障，需另查；已登录只见圆圈 = 本提案直接解决）

## Capabilities

### New Capabilities

- `auth-affordance`：页头的认证状态呈现与入口——未登录登录入口、已登录状态展示（标签 + 退出）、加载占位

### Modified Capabilities

（无——项目尚无既有 spec）

## Impact

- **代码**：`components/HeaderAuth.tsx`（重写渲染分支）、`components/admin/LogoutButton.tsx`（抽取共享 logout 逻辑或新建 `components/LogoutControl.tsx`）、`app/globals.css`（`.login-link`/`.user-avatar`/`.header-auth-slot` 及新增 chip、logout 样式）
- **约束**：登录态保持客户端读取，不在 server component 调 `auth()`（ISR 约束）；页头 56px 高度内容纳新元素，移动端 720px 断点下允许换行
- **无破坏性变更**：路由、API、中间件（/admin 守卫）均不动
