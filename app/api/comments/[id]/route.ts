import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const approved = Boolean(body?.approved);

  await prisma.comment.update({ where: { id }, data: { approved } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const { id } = await params;

  await prisma.comment.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
