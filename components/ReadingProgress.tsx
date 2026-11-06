"use client";

import { useEffect, useRef } from "react";
import { currentScrollPane, onPaneScroll, paneScrollMetrics } from "@/lib/scroll-pane";

/**
 * 阅读进度条：固定在页面顶部的 2px 霓虹渐变条，随滚动增长。
 * 滚动的可能是根容器（整页滚动已从 document 搬到根容器），
 * 所以位置一律问 currentScrollPane()，不写死 documentElement。
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const pane = currentScrollPane();
    const update = () => {
      const { top, view, total } = paneScrollMetrics(pane);
      const max = total - view;
      el.style.width = max > 0 ? `${Math.min(100, (top / max) * 100)}%` : "0%";
    };

    update();
    const off = onPaneScroll(pane, update);
    window.addEventListener("resize", update);
    return () => {
      off();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div ref={barRef} className="reading-progress" aria-hidden="true" />
  );
}