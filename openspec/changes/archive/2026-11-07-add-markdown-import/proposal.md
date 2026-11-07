# Proposal

## Why

写文章只能从空白 textarea 开始敲。手头已有的 Markdown（Obsidian、Typora、别人给的稿子、以前导出的备份）要落进这个博客，目前只能打开文件、全选、复制、切窗口、粘贴，而且标题、标签、摘要还得再抄一遍。导入是写作页最自然的第一个动作，现在缺这个入口。

## What Changes

- 写文章页（新建与编辑）增加「导入 md」入口，选择 `.md` / `.markdown` / `.txt` 文件后由浏览器本地读取，不经过服务器、不落到 OSS。
- 导入后解析并回填：正文写入编辑区；标题、slug、标签、摘要按「YAML frontmatter 优先，其次文首一级标题」回填。没有 frontmatter 时，文首的 `# 标题` 会成为标题并从正文中移除。
- 编辑器里已有内容时先确认再写入，三种选择：替换 / 追加到末尾 / 取消。选择「追加」时只追加正文，元信息只回填空着的字段，不覆盖已有值。
- 导入是原子的：解析或读取失败时报错并保持编辑器原状，不会出现"正文写进去了、标题还是旧的"这种半成品状态。
- 无破坏性变更：不新增接口、不改数据模型；frontmatter 解析使用浏览器安全的 `front-matter@4`（实施中确定，见 design 的 D2），没有自造 YAML 解析器；不导入时页面行为与现在一致。

## Capabilities

### New Capabilities

- `markdown-import`: 把外部 Markdown 文件导入文章编辑器的能力 —— 文件类型与大小约束、frontmatter 与标题的解析规则、正文与元信息的回填顺序、与已有内容的合并策略，以及失败时的原子性。

### Modified Capabilities

（无。`markdown-render` 管的是渲染管线，与导入无关；`admin-editor` 的视图/全屏契约不受影响，只是工具栏多一个按钮。）

## Impact

- **代码**：新增 `lib/markdown-import.ts`（解析与合并两个纯函数，frontmatter 交给 `front-matter`，自研部分只做字段归一化与 H1 兜底）；`components/admin/PostEditor.tsx` 增加隐藏 file input、合并确认条与回填逻辑；`app/redesign.css` 补确认条样式；`package.json` 增加一条依赖 `front-matter`。
- **不涉及**：`/api/upload`（该接口只收图片且写 OSS，导入不需要）、Prisma schema、认证、ISR、CI/CD。
- **验证口径**：`npx tsc --noEmit` 与 `npm run build` 通过；四类样例文件（frontmatter 全字段 / 只有 H1 / 无标题 / 代码块里出现 `---`）逐一手动导入核对字段；已有内容时三条合并路径各测一次。
- **不在本次范围**：拖拽文件到编辑区、从 URL 拉取 Markdown、导入 Word/HTML/PDF、把导入的原文另存到 OSS、根据 frontmatter 自动发布（发布开关仍是显式动作）。