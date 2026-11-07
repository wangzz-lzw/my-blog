# LZW.LOG 开发文档

个人博客站点的开发手册：技术栈、架构、接口、样式体系、踩过的坑。

> 代码仓库：`wangzz-lzw/my-blog`（分支 `master`）
> 线上站点名：`LZW.LOG`（见 `lib/site.ts`）
> 本文档随代码更新，最后核对：2026-11-06

---

## 目录

1. [项目概览](#1-项目概览)
2. [快速开始](#2-快速开始)
3. [技术栈](#3-技术栈)
4. [架构与目录](#4-架构与目录)
5. [路由与页面](#5-路由与页面)
6. [HTTP 接口](#6-http-接口)
7. [数据模型](#7-数据模型)
8. [认证与权限](#8-认证与权限)
9. [样式与主题系统](#9-样式与主题系统)
10. [滚动体系](#10-滚动体系)
11. [内容链路](#11-内容链路)
12. [部署与 CI/CD](#12-部署与-cicd)
13. [OpenSpec 工作流](#13-openspec-工作流)
14. [开发约定](#14-开发约定)
15. [排障速查](#15-排障速查)
16. [已知问题与待办](#16-已知问题与待办)

---

## 1. 项目概览

一个自建、自托管的中文个人技术博客。前台的阅读体验（排版、滚动条、动效）是主要投入方向；
后台是一套够用的写作与管理工具：Markdown 写作、标签管理、评论审核、图片上传、AI 生成摘要。

功能面：

| 面 | 能力 |
|---|---|
| 阅读 | 欢迎页（3D 环形文章导航 + 动效）、文章列表（列表自己滚 + 阅读进度读数）、文章详情（Markdown 渲染、代码高亮、阅读进度、浏览量）、标签索引与归档 |
| 账号 | 开放注册（`READER`）、用户名/邮箱 + 密码登录、邮箱验证码注册与补绑、个人资料与头像、改密码 |
| 评论 | 登录后可评论，全部进待审队列，后台审核/删除 |
| 后台 | 站点概览、文章增删改（全屏写作 + 实时预览 + 导入 Markdown + AI 摘要）、标签增删改（改名保留旧链接）、评论审核 |
| 图片 | 头像与封面统一上传到阿里云 OSS，内容寻址去重，页面只出现站内 `/img/<key>` |
| 外观 | 6 套主题（含唯一亮色主题），全站自绘滚动条，GSAP 动效，移动端适配 |

---

## 2. 快速开始

### 2.1 环境要求

| 依赖 | 版本 | 说明 |
|---|---|---|
| Node.js | 20+（CI 与 Docker 用 22） | 本机开发用 24 也可以 |
| PostgreSQL | 16（本机任意 ≥13 均可） | Docker 部署时由 compose 自带 `postgres:16-alpine` |
| pnpm | 10+ | 本地安装依赖用；CI 与 Docker 镜像用 `npm ci` |
| openspec CLI | 1.16 | 可选，只在使用 spec 工作流时需要 |

> **两个 lockfile 都要提交**：`pnpm-lock.yaml`（本地开发）和 `package-lock.json`（CI / Docker 用 `npm ci`）。
> 删掉任意一个都会让对应链路装不上依赖。

### 2.2 本地启动

```bash
# 1. 准备数据库（本机已装 PostgreSQL 的话只做后两句）
createdb blog
psql -c "CREATE USER blog WITH PASSWORD 'blog_password';"
psql -c "GRANT ALL PRIVILEGES ON DATABASE blog TO blog;"

# 2. 配置环境变量
cp .env.example .env       # 至少改 DATABASE_URL / AUTH_SECRET

# 3. 安装依赖
pnpm install

# 4. 建表 + 生成 client + 灌种子数据
pnpm prisma:migrate
pnpm prisma:generate
pnpm prisma:seed

# 5. 起开发服务器
pnpm dev                   # http://localhost:3000
```

管理员账号来自 `.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（种子脚本创建），后台入口 `/admin`。
访客可在 `/register` 注册 `READER` 账号（需邮箱验证码，所以本地还要配 SMTP 或换个方式测）。

### 2.3 常用脚本

| 命令 | 作用 |
|---|---|
| `pnpm dev` | 开发服务器（Turbopack） |
| `pnpm build` / `pnpm start` | 生产构建 / 启动 |
| `pnpm lint` | `next lint` |
| `npx tsc --noEmit` | 类型检查（CI 跑的就是这条） |
| `pnpm prisma:migrate` | `prisma migrate dev`，改 schema 后建迁移 |
| `pnpm prisma:deploy` | `prisma migrate deploy`，生产环境只跑迁移 |
| `pnpm prisma:generate` | 重新生成 Prisma Client |
| `pnpm prisma:seed` | `tsx --env-file=.env prisma/seed.ts` |
| `pnpm db:push` | 只推 schema 不建迁移（临时试验用，别用于正式改动） |

### 2.4 环境变量

完整清单见 `.env.example`，按功能分组：

```bash
# 必需
DATABASE_URL="postgresql://blog:blog_password@localhost:5432/blog?schema=public"
AUTH_SECRET="<openssl rand -base64 32>"
AUTH_URL="http://localhost:3000"
ADMIN_USERNAME="admin"
ADMIN_PASSWORD="change_me"

# 图片上传（不配则上传接口 503，仍可手填外链）
OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
OSS_ENDPOINT / OSS_PUBLIC_BASE_URL / OSS_ACL   # 可选

# 邮箱验证码（不配则发码接口 503）
SMTP_HOST / SMTP_PORT(465|587) / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM

# AI 摘要（OpenAI 兼容接口，不配则该按钮报 503）
AI_API_KEY / AI_BASE_URL / AI_MODEL
```

`AUTH_SECRET` 同时是邮箱验证码的哈希盐（`lib/verification.ts`），**改动它会让所有未使用的验证码失效**，
也会让已签发的 JWT 全部失效（所有人需要重新登录）。

---

## 3. 技术栈

### 3.1 一览表

版本号取自锁文件实际解析结果（`package.json` 里写的是 `^` 范围）。

| 层 | 选型 | 版本 | 用法要点 |
|---|---|---|---|
| 运行时 | Node.js | 22（Docker / CI） | `next start`，不开 `output: "standalone"` |
| 框架 | **Next.js** | 16.4.2 | App Router + Turbopack；`next.config.ts` 里钉死 Turbopack root |
| UI 库 | **React** | 19.3.1 | 服务端组件为默认，客户端组件显式 `"use client"` |
| 语言 | TypeScript | 6.0.3 | `strict: true`；路径别名 `@/*` → 仓库根 |
| 样式 | 手写 CSS | — | 两个全局样式表，**不用 Tailwind / CSS-in-JS / CSS Modules** |
| 设计系统 | CSS 自定义属性 + `data-theme` | — | 6 套主题切换同一组 token |
| 组件原语 | **radix-ui**（统一包） | 1.8.1 | 只用了 `DropdownMenu`、`AlertDialog` |
| 动效 | **GSAP** | 3.15.1 | 欢迎页、环形导航、导航过渡；ScrollTrigger 已包含在 gsap 主包里 |
| 滚动条 | **OverlayScrollbars** | 2.17.0 | 只做滚动接管，轨道/滑块外观全部自己画 |
| ORM | **Prisma** | 6.19.3 | `prisma-client-js`，单例在 `lib/prisma.ts` |
| 数据库 | **PostgreSQL** | 16 | 迁移在 `prisma/migrations/` |
| 认证 | **NextAuth (Auth.js) v5** | 5.0.0-beta.32 | Credentials + JWT session |
| 密码 | bcryptjs | 3.0.3 | cost 10 |
| 邮件 | nodemailer | 8.0.11 | 个人邮箱 SMTP 授权码发验证码 |
| 对象存储 | ali-oss | 6.23.0 | 阿里云 OSS，内容寻址去重 |
| Markdown | react-markdown | 10.1.0 | 管线：`remark-gfm` / `remark-breaks` / `rehype-slug` / `rehype-autolink-headings` / `rehype-external-links` / `rehype-highlight` |
| front-matter | front-matter | 4.0.2 | 导入 Markdown 时解析元信息（浏览器安全，不依赖 fs） |
| AI | OpenAI 兼容 HTTP | — | 原生 `fetch` 调 `POST {base}/chat/completions`，没有 SDK |
| 脚本 | tsx | 4.23.15 | 跑 `prisma/seed.ts` |
| 部署 | Docker + Compose + Nginx | — | 多阶段构建，构建期内置临时 PostgreSQL |
| CI/CD | GitHub Actions | — | push `master` → 类型检查 → SSH 部署 → 健康检查 |

### 3.2 几个刻意的取舍

- **不用 Tailwind**：站点视觉是高度定制的（终端/账本风、6 套主题、自绘滚动条），
  工具类反而要和一堆 `data-*` 状态选择器打架。代价是 `globals.css` 与 `redesign.css` 很大，
  所以下面第 9 节专门讲样式组织。
- **不用 React 包装版 OverlayScrollbars**：官方 React 封装没有被使用，`components/ui/ScrollArea.tsx`
  直接调 core API。原因是需要精确控制 DOM 结构与 `instance.update(true)` 的时机。
- **不用 `output: "standalone"`**：容器启动时要跑 `prisma migrate deploy` + `prisma db seed`，
  需要完整 `node_modules`，因此运行时用 `npm run start`（详见 `next.config.ts` 注释）。
- **不用 ISR 做主页面**：除了文章详情与标签归档，几乎所有读库页面都 `force-dynamic`（原因见 5.2）。

---

## 4. 架构与目录

### 4.1 请求链路

```
浏览器
  │
  ├─ 静态资源 ──────────────► /_next/static/*（Nginx 一年 immutable 缓存）
  │
  └─ 页面 / 接口
        │
        ▼
   Nginx (deploy/nginx.conf)
        │  proxy_pass 127.0.0.1:3000
        ▼
   Next.js 容器 (node:22-alpine, `next start`)
        ├─ middleware.ts       仅拦 /admin/*，未登录跳 /login?returnTo=…
        ├─ RSC 页面            服务端组件直读 Prisma，不经过自家 HTTP 接口
        ├─ app/api/**          写操作 + 客户端数据（鉴权在各自 handler 里）
        └─ /img/[key]          代理读 OSS 对象，页面只暴露站内地址
        │
        ▼
   PostgreSQL 16（compose 服务 db）
```

一条重要约定：**读数据不绕一圈 HTTP**。前台、后台列表都在服务端组件里直接 `prisma.*` 查询，
`/api/posts` 只有 `POST`、`/api/tags` 只有 `POST`——少一套接口就少一处鉴权面。

### 4.2 目录结构

```
app/
  layout.tsx                根布局：样式引入、主题初始化内联脚本、FeedbackProvider、RootScroll
  page.tsx                  `/` 欢迎页（独立门面，不挂站点页头页脚）
  globals.css               主题 token + 全站基础样式（3755 行）
  redesign.css              账本/终端风格的重设计层，覆盖 globals（2900 行）
  (site)/                   站点外壳分组：页头 + main + 页脚 + 浮动工具
    layout.tsx
    blog/page.tsx           文章列表（列表自滚 + 侧栏）
    posts/[slug]/page.tsx   文章详情
    tags/page.tsx           标签索引
    tags/[slug]/page.tsx    标签归档（含旧地址 308 跳转）
    login/ register/ profile/
    admin/                  后台（layout 鉴权 + 概览/文章/标签/评论）
  api/                      接口（见第 6 节）
  img/[key]/route.ts        OSS 对象代理
  api/auth/[...nextauth]/   NextAuth 处理器
components/
  ui/ScrollArea.tsx         全站统一滚动容器（OverlayScrollbars core）
  ui/RootScroll.tsx         #app-scroll 根滚动层 + hash/历史位置补偿
  blog/ListScrollPane.tsx   列表滚动面板：走线、阅读线、读数、位置恢复
  welcome/                  欢迎页动效（Orbit / Motion / Particles / Cursor / AuthPanel）
  admin/PostEditor.tsx      写作台（771 行，最复杂的客户端组件）
  admin/TagManager.tsx      标签管理表
  feedback/FeedbackProvider.tsx  全站提示与确认弹窗（Radix AlertDialog + toast）
  Markdown.tsx CodeBlock.tsx      Markdown 渲染与代码块
  HeaderAuth / SiteNav / UserMenu / ThemeSwitcher / FloatTools / ReadingProgress …
lib/                        纯逻辑与外部服务封装（见 4.3）
prisma/                     schema、7 个迁移、seed
deploy/nginx.conf           反代示例
openspec/                   spec 工作流产物（changes / specs / archive）
types/next-auth.d.ts        Session / JWT 类型扩展
```

### 4.3 `lib/` 职责表

| 文件 | 职责 |
|---|---|
| `prisma.ts` | PrismaClient 单例（非 production 挂 `globalThis`，避免热更新爆炸） |
| `authz.ts` | `getAdminSession()`：登录且 `role === "ADMIN"` 才有返回值 |
| `password.ts` | `hashPassword` / `verifyPassword`（bcryptjs cost 10） |
| `slug.ts` | `slugify`（保留中日韩字符）、`decodeSlugParam`（动态段解码一次） |
| `tags.ts` | 标签校验、冲突检查、别名链、**受控词表** `resolveTagRefs` |
| `ai.ts` | `isAiConfigured`、`summarizePost`（摘要 + 标签白名单过滤） |
| `mail.ts` | SMTP 发信、`MailNotConfigured`（503）/ `MailSendFailed`（502）、`maskEmail` |
| `verification.ts` | 验证码签发/校验/限流/过期清理，只存哈希 |
| `oss.ts` | OSS 配置、上传、读对象、`siteImagePath` |
| `image-url.ts` | `toSiteImageUrl`：把 OSS 直链改写成 `/img/<key>`，其它外链原样 |
| `markdown-import.ts` | `parseMarkdownDocument` / `mergeImport`：文本进、结构出，不碰 React state |
| `read-time.ts` | 阅读时长：中文 400 字/分 + 西文 200 词/分，最小 1 |
| `date.ts` | `formatDate`（`zh-CN` 的 medium + short） |
| `scroll-pane.ts` | 「当前到底哪一层在滚」的统一解析（见第 10 节） |
| `site.ts` | `SITE_NAME = "LZW.LOG"` |
| `theme.ts` | 6 套主题定义、`currentTheme` / `applyTheme` |
| `types.ts` | `PostWithTags` / `SafeComment` 等视图类型 |

---

## 5. 路由与页面

### 5.1 页面清单

| 路径 | 渲染方式 | 内容 |
|---|---|---|
| `/` | `force-dynamic` | 欢迎页：词标、状态行（文章数/标签数/更新时间）、3D 环形导航、登录面板、GSAP 动效 |
| `/blog` | `force-dynamic` | 文章列表：左列自己滚（`ListScrollPane`），右侧栏固定 |
| `/posts/[slug]` | `revalidate = 60` | 文章详情：摘要、正文、代码高亮、标签、评论（仅 `approved`）、阅读进度、浏览量 beacon；≥1280px 时左侧多一列文章大纲 |
| `/tags` | `force-dynamic` | 标签索引，含每个标签的文章数 |
| `/tags/[slug]` | `revalidate = 60` | 标签归档；命中 `aliases` 时 **308 永久重定向**到新地址；都没有则 404 |
| `/login` | 无显式 `dynamic`，服务端读 `searchParams` | 登录（`identifier` = 用户名或邮箱） |
| `/register` | 无显式 `dynamic`，服务端读 `searchParams` | 注册（邮箱验证码） |
| `/profile` | `force-dynamic` | 昵称/头像/邮箱补绑/改密码 |
| `/admin` | `force-dynamic` | 概览：文章数、浏览量、待审评论等 |
| `/admin/posts` | `force-dynamic` | 文章表（含草稿） |
| `/admin/posts/new` | `force-dynamic` | 写作台（新建） |
| `/admin/posts/[id]` | `force-dynamic` | 写作台（编辑，`id === "new"` 时是新建） |
| `/admin/tags` | `force-dynamic` | 标签管理表（新建/改名/删除） |
| `/admin/comments` | **客户端组件**（`"use client"`，`fetch("/api/comments")` 取数） | 评论审核表 |
| `/welcome` | 301 → `/` | 旧地址收口（`next.config.ts` 的 `redirects`） |

### 5.2 为什么几乎全是 `force-dynamic`

Docker 构建阶段（`Dockerfile` 的 builder 阶段）会起一个**临时的空 PostgreSQL** 跑 `next build`，
因为 `next build` 会预渲染页面并查库。如果在构建期把 `/blog` 预渲染了，镜像里就烤进一份"0 篇文章"的 HTML，
部署后前台永远是空的。所以凡是从数据库读实时内容的页面一律 `force-dynamic`。

例外是文章详情与标签归档——它们用 `revalidate = 60` + `dynamicParams = true`，
代价是文章/标签改动后最多 60 秒才可见。标签改名/删除后接口里显式调 `revalidatePath()` 清缓存，
覆盖了旧地址、新地址、`/tags`、`/blog` 四条路径。

### 5.3 中文 slug

动态段 `params.slug` 到达时是**未解码**的原始片段（中文会以 `%E7%AC%AC…` 进来），
直接查库查不到。统一在页面入口调 `decodeSlugParam()` 解一次（`lib/slug.ts`，解码失败则原样返回）。

另外 `permanentRedirect()` 的 `Location` 头必须是 ASCII 安全字符串，
中文 slug 要 `encodeURIComponent()` 后再拼，否则会抛
`TypeError: Invalid character in header content ["location"]`（500）。

---

## 6. HTTP 接口

所有写接口都在 handler 里自己鉴权，**不依赖 middleware**（middleware 只保护 `/admin/*` 页面）。
未登录访问管理接口返回 **403**（不是 401），文案统一是「需要管理员权限」。

| 方法 | 路径 | 权限 | 请求 | 成功 | 主要失败 |
|---|---|---|---|---|---|
| GET/POST | `/api/auth/[...nextauth]` | 公开 | NextAuth 接管 | 登录/会话/登出 | — |
| POST | `/api/auth/email-code` | 公开（`bind` 需登录） | `{email, purpose:"register"\|"bind"}` | `{ok, cooldown}` | 400 邮箱格式；409 已被注册/被占用；429 冷却或频繁；503 邮件未配置；502 发信失败 |
| POST | `/api/register` | 公开 | `{username,password,email,code}` | `{ok,id}` | 400 用户名/密码/邮箱格式或验证码错误；409 用户名或邮箱已被占用 |
| GET | `/api/me` | 公开 | — | `{user:{id,username,email,name,avatar,role}}`，未登录 `{user:null}` | — |
| PATCH | `/api/me/email` | 登录 | `{email, code}`（`bind` 用途） | `{ok,email}` | 400 格式/验证码；409 他人占用 |
| GET | `/api/profile` | 登录 | — | 用户对象（含 `createdAt`） | 401、404 |
| PATCH | `/api/profile` | 登录 | `{name?,email?,avatar?}` | `{ok,user}` | 400 昵称>30、头像过大/格式/链接过长；409 邮箱被占用 |
| POST | `/api/profile/password` | 登录 | `{currentPassword,newPassword}` | `{ok}` | 400 缺字段、<8 位、与旧密码相同、当前密码不正确 |
| POST | `/api/posts` | ADMIN | `{title,content,slug?,excerpt?,cover?,published,tags:"a,b"}` | 201 `{id}` | 400 空标题/正文、未知标签；409 slug 已存在 |
| PUT | `/api/posts/[id]` | ADMIN | 同上 | `{id}` | 404 文章不存在；409 slug 被其它文章占用 |
| DELETE | `/api/posts/[id]` | ADMIN | — | `{ok}` | 403 |
| POST | `/api/posts/[id]/view` | 公开 | — | `{views}` | 404；503 客户端未重新生成 |
| GET | `/api/comments` | ADMIN | — | 全量评论（含待审） | 403 |
| POST | `/api/comments` | 登录 | `{slug, content}`（≤2000 字，身份取自会话） | `{ok}`，`approved:false` | 401、400、404、500 |
| PATCH | `/api/comments/[id]` | ADMIN | `{approved}` | `{ok}` | 403 |
| DELETE | `/api/comments/[id]` | ADMIN | — | `{ok}` | 403 |
| POST | `/api/tags` | ADMIN | `{name, slug?}` | 201 `{tag}` | 400 名/段校验；409 重名或被占用 |
| PATCH | `/api/tags/[id]` | ADMIN | `{name, slug?}` | `{tag}`（旧 slug 进 `aliases`） | 404、409 |
| DELETE | `/api/tags/[id]` | ADMIN | — | `{ok, detached:n}` | 404 |
| POST | `/api/upload` | 登录 | formData `file` + `kind=avatar\|cover` | `{ok,url,key,kind,deduped}` | 400 超过 5MB / 类型不支持；503 OSS 未配置 |
| POST | `/api/ai/summarize` | ADMIN | `{title, content, tags}` | `{excerpt, tags[]}` | 429 限流（10 次/分）；503 未配置；502 调用失败 |
| GET | `/img/[key]` | 公开 | — | 图片二进制，`immutable` 缓存一年 | 404、503 OSS 未配置、502 读取失败 |

约定：

- **错误响应统一是 `{error: "中文文案"}`**，前端直接展示，不再做状态码 → 文案映射。
- 标签相关的错误来自 `TagError`，带自己的 `status`（400/409），路由层原样透出。
- `/api/me` 单独存在的原因是**头像**：头像可能是几十 KB 的 data URL，
  放进 JWT/cookie 会超过 4KB 导致 431 甚至浏览器崩，所以 token 里只放 id/role/username/name/email。

---

## 7. 数据模型

### 7.1 模型

```prisma
enum Role { ADMIN READER }

User      id, username?(unique), email?(unique), name?, avatar?, passwordHash,
          role(default READER), createdAt, updatedAt

EmailCode email, purpose("register"|"bind"), codeHash, attempts, ip?, createdAt, expiresAt
          @@index([email, purpose, createdAt]) @@index([ip, createdAt])

Post      id, title, slug(unique), excerpt?, content(Text), cover?,
          published(false), publishedAt?, views(0), createdAt, updatedAt
          tags Tag[]  comments Comment[]
          @@index([published, publishedAt])

Tag       id, name(unique), slug(unique), aliases String[], createdAt, posts Post[]

Comment   id, postId, post(Cascade), author, email?, content(Text), approved(false), createdAt
          @@index([postId, approved])
```

要点：

- `Post.views` 由文章页的客户端 beacon 自增（`PostViewBeacon` → `POST /api/posts/[id]/view`）。
- `Tag` 与 `Post` 是**隐式多对多**（`_PostToTag` 两侧都是 `ON DELETE CASCADE`），
  因此删标签只断关联，文章一行不动；接口把受影响文章数作为 `detached` 返回。
- `Tag.aliases` 是标签改名后的旧地址集合，`/tags/[slug]` 靠它做 308 永久跳转，
  **上限 20 个**（`TAG_ALIAS_LIMIT`），超出丢最旧的。

### 7.2 迁移

```
20261021120836_init                            建表（Role 只有 ADMIN）
20261028101600_add_post_views                  Post.views
20261104120000_add_reader_role                 Role 加 READER（枚举值单独一个迁移）
20261104120100_user_username_and_role_default  email 变可选、加 username、默认角色改 READER
20261104140000_user_avatar                     User.avatar
20261105105735_add_email_code                  EmailCode + 两个索引
20261105145041_add_tag_slug_aliases            Tag.aliases + Tag.createdAt
```

`Role` 的 READER 必须单独一个迁移：PostgreSQL 不允许在同一个事务里既加枚举值又使用它。
所有迁移都是加列/加枚举，向后兼容，所以回滚代码通常不需要回滚数据库。

> `init.sql` 是早期手工初始化脚本（`Role` 只有 ADMIN，没有 views/username/avatar/EmailCode），
> 已与当前 schema 不同步，**只能当历史记录看，不要当迁移依据**。

### 7.3 种子

`prisma/seed.ts`：

- 管理员：按 `ADMIN_USERNAME` 查，存在则更新（重设密码、`role=ADMIN`），不存在则创建 → 幂等。
- 示例文章：只有 `post.count() === 0` 时才建 `welcome` 一篇，并 `connectOrCreate` 出 `介绍` 标签 → 幂等。
- 容器每次启动都会跑一遍 seed（见 Dockerfile 的 `CMD`），所以它必须是幂等的。

---

## 8. 认证与权限

### 8.1 登录链路

```
/login  表单（identifier + password）
   → NextAuth Credentials.authorize()
     prisma.user.findFirst({ OR: [{username: identifier}, {email: identifier}] })
     → bcrypt.compare(password, passwordHash)
   → JWT（token: id / role / username / name / email）
   → session.user（id / role / username / name / email）
```

- 字段名是 **`identifier`**，不是 `username`——Credentials 表单字段写错会一直 `authorize` 收到 `undefined`。
- session 策略是 `jwt`，不带 adapter，也就不查库。改了密码不会主动失效旧 token（除非换 `AUTH_SECRET`）。
- 资料修改后用 `unstable_update({ user: { name, email } })` 同步到当前 token。
  **头像刻意不进 token**（data URL 会撑爆 cookie）。

### 8.2 角色

| | ADMIN | READER |
|---|---|---|
| 进 `/admin/*` | ✅ | ❌（layout 重定向 `/`） |
| 写文章 / 标签 / 审核评论 | ✅ | ❌（403） |
| 评论 | ✅（也待审） | ✅（待审） |
| 上传图片、改资料、改密码、绑邮箱 | ✅ | ✅ |

三层保护，各管一段：

1. `middleware.ts`：`matcher: ["/admin/:path*"]`，**只判断是否登录**，未登录重定向到 `/login?returnTo=…`。
2. `app/(site)/admin/layout.tsx`：`!session` → 登录页；`role !== "ADMIN"` → 首页。
3. `lib/authz.ts` 的 `getAdminSession()`：所有管理类 API handler 的第一行。

注意第 1 层不判角色，所以 READER 能通过 middleware，被第 2 层挡住。

---

## 9. 样式与主题系统

### 9.1 两个样式表的职责

| 文件 | 行数 | 内容 |
|---|---|---|
| `app/globals.css` | ~3755 | 主题 token、`html`/`body`、页头页脚、按钮表单、旧版首页/文章/评论/后台样式、移动端、滚动条外观、主题切换器 |
| `app/redesign.css` | ~2900 | 账本/终端风格的重设计层：外壳栅格、列表账本、文章页排版、浮动工具、侧栏题跋、编辑器、提示弹窗、欢迎页、环形导航、窄屏重排 |

加载顺序在 `app/layout.tsx` 里：先 `globals.css` 再 `redesign.css`，后者是同优先级的覆盖层。
**新增样式前先判断属于哪一层**：基础控件与 token 进 globals，页面级视觉进 redesign。
两个文件都按「`/* ==== 分节 ==== */`」组织，改之前先搜分节标题，别在文件末尾追加一坨。

### 9.2 设计 token

所有颜色都从 `:root` 的一组变量派生，新增主题只需复制一组（`globals.css` 第 1–171 行）：

```
背景/面  --bg  --bg-2  --bg-deep  --card  --panel
文字     --fg  --fg-bright  --fg-dim  --muted  --placeholder
描边     --border
强调     --accent  --accent-2  --accent-3  --accent-bright  --string
控件     --code-bg  --input-bg  --btn-fg
派生     --glow  --glow-2                     （color-mix 出来，跟着 accent 走）
装饰     --scanline  --zebra  --shadow-soft  --shadow-strong
尺寸     --ctl-h(26px)   --font-mono
滚动条   --sb-slot  --sb-w  --sb-w-active  --sb-thumb  --sb-thumb-active  --sb-tick
版面     --shell(1160px)  --gutter(96px)  --rail(236px)  --measure(34em)  --rule  （定义在 redesign.css）
```

**没有全局的动效 token**（`--dur` / `--ease` 都不存在），过渡时长与缓动直接写在各条规则里
（常见 `0.16s` / `0.18s` + `cubic-bezier(.22,.61,.36,1)`）。改节奏时要一处一处改，别指望一个变量。

**不要在组件里写死颜色**，一律用 `var(--accent)` 这类；否则新增主题时会漏掉。

### 9.3 六套主题

`<html data-theme="...">` 切换，定义在 `lib/theme.ts`：

| id | 名称 | 主色 | 备注 |
|---|---|---|---|
| `cyber` | 赛博青 | `#00f0ff` / `#ff2a6d` | 默认 |
| `indigo` | 午夜靛 | `#7aa2ff` / `#c084fc` | |
| `ember` | 余烬橙 | `#ff9f45` / `#ff5c8a` | |
| `forest` | 苔原绿 | `#3ddc97` / `#ffd166` | |
| `sakura` | 樱雾粉 | `#ff7ac6` / `#8b5cf6` | |
| `daylight` | 晨光白 | `#0a6f92` / `#c0246a` | 唯一亮色；accent 压深保证对比度 ≥ 4.5:1，glow/shadow/scanline 整体减弱 |

亮色主题要额外照顾原生控件：`.sheet--scroll` 声明 `color-scheme: dark`，
`[data-theme="daylight"] .sheet--scroll` 切成 `light`，否则滚动条兜底层、输入框、
`date` 控件在浅底上还是深色。

首屏防闪烁：`app/layout.tsx` 用 `next/script` 的 `beforeInteractive` 在 `<head>` 里同步决定主题
（先读 `localStorage.theme`，没有则跟随 `prefers-color-scheme`，浅色偏好 → `daylight`），
同一段脚本还负责给欢迎页加 `js-ready` 门控（JS 没跑起来 2.5 秒后自动摘掉，避免内容被永久藏住）。
`<html>` 上有 `suppressHydrationWarning`，因为服务端不知道客户端最终主题。

### 9.4 字体

无 Web 字体、无本地字体文件，纯系统栈：

```css
/* 正文（body） */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC",
             "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;

/* 等宽（token） */
--font-mono: "Share Tech Mono", "Cascadia Code", "JetBrains Mono", Consolas,
             "SF Mono", Menlo, monospace;
```

注意 `Share Tech Mono` 并没有被加载（没有 `@font-face`、也没用 `next/font`），
实际命中后面的系统字体，属于「理想字体写在前面、缺了自动回退」的写法。

「两把嗓子」是这套视觉的核心：等宽体说机器的部分（品牌、日期、标签、计数、代码），
无衬线说人的部分（标题、正文）。

### 9.5 断点

| 断点 | 用途 |
|---|---|
| `max-width: 1080px` | 双栏收窄 |
| `max-width: 1024px` | 后台侧栏 |
| `max-width: 980px` / `min-width: 981px` | 欢迎页环形导航：宽屏用 3D 斜环，窄屏用紧凑环（半径按舞台宽收口） |
| `max-width: 900px` | 列表/文章的单列化 |
| `max-width: 720px` | 主移动端断点（页头、列表、文章、编辑器） |
| `max-width: 560px` | 超窄屏细节 |
| `hover: none` | 触屏：关闭指针跟随、**不接管滚动条** |
| `prefers-reduced-motion: reduce` | 关动效、关走线 |
| `print` | 打印：强制恢复 `body` 高度与 `overflow`，否则只能打印一屏 |

移动端有历史坑：`.entry.has-cover` 的 `grid-template-areas` 特异性比 `.entry` 高，
在 720px 断点里只改 `.entry` 会被 900px 的规则盖掉（日期列被压成 0 宽、压到标题上）。
窄屏规则要**重写 `grid-template-areas`**，而不是只改列宽。

### 9.6 动效

- GSAP 只用在这四个地方：`GsapReveal`（区块依次淡入，`[data-reveal]` + stagger 0.08）、
  `WelcomeMotion`、`WelcomeOrbit`、`AuthPanel`。**全仓没有 ScrollTrigger 引用**——
  滚动相关的视觉全部是 CSS 变量 + `transform`，滚动帧里不做 GSAP 动画。
- 所有动效都有 `prefers-reduced-motion` 分支；欢迎页的入场元素由 `html.js-ready` 门控，
  减少动效时直接给最终态（双保险，防止 GSAP 分支没跑到导致内容藏住）。
- 触屏（`hover: none`）关闭跟随光标的拖尾层。

---

## 10. 滚动体系

这是全站最容易被改坏的部分，单独成节。

### 10.1 为什么搞这么复杂

浏览器给 document 画的滚动条**没有任何 API 能改外观**。要让全站滚动条风格统一（8px 轨道、
2px 滑块、悬停加宽、滚动时发光），只能让 `body` 不滚，把滚动搬进自己可控的容器，
再用 OverlayScrollbars 接管。代价是 `window.scrollY` 恒为 0 —— 这一点下面所有坑都源于它。

### 10.2 三层结构

```
body { height: 100dvh; overflow: hidden }
└─ #app-scroll            .sb.app-scroll        [data-scroll-root]   ← 页面级滚动
   └─ [data-overlayscrollbars-viewport]                              ← 真正滚动的元素（库造的）
      └─ .sb-content.app-scroll-content                              ← flex column, min-height:100%
         └─ header / main / footer
```

`/blog` 页在此基础上再多一层：

```
.sheet--scroll  （height 链路：body:has(.sheet--scroll) .app-scroll-content { height:100% }）
└─ .ledger      [data-scroll-pane]  ← ScrollArea host，列表自己滚
   └─ .sb-content > .entry × N
```

### 10.3 相关文件

| 文件 | 职责 |
|---|---|
| `components/ui/ScrollArea.tsx` | 通用滚动容器：初始化 OverlayScrollbars、补 ARIA、滚动/拖拽状态标记、`ResizeObserver → instance.update(true)` |
| `components/ui/RootScroll.tsx` | 根滚动层：hash 锚点补跳（立即 + 300ms）、前进后退位置恢复（`sessionStorage` 按路径存，rAF 轮询最多 30 次） |
| `components/blog/ListScrollPane.tsx` | 列表：写 `--p` 给左缘走线、按 25% 阅读线切 `data-read`、`NN / MM` 读数、后退恢复位置 |
| `components/blog/PostOutline.tsx` | 文章页大纲：扫描 `.prose h2/h3` 的 id、sticky 吸附、滚动高亮、点击跳转（落点校正 + 写 hash + 移焦点）；自身溢出时再套一层 `ScrollArea` |
| `lib/scroll-pane.ts` | `currentScrollPane()`：列表面板 → 根容器 → `window` 的解析顺序，每一层都解到 viewport |

### 10.4 使用约定

```tsx
// 页面级/局部滚动容器一律用这个，不要手写 overflow: auto
<ScrollArea axis="y" className="host" contentClassName="host-body" role="region" ariaLabel="…">
  {children}
</ScrollArea>
```

- `ScrollArea` 的 props：`axis`(`y|x|both`)、`autoHide`、`hostRef`、`style`、`id`、`role`、`tabIndex`、
  `ariaLabel`、`dataPane`、`overlay`（浮层，库初始化后才挂，否则会被一起卷走）。
- **DOM 契约**：React 只持有 `.sb-content` 这一层，库初始化时把它整体搬进
  `[data-overlayscrollbars-viewport]`。所以不要再往 host 里塞兄弟节点，也不要假设
  content 的父节点是 host。
- 要读滚动位置：**永远用 `currentScrollPane()` / `paneScrollMetrics()`**，不要 `window.scrollY`，
  也不要直接查 `.app-scroll`（滚的是里面的 viewport）。
- 触屏（`hover: none`）上长滚区域保持系统滚动：`ScrollArea` 会直接跳过初始化，
  此时 `.sb:not([data-overlayscrollbars]) { overflow-y: auto }` 兜底；
  依赖库的增强（走线、读数）在触屏上不生效。
- 整个体系**不靠 `position: fixed`**，高度链是 `height:100dvh` → `flex:1 + min-height:0`
  一路收下来的，所以无 JS 时链条仍然成立（只是没有自绘滚动条）。
- 文章页左侧大纲（`PostOutline`）是这套体系的第三种用法：外层绝对定位到 `.article-shell`
  的左外侧，内层 `position: sticky; top: 84px`（页头 60 + 边框 1 + 呼吸 23）吸附在根滚动层里，
  自身溢出时再套一层 `ScrollArea` 并加 `overscroll-behavior: contain`。
  它**不占正文的位置**——`.article-shell` 的宽度、居中方式、padding 都没变，
  所以正文左缘在有无大纲时像素级相同（实测 290px / 290px）。

### 10.5 踩过的坑

| 症状 | 原因 | 处理 |
|---|---|---|
| 自定义 `elements.viewport` 后完全不滚 | 自己给的 viewport 变成 `height:auto` | 用库默认 elements + 自己的 `.sb-content` 包裹层 |
| `/blog` 整页多滚 31px | `.sb-content` 的 `min-height:100%` 与列表高度叠加 | `body:has(.sheet--scroll) .app-scroll-content { height:100%; min-height:0 }` |
| 后台页面底部被裁 33–98px | 库缓存了「没有溢出」，内容异步长高后没重算 | `ResizeObserver` → `instance.update(true)`（60ms 防抖） |
| `::-webkit-scrollbar` 出现 ▲▼ 箭头 | Chrome 一旦自定义 webkit 滑块就退回经典模式 | 放弃该方案，改用 OverlayScrollbars |
| 锚点跳转失效 | document 不再滚 | `RootScroll` 自己算 `getBoundingClientRect` 差值 |
| 点锚点后标题被页头压住 / 落点越滚越偏 | 跳转路径上的图片是懒加载，动画期间陆续落位把目标顶下去；`focus()` 在目标还不可见时可能无视 `preventScroll` 自行滚到页顶 | 跳转后 rAF 轮询到滚动停稳，隔 200ms 重算落点校正一次（`behavior:"auto"`），**然后**再把焦点交给标题；用户中途滚轮/触摸则放弃校正 |
| 打印只有一屏 | `body` 被固定成 100dvh + `overflow:hidden` | `@media print` 用 `!important` 把容器全部放开为 `height:auto; overflow:visible` |

---

## 11. 内容链路

### 11.1 写作台（`components/admin/PostEditor.tsx`）

一个 700+ 行的客户端组件，承担：标题/slug/摘要/封面/标签/发布状态、Markdown 编辑、
实时预览、全屏写作（原生 `requestFullscreen` + 站内回退）、导入 `.md`、AI 生成摘要与标签。

- **标签只能选，不能建**：chips + Radix `DropdownMenu` 的 `CheckboxItem` 多选，
  旁边一个「管理标签 →」跳到 `/admin/tags`。没有自由输入框。
- 预览区是独立的 `ScrollArea`，自己滚，不带动整页。
- slug 在新建时跟随标题自动生成，手动改过之后就不再跟随。
- 导入 `.md`（`lib/markdown-import.ts`）：支持 front-matter 的 `title` / `slug` /
  `excerpt|description|summary` / `tags|tag`；没有 title 时取第一行的 `# 标题`。
  编辑器已有内容时先弹确认，支持「替换」与「追加」两种策略。

### 11.2 Markdown 渲染（`components/Markdown.tsx`）

```
react-markdown + remark-gfm + remark-breaks
  → rehype-slug（标题 id，供锚点）
  → rehype-autolink-headings（标题后 # 链接）
  → rehype-external-links（外链 target=_blank + rel=noopener）
  → rehype-highlight（服务端高亮）
  → 自定义 pre → CodeBlock（语言标注 + 横向 ScrollArea + 复制）
```

⚠️ unified 的 `.use()` 只能接收「插件函数」或 `[函数, options]`。
直接传**已经实例化的插件**会在 freeze 阶段被无参调用而 500 —— 这条踩过一次，
`scripts/md-test2.mjs` 就是当时定位问题的独立复现脚本，别删。

### 11.3 标签是受控词表

这是刻意的产品约束（为了让站上不出现 typo 标签）：

| 入口 | 行为 |
|---|---|
| 编辑器 | 只能勾选已有标签 |
| `POST/PUT /api/posts` | `resolveTagRefs()` 精确匹配；有一个不存在就整体拒绝，400「标签「X」不存在，请先在后台「标签」里新建」 |
| AI 摘要 | prompt 里给白名单，返回后再按白名单过滤（大小写归一），空白名单返回 `[]` |
| 新建标签 | 只能走 `/admin/tags`（`POST /api/tags`） |

校验规则（`lib/tags.ts`）：名称 ≤32 码点、slug ≤64 字符、名称大小写不同视为重复、
slug 与「所有 slug + 所有 aliases」共用一个命名空间。

### 11.4 图片

```
浏览器选图 → POST /api/upload (formData: file, kind)
   → 校验：≤5MB，JPG/PNG/WebP/GIF
   → sha256(buf) → key = "img/<hash>.<ext>"
   → objectExists(key)？命中则跳过上传，deduped: true
   → 返回 { url: "/img/<hash>.<ext>", key, kind, deduped }
页面渲染 → <img src="/img/…"> → /img/[key] 代理读 OSS → 一年 immutable 缓存
```

- 头像与封面共用一个命名空间，同一张图只存一份。
- **页面里绝不出现 OSS 直链**：桶名、地域、哈希构成的直链只走服务端，
  渲染时 `toSiteImageUrl()` 还会把历史数据里的 `*.aliyuncs.com/img/*` 改写成 `/img/*`
  （只认 `img/` 前缀，别人的图床外链原样保留）。
- 未配置 OSS 时上传接口直接 503 并列出缺哪几个变量，页面照原样显示；仍可手填外链。

### 11.5 邮箱验证码

规则（`lib/verification.ts`）：

| 项 | 值 |
|---|---|
| 长度/字符 | 6 位数字 |
| 有效期 | 10 分钟 |
| 尝试次数 | 5 次，超了删记录 |
| 同邮箱冷却 | 60 秒 |
| 同邮箱上限 | 5 封/小时 |
| 同 IP 上限 | 10 封/小时 |
| 存储 | `sha256(code:AUTH_SECRET:email:purpose)`，不存明文 |
| 一次性 | 校验成功立刻删除记录 |

发信失败会把刚建的记录作废（`revokeCode`），不留下「看起来发出去了」的码。
邮件正文刻意不放链接（个人邮箱 SMTP 带链接更容易进垃圾箱）。

### 11.6 AI 摘要

`POST /api/ai/summarize`：拿标题 + 正文（截前 8000 字）+ 已选标签 + 全站标签白名单，
调 OpenAI 兼容的 `/chat/completions`（`temperature: 0.3`），返回 `{ excerpt(≤300 字), tags[] }`。
限流是进程内 `Map<userId, timestamps[]>`，10 次/分钟——单实例部署够用，多实例会各算各的。

前端失败只提示、不阻断编辑与保存；成功才覆盖摘要与标签。

---

## 12. 部署与 CI/CD

### 12.1 镜像构建（`Dockerfile`）

三段构建：

```
base    node:22-alpine + libc6-compat + openssl
deps    COPY package*.json → npm ci
builder 装 postgresql → initdb 到 /tmp/pgdata → createdb → prisma migrate deploy
        → prisma generate → next build（全程用临时库，构建不依赖外部 DB）
runner  COPY node_modules / .next / public / prisma
        CMD: prisma migrate deploy → prisma db seed → npm run start
```

关键点：

- 构建期必须有一个**空的 PostgreSQL**，因为 `next build` 要预渲染。这也正是 5.2 里
  「数据页面全部 `force-dynamic`」的根因。
- 容器启动时自动迁移 + seed，所以 seed 必须幂等。
- `CMD` 用 `exec npm run start`，让 npm 成为 1 号进程，`docker stop` 才能优雅退出。

### 12.2 Compose

```yaml
services:
  db:   postgres:16-alpine，pgdata 卷，pg_isready 健康检查
  app:  build . ；env_file .env；DATABASE_URL 用服务名 db 覆盖；
        depends_on db: service_healthy；ports "127.0.0.1:3000:3000"
```

宿主端口只绑 `127.0.0.1`，对外由 Nginx 反代（`deploy/nginx.conf`，含 gzip、
`/_next/static` 长缓存、`client_max_body_size 10m`）。

### 12.3 GitHub Actions（`.github/workflows/ci-cd.yml`）

```
push master / 手动触发
  │
  ├─ ci   ubuntu + Node 22：npm ci → prisma generate → tsc --noEmit
  │
  └─ deploy（needs: ci）
       Secrets 自检（只打印长度，不打印值）
       → 网络连通性检查（DNS + TCP）
       → 私钥落盘并去掉 CRLF
       → SSH：git fetch/checkout/reset --hard origin/master
              → docker compose up -d --build --remove-orphans
              → curl /api/auth/session 轮询 40 次×3s 做健康检查
              → 失败则 docker compose logs --tail=100 app 并让流水线红
```

需要的 Secrets：`SSH_HOST`（必须是公网 IP）、`SSH_USER`、`SSH_KEY`（无 passphrase）、
`SSH_PORT`（可选）、`DEPLOY_PATH`。

服务器上**不要手改代码**，流水线 `git reset --hard` 会全部覆盖；`.env` 在 `.gitignore`
和 `.dockerignore` 里，不会被覆盖也不会进镜像。

回滚：服务器上 `git reset --hard <上一个可用提交> && docker compose up -d --build`，
或在 GitHub 上 Revert 后重新 push。数据库迁移均为加列/加枚举，向后兼容。

---

## 13. OpenSpec 工作流

项目用 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 的 spec-driven 流程管需求：
先出提案（proposal / design / specs delta / tasks），再按 tasks 逐条实施，完成后归档。

```
openspec/
  config.yaml               schema: spec-driven
  changes/                  进行中（或已完成但未归档）的变更
    <change-name>/
      proposal.md           为什么做、做什么、不做什么
      design.md             技术决策与取舍
      specs/<capability>/spec.md   delta 规格（ADDED/MODIFIED 需求）
      tasks.md              可勾选的任务清单
  changes/archive/          已归档的变更（目录名前缀日期）
  specs/                    主规格（归档时同步进来）
```

常用命令（配合 skill 使用）：

| 命令 | 作用 |
|---|---|
| `/openspec-propose` | 一次生成 proposal + design + specs + tasks |
| `/openspec-apply-change` | 按 tasks 实施并勾选 |
| `/openspec-update-change` | 修订已存在的提案 |
| `/openspec-sync-specs` | 把 delta 规格同步进主 specs |
| `/openspec-archive-change` | 归档完成变更 |
| `openspec validate --strict` | 校验格式 |

已完成但**尚未归档**的变更：`add-editor-fullscreen`、`add-email-verification`、
`add-markdown-import`、`add-orbit-pointer-interaction`、`add-tag-management`、
`add-welcome-auth-panel`、`add-welcome-motion`、`add-welcome-orbit`、`add-welcome-page`、
`fix-blog-list-scroll`、`overhaul-scroll-ui`、`refine-brand-and-light-theme`
（tasks 全部完成，`openspec/specs/` 里只同步了 `auth-affordance`、`feedback-dialogs`、`markdown-render` 三个）。

---

## 14. 开发约定

### 14.1 版本与依赖

- **`next` 必须钉住 16.4.2**。`pnpm add` 任何包都可能顺手动它，升到别的 16.x 曾导致
  水合失败与 `Could not find the Next.js package`。每次装完依赖先 `git diff package.json`。
- `nodemailer` 不能超过 8（next-auth peer 依赖）。
- `@radix-ui/themes`（3.3.0）已安装但**代码里没有任何引用**，可以直接删。
- 装完依赖必须重启 `next dev`，否则会 `Can't resolve 'radix-ui'` 之类的假错。

### 14.2 代码风格

- 注释写「为什么」，不写「做了什么」；中文注释是既有风格，保持一致。
- 服务端组件默认；需要 hook / 事件 / DOM 才加 `"use client"`。
- 数据查询放服务端组件里直读 Prisma；只有写操作和客户端增量数据才开接口。
- 错误信息面向用户、中文、可直接展示；内部异常不要漏到响应里。
- 颜色/间距一律用 token，不要在组件里硬编码色值。

### 14.3 验证方式

改完必跑：

```bash
npx tsc --noEmit     # 类型
pnpm build           # 生产构建（顺带暴露 RSC/边界问题）
```

改了 UI 的话，除了看截图，还要**量真实数值**：computed style、`getBoundingClientRect`、
真实 HTTP 状态码（用 Node `fetch` 带 cookie jar，别用 `curl -d` 拼 JSON——在这个 Windows 环境下不可靠）。
这次迭代里「看起来对」和「实际对」差过好几次（日期列 0 宽、页面多滚 31px、后台裁 98px）。

### 14.4 本机沙箱注意

在 DSH 沙箱里跑 `next build` / `pnpm` / `prisma` / `tsx` 会因 `spawn EPERM` 失败，
需要一次性提权（`danger-full-access`）执行**同一条**命令。

`prisma migrate dev` / `prisma generate` 还会被正在运行的 `next dev` 锁住
`query_engine-windows.dll.node`，先停开发服务器再跑。

`next build` 若报 `EPERM … unlink .next/node_modules/@prisma/client-…`，是 pnpm 的陈旧 junction，
`Remove-Item .next -Recurse -Force` 后重跑即可。

用 PowerShell 改中文文件**绝不能用 `Set-Content`**（会写成非 UTF-8 造成乱码），
用编辑工具或 `Out-File -Encoding utf8`。

---

## 15. 排障速查

| 现象 | 先查什么 |
|---|---|
| 前台列表空了 / 文章数永远是 0 | 页面是不是被预渲染了（缺 `force-dynamic`）；`next build` 期间数据库是不是空库 |
| 页面底部被裁、滚不到底 | 滚动容器的 `instance.update(true)` 是否触发；`ResizeObserver` 有没有观察到内容层 |
| 滚动条又变回系统样式 | `ScrollArea` 没初始化（触屏？JS 报错？）；`.sb:not([data-overlayscrollbars])` 兜底生效了 |
| `floor window.scrollY` 一直是 0 | 正常现象，用 `currentScrollPane()` |
| 中文 slug 页面 404 | 页面入口漏了 `decodeSlugParam()` |
| 标签改名后旧链接 500 | `permanentRedirect` 的地址没 `encodeURIComponent` |
| 上传图片 503 | `.env` 缺 OSS 四项；接口响应里会点名缺哪些 |
| 注册/补绑邮箱 503 | SMTP 未配置；端口必须是 465 或 587（阿里云 ECS 封禁 25 出口） |
| 头像存上了但页头不更新 | 头像由 `/api/me` 取，不走 JWT；确认请求没被缓存（该路由是 `force-dynamic`） |
| 后台某页白屏且 403 | 当前账号 `role` 不是 ADMIN；JWT 里 role 是登录时写入的，改库后要重新登录 |
| Prisma 报「未知字段 views」 | 跑过 `prisma generate` 之后忘了重启 dev server |
| 流水线卡在健康检查 | 容器日志 `docker compose logs --tail=100 app`：迁移失败？seed 失败？端口没起来？ |

---

## 16. 已知问题与待办

**技术债 / 不一致**

1. `README.md` 的「技术栈」仍写 5 套主题（实际 6 套，含 `daylight`）、也没提标签管理、
   验证码、滚动条改造。README 停留在较早的版本，本文档与代码为准。
2. `@radix-ui/themes` 装了没用（全仓 0 处 import）。
3. `components/welcome/WelcomeOrbit.tsx` 第 7 行有一句
   `import { url } from "node:inspector";`——客户端组件里引 Node 内置模块且**完全没用到**，
   属于误粘贴，应当删掉（目前构建能过，但没有理由留着）。
4. `components/BrandMark.tsx` 全仓无引用（死代码）；`--serif` 定义了也没有任何 `var(--serif)`。
5. `/tags/[slug]` 的页面里写了 `data-reveal`，但没套 `GsapReveal`，
   所以那几块内容不会有入场动画——要么补组件，要么删属性。
6. `init.sql` 与当前 schema 不同步（见 7.2），建议删除或标注废弃。
7. `viewportOf()` 有两份实现（`lib/scroll-pane.ts` 与 `components/ui/ScrollArea.tsx`），
   建议统一从 `lib` 导出。
8. `/api/me/email` 与 `/api/profile` 都能改邮箱，两条路径校验口径不同
   （前者强制验证码，后者只做格式与唯一性），需要收敛。
9. `DELETE /api/posts/[id]`、`DELETE/PATCH /api/comments/[id]` 没捕获 `P2025`，
   删不存在的记录会 500 而不是 404。
10. AI 摘要限流是进程内 Map，多实例部署会失效。
11. 12 个 OpenSpec 变更已完成但未归档，主 specs 里只有 3 个能力，建议批量
    `openspec archive` + `sync`，让 specs 反映现状。

**待验证**

- 真机（iOS Safari / Android Chrome）滚动体验：触屏上走线、读数、位置恢复都不生效，
  需要确认是否为可接受降级。
- `/` 欢迎页在 390px 超窄屏的逐块核对（文案换行、按钮、统计行）。
- 首屏性能（欢迎页 GSAP + 粒子 + 3D 环）还没做过 Performance 面板分析。