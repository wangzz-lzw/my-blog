# Tasks

## 1. 依赖与环境（本地终端）

- [x] 1.1 本地执行 `npm i rehype-highlight rehype-slug rehype-autolink-headings rehype-external-links remark-breaks`，验证 `package.json` 依赖就位且 `npx tsc --noEmit` 不报缺模块
- [x] 1.2 重启 dev server（`npm run dev`），验证首页与文章页 curl 均 200

## 2. 渲染管线

- [x] 2.1 新建 `components/Markdown.tsx`（服务端组件）：`remarkPlugins=[gfm, breaks]`、`rehypePlugins=[slug, autolinkHeadings, externalLinks, highlight(ignoreMissing)]`；验证文章页标题元素带稳定 id、正文单换行渲染为 `<br>`
- [x] 2.2 新建客户端组件 `components/CodeBlock.tsx`：终端风代码卡（顶栏 `~/<lang>` + 复制按钮；`navigator.clipboard` + `execCommand` 降级；1.5s「已复制 ✓」态）；验证点击复制后剪贴板含源码、非安全上下文不报错
- [x] 2.3 在 `Markdown.tsx` 映射 `pre→CodeBlock`、`a→外链包装`（`target=_blank` + `rel=noopener noreferrer` + 外链类）；验证站外链接带属性与新标签页，站内 `/posts/…` 链接无外链样式

## 3. 主题与接线

- [x] 3.1 `app/globals.css` 增加 `.hljs-*` token 覆盖（关键字青 / 字符串品红 / 注释灰蓝 / 函数亮白）与 `.code-card`/`.code-header`/`.copy-btn` 样式（切角 + 品红左边线）；验证含代码块的文章页高亮可读、与暗底无对比问题
- [x] 3.2 `app/posts/[slug]/page.tsx` 由裸 `ReactMarkdown` 换为 `<Markdown>`，highlight 仅注册常用语言（js/ts/tsx/py/bash/json/css/html/xml/yaml/sql/dockerfile）；验证 js/py/bash/json 块高亮、无语言块原样渲染不报错
- [x] 3.3 验证 `npx tsc --noEmit` 通过且 `npm run build` 无新错误

## 4. 验收（对照 spec 场景）

- [x] 4.1 逐条核对 spec 场景：高亮（SSR 无闪烁）/ 复制 + 降级 / 标题片段直达 + 重名加后缀 / 外链新标签 + 视觉标记 / 单换行 / GFM 表格 / 渲染一致性（后台若无预览则记录「以文章页为唯一入口验收」）；全部通过或留痕

## Workflow follow-up

- 安装依赖（1.1）必须由本地终端执行；沙箱无法代跑
- 归档前确认 `npm run build` 通过
