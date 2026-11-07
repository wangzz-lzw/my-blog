# Tasks

## 1. 数据模型与查询层

- [x] 1.1 在 `prisma/schema.prisma` 新增 `Image` 模型（key 唯一、hash、ext、contentType、bytes、width/height 可空、usage、uploaderId 可空、createdAt、lastUsedAt，三个索引），并生成迁移 `add_image_library`。验证：`npx prisma migrate dev --name add_image_library` 成功，`npx prisma generate` 后 `Image` 类型可用，既有 `Post`/`User`/`Tag`/`Comment` 表结构与行数不变。
- [x] 1.2 新建 `lib/images.ts`：`probeImageSize(buf)` 纯函数，只解析头部（PNG/GIF/JPEG/WebP），**每个 read 前都做边界检查**，不认的格式返回 `null`。验证：写 `scripts/image-size-test.ts`，覆盖 4 种格式正常用例 + 1x1 极值 + 空 buffer + 随机字节 + 截断数据，全部不抛错且结果正确。
- [x] 1.3 在 `lib/images.ts` 增加 `recordImage()`（按 key upsert：首次 create，重复时只更新 `lastUsedAt` 与 `usage`，不动 `createdAt`/`uploaderId`）与 `listImages({ page, usage, q })`（返回 `{ rows, total, page, pageSize, pageCount }`，`q` 匹配 key 或 hash 片段，`usage` 精确匹配）。验证：单元脚本断言「同 key 写两次只有一行、createdAt 与 uploaderId 不变、usage 更新为最新」，以及 `q`/`usage`/分页组合的返回数量正确。

## 2. 上传路径接入

- [x] 2.1 改 `app/api/upload/route.ts`：在 OSS put/跳过之后调用 `recordImage()`，用 try/catch 包住，**写库失败只 console.error 不影响响应**；传入 `uploaderId = session.user.id`、`usage = kind`、`bytes`、`contentType`、解析出的宽高。验证：真实 HTTP 上传一张新 PNG，接口仍返回 `{ok,url,key,kind,deduped:false}`，且 `Image` 表新增一行、字段与文件一致。
- [x] 2.2 验证去重合并不留重复行。验证：同一张图连续上传两次，第二次 `deduped:true`、`Image` 表仍只有一行、`lastUsedAt` 变新、`createdAt` 与首次 `uploaderId` 不变。
- [x] 2.3 验证记录失败不影响上传。验证：临时把 `Image` 表改名或注入一个必然失败的写入（或用测试脚本直接调 `recordImage` 抛错），确认接口仍返回 200 与可用地址，且日志里有错误记录。

## 3. 回填脚本

- [x] 3.1 新建 `scripts/backfill-images.ts`：先用 `isOssConfigured()` 校验（不通过则报错退出、不写任何记录）；用 `listV2({ prefix: "img/" })` 分页遍历；对每个 key 先查库、已存在则跳过；不存在则用 Range 只读前 64KB 解析尺寸后 upsert（`uploaderId` 留空、`usage` 默认 `image`）；单个对象异常计入 skipped 继续；结束打印 `{scanned, created, skipped}`。验证：脚本能跑通并打印三个计数，与 OSS 实际对象数、库内已有记录数对得上。
- [x] 3.2 验证幂等与容错。验证：连续执行两次，第二次 `created` 为 0、表总行数不变；制造一个不可读对象（或 mock `readObject` 返回 null），确认被计入 skipped、流程正常结束。

## 4. 图床页

- [x] 4.1 新建 `app/(site)/admin/images/page.tsx`（服务端组件，读 `searchParams` 的 `page`/`usage`/`q`，调 `listImages`）+ `components/admin/ImageLibrary.tsx`（客户端网格 + 筛选条 + 分页 + 搜索框）。缩略图用 `<img src={站内地址} loading="lazy">`，固定容器尺寸 + `object-fit: cover`；`onError` 时显示占位。验证：管理员打开页面能看到分页网格，每张显示尺寸/大小/时间；翻页、按用途筛选、按 key 片段搜索都改变结果；无匹配时显示空状态。
- [x] 4.2 在 `app/(site)/admin/layout.tsx` 的 `admin-links` 加「图床」链接。验证：后台导航出现该链接且能正确跳转。
- [x] 4.3 只读性与权限验证。验证：页面上不存在任何删除/编辑控件；未登录访问 `/admin/images` 被重定向到登录页；普通读者访问被重定向到首页且看不到任何图片内容。

## 5. 封面选择器

- [x] 5.1 新建 `components/admin/ImagePicker.tsx`：Radix `Dialog` 包裹，内部复用网格渲染（与图床同一份），选中后回调回填并关闭；取消/关闭不改动原值。验证：打开面板能看到图片、选中后弹层关闭、取消后封面保持原值。
- [x] 5.2 在 `PostEditor` 的封面行加「从图床选」按钮，选中后 `setCover(站内地址)`。验证：选一张图后封面输入框与预览同步更新；保存文章后刷新，`Post.cover` 是所选地址；封面已有值时再选另一张能替换。
- [x] 5.3 存储未配置与空列表降级。验证：未配置 OSS 时打开图床页与选择面板显示配置缺失提示、无未捕获错误；`Image` 表为空时显示空状态说明。

## 6. 集成验证与文档

- [x] 6.1 `npx tsc --noEmit` 与 `pnpm build` 均通过；重启开发服务器确认无旧 chunk 残留。
- [x] 6.2 真实浏览器全量核对：图床页在管理员下正常浏览/筛选/搜索/翻页；封面选择器选中即回填且保存生效；两个页面在六套主题下样式正常。
- [x] 6.3 更新 `docs/DEVELOPMENT.md`：补 `Image` 模型说明、图床与回填脚本的用法（`npx tsx --env-file=.env scripts/backfill-images.ts`）、以及「上传记录失败被故意吞掉」这一约定。验证：按文档步骤能复现回填，且描述与代码一致。

## Workflow follow-up

- 通过评审后归档本变更（`/openspec-archive-change`），把 `image-library` 同步进 `openspec/specs/`。
- 归档后复核 `docs/DEVELOPMENT.md` 与 README 的图片相关描述是否仍准确。