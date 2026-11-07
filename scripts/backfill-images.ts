/**
 * 把 OSS 里已有的图片对象补进 Image 表（见 openspec: image-library）。
 *
 * 跑法：npx tsx --env-file=.env scripts/backfill-images.ts
 *
 * 幂等：已登记的对象直接跳过，所以可以反复执行。
 * 容错：单个对象读不出来只计入 skipped，不中断整个流程。
 */
import { createHash } from "node:crypto";
import { prisma } from "../lib/prisma";
import { probeImageSize } from "../lib/images";

/** 只读头部：四种格式的尺寸信息都在前 64KB 内，避免把几 MB 的原图整个拉下来 */
const HEAD_BYTES = 64 * 1024;
/** OSS 单次列举上限 */
const LIST_PAGE = 1000;

type Counters = {
  scanned: number;
  created: number;
  skippedExisting: number;
  skippedUnreadable: number;
  skippedBadKey: number;
};

/** key 形如 img/<sha256>.<ext>，解析出 hash 与 ext；不符合的跳过 */
function parseKey(key: string): { hash: string; ext: string } | null {
  const m = /^img\/([0-9a-f]{64})\.([a-z0-9]+)$/i.exec(key);
  if (!m) return null;
  return { hash: m[1].toLowerCase(), ext: m[2].toLowerCase() };
}

const EXT_CONTENT_TYPE: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

async function main() {
  const { isOssConfigured, readObject, ossEnv } = await import("../lib/oss");

  if (!isOssConfigured()) {
    console.error(
      "❌ OSS 未配置：请在 .env 填写 OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET"
    );
    process.exitCode = 1;
    return;
  }

  // 直接用 ali-oss 客户端列举；lib/oss.ts 没有导出 client，这里按同样的方式构造
  const OSS = (await import("ali-oss")).default;
  const env = ossEnv();
  const client = new OSS({
    region: env.region!,
    bucket: env.bucket!,
    accessKeyId: env.accessKeyId!,
    accessKeySecret: env.accessKeySecret!,
    ...(env.endpoint ? { endpoint: env.endpoint } : {}),
    secure: true,
  });

  const counters: Counters = {
    scanned: 0,
    created: 0,
    skippedExisting: 0,
    skippedUnreadable: 0,
    skippedBadKey: 0,
  };

  let token: string | undefined;
  let page = 0;

  do {
    page += 1;
    const result = await client.listV2({
      prefix: "img/",
      "max-keys": LIST_PAGE,
      ...(token ? { "continuation-token": token } : {}),
    });

    const objects = (result.objects ?? []) as Array<{ name: string; size?: number }>;
    console.log(`第 ${page} 页：${objects.length} 个对象`);

    for (const obj of objects) {
      counters.scanned += 1;
      const key = obj.name;

      const parsed = parseKey(key);
      if (!parsed) {
        counters.skippedBadKey += 1;
        continue;
      }

      // 先查后写：幂等的关键
      const existing = await prisma.image.findUnique({ where: { key }, select: { id: true } });
      if (existing) {
        counters.skippedExisting += 1;
        continue;
      }

      // 只读头部解析尺寸
      let size: { width: number; height: number } | null = null;
      let contentType = EXT_CONTENT_TYPE[parsed.ext] ?? "application/octet-stream";
      let bytes = obj.size ?? 0;
      try {
        const head = await readObject(key, { range: `bytes=0-${HEAD_BYTES - 1}` });
        if (!head) {
          counters.skippedUnreadable += 1;
          continue;
        }
        size = probeImageSize(head.body);
        if (head.contentType) contentType = head.contentType;
        // Range 请求拿到的是片段长度，真实大小优先用列举结果
        if (!bytes) bytes = head.body.length;
      } catch (e) {
        console.warn(`  跳过（读取失败）${key}: ${e instanceof Error ? e.message : e}`);
        counters.skippedUnreadable += 1;
        continue;
      }

      try {
        await prisma.image.create({
          data: {
            key,
            hash: parsed.hash,
            ext: parsed.ext,
            contentType,
            bytes,
            width: size?.width ?? null,
            height: size?.height ?? null,
            usage: "image", // 历史对象分不清当初用途，按正文处理
            // 上传者未知：回填无法得知，留空而不是瞎猜
            uploaderId: null,
          },
        });
        counters.created += 1;
      } catch (e) {
        // 并发或唯一约束：说明别人刚写过，按已存在处理
        console.warn(`  跳过（写入失败）${key}: ${e instanceof Error ? e.message : e}`);
        counters.skippedExisting += 1;
      }
    }

    token = result.nextContinuationToken ?? undefined;
  } while (token);

  console.log("\n=== 回填完成 ===");
  console.log(`扫描对象     : ${counters.scanned}`);
  console.log(`新建记录     : ${counters.created}`);
  console.log(`已存在跳过   : ${counters.skippedExisting}`);
  console.log(`不可读跳过   : ${counters.skippedUnreadable}`);
  console.log(`命名不合规跳过: ${counters.skippedBadKey}`);

  if (counters.skippedUnreadable || counters.skippedBadKey) {
    console.log(
      "\n提示：跳过项不影响其余对象；不可读的可能是对象已被删除，命名不合规的不是本站上传的图片。"
    );
  }
}

main()
  .catch((e) => {
    console.error("回填失败：", e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
