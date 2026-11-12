# Spec Delta

## Purpose

定义 Markdown 渲染管线对「正文可能包含内联 HTML」这一事实的处理契约：什么样的 HTML 会被渲染、什么必须被剥离、标题与目录如何取到干净文本、导入时如何规整，以及存量内容如何安全清洗。

## ADDED Requirements

### Requirement: 内联 HTML 按 HTML 渲染

文章正文中的内联 HTML SHALL 被解析为 HTML 元素渲染，而不是作为纯文本显示。

#### Scenario: 带样式属性的文字
- **WHEN** 正文包含 `<font style="color:rgb(79,79,79)">actions.js</font>`
- **THEN** 页面显示 `actions.js`，不出现尖括号或 `style=` 字样

#### Scenario: 展示性标签
- **WHEN** 正文包含 `<br>`、`<sup>`、`<sub>`、`<table>` 等展示性标签
- **THEN** 它们按各自的视觉语义生效，不显示为源码文本

#### Scenario: 代码块内的尖括号保持原样
- **WHEN** fenced 代码块或行内代码中出现 `<class '...'>`、`<div>` 之类的文本
- **THEN** 它们作为代码内容原样显示，绝不被当作 HTML 解析或删除

### Requirement: 危险 HTML 必须被剥离

渲染管线 MUST 在渲染 HTML 之前执行白名单过滤；脚本、事件处理器与非安全协议 MUST 被移除。

#### Scenario: script 标签
- **WHEN** 正文中包含 `<script>alert(1)</script>`
- **THEN** 页面不执行该脚本，且不出现其内容

#### Scenario: 事件属性
- **WHEN** 正文中包含 `<img src="x" onerror="alert(1)">`
- **THEN** `onerror` 属性被移除，不触发任何脚本

#### Scenario: javascript 协议
- **WHEN** 正文中包含 `<a href="javascript:alert(1)">点我</a>`
- **THEN** 该链接的 `javascript:` 协议被移除或链接不可执行

#### Scenario: 原有链接与图片行为不变
- **WHEN** 正文使用 Markdown 语法的链接与图片，或 HTML 的 `<a>`、`<img>`
- **THEN** 外链仍带 `target="_blank"` 与 `rel="noopener noreferrer"`，图片仍走站内 `/img` 收口与懒加载

### Requirement: 标题与目录取纯文本

标题的可见文本 SHALL 不含 HTML 标签残留；目录 SHALL 显示与正文一致的干净标题。

#### Scenario: 标题含内联标签
- **WHEN** 某标题写作 `## <font style="...">actions.js</font> 的用法`
- **THEN** 正文标题显示「actions.js 的用法」，目录项同样显示该文本，不含 `<font` 字样

#### Scenario: 既有目录行为不变
- **WHEN** 标题中由 rehype-autolink-headings 追加了 `.heading-anchor`
- **THEN** 目录项不显示该锚点字符（保持现有行为）

### Requirement: 导入时规整 HTML

导入 Markdown 时 SHALL 对正文中的内联 HTML 做规整，避免把编辑器产生的无意义包裹存入数据库；规整 MUST NOT 改动 fenced 代码块与行内代码中的内容。

#### Scenario: 纯样式包裹被还原为文字
- **WHEN** 导入内容含 `<font style="...">文本</font>`
- **THEN** 存入正文的是 `文本`，不保留只有样式的 `font` 包裹

#### Scenario: 代码块不被误伤
- **WHEN** 导入内容在 fenced 代码块里包含 `<class 'langchain...'>`
- **THEN** 该行原样存入，不被当作 HTML 处理

#### Scenario: 其余 Markdown 语法不受影响
- **WHEN** 导入一份不含 HTML 的普通 Markdown
- **THEN** 解析结果与改动前完全一致（frontmatter、标题、标签、正文都不变）

### Requirement: 存量内容可安全清洗

系统 SHALL 提供清理已存文章内联 HTML 的手段，且默认不写回。

#### Scenario: 预览而不写入
- **WHEN** 以 dry-run 运行清洗
- **THEN** 输出每篇受影响文章的标签种类、处数与变更前后差异，数据库保持不变

#### Scenario: 确认后写回
- **WHEN** 以非 dry-run 运行清洗
- **THEN** 只更新确有变化的文章，并报告更新篇数

#### Scenario: 无 HTML 的文章不动
- **WHEN** 文章正文不含内联 HTML
- **THEN** 该文章不被写入（避免无意义地刷新 `updatedAt`）