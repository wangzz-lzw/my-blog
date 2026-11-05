/**
 * 图片地址统一收口：对外只出现本站地址，桶名/地域/内容哈希的 OSS 直链不出现在页面里。
 * - 新上传的图存的就是站内路径 `/img/<key>`
 * - 历史数据里可能是 `https://<bucket>.<region>.aliyuncs.com/<key>`，渲染时改写成 `/img/<key>`
 * - 其它外链（CDN、图床）原样返回
 */
/**
 * 只认「OSS 桶 + img/ 前缀」这一种形态，别把正文里别人的图改成站内路径：
 * 例如 dashscope.aliyuncs.com、help-static-aliyun-doc.aliyuncs.com 都不是我们的对象，
 * 这类外链要原样保留。
 */
const OUR_OSS_IMG_RE =
  /^https?:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.aliyuncs\.com\/img\/([A-Za-z0-9._-]+)$/i;

export function toSiteImageUrl(url?: string | null): string | undefined {
  const value = url?.trim();
  if (!value) return undefined;
  if (value.startsWith("/img/")) return value;
  const match = value.match(OUR_OSS_IMG_RE);
  if (match) return `/img/${match[1]}`;
  return value;
}