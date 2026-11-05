# Tasks

## 1. 旋转状态机

- [x] 1.1 把"一条 `rotationY` tween"改成单状态 `state.rot` + `apply()`（`gsap.set(ring, { rotationY: state.rot })`）；自转改为 `onComplete` 递归续接 +360°（不用 `repeat: -1`，避免循环重置造成瞬跳）；验证：角度 29.3° → 34.3°/秒 ≈ 9°/s，与 360/40 一致，无跳变。
- [x] 1.2 抽象 `driveTo(target, dur, ease, onDone)` 统一入口，切换前 kill 旧 tween 并把角度留在当前位置；验证：拖拽 → 惯性 → 自转三段衔接连续，无回跳。

## 2. 拖拽与点击区分

- [x] 2.1 `pointerdown` 记录起点、`stopDrivers()`、`is-grabbing`；`pointermove` 按 `0.35 度/px` 写 `state.rot`；验证：拖 100px → **角度变化 35°**，与灵敏度一致。
- [x] 2.2 4px 阈值 + 捕获阶段 `click` 拦截；验证：轻点 → 进入 `/posts/第1节-langchain核心组件`；拖拽后抬手 → 仍停在 `/`。
- [x] 2.3 触屏：3D 模式下 stage 加 `touch-action: none; user-select: none`；卡片加 `draggable={false}` 避免浏览器原生图片拖拽抢事件。

## 3. 惯性与恢复自转

- [x] 3.1 `pointerup` 取速度（截断 ±1.2 度/ms）× `MOMENTUM_GAIN`，0.9s `power3.out`；验证：松手时 143.4° → 400ms 后 186.2°，确实继续滑行。
- [x] 3.2 惯性/吸附完成 → `scheduleResume()`（1.5s）；新的按下或滚轮会取消定时器；验证：192.2° → 600ms 后 197.7°（≈9°/s），自动自转已恢复。

## 4. 指针倾斜

- [x] 4.1 stage 与 ring 之间加 `.orbit-tilt`（`transform-style: preserve-3d`），倾斜只写这层；验证：自转（ring）与倾斜（tilt）互不覆盖。
- [x] 4.2 `quickTo` 跟随指针归一化位置，幅度 ±7°；指针离开 stage 归零；`reduce` 下不启用；验证：指针移到右侧时 tilt `rotationY ≈ 3°`；reduce 下 `transform: none`。

## 5. 悬停前推

- [x] 5.1 悬停卡片：内层 `.orbit-card` `z: 40 / scale: 1.03`，其余卡片 `opacity: 0.65`；移开全部复位；验证：实测 `z=40, scale=1.03`，另一张卡 `opacity=0.65`。
- [x] 5.2 键盘聚焦复用同一处理器（`focusin/focusout`）；悬停时自转 `timeScale(0.25)`，离开恢复。

## 6. 滚轮吸附

- [x] 6.1 stage 上 `wheel`（`passive: false`）：`preventDefault` + 220ms 节流，步长 `360/n`；验证：滚一格后角度 = **315°（45° 的整数倍）**，`window.scrollY` 仍为 0（页面没被带着滚）。
- [x] 6.2 吸附后恢复自转；指针不在 stage 上时滚轮照常滚页面（监听挂在 stage，作用域天然正确）。

## 7. 降级与验证

- [x] 7.1 `reduce`：不建自转、不做惯性、不做倾斜；拖拽与吸附仍可用。验证（CDP 模拟 `prefers-reduced-motion: reduce`）：1.2s 内角度变化 **0**、tilt `transform: none`、拖 100px 仍在 **35°**、松手后角度不再变（无惯性）。
- [x] 7.2 光标：3D 模式 `cursor: grab`，按下 `grabbing`（实测 `welcome-orbit is-orbit is-grabbing`）。
- [x] 7.3 清理：effect 移除全部监听、kill tween、清定时器、清内联 transform 与 tilt 变换。
- [x] 7.4 `npx tsc --noEmit` 通过；浏览器实测六条路径（自转 / 拖拽 / 惯性恢复 / 倾斜 / 前推 / 吸附 / 点击区分）全部一次通过。

## 实施备注

### 一并改掉的一处封面实现（你直接改的代码）

原来"有封面"渲染 `<img>`，你在 `CardFace` 里改成了把封面当 `background-image` 铺在文字卡片上。我按这个方向接了两处它缺的东西：

1. **`background-image` 必须是 `url(...)`**：原写法 `style={{ backgroundImage: cover }}` 传的是裸地址，浏览器不会加载；改成 `url("…")`，并在没有封面时传 `undefined`（否则 TS 与 CSS 都会拿到 `null`）。
2. **白字压照片会掉对比度**：加了 `[data-has-cover="true"]::after` 的墨色渐变（底部 92% → 45% 处 72% → 顶部 55%），压暗量按**最坏情况（近白照片）**配的；标题另加一层 1px 墨色文字投影。实测近白封面下白字仍清晰（截图 `.shots/orbit-cover-white.png`）。
3. 删掉了不再使用的 `.orbit-cover` 规则。

代价是照片会被压得偏暗；如果想让照片更亮，调 `redesign.css` 里那三段 `color-mix` 的百分比（55% 是顶部，最影响画面明亮度）。

### 验证方式

`Input.dispatchMouseEvent` 派发真实鼠标事件驱动，角度从 `getComputedStyle(ring).transform` 的 `matrix3d` 反解（`atan2(-m13, m11)`）；`transform: none` 时按 0° 处理（reduce 模式下没有 tween，就是这个情况，第一次测量因此拿到 null，已修正读取方式）。

## Workflow follow-up

- 提交推送 → CI 重建镜像 → 服务器 `docker compose up -d --force-recreate app`。
- 真机 iOS 与触控板各试一次拖拽手感（本轮用 CDP 合成事件，加速度曲线上手感需人手确认）。
- 确认无误后归档（`/openspec-archive-change`）。