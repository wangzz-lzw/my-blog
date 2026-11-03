/**
 * 估算文章阅读时长（分钟），返回最小 1。
 * 中文按 400 字/分钟，西文按 200 词/分钟；不入库，实时计算。
 */
export function readTime(content: string): number {
  const text = content.trim();
  if (!text) return 1;

  const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff]/g) ?? []).length;
  const latinWords = text
    .replace(/[\u3400-\u4dbf\u4e00-\u9fff]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  const minutes = cjk / 400 + latinWords / 200;
  return Math.max(1, Math.round(minutes));
}
