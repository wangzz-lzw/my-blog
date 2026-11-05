"use client";

import { useCallback, useEffect, useState } from "react";

/** 滚动超过多少视口高度后，浮出的回到顶部按钮才出现 */
const SHOW_AFTER = 0.75;

function scrollToTop() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

/**
 * 回到顶部：
 * 1. 页脚那个 `<a href="#top">` 由这里接管，改成平滑滚动（无 JS 时仍是普通锚点）；
 * 2. 滚过一屏多以后，右下角浮出一个小方块按钮，省得回到页脚去点。
 * 减弱动效下直接跳，不做缓动。
 */
export function BackToTop() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // 不节流：这里只做一次数值比较，React 对相同值会 bail out。
    // （曾经用 rAF 节流，结果后台标签页 rAF 不跑，guard 卡住导致按钮永不出现）
    const onScroll = () => {
      setShown(window.scrollY > window.innerHeight * SHOW_AFTER);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const onClick = useCallback(() => {
    scrollToTop();
  }, []);

  return (
    <button
      type="button"
      className={`to-top${shown ? " is-shown" : ""}`}
      onClick={onClick}
      aria-label="回到顶部"
      aria-hidden={!shown}
      tabIndex={shown ? 0 : -1}
    >
      <span aria-hidden="true">↑</span>
    </button>
  );
}