import OSS from "ali-oss";

type OssConfig = {
  region: string;
  bucket: string;
  endpoint?: string;
  accessKeyId: string;
  accessKeySecret: string;
  publicBaseUrl?: string;
  acl: string;
};

/** 从 .env 读取 OSS 配置（允许缺省，由 isOssConfigured 判断可用性） */
export function ossEnv(): Partial<OssConfig> {
  return {
    region: process.env.OSS_REGION?.trim() || undefined,
    bucket: process.env.OSS_BUCKET?.trim() || undefined,
    endpoint: process.env.OSS_ENDPOINT?.trim() || undefined,
    accessKeyId: process.env.OSS_ACCESS_KEY_ID?.trim() || undefined,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET?.trim() || undefined,
    publicBaseUrl: process.env.OSS_PUBLIC_BASE_URL?.trim() || undefined,
    acl: process.env.OSS_ACL?.trim() || "public-read",
  };
}

/** 必需项是否齐全：region / bucket / AK / SK */
export function isOssConfigured(): boolean {
  const e = ossEnv();
  return Boolean(e.region && e.bucket && e.accessKeyId && e.accessKeySecret);
}

let cached: OSS | null = null;

function client(): OSS {
  if (cached) return cached;
  const e = ossEnv();
  if (!e.region || !e.bucket || !e.accessKeyId || !e.accessKeySecret) {
    throw new Error("OSS 未配置");
  }
  cached = new OSS({
    region: e.region,
    bucket: e.bucket,
    accessKeyId: e.accessKeyId,
    accessKeySecret: e.accessKeySecret,
    ...(e.endpoint ? { endpoint: e.endpoint } : {}),
    secure: true,
  });
  return cached;
}

/**
 * 自定义域名规范化：必须是域名（可带协议/路径）。
 * 传成账号别名（形如 xxx@onaliyun.com）等非法值时忽略，回退默认 bucket 域名，
 * 避免生成 "lzw@…onaliyun.com/avatar/x.jpg" 这种坏 URL。
 */
function normalizeBaseUrl(raw?: string): string | undefined {
  const v = raw?.trim();
  if (!v) return undefined;
  const bare = v.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
  if (!/^[a-z0-9.-]+\.[a-z]{2,}(?::\d+)?(\/.*)?$/i.test(bare)) {
    return undefined;
  }
  return `https://${bare}`;
}

/** 对象的公开访问地址：优先自定义域名，否则默认 bucket 域名 */
export function publicUrl(key: string): string {
  const e = ossEnv();
  const base = normalizeBaseUrl(e.publicBaseUrl);
  if (base) return `${base}/${key}`;
  return `https://${e.bucket}.${e.region}.aliyuncs.com/${key}`;
}

/** 对象是否已存在（用于内容去重：同图不重复上传） */
export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().head(key);
    return true;
  } catch (e) {
    const code = (e as { code?: string; status?: number }).code;
    const status = (e as { status?: number }).status;
    if (code === "NoSuchKey" || status === 404) return false;
    throw e;
  }
}

/** 上传图片并返回公开 URL */
export async function uploadImage(
  key: string,
  data: Buffer,
  contentType: string
): Promise<string> {
  const e = ossEnv();
  const c = client();
  await c.put(key, data, {
    headers: {
      "Content-Type": contentType,
      // 单对象读权限，避免整桶私有导致图片 403
      "x-oss-object-acl": e.acl || "public-read",
    },
  });
  return publicUrl(key);
}
