# Tasks

## 1. 数据模型与迁移

- [x] 1.1 `prisma/schema.prisma` 的 `Tag` 增加 `aliases String[] @default([])` 与 `createdAt DateTime @default(now())`，跑 `prisma migrate dev --name add_tag_slug_aliases` 并 `prisma generate`；验证：迁移 `20261105145041_add_tag_slug_aliases` 已应用（`ALTER TABLE "Tag" ADD COLUMN aliases TEXT[] …, createdAt TIMESTAMP(3) …`），历史行两列都有值，`npx tsc --noEmit` 通过。
- [x] 1.2 确认删除标签对隐式连接表是级联的；验证：给标签挂 1 篇草稿后 `DELETE /api/tags/<id>` 返回 `{ok:true, detached:1}`，文章总数 3 → 3、文章仍可访问、其 `tags` 变为 0 —— 连接行被级联删除，`Post` 一行没动。

## 2. slug 与别名的核心规则（`lib/tags.ts`）

- [x] 2.1 `normalizeTagInput({ name, slug })`：名称 trim、长度 1–32；slug 缺省用 `slugify(name)`，手填同样过 `slugify()`；slug 归一后为空时返回 400「地址段不能为空，请手动填写」。实测：空名称 → 400「请填写标签名」；`★★★` → 400「地址段不能为空，请手动填写」。
- [x] 2.2 `assertSlugAvailable(nextSlug, selfId?)`：一次查询覆盖「现有 slug」与「所有 aliases」，排除自身；命中时返回冲突标签供 409 文案使用。实测三种冲突：新建撞名称 → 「标签「…」已经存在」；新建撞地址段 → 「地址段「…」已被标签「…」占用」；用别人的旧地址当新地址 → 409（别名也算占用）。
- [x] 2.3 `nextAliases(oldAliases, oldSlug, nextSlug)`：并入旧 slug、去重、剔除等于新 slug 的项、上限 20 条（超出丢最旧）。实测连续改名两次后 `aliases = ["tagtest-甲","tagtest-v2"]`。

## 3. 写接口

- [x] 3.1 `POST /api/tags`：无会话 403、读用户 403、空名称 400、重名 409、正常 201（返回 `{id,name,slug,aliases}`）——四种结果全部用真实 HTTP 请求实测。
- [x] 3.2 `PATCH /api/tags/[id]`：改名同时写 `name/slug/aliases`；连续改名两次别名累积；改名撞已有名字 → 409 且两个标签都不变；`P2025` → 404「标签不存在或已被删除」。
- [x] 3.3 `DELETE /api/tags/[id]`：返回 `{ok:true, detached:N}`；删除后文章总数不变；`P2025` → 404。
- [x] 3.4 三个写 handler 在成功后 `revalidatePath`：PATCH 清新旧两条地址 + `/tags` + `/blog`；DELETE 清当前地址 + `/tags` + `/blog`；POST 清 `/tags` + 新地址。实测改名后旧地址立即变 308、新地址立即 200。

## 4. 旧地址永久跳转

- [x] 4.1 `app/(site)/tags/[slug]/page.tsx` 三态：slug 命中 → 200；未命中但命中某个标签的 `aliases` → `permanentRedirect`（308）；都没有 → 404。实测：v1 → 308 `/tags/tagtest-v3`；v2 → 308 同一目标；当前地址 200；未知地址 404；删除后 404。
- [x] 4.2 中文 slug 与编码路径：`/tags/验收用中文标签`（百分号编码）200；中文旧名改名后 `/tags/tagtest-中文旧名` → 308，`Location` 指向编码后的 `/tags/tagtest-%E4%B8%AD%E6%96%87%E6%96%B0%E5%90%8D`，跟随该地址 200。

## 5. 后台标签页

- [x] 5.1 `app/(site)/admin/tags/page.tsx`（`force-dynamic`）按 `posts._count desc, name asc` 取数并传给 `TagManager`；表格列：名称 / 地址段 / 文章（含草稿）/ 创建时间 / 操作，0 篇的标签照常列出并显示「未被使用」。实测 11 行，6 个在用 + 5 个未使用。
- [x] 5.2 `TagManager`：顶部新建表单（名称 + 可选地址段）、行内「改名」（保存/取消）、「删除」走 `useFeedback().confirm()`，描述写明「这 N 篇文章会失去这个标签，文章本身不受影响」。实测弹窗标题 `删除标签「UI 验收标签-改」？`、按钮 `保留 / 删除`；点「保留」后行仍在且弹窗关闭（未发请求），再删确认后行消失。
- [x] 5.3 409/400 文案内联显示（`.tag-error`，`role="alert"`）；成功后 `router.refresh()`，表格与计数随之更新。实测新建后无需刷新页面即出现在表格里。
- [x] 5.4 `app/(site)/admin/layout.tsx` 导航加了「标签」；普通用户（READER）访问 `/admin/tags` → 307 重定向到 `/`，未登录 → 307 到 `/login?returnTo=%2Fadmin%2Ftags`。
- [x] 5.5 复用后台既有样式（`.admin-page`、`.data-table`、`.pill`、`.btn`），只补 `.tag-form` / `.tag-inline` / `.tag-alias` / `.tag-unused` / `.tag-error` 这五个类；1280px 下表单不溢出、按钮与输入框同高。

## 6. 标签受控（编辑器 / AI / 接口）

- [x] 6.1 编辑器标签字段改成"只选不建"：已选显示为可移除胶囊（`tag-chip` + `×`），旁边是 Radix `DropdownMenu` 多选的「已有标签 ▾」，顶部一行 `标签 …… 管理标签 →`；标签区内**没有自由文本输入**。`admin/posts/new/page.tsx` 改为 `force-dynamic` 并取标签名，`admin/posts/[id]/page.tsx` 一并传入。实测：标签字段内 `input` 数量为 0、空态提示「还没选，从右边挑」、勾选两个后出现两个胶囊、点胶囊上的 `×` 只剩一个、Esc 可关菜单。
- [x] 6.2 `/api/posts` 与 `/api/posts/[id]` 改用 `resolveTagRefs()`：名字解析成 id，未知名字整单 400 并点名。实测：`tags: "LangChain, 凭空捏造的标签"` → 400「标签「凭空捏造的标签」不存在，请先在后台「标签」里新建」；`tags: "LangChain, LLM , LLM"` → 201 且只关联 2 个标签；PUT 未知标签 → 400、PUT 已知 → 200 且关联被整体替换；全程标签总数保持 11，没有新标签产生。
- [x] 6.3 AI 标签白名单：`/api/ai/summarize` 取库内标签名传给 `summarizePost`，prompt 列出白名单并要求"只能原样挑选"，返回值再按白名单过滤并归一大小写。用桩掉 `fetch` 的脚本验证：模型返回 `["LangChain","凭空发明的标签","llm","LLM"]` → 实际只剩 `["LangChain","LLM"]`；白名单为空 → `[]`；prompt 里确实带了白名单与"只能从可用标签里原样挑选"。

## 7. 前台各处的一致性

- [x] 7.1 改名后刷新 `/blog`：侧栏标签云是新名字、链接指向新地址、旧名字不再出现；`/tags` 索引同步（新名字出现、旧名字消失）。
- [x] 7.2 删除后：`/blog` 侧栏、`/tags` 索引、标签详情三处都不再出现；原先关联的文章仍 200 且不再带这个标签。

## 8. 质量门与收尾

- [x] 8.1 `npx tsc --noEmit` 通过；`next build` 通过（Next.js 16.4.2，全部路由生成成功）。
- [x] 8.2 清理验证过程中造的标签、文章与临时普通用户：库回到 11 个标签 / 2 篇文章（脚本每次开头与结尾各清一次，实测 `{"tags":11,"posts":2}`）。

## 实施备注

### 两个在实测里才暴露的问题

1. **中文 slug 的永久跳转会 500**。最初写的是 `permanentRedirect(\`/tags/${renamed.slug}\`)`，ASCII 地址一切正常，但目标是中文 slug 时 dev 日志报 `TypeError: Invalid character in header content ["location"]`——HTTP 头里不能出现非 ASCII 字符。改成 `encodeURIComponent(renamed.slug)` 后 308 正常、`Location` 指向编码地址、跟随 200。这个 bug 只有"旧地址 → 新地址都含中文"才会触发，所以验收里专门留了一条中文改名用例。
2. **重名时提示语串位**。原本 `assertTagAvailable` 用 `Promise.all` 同时查名称与地址段，重名时两个检查都会失败，谁先 reject 谁当文案——实测有时提示"地址段被占用"。改成先查名称再查地址段，「标签「X」已经存在」就稳定了。

### 地址段默认跟着名称走

spec 要求"地址段默认按新名称重新生成且允许手改"。`TagManager` 用 `slugTouched` 标记实现：进入改名时预填当前 slug；只要没手动改过地址段，改名称会实时把地址段重新生成；一旦手动改过地址段，就不再跟着名称动。旧地址自然进 `aliases`，表格里显示「另有 N 个旧地址」（悬停可看具体地址）。

### 方向反转：标签从"自由输入"改成"受控词表"

中途改过一次需求方向，值得记下来，因为它决定了三处实现：

- 最初按"编辑器里顺手带出有标签"的思路做的是**输入联想**（原生 `datalist` → 因为样式不可控换成 Radix 下拉），但输入框仍在，**依然可以现场造标签**；
- 确认要的是**受控词表**后，改成：编辑器只选不建（胶囊 + 多选下拉）、AI 只从白名单挑、`/api/posts` 与更新接口拒绝未知标签名。三处缺一处，这条规则就等于没有。

随之而来的两个影响：新建标签必须先到后台「标签」页；Markdown 导入如果 frontmatter 里带了站上不存在的标签，会被 400 拦下并点名是哪个（以前是静默自动创建）。

### 验证方式与边界

- 接口层用真实 HTTP（自建 cookie jar 走 NextAuth credentials 登录，注意字段名是 `identifier` 不是 `username`），后台页面用真实浏览器逐项点击（新建 → 行内改名 → 取消删除 → 确认删除）。
- AI 白名单用**桩掉 `fetch`** 的脚本验证（不花额度、结果确定）：断言"发明出来的标签被丢弃、大小写归一、白名单为空则返回空数组"。
- 临时脚本 `scripts/_tag-api-test.mjs`、`_post-tags-test.mjs`、`_ai-filter-test.ts`、`_login-probe.mjs` 已删除。
- **未覆盖**：标签别名超过 20 条的截断、`P2002` 并发兜底（需要两个并发请求同时过检查，没有构造）、移动端窄屏下的后台表格（后台本身不在窄屏优化范围内）。

## Workflow follow-up

- 上线后在真实环境中走一遍：新建 → 改名（确认旧地址 308）→ 删除（确认文章还在）。
- 确认无误后归档（`/openspec-archive-change`）。