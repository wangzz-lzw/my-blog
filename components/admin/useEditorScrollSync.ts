"use client";

import { useCallback, useEffect, useRef } from "react";
import {
  SyncController,
  type ScrollTarget,
  type SyncSide,
} from "@/components/admin/editor-scroll-sync";
import { viewportOf } from "@/lib/scroll-pane";

/**
 * 把分屏两侧接上联动（见 openspec: editor-scroll-sync）。
 *
 * 职责边界：这个 hook 只负责「找元素、量位置、挂监听、把事件转给 SyncController」。
 * 所有判断逻辑都在 SyncController 里（纯逻辑，可单测）。这样回声消除这类容易
 * 出错的地方只有一处实现，改起来不用担心两边不同步。
 */

/** 内容变化后等一拍再量：连续输入时不要每次都跑一遍布局 */
const REMEASURE_DEBOUNCE = 200;

type Options = {
  /** 左侧 textarea */
  writeRef: React.RefObject<HTMLTextAreaElement | null>;
  /** 右侧预览的 ScrollArea host（里层才有真正的 viewport） */
  previewRef: React.RefObject<HTMLDivElement | null>;
  /** 正文源码：块位置要跟着它重测 */
  content: string;
  /** 是否分屏（单栏视图下完全不挂监听） */
  active: boolean;
  /** 用户是否开着联动 */
  enabled: boolean;
};

function measureBlocks(preview: HTMLElement): { lines: number[]; offsets: number[] } {
  const vp = viewportOf(preview);
  if (!vp) return { lines: [], offsets: [] };
  const base = vp.getBoundingClientRect().top - vp.scrollTop;
  const nodes = Array.from(
    vp.querySelectorAll<HTMLElement>(".editor-prose [data-src]")
  );
  const lines: number[] = [];
  const offsets: number[] = [];
  for (const el of nodes) {
    const line = Number(el.getAttribute("data-src"));
    if (!Number.isFinite(line) || line <= 0) continue;
    lines.push(line);
    offsets.push(el.getBoundingClientRect().top - base);
  }
  return { lines, offsets };
}

export function useEditorScrollSync({
  writeRef,
  previewRef,
  content,
  active,
  enabled,
}: Options) {
  const controllerRef = useRef<SyncController | null>(null);
  const remeasureTimer = useRef(0);

  /** 量一次并灌进控制器 */
  const remeasure = useCallback(() => {
    const write = writeRef.current;
    const previewHost = previewRef.current;
    const c = controllerRef.current;
    if (!write || !previewHost || !c) return;
    const vp = viewportOf(previewHost);
    if (!vp) return;

    const cs = getComputedStyle(write);
    const lineHeight = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.75;
    const paddingTop = parseFloat(cs.paddingTop) || 0;
    c.setMetrics(lineHeight, paddingTop);

    const { lines, offsets } = measureBlocks(previewHost);
    c.setBlocks(lines, offsets);
  }, [writeRef, previewRef]);

  // 控制器只在挂载时建一次：它持有两侧元素与缓存
  useEffect(() => {
    const write = writeRef.current;
    const previewHost = previewRef.current;
    if (!write || !previewHost) return;
    const vp = viewportOf(previewHost);
    if (!vp) return;

    const c = new SyncController(
      Object.assign(write as unknown as ScrollTarget, {
        getLineHeight: () => parseFloat(getComputedStyle(write).lineHeight) || 16,
        getPaddingTop: () => parseFloat(getComputedStyle(write).paddingTop) || 0,
      }),
      vp as unknown as ScrollTarget
    );
    controllerRef.current = c;
    return () => {
      controllerRef.current = null;
    };
  }, [writeRef, previewRef]);

  // 只在分屏 + 开启联动时挂监听；切走就解绑（不是挂了再判断）
  useEffect(() => {
    const c = controllerRef.current;
    const write = writeRef.current;
    const previewHost = previewRef.current;
    if (!c || !write || !previewHost) return;
    const vp = viewportOf(previewHost);
    if (!vp) return;

    c.setEnabled(true);
    if (!active) return;

    remeasure();

    const onWrite = () => c.onScroll("write");
    const onPreview = () => c.onScroll("preview");

    write.addEventListener("scroll", onWrite, { passive: true });
    vp.addEventListener("scroll", onPreview, { passive: true });

    // 用户真实输入 → 该侧成为驱动方（由控制器内部靠 guard 判定，这里只是尽早唤醒）
    const wake = (side: SyncSide) => () => {
      if (!c.isEnabled()) return;
      // 指针/键盘落在哪侧，就让哪侧在下一帧主导
      if (side === "write") c.onScroll("write");
      else c.onScroll("preview");
    };
    const onWriteInput = wake("write");
    const onPreviewInput = wake("preview");
    write.addEventListener("wheel", onWriteInput, { passive: true });
    write.addEventListener("keydown", onWriteInput);
    vp.addEventListener("wheel", onPreviewInput, { passive: true });

    return () => {
      write.removeEventListener("scroll", onWrite);
      vp.removeEventListener("scroll", onPreview);
      write.removeEventListener("wheel", onWriteInput);
      write.removeEventListener("keydown", onWriteInput);
      vp.removeEventListener("wheel", onPreviewInput);
    };
  }, [active, remeasure, writeRef, previewRef]);

  // 联动开关：关掉后不再驱动对侧；重新打开立刻以编辑区为基准对齐
  useEffect(() => {
    const c = controllerRef.current;
    if (!c) return;
    c.setEnabled(enabled);
    if (enabled && active) {
      remeasure();
      c.syncFromWrite();
    }
  }, [enabled, active, remeasure]);

  // 内容变化（debounce）后重测，并以编辑区为基准重新对齐
  useEffect(() => {
    if (!active || !enabled) return;
    window.clearTimeout(remeasureTimer.current);
    remeasureTimer.current = window.setTimeout(() => {
      remeasure();
      controllerRef.current?.syncFromWrite();
    }, REMEASURE_DEBOUNCE);
    return () => window.clearTimeout(remeasureTimer.current);
  }, [content, active, enabled, remeasure]);

  // 容器尺寸变化（全屏切换、窗口缩放、textarea 被拖高、图片加载）→ 重测
  useEffect(() => {
    if (!active) return;
    const write = writeRef.current;
    const previewHost = previewRef.current;
    if (!write || !previewHost) return;
    if (typeof ResizeObserver === "undefined") return;

    let frame = 0;
    const onResize = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        remeasure();
      });
    };
    const observer = new ResizeObserver(onResize);
    observer.observe(write);
    observer.observe(previewHost);
    const vp = viewportOf(previewHost);
    if (vp) observer.observe(vp);
    const prose = previewHost.querySelector(".editor-prose");
    if (prose) observer.observe(prose);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [active, remeasure, writeRef, previewRef]);
}
