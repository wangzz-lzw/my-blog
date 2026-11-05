# Design

## Context

核对过现状（见 proposal.md - Why，这里只记影响实现的事实）：

- `prisma/schema.prisma`：`Tag { id, name @unique, slug @unique, posts Post[] }`，与 `Post` 是**隐式多对多**（Prisma 自动维护 `_PostToTag` 连接表，两侧外键都是 `ON DELETE CASCADE`）。`Tag` 没有 `createdAt`。
- 标签唯一的产生路径是 `POST /api/posts` 里的 `connectOrCreate: { where: { slug: slugify(name) }, create: { name, slug } }`。注意 `where` 用的是 **slug**，所以「名字不同但 slugify 后相同」的输入会**复用**已有标签、并把名字悄悄换成先来的那个。
- 没有 `/api/tags`，没有后台标签页，`app/(site)/admin/layout.tsx` 的导航只有 概览/文章/写文章/评论/个人资料。
- `app/(site)/tags/[slug]/page.tsx`：`revalidate = 60`、`dynamicParams = true`，用 `prisma.tag.findUnique({ where: { slug } })` 查，查不到 `notFound()`；入参先用 `decodeSlugParam()` 解码（中文 slug）。
- `app/(site)/blog/page.tsx`、`app/(site)/tags/page.tsx`：`dynamic = "force-dynamic"`，标签云/索引每次请求现算，改完即变。
- 确认类交互有统一约束：`feedback-dialogs` 规定必须用 `useFeedback().confirm()`，禁止 `window.confirm`。
- `lib/authz.ts` 的 `getAdminSession()` 是现成的管理员判定；`lib/slug.ts` 的 `slugify()` 保留 `\p{L}\p{N}`，中文会生成中文 slug。

## Goals / Non-Goals

**Goals**

- 让标签有"身份"：slug 可以被更正，而更正不会让任何已发出的链接失效。
- 让删除是安全的：删标签与删文章彻底解耦。
- 让所有标签页面（云、索引、详情）共享同一个事实来源，不出现"某处还显示旧名字"。

**Non-Goals**

- 不做合并/批量清理/标签元数据（proposal 已列为不在范围）。
- 不重写 `POST /api/posts` 的 `connectOrCreate` 语义（编辑器仍然能即输即建标签）。
- 不改 `feedback-dialogs` 契约，只是调用它。

## Decisions

### D1. 别名用 `Tag.aliases String[]`，不建别名表

```prisma
model Tag {
  id        String   @id @default(cuid())
  name      String   @unique
  slug      String   @unique
  aliases   String[] @default([])   // 被替换掉的旧 slug，用于 301
  createdAt DateTime @default(now())
  posts     Post[]
}
```

- 别名的唯一用途是"命中即跳转"，一个标签改名历史上限也就是个位数，独立表只会多一次 join 和一套 CRUD。
- 反范式在这里是安全的：删除标签时别名随行一起消失（这正是期望——删掉的标签连旧地址一起 404）。
- `createdAt` 顺手加上，后台列表要按"新近建的"看出问题标签；历史行由迁移的默认值回填，不需要数据脚本。

### D2. slug 的命名空间：现有 slug ∪ 所有别名

真正的冲突面不是"slug 唯一索引"，而是"这个地址会被谁解释"：

1. 现有标签的 `slug`
2. 任何标签的 `aliases` 成员
3. 自己的 `aliases`（否则会把一个历史地址改写成一个新的、指向自己的环）

写入前用一个查询做完：`prisma.tag.findMany({ where: { OR: [{ slug: next }, { aliases: { has: next } }] }, select: { id, name, slug } })`，排除 `selfId` 后非空 → 409，并把撞上的标签名回给前端。数据库的 `slug @unique` 只是最后一道兜底（并发下 `P2002` 也映射成同一个 409 文案）。

### D3. slug 生成规则

- 名称归一：`trim()`，长度 1–32，拒绝纯空白。
- slug 缺省 = `slugify(name)`；用户可手填，但同样过一遍 `slugify()`（防止空格、斜杠、`#` 这类字符进 URL）。
- `slugify()` 对纯符号名称会返回 `post-<时间戳>` 这种兜底值——**在标签这里不合适**，所以额外判定：slug 为空或只剩兜底前缀时返回 400「请填写地址段」，而不是悄悄生成一个丑地址。
- 中文名 → 中文 slug（如 `/tags/微前端`），URL 会百分号编码，读取端已有 `decodeSlugParam()` 兜住。

### D4. 改名的原子语义

一次 `update` 同时写 `name`、`slug`、`aliases`：

```
aliases = unique([...old.aliases, old.slug])  // 去掉新 slug 自己，避免自我别名
```

- 连续改名自然累积：`webpak → webpack → webpack5` 之后 `/tags/webpak`、`/tags/webpack` 都还在用。
- 只改大小写/只改空格也算改名，但归一化后 slug 可能不变 → 此时 `aliases` 不变（不把当前 slug 塞进别名）。
- 别名会被限制在 20 条以内（超出丢最旧的），防止某个标签被反复改名把行撑大——个人博客基本碰不到，只是兜底。

### D5. 旧地址怎么跳：`/tags/[slug]` 三态

```
按 slug 查 → 命中：正常渲染（200）
           → 未命中：按 aliases has 查 → 命中：permanentRedirect(`/tags/${tag.slug}`)
                                     → 未命中：notFound()（404）
```

用 Next.js 的 `permanentRedirect()`，它发出的是 **308**（与 301 同语义、保留方法），对搜索引擎等价。spec 里写的是"永久重定向（301/308）"就是为了不把框架细节钉死。

### D6. 缓存：保留 ISR，写后显式失效

标签详情页继续 `revalidate = 60`（个人博客不需要每次打库），但**重命名/删除必须主动清**，否则旧地址会以 404 或旧名字的形式被缓存最多 60 秒：

- 改名：`revalidatePath('/tags/' + oldSlug)`、`revalidatePath('/tags/' + newSlug)`
- 删除：`revalidatePath('/tags/' + slug)`
- 别名命中路径不需要单独清：它本身是"按 slug 未命中 → 查别名"，只要旧 slug 那条缓存被清了，下次请求就会走到别名分支。

`/blog` 与 `/tags` 是 `force-dynamic`，无需清理。

### D7. 接口：只做写，不做读

沿用仓库现有的扁平风格（`/api/posts`、`/api/comments/[id]`），不加 `/api/admin` 前缀：

| 方法 | 路径 | 入参 | 成功 | 失败 |
| --- | --- | --- | --- | --- |
| POST | `/api/tags` | `{ name, slug? }` | 201 `{ id, name, slug }` | 400 校验 / 403 非管理员 / 409 冲突 |
| PATCH | `/api/tags/[id]` | `{ name, slug? }` | 200 `{ id, name, slug, aliases }` | 同上 + 404 |
| DELETE | `/api/tags/[id]` | — | 200 `{ ok, detached }` | 403 / 404 |

- **不做 GET 列表接口**：后台页是服务端组件直读 Prisma，写成功后 `router.refresh()` 重新取数；少一个接口就少一处鉴权面、少一套错误处理。
- 三个 handler 开头都是 `getAdminSession()` → 403，和 `POST /api/posts` 一致。
- `DELETE` 返回 `detached`（删除前 `_count.posts`），前端用它做"已从 N 篇文章上摘掉"的反馈。

### D8. 删除：只删连接表，不碰文章

`prisma.tag.delete({ where: { id } })` 依赖隐式多对多连接表的 `ON DELETE CASCADE`——连接行跟着没，`Post` 行一根汗毛都不动。显式在代码里**不做**任何"先清空文章标签"的预处理，因为 Prisma 已经保证；做反而是两次写、两个失败点。

`P2025`（记录不存在）映射成 404，避免并发下点了两遍删除报 500。

### D9. 后台 UI：一张表 + 行内编辑，不引组件库

`app/(site)/admin/tags/page.tsx`（服务端，`force-dynamic`）取 `findMany({ include: { _count: { select: { posts: true } } } })`，排序 `[{ posts: { _count: 'desc' } }, { name: 'asc' }]`；把结果交给 `components/admin/TagManager.tsx`（客户端）。

- **列表**：名称 / 地址段（`/tags/xxx`）/ 关联文章数（列头写「文章（含草稿）」，避免站长以为前台能看到草稿）/ 创建日期 / 操作。0 篇的标签照常列出，并在数字上用弱色提示"未被使用"。
- **新建**：表格上方一行内联表单（名称 + 可选地址段 + 创建）。
- **改名**：点行内「改名」把那一行的名称与地址段变成输入框（预填当前值 + 「保存 / 取消」），不做弹窗——弹窗套表单与 `feedback-dialogs` 的 queue 语义纠缠，得不偿失。
- **删除**：`const ok = await confirm({ title, description, confirmText, cancelText })`，描述里写明「这 N 篇文章会失去这个标签，文章本身不受影响」，取消则**不发请求**。
- **反馈**：行内错误文本（409 时原样显示服务端中文），成功后 `router.refresh()`；不做全局 toast（仓库没有这套设施，也别为一次操作引一个）。
- 复用既有后台样式（`.admin-page`、`.admin-page-head`、`.data-table`、`.pill`、`.btn`），只补标签页自己的少量样式。

### D10. 编辑器：标签是受控词表，只选不建

第一版用 `<input list>` + `<datalist>` 做"输入联想"，等于**仍然允许现场造标签**——typo 就是这样永久落到站上的。改成受控词表，三处一起守：

**① 编辑器（`PostEditor`）**：标签区域没有自由文本输入，只有

- 已选胶囊（`tag-chip`，右侧 `×` 移除）；
- 「已有标签 ▾」── Radix `DropdownMenu` + `DropdownMenuCheckboxItem`，勾选即写入、`onSelect` 里 `preventDefault()` 让菜单不关，可以连着勾；
- 顶部一行 `标签 …… 管理标签 →`，把"新建"这件事显式指向后台标签页。

`tags` 状态仍是逗号串（提交格式不变），由 `splitTagInput` / `toggleTagIn` 两个纯函数在串与数组之间转。样式不复用原生控件：菜单用账号菜单那套 `.user-menu` 词汇，胶囊是新加的 `.tag-chip`。

**② AI（`lib/ai.ts` + `/api/ai/summarize`）**：路由从库里取全部标签名作为白名单传给 `summarizePost`；prompt 里列出白名单并要求"只能原样挑选、不许发明"，模型不听话时**代码再按白名单过滤一次**，并把大小写不同的写法归一到库里的那个（`llm` → `LLM`）。白名单为空时提示"tags 必须返回空数组"。

**③ 接口（`/api/posts`、`/api/posts/[id]`）**：`resolveTagRefs()` 把名字解析成 id，碰到未知名字整体拒绝（400，点名是哪个），改成 `connect` / `set` 而不再 `connectOrCreate` / `upsert`。这样即使绕过界面直接调接口，也造不出新标签。

代价：想要一个站上还没有的标签，必须先到后台「标签」页建。这是刻意的——一个标签一旦存在就会永久占着地址和标签云，先建再挂比事后收拾便宜。

需要改两个页面：`admin/posts/new/page.tsx`（现在是纯静态组件，要改成 `force-dynamic` 并取一次标签名）与 `admin/posts/[id]/page.tsx`（已有 `prisma` 调用，加一个 `findMany({ select: { name: true } })`）。

## Risks / Trade-offs

- [别名与 slug 撞车，导致两个标签抢同一个地址] → D2 的"命名空间查询"覆盖三种来源，写前一次性判定；`slug @unique` 兜住并发。
- [改名后旧地址仍命中 60 秒缓存] → D6 显式 `revalidatePath`；e2e 验证要包含"改名后立刻访问旧地址"。
- [中文 slug 的百分号编码导致别名比较失败] → 比较前统一 `decodeSlugParam()`；写入时只存 `slugify()` 过的形式。
- [误删标签且无法撤销] → 删除前 `confirm()` 明确写出篇数与"文章不受影响"；个人博客不做软删除，代价是确认文案必须够清楚。
- [`connectOrCreate` 会悄悄复用同 slug 的旧标签] → 本变更不修它（属于既有语义），但 D10 的候选能让用户优先选到正确标签，间接减少这类错配；如日后要修，单独开变更。
- [一行别名数组无限增长] → 上限 20 条，超出丢最旧。
- [后台列表 `_count.posts` 含草稿] → 列头显式标注，避免误读。

## Migration Plan

1. 迁移 `add_tag_slug_aliases`：给 `"Tag"` 加 `aliases TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[]` 与 `"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`。有默认值，历史行无需回填。
2. 部署顺序无所谓：新列不影响旧代码（旧代码 `select` 全字段但只读已知字段）。
3. 上线后手动走一遍：新建 → 改名（验证旧地址 308）→ 删除（验证文章还在）。
4. 回滚：删这两列 + 回退代码；标签与文章关联不受影响（删除动作本身不可逆，但它是产品行为，不是 schema 变更）。

## Open Questions

（无。管理范围、改名与链接的关系、删除语义三项已在对话中确认：列表 + 新建 + 重命名 + 删除；slug 跟着改且旧链接永久跳转；删除只解除关联。）