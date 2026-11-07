# my-blog

基于 Next.js + TypeScript + Prisma + PostgreSQL 的个人博客。支持前台文章浏览/评论、后台 Markdown 写作与管理，可自建服务器 Docker 部署。

> 开发细节（架构分层、接口清单、样式与主题 token、滚动体系、排障速查）见 **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**。

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


## 邮箱验证码（注册 / 补绑邮箱）

注册必须填写**真实邮箱**并输入 6 位验证码；老账号（无邮箱）仍可用用户名密码登录，登录后可在个人资料页补绑。

发信走个人邮箱的 SMTP，配置在 `.env`（**必须 465 或 587**，阿里云 ECS 默认封禁出网 25 端口）：

```bash
SMTP_HOST="smtp.qq.com"     # 163 用 smtp.163.com
SMTP_PORT="465"
SMTP_SECURE="true"          # 465 → true；587 → false（STARTTLS）
SMTP_USER="你的邮箱@qq.com"
SMTP_PASS="SMTP 授权码"      # 注意：不是登录密码，在邮箱设置里开启 SMTP 服务后生成
SMTP_FROM="你的邮箱@qq.com"  # 留空则用 SMTP_USER
```

- 发码接口：`POST /api/auth/email-code`，入参 `{ email, purpose: "register" | "bind" }`
- 验证码 6 位、**10 分钟**有效、一次性、最多试 5 次；库里只存 sha256 哈希
- 限流：同邮箱 60 秒冷却 + 每小时 5 封；同 IP 每小时 10 封
- 未配置 SMTP 时接口返回 503「邮件服务未配置」，不会留下无效的验证码记录
- 换用其它服务商（如阿里云 DirectMail）只需改这几个变量，代码不用动（`lib/mail.ts` 是唯一出口）


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

## CI/CD 流水线（GitHub Actions）

推送到 `master` 自动执行：**静态检查 → SSH 到服务器拉代码 → Docker 重建 → 健康检查**。
工作流文件：`.github/workflows/ci-cd.yml`。

```
push master
   │
   ├─ ci  (ubuntu, Node 22)
   │    npm ci → prisma generate → tsc --noEmit
   │
   └─ deploy (needs: ci)
        SSH: cd 部署目录 → git fetch/checkout master → docker compose up -d --build
              → curl /api/auth/session 轮询健康检查（失败则打印日志并让流水线失败）
```

### 1. 服务器准备（一次性）

```bash
# 所需：git、docker、docker compose v2
git clone https://github.com/wangzz-lzw/my-blog.git /opt/my-blog
cd /opt/my-blog
cp .env.example .env && vi .env          # 填 AUTH_SECRET / AUTH_URL / ADMIN_* / OSS_* 等
docker compose up -d --build             # 首次手动起一次，确认可访问
```

之后服务器上**不要**再手动改代码，一切由流水线 `git reset --hard origin/master` 覆盖。
`.env` 在 `.gitignore` 和 `.dockerignore` 里，不会被覆盖或打进镜像。

### 2. 配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions → New repository secret：

| Secret | 说明 | 示例 |
|---|---|---|
| `SSH_HOST` | 服务器 IP / 域名 | `1.2.3.4` |
| `SSH_USER` | SSH 用户（建议非 root） | `deploy` |
| `SSH_KEY` | 该用户私钥全文（`-----BEGIN OPENSSH PRIVATE KEY-----`，无 passphrase） | |
| `SSH_PORT` | 可选，默认 22 | `22` |
| `DEPLOY_PATH` | 服务器上的项目目录 | `/opt/my-blog` |

SSH 公钥需追加到服务器 `~/.ssh/authorized_keys`；该用户要有 `docker` 权限（`usermod -aG docker deploy`）。

### 3. 使用

```bash
git push origin master      # 触发 ci → deploy
```

也可以在 GitHub → Actions →「CI / CD」→ Run workflow 手动触发。
部署失败时流水线会在最后打印 `docker compose logs --tail=100 app`。

### 4. 回滚

```bash
# 方案 A：在服务器上回退代码后手动重建
ssh deploy@server
cd /opt/my-blog && git log --oneline -5
git reset --hard <上一个可用提交> && docker compose up -d --build

# 方案 B：在 GitHub 上 Revert 那次提交，再 push（流水线自动重新部署）
```

数据库迁移是单向的：回滚代码前请确认对应迁移不需要回退（本次项目的迁移均为加列/加枚举值，向后兼容）。

### 可选：推镜像到仓库而不是在服务器构建

服务器性能弱时，可改为「CI 构建镜像 → 推送 GHCR/ACR → 服务器 pull」：
在 `ci` 里加 `docker/build-push-action` 推 `ghcr.io/<owner>/my-blog:latest`，
`deploy` 步骤改为 `docker compose pull && docker compose up -d`，
并把 `docker-compose.yml` 的 `build: .` 换成 `image: ghcr.io/<owner>/my-blog:latest`。
GHCR 私有镜像拉取需在服务器 `docker login ghcr.io`（PAT 带 `read:packages`），阿里云 ACR 同理。

