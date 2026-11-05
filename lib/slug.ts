export function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]/gu, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || `post-${Date.now()}`;
}

/**
 * 动态路由段（`[slug]`）到达时是**未解码**的原始片段：
 * 中文 slug 会以 `%E7%AC%AC…` 的形式传进来，直接拿去查库必然查不到。
 * 统一在页面入口解码一次；已经解码过的字符串再解码会抛错，保留原值即可。
 */
export function decodeSlugParam(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
