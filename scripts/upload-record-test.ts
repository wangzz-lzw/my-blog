// 上传路径写入记录的真实验证（openspec: add-image-library，任务 2.1 / 2.2 / 2.3）
// 跑法：npx tsx --env-file=.env scripts/upload-record-test.ts
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = "http://127.0.0.1:3000";

const results: boolean[] = [];
const check = (name: string, ok: boolean, detail?: unknown) => {
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail === undefined ? "" : JSON.stringify(detail)}`);
};

/** 造一张真实可解析的小 PNG（1x1，带正确的 IHDR 与 CRC 占位） */
function makePng(width: number, height: number, seed: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8; // bit depth
  ihdrData[9] = 2; // color type: truecolor
  ihdrData[10] = 0;
  ihdrData[11] = 0;
  ihdrData[12] = 0;

  const ihdrLen = Buffer.alloc(4);
  ihdrLen.writeUInt32BE(13, 0);
  const ihdrType = Buffer.from("IHDR", "ascii");
  const ihdrCrc = Buffer.alloc(4); // 不校验 CRC 也能被解析器接受（我们只读头部）

  // 造一点唯一内容，让不同 seed 得到不同 sha256
  const junk = Buffer.alloc(64);
  junk.write(`seed-${seed}-`, 0);

  return Buffer.concat([sig, ihdrLen, ihdrType, ihdrData, ihdrCrc, junk]);
}

async function login(): Promise<string> {
  const jar: string[] = [];
  const save = (res: Response) => {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) jar.push(c.split(";")[0]);
  };
  const ck = () => jar.join("; ");
  const env = Object.fromEntries(
    readFileSync(".env", "utf8")
      .split(/\r?\n/)
      .filter((l) => /^[A-Z_]+=/.test(l))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1).trim().replace(/^"|"$/g, "")];
      })
  );

  const csrfRes = await fetch(`${BASE}/api/auth/csrf`, { headers: { cookie: ck() } });
  save(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: "POST",
    headers: { cookie: ck(), "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      identifier: env.ADMIN_USERNAME,
      password: env.ADMIN_PASSWORD,
      csrfToken,
      callbackUrl: BASE + "/admin",
      json: "true",
    }),
    redirect: "manual",
  });
  save(loginRes);
  return ck();
}

async function upload(cookie: string, buf: Buffer, filename: string, kind: string) {
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array(buf)], { type: "image/png" }), filename);
  fd.append("kind", kind);
  const res = await fetch(`${BASE}/api/upload`, {
    method: "POST",
    headers: { cookie },
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

async function main() {
  const cookie = await login();
  console.log("登录完成\n");

  const seed = Date.now();
  const buf = makePng(1280, 720, seed);

  /* ---------- 2.1 首次上传 ---------- */
  const first = await upload(cookie, buf, "test-first.png", "cover");
  check("2.1 上传返回 200", first.status === 200, first.data);
  check("2.1 响应仍含 ok/url/key/kind/deduped", 
    first.data.ok === true &&
    typeof first.data.url === "string" &&
    typeof first.data.key === "string" &&
    first.data.kind === "cover" &&
    first.data.deduped === false,
    { url: first.data.url, kind: first.data.kind, deduped: first.data.deduped });

  const key = first.data.key as string;
  const row = await prisma.image.findUnique({ where: { key } });
  check("2.1 表里新增一行", Boolean(row), { key });
  if (row) {
    check("2.1 字段与文件一致（bytes/ext/contentType）",
      row.bytes === buf.length && row.ext === "png" && row.contentType === "image/png",
      { bytes: row.bytes, expected: buf.length, ext: row.ext, contentType: row.contentType });
    check("2.1 宽高解析正确（1280x720）", row.width === 1280 && row.height === 720, {
      width: row.width, height: row.height,
    });
    check("2.1 usage = cover", row.usage === "cover", { usage: row.usage });
    check("2.1 uploaderId 已记录", Boolean(row.uploaderId), { uploaderId: row.uploaderId });
    check("2.1 hash 与 key 中的哈希一致", key === `img/${row.hash}.png`, {
      key, hash: row.hash,
    });
  }

  /* ---------- 2.2 重复上传合并 ---------- */
  const firstCreatedAt = row!.createdAt.toISOString();
  const firstUploader = row!.uploaderId;
  await new Promise((r) => setTimeout(r, 30));

  const second = await upload(cookie, buf, "test-second.png", "image");
  check("2.2 第二次上传 deduped=true", second.data.deduped === true, {
    deduped: second.data.deduped,
  });

  const afterRows = await prisma.image.findMany({ where: { key } });
  check("2.2 表里仍只有一行", afterRows.length === 1, { count: afterRows.length });
  check("2.2 usage 更新为 image", afterRows[0].usage === "image", {
    usage: afterRows[0].usage,
  });
  check("2.2 createdAt 未变", afterRows[0].createdAt.toISOString() === firstCreatedAt, {
    before: firstCreatedAt,
    after: afterRows[0].createdAt.toISOString(),
  });
  check("2.2 uploaderId 未变（首次归属）", afterRows[0].uploaderId === firstUploader, {
    got: afterRows[0].uploaderId,
  });
  check("2.2 lastUsedAt 被刷新", afterRows[0].lastUsedAt.getTime() > new Date(firstCreatedAt).getTime(), {
    lastUsedAt: afterRows[0].lastUsedAt.toISOString(),
  });

  /* ---------- 2.3 记录失败不影响上传 ----------
     做法：临时把 Image 表改名，让 recordImage 必然失败，再上传一张新图。
     上传应当照常返回 200 与可用地址。 */
  const buf2 = makePng(640, 480, seed + 1);
  await prisma.$executeRawUnsafe(`ALTER TABLE "Image" RENAME TO "Image_bak"`);
  let third: { status: number; data: Record<string, unknown> };
  try {
    third = await upload(cookie, buf2, "test-third.png", "image");
  } finally {
    await prisma.$executeRawUnsafe(`ALTER TABLE "Image_bak" RENAME TO "Image"`);
  }
  check("2.3 记录失败时上传仍返回 200", third.status === 200, { status: third.status });
  check("2.3 仍返回可用的站内地址",
    third.data.ok === true && typeof third.data.url === "string" && String(third.data.url).startsWith("/img/"),
    { url: third.data.url });

  const thirdRow = await prisma.image.findUnique({ where: { key: String(third.data.key) } });
  check("2.3 该图没有留下记录（预期）", thirdRow === null, { found: Boolean(thirdRow) });

  /* ---------- 清理测试数据 ---------- */
  await prisma.image.deleteMany({ where: { key } });
  console.log("\n已清理测试记录");

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
