// recordImage / listImages 的集成测试（openspec: add-image-library，任务 1.3）
// 跑法：npx tsx --env-file=.env scripts/image-db-test.ts
import { prisma } from "../lib/prisma";
import { recordImage, listImages } from "../lib/images";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

async function main() {
  const prefix = "img/TESTONLY_";
  const cleanup = async () => {
    await prisma.image.deleteMany({ where: { key: { startsWith: prefix } } });
  };
  await cleanup();

  /* ---------- 首次写入 ---------- */
  const key1 = prefix + "a1b2.png";
  const created = await recordImage({
    key: key1,
    hash: "a1b2",
    ext: "png",
    contentType: "image/png",
    bytes: 12345,
    width: 800,
    height: 600,
    usage: "cover",
    uploaderId: "user-admin-1",
  });
  check("首次写入返回记录", Boolean(created?.id), { key: created?.key });
  check("首次写入字段正确", created.bytes === 12345 && created.width === 800 && created.usage === "cover");

  const afterFirst = await prisma.image.findMany({ where: { key: key1 } });
  check("表里只有一行", afterFirst.length === 1, { count: afterFirst.length });

  /* ---------- 重复写入：合并而不新增 ---------- */
  const firstCreatedAt = afterFirst[0].createdAt.toISOString();
  const firstUploader = afterFirst[0].uploaderId;

  // 等一小会儿，保证 lastUsedAt 能看出变化
  await new Promise((r) => setTimeout(r, 20));

  const merged = await recordImage({
    key: key1,
    hash: "a1b2",
    ext: "png",
    contentType: "image/png",
    bytes: 12345,
    width: 800,
    height: 600,
    usage: "image", // 用途变了
    uploaderId: "user-other-999", // 换了个上传者
  });

  const afterSecond = await prisma.image.findMany({ where: { key: key1 } });
  check("重复写入不新增行", afterSecond.length === 1, { count: afterSecond.length });
  check("usage 更新为最新", merged.usage === "image", { usage: merged.usage });
  check(
    "createdAt 保持不变",
    afterSecond[0].createdAt.toISOString() === firstCreatedAt,
    { before: firstCreatedAt, after: afterSecond[0].createdAt.toISOString() }
  );
  check(
    "uploaderId 保持不变（首次归属）",
    afterSecond[0].uploaderId === firstUploader && merged.uploaderId === "user-admin-1",
    { got: merged.uploaderId }
  );
  check(
    "lastUsedAt 被刷新",
    afterSecond[0].lastUsedAt.getTime() > new Date(firstCreatedAt).getTime(),
    { lastUsedAt: afterSecond[0].lastUsedAt.toISOString() }
  );

  /* ---------- 尺寸缺失也能写入 ---------- */
  const key2 = prefix + "c3d4.webp";
  const noSize = await recordImage({
    key: key2,
    hash: "c3d4",
    ext: "webp",
    contentType: "image/webp",
    bytes: 999,
    usage: "image",
  });
  check("尺寸缺失时 width/height 为 null", noSize.width === null && noSize.height === null, {
    width: noSize.width,
    height: noSize.height,
  });
  check("uploaderId 缺省为 null", noSize.uploaderId === null);

  /* ---------- listImages：筛选 / 搜索 / 分页 ---------- */
  // 再补几条不同用途的
  await recordImage({ key: prefix + "e5f6.jpg", hash: "e5f6", ext: "jpg", contentType: "image/jpeg", bytes: 2048, usage: "cover" });
  await recordImage({ key: prefix + "g7h8.gif", hash: "g7h8", ext: "gif", contentType: "image/gif", bytes: 512, usage: "avatar" });

  const all = await listImages({ q: "TESTONLY_" });
  check("listImages 搜到全部测试记录", all.total === 4, { total: all.total, keys: all.rows.map((r) => r.key) });

  const covers = await listImages({ q: "TESTONLY_", usage: "cover" });
  // 注意：key1 在重复写入测试里已被 merge 成 usage=image（这正是"用途更新为最近一次"的预期），
  // 所以此时唯一的封面是后建的 e5f6.jpg
  check("按用途筛选只返回封面", covers.total === 1 && covers.rows[0].key === prefix + "e5f6.jpg", {
    total: covers.total,
    keys: covers.rows.map((r) => r.key),
  });

  const avatars = await listImages({ q: "TESTONLY_", usage: "avatar" });
  check("按用途筛选返回头像", avatars.total === 1 && avatars.rows[0].key === prefix + "g7h8.gif", {
    keys: avatars.rows.map((r) => r.key),
  });

  const byHash = await listImages({ q: "c3d4" });
  check("按 hash 片段搜索命中", byHash.total === 1 && byHash.rows[0].key === key2, {
    total: byHash.total,
    keys: byHash.rows.map((r) => r.key),
  });

  const upper = await listImages({ q: "testonly_" });
  check("搜索大小写不敏感", upper.total === 4, { total: upper.total });

  const none = await listImages({ q: "ZZZ_NOT_EXIST_ZZZ" });
  check("无匹配返回空且 pageCount 为 1", none.total === 0 && none.rows.length === 0 && none.pageCount === 1, {
    total: none.total,
    pageCount: none.pageCount,
  });

  // 分页：造 30 条，每页 24
  await prisma.image.deleteMany({ where: { key: { startsWith: prefix } } });
  for (let i = 0; i < 30; i += 1) {
    await recordImage({
      key: `${prefix}page${String(i).padStart(2, "0")}.png`,
      hash: `page${i}`,
      ext: "png",
      contentType: "image/png",
      bytes: 100 + i,
      usage: "image",
    });
  }
  const p1 = await listImages({ q: "TESTONLY_", page: 1 });
  const p2 = await listImages({ q: "TESTONLY_", page: 2 });
  check("第一页 24 条、共 30 条、2 页", p1.rows.length === 24 && p1.total === 30 && p1.pageCount === 2, {
    rows: p1.rows.length,
    total: p1.total,
    pageCount: p1.pageCount,
  });
  check("第二页 6 条", p2.rows.length === 6, { rows: p2.rows.length });
  check("两页无重叠", new Set([...p1.rows, ...p2.rows].map((r) => r.key)).size === 30);

  const overflow = await listImages({ q: "TESTONLY_", page: 99 });
  check("超出末页时 page 被夹到末页", overflow.page === 2, { page: overflow.page });

  const zero = await listImages({ q: "TESTONLY_", page: 0 });
  check("page=0 被夹到第一页", zero.page === 1, { page: zero.page });

  // 排序：按创建时间倒序
  const ordered = p1.rows.map((r) => r.createdAt.getTime());
  const isDesc = ordered.every((t, i) => i === 0 || ordered[i - 1] >= t);
  check("按创建时间倒序", isDesc);

  await cleanup();
  console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
  const failed = results.filter((r) => !r).length;
  if (failed) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
