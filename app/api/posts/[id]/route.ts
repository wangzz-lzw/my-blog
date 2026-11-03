import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

type Params = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const { id } = await params;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "请求体无效" }, { status: 400 });
  }

  const title = String(body.title ?? "").trim();
  const content = String(body.content ?? "").trim();
  if (!title || !content) {
    return NextResponse.json({ error: "标题和正文不能为空" }, { status: 400 });
  }

  const slug = String(body.slug ?? "").trim() || slugify(title);
  const excerpt = String(body.excerpt ?? "").trim() || null;
  const cover = String(body.cover ?? "").trim() || null;
  const published = Boolean(body.published);
  const tagNames = String(body.tags ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const current = await prisma.post.findUnique({ where: { id } });
  if (!current) {
    return NextResponse.json({ error: "文章不存在" }, { status: 404 });
  }

  const existing = await prisma.post.findUnique({ where: { slug } });
  if (existing && existing.id !== id) {
    return NextResponse.json(
      { error: `Slug「${slug}」已被其他文章使用` },
      { status: 409 }
    );
  }

  // 确保标签存在，再整体 set（重置关联）
  const tagRefs: { id: string }[] = [];
  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { slug: slugify(name) },
      update: {},
      create: { name, slug: slugify(name) },
    });
    tagRefs.push({ id: tag.id });
  }

  const post = await prisma.post.update({
    where: { id },
    data: {
      title,
      slug,
      excerpt,
      cover,
      content,
      published,
      publishedAt: published ? (current.publishedAt ?? new Date()) : null,
      tags: { set: tagRefs },
    },
  });

  return NextResponse.json({ id: post.id });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }
  const { id } = await params;

  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
