import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  MailNotConfigured,
  MailSendFailed,
  maskEmail,
  sendCodeEmail,
  type MailPurpose,
} from "@/lib/mail";
import {
  EMAIL_COOLDOWN_MS,
  checkRateLimit,
  clientIp,
  issueCode,
  revokeCode,
} from "@/lib/verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 发送邮箱验证码。
 * 入参 { email, purpose: "register" | "bind" }。
 * 响应里绝不回显验证码；日志只打脱敏地址。
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const purpose: MailPurpose = body?.purpose === "bind" ? "bind" : "register";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  if (purpose === "register") {
    const taken = await prisma.user.findUnique({ where: { email } });
    if (taken) {
      return NextResponse.json({ error: "该邮箱已被注册" }, { status: 409 });
    }
  } else {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }
    const occupied = await prisma.user.findUnique({ where: { email } });
    if (occupied && occupied.id !== session.user.id) {
      return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 409 });
    }
  }

  const ip = clientIp(req.headers);
  const rate = await checkRateLimit(email, ip);
  if (!rate.ok) {
    const message =
      rate.reason === "cooldown"
        ? `请 ${rate.retryAfter} 秒后再获取`
        : "该邮箱或网络请求过于频繁，请稍后再试";
    return NextResponse.json(
      { error: message, retryAfter: rate.retryAfter },
      { status: 429 }
    );
  }

  let code: string;
  try {
    code = await issueCode(email, purpose, ip);
  } catch {
    return NextResponse.json({ error: "验证码生成失败，请重试" }, { status: 500 });
  }

  try {
    await sendCodeEmail(email, code, purpose);
  } catch (error) {
    // 发不出去就别留一条"看起来发出去了"的记录
    await revokeCode(email, purpose);
    if (error instanceof MailNotConfigured) {
      return NextResponse.json(
        { error: "邮件服务未配置，请联系站长" },
        { status: 503 }
      );
    }
    if (error instanceof MailSendFailed) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return NextResponse.json({ error: "验证码发送失败，请稍后重试" }, { status: 502 });
  }

  console.log(`[email-code] sent to ${maskEmail(email)} purpose=${purpose}`);
  return NextResponse.json({
    ok: true,
    cooldown: Math.ceil(EMAIL_COOLDOWN_MS / 1000),
  });
}