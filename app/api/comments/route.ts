import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// 管理端：列出全部评论（含待审核）
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }
  const comments = await prisma.comment.findMany({
    include: { post: { select: { id: true, title: true, slug: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(comments);
}

// 公开端：提交评论
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const slug =
      typeof body?.slug === "string" ? body.slug.trim() : "";
    const author =
      typeof body?.author === "string" ? body.author.trim().slice(0, 60) : "";
    const email =
      typeof body?.email === "string" ? body.email.trim().slice(0, 200) : "";
    const content =
      typeof body?.content === "string" ? body.content.trim().slice(0, 2000) : "";

    if (!slug || !author || !content) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    const post = await prisma.post.findUnique({ where: { slug } });
    if (!post) {
      return NextResponse.json({ error: "文章不存在" }, { status: 404 });
    }

    await prisma.comment.create({
      data: {
        postId: post.id,
        author,
        email: email || null,
        content,
        approved: false,
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "服务器错误" }, { status: 500 });
  }
}
