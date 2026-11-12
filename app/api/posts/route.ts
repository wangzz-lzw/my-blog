import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { syncPostIndexSafe } from "@/lib/rag/index";
import { slugify } from "@/lib/slug";
import { TagError, resolveTagRefs } from "@/lib/tags";

export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
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

  // 受控词表：标签必须是已经存在的，不接受现场新建
  let tagRefs: { id: string }[];
  try {
    tagRefs = await resolveTagRefs(tagNames);
  } catch (e) {
    if (e instanceof TagError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    throw e;
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
      tags: { connect: tagRefs },
    },
  });

  // 同步检索索引：已发布才建块，草稿不建（见 openspec: rag-indexing）
  await syncPostIndexSafe(post.id, { published });

  return NextResponse.json({ id: post.id }, { status: 201 });
}
