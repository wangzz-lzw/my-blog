import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword } from "@/lib/password";

const USERNAME_RE = /^[a-zA-Z0-9_\u4e00-\u9fa5]{2,20}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 注册普通读者账号（READER）：用户名 + 密码，邮箱选填 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const username =
    typeof body?.username === "string" ? body.username.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const emailRaw = typeof body?.email === "string" ? body.email.trim() : "";
  const email = emailRaw || null;

  if (!USERNAME_RE.test(username)) {
    return NextResponse.json(
      { error: "用户名需 2-20 位字母、数字、下划线或中文" },
      { status: 400 }
    );
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "密码至少 8 位" }, { status: 400 });
  }
  if (email && !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  const existing = await prisma.user.findFirst({
    where: {
      OR: [
        { username },
        ...(email ? [{ email }] : []),
      ],
    },
  });
  if (existing) {
    return NextResponse.json(
      {
        error:
          existing.username === username ? "用户名已被占用" : "邮箱已被注册",
      },
      { status: 409 }
    );
  }

  try {
    const user = await prisma.user.create({
      data: {
        username,
        email,
        name: username,
        passwordHash: await hashPassword(password),
        role: "READER",
      },
    });
    return NextResponse.json({ ok: true, id: user.id });
  } catch {
    // 并发下唯一约束兜底
    return NextResponse.json(
      { error: "用户名或邮箱已被占用" },
      { status: 409 }
    );
  }
}
