"use client";

import { useEffect, useState } from "react";

/**
 * 沉浸式阅读模式：隐藏页头/页脚/评论区/背景网格，收窄正文栏、放大字号行距，
 * 只保留文章内容 + 本按钮。离开页面时自动清除 body 状态。
 */
export function ImmersiveToggle() {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const body = document.body;
    body.classList.toggle("immersive", on);
    return () => body.classList.remove("immersive");
  }, [on]);

  return (
    <button
      className="immersive-btn"
      onClick={() => setOn((v) => !v)}
      aria-pressed={on}
    >
      {on ? "✕ 退出沉浸阅读" : "◈ 沉浸阅读"}
    </button>
  );
}
