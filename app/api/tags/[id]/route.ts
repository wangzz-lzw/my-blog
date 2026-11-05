import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  TagError,
  assertTagAvailable,
  isPrismaError,
  nextAliases,
  normalizeTagInput,
} from "@/lib/tags";

type Params = { params: Promise<{ id: string }> };

const NOT_FOUND = "标签不存在或已被删除";

/**
 * 改名：名称与地址段一起写。
 * 旧地址段进 aliases，靠 /tags/[slug] 的永久重定向继续可用。
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => null);

  const existing = await prisma.tag.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  try {
    const input = normalizeTagInput({ name: body?.name, slug: body?.slug });
    await assertTagAvailable(input, id);

    const tag = await prisma.tag.update({
      where: { id },
      data: {
        ...input,
        aliases: nextAliases(existing.aliases, existing.slug, input.slug),
      },
      select: { id: true, name: true, slug: true, aliases: true },
    });

    // 旧地址与新地址都可能被 60 秒 ISR 缓存过，两条都要清
    revalidatePath(`/tags/${existing.slug}`);
    revalidatePath(`/tags/${tag.slug}`);
    revalidatePath("/tags");
    revalidatePath("/blog");
    return NextResponse.json({ tag });
  } catch (e) {
    if (e instanceof TagError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (isPrismaError(e, "P2025")) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    if (isPrismaError(e, "P2002")) {
      return NextResponse.json(
        { error: "这个名称或地址段刚好被占用了，刷新后再试" },
        { status: 409 }
      );
    }
    throw e;
  }
}

/**
 * 删除标签：只摘掉它与文章的关联，文章一行都不动
 * （隐式多对多连接表两侧都是 ON DELETE CASCADE）。
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.tag.findUnique({
    where: { id },
    select: { slug: true, _count: { select: { posts: true } } },
  });
  if (!existing) {
    return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
  }

  try {
    await prisma.tag.delete({ where: { id } });
  } catch (e) {
    if (isPrismaError(e, "P2025")) {
      return NextResponse.json({ error: NOT_FOUND }, { status: 404 });
    }
    throw e;
  }

  revalidatePath(`/tags/${existing.slug}`);
  revalidatePath("/tags");
  revalidatePath("/blog");
  return NextResponse.json({ ok: true, detached: existing._count.posts });
}