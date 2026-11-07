# Tasks

## 1. 高度链与滚动容器

- [x] 1.1 `app/(site)/blog/page.tsx`：`<GsapReveal className="list-host">`，`.sheet` 加 `sheet--scroll` 类；`.ledger` 加 `data-scroll-pane`、`role="region"`、`aria-label="文章列表"`、`tabIndex={0}`。**实际做法**：这些属性跟着 `<div className="ledger">` 一起搬进了 `components/blog/ListScrollPane.tsx`（那个 div 现在由这个客户端组件渲染，属性放在它身上才和 ref/滚动监听同源）。
- [x] 1.2 `app/redesign.css` 补高度链：`body:has(.sheet--scroll) { height: 100vh; height: 100dvh; overflow: hidden }`、`main.site-main { min-height: 0 }`、`.list-host { flex: 1; min-height: 0; display: flex; flex-direction: column }`、`.sheet--scroll { height: 100%; min-height: 0 }`、`.ledger { flex: 1; min-height: 0; overflow-y: auto; scrollbar-gutter: stable; overscroll-behavior: contain }`。**实际做法**：`main.site-main` 与 `.list-host` 的规则都挂在 `body:has(.sheet--scroll)` 之下，避免影响其它路由。
- [x] 1.3 验证（1264×805）：条目多到超出视口时，**窗口右缘不出现滚动条**（`documentElement.scrollHeight === 805`）、`body.scrollTop === 0`、滚轮只让列表移动（`pane.scrollTop` 480 时 `scrollY` 仍为 0）、页头 `top === 0`、页脚 `bottom === 805`。

## 2. 侧栏独立

- [x] 2.1 `.rail { overflow-y: auto; overscroll-behavior: contain }`；验证：列表滚到中部时标签云/热门/评论仍在原位；侧栏高过视口时能单独滚（rail 120 / pane 0，再 pane 400 而 rail 仍 120）。

## 3. 键盘可达

- [x] 3.1 给 `.ledger` 写 `:focus-visible` 焦点环（`outline-offset: -4px`，避免被父级裁掉）；验证：Tab 能停在列表上（`activeElement.className === "ledger"`、`matches(':focus-visible')`）、PageDown 滚 483px、Home 归零、↓ 滚 40px，且 `scrollY` 全程为 0。
- [x] 3.2 确认 Tab 顺序：从列表再按一次 Tab 直接落到第一条文章链接（`/posts/...`），继续可遍历全部链接，没有跳不出去的死区。

## 4. 位置恢复

- [x] 4.1 新增 `components/blog/ListScrollPane.tsx`：挂载后从 `sessionStorage['blog:ledger-top']` 读数，`requestAnimationFrame` 里写回 `scrollTop`；滚动时写回该键；用模块级 `popstate` 标记区分「后退」与「新进入」。
- [x] 4.2 验证：滚到 900 → 点开文章 → 浏览器后退 → 列表回到 900（不是顶部）；从 `/tags` 点导航新进列表时为 0 且存储被清空。

## 5. 回到顶部跟随滚动层

- [x] 5.1 新增 `lib/scroll-pane.ts`：`currentScrollPane()` 先找 `[data-scroll-pane]`，没有则返回 `window`（另附 `paneScrollState` / `onPaneScroll` 两个统一读写口）。
- [x] 5.2 `components/FloatTools.tsx` 改用 `currentScrollPane()`：`scrollToTop()` 滚该容器；可用状态由容器的 `scrollTop / clientHeight` 判定（window 用 `scrollY / innerHeight`），事件监听从 `window` 换到该容器，并在 `pathname` 变化时重新解析（列表页 ↔ 其它页会换滚动层）。
- [x] 5.3 验证：列表页滚 480px 后「回到顶部」点亮（`is-idle` 移除、`tabIndex=0`），点击后列表回 0 且按钮恢复静默态；文章详情页仍是 window（`/posts/*` 的 body overflow 为 visible、页面可滚）。

## 6. 降级

- [x] 6.1 `@media (max-width: 1024px)`：撤销整条高度链（`height: auto`、`overflow: visible`、`.ledger` 恢复 `overflow: visible`）；验证：884px 与 500px 宽度下 `body.overflow = visible`、页面整页滚动、列表内部不是滚动容器、无横向滚动条。
- [x] 6.2 禁用 JavaScript 后打开 `/blog`（`Emulation.setScriptExecutionDisabled`）：全部条目可见、列表容器仍可滚、页头页脚位置正常、内容没有被裁切。

## 7. 滚动条外观

- [x] 7.1 列表容器右缘的滚动条随主题变化。**实际做法（与原计划的 webkit 定制不同）**：不接管 `::-webkit-scrollbar`，改用 `.sheet--scroll { color-scheme: dark }` + `[data-theme="daylight"] .sheet--scroll { color-scheme: light }` 让原生滚动条跟随主题；验证：暗色主题下滚动条轨道为深色、浅色主题下为浅色，位置与粗细不变（15px，与窗口滚动条同一套系统样式）。

## 8. 回归与质量门

- [x] 8.1 逐页回归滚动行为：`/`（欢迎页，body visible，无滚动容器）、`/blog`（body hidden、有 pane）、`/tags`（整页滚，1231px）、`/tags/[slug]`（整页滚，950px）、`/posts/[slug]`（整页滚，1054px）、`/login`（整页滚）。只有 `/blog` 变成内部滚动，且所有页面无横向溢出。
- [x] 8.2 `npx tsc --noEmit` 通过；`next build` 通过（Next.js 16.4.2，产物 24 条路由全部生成）。

## 实施备注

### 高度链是这条改动唯一容易翻车的地方

`body { display: flex }`、`main.site-main { flex: 1 }` 本来就在。真正的工作量在于**每一层都要 `min-height: 0`**：flex/grid 子项默认 `min-height: auto`，会让内容把容器撑高，于是"容器滚"悄悄变成"整页滚"，而肉眼看起来又像生效了（列表确实能滚——因为整页在滚）。所以验收里把「窗口右缘不出现滚动条 + `body.scrollTop === 0`」单列，不能只看列表能不能滚。

`GsapReveal` 那层无名 `div` 同样要接住高度（用它自己的 `className` 入参），否则整条链在这一层就断了。

### 滚动条：原生 + `color-scheme`，而不是 `::-webkit-scrollbar`

原本计划用 `::-webkit-scrollbar` 画一条 8px 的细滚动条。实测（Chrome 156 / Windows）一旦接管 `::-webkit-scrollbar` **或** `scrollbar-gutter`，Chrome 就退回经典滚动条渲染，**首尾会多出一对 ▲▼ 箭头**，且这些箭头无法用 `::-webkit-scrollbar-button { display: none }`（含 `:single-button`、`width/height: 0`、透明背景几种写法）去掉；而全站窗口滚动条本来就是这套带箭头的系统样式，所以最终选择"不接管外观、只声明 `color-scheme`"，让原生滚动条跟着主题走。

`scrollbar-gutter: stable` 保留：列表长短变化时条目宽度不会一跳一跳。

### 列表与侧栏各自一根滚动条

`.sheet--scroll .rail` 加了 `padding-right: 0.5rem`：侧栏内容高过视口时它自己滚，右侧的计数（`rail-rank .n`）否则会被压在滚动条底下。

### 验证方式与边界

- 滚动行为全部在真实浏览器里量（`innerWidth/innerHeight`、`scrollHeight/clientHeight`、`scrollTop`、`getBoundingClientRect`），没有只靠肉眼看截图。
- 为造出真实溢出，临时插了 12 篇 `__scroll-test-*` 文章（脚本 `scripts/_scroll-fixture.mjs`），验收后已全部删除（`{"cleaned":12}`），库里回到 2 篇已发布文章。
- **未覆盖**：`/admin/*` 需要管理员登录，未做登录态下的滚动回归（后台不在这条路由的 `:has()` 作用域内，样式上不受影响）。

## Workflow follow-up

- 上线后在真实设备上确认一次：桌面滚列表、手机整页滚。
- 确认无误后归档（`/openspec-archive-change`）。