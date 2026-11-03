import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// 浏览量 beacon：进入文章页时客户端发一次 POST 自增
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const post = await prisma.post.update({
      where: { id },
      data: { views: { increment: 1 } },
      select: { views: true },
    });
    return NextResponse.json(post);
  } catch (e) {
    // P2025：文章不存在
    if ((e as { code?: string })?.code === "P2025") {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }
    // 旧版生成客户端尚无 views 字段（校验错误）：beacon 静默降级，不影响页面
    return NextResponse.json(
      { error: "浏览量功能未就绪，请重新生成 Prisma 客户端" },
      { status: 503 }
    );
  }
}
