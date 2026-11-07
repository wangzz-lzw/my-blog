"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatBytes, IMAGE_USAGES, USAGE_LABEL, type ImageUsage } from "@/lib/images";
import { useFeedback } from "@/components/feedback/FeedbackProvider";

/**
 * 图床网格（见 openspec: image-library）。
 *
 * 只读：浏览、筛选、搜索、取用地址。没有删除或修改入口——图片是跨实体共用的
 * （同一张可能是某篇封面、另一篇的正文配图、某个读者的头像），删错不可恢复。
 *
 * 翻页/筛选/搜索走 URL 查询参数让服务端重渲染，沿用后台其他列表页的做法
 * （「/admin/tags」「/admin/posts」都这样），不新开 GET 接口。
 */

export type ImageCard = {
  id: string;
  key: string;
  hash: string;
  ext: string;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
  usage: string;
  createdAt: string;
};

/** 站内地址：页面里只出现 /img/…，OSS 直链不外泄 */
export function siteSrc(key: string): string {
  return `/img/${key.replace(/^img\//, "")}`;
}

/** 图床里的一张图。`onPick` 有值时是选择模式，多一个"选用"动作 */
export function ImageTile({
  image,
  onPick,
}: {
  image: ImageCard;
  onPick?: (image: ImageCard) => void;
}) {
  const [broken, setBroken] = useState(false);
  const { alert: notify } = useFeedback();

  const copy = async () => {
    const url = siteSrc(image.key);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      void notify({ title: "已复制地址", description: url });
    } catch {
      void notify({ title: "复制失败", description: "浏览器拒绝了剪贴板，请手动选中地址复制。" });
    }
  };

  const dims = image.width && image.height ? `${image.width}×${image.height}` : "尺寸未知";

  return (
    <figure className="img-tile">
      <div className="img-tile-frame">
        {broken ? (
          // 对象可能已被手工删掉：给可辨认的占位，不显示破图图标
          <span className="img-tile-broken" role="img" aria-label="图片已不存在">
            ✕
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={siteSrc(image.key)}
            alt=""
            loading="lazy"
            decoding="async"
            onError={() => setBroken(true)}
            onClick={onPick ? () => onPick(image) : undefined}
            className={onPick ? "img-tile-thumb pickable" : "img-tile-thumb"}
          />
        )}
        {onPick && !broken && (
          <button
            type="button"
            className="img-tile-pick"
            onClick={() => onPick(image)}
          >
            选用
          </button>
        )}
      </div>
      <figcaption className="img-tile-meta">
        <span className="img-tile-dim">{dims}</span>
        <span className="img-tile-size">{formatBytes(image.bytes)}</span>
        <span className="img-tile-usage" data-usage={image.usage}>
          {USAGE_LABEL[image.usage as ImageUsage] ?? image.usage}
        </span>
        <span className="img-tile-time">{image.createdAt}</span>
        <button type="button" className="img-tile-copy" onClick={copy}>
          复制地址
        </button>
      </figcaption>
    </figure>
  );
}

export function ImageGrid({
  images,
  onPick,
}: {
  images: ImageCard[];
  onPick?: (image: ImageCard) => void;
}) {
  return (
    <div className="img-grid">
      {images.map((img) => (
        <ImageTile key={img.id} image={img} onPick={onPick} />
      ))}
    </div>
  );
}

/** 图床页的筛选条 + 网格 + 分页 */
export function ImageLibrary({
  images,
  total,
  page,
  pageCount,
  usage,
  q,
  configured,
}: {
  images: ImageCard[];
  total: number;
  page: number;
  pageCount: number;
  usage: ImageUsage | null;
  q: string;
  configured: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [draft, setDraft] = useState(q);

  /** 改查询参数并回到第一页；空值要删掉，别在 URL 里留 usage=&q= */
  const go = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("page"); // 换筛选条件时回到第一页
    const qs = next.toString();
    router.push(qs ? `/admin/images?${qs}` : "/admin/images");
  };

  if (!configured) {
    return (
      <div className="admin-notice">
        <strong>图片存储未配置</strong>
        <p>
          请在 <code>.env</code> 填写 OSS_REGION / OSS_BUCKET / OSS_ACCESS_KEY_ID /
          OSS_ACCESS_KEY_SECRET，然后重启服务。配置齐全后，已有的图片可以运行{" "}
          <code>npx tsx --env-file=.env scripts/backfill-images.ts</code> 补入。
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="img-filter">
        <form
          className="img-search"
          onSubmit={(e) => {
            e.preventDefault();
            go({ q: draft.trim() || null });
          }}
        >
          <input
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="按标识 / 哈希片段搜索…"
            aria-label="搜索图片"
          />
          <button type="submit" className="btn btn-sm ghost">
            搜索
          </button>
          {q && (
            <button
              type="button"
              className="btn btn-sm ghost"
              onClick={() => {
                setDraft("");
                go({ q: null });
              }}
            >
              清除
            </button>
          )}
        </form>

        <div className="img-usage-filter" role="group" aria-label="按用途筛选">
          <button
            type="button"
            className={usage === null ? "active" : ""}
            onClick={() => go({ usage: null })}
          >
            全部
          </button>
          {IMAGE_USAGES.map((u) => (
            <button
              key={u}
              type="button"
              className={usage === u ? "active" : ""}
              onClick={() => go({ usage: u })}
            >
              {USAGE_LABEL[u]}
            </button>
          ))}
        </div>
      </div>

      <p className="admin-sub img-count">
        共 {total} 张{usage ? `（${USAGE_LABEL[usage]}）` : ""}
        {q ? `，匹配「${q}」` : ""}　第 {page} / {pageCount} 页
      </p>

      {images.length === 0 ? (
        <div className="admin-notice">
          <strong>{total === 0 && !q && !usage ? "图床还是空的" : "没有匹配的图片"}</strong>
          <p>
            {total === 0 && !q && !usage ? (
              <>
                先去写一篇文章上传张封面，或运行{" "}
                <code>npx tsx --env-file=.env scripts/backfill-images.ts</code> 把 OSS
                里已有的图片补进来。
              </>
            ) : (
              <>换个关键词，或把用途筛选切回「全部」。</>
            )}
          </p>
        </div>
      ) : (
        <ImageGrid images={images} />
      )}

      {pageCount > 1 && (
        <nav className="img-pager" aria-label="分页">
          {page > 1 ? (
            <Link href={`/admin/images?${withPage(params, page - 1)}`} className="btn btn-sm ghost">
              ← 上一页
            </Link>
          ) : (
            <span className="img-pager-gap" />
          )}
          <span className="img-pager-now">
            {page} / {pageCount}
          </span>
          {page < pageCount ? (
            <Link href={`/admin/images?${withPage(params, page + 1)}`} className="btn btn-sm ghost">
              下一页 →
            </Link>
          ) : (
            <span className="img-pager-gap" />
          )}
        </nav>
      )}
    </>
  );
}

function withPage(params: URLSearchParams, page: number): string {
  const next = new URLSearchParams(params.toString());
  next.set("page", String(page));
  return next.toString();
}
