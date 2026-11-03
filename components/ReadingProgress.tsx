"use client";

import { useEffect, useRef } from "react";

/**
 * 阅读进度条：固定在页面顶部的 2px 霓虹渐变条，随滚动增长。
 * 无其他副作用，沉浸模式下保留（作为进度指示）。
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;

    const update = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      el.style.width =
        max > 0 ? `${Math.min(100, (doc.scrollTop / max) * 100)}%` : "0%";
    };

    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div ref={barRef} className="reading-progress" aria-hidden="true" />
  );
}
