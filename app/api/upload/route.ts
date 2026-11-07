import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  isOssConfigured,
  objectExists,
  siteImagePath,
  uploadImage,
} from "@/lib/oss";
import { probeImageSize, recordImage, type ImageUsage } from "@/lib/images";

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

    /**
     * 记一条图床记录（见 openspec: image-library）。
     *
     * 这是本文件里唯一一处故意吞掉异常的地方：图片此刻已经在 OSS 里了，
     * 写库失败不该让用户以为上传失败去重传一遍。失败只影响这张图能否出现在图床里。
     *
     * 放在 put 之后写：先写记录再上传的话，一旦上传失败就会留下指向不存在对象的记录，
     * 图床里会慢慢长出一堆破图。
     */
    try {
      const size = probeImageSize(buf);
      await recordImage({
        key,
        hash,
        ext,
        contentType: file.type,
        bytes: file.size,
        width: size?.width ?? null,
        height: size?.height ?? null,
        usage: kind as ImageUsage,
        uploaderId: session.user.id,
      });
    } catch (e) {
      console.error("[upload] 图片记录写入失败（不影响上传）", key, e);
    }

    // 只返回站内地址：OSS 的桶名/地域不出现在响应里（/img 路由负责代理取对象）
    const url = siteImagePath(key);
    return NextResponse.json({ ok: true, url, key, kind, deduped: exists });
  } catch (e) {
    const message = e instanceof Error ? e.message : "上传失败";
    return NextResponse.json({ error: `上传失败：${message}` }, { status: 500 });
  }
}
