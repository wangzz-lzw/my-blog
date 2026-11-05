# Proposal

## Why

标签现在只能「顺带」产生：在文章编辑器的标签输入框里打一串逗号分隔的名字，`POST /api/posts` 用 `connectOrCreate` 现建现用。也就是说，标签这个实体没有任何管理入口——建出来之后：

- **打错字就永久留在站上**：`webpak`、`JavaScirpt` 这类拼写错误的标签会和正常标签一起出现在 `/tags` 索引页和 `/blog` 侧栏里，URL `/tags/webpak` 也跟着永久存在；
- **想删只能进数据库**：一篇文章写错标签，只能手改文章或直接连库操作；
- **想改名只能先删再建**：而「先删」这件事本身没有入口。

个人博客体量小，但正是这种"偶尔才管一次"的操作，才最需要页面——记不住 SQL，也记不住该改哪篇文章。

## What Changes

- **后台新增 `/admin/tags` 标签页**（仅管理员）：每个标签一行，显示名称、slug、**被多少篇文章用着**（含草稿）、新建时间；表格下方是新建表单。
- **新建**：名称 + 可选自定义 slug（留空则按名称生成）。与已有标签同名或同 slug 时返回 409，并在提示里点名冲突的那个标签。
- **重命名**：名称和 slug 一起改（slug 默认按新名称重新生成，可手改）。**旧 slug 进 `Tag.aliases`，`/tags/<旧 slug>` 301 跳到新地址**，分享出去的链接不失效；连续改名时旧别名一并带过去，不会丢。
- **删除**：删的是"标签"本身，**只解除它与文章的关联，文章不删、不改状态**。删除前用站点统一的 `confirm()` 弹窗写明"这 N 篇文章会失去这个标签，文章本身不受影响"。
- **公共页面立刻反映**：`/tags` 索引与 `/blog` 侧栏标签云本来就是动态渲染，改完即变；`/tags/[slug]` 带 60 秒 ISR 缓存，改名/删除后服务端显式 `revalidatePath` 清掉，不会出现"已经删了还能打开 60 秒"。
- **标签锁死成受控词表**：文章编辑器不再现场造标签——标签区域只提供已有标签的多选（已选显示为可移除的胶囊），AI 生成标签也只从白名单里挑、返回值再按白名单过滤一次，`/api/posts` 与更新接口同样拒绝未知标签名。新建标签的唯一入口是后台「标签」页。

## Capabilities

### New Capabilities

- `tag-management`: 标签作为一等实体的完整契约 —— 谁能管、列表呈现什么、新建/改名/删除各自的语义与失败反馈、改名后旧地址如何被重定向、删除与文章的关系，以及这些操作对前台标签页的可见时限。

### Modified Capabilities

（无。`feedback-dialogs`、`auth-affordance` 的既有要求不变；本变更只是**使用** `confirm()`，不修改它的契约。）

## Impact

- **代码**：新增 `app/(site)/admin/tags/page.tsx`（服务端取数）、`components/admin/TagManager.tsx`（客户端表格 + 新建/改名表单 + 删除）、`app/api/tags/route.ts`（POST 新建）、`app/api/tags/[id]/route.ts`（PATCH 改名 / DELETE 删除）；改 `prisma/schema.prisma`（`Tag.aliases String[]`、`Tag.createdAt`）、`app/(site)/tags/[slug]/page.tsx`（别名永久跳转 + 删除后 404）、`app/(site)/admin/layout.tsx`（导航加「标签」）、`components/admin/PostEditor.tsx` 与它的两个宿主页面（标签字段改成只选不建）、`lib/ai.ts` 与 `app/api/ai/summarize/route.ts`（标签白名单）、`app/api/posts/route.ts` 与 `app/api/posts/[id]/route.ts`（拒绝未知标签）。
- **依赖**：无新增（复用 `lib/authz.ts`、`lib/slug.ts`、`useFeedback`）。
- **数据**：`Tag` 加两列（`aliases String[] @default([])`、`createdAt DateTime @default(now())`），一条迁移；不建新表、不动 `Post`。
- **风险**：slug 与别名共用命名空间，改 slug 时要同时查"现有 slug"和"别人的别名"，否则会撞车；`/tags/[slug]` 的 ISR 缓存必须在写操作后显式失效；删除是不可撤销操作，确认文案必须说清"不删文章"。
- **验证口径**：`tsc` 与 `build` 通过；新建/改名/删除三条链路用真实 HTTP 请求打通（201 / 200 / 409 / 301 / 404）；改名后旧地址 301 到新地址、新地址 200；删除后文章总数与内容不变、标签从三处页面消失；普通用户访问 `/admin/tags` 被重定向。
- **不在本次范围**：合并两个标签、批量清理 0 篇文章的孤儿标签、标签描述/颜色/封面、给标签做 SEO 元数据、在标签管理里批量调文章归属。