import nodemailer, { type Transporter } from "nodemailer";

/**
 * 发信通道：personal SMTP（QQ / 163 授权码）。
 * 全部配置走环境变量，日后换成阿里云 DirectMail 只需改 env，不动代码。
 *
 * 注意：端口必须 465 / 587（SSL / STARTTLS）。
 * 阿里云 ECS 默认封禁出网 25 端口，用 25 会表现为"超时"而不是报错。
 */

/** 环境变量没配全：属于部署问题，接口应回 503 */
export class MailNotConfigured extends Error {
  constructor() {
    super("邮件服务未配置");
    this.name = "MailNotConfigured";
  }
}

/** 连接 / 认证 / 拒信：接口应回 502 */
export class MailSendFailed extends Error {
  constructor(message = "验证码发送失败，请稍后重试") {
    super(message);
    this.name = "MailSendFailed";
  }
}

type MailConfig = {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
};

function readConfig(): MailConfig {
  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const port = Number(process.env.SMTP_PORT ?? 465);
  if (!host || !user || !pass || !Number.isFinite(port)) {
    throw new MailNotConfigured();
  }
  return {
    host,
    port,
    // 465 走 implicit SSL；587 走 STARTTLS。显式覆盖优先
    secure:
      process.env.SMTP_SECURE === undefined
        ? port === 465
        : process.env.SMTP_SECURE === "true",
    user,
    pass,
    from: process.env.SMTP_FROM?.trim() || user,
  };
}

let cached: Transporter | null = null;

function getTransport(): { transporter: Transporter; from: string } {
  const config = readConfig();
  if (!cached) {
    cached = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.pass },
    });
  }
  return { transporter: cached, from: config.from };
}

const PURPOSE_COPY = {
  register: {
    subject: "LZW.LOG 注册验证码",
    lead: "你正在注册 LZW.LOG 的账号，验证码是：",
    leadText: "你正在注册 LZW.LOG 的账号，验证码是：",
  },
  bind: {
    subject: "LZW.LOG 绑定邮箱验证码",
    lead: "你正在为 LZW.LOG 账号绑定这个邮箱，验证码是：",
    leadText: "你正在为 LZW.LOG 账号绑定这个邮箱，验证码是：",
  },
} as const;

export type MailPurpose = keyof typeof PURPOSE_COPY;

/**
 * 发一封验证码邮件。
 * 正文刻意不放任何链接：个人邮箱 SMTP 发信容易被当成钓鱼，带链接更容易进垃圾箱。
 */
export async function sendCodeEmail(
  email: string,
  code: string,
  purpose: MailPurpose
): Promise<void> {
  const copy = PURPOSE_COPY[purpose];
  const { transporter, from } = getTransport();

  const text = [
    copy.leadText,
    "",
    `    ${code}`,
    "",
    "10 分钟内有效，只能使用一次。",
    "如果不是你本人操作，忽略这封邮件即可，你的账号不会有任何变化。",
    "",
    "— LZW.LOG",
  ].join("\n");

  const html = `<!doctype html>
<html lang="zh-CN"><body style="margin:0;padding:24px;background:#f5f7fa;font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif;color:#0b0e12">
  <div style="max-width:420px;margin:0 auto;padding:24px;background:#ffffff;border:1px solid #dce3eb">
    <p style="margin:0 0 16px;font-size:14px;line-height:1.7;color:#59636f">${copy.lead}</p>
    <p style="margin:0 0 24px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:30px;letter-spacing:0.28em;color:#0b0e12">${code}</p>
    <p style="margin:0;font-size:12px;line-height:1.8;color:#59636f">
      10 分钟内有效，只能使用一次。<br />
      如果不是你本人操作，忽略这封邮件即可。
    </p>
  </div>
</body></html>`;

  try {
    await transporter.sendMail({
      from: `"LZW.LOG" <${from}>`,
      to: email,
      subject: copy.subject,
      text,
      html,
    });
  } catch (error) {
    // 只记错误类型，不记验证码，也不记收件人全量地址
    console.error("[mail] send failed:", (error as Error)?.name ?? "unknown");
    throw new MailSendFailed();
  }
}

/** 脱敏邮箱，日志里只打这个 */
export function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  const head = name.slice(0, 1) || "*";
  return `${head}***@${domain}`;
}