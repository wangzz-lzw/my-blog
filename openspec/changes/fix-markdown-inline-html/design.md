# Design

## Context

动机见 `proposal.md`；契约见 `specs/markdown-rendering/spec.md`。这里记录实现依据的现状。

**渲染管线**（`components/Markdown.tsx`，169 行）：

```
remark：gfm（表格/删除线/任务列表）+ breaks（单换行）
rehype：slug → autolink-headings → external-links → highlight → sourceLine
组件映射：pre → CodeBlock（终端风代码卡）；a → 外链标记；img → 站内 /img 收口
```

`rehype-raw` **未安装**，所以 `react-markdown` 走默认行为：原始 HTML 被转义成文本显示。
这正是截图里 `<font style="...">` 原样露出的原因。

**已核实的事实**：

| 项 | 结果 |
|---|---|
| 依赖 | `react-markdown@10`、`remark-gfm`、`remark-breaks`、`rehype-slug/autolink/external-links/highlight`；**无 `rehype-raw`、无 `rehype-sanitize`** |
| `<Markdown>` 使用处 | 仅两处：文章详情页 `app/(site)/posts/[slug]/page.tsx:98`、后台预览 `components/admin/PostEditor.tsx:661` |
| 文章正文谁能写 | 需管理员（`app/api/posts/route.ts` 走 `getAdminSession`） |
| 导入是否处理 HTML | **完全不处理**，`lib/markdown-import.ts` 把 `body` 原样透传 |
| 现存数据 | 2 篇文章，均**不含** `<font>`；有 3 处 `<class '...'>`，全在 Python 代码块内（合法代码，绝不能动） |
| 目录 | `PostOutline` 用 `clone.textContent` 取标题文本，渲染修好后自然干净 |

**那个 `<class '...'>` 是这次最大的陷阱**：它是 Python `print(type(x))` 的输出样例，
形如 HTML 但根本不是 HTML。任何「全局正则去标签」的实现都会把它吃掉，
所以清洗必须识别 fenced code 与行内代码并跳过。

## Goals / Non-Goals

**Goals:**

- 内联 HTML 恢复成它本该有的样子（文字是文字、结构是结构）。
- 不影响代码块、不影响现有 Markdown 语法、不影响外链与图片的既有处理。
- 有个安全的存量清理手段，默认不改数据。

**Non-Goals:**

- 不做完整的 HTML → Markdown 转换器。
- 不放开 `<script>`、`<style>`、事件属性、内联脚本能力——那怕是真的有人在文章里写 demo。
- 不改后台编辑器为富文本。

## Decisions

### D1 引入 `rehype-raw` + `rehype-sanitize`，且两者不可拆

```ts
rehypePlugins={[
  ...现有插件,
  rehypeRaw,                                  // 把 HTML 解析成 hast
  [rehypeSanitize, sanitizeSchema],           // 必须紧跟在 raw 之后
]}
```

- **为什么必须成对**：`rehype-raw` 会把正文里的 HTML 送进 DOM。没有 sanitize 时，
  一个 `<img onerror=...>` 或 `<script>` 就能在读者浏览器里执行。
  「文章只有管理员能写」是降低了概率，不是消除了风险——管理员误粘贴、账号被盗都仍然成立。
  所以这两行是**一个决定**，PR 里不允许只合入 raw。
- **顺序**：`rehypeRaw` 必须在 `rehypeSanitize` 之前。反过来 sanitize 看不到 HTML 节点，等于没过滤。
- **放在哪**：要排在 `rehypeHighlight` **之后**吗？不行——高亮是靠 `class="language-x"`
  在 `pre > code` 上工作的，sanitize 的白名单必须保留这些 class，否则高亮全废。
  因此顺序定为：`...现有 → raw → sanitize`，并**在 schema 里显式放行 `className`**。

### D2 白名单：按「展示」而不是按「HTML 规范」裁剪

`sanitizeSchema` 在 `defaultSchema` 基础上：

| 类别 | 处理 |
|---|---|
| 保留标签 | `p br span div font b i u s strong em sup sub del ins mark small code pre blockquote ul ol li table thead tbody tr th td hr a img h1~h6 figure figcaption` |
| 保留下来的属性 | `className`（**必须**，高亮与组件映射靠它）、`href` `src` `alt` `title` `id` `align` `colspan` `rowspan` `width` `height` `loading` `decoding` |
| 丢弃的属性 | 全部 `on*` 事件、`style`、`srcset`、`formaction`、`target`（由外部链接插件统一给） |
| 丢弃的标签 | `script` `style` `iframe` `object` `embed` `form` `input` `button` `link` `meta` `base` |
| 协议 | `href`/`src` 只允许 `http` `https` `mailto` `/` `#` 相对路径；`javascript:` `data:`（除图片外的危险用法）剔除 |

- **`style` 为什么整类丢弃**：它的表达力太强（`position:fixed`、`background:url()` 都能用），
  而这次要解决的 `<font style="color:...">` 恰恰是「样式包裹但文字有用」——
  丢掉 style、留下文字，正好是想要的结果。保留 `<font>` 标签本身只是为了让
  解析链不报错，视觉上它退化成 `<span>`。
- **`className` 必须放行**：`rehype-highlight` 给 `code` 加 `hljs language-python`，
  `autolink-headings` 给锚点加 `heading-anchor`，组件映射里 `CodeBlock` 靠
  `language-*` 判断语言。拦住 class 会让代码高亮、标题锚点、语言标签一起失效。

### D3 代码块是禁区

清洗与规整都必须**跳过** fenced code block（``` 或 ~~~ 围栏内）与行内代码（反引号内）。

- 现实依据：本文库里就存在 `<class 'langchain_deepseek...'>`，它是 Python 的输出样例，
  出现在代码块里完全正确。任何「全文正则替换标签」的做法都会破坏它。
- 实现方式：导入时的规整按行扫描、维护 fence 状态（与 `lib/rag/chunk.ts` 里
  切块时的 fence 处理同一思路，可复用同一种状态机写法）。
- 存量清洗脚本同理，逐行处理并跟踪 fence 状态。

### D4 导入时规整：只做「明显无意义」的那部分

`lib/markdown-import.ts` 增加 `normalizeInlineHtml(body: string): string`：

1. 跳过代码（按 D3）；
2. 把**只有样式、无结构意义**的包裹标签就地剥掉，保留内部文本：
   `<font ...>x</font>`、`<span style="...">x</span>`（无其他属性时）→ `x`；
3. `<br>`、`<br/>` → 换行（Markdown 里两个空格 + 换行，或直接空行）；
4. 其余 HTML 原样保留（交由渲染层的 raw + sanitize 处理）。

- **为什么不全剥**：复制来的表格、上下标是有信息量的结构，
  在渲染层已经能安全显示，导入时抹平反而是信息丢失。
- **为什么还要剥一部分**：`<font style=...>` 这类是编辑器残留，
  存进数据库后既占体积又让 diff 难看，且去掉后视觉无损失。

### D5 目录不需要改

`PostOutline.headingText()` 取的是 `clone.textContent`。渲染层修好后，
`<font>` 会被解析成元素，`textContent` 自然只拿到内部的 `actions.js`。
所以这一步**没有代码改动**，只在任务里安排一条验证。

### D6 存量清洗：默认 dry-run

`scripts/clean-post-html.ts`：

```
npx tsx --env-file=.env scripts/clean-post-html.ts            # 只报告，不写
npx tsx --env-file=.env scripts/clean-post-html.ts --write    # 确认后写回
```

- 逐篇输出：命中的标签种类与处数、变更前后的字符数、前若干处上下文。
- 只有内容真的变了才 `update`（避免无意义刷新 `updatedAt`）。
- **为什么默认不写**：清洗改的是用户的内容资产，不可逆；先看差异再决定是唯一稳妥的顺序。

## Risks / Trade-offs

- **[XSS：开了 raw 忘了 sanitize]** → D1 把两者写成一个决定；任务里安排一条注入样本的断言（`<script>`、`onerror`、`javascript:`）。
- **[sanitize 误伤高亮]** → D2 显式放行 `className`；任务里验证代码块仍有 `hljs` 类与语言标签。
- **[把 Python 的 `<class '...'>` 当 HTML 吃掉]** → D3 的 fence 状态机；任务里用库里真实样本做回归。
- **[`<font>` 保留但丢 style 后视觉变化]** → 这正是期望结果：文字回到正文字体，不再糊一层灰底。
- **[raw 引入 parse5 等依赖，镜像变大]** → 可接受：两个纯 JS 包，体积远小于任何编辑器。
- **[后台预览与前台渲染不一致]** → 两者共用 `<Markdown>`，天然一致；任务里各验证一次。

## Migration Plan

1. 装依赖 `rehype-raw`、`rehype-sanitize`。
2. 改 `components/Markdown.tsx`：加两个插件 + 自定义 schema。
3. 改 `lib/markdown-import.ts`：加 `normalizeInlineHtml` 并在 `parseMarkdownDocument` 末尾调用。
4. 新增 `scripts/clean-post-html.ts`；先 dry-run 看全库差异。
5. 确认无风险后 `--write` 清洗存量。
6. **回滚**：去掉两个 rehype 插件即回到旧行为；清洗脚本的写回可从 Git 或备份恢复，
   但**清洗前应先导出受影响文章的正文**（脚本在 dry-run 时打印足够上下文用于人工判断）。

## Open Questions

- 白名单里是否保留 `<style>` 标签内联块。当前决定**不保留**——它表达力过强且会污染整页样式；
  若后续确有需求（文章内嵌图表样式），单独开变更评估。
