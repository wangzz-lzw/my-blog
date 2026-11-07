// 图片尺寸解析与记录合并的单元测试（openspec: add-image-library，任务 1.2 / 1.3）
// 跑法：npx tsx scripts/image-size-test.ts
import { probeImageSize } from "../lib/images";

const results: boolean[] = [];
const eq = (name: string, actual: unknown, expected: unknown) => {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  results.push(ok);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
};
/** 逐字段比对：不关心对象键序（JPEG 分支的返回值是 {height, width}） */
const safe = (name: string, buf: Buffer, expected: { width: number; height: number } | null) => {
  let got: { width: number; height: number } | null = null;
  let threw = "";
  try {
    got = probeImageSize(buf);
  } catch (e) {
    threw = e instanceof Error ? e.message : String(e);
  }
  const ok =
    !threw &&
    (expected === null
      ? got === null
      : got !== null && got.width === expected.width && got.height === expected.height);
  results.push(ok);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}  got=${got ? `${got.width}x${got.height}` : "null"}${
      threw ? " 抛错:" + threw : ""
    }`
  );
};

/* ---------- 构造各格式的最小头部 ---------- */
function png(w: number, h: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write("IHDR", 12, "ascii");
  b.writeUInt32BE(w, 16);
  b.writeUInt32BE(h, 20);
  return b;
}
function gif(w: number, h: number): Buffer {
  const b = Buffer.alloc(13);
  b.write("GIF89a", 0, "ascii");
  b.writeUInt16LE(w, 6);
  b.writeUInt16LE(h, 8);
  return b;
}
function jpeg(w: number, h: number): Buffer {
  const b = Buffer.alloc(24);
  b[0] = 0xff;
  b[1] = 0xd8;
  b[2] = 0xff;
  b[3] = 0xc0;
  b.writeUInt16BE(17, 4);
  b[6] = 8;
  b.writeUInt16BE(h, 7);
  b.writeUInt16BE(w, 9);
  return b;
}
function webpVp8(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8 ", 12, "ascii");
  b.writeUInt16LE(w & 0x3fff, 26);
  b.writeUInt16LE(h & 0x3fff, 28);
  return b;
}
function webpVp8l(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8L", 12, "ascii");
  // 位流：低 14 位 = w-1，次 14 位 = h-1
  const bits = ((h - 1) & 0x3fff) << 14 | ((w - 1) & 0x3fff);
  b.writeUInt32LE(bits >>> 0, 21);
  return b;
}
function webpVp8x(w: number, h: number): Buffer {
  const b = Buffer.alloc(30);
  b.write("RIFF", 0, "ascii");
  b.write("WEBP", 8, "ascii");
  b.write("VP8X", 12, "ascii");
  b.writeUIntLE(w - 1, 24, 3);
  b.writeUIntLE(h - 1, 27, 3);
  return b;
}

/* ---------- 正常用例 ---------- */
safe("PNG 1920x1080", png(1920, 1080), { width: 1920, height: 1080 });
safe("PNG 1x1", png(1, 1), { width: 1, height: 1 });
safe("PNG 4096x4096", png(4096, 4096), { width: 4096, height: 4096 });
safe("GIF 640x480", gif(640, 480), { width: 640, height: 480 });
safe("JPEG 800x600", jpeg(800, 600), { width: 800, height: 600 });
safe("JPEG 4032x3024", jpeg(4032, 3024), { width: 4032, height: 3024 });
safe("WebP VP8 1000x500", webpVp8(1000, 500), { width: 1000, height: 500 });
safe("WebP VP8L 300x200", webpVp8l(300, 200), { width: 300, height: 200 });
safe("WebP VP8X 1600x900", webpVp8x(1600, 900), { width: 1600, height: 900 });

/* ---------- 容错用例（都必须返回 null 且不抛错） ---------- */
safe("空 buffer", Buffer.alloc(0), null);
safe("5 字节", Buffer.from([1, 2, 3, 4, 5]), null);
safe("随机字节 24", Buffer.from(Array.from({ length: 24 }, (_, i) => (i * 37 + 11) % 256)), null);
safe("截断 PNG（前 10 字节）", png(100, 100).subarray(0, 10), null);
safe("截断 PNG（前 20 字节）", png(100, 100).subarray(0, 20), null);
safe("截断 JPEG（前 6 字节）", jpeg(100, 100).subarray(0, 6), null);
safe("文本文件", Buffer.from("这不是图片，只是一段文字内容而已".repeat(3)), null);
// PNG 魔数但宽高为 0：不是有效图片，按无法解析处理
safe("PNG 魔数但宽高为 0", Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(30)]), null);

/* ---------- JPEG 跳过前置段 ---------- */
{
  // FFD8 后先放一个 APP0(FFE0, 长度 16) 段，SOF0 在它后面
  const app0 = Buffer.alloc(18);
  app0[0] = 0xff;
  app0[1] = 0xe0;
  app0.writeUInt16BE(16, 2);
  const sof = jpeg(1234, 567);
  const combined = Buffer.concat([Buffer.from([0xff, 0xd8]), app0.subarray(2), sof.subarray(2)]);
  safe("JPEG 跳过 APP0 段找到 SOF", combined, { width: 1234, height: 567 });
}

const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (failed) process.exit(1);
