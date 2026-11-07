# Design

## Context

动机见 `proposal.md`；契约见 `specs/image-library/spec.md`。这里只记录实现必须依据的现状与已实测的事实。

**上传链路**（`app/api/upload/route.ts`）：

```
登录校验（任何角色）→ OSS 配置校验（不配就 503）
  → formData: file + kind(avatar|cover|image，非法值归一为 image)
  → 校验：≤5MB、MIME 必须命中 jpg/png/webp/gif
  → sha256(buf) → key = `img/<hash>.<ext>`
  → objectExists(key)？命中则跳过 put，deduped: true
  → 返回 { ok, url: siteImagePath(key), key, kind, deduped }
```

关键事实：**当前的 `deduped` 只说明"对象已在 OSS 里"，不携带任何元信息**。它证明了内容寻址生效，
也就意味着「同一张图不会存两份」这件事已经成立——缺的只是"知道它存在"。

**调用点只有两处**：`PostEditor`（封面 + 正文插图，`kind=cover|image`）与 `ProfileForm`（头像，`kind=avatar`）。
两者都只消费 `data.url`，不关心 `key` 之外的任何字段——所以新增响应字段对它们是透明的。

**已有的约定，必须沿用**：

- 页面只出现站内地址 `/img/<key>`，OSS 直链不外泄（`lib/oss.ts` 的 `siteImagePath` 与
  `lib/image-url.ts` 的 `toSiteImageUrl`）。图床与选择面板都只能给站内地址。
- `/img/[key]` 路由做代理读取，带一年 immutable 缓存。
- 后台页在 `app/(site)/admin/` 下，`layout.tsx` 已做「未登录 → 登录页 / 非 ADMIN → 首页」双层守卫。

**已实测的事实（决定 D3）**：

- 手写头部解析 JPEG / PNG / GIF / WebP 四种格式**可行且无需新依赖**：8 个用例全过
  （含 1x1、4032x3024、空 buffer、随机字节、截断数据）。
- 但**必须做边界保护**：不做长度检查时，截断的 PNG 会在 `readUInt32BE(20)` 抛错。
  `sharp` 在 `node_modules` 里只是 Next.js 的传递依赖，直接 import 会变成幽灵依赖
  （本仓库踩过 `unist-util-visit` 的同类问题）。

## Goals / Non-Goals

**Goals:**

- 上传路径**零行为变更**：响应、去重、错误码全部不动，只是多写一行记录。
- 记录失败绝不污染用户体验（图片已经在 OSS 里了）。
- 回填脚本可反复执行，且对个别坏对象免疫。
- 图床与选择面板复用同一份查询逻辑与同一个网格渲染。

**Non-Goals:**

- 不做删除、回收站、批量操作。
- 不做引用检查（正文/封面/头像的三方扫描）。
- 不引入图片处理（裁剪、压缩、WebP 转换）。
- 不改 `Post.cover` 的类型——它仍是 `String?` 存站内地址，不做外键关联。

## Decisions

### D1 建表，而不是实时列举 OSS

```prisma
model Image {
  id          String   @id @default(cuid())
  key         String   @unique          // img/<sha256>.<ext>
  hash        String                    // sha256，用于搜索与去重判断
  ext         String                    // jpg / png / webp / gif
  contentType String
  bytes       Int
  width       Int?
  height      Int?
  usage       String   @default("image") // 最近一次用途：avatar | cover | image
  uploaderId  String?
  createdAt   DateTime @default(now())
  lastUsedAt  DateTime @default(now())

  @@index([createdAt])
  @@index([usage, createdAt])
  @@index([hash])
}
```

- **为什么不用实时 `client.list({ prefix: "img/" })`**：那是每次翻页都真实请求一次 OSS（几百毫秒起），
  而且 OSS 的对象元数据里没有"上传者"和"用途"，图床能展示的东西会比现在少一半。
- **为什么不用"列举 + 缓存表"的混合方案**：两套真相要对齐（OSS 有、表没有 / 表有、OSS 已没），
  状态机复杂度远超这个功能的收益。全量回填一次就够了。
- `key` 唯一而非 `hash` 唯一：`hash` 与 `key` 事实上同源（key 由 hash 派生），但 key 才是真正的对象标识；
  hash 只做搜索索引，避免未来改命名规则时被唯一约束卡住。
- `uploaderId` 不做外键：读者注销或删除后图片记录不该消失（图还在 OSS 里），保留一个可能悬空的 id 比级联删除更安全。

### D2 上传成功后再写记录，且吞掉写库异常

```ts
const exists = await objectExists(key);
if (!exists) await uploadImage(key, buf, file.type);

// 记录是「附加信息」：写失败不能让用户以为上传失败（图片已经在 OSS 里了）
try { await recordImage({ key, hash, ext, contentType, bytes, width, height, usage: kind, uploaderId }); }
catch { /* 只记日志，不影响响应 */ }

return NextResponse.json({ ok: true, url: siteImagePath(key), key, kind, deduped: exists });
```

- **为什么放在 put 之后**：先写记录再上传，一旦上传失败就留下一条指向不存在对象的记录，
  图床里会出现大量破图。
- **为什么要吞异常**：spec 的「记录写入失败」场景明确要求接口仍返回成功。
  这是这个功能里唯一一处**故意忽略错误**的地方，所以在注释里写清楚理由。
- `recordImage` 用 `upsert`（`where: { key }`）：
  - 首次上传 → create；
  - 重复上传 → update `lastUsedAt`、`usage`，**不动** `createdAt` 与 `uploaderId`
    （首次上传者与首次时间才是有意义的归属信息，spec 的「不同用途复用」场景明确要求不丢）。

### D3 宽高手写解析，不引依赖

四种格式的头部位置：

| 格式 | 判定位 | 宽高位置 |
|---|---|---|
| PNG | `89 50 4E 47` @0 | `readUInt32BE(16)` / `readUInt32BE(20)` |
| GIF | `GIF` @0 | `readUInt16LE(6)` / `readUInt16LE(8)` |
| JPEG | `FF D8` @0 | 扫描 `FFC0..FFCF`（排除 C4/C8/CC）段，`readUInt16BE(+5/+7)` |
| WebP | `RIFF`+`WEBP` | VP8 型 `readUInt16LE(26/28) & 0x3FFF`；VP8L 型位运算；VP8X 型 `readUIntLE(24,3)+1` |

- **为什么手写**：`sharp` 是 Next.js 的传递依赖，直接 import 就是幽灵依赖；
  为两个可选字段装一个原生二进制依赖不划算。实测四种格式全部可解析（8/8）。
- **必须做边界保护**：每个 `read*` 前检查长度，格式不认或数据截断一律返回 `null`。
  漏掉这层会在截断 PNG 上抛错（实测踩到）。
- **失败不阻断**：`null` 时 `width/height` 留空，上传继续。spec 的「无法解析」场景要求这一点。

### D4 图床页与选择面板共用查询与网格

```
lib/images.ts
  ├ recordImage()          写入/更新
  ├ listImages({ page, usage, q })  分页 + 筛选 + 搜索，返回 { rows, total, page, pageSize }
  └ probeImageSize()       纯函数，头部解析

app/(site)/admin/images/page.tsx     服务端直读（沿用后台其他页的惯例，不新开 GET 接口）
components/admin/ImageLibrary.tsx    网格 + 筛选条 + 分页（客户端，负责交互与翻页）
components/admin/ImagePicker.tsx     选择面板（复用 ImageLibrary 的网格渲染，多了"选中并关闭"）
```

- **为什么不新开 `GET /api/images`**：后台列表页在本仓库的既有惯例是"服务端组件直读 Prisma"
  （`/admin/tags`、`/admin/posts` 都这样）。翻页与筛选用 `searchParams` 走服务端重渲染，
  少一个接口就少一处鉴权面——这条在 `app/api/tags/route.ts` 的注释里已经写明。
  - **例外修正（实现阶段发现）**：封面选择器是**弹层里的客户端组件**，它需要在打开时按筛选条件
    重新拉数据，服务端组件渲染不到那里，`searchParams` 那条路走不通。因此额外加一个**只读**
    的 `GET /api/images`（`getAdminSession()` 守卫，复用 `listImages`，只返回当前页）。
    这是一次接口收缩：只有这一个**读**接口，写仍然走 `/api/upload`，后台列表页仍走服务端直读。
- **选择面板为什么复用网格**：两个地方的图片展示需求完全一致（缩略图、大小、尺寸、时间），
  唯一差别是回调。抽一个 `ImageGrid` 内部组件，`onPick` 为 undefined 时就是只读浏览。
- 选择面板用 Radix `Dialog`（`radix-ui` 统一包里已有，`FeedbackProvider` 在用 `AlertDialog`）：
  不用自造遮罩与焦点管理。

### D5 缩略图直接用站内地址，不做缩略图服务

`<img src="/img/<key>">` + `loading="lazy"` + CSS 固定容器尺寸 `object-fit: cover`。

- **为什么不生成缩略图**：那需要图片处理能力（本次明确不做）。原图可能 2MB，
  但 `/img` 已带一年 immutable 缓存，图床是管理员低频页面，可接受。
- **为什么容器固定尺寸**：避免图片加载前后布局抖动；也用 `object-fit: cover` 保证网格整齐。

### D6 回填脚本

`scripts/backfill-images.ts`，用项目已有的 `tsx`：

```
1. isOssConfigured() 检查 → 不通过则报错退出（不写空记录）
2. client.listV2({ prefix: "img/", "max-keys": 1000, continuationToken }) 循环分页
3. 对每个 key：
   - 已有记录 → 跳过
   - readObject(key) 读出来 → 解析尺寸 → upsert（uploaderId 留空、usage 默认 image）
   - 读取失败 / 尺寸解析失败 → 计入 skipped，继续
4. 打印 { scanned, created, skipped }
```

- **为什么用 `readObject` 读全文而不是 `head`**：`head` 拿不到像素尺寸，而尺寸要解析头部——
  不过只需读前若干字节。`ali-oss` 的 `get` 支持 `headers: { Range: "bytes=0-65535" }`，
  读 64KB 足够覆盖所有格式的头部，避免把几 MB 的原图整个拉下来。
- **幂等靠 `key` 唯一 + 先查后写**：重复执行时第二步全跳过。
- **为什么不放进 Docker 启动流程**：回填是一次性迁移动作，放进每次启动的 `CMD` 会让容器启动变慢且不可控。

### D7 导航与权限

- `app/(site)/admin/layout.tsx` 的 `admin-links` 加一条「图床」。
- 页面本身不需要额外守卫——`layout.tsx` 已经做了「未登录 → `/login?returnTo`，非 ADMIN → `/`」，
  子页面共享这层。这也是 spec 的「非管理员访问」场景能成立的依据。

## Risks / Trade-offs

- **[上传路径变慢]** → 写库是本地 DB 的 upsert（毫秒级），且异常被吞；相对一次 OSS put 可忽略。
- **[记录与 OSS 不一致]**（表里有、对象被手工删了）→ 图床用 `onError` 显示占位而非破图（spec 已要求）；
  不做自动清理，因为无法区分"临时故障"与"真删了"。
- **[回填把大 bucket 拖垮]** → 分页 + Range 只读头部；脚本打印进度，可中断后重跑（幂等）。
- **[读者头像进入图床]** → 列表会显示普通读者上传的图片。这是 `kind=avatar` 本来就允许的行为，
  spec 明确要求"如实记录上传者"；图床本身仅管理员可见，不构成越权。
- **[尺寸解析的格式盲区]** → 不认识的格式留空（spec 允许）；新增格式时补一个分支即可，纯函数好测。
- **[分页与筛选走 searchParams 会整页刷新]** → 与后台其他页一致，管理员低频使用，不引入客户端缓存复杂度。
- **[幽灵依赖]** → 尺寸解析手写、图片展示用原生 `<img>`、选择面板用已有的 `radix-ui`，本次**零新依赖**。

## Migration Plan

1. **加模型与迁移**：`Image` 表 + 一条迁移。表是新增的，不动任何既有表，对现有功能零影响。
2. **先上线记录能力**（改 `/api/upload`），此时图床里只有新上传的图。
3. **跑回填**：`npx tsx --env-file=.env scripts/backfill-images.ts`，把已有对象补入。
4. **上线图床页与封面选择器**（纯增量 UI）。
5. **回滚**：删掉导航链接与两个组件引用即可；`Image` 表留着无害（上传路径的写入已被 try/catch 包住，
   即使回滚了 UI，记录仍在继续积累，不影响任何既有功能）。
6. 迁移是纯增表，向后兼容——`docker compose up` 时 `prisma migrate deploy` 自动应用，无需数据回滚。

## Open Questions

- 图床网格的每页数量（候选 24 / 36 / 48）。这是纯视觉密度选择，在实现后用真实数据看一眼再定，
  不影响 spec、方案或任务拆分。