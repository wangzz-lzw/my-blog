# Tasks

## 1. 抽出共用的切换壳

- [x] 1.1 新建 `components/auth/AuthSwitcher.tsx`：横向轨道 + 两块 pane + tablist + 指示条，接受 `initialTab` / `variant` / 成功回调。验证：把它单独挂到 `/login` 上能渲染出两个 tab，点击切换有响应。
- [x] 1.2 实现横向换页动画（`xPercent` 交叉）与高度跟随（激活块撑开轨道 + CSS `height` 过渡）；每次切换先 `killTweensOf` 两块再起新动画。验证：真实浏览器里从登录切注册，能看到登录左出、注册右进；连续快速点 5 次后停在正确的一页且无重影。
- [x] 1.3 高度跟随后不再按较高块固定撑开：从注册第一步切到登录时面板明显收窄。验证：用 `getBoundingClientRect().height` 分别记录登录态与注册态的高度，两者差值 > 60px。

## 2. 注册拆两步

- [x] 2.1 改 `RegisterFields`：拆成 step1（用户名 / 邮箱 / 验证码）与 step2（密码 / 确认密码），内部维护 `step` 状态，暴露「下一步」「上一步」；提交仍在 step2 一次性发出。验证：走完两步能成功创建账号（真实请求 `/api/register` 返回 ok）。
- [x] 2.2 步骤指示与焦点：`01 / 02` 等宽数字指示当前步；进入第二步时焦点落到第一个密码框；回头改邮箱后再前进，第一步的修改被带进最终提交。验证：键盘 Tab 顺序合理；改邮箱后提交的请求体里是改后的值。
- [x] 2.3 切换 tab 时步骤复位到第一步。验证：在第二步切到登录再切回注册，停在第一步。

## 3. 接入三个入口

- [x] 3.1 欢迎页 `AuthPanel` 改用 `AuthSwitcher`（`variant="panel"`），保留 Esc 关闭、开面板时焦点进第一个输入框、关闭后焦点归还触发按钮。验证：Esc 能关；打开时焦点在用户名框；关闭后焦点回到「登录」按钮。
- [x] 3.2 `/login` 与 `/register` 改用 `AuthSwitcher`（`variant="page"`），切换时用 `router.replace(..., { scroll: false })` 同步 URL 但不重新挂载。验证：在 `/login` 点「注册」后地址变成 `/register` 且页面没有整页刷新；直接访问 `/register` 落在注册第一步。
- [x] 3.3 输入保持：在登录填了内容切到注册再切回，内容还在（现有行为不能因重做而丢失）。验证：真实浏览器里填两个字段，来回切两次后值仍在。

## 4. 视觉重做

- [x] 4.1 面板外观向欢迎页白赛博靠拢：`--w-signal` 只用于步骤指示与主按钮切角；左缘加一条与站点刻度同语言的极淡竖向刻度。验证：新增 CSS 内无硬编码色值（全部走 token）；六套主题下面板不跟随站点主题（它固定白底，这是既有要求）。
- [x] 4.2 窄屏单栏下横向换页仍可用、无横向滚动条。验证：390px 视口下切换 tab，`document.documentElement.scrollWidth <= innerWidth`。

## 5. 降级与无障碍

- [x] 5.1 `prefers-reduced-motion: reduce` 下取消所有位移与高度过渡，切换瞬时完成。验证：用 CDP 覆盖该媒体特性后切换，两块没有可见位移。
- [x] 5.2 键盘与读屏：tabs 支持左右方向键；步骤切换时用 `aria-live` 播报「第 2 步，共 2 步」；焦点不会丢在已隐藏的 pane 里。验证：只用键盘能完成两步注册；切换步骤后 `document.activeElement` 在新 pane 内。

## 6. 集成验证与文档

- [x] 6.1 `npx tsc --noEmit` 与 `pnpm build` 通过。
- [x] 6.2 真实浏览器端到端：欢迎页打开面板 → 切到注册 → 走完两步创建账号 → 落到 `/blog`；独立页 `/register` 走同样的流程 → 落到 `returnTo`。
- [x] 6.3 更新 `docs/DEVELOPMENT.md`：补「登录/注册切换器」一节（横向轨道 + 高度跟随的实现要点、两步注册的字段归属、三个入口共用一个壳），并在页面清单里标注 `/login` 与 `/register` 已改为就地切换。验证：按文档能定位到 `AuthSwitcher` 与 `RegisterFields` 的对应实现。

## Workflow follow-up

- 通过评审后归档本变更（`/openspec-archive-change`），把 `auth-panel` 的 MODIFIED 与 ADDED 正确同步进主 spec。
- 归档后复核 `welcome-page` 的「入场动效只有一次」是否仍与实现一致（本变更按 design D6 判断无需修改该条，归档时再确认一次）。