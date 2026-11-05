import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import {
  TagError,
  assertTagAvailable,
  isPrismaError,
  normalizeTagInput,
} from "@/lib/tags";

/**
 * 新建标签。只做写、不做读：后台页是服务端组件直读 Prisma，
 * 写完 router.refresh() 就够，少一个接口就少一处鉴权面。
 */
export async function POST(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);

  try {
    const input = normalizeTagInput({ name: body?.name, slug: body?.slug });
    await assertTagAvailable(input);

    const tag = await prisma.tag.create({
      data: input,
      select: { id: true, name: true, slug: true, aliases: true },
    });

    revalidatePath("/tags");
    revalidatePath(`/tags/${tag.slug}`);
    return NextResponse.json({ tag }, { status: 201 });
  } catch (e) {
    if (e instanceof TagError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    // 两个请求同时过检查时，唯一约束是最后一道门
    if (isPrismaError(e, "P2002")) {
      return NextResponse.json(
        { error: "这个名称或地址段刚好被占用了，刷新后再试" },
        { status: 409 }
      );
    }
    throw e;
  }
}