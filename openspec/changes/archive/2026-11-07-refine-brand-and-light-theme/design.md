# Design

## Context

见 `proposal.md` 的 Why。实现前需要知道的现状（已核对代码）：

- 页头结构：`app/layout.tsx` 里 `.site-header > .container`（flex + `space-between`）内是 `.site-brand` 与 `.site-nav`。`.site-nav` 本身**没有** `display` 声明，是普通的块级容器；其子元素（导航 `a`、`.theme-switch`、`.register-link`、`.login-link`、`.admin-entry`、`.user-chip`、`.logout-link`、`.header-auth-slot`）全部按 inline 盒子参与排版，各自带不同 `margin-left`：`1.5 / 1.5 / 1.25 / 1.25 / 1.5 / 1 / 0.75 / 1.5rem`。
- `.theme-btn` 是 `inline-flex` 且内部只有三个色点、没有文字：按 CSS 基线规则，无文字 inline-flex 盒的基线退化为其下外边距边缘，因此与旁边的文字导航项基线不一致 —— 这正是截图里主题按钮"浮高/下沉"的原因。
- 主题全部由 `:root`/`[data-theme]` 的 CSS 变量派生（`--bg/--bg-2/--card/--fg/--border/--accent*/--code-bg/--input-bg/--btn-fg/--glow*` 等），`color-mix()` 统一做透明度派生。只有 6 处硬编码颜色：扫描线 `rgba(255,255,255,0.014)`（2 行）、阴影 `rgba(0,0,0,0.45)`/`rgba(0,0,0,0.55)`、色点描边 `rgba(0,0,0,0.35)`、一处 `rgba(255,255,255,0.018)`。
- 主题初始化：`app/layout.tsx` 用 `beforeInteractive` 脚本读 `localStorage.theme` 写入 `<html data-theme>`；`<html>` 带 `suppressHydrationWarning`。`ThemeSwitcher` 挂载后读 `document.documentElement.dataset.theme` 同步高亮项。
- 站点名硬编码在 `app/layout.tsx` 三处：`metadata.title`（default 与 `%s` 模板）、`.site-brand` 的文本与 `data-text`、页脚版权行。
- `.theme-menu` 走 `position: absolute; top: calc(100% + 0.5rem); right: 0; width: 208px`，行内是 `display: flex`；菜单标题 `margin: 0.2rem 0.35rem`，选项 `padding: 0.45rem 0.55rem`，两者左边界天然差 0.2rem。

## Goals / Non-Goals

**Goals:**

- 用一套统一的 flex 布局消掉页头"逐个 margin 拼间距 + 基线对齐"的根因，而不是逐项微调像素。
- 主题下拉的行内元素用栅格列强制对齐，使"色点列 / 名称列 / 勾选列"在任何主题名长度下都不漂移。
- 新增亮色主题时只加一组 token，不改任何组件结构；把现有的 6 处硬编码颜色收敛为 token，避免"浅色下阴影发黑、扫描线发灰"。
- 首次访问的系统偏好判定放在现有首屏注入脚本里，零闪烁、零 hydration 改动。

**Non-Goals:**

- 不做运行时"跟随系统"实时监听（系统切换深浅色时不自动改页面），只在首访决定初值；用户手动选过即以本地记录为准。
- 不为切换器新增"跟随系统 / 自动"菜单项，避免菜单语义复杂化。
- 不重做整体视觉语言（网格背景、CRT 扫描线、故障字效等赛博元素保留，只做亮色下的强度适配）。
- 不引入 CSS 框架、CSS-in-JS 或主题 npm 包；仍是单文件 `globals.css` + CSS 变量。
- 不改认证、数据模型、ISR 与部署链路。

## Decisions

### D1. 页头导航改为 flex 行 + 账号分组包裹

`.site-nav` 增加 `display: flex; align-items: center; gap: 0.9rem`，并删除所有子元素的 `margin-left`。`HeaderAuth` 的返回值统一包一层 `<div className="nav-account">`（同为 flex + `align-items: center` + `gap: 0.5rem`），使"导航链接组"与"账号控件组"成为两个 flex 项，组间距离由 `.site-nav` 的 `gap` + `.nav-account` 的 `margin-left` 表达，组内距离由内层 `gap` 表达。

同时把现有 `.site-nav a` / `.site-nav a:hover` / `.site-nav a::before` 收窄为 `.site-nav > a`：当前规则会把下划线扫入动效也套到「登录」按钮和用户牌上，收窄后只有真正的导航文字项有该动效。

- 替代方案：保留 inline 排版，只把每个 `margin-left` 改成同一个值 + `vertical-align: middle`。已被否掉——`vertical-align: middle` 依赖父级基线，控制高度一变就再次错位，等于把问题推迟。
- 替代方案：CSS Grid 排页头。可读性没有提升，且窄屏换行行为要重写，收益不足。

### D2. 控件高度用统一变量约束，而非逐类硬编码

引入 `--ctl-h: 26px`（页头小控件统一最小高度），应用到 `.theme-btn`、`.logout-link`、`.login-link`、`.user-chip`；文字导航与 `.register-link` 设 `line-height: var(--ctl-h)` 保持同一视觉中线。所有控件同时加 `box-sizing: border-box`（已全局），并把 `line-height: 1` 显式写在按钮类上，避免字体行高把盒子撑到 26px 以上。

理由：flex `align-items: center` 消除了基线对齐问题，但若各行内盒高度不同，"中心线一致"在视觉上仍会因上下内边距不对称而失衡；统一 `min-height` 让中心线一致变成结构保证。

### D3. 主题菜单用 CSS Grid 三列，标题对齐到行内容左边界

`.theme-menu button` 由 `display: flex` 改为：

```css
display: grid;
grid-template-columns: 33px minmax(0, 1fr) 1.2em;  /* 色点 / 名称 / 勾选 */
column-gap: 0.6rem;
align-items: center;
```

色点容器固定 33px 宽（3 × 9px + 2 × 3px），勾选列固定 1.2em 且对未选中行也留空，因此 6 行三列严格共线；`.theme-name` 不再需要 `flex: 1`。菜单标题改为 `padding: 0.2rem 0.55rem 0.45rem`，与选项内容左边界（`0.5rem` 菜单内边距 + `0.55rem` 选项内边距）对齐。

菜单锚定仍保留 `right: 0`（向右展开会溢出视口），但增加一个 8px 的 `::before` 小三角指向触发按钮，解决"这个菜单属于谁"的视觉归属；`top: calc(100% + 0.5rem)` 保持不变，窄屏 `right: -3.5rem` 覆盖保留。

- 替代方案：`left: 50%; transform: translateX(-50%)` 让菜单居中对齐触发按钮。否掉——触发按钮位于视口右缘，居中后菜单右半边超出视口，需要额外的碰撞检测逻辑。

### D4. 亮色主题只加一组 token，并补 3 个语义 token

新增 `[data-theme="daylight"]` 块（显示名「晨光白」），与现有 5 套同级：

| token | 亮色取值 | 说明 |
| --- | --- | --- |
| `--bg` / `--bg-2` / `--bg-deep` | `#f5f7fa` / `#ffffff` / `#e9edf3` | `--bg-deep` 还被沉浸式模式用作纯背景 |
| `--card` | `#ffffff` | 卡片靠边框而非明度差区分 |
| `--fg` / `--fg-bright` / `--fg-dim` | `#243040` / `#0f1720` / `#46586f` | 正文/标题/次要文字 |
| `--muted` / `--placeholder` | `#5a6b80` / `#8b98a8` | `--muted` 用于注释与元信息，需 ≥4.5:1 |
| `--border` | `#d5dce6` | |
| `--accent` / `--accent-2` / `--accent-3` | `#0a6f92` / `#c0246a` / `#96650a` | 深青/深玫/深琥珀，保证在浅底上做文字也够对比 |
| `--accent-bright` / `--string` | `#075a78` / `#a01f52` | 行内代码与代码块字符串 |
| `--code-bg` / `--input-bg` | `#eef2f7` / `#ffffff` | |
| `--btn-fg` | `#ffffff` | 语义为"accent 底上的文字"，亮色下反转为白 |
| `--glow` / `--glow-2` | `color-mix(in srgb, var(--accent) 12%, transparent)` / `(var(--accent-2) 10%)` | 光晕大幅减弱，避免文字发虚 |

为消除 6 处硬编码并给亮色留出口，新增 3 个 token（5 套深色主题各补一行，取值等于现状，视觉零变化）：

- `--scanline`：`body::after` 扫描线颜色。深色 `rgba(255,255,255,0.014)`，亮色 `rgba(15,23,42,0.02)`。
- `--shadow-soft`：`box-shadow` 软阴影（现 `.featured-*` 处 `0 6px 22px rgba(0,0,0,.45)`），亮色降为 `rgba(15,23,42,.10)`。
- `--shadow-strong`：菜单/浮层阴影（现 `0 14px 34px rgba(0,0,0,.55)`），亮色降为 `rgba(15,23,42,.16)`。

`.theme-dots i` 的 `rgba(0,0,0,0.35)` 描边在两套背景下都成立，保持不变。

- 替代方案：为亮色单独维护一份覆盖选择器列表（`.theme-menu, .card, .prose …`）。否掉——每加一个组件就要补一条覆盖规则，必然漏；token 化才能保证新增组件自动兼容。
- 替代方案：用 `@media (prefers-color-scheme: light)` 直接改 `:root`。否掉——目前是"6 套命名主题 + 手动切换"模型，媒体查询无法表达"用户明确选了樱雾粉"这类状态，会和切换器打架。

### D5. 初值判定放进现有 beforeInteractive 脚本

```js
try {
  var t = localStorage.getItem('theme');
  if (!t) t = matchMedia('(prefers-color-scheme: light)').matches ? 'daylight' : 'cyber';
  document.documentElement.dataset.theme = t;
} catch (e) {}
```

`localStorage` 与 `matchMedia` 都在 `try` 内，隐私模式抛错时退化为"不设 `data-theme`"＝默认深色，页面仍可用。服务端不输出 `data-theme`，`<html>` 已带 `suppressHydrationWarning`，因此不会引入 hydration 差异；`ThemeSwitcher` 现有的挂载读取逻辑无需改动即可正确高亮「晨光白」。

选择"首访判定 + 之后只认本地记录"，而不是引入 `system` 作为第三种存储值：后者要在切换器里加"跟随系统"项、要在运行时监听 `matchMedia` 变化、还要处理"用户选了又回到自动"的状态机，收益远小于成本。

### D6. 站点名抽成一个常量

新增 `lib/site.ts` 导出 `export const SITE_NAME = "LZW.LOG";`，`app/layout.tsx` 用它拼 `metadata.title.default`、`title.template`（`%s | ${SITE_NAME}`）、品牌文本与 `data-text`、页脚版权。避免三处手改不一致（本次就是靠人眼发现三处都在写死）。

品牌样式维持 `.site-brand` 的等宽 + 大写 + 字距，`data-text` 与文本取同一常量，故障叠层因此必然重合。

## Risks / Trade-offs

- [亮色主题暴露 token 审计漏网的深色硬编码] → 审计按"颜色是否来自 var()"遍历一次 `globals.css`，并在亮色下逐页目检首页、标签、文章、个人资料、后台五个页面，覆盖代码块、表格、引用块、表单、空状态。
- [统一 `min-height` 后页头控件比现在高，56px 页头行可能显挤] → 页头行高 56px，控件 26px，上下各留 15px，仍在安全区；若目检偏挤，把 `--ctl-h` 降到 24px 即可，不牵动布局。
- [`.site-nav > a` 收窄后，若将来有子级链接放进 `.site-nav` 深处会丢失下划线动效] → 有意为之：该动效只属于顶层导航文字项；账号区链接使用按钮形态，本就不该带扫入下划线。
- [`--btn-fg` 在亮色下语义反转（白字配深青底）] → 两处使用点（主按钮、某个 accent 底标签）已确认都是"accent 背景 + 对比文字"，反转后对比度更高；实现时逐处目检。
- [首访跟随系统会改变默认观感] → 已与用户确认接受；深色系统用户观感不变，浅色系统用户首访直接看到亮色，切回深色后被记住。
- [故障字效在亮色下可能显得脏] → 亮色主题里 `--glow` 已降到 12%，叠层本身的色差由 `--accent/--accent-2` 提供；若目检仍脏，只在 `[data-theme="daylight"]` 下把 `.glitch::before/::after` 的 `opacity` 上限压到 0.5（局部覆盖，不动结构）。
- [新增 3 个 token 要回填 5 套深色主题] → 取值严格采用现有硬编码值，深色下像素级不变，可用截图对比确认。

## Migration Plan

纯前端改动，无数据库迁移、无环境变量变更、无接口变化。

1. 本地 `npm run dev` 目检六套主题 × 五个页面 → `npx tsc --noEmit` 通过。
2. 提交并推送，走既有 GitHub Actions（`ci` 类型检查 → `deploy` SSH 到服务器 `docker compose up -d --build`）。
3. 回滚：`git revert` 该提交后重新触发流水线即可；用户已保存的主题偏好（`localStorage.theme`）不含新 id 时会自动回落到默认深色，不会出现"未知主题"空样式。

## Open Questions

（无。首访跟随系统、站点名、亮色主题的命名与范围均已在对话中确认。）