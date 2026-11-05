import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  isOssConfigured,
  objectExists,
  siteImagePath,
  uploadImage,
} from "@/lib/oss";

export const runtime = "nodejs";

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** 上传图片到阿里云 OSS（需登录）：kind = avatar | cover */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  if (!isOssConfigured()) {
    return NextResponse.json(
      {
        error:
          "OSS 未配置：请在 .env 填写 OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET",
      },
      { status: 503 }
    );
  }

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kindRaw = String(form?.get("kind") ?? "image");
  const kind = /^(avatar|cover|image)$/.test(kindRaw) ? kindRaw : "image";

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "缺少文件" }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: "图片不能超过 5MB" }, { status: 400 });
  }
  const ext = IMAGE_TYPES[file.type];
  if (!ext) {
    return NextResponse.json(
      { error: "仅支持 JPG / PNG / WebP / GIF" },
      { status: 400 }
    );
  }

  // 内容寻址：key 由文件 sha256 决定 —— 同一张图重复上传只会命中同一个对象；
  // 头像/封面共用一个命名空间，跨用途也不会重复存。
  const buf = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buf).digest("hex");
  const key = `img/${hash}.${ext}`;

  try {
    const exists = await objectExists(key);
    if (!exists) {
      await uploadImage(key, buf, file.type);
    }
    // 只返回站内地址：OSS 的桶名/地域不出现在响应里（/img 路由负责代理取对象）
    const url = siteImagePath(key);
    return NextResponse.json({ ok: true, url, key, kind, deduped: exists });
  } catch (e) {
    const message = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ error: `上传失败：${message}` }, { status: 500 });
  }
}
