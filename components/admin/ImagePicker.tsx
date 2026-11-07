"use client";

import { useEffect, useState } from "react";
import { Dialog } from "radix-ui";
import { ImageGrid, type ImageCard } from "@/components/admin/ImageLibrary";

/**
 * 从图床挑一张图（见 openspec: image-library）。
 *
 * 行为交给 Radix Dialog：焦点陷阱、Esc 关闭、aria 与焦点归还都不用自己写
 * （FeedbackProvider 里的 AlertDialog 也是这么用的）。
 *
 * 只接封面这一个入口——正文插入与头像暂不做（proposal 的「不在本次范围」）。
 */
export function ImagePicker({
  open,
  onOpenChange,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (image: ImageCard) => void;
}) {
  const [images, setImages] = useState<ImageCard[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [usage, setUsage] = useState<string>("");

  // 每次打开都重新取一次：刚上传的图应该立刻能选到
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError("");

    const qs = new URLSearchParams({ page: "1" });
    if (usage) qs.set("usage", usage);
    if (query) qs.set("q", query);

        fetch(`/api/images?${qs.toString()}`, { cache: "no-store" })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? "读取图片失败");
          if (!cancelled) {
            // 接口给的是 ISO 字符串，图上只显示日期部分
            setImages(
              (data.images ?? []).map(
                (r: {
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
                }) => ({
                  id: r.id,
                  key: r.key,
                  hash: r.hash,
                  ext: r.ext,
                  contentType: r.contentType,
                  bytes: r.bytes,
                  width: r.width,
                  height: r.height,
                  usage: r.usage,
                  createdAt: r.createdAt.slice(0, 10),
                })
              )
            );
          }
        })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "读取图片失败");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, usage, query]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fb-overlay" />
        <Dialog.Content className="picker-dialog" aria-describedby={undefined}>
          <div className="picker-head">
            <Dialog.Title className="picker-title">从图床选择封面</Dialog.Title>
            <Dialog.Close className="picker-close" aria-label="关闭">
              ✕
            </Dialog.Close>
          </div>

          <form
            className="img-filter picker-filter"
            onSubmit={(e) => {
              e.preventDefault();
              setQuery(draft.trim());
            }}
          >
            <div className="img-search">
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
            </div>
            <div className="img-usage-filter" role="group" aria-label="按用途筛选">
              <button
                type="button"
                className={usage === "" ? "active" : ""}
                onClick={() => setUsage("")}
              >
                全部
              </button>
              <button
                type="button"
                className={usage === "cover" ? "active" : ""}
                onClick={() => setUsage("cover")}
              >
                封面
              </button>
              <button
                type="button"
                className={usage === "image" ? "active" : ""}
                onClick={() => setUsage("image")}
              >
                正文
              </button>
              <button
                type="button"
                className={usage === "avatar" ? "active" : ""}
                onClick={() => setUsage("avatar")}
              >
                头像
              </button>
            </div>
          </form>

          <div className="picker-body">
            {error ? (
              <div className="admin-notice">
                <strong>读取图片失败</strong>
                <p>{error}</p>
              </div>
            ) : loading ? (
              <p className="admin-sub">读取中…</p>
            ) : images.length === 0 ? (
              <div className="admin-notice">
                <strong>没有可选的图片</strong>
                <p>
                  先上传一张封面，或者到 <code>/admin/images</code> 看看图床里有没有图。
                </p>
              </div>
            ) : (
              <ImageGrid
                images={images}
                onPick={(img) => {
                  onPick(img);
                  onOpenChange(false);
                }}
              />
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
