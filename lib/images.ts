/**
 * 图片列表（图床）的查询与写入（见 openspec: image-library）。
 *
 * 图片本体存在 OSS 的 `img/<sha256>.<ext>`，这里只管元信息。
 * 内容寻址意味着同一张图只有一个 key，所以重复上传走 upsert 合并，不会长出第二条记录。
 */
import { prisma } from "@/lib/prisma";

export type ImageUsage = "avatar" | "cover" | "image";

export const IMAGE_USAGES: readonly ImageUsage[] = ["image", "cover", "avatar"];

/** 用途的中文名，列表筛选与徽标共用一处 */
export const USAGE_LABEL: Record<ImageUsage, string> = {
  image: "正文",
  cover: "封面",
  avatar: "头像",
};

export function isUsage(v: unknown): v is ImageUsage {
  return typeof v === "string" && (IMAGE_USAGES as readonly string[]).includes(v);
}

/** 单页数量。图床是低频管理页，一页看满一屏刚好 */
export const PAGE_SIZE = 24;

/**
 * 从文件头解析像素尺寸，不依赖任何第三方库。
 *
 * 为什么手写：`sharp` 在 node_modules 里只是 Next.js 的传递依赖，直接 import 会变成
 * 幽灵依赖（本仓库踩过 unist-util-visit 的同类问题）；而为了两个可选字段装一个
 * 原生二进制依赖也不划算。
 *
 * 每个 read* 之前都必须做长度检查 —— 不做的话，一个截断的 PNG 就会在
 * readUInt32BE(20) 抛 RangeError（实测踩到）。认不出的格式一律返回 null，
 * 调用方据此把宽高留空，而不是拒绝上传。
 */
export function probeImageSize(
  buf: Buffer
): { width: number; height: number } | null {
  const parsed = probeRaw(buf);
  // 宽或高为 0 不是有效图片（PNG 魔数 + 全零数据就能造出来），按无法解析处理
  if (!parsed || parsed.width <= 0 || parsed.height <= 0) return null;
  return parsed;
}

function probeRaw(
  buf: Buffer
): { width: number; height: number } | null {
  if (buf.length < 10) return null;
  const has = (n: number) => buf.length >= n;

  // PNG: 89 50 4E 47 0D 0A 1A 0A，IHDR 的宽高在 offset 16 / 20（大端）
  if (has(24) && buf.readUInt32BE(0) === 0x89504e47) {
    return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  }

  // GIF: "GIF87a" / "GIF89a"，宽高在 offset 6 / 8（小端）
  if (buf.toString("ascii", 0, 3) === "GIF" && has(10)) {
    return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) };
  }

  // WebP: RIFF....WEBP，三种子格式的宽高位置不同
  if (
    has(30) &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  ) {
    const chunk = buf.toString("ascii", 12, 16);
    if (chunk === "VP8 ") {
      // 有损：宽高各 14 位，遮掉高 2 位的缩放标记
      return {
        width: buf.readUInt16LE(26) & 0x3fff,
        height: buf.readUInt16LE(28) & 0x3fff,
      };
    }
    if (chunk === "VP8L" && has(25)) {
      // 无损：位流里第 1..14 位是宽、15..28 位是高，都减 1
      const bits = buf.readUInt32LE(21);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    if (chunk === "VP8X" && has(30)) {
      // 扩展：24 位小端，存的是宽高减 1
      return {
        width: 1 + buf.readUIntLE(24, 3),
        height: 1 + buf.readUIntLE(27, 3),
      };
    }
    return null;
  }

  // JPEG: FFD8 开头，往后扫 SOFn 段
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let off = 2;
    while (off + 4 <= buf.length) {
      if (buf[off] !== 0xff) {
        off += 1;
        continue;
      }
      const marker = buf[off + 1];
      const len = buf.readUInt16BE(off + 2);
      // SOF0..SOF15 里带尺寸，但要排除 DHT(C4) / JPG(C8) / DAC(CC)
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        if (off + 9 > buf.length) return null;
        return {
          height: buf.readUInt16BE(off + 5),
          width: buf.readUInt16BE(off + 7),
        };
      }
      // len 含它自己那 2 字节；len < 2 是坏数据，直接放弃免得死循环
      if (len < 2) return null;
      off += 2 + len;
    }
  }

  return null;
}

export type RecordImageInput = {
  key: string;
  hash: string;
  ext: string;
  contentType: string;
  bytes: number;
  width?: number | null;
  height?: number | null;
  usage: ImageUsage;
  uploaderId?: string | null;
};

/**
 * 记一条图片记录，或更新已存在的那条。
 *
 * 合并规则（spec「不同用途复用」）：重复上传只刷新 `lastUsedAt` 与 `usage`，
 * **不动** `createdAt` 与 `uploaderId` —— 首次上传者与首次时间才是有意义的归属信息。
 */
export async function recordImage(input: RecordImageInput) {
  const { key, ...rest } = input;
  return prisma.image.upsert({
    where: { key },
    create: {
      key,
      hash: rest.hash,
      ext: rest.ext,
      contentType: rest.contentType,
      bytes: rest.bytes,
      width: rest.width ?? null,
      height: rest.height ?? null,
      usage: rest.usage,
      uploaderId: rest.uploaderId ?? null,
    },
    update: {
      lastUsedAt: new Date(),
      usage: rest.usage,
    },
  });
}

export type ListImagesOptions = {
  page?: number;
  usage?: ImageUsage | null;
  q?: string | null;
};

export type ImageRow = {
  id: string;
  key: string;
  hash: string;
  ext: string;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  usage: string;
  uploaderId: string | null;
  createdAt: Date;
  lastUsedAt: Date;
};

/** 分页 + 用途筛选 + 标识片段搜索，图床页与选择面板共用 */
export async function listImages(options: ListImagesOptions = {}) {
  const page = Math.max(1, Math.floor(options.page ?? 1));
  const where: {
    usage?: string;
    OR?: Array<{ key?: { contains: string; mode: "insensitive" }; hash?: { contains: string; mode: "insensitive" } }>;
  } = {};

  if (options.usage) where.usage = options.usage;

  const q = options.q?.trim();
  if (q) {
    // 按 key 或 hash 片段找：管理员手上可能只有半截哈希，也可能只记得文件名
    where.OR = [
      { key: { contains: q, mode: "insensitive" } },
      { hash: { contains: q, mode: "insensitive" } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.image.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.image.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return {
    rows: rows as ImageRow[],
    total,
    page: Math.min(page, pageCount),
    pageSize: PAGE_SIZE,
    pageCount,
  };
}

/** 字节数的可读写法：列表里要显示大小 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
