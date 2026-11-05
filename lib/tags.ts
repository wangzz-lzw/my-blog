import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/slug";

/** 标签名长度上限（按码点算，中文一个字算一个） */
export const TAG_NAME_MAX = 32;
/** 地址段长度上限 */
export const TAG_SLUG_MAX = 64;
/** 一个标签最多记多少个历史地址 */
export const TAG_ALIAS_LIMIT = 20;

/** 带 HTTP 语义的错误：路由层直接拿 message/status 回给前端 */
export class TagError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TagError";
    this.status = status;
  }
}

export type TagInput = { name: string; slug: string };

/** 唯一约束（P2002）与记录不存在（P2025）的判定，路由层用来兜并发 */
export function isPrismaError(e: unknown, code: "P2002" | "P2025"): boolean {
  return (
    e instanceof Prisma.PrismaClientKnownRequestError && e.code === code
  );
}

const HAS_WORD = /[\p{L}\p{N}]/u;

/**
 * 标签的地址段可以没有名称可依据（比如名称是纯符号），这时 `slugify()` 会退回
 * `post-<时间戳>`——对文章合适，对标签是个丑地址。所以先判定有没有可用字符，
 * 没有就要求站长手填。
 */
function slugifyTag(raw: string): string {
  return HAS_WORD.test(raw) ? slugify(raw) : "";
}

/** 归一化并校验：名称必填、地址段留空则由名称生成，两者都过同一套清洗 */
export function normalizeTagInput(input: {
  name?: unknown;
  slug?: unknown;
}): TagInput {
  const name = String(input.name ?? "").trim();
  const nameLen = [...name].length;
  if (nameLen === 0) throw new TagError(400, "请填写标签名");
  if (nameLen > TAG_NAME_MAX) {
    throw new TagError(400, `标签名最多 ${TAG_NAME_MAX} 个字`);
  }

  const rawSlug = String(input.slug ?? "").trim();
  const slug = slugifyTag(rawSlug || name);
  if (!slug) throw new TagError(400, "地址段不能为空，请手动填写");
  if (slug.length > TAG_SLUG_MAX) {
    throw new TagError(400, `地址段最多 ${TAG_SLUG_MAX} 个字符`);
  }

  return { name, slug };
}

/** 地址段与「所有标签的 slug + 所有别名」共用一个命名空间 */
export async function assertSlugAvailable(slug: string, selfId?: string) {
  const rows = await prisma.tag.findMany({
    where: { OR: [{ slug }, { aliases: { has: slug } }] },
    select: { id: true, name: true, slug: true },
  });
  const conflict = rows.find((r) => r.id !== selfId);
  if (conflict) {
    throw new TagError(
      409,
      `地址段「${slug}」已被标签「${conflict.name}」占用`
    );
  }
}

/** 名称不比地址宽松：大小写不同也算同一个名字，免得站上冒出 React / react 两个 */
export async function assertNameAvailable(name: string, selfId?: string) {
  const dup = await prisma.tag.findFirst({
    where: { name: { equals: name, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (dup && dup.id !== selfId) {
    throw new TagError(409, `标签「${dup.name}」已经存在`);
  }
}

/** 新建 / 改名共用的冲突检查：先看名字，再看地址段（名字重复时说名字更直白） */
export async function assertTagAvailable(input: TagInput, selfId?: string) {
  await assertNameAvailable(input.name, selfId);
  await assertSlugAvailable(input.slug, selfId);
}

/**
 * 改名后的别名集合：旧地址永久保留。
 * - 当前地址不能留在别名里（否则"旧地址"指回自己）
 * - 超出上限时丢最旧的，避免反复改名把行撑大
 */
export function nextAliases(
  prev: string[],
  oldSlug: string,
  nextSlug: string
): string[] {
  const set = new Set(prev.filter(Boolean));
  if (oldSlug && oldSlug !== nextSlug) set.add(oldSlug);
  set.delete(nextSlug);
  return [...set].slice(-TAG_ALIAS_LIMIT);
}

/**
 * 受控词表：文章只能挂「已经存在」的标签。
 *
 * 文章编辑器不再现场造标签（那样会随手长出 typo 标签，一旦存在就永久留在站上），
 * 新建标签统一走后台「标签」页。这里把名字解析成可用的关联引用，
 * 碰到不存在的名字就整体拒绝，并点名是哪个。
 */
export async function resolveTagRefs(names: string[]): Promise<{ id: string }[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const rows = await prisma.tag.findMany({
    where: { name: { in: unique } },
    select: { id: true, name: true },
  });
  const byName = new Map(rows.map((r) => [r.name, r.id]));
  const unknown = unique.filter((n) => !byName.has(n));
  if (unknown.length > 0) {
    throw new TagError(
      400,
      `标签「${unknown.join("、")}」不存在，请先在后台「标签」里新建`
    );
  }
  return unique.map((n) => ({ id: byName.get(n)! }));
}