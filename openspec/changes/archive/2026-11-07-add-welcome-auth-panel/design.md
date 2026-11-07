# Design

## Context

- `/` 是欢迎页（`app/page.tsx`，服务端组件 + 三层动效增强），底部有「进入博客 / 标签 / 登录」三个入口；「登录」现在是普通 `<Link href="/login">`。
- 认证走 NextAuth v5 凭据模式：`components/LoginForm.tsx` 用 `signIn("credentials", { redirect: false })` 成功后 `router.push(returnTo || "/admin")` 并广播 `auth:changed`；`components/RegisterForm.tsx` 先 `POST /api/register` 再自动登录，成功后 `router.push(returnTo || "/")`。两者都用 `useFeedback()` 弹窗报错。
- 两个页面组件把「布局 + 表单」写在一起（`.login-wrap > .login-card > .sysline + h1 + .login-sub + form.login-form`），要复用就得把表单体拆出来。
- `radix-ui`（已装）同时导出 `Dialog` 与 `Tabs`；`feedback` 那边已经用同一套思路（Radix 行为 + 自写样式），这里保持一致。
- 欢迎页是 `force-dynamic`，可以在服务端拿到会话。

## 设计计划

### 色彩（沿用欢迎页 token，只补两个语义色）

| Token | 值 | 用于 |
| --- | --- | --- |
| `--w-paper` | `#FBFCFD` | 抽屉底色，与纸面同色 |
| `--w-ink` | `#0B0E12` | 选中态 tab、输入文字 |
| `--w-mute` | `#59636F` | 未选中 tab、字段标签 |
| `--w-line` | `#DCE3EB` | 抽屉左缘接缝、输入框描边 |
| `--w-signal` | `#0F62FE` | 指示条、主按钮、焦点环 |
| `--w-signal-2` | `#D81653` | 错误提示、危险强调 |

补两个只在这块用的：遮罩 `color-mix(#0B0E12 22%)`、输入底色 `#FFFFFF`（比纸面亮一档，输入区一眼可辨）。

### 字体

- **等宽**：tab 标签、字段标签、按钮文字、面板内的小字提示。机器声部。
- **无衬线**：输入内容与失败说明。人的声部。
- 不给面板加标题区——两个 tab 就是标题；加一行 `AUTH.SYS` 式的眉标只会变成装饰。

### 布局

抽屉贴右、全高、宽 `min(420px, 100vw)`，左缘一条 1px 发丝线当"机柜接缝"，**零圆角、零投影**。

```
                              ┌─────────────────────────┐
                              │                         │  ← 左缘 1px 线 + 打开时扫入的电蓝竖线
                              │  登录   注册          ✕  │  ← tab 左对齐，关闭在右
                              │  ▔▔▔▔▔                  │  ← 2px 指示条，滑动
                              │                         │
                              │  用户名 / 邮箱           │
                              │  ┌────────────────────┐ │
                              │  │                    │ │
                              │  密码                    │
                              │  ┌────────────────────┐ │
                              │  │                    │ │
                              │  [      登录      ]     │  ← 切角按钮，与页面 CTA 同款
                              └─────────────────────────┘
```

对齐：面板内全部左对齐；tab 与关闭按钮同一行；表单标签在上、输入在下、间距 0.45rem。

### 原则

1. **抽屉不是弹窗**：从侧边推入、贴边、全高——它是机柜的一块侧板，不是浮在中间的卡片。
2. **一条指示条承担全部动效张力**，其余位移控制在 12px 以内。
3. **零圆角、零投影**，与页面的 HUD 角标、切角按钮同一套语言。
4. **表单一处逻辑、两处皮**：页面与抽屉共用同一套字段与提交，避免校验规则分叉。

### 对照"通用默认"自查

| 常见默认 | 这里怎么做 |
| --- | --- |
| 居中模态 + 圆角 + 柔和阴影 | 右侧抽屉、直角、无阴影，靠一条线与遮罩定形 |
| tab 用胶囊底色块 | 用一条 2px 滑动线 + 文字色变化 |
| 每个字段上方加全大写小标 | 中文标签 + 等宽小字，不做大写 |
| 输入框圆角 + 内阴影 | 1px 直角描边，聚焦时描边变电蓝 |
| 登录/注册两套独立表单实现 | 抽出共用表单体 |

自我删减：原本想在抽屉顶部加一行 `❯ AUTH.SYS` 终端标识，删掉了——它是这个页面早就用过的装饰语汇，但在这里不做任何信息工作，只会和 tab 抢位置。

## 实现决策

### D1. Radix `Dialog` + `Tabs`，只借行为

`Dialog` 负责遮罩、Esc、焦点陷阱与焦点归还；`Tabs` 负责 `role/aria-selected` 与左右方向键的 roving focus。样式全部自写，和 `FeedbackProvider` 的做法一致（同一个依赖，同一套原则）。

- 替代方案：手写抽屉 + 自己管焦点。焦点归还、Esc、aria 关联都要逐条实现，容易漏，弃用。

### D2. 表单体抽出为受控组件

```tsx
// components/auth/LoginFields.tsx
export function LoginFields({ onSuccess }: { onSuccess: () => void })
```
`LoginFields` / `RegisterFields` 内部保留自己的输入 state、校验与请求，只把"成功之后干什么"交给外部回调：

- `/login` 页面：`onSuccess` = 原来的跳转（`returnTo || "/admin"`）；
- 抽屉：`onSuccess` = 关闭抽屉 + 跳 `/blog`。

这样校验规则、错误文案、`auth:changed` 广播都只有一份。`LoginForm` / `RegisterForm` 退化成薄壳（`GsapReveal` + `login-card` + `<LoginFields />`），两个页面的观感不变。

### D3. 动效编排

| 环节 | 做法 |
| --- | --- |
| 打开 | 遮罩 `opacity 0→1`（0.22s）；抽屉 `x: 100% → 0`（0.42s `power3.out`）；左缘电蓝竖线 `scaleY 0→1` 后淡出（0.5s）——像接缝通电 |
| tab 切换 | 指示条 `x/width` 到目标（0.3s `power3.inOut`）；旧表单 `x:-10, opacity:0`（0.18s）；新表单 `x:12 → 0, opacity:0 → 1`（0.26s，延迟 0.1s）；容器高度从旧高 tween 到新高（0.34s） |
| 关闭 | 反向 0.28s，遮罩同时淡出 |
| reduce | `gsap.matchMedia()` 分支里直接 `gsap.set` 终态，不做位移动画 |

高度动画用「读旧高 → `height:auto` 测新高 → 从旧高 tween 回新高 → 完成后 `height:auto`」，避免内容被裁。

### D4. 成功后的去向

`onSuccess`：先播 0.22s 收起（给用户一个"办完了"的反馈），再 `router.push("/blog")` + `router.refresh()` + `window.dispatchEvent(new Event("auth:changed"))`（`/blog` 的页头靠它刷新账号菜单）。失败时面板保持打开、内容不清空，错误走现有弹窗。

### D5. 入口与已登录分支

`components/welcome/AuthTrigger.tsx`（客户端）渲染 `<a href="/login">`，`onClick` 里 `preventDefault` 后打开面板；无 JS 时就是普通链接，直接去 `/login`。

`app/page.tsx` 用 `auth()` 判断会话：已登录则把该入口换成「进入博客」直达 `/blog`。页面本来就是 `force-dynamic`，多这一次会话读取不改变缓存行为。

## Risks / Trade-offs

- [`Dialog` 里嵌 `Tabs` 的焦点管理] → 两者同属 Radix，Tabs 的 roving tabindex 在 Dialog 的 trap 内表现正常；实现后需用键盘实测一轮（Tab/Shift+Tab/方向键/Esc）。
- [高度动画在字体未加载完时测错] → 高度 tween 前 `document.fonts.ready` 等一次；退化到固定 `max-height` + 内部滚动也能接受。
- [遮罩挡住页面动效层（粒子/瞄准框）] → 抽屉 `z-index` 与 `feedback` 弹窗、瞄准框层级要排好：遮罩 210 / 抽屉 220 / 弹窗 200 会有冲突——统一为遮罩 190、抽屉 200、弹窗 230、瞄准框 300，弹窗永远在最上。
- [已登录判断让 `/` 依赖 cookie] → 页面本来就是动态渲染，接受；但要确保 `auth()` 失败时不影响页面渲染（catch 后当作未登录）。
- [抽出表单体可能改变 `/login` 页原有效果] → `GsapReveal` 与 `login-card` 的包裹保留在页面层，只替换内部为 `<LoginFields />`；改动后需回归两个页面。
- [移动端抽屉全宽时，遮罩几乎不可见] → 全宽时保留 12px 的左侧留白与遮罩，仍然可以点击遮罩关闭。

## Migration Plan

纯前端新增，无数据迁移：

1. 抽 `LoginFields` / `RegisterFields`，跑通 `/login`、`/register` 两个页面（回归）。
2. 加 `AuthPanel` + `AuthTrigger` + 样式段，欢迎页接上。
3. 逐条验证：键盘（trap/Esc/焦点归还/方向键）、tab 切换保内容、成功后跳转、无 JS、reduce、390px。
4. 回滚：删两个新组件、把 `app/page.tsx` 的入口改回 `<Link>` 即可。

## Open Questions

（无。成功后的去向已在对话中确认为「收起面板并进入 `/blog`」；`/login`、`/register` 两个页面保留。）