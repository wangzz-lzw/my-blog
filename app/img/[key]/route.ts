import { NextRequest, NextResponse } from "next/server";
import { isOssConfigured, readObject } from "@/lib/oss";

export const runtime = "nodejs";

/** 对外路径是 /img/<文件名>；对象在桶里的前缀固定为 img/，不允许穿越 */
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * 图片代理：`/img/<key>` → 服务端从 OSS 取对象后回给浏览器。
 * 页面里因此只出现本站地址，桶名/地域/直链都不外泄；
 * 内容寻址的 key 不可变，可以给长缓存。
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ key: string }> }
) {
  const { key } = await params;

  if (!NAME_RE.test(key) || key.includes("..")) {
    return new NextResponse("Not found", { status: 404 });
  }
  if (!isOssConfigured()) {
    return new NextResponse("OSS not configured", { status: 503 });
  }

  let object: Awaited<ReturnType<typeof readObject>> = null;
  try {
    object = await readObject(`img/${key}`);
  } catch (e) {
    const message = e instanceof Error ? e.message : "OSS read failed";
    return new NextResponse(message, { status: 502 });
  }
  if (!object) {
    return new NextResponse("Not found", { status: 404 });
  }

  return new NextResponse(new Uint8Array(object.body), {
    headers: {
      "Content-Type": object.contentType,
      "Content-Length": String(object.body.byteLength),
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}