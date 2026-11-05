import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { MailPurpose } from "@/lib/mail";

/** 验证码有效期 */
export const CODE_TTL_MS = 10 * 60 * 1000;
/** 同一验证码最多尝试次数 */
export const MAX_ATTEMPTS = 5;
/** 同邮箱发码冷却 */
export const EMAIL_COOLDOWN_MS = 60 * 1000;
/** 同邮箱每小时上限 */
export const EMAIL_HOURLY_MAX = 5;
/** 同 IP 每小时上限 */
export const IP_HOURLY_MAX = 10;

export type IssueResult =
  | { ok: true; code: string }
  | { ok: false; reason: "cooldown" | "email_limit" | "ip_limit"; retryAfter: number };

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "expired" | "too_many" | "mismatch" };

function secret(): string {
  return process.env.AUTH_SECRET ?? "dev-insecure-secret";
}

/**
 * 验证码只以哈希落库：加盐用 AUTH_SECRET，把 email 与 purpose 一起拌进去，
 * 这样同一串数字在不同邮箱/不同用途下哈希不同，泄露一列也无法反推。
 */
function hashCode(code: string, email: string, purpose: MailPurpose): string {
  return createHash("sha256")
    .update(`${code}:${secret()}:${email}:${purpose}`)
    .digest("hex");
}

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function generateCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 顺手清理过期记录，省掉一个定时任务 */
export async function pruneExpired(): Promise<void> {
  await prisma.emailCode.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
}

/** 发码前的限流检查：同邮箱 60 秒 + 每小时 5 次 + 同 IP 每小时 10 次 */
export async function checkRateLimit(
  emailRaw: string,
  ip: string | null
): Promise<IssueResult | { ok: true }> {
  const email = normalize(emailRaw);
  const now = Date.now();

  const latest = await prisma.emailCode.findFirst({
    where: { email },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  if (latest) {
    const elapsed = now - latest.createdAt.getTime();
    if (elapsed < EMAIL_COOLDOWN_MS) {
      return {
        ok: false,
        reason: "cooldown",
        retryAfter: Math.ceil((EMAIL_COOLDOWN_MS - elapsed) / 1000),
      };
    }
  }

  const hourAgo = new Date(now - 60 * 60 * 1000);
  const sameEmail = await prisma.emailCode.count({
    where: { email, createdAt: { gte: hourAgo } },
  });
  if (sameEmail >= EMAIL_HOURLY_MAX) {
    return { ok: false, reason: "email_limit", retryAfter: 3600 };
  }

  if (ip) {
    const sameIp = await prisma.emailCode.count({
      where: { ip, createdAt: { gte: hourAgo } },
    });
    if (sameIp >= IP_HOURLY_MAX) {
      return { ok: false, reason: "ip_limit", retryAfter: 3600 };
    }
  }

  return { ok: true };
}

/** 生成并落库一条验证码，返回明文（只用于马上发信，不回显给客户端） */
export async function issueCode(
  emailRaw: string,
  purpose: MailPurpose,
  ip: string | null
): Promise<string> {
  const email = normalize(emailRaw);
  await pruneExpired();
  const code = generateCode();
  await prisma.emailCode.create({
    data: {
      email,
      purpose,
      codeHash: hashCode(code, email, purpose),
      ip,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    },
  });
  return code;
}

/** 发信失败时把刚建的记录作废，避免用户拿到一个永远收不到的码 */
export async function revokeCode(
  emailRaw: string,
  purpose: MailPurpose
): Promise<void> {
  const email = normalize(emailRaw);
  await prisma.emailCode.deleteMany({ where: { email, purpose } });
}

/** 校验验证码；成功即作废（一次性） */
export async function verifyCode(
  emailRaw: string,
  purpose: MailPurpose,
  codeRaw: string
): Promise<VerifyResult> {
  const email = normalize(emailRaw);
  const code = codeRaw.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, reason: "mismatch" };

  const record = await prisma.emailCode.findFirst({
    where: { email, purpose },
    orderBy: { createdAt: "desc" },
  });
  if (!record) return { ok: false, reason: "missing" };
  if (record.expiresAt.getTime() < Date.now()) {
    await prisma.emailCode.delete({ where: { id: record.id } });
    return { ok: false, reason: "expired" };
  }
  if (record.attempts >= MAX_ATTEMPTS) {
    await prisma.emailCode.delete({ where: { id: record.id } });
    return { ok: false, reason: "too_many" };
  }

  const expected = Buffer.from(record.codeHash, "hex");
  const actual = Buffer.from(hashCode(code, email, purpose), "hex");
  const match =
    expected.length === actual.length && timingSafeEqual(expected, actual);

  if (!match) {
    await prisma.emailCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: "mismatch" };
  }

  await prisma.emailCode.delete({ where: { id: record.id } });
  return { ok: true };
}

/** 把校验失败的原因翻译成给用户看的中文（文案集中一处，前端不用判断枚举） */
export function verifyMessage(reason: Exclude<VerifyResult, { ok: true }>["reason"]): string {
  switch (reason) {
    case "missing":
      return "验证码不存在或已使用，请重新获取";
    case "expired":
      return "验证码已过期，请重新获取";
    case "too_many":
      return "验证码尝试次数过多，请重新获取";
    default:
      return "验证码不正确";
  }
}

/** 从请求头取客户端 IP（只用于限流） */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || null;
  return headers.get("x-real-ip") || null;
}