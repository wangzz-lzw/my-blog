# Design

## Context

- 现状：`components/HeaderAuth.tsx` 客户端 fetch `/api/auth/session`；未登录渲染 `.login-link`（纯文字），已登录渲染 34px `.user-avatar`（单字母圆圈，仅 title 提示），加载中渲染无样式的 `.header-auth-slot`。
- 已验证：`/api/auth/session` 200、未登录返回 `null`；切换逻辑正确——问题纯属**可辨识性**（"登录按钮不展示"实为看漏/认不出）。
- 约束：首页/文章页 ISR，认证必须保持客户端解析（spec 已固化为「静态渲染安全」）；页头高度 56px，移动端 720px 断点允许换行；退出逻辑已存在于 `components/admin/LogoutButton.tsx`（NextAuth v5 `signOut`）。
- 背景疑点保留：若实施时发现未登录态也"空白"（水合故障），先按 tasks 第 1 步诊断，不改变本设计。

## Goals / Non-Goals

**Goals:**
- 三种状态（加载中/未登录/已登录）在页头都有明确、可辨认的呈现
- 退出登录在页头即可操作，不必进后台
- 样式复用现有类与色板，改动集中在 HeaderAuth + 一个共享 logout 组件 + CSS

**Non-Goals:**
- 不做用户菜单/下拉面板（项少，铺开比折叠清晰）
- 不改 session API、中间件守卫、/login 流程

## Decisions

1. **已登录：圆牌 + 文字标签 + 退出，三件套并排**
   - `[A 圆牌] admin ▸ /admin` 与 `[退出]` 两个控件：用户牌沿用 `.user-avatar` 升级（宽度自适应、加标签文字、点击仍进 /admin），退出为独立小按钮（`logout-link`，霓虹灰，hover 品红）
   - 备选：hover 弹出下拉（头像 → 菜单）→ 多一层交互，项少没必要，移动端 hover 不可用。→ 铺开
   - 标签取 `name || email 前缀`，超 10 字符截断 + …；圆牌首字母逻辑不变

2. **未登录：`.login-link` 升级为按钮形态**
   - 保留类名（其他引用与 immersive 隐藏规则不动），样式加霓虹描边 + 底色 + 圆角 + 悬停辉光（与 `.stat-chip:hover` 同款辉光语言）

3. **加载占位：`.header-auth-slot` 加可见描边**
   - 34px 方块描边（`--border` 色）+ 轻微 shimmer；会话返回即被替换

4. **共享退出逻辑**
   - 把 `LogoutButton.tsx` 的 `signOut` 调用抽为 `components/LogoutControl.tsx`（客户端，props: 标签样式），后台页与页头共用；后台原按钮换成该组件的"管理台"变体，行为不变

5. **实施前置诊断（不改变设计，只决定工作量）**
   - tasks 第 1 步：浏览器 devtools 确认三种状态实际渲染（SSR HTML 只有 slot；hydration 后按 session 切换）。若发现 hydration 失败（slot 永久），先修水合（检查 useLayoutEffect/客户端边界），再按本设计实现样式

## Risks / Trade-offs

- [页头 56px 塞不下三件套] → 标签截断 10 字符 + 退出按钮极简（文字"退出"，不带图标）；720px 以下页头本就允许换行（既有媒体查询）
- [退出后停留在原页，用户困惑] → signOut 默认 redirect，落到 / 首页（与现有后台退出行为一致）
- [水印：已登录访客看到"退出"误点] → 按钮加 title 提示"退出登录并返回首页"，hover 品红预警色

## Migration Plan

1. 纯前端变更，无迁移；发布后旧会话（JWT）自动享受新 UI
2. 回滚：HeaderAuth 与 CSS 还原即可，无数据变更

## Open Questions

- 标签是否显示"管理 →" 提示文字：默认不显示（圆牌+标签+退出已足够表达），实施时按视觉效果决定
