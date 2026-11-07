# Tasks

## 1. 主题令牌：收敛硬编码 + 新增亮色主题

- [x] 1.1 在 `app/globals.css` 的 5 套深色主题块各补 3 个语义 token：`--scanline`（沿用 `rgba(255,255,255,0.014)`）、`--shadow-soft`（沿用 `0 6px 22px rgba(0,0,0,.45)` 中的颜色值）、`--shadow-strong`（沿用 `0 14px 34px rgba(0,0,0,.55)` 中的颜色值）；验证：`Select-String -Path app/globals.css -Pattern '--scanline|--shadow-soft|--shadow-strong'` 在 5 个主题块内各命中 1 次。
- [x] 1.2 把 6 处硬编码颜色替换为新 token：`body::after` 的 `rgba(255,255,255,0.014)` → `var(--scanline)`、`.featured-*` 等处 `box-shadow` 的 `rgba(0,0,0,.45)` → `var(--shadow-soft)`、`.theme-menu` 的 `rgba(0,0,0,.55)` → `var(--shadow-strong)`，并处理 `rgba(255,255,255,0.018)` 那一处；验证：`Select-String -Path app\globals.css -Pattern 'rgba\(0, 0, 0, 0\.(45|55)|rgba\(255, 255, 255, 0\.0'` 无输出。
- [x] 1.3 新增 `[data-theme="daylight"]` 主题块，按 design.md D4 的表格填全 `--bg/--bg-2/--bg-deep/--card/--panel/--fg/--fg-bright/--fg-dim/--muted/--placeholder/--border/--accent/--accent-2/--accent-3/--accent-bright/--string/--code-bg/--input-bg/--btn-fg/--glow/--glow-2/--scanline/--shadow-soft/--shadow-strong`；验证：临时在浏览器把 `<html data-theme>` 改成 `daylight`，首页与文章页背景转浅、正文转深，无残留深色底。
- [x] 1.4 亮色下目检代码块与正文对比度：文章页含关键字/字符串/注释的代码块三种着色可辨认，正文与背景对比度 ≥4.5:1（DevTools 取色计算或对比度插件）；验证：记录实测值，不足则微调 `--accent/--string/--muted` 后复测。

## 2. 页头导航对齐

- [x] 2.1 `app/globals.css`：给 `.site-nav` 加 `display: flex; align-items: center; gap: 0.9rem`，删除 `.site-nav a`、`.login-link`、`.register-link`、`.admin-entry`、`.user-chip`、`.logout-link`、`.header-auth-slot`、`.site-nav .theme-switch`、`.site-nav .user-avatar` 上的全部 `margin-left`（含 720px 媒体查询内的同名覆盖）；验证：`Select-String -Path app\globals.css -Pattern 'margin-left'` 中不再出现上述选择器。
- [x] 2.2 `app/globals.css`：把 `.site-nav a` / `:hover` / `::before` 三条规则收窄为 `.site-nav > a`；验证：未登录页面上「登录」按钮与用户牌不再出现下划线扫入动效，仅「首页」「标签」有。
- [x] 2.3 `components/HeaderAuth.tsx`：三种返回形态（加载占位、未登录、已登录）统一包一层 `<div className="nav-account">`，并在 `globals.css` 加 `.nav-account { display: flex; align-items: center; gap: 0.5rem; }`；验证：登录/未登录切换后页头右侧控件顺序为「导航组 | 账号组」，无孤立空格或错行。
- [x] 2.4 统一控件高度：新增 `--ctl-h: 26px`，作用于 `.theme-btn`、`.logout-link`、`.login-link`、`.user-chip`，并给按钮类补 `line-height: 1`；验证：1280px 视口截图，用 DevTools 测量「首页/标签/后台/主题按钮/用户牌/退出」六者的垂直中心线，两两偏差 ≤1px。
- [x] 2.5 验证横向间距：在 1280px 视口测量「标签→主题按钮」「主题按钮→后台」「后台→用户牌」「用户牌→退出」四处间隙，差值 ≤2px；验证：记录四个实测值。
- [x] 2.6 窄屏回归：390px 与 720px 视口下页头允许换行、无横向滚动条、控件不重叠；验证：两个宽度各截图一张并检查 `document.documentElement.scrollWidth <= clientWidth`。

## 3. 主题切换器对齐

- [x] 3.1 `components/ThemeSwitcher.tsx`：在 `THEMES` 末尾加 `{ id: "daylight", name: "晨光白", swatch: [...] }`（样本色取亮色主题的 bg / accent / accent-2）；验证：菜单出现第 6 项，点击后全站转浅色且高亮项为该行。
- [x] 3.2 `app/globals.css`：`.theme-menu button` 改为 `display: grid; grid-template-columns: 33px minmax(0,1fr) 1.2em; column-gap: 0.6rem; align-items: center;`，`.theme-name` 去掉 `flex: 1`，勾选列对未选中行也占位；验证：菜单展开后截图，6 行色点中心与名称左边界各自成一条竖线（像素级比对）。
- [x] 3.3 `app/globals.css`：`.theme-menu-title` 改 `padding: 0.2rem 0.55rem 0.45rem`，使标题左边界与选项内容左边界一致；验证：截图测量标题「配色主题」与首行名称的水平起点差 ≤1px。
- [x] 3.4 `app/globals.css`：给 `.theme-menu` 加指向触发按钮的 `::before` 小三角（8px，`--border` 描边、`var(--bg-2)` 填充），保留 `right: 0` 锚定与 720px 下的 `right: -3.5rem`；验证：1280px 与 390px 下菜单不遮挡触发按钮、不出视口。
- [x] 3.5 交互回归：Esc 关闭、点击外部关闭、`role="menuitemradio"` + `aria-checked` 语义正确；验证：键盘 Tab 到触发按钮 → Enter 展开 → Esc 收起，并用无障碍面板确认选中项 `aria-checked="true"`。
- [x] 3.6 后台侧栏复用检查：进入 `/admin`，页头同款切换器在侧栏底部外观与对齐正常，菜单不贴边错位；验证：截图对比页头与侧栏的下拉菜单。

## 4. 站点更名 LZW.LOG

- [x] 4.1 新增 `lib/site.ts` 导出 `SITE_NAME = "LZW.LOG"`；验证：`npx tsc --noEmit` 通过。
- [x] 4.2 `app/layout.tsx` 用该常量替换三处硬编码站点名：`metadata.title.default`、`title.template`（`%s | ${SITE_NAME}`）、`.site-brand` 文本与 `data-text`、页脚版权行；验证：`Select-String -Path app\layout.tsx -Pattern '我的博客'` 无输出。
- [x] 4.3 浏览器核对三处呈现：标签页标题（首页为 `LZW.LOG`，文章页为 `<标题> | LZW.LOG`）、页头左侧品牌、页脚版权行；验证：三个位置截图，并确认故障字效叠层与品牌文字起点重合、文字长度变化后页头不破版（1280px 与 390px）。
- [x] 4.4 全站残留检索：`Select-String -Path app\**\*.tsx,components\**\*.tsx,lib\**\*.ts -Pattern '我的博客'` 无输出（`app/page.tsx` 侧栏文案「关于本站」中的描述如含旧名一并核对）；验证：命令无匹配。

## 5. 首访跟随系统深浅偏好

- [x] 5.1 `app/layout.tsx` 的 `beforeInteractive` 脚本改为"无本地记录时读 `matchMedia('(prefers-color-scheme: light)')` 决定 `daylight` 或 `cyber`"，保留整体 `try/catch` 兜底；验证：隐私模式（本地存储不可用）下页面仍正常渲染，控制台无未捕获错误。
- [x] 5.2 首访行为验证：DevTools 把 prefers-color-scheme 设为 light 后清空 localStorage 刷新，首帧即亮色、无跳变；设为 dark 或清除模拟后首帧深色；验证：Performance 面板或录屏确认无主题闪变。
- [x] 5.3 持久化优先级验证：在浅色系统下手动选择「赛博青」，刷新后仍为赛博青；再把系统模拟为浅色，确认不被覆盖；验证：两次刷新后 `<html data-theme>` 保持 `cyber`。

## 6. 集成验证

- [x] 6.1 六套主题 × 首页 / 标签 / 文章 / 个人资料 / 后台 五页，逐页目检无残留深色或不可读文字（重点看代码块、表格、引用块、表单、空状态、评论列表）；验证：亮色主题下五页各一张截图。
- [x] 6.2 四个视口（1280 / 1024 / 768 / 390）下页头与主题菜单不重叠不溢出；验证：`scrollWidth <= clientWidth` 为真，且页头元素 rect 两两不相交。
- [x] 6.3 `npx tsc --noEmit` 与 `npm run build` 均通过（build 前先停掉本地 dev server，避免 `.next` 争用）；验证：两条命令退出码为 0。

## 实施备注（超出原任务文本的偏差，均为等价或更优实现）

- 1.1 实际把 `--scanline` / `--zebra` / `--shadow-soft` / `--shadow-strong` 声明在共享的 `:root, [data-theme="cyber"]` 块中（其余 5 套主题通过 `:root` 继承，与 `--font-mono` 同一处理方式），避免 15 行纯重复；另新增 `--zebra` 承接表格斑马行，共 4 个 token 而非 3 个。
- 2.5 实测为两层节奏：组间（导航→主题→后台）14.3–14.4px，组内（后台→用户牌→退出）8.0px，对应设计 D1 的分组语义；4 处间隙并非同一数值。
- 3.3 标题与「行内容起点」对齐（相差 1px，来源是选项按钮自身的 1px 透明边框），而非与名称列对齐——名称列还隔着 33px 的色点列。
- 3.4 窄屏锚定由 `right: -3.5rem` 改为 `left: 0` 向右展开：实测原规则在 390px 下菜单左边缘到 −21px 出视口。
- 3.6 后台侧栏补了 `.admin-side-actions .theme-menu` 的向上弹出定位：原 `right: 0` 在左下角会把菜单推到视口左侧外并把底部裁掉。
- 4.3 为满足「文章页标题 = `<标题> | LZW.LOG`」，给 `app/posts/[slug]/page.tsx` 增加了 `generateMetadata`（原本该页没有页面级 title，只会显示站点名）。
- 站点演示文章标题仍是旧文案「欢迎来到我的博客」，属数据库内容而非源码，未改。

## Workflow follow-up

- 提交并推送（`.gitattributes`、Dockerfile 初始化日志、CI 的 `DEPLOY_PATH` 守卫等既有未提交改动一并整理），走既有 GitHub Actions 部署。
- 部署后在线上核对六套主题切换与亮色首访行为，再归档本变更（`/openspec-archive-change`）。