# Design

## Context

动机见 `proposal.md`；契约见 `specs/editor-scroll-sync/spec.md`。这里只记录实现必须依据的现状与已验证的事实。

**分屏的两半不是同一种东西**（`components/admin/PostEditor.tsx:806-834`）：

```tsx
<div className={`editor-split mode-${mode}`}>
  <section className="editor-write">
    <textarea ref={textareaRef} className="editor-textarea" … />
    <div className="editor-status">…</div>
  </section>
  <section className="editor-preview">
    <div className="preview-head">…</div>
    <ScrollArea axis="y" className="preview-scroll" contentClassName="preview-body">
      {/* <div className="prose editor-prose"><Markdown>{content}</Markdown></div> */}
    </ScrollArea>
  </section>
</div>
```

- 左边是**原生 `<textarea>`**：它自己滚，滚动条由浏览器画（`scrollbar-width: auto`，实测占 17px），`lib/scroll-pane.ts` 的 `viewportOf()` 对它无效——它既不是 OverlayScrollbars viewport，也没有 `.sb-content`。
- 右边是 `ScrollArea`（OverlayScrollbars core），滚动条是自绘的 `--sb-*` 那一套（8px 轨、2px 滑块、刻度）。
- 两者**目前没有任何联动代码**（`grep scrollTop|onScroll|sync` 在 `PostEditor.tsx` 只命中与滚动无关的函数）。

**渲染管线**（`components/Markdown.tsx`）：`react-markdown` + `remark-gfm`/`remark-breaks` → `rehype-slug` → `rehype-autolink-headings` → `rehype-external-links` → `rehype-highlight`。它是**文章页与后台预览共用**的。组件映射里已有 `pre → CodeBlock`、`img`、`a` 三处。

**已实测验证的三个前提**：

1. `position.start.line` 从 mdast 一路保留到 hast（`heading/paragraph/code/list` 都有），rehype 插件写 `data-src` 后 **7/7 块级元素全部命中**。
2. `<textarea>` 的 `scrollTop` 可写、`scroll` 事件正常触发、`scrollbar-width: none` 后占位从 17px 降到 2px 且滚轮仍可滚。
3. 全站滚动层是 `#app-scroll`（OverlayScrollbars viewport），与编辑器无关；编辑器内部两层各自滚。

**既有可借鉴的做法**：`components/blog/ListScrollPane.tsx` 与 `components/blog/PostOutline.tsx` 已经确立了本仓库处理「滚动帧」的惯例——位置一次性缓存、滚动帧里只查表与写 DOM、`rAF` 合并、内容变化用 `ResizeObserver` 重测。

## Goals / Non-Goals

**Goals:**

- 联动落在**对应的块**上，且长文不累积偏移（这是选源码行而弃比例的原因）。
- 任何时刻只有一个驱动方，回声被结构性地消除而不是靠计时碰运气。
- 两侧滚动条视觉同源；不引入新依赖。
- 联动算法是纯函数，可以脱离 React 单独验证。

**Non-Goals:**

- 不做像素级对齐：Markdown 源码行与渲染后像素没有线性关系，能做到的是「落到同一个块」。
- 不做逐行滚动同步（`scrollTop` 一一对应）——那在代码块附近会严重错位。
- 不做光标跟随、不做当前段落高亮、不换 textarea 为 CodeMirror。
- 不改文章页前台行为（只是 HTML 多几个 `data-src`）。

## Decisions

### D1 用源码行号建立对应，而不是滚动比例

在 `Markdown` 管线里加一个 rehype 插件，把每个块级元素的 `position.start.line` 写成 `data-src`：

```ts
function rehypeSourceLine() {
  return (tree) => {
    visit(tree, "element", (node) => {
      if (!BLOCK.has(node.tagName)) return;          // 只标块级
      const line = node.position?.start?.line;
      if (typeof line === "number") {
        node.properties = { ...node.properties, "data-src": String(line) };
      }
    });
  };
}
```

- **为什么**：比例联动在长文里必然漂移（一段 5 行源码可能渲染成 50px，也可能 400px）；行号是源码与渲染结果之间唯一稳定的共同坐标。
- **为什么只标块级**：行内元素数量是块级的 10 倍以上，写进去会让 HTML 膨胀且无用于定位。`BLOCK = h1..h6, p, pre, ul, ol, blockquote, table, hr, figure`。
- **代价**：属性会出现在前台文章页（同一管线）。每块约 14 字节，一篇文章几十块，增量可忽略；且行号本身不含任何内容信息。
- **备选（否）**：让 `Markdown` 增加 `sourceLine` 开关，只在后台开启 —— 会让「预览与文章页同一管线」这条既有要求出现分叉（`markdown-render` 的「渲染入口一致性」正是这么规定的），宁可多几个属性也不破这条。
- **备选（否）**：在服务端先解析一次 mdast 取出 headings/块位置传给客户端 —— 需要把管线跑两遍，且与 `rehype-highlight` 之后的真实块结构不一定对应。

### D2 编辑区 → 预览：按「当前视口顶部的源码行」找块

```
line = 视口顶部对应的源码行（见 D4）
i = 最后一个满足 src[i] <= line 的块
预览 scrollTop = offsetTop[i]  （不是 scrollHeight 的比例）
```

- 找到块后直接**把它顶到预览可视区顶部**，而不是按比例：作者在左侧看到的第一个块，就是右侧看到的第一个块，对照关系一眼可见。
- `offsetTop` 用「块.rect.top - 预览viewport.rect.top + scrollTop」算，得到的是内容坐标系里的位置；缓存起来，滚动帧里只做查表。

### D3 预览 → 编辑区：按块的行号定位源码行

```
块可见 → 取它的 data-src
编辑区 scrollTop = 行号对应像素 - 一行的高度
```

- 行号 → 像素用**等宽行高**换算：`lineHeight`（实测 `1.75 × 0.92rem`）+ `paddingTop`。textarea 是 `font-family: var(--font-mono)`、`white-space: pre-wrap`、`resize: vertical`，没有额外行距，因此 `line * lineHeight` 是稳定的近似。
- 软换行是这套算法的精度边界：一行源码可能折成三行视觉行，此时换算会有偏差。**接受**——联动目标是「落到同一段」，不是「对齐到同一字符」；且真实写作里长行多数是正文段落，块级定位已足够。
- 备选（否）：用 `textarea` 的 `scrollHeight` 与总行数做比例 —— 那就退回比例联动，长文漂移问题原样存在。

### D4 编辑区「当前源码行」的算法

textarea 没有 API 能问「第几行在视口顶部」，只能换算：

```
line ≈ floor((scrollTop - paddingTop) / lineHeight) + 1
```

- 精确到行内位置需要 `textarea` 的测量能力（不存在），所以取整到行是合理精度；两侧都是块级对齐，行内误差不影响结果。
- 反过来，为了让「滚到哪里」和「高亮哪一块」自洽，`line` 一旦算出就固定用它查块，不在帧内重新换算。

### D5 回声消除：来源标记 + 单驱动方

```
驱动侧（用户滚的一侧）→ 写入前把另一侧标记为「受控」
受控侧收到 scroll 事件时，若处于受控窗口内 → 直接返回，不再反向驱动
```

- 关键**不是**计时器猜（`setTimeout` 猜窗口大小，弱机/慢滚会漏），而是 `程序化写入 → 该侧下一帧的 scroll 事件就是自己造成的` 这个确定性事实。用「写入时记录目标值与侧别」+ 在受控侧 scroll 里比对当前值是否已到达目标值来判断。
- 兜底再叠一个短窗口（120ms）防漏事件：`scrollTop` 赋值在极端情况下（目标等于当前位置）不会触发 scroll 事件，此时靠窗口自然过期，不会卡死。
- **只有一侧是驱动方**：记录 `driver: "write" | "preview" | null`。用户在另一侧产生真实输入（`wheel`/`touchstart`/`keydown`/`pointerdown`）时立即切换驱动方。
- 这样「快速来回滚动」不会堆积：任一时刻都只有一个方向在算，另一侧的滞后期被 `rAF` 合并吃掉。

### D6 位置缓存与重测时机

- 挂载、`mode` 变化、`content` 变化（debounce 200ms）、`ResizeObserver` 观察到预览内容或两侧容器尺寸变化 → 重测一次：块 `data-src` 列表 + 块 `offsetTop` 列表 + 行高/内边距。
- 滚动帧里**不读布局**，只做二分查表与一次 `scrollTop` 赋值。
- 内容变化后「以编辑区为基准重新对齐」（spec 的「重新开启立即对齐」同一条逻辑）：因为作者在编辑，编辑区位置才是当下的意图。

### D7 编辑区滚动条：隐藏原生 + 叠自绘轨道

- `textarea { scrollbar-width: none }`（实测占位 17px → 2px），再给 `.editor-write` 的相对定位容器叠一个自绘轨道（`PlainScrollbar`）：读 `scrollTop/scrollHeight/clientHeight` 画滑块与刻度，滚轮/拖拽由 textarea 自己处理（不回灌事件），滑块位置由 `scroll` 事件驱动。
- **为什么不把 textarea 塞进 `ScrollArea`**：`ScrollArea` 依赖「把 `.sb-content` 搬进库的 viewport」，而 textarea 的滚动是它自身的行为，搬进去会让库试图滚一个不可滚的容器；且 `resize: vertical` 与库的高度管理冲突。
- 备选（否）：`::-webkit-scrollbar` —— 本项目已实测：一旦自定义 webkit 滚动条，Chrome 会退回带 ▲▼ 的经典渲染，比原生更丑。
- 滑块拖拽：`PlainScrollbar` 的 handle 上做 pointer 拖拽 → 换算成 `textarea.scrollTop`（这是唯一需要反向写的地方，标为受控写入，避免回声）。

### D8 开关与状态

- 开关放 `editor-toolbar-right`（与视图切换同一行），`role="switch"` + `aria-checked`，文案「滚动联动」。
- 状态只放组件内（`useState`），不持久化——跨会话记住这个没有明显价值，且会让"为什么这次没联动"多一个排查维度。
- `mode !== "split"` 时不挂监听（不是挂了再判断），避免单栏下空转。

### D9 触屏与降级

- 触屏上 `ScrollArea` 不接管（既有行为），预览侧退化为原生滚动——联动仍按 `scrollTop` 工作，不受影响。
- 无 JS：没有 `data-src`（插件在服务端跑，属性其实会在）+ 没有联动脚本，两侧各自原生滚动，textarea 的 `scrollbar-width: none` 会**让无 JS 时编辑区没有可见滚动条**。因此这个样式必须由组件挂载后才生效——给 textarea 打 `data-synced="1"`，CSS 写成 `.editor-textarea[data-synced] { scrollbar-width: none }`。
  - 注意**不能**用根布局里那个 `js-ready`：那段内联脚本只在 `location.pathname === '/'` 时才加类（见 `app/layout.tsx:34`），编辑器页永远拿不到，用它门控会得到「编辑器始终显示原生条」的静默失败。**这一点是本次最容易被忽略的风险**。
- `prefers-reduced-motion`：联动一律用 `behavior: "auto"`（textarea 的 `scrollTop` 赋值本来就没有动画，预览侧同理）。

## Risks / Trade-offs

- **[无 JS 时编辑区失去滚动条]** → `scrollbar-width: none` 只在组件挂载后打 `data-synced="1"` 才生效（D9），并有验证兜底；不复用只对首页生效的 `js-ready`。
- **[两侧回声振荡]** → 来源标记 + 单驱动方（D5）；验证里专门有"快速来回滚动"场景。
- **[软换行导致行号→像素不准]** → 接受为精度边界（D3）；联动目标是块级对应，误差不累积（D1 保证）。
- **[前台文章页多出 `data-src`]** → 每块 ~14 字节，无信息泄漏；验证里断言既有选择器与样式不受影响。
- **[懒加载图片让块位置漂移]** → `ResizeObserver` 重测（D6）。
- **[全屏/站内回退切换]** → 两种全屏都会改变容器尺寸，`mode`/`fsMode` 变化与 `resize` 都要触发重测；`PostOutline` 已经踩过"sticky 参照物是 viewport 不是 document"的坑，这里同样只认编辑器自己的容器。
- **[textarea 的 `resize: vertical`]** → 用户拖高 textarea 会改变 `clientHeight` 但不改变行号映射；`ResizeObserver` 观察 textarea 自身重测即可。
- **[性能]** → 一篇文章的块数在几十到几百量级，二分查表与一次赋值都在帧预算内；`data-src` 列表在内容变化时才重建。

## Migration Plan

纯前端改动，无数据模型、接口、依赖变化：

1. 先加 `rehypeSourceLine` 与 `data-src`（前台无行为变化，只有属性）。
2. 加联动算法与 `PlainScrollbar`，接进 `PostEditor`（默认开启）。
3. 验证后如需回滚：移除开关与监听即恢复原状，`data-src` 留着也无害。

## Open Questions

- 预览侧被驱动时是「把对应块顶到视口顶部」还是「保持块在视口中相对位置」。前者对照感更强，后者看代码块时更连续。这属于手感微调，可以在实现后看真实效果再定，不影响 spec 与任务拆分。