import { isOssConfigured } from "@/lib/oss";
import { formatDate } from "@/lib/date";
import { isUsage, listImages, type ImageUsage } from "@/lib/images";
import { ImageLibrary } from "@/components/admin/ImageLibrary";

export const dynamic = "force-dynamic";

export const metadata = { title: "图床" };

/** 搜索参数可能是 string | string[]，统一取第一个并去掉首尾空白 */
function one(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return (v[0] ?? "").trim();
  return (v ?? "").trim();
}

/**
 * 图床（见 openspec: image-library）。
 *
 * 服务端直读 Prisma，翻页/筛选/搜索走 searchParams——沿用后台其他列表页的惯例，
 * 不新开 GET 接口，少一处鉴权面。
 *
 * 权限由 `app/(site)/admin/layout.tsx` 统一守卫（未登录 → 登录页，非 ADMIN → 首页），
 * 这里不用再判一次。
 */
export default async function AdminImagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const pageRaw = Number(one(sp.page));
  const usageRaw = one(sp.usage);
  const q = one(sp.q);

  const usage: ImageUsage | null = isUsage(usageRaw) ? usageRaw : null;
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const configured = isOssConfigured();
  const data = configured
    ? await listImages({ page, usage, q })
    : { rows: [], total: 0, page: 1, pageSize: 0, pageCount: 1 };

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1>图床</h1>
          <p className="admin-sub">
            站点上传过的全部图片。图片按内容去重，同一张只存一份；这里只读，
            可以复制地址或从封面处选用。
          </p>
        </div>
      </header>

      <ImageLibrary
        images={data.rows.map((r) => ({
          id: r.id,
          key: r.key,
          hash: r.hash,
          ext: r.ext,
          contentType: r.contentType,
          bytes: r.bytes,
          width: r.width,
          height: r.height,
          usage: r.usage,
          createdAt: formatDate(r.createdAt),
        }))}
        total={data.total}
        page={data.page}
        pageCount={data.pageCount}
        usage={usage}
        q={q}
        configured={configured}
      />
    </div>
  );
}
