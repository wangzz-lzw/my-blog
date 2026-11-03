import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getAdminSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

// 管理端：列出全部评论（含待审核）——仅管理员
export async function GET() {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const comments = await prisma.comment.findMany({
    include: { post: { select: { id: true, title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(comments);
}

// 公开端：提交评论（需登录；昵称/邮箱取自会话，客户端不再提交身份字段）
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "请先登录后再评论" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const slug =
      typeof body?.slug === "string" ? body.slug.trim() : "";
    const content =
      typeof body?.content === "string" ? body.content.trim().slice(0, 2000) : "";

    if (!slug || !content) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { slug } });
    if (!post) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    await prisma.comment.create({
      data: {
        postId: post.id,
        author:
          session.user.name?.trim() ||
          session.user.username ||
          session.user.email ||
          "访客",
        email: session.user.email ?? null,
        content,
        approved: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
