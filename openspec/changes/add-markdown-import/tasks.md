# Tasks

## 1. 解析器（纯函数）

- [ ] 1.1 新建 `lib/markdown-import.ts`，导出 `ParsedMarkdown` 类型与 `parseMarkdownDocument(raw: string): ParsedMarkdown | null`；实现归一化：去开头 BOM、`\r\n` → `\n`，并让"正文与标题都为空"返回 `null`；验证：`npx tsc --noEmit` 通过，且对 `"\uFEFF# 标题\r\n正文"` 返回 `title: "标题"`、`body: "正文"`。
- [ ] 1.2 实现 frontmatter 识别：仅当第一个非空行为 `---` 时读取，直到同为 `---` 或 `...` 的闭合行；没有闭合行时整篇按无 frontmatter 处理；验证：以 `---\ntitle: 测试\n---\n正文` 输入得到 `title: "测试"`、`body: "正文"`；对只有开头 `---` 没有闭合行的输入，`body` 保留含 `---` 的原文。
- [ ] 1.3 实现扁平键值解析：`title` / `slug` / `excerpt`（别名 `description`、`summary`）/ `tags`（别名 `tag`），值去成对引号；`tags` 支持 `[a, b]`、`a, b`、以及 `- a` 块列表三种写法；未知键忽略；验证：三种 tags 写法都得到 `["a","b"]`，`draft: true` 不出现在返回值中。
- [ ] 1.4 实现标题兜底与正文裁剪：无 frontmatter 标题时，若第一个非空行匹配 `^#\s+(.+)$` 则取为标题并从正文移除（连同其后一个空行）；正文去掉首尾多余空行、保留内部空行与缩进；验证：`"# 甲\n\n第一段\n\n## 小节"` 得到 `title: "甲"` 且 `body` 以 `第一段` 开头、仍含 `## 小节`。
- [ ] 1.5 用临时脚本 `scripts/_import-check.ts` 跑四类样例（frontmatter 全字段 / 仅 H1 / 无标题 / 代码块内出现 `---`）并打印结果，确认字段符合预期后删除该脚本；验证：终端输出与预期一致，`Test-Path scripts\_import-check.ts` 为 False。

## 2. 编辑器接入

- [ ] 2.1 `PostEditor` 增加隐藏 `<input type="file" accept=".md,.markdown,.txt,text/markdown,text/plain">` 与 ref，在 `.editor-toolbar-right`（视图切换与「退出全屏」之间）加「导入 md」按钮；读取前校验扩展名与 `file.size > 1MB`，失败走既有 `setError` 提示；验证：选择 `.pdf` 与 2MB 文本各一次，均提示且正文不变。
- [ ] 2.2 实现"已有内容"判定（`[title, content, excerpt, tags].some(v => v.trim())`）与内联确认条：`role="alertdialog"`，三个按钮「替换」「追加到末尾」「取消」，默认焦点在「取消」，Esc 取消；空编辑器导入时不出现确认条；验证：有内容时导入出现确认条，Esc 后内容与导入前逐字段一致。
- [ ] 2.3 实现 `mergeInto(parsed, strategy)` 纯计算：替换时正文覆盖、标题/slug/摘要/标签"文件提供才覆盖"；追加时只在正文末尾以空行分隔追加、元信息只填空字段；slug 规则为"文件没给时，新建文章用 `slugify(title)`、编辑文章不改"；验证：分别用带 slug 与不带 slug 的样例验证三种路径的字段结果。
- [ ] 2.4 保证原子性与焦点：读取、解析、`mergeInto` 全部在 `setState` 之前完成，失败只走 `setError`；成功后按策略把光标放到正文末尾（追加）或开头（替换）并 `textarea.focus()`；验证：构造一个解析失败的输入（纯空白文件），确认正文、标题与失败前完全一致。
- [ ] 2.5 `app/redesign.css` 增加确认条样式（与工具栏同一节奏，`--rule` 描边、不抢主色），并确认 `published` 勾选在导入前后不变；验证：六套主题下确认条文字与按钮对比度正常（沿用既有 token，无新增硬编码颜色），导入完成后「立即发布」勾选状态不变。

## 3. 集成验证

- [ ] 3.1 端到端手测四条路径并记录：空编辑器直接导入、有内容时替换、有内容时追加、有内容时取消；每条都核对正文、标题、slug、标签、摘要五个字段与预期一致。
- [ ] 3.2 全屏与窄屏回归：全屏写作状态下「导入 md」按钮可见可用，确认条不被裁切；390px 下按钮不重叠、确认条三按钮可点；验证：两种状态各截图一张。
- [ ] 3.3 `npx tsc --noEmit` 与 `npm run build` 通过（build 前先停 dev server，避免 `.next` 争用）；验证：两条命令退出码为 0。

## Workflow follow-up

- 提交并推送，走既有 GitHub Actions 部署；线上用一个真实的旧稿 `.md` 再导入一次确认字段。
- 确认无误后归档本变更（`/openspec-archive-change`）。