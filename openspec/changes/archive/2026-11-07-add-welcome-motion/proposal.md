# Proposal

## Why

欢迎页现在只有一段 CSS 入场：标记描边、字标逐字、文字淡入。它够干净，但没有"人味"——鼠标划过页面时什么都不回应，点「进入博客」也是硬跳转。参考站那类作品集的观感来自**页面会跟着你动**：入场是有节奏的编排，光标是活的，按钮会迎上来，离开时有个过渡。

本变更是给这一屏加一层动效，不重做视觉。

## What Changes

- **入场序列改用 GSAP 编排**：标记描边 → 光标块长出 → 字标逐字遮罩揭示 → 定位句按行揭示 → 状态行与按钮依次就位，一条 timeline 统一控制缓动与错峰（现在的 CSS keyframes 交给它接管）。
- **光标跟随**：一个环形光标追随指针，在可点元素上放大；只在精确指针设备（`hover: hover` + `pointer: fine`）启用。
- **磁吸按钮/链接**：指针进入按钮附近时元素向其偏一小段，离开回弹。
- **鼠标视差**：背景细网格与标记随指针位置做极小幅度位移（几像素），不干扰阅读。
- **出页过渡**：点击「进入博客」时先播一段遮罩扫过，再执行路由跳转。
- **降级与克制**：`prefers-reduced-motion` 下全部动效关闭并直接呈现最终态；禁用 JS 时内容完整可读（内容的可见性以「JS 已就绪」为条件，不是反过来）。

## Capabilities

### New Capabilities

- `welcome-motion`: 欢迎页动效层契约 —— 入场 timeline 的编排与顺序、指针类效果（光标跟随 / 磁吸 / 视差）的启用条件与幅度上限、出页过渡的行为、以及减弱动效与无 JS 两种降级路径。

### Modified Capabilities

（无。`welcome-page` 的内容、配色、主题隔离契约不变；本变更只改"怎么动"。原 CSS 入场动画被 GSAP 接管，属实现手段替换。）

## Impact

- **代码**：`app/page.tsx` 保持服务端渲染内容不变，新增客户端增强组件 `components/welcome/WelcomeMotion.tsx`（GSAP timeline + 指针效果 + 出页过渡）与 `components/welcome/CursorFollower.tsx`；`app/redesign.css` 删掉原来的 CSS keyframes 入场，改为 `.js-ready` 门控的初始隐藏态；根布局的 `theme-init` 内联脚本补一句给 `<html>` 打 `js` 标记。
- **依赖**：GSAP 已在 `package.json`（`^3.15.0`），不新增包；用 `gsap.context()` + `matchMedia()` 做清理与降级，不引入 `@gsap/react`。
- **性能**：欢迎页从零 JS 变为带 GSAP 的客户端增强（GSAP 核心 + ScrollTrigger 未用，只加载核心与 `quickTo`）。首屏仍由服务端把文字渲染出来，动效在其上接管，不阻塞内容。
- **验证口径**：`tsc` 与 `build` 通过；`/` 在禁 JS 时内容完整；`reduce` 下无动画；指针效果在触屏设备不出现；`prefers-reduced-motion` 与 `hover: none` 两条 `matchMedia` 分支各验一次。
- **不在本次范围**：滚动叙事（这页只有一屏，要加内容才有意义）、页面进入时的过渡（那需要给 `/blog` 也加 JS，与"只在欢迎页用 GSAP"的结论冲突）、WebGL / 3D / 音频。

## 一个必须说清的前提

参考站 `https://jehaduddin.vercel.app/` 是纯前端渲染的 SPA，本轮抓取只拿得到 `<title>`，**我看不到它实际的动画实现**（没有可用浏览器，也取不到 JS bundle）。

所以这里不是"逐帧复刻"，而是按你选定的五类效果，用我们自己的视觉语言（白纸、发丝线、电蓝/洋红、等宽 + 无衬线）重新编排一套同语气的动效。落地后如果某个手感不对（比如光标环大小、磁吸幅度、入场节奏），改的是参数而不是结构。