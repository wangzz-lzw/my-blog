// 回填脚本的幂等与容错验证（openspec: add-image-library，任务 3.2）
// 跑法：npx tsx --env-file=.env scripts/backfill-verify.ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

async function main() {
  const all = await prisma.image.findMany({ orderBy: { key: "asc" } });
  console.log(`表内共 ${all.length} 条记录\n`);

  /* ---------- 字段完整性 ---------- */
  const badHash = all.filter((r) => !/^img\/[0-9a-f]{64}\.[a-z0-9]+$/i.test(r.key));
  check("所有 key 形如 img/<sha256>.<ext>", badHash.length === 0, { bad: badHash.map((r) => r.key) });

  const hashMismatch = all.filter((r) => r.key !== `img/${r.hash}.${r.ext}`);
  check("hash 与 key 一致", hashMismatch.length === 0, { bad: hashMismatch.map((r) => r.key) });

  const noSize = all.filter((r) => r.width === null || r.height === null);
  check(
    "尺寸都解析出来了",
    noSize.length === 0,
    noSize.length ? { missing: noSize.map((r) => r.key) } : { total: all.length }
  );

  const zeroSize = all.filter((r) => (r.width ?? 0) <= 0 || (r.height ?? 0) <= 0);
  check("尺寸都为正数", zeroSize.length === 0, { bad: zeroSize.map((r) => `${r.key}:${r.width}x${r.height}`) });

  const noBytes = all.filter((r) => r.bytes <= 0);
  check("字节数都大于 0", noBytes.length === 0, { bad: noBytes.map((r) => `${r.key}:${r.bytes}`) });

  const noType = all.filter((r) => !r.contentType.startsWith("image/"));
  check("contentType 都是 image/*", noType.length === 0, { bad: noType.map((r) => `${r.key}:${r.contentType}`) });

  check(
    "回填的记录 usage 默认 image",
    all.every((r) => r.usage === "image"),
    { usages: [...new Set(all.map((r) => r.usage))] }
  );
  check(
    "回填的记录 uploaderId 为空（未知而不是瞎猜）",
    all.every((r) => r.uploaderId === null),
    { uploaders: [...new Set(all.map((r) => r.uploaderId))] }
  );

  /* ---------- 展示样例 ---------- */
  console.log("\n回填结果样例：");
  for (const r of all.slice(0, 10)) {
    console.log(
      `  ${r.key.slice(4, 16)}…  ${r.ext.padEnd(4)} ${String(r.width).padStart(4)}x${String(r.height).padEnd(4)} ` +
        `${String(r.bytes).padStart(7)}B  ${r.contentType}`
    );
  }

  const failed = results.filter((r) => !r).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
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
