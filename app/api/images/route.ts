import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authz";
import { isOssConfigured } from "@/lib/oss";
import { formatBytes, isUsage, listImages, USAGE_LABEL } from "@/lib/images";

export const dynamic = "force-dynamic";

/**
 * 图床图片列表（只读，仅管理员）。
 *
 * 为什么需要这个接口：后台列表页是服务端组件直读 Prisma 的（沿用仓库惯例），
 * 但**封面选择器是弹层里的客户端组件**——它要在打开时按筛选条件重新拉数据，
 * 服务端渲染到不了那里。所以只开这一个读接口，写仍然走 /api/upload。
 *
 * 只返回当前页，不返回总数之外的统计；分页参数与 listImages 同源。
 */
export async function GET(req: NextRequest) {
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "需要管理员权限" }, { status: 403 });
  }

  if (!isOssConfigured()) {
    return NextResponse.json(
      {
        error:
          "图片存储未配置：请在 .env 填写 OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET",
      },
      { status: 503 }
    );
  }

  const sp = req.nextUrl.searchParams;
  const pageRaw = Number(sp.get("page") ?? "1");
  const usageRaw = (sp.get("usage") ?? "").trim();
  const q = (sp.get("q") ?? "").trim();

  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;
  const usage = isUsage(usageRaw) ? usageRaw : null;

  try {
    const data = await listImages({ page, usage, q });
    return NextResponse.json({
      ok: true,
      total: data.total,
      page: data.page,
      pageCount: data.pageCount,
      pageSize: data.pageSize,
      images: data.rows.map((r) => ({
        id: r.id,
        key: r.key,
        hash: r.hash,
        ext: r.ext,
        contentType: r.contentType,
        bytes: r.bytes,
        // 列表里直接给可读文案，客户端不用再算一遍
        bytesLabel: formatBytes(r.bytes),
        width: r.width,
        height: r.height,
        usage: r.usage,
        usageLabel: USAGE_LABEL[r.usage as keyof typeof USAGE_LABEL] ?? r.usage,
        // 用 ISO 字符串：跨 JSON 边界不丢格式，客户端自己决定怎么显示
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[api/images] 读取失败", e);
    return NextResponse.json({ error: "读取图片列表失败" }, { status: 500 });
  }
}
