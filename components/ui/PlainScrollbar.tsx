"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 给「原生滚动的元素」叠一根只读自绘轨道（见 openspec: editor-scroll-sync）。
 *
 * 为什么不用 `ScrollArea`：它依赖「把 .sb-content 搬进库的 viewport」这套契约，
 * 而 `<textarea>` 的滚动是元素自身的行为，搬进去会让库试图去滚一个不可滚的容器；
 * 而且 textarea 的 `resize: vertical` 与库的高度管理互相打架。
 *
 * 所以这里只做三件事：读宿主的滚动比例画滑块、把拖动换算成宿主的 scrollTop、
 * 宿主尺寸变化时重算。滚动本身仍然由浏览器处理，滚轮/键盘/触摸都不受影响，
 * 也绝不会把事件回灌给宿主造成回声。
 */

type Props = {
  /** 真正在滚的那个元素（textarea、div 等） */
  targetRef: React.RefObject<HTMLElement | null>;
  /** 轨道宿主的类名（容器需要 position: relative） */
  className?: string;
  /** 无障碍名称，读屏时说明这根条控制的是什么 */
  label?: string;
  /**
   * 内容版本号：父组件在内容变化时递增即可触发重算。
   * textarea 的 scrollHeight 由 value 决定，而 value 是受控的——改 value 不会
   * 触发 resize 也不一定触发 input，所以必须由父级显式告知。
   */
  version?: unknown;
};

/** 滑块最短像素高度：内容极长时也要能看见、能抓 */
const MIN_HANDLE = 24;

export function PlainScrollbar({ targetRef, className, label, version }: Props) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const handleRef = useRef<HTMLDivElement | null>(null);
  const [ratio, setRatio] = useState({ top: 0, size: 0, visible: false, p: 0 });
  const dragging = useRef(false);
  /** 让外部（父组件）在内容变化时主动触发一次重算，而不是重建整个监听 */
  const recomputeRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const el = targetRef.current;
    const track = trackRef.current;
    if (!el || !track) return;

    let frame = 0;

    const compute = () => {
      frame = 0;
      const trackH = track.clientHeight;
      const max = el.scrollHeight - el.clientHeight;
      if (max <= 1 || trackH <= 0) {
        setRatio((prev) => (prev.visible ? { top: 0, size: 0, visible: false, p: 0 } : prev));
        return;
      }
      const size = Math.max(MIN_HANDLE, (el.clientHeight / el.scrollHeight) * trackH);
      const travel = Math.max(0, trackH - size);
      const p = el.scrollTop / max;
      const top = p * travel;
      setRatio({ top, size, visible: true, p });
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(compute);
    };
    recomputeRef.current = schedule;

    const onPointerDown = (e: PointerEvent) => {
      const handle = handleRef.current;
      if (!handle) return;
      const hitHandle = handle.contains(e.target as Node);
      // 点轨道空白处：直接翻到那个比例（和系统滚动条一致的手感）
      if (!hitHandle) {
        const rect = track.getBoundingClientRect();
        const rel = (e.clientY - rect.top) / Math.max(1, rect.height);
        el.scrollTop = rel * (el.scrollHeight - el.clientHeight);
        schedule();
        return;
      }
      dragging.current = true;
      handle.setPointerCapture(e.pointerId);
      e.preventDefault();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      const trackH = track.clientHeight;
      const size = Math.max(MIN_HANDLE, (el.clientHeight / el.scrollHeight) * trackH);
      const travel = Math.max(1, trackH - size);
      const rect = track.getBoundingClientRect();
      const grabbed = e.clientY - rect.top - size / 2;
      const p = Math.max(0, Math.min(1, grabbed / travel));
      el.scrollTop = p * (el.scrollHeight - el.clientHeight);
      schedule();
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      const handle = handleRef.current;
      if (handle?.hasPointerCapture(e.pointerId)) handle.releasePointerCapture(e.pointerId);
    };

    compute();
    el.addEventListener("scroll", schedule, { passive: true });
    // textarea 被程序化/用户输入改内容时 scrollHeight 会变，但不一定触发 resize：
    // 补 input 事件，否则滑块高度会停在最初那一帧的量值上
    el.addEventListener("input", schedule);
    track.addEventListener("pointerdown", onPointerDown);
    // 拖动可能移出轨道，监听挂在 window 上才不会中途丢
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("resize", schedule);

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      // 宿主自己会变高（textarea 的 resize 手柄），轨道也会随窗口变
      observer = new ResizeObserver(schedule);
      observer.observe(el);
      observer.observe(track);
    }

    // 挂载这一帧轨道可能还没有高度（父级布局未定），量不到就不会显示。
    // 补两拍：下一帧一次、稍后再一次，保证初始状态也能算出比例。
    const firstFrame = requestAnimationFrame(compute);
    const lateTimer = window.setTimeout(compute, 120);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      cancelAnimationFrame(firstFrame);
      window.clearTimeout(lateTimer);
      el.removeEventListener("scroll", schedule);
      el.removeEventListener("input", schedule);
      track.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      recomputeRef.current = null;
    };
  }, [targetRef]);

  // 内容变化（受控 textarea 改 value 时不会触发 resize/input）由父级显式通知
  useEffect(() => {
    recomputeRef.current?.();
  }, [version]);

  return (
    <div
      ref={trackRef}
      className={`psb${className ? ` ${className}` : ""}`}
      data-visible={ratio.visible ? "1" : undefined}
      role="scrollbar"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(ratio.p * 100)}
      tabIndex={-1}
    >
      <div
        ref={handleRef}
        className="psb-handle"
        style={{
          height: `${ratio.size}px`,
          // 位置走 CSS 变量：CSS 里已经用 translate 做水平居中，
          // 再用 inline transform 会把它整体覆盖掉，滑块会失位
          ["--psb-top" as string]: `${ratio.top}px`,
        }}
      />
    </div>
  );
}
