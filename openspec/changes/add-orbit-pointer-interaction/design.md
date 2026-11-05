# Design

## Context

现状（已核对代码）：

- `components/welcome/WelcomeOrbit.tsx`：`stageRef`（`.welcome-orbit`）与 `ringRef`（`.welcome-orbit-list`）；每张卡的 `transform` 由 JS 写死一次 `translate(-50%,-50%) rotateY(角度) translateZ(半径)`；自转是**一条 tween**：`gsap.to(ring, { rotationY: 360, duration: 40, ease: "none", repeat: -1 })`；悬停/聚焦通过 `tween.timeScale(0.25)` 减速。
- 舞台的 `perspective: 1100px` 由 JS 写成内联样式；`MIN_SLOTS = 8`，一格 45°。
- `.orbit-item` 有 `backface-visibility: hidden`（背面卡片不渲染）；`.orbit-card` 是 `<Link>`，带 1px 描边与大半径低浓度投影。
- 与登录面板的协调用 `welcome:auth` 事件缩放 stage。

新增交互必须和这些既有机制共存：**同一时刻只能有一个东西在改 `rotationY`**。

## 实现决策

### D1. 单旋转状态 + 三种驱动者

把"谁在转"收敛成一个数值 + 一个"当前驱动者"：

```ts
const state = { rot: 0 };
const apply = () => gsap.set(ring, { rotationY: state.rot });
type Drv = "auto" | "drag" | "momentum" | "snap";
```

- **auto**：`gsap.to(state, { rot: state.rot + 360, duration: 40, ease: "none", onUpdate: apply, onComplete: restart })`
- **drag**：指针位移直接写 `state.rot`，不起 tween
- **momentum**：`gsap.to(state, { rot: +N, duration: 0.9, ease: "power3.out" })`
- **snap**：`gsap.to(state, { rot: 目标角度, duration: 0.55, ease: "power3.out" })`

任何驱动力切换前先 `kill()` 掉旧的 tween 并把 `state.rot` 留在当前位置——这是"不回跳"的关键。

**为什么不用 `repeat: -1`**：GSAP 的 repeat 在循环回到起点时会把值重置为初始值，`onUpdate` 会把 `rotationY` 写回 0°，视觉上是一次瞬跳。改成 `onComplete` 里重新起一段 +360° 的 tween（从当前角度继续）。

### D2. 拖拽用 Pointer Events，自带触屏

`pointerdown` / `pointermove` / `pointerup` + `setPointerCapture`，一套代码同时覆盖鼠标、触屏、手写笔。

- 灵敏度：`0.35 度/像素`（横向拖 100px ≈ 35°）。
- 按下即 `kill` 自动自转与惯性，切到 `drag`。
- 位移 **超过 4px** 才标记 `dragged = true`；`click` 在捕获阶段看到 `dragged` 就 `preventDefault` 并复位——这样"拖完抬手"不会误进文章，而"轻点"照常跳转。
- 修饰键点击（Cmd/Ctrl）不拦截，交给浏览器开新标签。

### D3. 惯性与恢复自转

`pointerup` 时取最近 ~80ms 的位移算速度（度/毫秒），上限截断到 ±1.2 度/毫秒（防止甩飞），再乘释放系数起 `momentum`：

```
target = rot + v * 260      // ≈ 进一步滑行 0.3–1 秒的量
duration = 0.9, ease: power3.out
```

`momentum` 完成 → `resumeAuto(1500)`。任何新的 `pointerdown` / `wheel` 都会取消这个定时器并接管。

### D4. 倾斜：加一层包裹，别和自转抢属性

`rotationY` 已经被自转占着，倾斜如果再写 `rotationY` 会互相覆盖。所以在 stage 与 ring 之间插入 `.orbit-tilt`（`transform-style: preserve-3d`）：

```
.welcome-stage (perspective, 由 JS 设)
  └ .orbit-tilt   ← 指针倾斜写在这里（rotationX / rotationY，各 ≤7°）
      └ .welcome-orbit-list  ← 自转写在这里（rotationY 连续增长）
```

倾斜用 `quickTo`（`duration: 0.5, ease: "power3"`）跟随指针在舞台内的归一化位置；指针离开舞台 → 归零。

### D5. 悬停前推：位移落在卡片内层

卡片的 wrapper（`.orbit-item`）承担 `rotateY + translateZ`，**不能再往上叠 `translateZ` 前推**——GSAP 会重排 transform 顺序，把位置写坏。所以前推作用在内层 `.orbit-card`：

```ts
gsap.to(hoveredCard, { z: 40, scale: 1.03, duration: 0.35, ease: "power3.out" });
gsap.to(otherCards, { opacity: 0.65, duration: 0.25 });
```

内层在 wrapper 的局部坐标系里，前推正好是"朝观众"，与圆筒朝向一致。

### D6. 滚轮吸附：挂在 stage 上，天然只在环区域内生效

wheel 监听挂在 `.welcome-orbit` 上（不是 window），所以指针不在环上时页面滚动不受影响。处理：

- `e.preventDefault()`；节流 220ms（一次滚动只走一格）；
- `step = 360 / n`（8 格 = 45°）；
- `target = round(rot / step) * step + dir * step`；
- 起 `snap` tween，完成后 `resumeAuto(1500)`。

在这个元素上拦截滚轮是刻意的取舍：环是这块区域的主内容，滚它是"翻卡"的直觉；代价是用户不能用滚轮滚过这一小块，因此把作用范围严格限制在 stage 内。

### D7. 降级

| 条件 | 行为 |
| --- | --- |
| 正常 | 自转 + 拖拽/惯性 + 倾斜 + 前推 + 吸附 |
| `prefers-reduced-motion: reduce` | 不自动转、不做惯性（松手即停）、不做倾斜；拖拽跟手、滚轮瞬时到位 |
| ≤980px | 3D 环不启用（网格），以上交互全部不存在 |
| 拖拽中 | 悬停减速（`timeScale`）不参与，避免两套速度控制打架 |

### D8. 光标

`.welcome-orbit` 在 3D 模式下 `cursor: grab`，`pointerdown` 时切 `grabbing`。页面自己的瞄准框（细指针设备）是装饰层，与系统光标共存，不冲突。

## Risks / Trade-offs

- [滚轮被拦截会让"滚过这一块"失效] → 只在 stage 内拦截；这是刻意的取舍，写进 spec 的场景里。
- [拖拽与点击误判] → 4px 阈值 + 捕获阶段拦截 `click`；修饰键点击不拦。
- [惯性结束后恢复自转出现速度突变] → 恢复时用同一 `duration: 40` 的线性 tween 从当前角度继续，不做缓动衔接。
- [倾斜 + 透视导致边缘卡片被裁] → 倾斜 ≤7°；卡片距舞台边缘留有余量（半径公式已扣卡片尺寸）。
- [StrictMode 双挂载导致事件重复绑定] → effect 统一清理：移除监听、kill 全部 tween、清定时器、清内联 transform。
- [拖拽时页面选中文本] → stage 上 `user-select: none`，并 `touch-action: none`（3D 模式下）。
- [与登录面板缩放共存] → 面板打开时 stage 被缩放/位移，拖拽食指尖坐标可能偏移；拖拽只作用于 `state.rot`（角度与缩放无关），因此不受影响。

## Migration Plan

纯前端交互增强，无数据迁移：

1. 先接旋转状态机（把现有单条 tween 换掉，确认自转仍正常、无跳变）。
2. 再依次接拖拽 → 惯性/恢复 → 吸附 → 倾斜 → 前推。
3. 每接一项用浏览器截图 + 角度取样验证（例如间隔 1s 读 `getComputedStyle(ring).transform`）。
4. 回滚：删掉新增事件与 tilt 层即可回到"自转 + 悬停减速"。

## Open Questions

（无。四项交互 + 点击进入详情 + 惯性后恢复自转，均已在对话中确认。）