import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * 当前登录用户（含头像）。
 * 头像不进 JWT/cookie（data URL 会撑爆 cookie），页头单独从这里取。
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ user: null });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      avatar: true,
      role: true,
    },
  });

  return NextResponse.json({ user: user ?? null });
}
