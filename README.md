# my-blog

基于 Next.js + TypeScript + Prisma + PostgreSQL 的个人博客。支持前台文章浏览/评论、后台 Markdown 写作与管理，可自建服务器 Docker 部署。

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19
- **语言**：TypeScript（严格模式）
- **ORM**：Prisma 6 + PostgreSQL
- **认证**：NextAuth.js v5（Credentials 用户名/邮箱 + 密码 + JWT）
- **账号**：开放注册（读者角色）、个人资料页 `/profile`（头像上传/链接、昵称、改密码）
- **渲染**：ReactMarkdown（正文 Markdown，服务端高亮）
- **主题**：5 套配色（赛博青 / 午夜靛 / 余烬橙 / 苔原绿 / 樱雾粉），页头切换、localStorage 记忆
- **部署**：Docker Compose + Nginx 反向代理

## 目录结构

```
app/
  page.tsx              前台首页（文章列表，ISR）
  posts/[slug]/         文章详情 + 评论
  tags/                 标签归档
  login/                后台登录页
  admin/                后台（布局鉴权、仪表盘、文章管理、评论管理）
  api/                  auth、posts、comments 接口
components/             评论表单、文章编辑器
lib/                    prisma 单例、密码、slug、日期、类型
prisma/                 schema.prisma、迁移、seed.ts
deploy/nginx.conf       Nginx 反代配置示例
Dockerfile / docker-compose.yml
```

## 本地开发

前置：Node 20+，本机已有 PostgreSQL（端口 5432）并创建了 `blog` 库/用户。

```bash
npm install
npx prisma migrate dev     # 建表
npx prisma db seed         # 创建管理员 + 示例文章（首次）
npm run dev                # http://localhost:3000
```

管理员账号来自 `.env` 的 `ADMIN_USERNAME` / `ADMIN_PASSWORD`（默认 `admin` / `wzz43441630`，请务必修改）。后台入口 `/admin`，登录支持「用户名或邮箱」。

访客可在 `/register` 注册普通账号（`READER` 角色）：注册后能评论，但不能进入后台或调用管理接口。

常用脚本：
- `npm run build` / `npm start`：生产构建与启动
- `npm run prisma:deploy`：仅执行迁移（生产用）
- `npm run prisma:generate`：重新生成 client

## 图片存储（阿里云 OSS）

头像与文章封面都上传到阿里云 OSS，配置在 `.env`：

```bash
OSS_REGION="oss-cn-hangzhou"        # Bucket 所在地域，必须与 Bucket 一致
OSS_BUCKET="lzw-personal-chief"
OSS_ACCESS_KEY_ID="你的 AccessKeyId"
OSS_ACCESS_KEY_SECRET="你的 AccessKeySecret"
# 可选：
OSS_ENDPOINT=""                      # 自定义 endpoint（一般留空）
OSS_PUBLIC_BASE_URL=""               # CDN/自定义域名；留空用默认 bucket 域名
OSS_ACL="public-read"                # 单对象读权限；Bucket 私有读时改为 private
```

- 上传接口：`POST /api/upload`（需登录）字段 `file` + `kind=avatar|cover`
- **内容去重**：对象 key = `img/<sha256>.<ext>`，同一张图（字节相同）重复上传会命中已有对象，接口返回 `deduped: true`，不会产生重复文件；头像与封面共用同一命名空间
- 页面入口：个人资料页「上传图片」、后台写文章「封面图 → 上传」
- 未配置 OSS 时接口返回 503 并提示缺失的变量，页面会直接显示该提示；仍可手工填写图片外链


## 自建服务器部署

服务器需安装 Docker、Docker Compose、Nginx。

1. 上传项目到服务器（`scp -r` 或 git clone），进入目录。
2. 配置 `.env`：

   ```bash
   cp .env.example .env
   # 必须修改：
   AUTH_SECRET=$(openssl rand -base64 32)
   AUTH_URL="https://你的域名"
   ADMIN_USERNAME="admin"
   ADMIN_PASSWORD="强密码"
   ```

3. 启动：

   ```bash
   docker compose up -d --build
   ```

   首次启动会自动执行 `prisma migrate deploy` 建表并写入种子（管理员 + 示例文章）。

4. 配置 Nginx：把 `deploy/nginx.conf` 里的 `server_name` 改成你的域名，放入 `/etc/nginx/conf.d/` 后 `nginx -s reload`。

5. 访问 `http://你的域名`，后台 `/admin`。

> 生产环境请给 Nginx 配置 HTTPS（如 certbot），并将 `AUTH_URL` 设为 https 域名。
