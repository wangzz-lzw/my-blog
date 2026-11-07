# Design

## Context

- 欢迎页右栏现在是 `.welcome-inner` 的第二列：`#welcome-auth-slot`（登录面板的落点，≥981px 时面板绝对定位在槽位里）。
- 页面已有三层动效：入场 timeline（`WelcomeMotion`）、字标粒子化（`TextParticles`）、指针瞄准框（`CursorFollower`）；背景还有 9s 一轮的扫描光带与刷新闪烁的块状光标。
- `Post` 模型有 `cover`（OSS/站内路径，可为空）、`title`、`tags`、`publishedAt`；首页已有"最新 N 篇"的查询范式。
- 目标：让右栏在没登录时也不空——用最新文章做一圈缓慢自转的环形导航。

## 设计计划

### 色彩（全部复用欢迎页 token）

| Token | 值 | 用在哪 |
| --- | --- | --- |
| `--w-paper` | `#FBFCFD` | 文字封面底色 |
| `--w-ink` | `#0B0E12` | 文字封面的标题 |
| `--w-mute` | `#59636F` | 标签、日期 |
| `--w-line` | `#DCE3EB` | 卡面 1px 描边 |
| `--w-signal` | `#0F62FE` | 悬停/聚焦时的描边 |
| `--w-signal-2` | `#D81653` | 文字封面顶部那一小截"通电"短线 |

不做渐变、不做投影、不做玻璃质感。

### 字体

- **文字封面**：标题等宽 0.8rem / 行高 1.45，最多 3 行截断；标签与日期等宽 0.62rem。
- **封面图卡片**：不叠任何文字（图片本身就是内容）。
- 不给卡片加序号、眉标或角标——环本身就是结构。

### 布局

右栏（约 1fr 宽）里以圆心居中，半径取容器短边的 34%；卡片约 8.5rem × 10.5rem，沿圆周均布。

```
        ┌──────────────────────────────┐
        │            card              │
        │     card        card         │
        │            ╳  ← 圆心留空      │
        │     card        card         │
        │            card              │
        └──────────────────────────────┘
```

对齐：环的中心与右栏中心重合；卡片不做左侧对齐（它是件"装置"，不是文字栏）。

### 原则

1. **环是零件托盘，不是卡片墙**：卡片小而统一、围着空处转，视线沿轨道扫一圈就看完全部。
2. **只允许一套持续运动**：轨道自转是新的"活气"，因此把背景扫描光带从 9s 降频到 18s，避免三套节奏打架。
3. **文字封面与本页同语言**：等宽标题 + 发丝线 + 纸色底，和左侧的终端提示符是一家人。
4. **与登录面板共存靠"缩"，不靠"藏"**：面板打开时轨道缩到右侧窄带继续转，像机器还在运转。

### 对照"通用默认"自查

| 常见默认 | 这里怎么做 |
| --- | --- |
| 横向跑马灯/无限滚动卡片条 | 用圆形轨道（有结构含义：无始无终、可无限转） |
| 统一圆角 + 柔和阴影的卡片 | 直角、1px 发丝线、无阴影 |
| 悬停抬升 4px + 加阴影 | 只换描边颜色 + 轻微缩放，并且**让轨道减速**（动效服务于"读"） |
| 卡片上压标题条 + 标签胶囊 | 封面图卡片不叠字；文字封面才承担信息 |

自我删减：原本想在圆心放一个 `最新 6 篇` 的等宽小字，去掉——它是不干活的眉标，环本身已经说明了。

## 实现决策

### D1. 数据在服务端取，环在客户端动

`app/page.tsx` 增加一次查询：最新 6 篇已发布文章的 `id/slug/title/cover/tags/publishedAt`，作为纯数据传给客户端组件 `WelcomeOrbit`。轨道内不请求接口。

### D2. 环形几何：父级转、子级反向转

- 容器 `.welcome-orbit` 绝对定位填满右栏 stage；每张卡由 JS 按 `angle = i * 360 / n` 算出 `x = cos(a)·r`、`y = sin(a)·r`，用 `gsap.set` 落到位置。
- 自转：容器 `rotation: 360`，`duration: 40`，`ease: none`，`repeat: -1`；每张卡同时挂一个 `rotation: -360` 的同参数 tween —— 两者叠加后卡片的朝向恒定，只有位置在绕圈。
- 半径与卡片尺寸用 CSS 变量（`--orbit-radius`、`--card-w`），由 JS 在 mount 与 resize 时用容器尺寸算出并写到 style 上。

### D3. 减速而不是暂停

悬停或聚焦卡片的容器 → `orbitTween.timeScale(0.25)`；移开 → `timeScale(1)`。用 `timeScale` 而不是 `pause`，是为了保留"还在转"的感觉（用户能从动效里读出它是连续的）。

### D4. 退化链条

| 条件 | 形态 |
| --- | --- |
| 正常（≥981px 且非 reduce） | 环形排布 + 自转 |
| `prefers-reduced-motion: reduce` | 环形排布，**不转** |
| ≤980px | 不启用环：`.welcome-orbit-list` 保持纵向列表 |
| 无 JS | 同上：不加 `.is-orbiting`，就是一份纵向列表 |

实现上：默认 CSS 让列表是 `flex-direction: column` 的可读列表；JS 判定条件满足后才加 `.is-orbiting`（把子项切成绝对定位）并建 tween。resize 跨断点时要 `revert` 已建的 tween 并移除类，避免残留在列表形态。

### D5. 数量不足就"补环"

已发布文章 < 5 篇时，把列表循环补齐到 5 个槽位：重复项渲染为 `<div aria-hidden>` 而不是链接（不给屏幕阅读器和 Tab 制造重复入口）。文章数 ≥ 5 时每个都是真链接，`aria-label` 用「文章：标题」。

### D6. 与登录面板协调：一个自定义事件

`AuthTrigger` 在 `open` 变化时 `dispatchEvent(new CustomEvent("welcome:auth", { detail: { open } }))`；`WelcomeOrbit` 监听：

- 打开 → `gsap.to(stage, { scale: 0.45, opacity: 0.35, x: 48, duration: 0.45, ease: "power3.out" })`
- 关闭 → 回到 `scale: 1, opacity: 1, x: 0`

不改页面结构、不引入 context，两个组件保持互不依赖。

### D7. 入场时序

轨道在 `WelcomeMotion` 的入场完成后出现（约 1.3s）：`fromTo(stage, { opacity: 0, scale: 0.92 }, { opacity: 1, scale: 1, duration: 0.6 })`。它复用页面既有的 `html.js-ready` 门控，不额外造一套。

## Risks / Trade-offs

- [旋转时点击目标在移动，用户可能点空] → 悬停即减速到 1/4；卡片足够大（≥130px）；命中区域是整张卡。
- [无限 tween 在 React StrictMode 双挂载下叠加] → 在 effect 清理里 `gsap.killTweensOf([...])` 并把容器 transform 清掉。
- [图片卡片旋转时边缘发糊] → 旋转只发生在父容器与卡片两层 transform 上，不对位图做缩放；卡片加 `will-change: transform`。
- [跨断点 resize 残留绝对定位] → 切到列表形态时先 revert tween，再移除 `.is-orbiting`，并清掉 `--orbit-radius`。
- [长标题撑破文字封面] → `-webkit-line-clamp: 3` + `overflow: hidden`；标签超过 2 个只取前两个，无标签改显示日期。
- [与瞄准框/粒子层抢视觉] → 层级：grid 0 → orbit（右栏内容）1 → copy 2 → text-particles 3 → auth-panel 4 → cursor 300；轨道不与字标重叠。
- [页面持续动效变多] → 已经决定把背景扫描光带降频到 18s；若观感仍乱，下一步优先砍光带而不是轨道。

## Migration Plan

纯前端新增，无数据迁移：

1. 加查询与 `WelcomeOrbit` 骨架（先出静态列表形态）。
2. 接环形定位与自转，再接减速与点击。
3. 接登录协调与入场，最后补退化链条（reduce / 窄屏 / 无 JS / 补齐）。
4. 回滚：删组件与那段查询，右栏恢复成只有登录槽位。

## Open Questions

（无。形态与共存方式已在对话中确认：圆形轨道缓慢自转；登录打开时轨道缩成窄带继续转。）