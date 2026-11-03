import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashPassword, verifyPassword } from "@/lib/password";

/** 修改密码：校验当前密码 → 写入新密码 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const currentPassword =
    typeof body?.currentPassword === "string" ? body.currentPassword : "";
  const newPassword =
    typeof body?.newPassword === "string" ? body.newPassword : "";

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ error: "请填写当前密码和新密码" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return NextResponse.json({ error: "新密码至少 8 位" }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "新密码不能与当前密码相同" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { passwordHash: true },
  });
  if (!user) {
    return NextResponse.json({ error: "用户不存在" }, { status: 404 });
  }

  const ok = await verifyPassword(currentPassword, user.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "当前密码不正确" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: session.user.id },
    data: { passwordHash: await hashPassword(newPassword) },
  });

  return NextResponse.json({ ok: true });
}
