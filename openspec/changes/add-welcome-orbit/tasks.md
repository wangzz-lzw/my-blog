# Tasks

## 1. 数据与骨架

- [x] 1.1 `app/page.tsx` 增加查询：最新 6 篇已发布文章的 `id/slug/title/cover/publishedAt/tags`，与现有计数查询并列在 `Promise.all` 里，并映射成 `OrbitPost[]`（日期预格式化为 `YYYY.MM.DD`）；验证：`tsc` 通过，页面 200。
- [x] 1.2 新建 `components/welcome/WelcomeOrbit.tsx`（客户端）：渲染 `.welcome-orbit > .welcome-orbit-list > 卡片`；默认形态是纵向列表（无 JS 也能用）；验证：HTML 中默认是 `<ul>` 列表结构，未加 `is-orbiting`。
- [x] 1.3 文章不足 5 篇时补齐槽位：重复项渲染为 `<span aria-hidden>`（不带链接、不可聚焦），真实项用 `<Link>` 且 `aria-label="文章：标题"`；验证：当前 2 篇文章 → 5 个槽位、2 个真链接、3 个隐藏填充。

## 2. 两种卡片

- [x] 2.1 有封面：卡面用 `post.cover`（经 `toSiteImageUrl`），`object-fit: cover` 填满，`loading="lazy"`，1px 发丝线描边，不叠文字。
- [x] 2.2 无封面：文字封面 —— 等宽标题最多 3 行（`-webkit-line-clamp`）+ 底部标签（取前 2 个，无标签显示日期）+ 顶部一小截洋红短线；验证：当前库里两篇都没有封面，5 张卡全走文字封面分支。

## 3. 环形排布与自转

- [x] 3.1 几何：按容器短边 × 0.34 算半径写入 `--orbit-radius`，每张卡 `gsap.set({x,y})` 落到圆周；`.is-orbiting` 把子项切成绝对定位（`top/left 50%` + 负 margin 居中）。
- [x] 3.2 自转：容器 `rotation 360 / 40s / ease none / repeat -1`，每张卡同时 `rotation -360` 同参数；文字因此始终正立。
- [x] 3.3 减速：卡片 `pointerover/in` 与 `focusin` → `timeScale(0.25)`；`pointerout`/`focusout` → `1`。
- [x] 3.4 清理：effect 返回时 `mm.revert()` + `stop()`（kill 全部 tween、移除 `.is-orbiting`、clearProps）+ `killTweensOf(stage)`，StrictMode 双挂载不叠加。

## 4. 交互与点击

- [x] 4.1 卡片是 `<Link href={/posts/<slug>}>`，不拦截任何点击（不 `preventDefault`），修饰键点击走浏览器默认行为。
- [x] 4.2 悬停/聚焦时描边换 `--w-signal`；`focus-visible` 与 hover 同一套反馈。

## 5. 与登录面板、入场的协调

- [x] 5.1 `AuthTrigger` 在开关变化时派发 `welcome:auth` 自定义事件（`detail.open`）；`WelcomeOrbit` 监听：打开 → `scale .45 / opacity .35 / x 48`，关闭复位；reduce 下跳过。
- [x] 5.2 入场：`delay 1.3s` 的 `opacity 0→1 / scale .92→1`，落在页面主序列之后。

## 6. 退化

- [x] 6.1 `prefers-reduced-motion: reduce`：仍按环形排布（`is-orbiting` 照加），但不建自转 tween、不做入场与共存动画。
- [x] 6.2 ≤980px：`gsap.matchMedia("(min-width: 981px)")` 不匹配 → 不加 `.is-orbiting`，保持纵向列表；跨断点 resize 时由 matchMedia 清理函数 `stop()` 复位。
- [x] 6.3 无 JS：`.is-orbiting` 由客户端 effect 添加，无 JS 时不存在 → 列表形态可读可点。

## 7. 验证

- [x] 7.1 层级：`.welcome-stage` 里的轨道 `z-index: 1`、登录槽位 `z-index: 5`；面板绝对定位在槽位内，压住轨道。
- [x] 7.2 背景扫描光带 9s → **18s**（避免与自转形成两套快节奏）。
- [x] 7.3 `npx tsc --noEmit` 通过；`npm run build` 未跑（dev server 在运行，避免争用 `.next`）。
- [x] 7.4 冒烟：`/` 200；5 个槽位 / 2 个真链接 / 3 个隐藏填充；文字封面 5 张；登录槽位仍在；单 `h1`。

## 实施备注

### 封面改成"文字卡 + 背景图"（你改的实现，已补齐）

原先"有封面"渲染 `<img>`；后来改成把封面当 `background-image` 铺在文字卡片上，标题与标签压在图上面。补齐了两处：`background-image` 要用 `url("…")`、无封面时传 `undefined`；并加了一层墨色渐变与文字投影保证白字可读（按近白照片的最坏情况配的压暗量）。详见 `add-orbit-pointer-interaction` 的实施备注。

### 形态改了两次：平面圆环 → 3D 圆筒

第一版按"平面圆周"实现（卡片用 x/y 摆在圆上、整体 `rotation` 自转、卡片反向 `rotation` 抵消）。用真浏览器看后否定：

1. **平面环不成立**：卡片反向旋转后依旧平铺在屏幕上，看起来只是"卡片摆成一圈"，没有环绕感；
2. 而且两个 tween（容器 +360°、卡片 −360°）各自缓存 transform，卡片的 tween 每帧把 x/y 写回 0，全叠在圆心——这个 bug 在真浏览器里一眼可见，纯代码审查看不出来。

改成 **3D 圆筒**（这才是要的效果）：

- 父级 `perspective: 1100px`，环 `transform-style: preserve-3d`；
- 每张卡由 JS 写死一次 `translate(-50%,-50%) rotateY(角度) translateZ(半径)`，立在圆筒外侧朝外；
- GSAP 只转一个量：`ring.rotationY: 0 → 360`，40s、linear、无限；
- `backface-visibility: hidden`：背对镜头的卡片自动隐藏，界面上通常同时看到 3 张（中间正对、两侧带透视倾斜）。

### 数据驱动的参数

- **格数 8**：3D 环背面会隐藏，格数太少屏幕上只剩一两张，读不出"环绕"。文章不足 8 篇时循环补齐，重复项 `aria-hidden`、不可聚焦。
- **半径**：`max(卡片宽 × 1.1, 弦长公式 × 1.05)`，其中弦长公式 `cardW / (2·sin(π/n))` 保证相邻卡片不互相叠压；卡片尺寸变了半径会跟着变，不用手调。
- 卡片：9rem × 9.6rem，深色 14% 描边 + 大半径低浓度投影（投影只用来交代景深，不是卡片装饰）。

### 当前数据下

库里 2 篇已发布文章、**都没有封面**，所以 8 格里全是文字封面（标题 + 标签），其中 6 格是循环补位的隐藏副本。封面图分支代码就绪但没数据走过。

### 真浏览器验证结果（本轮已具备浏览器）

- 3D 环生效：`is-orbiting` 已加，8 个 `.orbit-item`，每张卡的 transform 里是 `rotateY(45°) translateZ(197px)` 这类值；
- **确实在转**：间隔 2 秒取样，同一张卡的 `x` 从 993 → 1063、宽度从 131 → 82（由近及远），证明透视与自转都生效；
- 窄屏（958px）自动退回网格：`is-orbiting` 未加，卡片是 `repeat(auto-fill, minmax(9.5rem,1fr))` 网格；
- 截图：`.shots/orbit-final.png`。

### 仍需你在真机确认的

悬停/聚焦减速的手感、旋转中点击是否好点（命中区域在动）、登录面板打开时轨道缩到右侧的观感——本轮登录态是管理员，欢迎页第三个入口是「后台」，没法在本机点开登录面板验证共存。

## Workflow follow-up

### 一处与设计的偏差

设计里写"`radius` 由 JS 写到 `--orbit-radius` 变量、卡片尺寸用 CSS 变量"，实现上半径确实写进了变量，但卡片尺寸直接用 CSS 里的 `--card-w/--card-h` 常量（8.6rem × 10.6rem），没有按容器尺寸缩放。原因：卡片尺寸随窗口无限缩放会让文字封面字号失去基准；固定尺寸 + 半径自适应反而更稳。

### 当前数据下的表现

库里 2 篇已发布文章、**都没有封面**，所以现在看到的 5 张卡全部是文字封面，其中 3 张是循环补位的隐藏副本。封面图那条分支代码已就绪，但没有真实数据走过——给任意一篇设置封面后即可验证。

### 验证降级说明（需要你看一眼）

本轮无浏览器会话，以下只能靠代码与 HTML 产物确认，运动本身要你实测：

- 环形是否真的转起来、卡片是否始终正立（父级 +360°、子级 −360° 的抵消效果）；
- 悬停减速是否明显、移开是否恢复；
- 旋转中点击是否好点（设计里的风险点：命中区域在移动）；
- 点「登录」时轨道是否缩到右侧不遮面板；
- 390px 与无 JS 是否退化成列表。

可调参数都在 `WelcomeOrbit.tsx` 顶部：`REVOLUTION`（一圈秒数）、`SLOW`（减速倍率）、`MIN_SLOTS`（补位下限），以及 `layout()` 里的半径系数 `0.34`。

## Workflow follow-up

- 提交推送 → CI 重建镜像 → 服务器 `docker compose up -d --force-recreate app`。
- 真机看一次低配设备上的旋转是否掉帧；必要时把 `REVOLUTION` 放慢到 60。
- 确认无误后归档（`/openspec-archive-change`）。