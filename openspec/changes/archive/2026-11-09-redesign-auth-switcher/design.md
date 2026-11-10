# Design

## Context

动机见 `proposal.md`；契约见 `specs/auth-panel/spec.md`。这里只记录实现必须依据的现状与已确认的事实。

**当前 AuthPanel**（`components/welcome/AuthPanel.tsx`，253 行）：

```
两块 .auth-pane 始终挂载，靠 data-active 切换
  └ 非激活块 position:absolute + visibility:hidden
切 tab 的动画：gsap.fromTo(pane, {x:12, opacity:0}, {x:0, opacity:1, 0.26s})
高度：measure() 取两块 offsetHeight 的 max，写成 .auth-forms 的 minHeight
指示条：gsap.to(indicator, {x, width, 0.3s, power3.inOut})
```

两个问题直接对应提案里的抱怨：

1. **0.26s / 12px 的位移几乎不可见**，而两块表单是"一上一下"切换（非激活块被 `visibility:hidden` 藏住），
   读者看到的是"内容换了"，不是"翻页了"。
2. **高度永远按较高的那块撑开**（`Math.max(0, ...panes.map(offsetHeight))`）。
   登录 2 个字段、注册 5 个字段 + 验证码，停在登录时下面空出一大片。

**规格与实现已经不符**：`auth-panel` 的「登录 / 注册 tab 切换」场景写的是"面板高度过渡到新内容的高度"，
「切换与开合的动效」写的是"内容横向交叉"。当前实现两条都没有完全做到——所以这次是**把规格里已承诺的东西做出来**，
而不是新增视觉偏好。

**三个入口的现状**：

| 入口 | 组件 | 切换方式 |
|---|---|---|
| 欢迎页右栏 | `welcome/AuthPanel.tsx` | 就地换 tab |
| `/login` | `LoginForm` → `GsapReveal` 卡片 + `LoginFields` | `<Link>` 整页跳转 |
| `/register` | `RegisterForm` → 同上 + `RegisterFields` | `<Link>` 整页跳转 |

**已确认的事实**：

- `RegisterFields` 一次提交 5 个字段（用户名 / 邮箱 / 验证码 / 密码 / 确认）。
- `EmailCodeField` 自带 60 秒倒计时与"码已发出"提示，两步拆分后第一步取码、第二步提交，**码的有效期（10 分钟）远长于填密码的时间**，不会因拆分而过期。
- `RegisterFields` 的 `onSuccess` 由宿主决定去向（面板 → `/blog`，独立页 → `returnTo`），拆分后这个约定不变。

## Goals / Non-Goals

**Goals:**

- 切换有明确的方向感（左出右进），并且高度真的跟着内容走。
- 注册 5 个字段拆成两步，面板高度差被压平。
- 欢迎页面板与两个独立页共用同一套切换与表单壳，行为一致。
- 视觉上向欢迎页的白赛博语言靠拢，不再是孤立的纸白方块。

**Non-Goals:**

- 不改注册接口、不改验证码机制、不做第三方登录与找回密码。
- 不改欢迎页的入场序列（那是页面级一次性编排，与用户触发的切换是不同类别，见 D6）。
- 不改 `/admin` 的登录守卫与 `returnTo` 语义。

## Decisions

### D1 横向轨道换页，而不是原地淡入

```css
.auth-track { position: relative; overflow: hidden; }
.auth-pane  { position: absolute; inset: 0; }   /* 两块都在同一轨道上 */
```

切换时 `gsap.to(旧, { xPercent: -100 })` + `gsap.fromTo(新, { xPercent: 100 }, { xPercent: 0 })`。

- **为什么用 `xPercent` 而不是像素**：轨道宽度会随视口变，用百分比不用每次测量。
- **为什么两块都用 `absolute`**：这样才能"同时在场"地交叉；用 `visibility:hidden` 藏住非激活块就做不到交叉（现状的问题）。
- **代价**：`absolute` 之后轨道自身没有高度，需要 D2 显式给高度。
- **备选（否）**：`transform: translateX` 依赖像素测量，窗口缩放时要重算，多一处状态。

### D2 高度由测量驱动，过渡到目标值

```ts
// 激活块的自然高度 → 轨道的 height
const h = activePane.offsetHeight;
track.style.height = `${h}px`;   // 带 transition
```

- 必须先让激活块回到正常文档流（或给它 `position: static` 的测量副本）才能量到自然高度。
  做法：激活块 `position: relative`，非激活块 `position: absolute` —— 轨道高度自然等于激活块。
  这样既能量到高度，又不需要额外的隐藏测量副本。
- 高度变化用 CSS `transition: height .32s`，与 GSAP 的横向动画并行；两者时长接近，看起来是一个动作。
- **`prefers-reduced-motion`** 时把 transition 关掉，高度瞬时变化。

### D3 注册拆两步，字段归属固定

```
step 1: 用户名 / 邮箱 / 验证码      → 「下一步」
step 2: 密码 / 确认密码            → 「注册并登录」 + 「上一步」
```

- **为什么这样分**：把"取验证码"这件有网络往返、有倒计时的事放在第一步末尾，用户拿到码就能立刻往下走；
  第二步只有两个密码框，很短，面板高度自然收窄。
- **为什么不在第一步就提交**：接口是一次性创建账号，拆成两次请求会引入"账号已建但密码没设"的中间态。
- **步骤状态只在组件内**，不进 URL：`/register` 永远指向第一步，刷新即回到第一步（符合"步骤不是页面"的直觉）。
- 切换 tab 时步骤复位到第一步（spec 已要求）。

### D4 三个入口共用一个壳

抽出 `components/auth/AuthSwitcher.tsx`：

```tsx
<AuthSwitcher
  initialTab="login" | "register"
  variant="panel" | "page"       // 面板内嵌 / 独立页居中卡片
  onTabChange?: (t) => void      // 独立页用它同步 URL
  onLoginSuccess / onRegisterSuccess
/>
```

- **为什么抽壳**：三处的差异只有"外观（内嵌 vs 卡片）"与"成功后去哪"；
  切换动画、两步注册、输入保持这些逻辑完全共用，复制三份必然走形。
- 独立页用 `router.replace` 同步 URL（`/login` ↔ `/register`），但**不重新挂载**——用 `initialTab` 只在首次决定，
  之后由组件内部状态驱动。这样"切换不再是整页刷新"，且直接访问任一 URL 仍落在对应 tab（spec 的两条都满足）。
- `variant="page"` 时保留 `GsapReveal` 的入场；`variant="panel"` 时入场由 `AuthPanel` 自己负责（现状已有）。

### D5 视觉：向欢迎页的白赛博靠拢

现有面板是 `--w-paper` 方块 + 两个对角括号，与欢迎页的网格、扫描线、HUD 几乎没关系。改为：

- 用 `--w-signal`（电蓝）做**一处**强调：步骤指示条与主按钮的切角。其余保持纸白与发丝线，不铺满霓虹。
- 面板左缘引入一条极淡的竖向刻度（复用 `repeating-linear-gradient`，与站点滚动条刻度同一套语言），
  让"表单"读起来像一台仪表的一部分，而不是一张白纸。
- 步骤指示用 `01 / 02` 的等宽数字（站点既有的"机器嗓子"），不用 ALL-CAPS 标签。

约束（来自 `frontend-design` 的克制原则）：**只在切换动画这一处花大力气**，其余保持安静；
霓虹只用在与交互有关的地方（`welcome-page` 的「霓虹只用于可交互处」已要求）。

### D6 与欢迎页入场序列的边界

`welcome-page` 的「入场动效只有一次」针对的是**页面加载时的编排**与"随滚动触发"的动画。
面板的切换是**用户操作引起的**、范围局限在面板内部的反馈，不属于该要求禁止的对象。
因此不改这条要求，只在实现上保证：面板切换不会重新触发页面入场序列。

## Risks / Trade-offs

- **[`absolute` 之后轨道高度塌陷]** → D2 让激活块保持 `position: relative`，轨道高度由它撑开，同时用 transition 过渡。
- **[交叉期间两块重叠]** → 两块各占 100% 宽度、`overflow: hidden` 裁掉视野外的部分；`will-change: transform` 避免拖影。
- **[快速连点导致动画叠加]** → 每次切换先 `gsap.killTweensOf` 两块，再起新动画；spec 的「连续快速切换」场景即验证这一点。
- **[两步注册的心智负担]** → 第一步可回退、步骤指示明确；第二步只有两个密码框，不会让人以为"还要填一堆"。
- **[验证码跨步过期]** → 10 分钟有效期远大于填两个密码的时间；万一过期，提交时的错误提示会指向重新获取。
- **[独立页 `router.replace` 导致滚动复位]** → 用 `scroll: false`，页面本就在顶部。
- **[无障碍]** → tabs 的 `role`/`aria-selected`/方向键、步骤区的 `aria-current`、跳步时的焦点管理与 `aria-live` 播报，都是既有要求的延续，不能因为重做而丢。

## Migration Plan

纯前端改动，无数据模型与接口变化：

1. 先抽 `AuthSwitcher` 并把欢迎页面板切过去（`variant="panel"`），验证动画与高度。
2. 再改两个独立页（`variant="page"`），验证 URL 同步与状态保持。
3. 最后拆两步注册（`RegisterFields` 逻辑调整）。
4. **回滚**：三个入口都是薄壳，恢复各自的卡片即可；`AuthSwitcher` 留着无害。

## Open Questions

- 横向换页的时长取 `.32s` / `.4s` / `.45s` 中的哪个。取决于与高度过渡的配合手感，
  实现后用真实切换看一遍再定，不影响 spec、方案与任务拆分。