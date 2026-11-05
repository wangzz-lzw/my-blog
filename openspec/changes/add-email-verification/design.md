# Design

## Context

核对过现状：

- `prisma/schema.prisma`：`User.email String? @unique`，没有验证标记字段；`passwordHash` 必填；`role` 默认 `READER`。
- `auth.ts`：只有一个 Credentials provider，支持 `username` 或 `email` + 密码；session 走 JWT。本变更**不动**这里。
- `app/api/register/route.ts`：`username` 必填、`password` ≥ 8 位、`email` **选填**且仅做正则校验，创建时 `email: email ?? null`。
- `components/auth/RegisterFields.tsx`：三个字段（用户名 / 邮箱选填 / 密码 / 确认密码），提交 `POST /api/register` 后自动登录。
- 没有任何发信依赖与环境变量；服务器是阿里云 ECS，Docker 部署，`Dockerfile` 用 `npm ci`（依赖 `package-lock.json`），本地开发用 pnpm（`pnpm-lock.yaml`）。

## 实现决策

### D1. 数据模型：单独一张验证码表

```prisma
model EmailCode {
  id        String   @id @default(cuid())
  email     String                     // 统一小写
  purpose   String                     // "register" | "bind"
  codeHash  String                     // sha256(code + AUTH_SECRET)，不存明文
  attempts  Int      @default(0)
  ip        String?
  createdAt DateTime @default(now())
  expiresAt DateTime

  @@index([email, purpose, createdAt])
  @@index([ip, createdAt])
}
```

- **不进 `User`**：验证码是一次性的短命数据，跟账号生命周期无关；`User` 也不加 `emailVerifiedAt`——邮箱只有在验证通过后才会被写入，所以"有邮箱"本身即等于"已验证"，多一列只会多一个可能不一致的状态。
- 每次发码前顺手 `deleteMany({ expiresAt: { lt: now } })`，不做定时任务也有基本清理。

### D2. 验证码生成与校验（`lib/verification.ts`）

- 生成：`crypto.randomInt(0, 1_000_000)` 补零成 6 位。
- 存储：`sha256(code + AUTH_SECRET + email + purpose)` —— 加盐用已有的 `AUTH_SECRET`，不引入新密钥。
- 校验顺序：查该邮箱+用途下**最新**未过期记录 → 不存在则"请重新获取" → 过期则"已过期" → `attempts >= 5` 则"尝试次数过多" → 比对哈希 → 不匹配则 `attempts++` 并返回"验证码不正确" → 匹配则删除记录（一次性）。
- 比对用 `crypto.timingSafeEqual`（等长后比较）。

### D3. 限流（同表查询，不引 Redis）

| 维度 | 规则 | 实现 |
| --- | --- | --- |
| 同邮箱冷却 | 60 秒 | 查该 email 最近一条记录，`createdAt` 距今 < 60s → 429，返回剩余秒数 |
| 同邮箱每小时 | 5 次 | `count(email, createdAt > now-1h)` |
| 同 IP 每小时 | 10 次 | `count(ip, createdAt > now-1h)`，IP 取自 `x-forwarded-for` 首段 |

个人博客体量用数据库计数完全够；引 Redis 是过度设计。**取 IP 只用于限流，不持久化用途**，且不进任何响应。

### D4. 发信（`lib/mail.ts`）

- `nodemailer` 单例 transport，配置来自 `SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS / SMTP_FROM`。
- QQ 邮箱：`smtp.qq.com` + 465（SSL）+ 授权码（不是登录密码）；163：`smtp.163.com` + 465。
- **必须用 465/587 而不是 25**：ECS 出网 25 端口默认被封。
- 暴露两类错误：`MailNotConfigured`（env 缺失 → 503）、`MailSendFailed`（连接/认证失败 → 502）。
- 邮件内容：纯文本 + 极简 HTML，两级文案（主题「LZW.LOG 验证码」/ 正文给出码、有效期、以及"不是你操作就忽略"）。**不写任何站内链接**，避免被当成钓鱼。
- 发信失败时**删掉刚建的验证码记录**，不能让用户拿到一个"永远收不到"的码。

### D5. 接口：`POST /api/auth/email-code`

入参 `{ email, purpose: "register" | "bind" }`。处理顺序是刻意排的：

1. 归一化（`trim().toLowerCase()`）+ 格式校验 → 400
2. `purpose=register` 且邮箱已被注册 → 409（明确提示，不做防枚举的模糊话术：个人博客泄露"某邮箱注册过"的风险可接受，换来的是用户不用猜）
3. `purpose=bind` 且未登录 → 401
4. 限流 → 429
5. 建记录 → 发信
6. 发信抛错 → 删记录，503/502

响应固定 `{ ok: true, cooldown: 60 }`，**永不回显验证码**。

### D6. 注册链路

`/api/register` 入参变为 `{ username, password, email, code }`：

- 邮箱必填、格式合法；
- 先校验验证码（`purpose=register`），通过后才建账号；
- 建账号前再查一次邮箱占用（发码到注册之间可能被别人抢注）→ 409 并作废验证码；
- 账号创建失败（唯一约束）→ 409。

### D7. 补绑邮箱

- 个人资料页（`/profile`）对"已登录且 `email` 为空"的账号显示提示与表单；
- 表单复用同一个 `EmailCodeField`（purpose 传 `bind`）；
- 提交到 `PATCH /api/me/email`：校验验证码（`purpose=bind`）→ 检查邮箱未被占用 → 写入 → 返回 ok；
- 绑定成功后 `unstable_update`/`router.refresh()` 让页头与会话同步。

### D8. 前端：带倒计时的验证码字段

`components/auth/EmailCodeField.tsx`（受控）：

```
邮箱          [ you@example.com        ]
验证码        [ 6 位数字 ] [获取验证码]   ← 按钮点后变成 58s 倒计时
```

- 点「获取验证码」先做本地格式校验，再调发码接口；
- 成功后按钮进入 60 秒倒计时（`aria-live` 播报，不依赖动画）；
- 服务端 429 时把剩余秒数写进倒计时，前端自己算的 60 秒只是表象、服务端才是准的；
- 错误信息优先用服务端返回的中文文案。

### D9. 依赖与部署

- 新增 `nodemailer` + `@types/nodemailer`；
- **两个 lock 文件都要更新**：pnpm（本地）与 npm（Dockerfile 的 `npm ci`）；
- `next.config.ts` 里把 `nodemailer` 加进 `serverExternalPackages`，避免被打包进 server bundle 后动态 require 失败；
- 服务器 `.env` 补 6 个 `SMTP_*`；缺失时接口明确报"邮件服务未配置"，而不是静默失败。

## Risks / Trade-offs

- [QQ/163 发信进垃圾箱] → 这是选个人邮箱 SMTP 的既定代价；缓解：正文不用链接、主题固定、From 用真实发信地址；日后换 DirectMail 只改 env（`lib/mail.ts` 是唯一出口）。
- [QQ 邮箱每日发信量有限、可能因频繁发信被临时限制] → 限流同时保护了这一点（同邮箱每小时 5 封）。
- [ECS 出网 25 端口被封] → 强制 465/587 SSL，文档写死在 design 与 tasks 里。
- [验证码接口被刷] → 邮箱维度 + IP 维度双限流；`purpose=bind` 要求登录态。
- [发码与注册之间邮箱被抢注] → 注册时二次检查 + 唯一约束兜底（现有 `try/catch` 已处理 P2002）。
- [两人同时用同一邮箱注册] → 唯一约束 + 验证码一次性，后者失败。
- [把 6 位码写进日志方便调试] → 明令禁止，spec 有对应场景；调试只打"已发送到 a***@qq.com"这种脱敏形式。
- [nodemailer 在 Next server bundle 里打包后失效] → `serverExternalPackages` 兜住；如果仍有问题，退路是改成 HTTP API。
- [老账号被这条新规卡住] → 注册链路才强制；登录链路一点没动，spec 有"老账号登录"场景。

## Migration Plan

1. `prisma migrate` 新增 `EmailCode` 表（`User` 无改动，不需要数据迁移）。
2. 部署前先在服务器 `.env` 填 `SMTP_*`，用一个小脚本发一封测试邮件确认通道可用。
3. 上线后先用自己邮箱走一遍完整注册 + 补绑流程。
4. 回滚：删表 + 把 `/api/register` 与注册表单恢复到"邮箱选填"，`lib/mail.ts` 与 `lib/verification.ts` 留着不影响。

## Open Questions

（无。发信通道、登录方式、老账号处理三点已在对话中确认：QQ/163 SMTP 授权码、只在注册时验邮箱、老账号保留可登录并提示补绑。）