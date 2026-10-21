import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

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

  const existing = await prisma.post.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { error: `Slug「${slug}」已存在，请修改` },
      { status: 409 }
    );
  }

  const post = await prisma.post.create({
    data: {
      title,
      slug,
      excerpt,
      cover,
      content,
      published,
      publishedAt: published ? new Date() : null,
      tags: {
        connectOrCreate: tagNames.map((name) => {
          const tagSlug = slugify(name);
          return {
            where: { slug: tagSlug },
            create: { name, slug: tagSlug },
          };
        }),
      },
    },
  });

  return NextResponse.json({ id: post.id }, { status: 201 });
}
