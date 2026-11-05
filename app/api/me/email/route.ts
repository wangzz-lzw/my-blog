import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { verifyCode, verifyMessage } from "@/lib/verification";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** 给当前账号补绑 / 换绑邮箱：需要 bind 用途的验证码 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const email =
    typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";

  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "邮箱格式不正确" }, { status: 400 });
  }

  // 1) 验证码先过（用途必须是 bind）
  const verified = await verifyCode(email, "bind", code);
  if (!verified.ok) {
    return NextResponse.json({ error: verifyMessage(verified.reason) }, { status: 400 });
  }

  // 2) 唯一性：不能是别人的邮箱
  const occupied = await prisma.user.findUnique({ where: { email } });
  if (occupied && occupied.id !== session.user.id) {
    return NextResponse.json({ error: "该邮箱已被其他账号使用" }, { status: 409 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { email },
  });

  return NextResponse.json({ ok: true, email });
}