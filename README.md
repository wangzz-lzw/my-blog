# my-blog

基于 Next.js + TypeScript + Prisma + PostgreSQL 的个人博客。支持前台文章浏览/评论、后台 Markdown 写作与管理，可自建服务器 Docker 部署。

## 技术栈

- **框架**：Next.js 16（App Router）+ React 19
- **语言**：TypeScript（严格模式）
- **ORM**：Prisma 6 + PostgreSQL
- **认证**：NextAuth.js v5（Credentials 邮箱密码 + JWT）
- **渲染**：ReactMarkdown（正文 Markdown）
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

管理员账号来自 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`（默认 `admin@example.com` / `Change_Me_12345`，请修改）。后台入口 `/admin`。

常用脚本：
- `npm run build` / `npm start`：生产构建与启动
- `npm run prisma:deploy`：仅执行迁移（生产用）
- `npm run prisma:generate`：重新生成 client

## 自建服务器部署

服务器需安装 Docker、Docker Compose、Nginx。

1. 上传项目到服务器（`scp -r` 或 git clone），进入目录。
2. 配置 `.env`：

   ```bash
   cp .env.example .env
   # 必须修改：
   AUTH_SECRET=$(openssl rand -base64 32)
   AUTH_URL="https://你的域名"
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
