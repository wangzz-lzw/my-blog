# Tasks

## 1. 数据与依赖

- [x] 1.1 `prisma/schema.prisma` 增加 `EmailCode` 模型（email / purpose / codeHash / attempts / ip / createdAt / expiresAt + 两个索引），迁移 `20261105105735_add_email_code` 已应用；验证：表已建、`tsc` 通过。
- [x] 1.2 安装 `nodemailer` 与 `@types/nodemailer`，并**同时更新 `pnpm-lock.yaml` 与 `package-lock.json`**；验证：两个 lock 里都是 `nodemailer 8.0.11`（版本选择见下）。
- [x] 1.3 `next.config.ts` 把 `nodemailer` 加进 `serverExternalPackages`；验证：dev 下 `/api/auth/email-code` 正常运行，没有模块加载错误。

## 2. 发信（lib/mail.ts）

- [x] 2.1 transport 单例 + `sendCodeEmail(email, code, purpose)`；缺配置抛 `MailNotConfigured`、发送失败抛 `MailSendFailed`；验证：未配 SMTP 时接口 503（实测「邮件服务未配置，请联系站长」）。
- [x] 2.2 邮件正文纯文本 + 极简 HTML，含 6 位码、10 分钟有效期、"非本人操作请忽略"，**不含任何链接**。
- [x] 2.3 端口用 `SMTP_PORT`（默认 465）+ `SMTP_SECURE` 推导，规避 ECS 出网 25 端口封锁；首发真实邮件待配好授权码后验证。

## 3. 验证码核心（lib/verification.ts）

- [x] 3.1 `issueCode`：6 位随机码 + `sha256(code + AUTH_SECRET + email + purpose)` 落库 + 顺手清理过期记录；验证：库里 `plaintextInDb = false`、`storedIsHashed = true`。
- [x] 3.2 `verifyCode` 五种分支全部实测：错码 `mismatch`、正确码 `ok` 且记录被删（复用同一码 → `missing`）、过期 `expired`、连错 5 次后 `too_many` 且记录作废、用途不匹配 → 校验失败。
- [x] 3.3 `checkRateLimit` 三条规则实测：新邮箱 `ok`；刚发过 → `cooldown retryAfter 60`；一小时第 6 次 → `email_limit`；同 IP 第 11 次 → `ip_limit`。

## 4. 发码接口

- [x] 4.1 `app/api/auth/email-code/route.ts` 按设计 D5 的顺序处理；实测四种结果：格式错 400、未配 SMTP 503、正常流程（无 SMTP 时）不残留验证码记录。
- [x] 4.2 发信失败删记录并返回 503/502；响应与日志都不含验证码，日志只打脱敏邮箱（`maskEmail`）。

## 5. 注册链路

- [x] 5.1 `app/api/register/route.ts` 要求 `email + code`：无码 → 400「请填写邮箱验证码」；假码 → 400「验证码不存在或已使用」；**真码 → 200 建号成功且 email 落库**（实测），同一码二次使用 → 400。
- [x] 5.2 `components/auth/RegisterFields.tsx` 接入 `EmailCodeField`，邮箱改必填；实测页面五个字段顺序为 用户名 / 邮箱 / 验证码 / 密码 / 确认密码。

## 6. 验证码字段组件

- [x] 6.1 `components/auth/EmailCodeField.tsx`：发码按钮 + 60 秒倒计时（服务端 `retryAfter` 优先）、发送中禁用、错误文案内联显示；实测「获取验证码」在未配 SMTP 时显示 503 文案且不启动倒计时。
- [x] 6.2 无障碍：`aria-live="polite"` 的提示、`aria-describedby` 关联、数字键盘 `inputMode`、`maxLength=6`（实测键入 9 位被截成 6 位）。

## 7. 老账号补绑邮箱

- [x] 7.1 `/profile` 对无邮箱账号渲染 `BindEmailForm`（复用 `EmailCodeField`，purpose=`bind`）；验证：库中 `1019708531` 账号无邮箱，登录后应出现该区块（未登录时被重定向到 `/login`，未做登录态实测）。
- [x] 7.2 `PATCH /api/me/email`：登录态 + 验码（bind）+ 唯一性 + 写入；`tsc` 通过，真实调用待登录无邮箱账号验证。

## 8. 配置与验证

- [x] 8.1 README 增加「邮箱验证码」一节（QQ/163 两种取授权码说明、必须 465、六个变量含义）；`.env` 追加 `SMTP_*` 占位（值留空）。
- [x] 8.2 端到端：签发真实码 → `POST /api/register` → 200 建号（email 正确落库）→ 同码复用被拒 → 清理测试数据（库已回到 2 个用户）。**真实收信未验证**（本地没有授权码）。
- [x] 8.3 回归：老账号仍能用户名+密码登录（`auth.ts` 未改动）；`/register` 页面字段与组件正常渲染。
- [x] 8.4 `npx tsc --noEmit` 通过（退出码 0）。

## 实施备注

### nodemailer 版本必须 ≤ 8

`next-auth@5.0.0-beta.32` 声明 `peerOptional nodemailer@"^7.0.7 || ^8.0.5"`。先装最新的 10.3.1 会让 `npm install --package-lock-only` 直接 ERESOLVE 失败，`npm ci`（Dockerfile 用的）就更不用说了。最终钉在 **8.0.11**。

### 途中踩到的坑：next 与 @next/swc 版本错位导致全站不水合

`pnpm add nodemailer` 顺带把 `next` 从 16.4.2 升到了 16.4.5，而 `@next/swc` 与 dev 工具链仍按 16.4.2 解析（dev 日志里那句 `Mismatching @next/swc version, detected: 16.4.5 while Next.js is on 16.4.2`）。表现很有欺骗性：**页面 HTML 完全正常、没有任何报错，但所有客户端组件都不水合**——轨道不转、发码按钮点了没反应、连 `Object.keys(el)` 里都没有 React 键。

排查过程：先怀疑自己的新组件 → 用 `/login`、`/` 交叉验证发现全站都不水合 → 清 `.next` 无效 → 看到版本告警 → `pnpm add next@16.4.2` 钉回与 `package-lock.json` / Docker 一致的版本 → 全站恢复（环又开始转了）。

**结论**：这个仓库本地跑 pnpm、CI 跑 npm，`next` 的 minor/patch 必须钉死，否则一次 `pnpm add` 就可能让 dev 与镜像跑在不同版本上。

### 验证方式与边界

- 接口层用真实 HTTP 请求（curl / node fetch）验证，验证码生命周期与限流用 tsx 脚本直连 Prisma 验证（脚本已删除）。
- **未验证**：真实发信（需要 QQ/163 授权码）、登录后补绑邮箱的 UI 流程、`docker compose` 下的 `npm ci`。

## Workflow follow-up

- 服务器 `.env` 填 `SMTP_*`（QQ 授权码）→ 提测前先在自己邮箱发一封确认通道可用。
- 提交推送 → CI 重建镜像（确认 `npm ci` 能装到 nodemailer 8）→ `docker compose up -d --force-recreate app`。
- 上线后先用真实邮箱走一遍注册；再用 `1019708531` 这类无邮箱账号验一次补绑。
- 确认无误后归档（`/openspec-archive-change`）。