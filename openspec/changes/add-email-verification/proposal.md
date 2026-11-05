# Proposal

## Why

现在注册只要一个用户名和密码，邮箱是**选填且不做任何校验**——写个 `a@b.c` 也能过。这意味着：

- 任何人不留可用的联系方式就能注册、评论，出事找不到人；
- `email` 字段在库里 `@unique`，却因为没人验证而毫无意义（甚至可以用别人的邮箱占位）；
- 以后要做找回密码、订阅、通知，没有一条可信的邮箱通道。

「必须真实邮箱」的唯一现实含义是：**注册时必须证明这个邮箱是你能收信的**。做到这一步，就需要一条能发信的通道。

## What Changes

- **注册强制邮箱 + 验证码**：先填邮箱 → 点「发送验证码」→ 收到 6 位数字码 → 填进表单 → 服务端校验通过才建账号。邮箱成为必填项。
- **发信通道**：用个人邮箱（QQ / 163）的 SMTP 授权码发信，`nodemailer` 一个依赖。配置全部走环境变量，日后换阿里云 DirectMail 只改 env，不改代码。
- **验证码的安全与限流**：10 分钟有效、一次性、最多试 5 次；同邮箱 60 秒冷却、每小时 5 封；同 IP 每小时 10 封。库里只存验证码的哈希，不存明文。
- **老账号不受影响**：没有邮箱的历史账号继续用「用户名 + 密码」登录；登录后个人资料页给出「补绑邮箱」提示，用同一套验证码流程绑定。
- **登录方式不变**：仍然只有密码登录（`auth.ts` 的凭据 provider 不动）。

## Capabilities

### New Capabilities

- `email-verification`: 邮箱验证码的完整契约 —— 发码接口的输入与限流、验证码的存储与校验规则、注册链路如何强依赖验证码、老账号补绑邮箱、发信配置与失败处理，以及"验证码不得出现在日志/响应里"这条硬约束。

### Modified Capabilities

（无。`auth-affordance`、`auth-panel` 的登录行为不变；只有注册表单与 `/api/register` 的入参变了。）

## Impact

- **代码**：新增 `lib/mail.ts`（SMTP 传输与邮件模板）、`lib/verification.ts`（生成/哈希/校验/限流）、`app/api/auth/email-code/route.ts`（发码）、`components/auth/EmailCodeField.tsx`（带倒计时的发码控件）；改 `app/api/register/route.ts`（必须带 code）、`components/auth/RegisterFields.tsx`（邮箱必填 + 验证码）、`app/(site)/profile`（补绑邮箱提示与表单）、`prisma/schema.prisma`（新增 `EmailCode` 表）。
- **依赖**：新增 `nodemailer`（+ `@types/nodemailer`）。注意本仓库同时存在 `pnpm-lock.yaml` 与 `package-lock.json`，Dockerfile 用 `npm ci`，**两个 lock 都要更新**，否则镜像构建会装不到新依赖或装错版本。
- **配置**：`.env` 新增 `SMTP_HOST`、`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS`（授权码）、`SMTP_FROM`。服务器 `.env` 也要补，否则发码接口会明确报"邮件服务未配置"。
- **数据**：新增一张表（不改变 `User` 结构）。`User.email` 保持可空，老账号因此不需要迁移。
- **风险**：QQ/163 的 SMTP 发信容易进垃圾箱、有每日发信量上限、且发信人是个人邮箱地址。这是选这条通道的既定代价；代码把发信收敛在一处，换服务商只改 env。
- **验证口径**：`tsc` 与 `build` 通过；真实邮箱收得到码；错码/过期码/超次数/占位邮箱各有明确报错；60 秒与每小时限流生效；老账号仍能密码登录并在资料页看到补绑提示。
- **不在本次范围**：找回密码、邮箱通知/订阅、一次性登录链接、第三方 OAuth、垃圾邮箱域名黑名单、把邮箱改成必填并强制所有老账号补绑。