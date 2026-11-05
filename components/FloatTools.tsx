"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";

/** 滚动超过多少视口高度后，回到顶部按钮才可用 */
const SHOW_AFTER = 0.75;

function scrollToTop() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
}

type ToolProps = {
  label: string;
  glyph: string;
  onClick: () => void;
  active?: boolean;
  /** 不可用时的静默态（留在原位，避免位置跳动） */
  idle?: boolean;
};

/** 一个方块按钮 + 悬停浮出的气泡标签（不用原生 title：慢、样式不可控） */
function FloatButton({ label, glyph, onClick, active, idle }: ToolProps) {
  return (
    <button
      type="button"
      className={`float-btn${active ? " is-active" : ""}${idle ? " is-idle" : ""}`}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      tabIndex={idle ? -1 : 0}
      aria-hidden={idle || undefined}
    >
      <span className="float-btn__glyph" aria-hidden="true">
        {glyph}
      </span>
      <span className="float-bubble" role="tooltip" aria-hidden="true">
        {label}
      </span>
    </button>
  );
}

/**
 * 文章页右下的一组浮动控件：沉浸阅读 + 回到顶部。
 * 两个按钮同一套外壳（40px 方块 + 发丝线 + 等宽字），悬停时左侧浮出气泡说明；
 * 沉浸阅读只在文章页出现，回到顶部滚过一屏多才可用（两者在同一个栈里，位置不跳）。
 */
export function FloatTools() {
  const pathname = usePathname();
  const isArticle = Boolean(pathname?.startsWith("/posts/"));
  const [immersive, setImmersive] = useState(false);
  const [canTop, setCanTop] = useState(false);

  useEffect(() => {
    const body = document.body;
    body.classList.toggle("immersive", immersive && isArticle);
    return () => body.classList.remove("immersive");
  }, [immersive, isArticle]);

  // 离开文章页时退出沉浸态，避免带着样式去别的页面
  useEffect(() => {
    if (!isArticle) setImmersive(false);
  }, [isArticle]);

  useEffect(() => {
    // 不做 rAF 节流：只是一次数值比较，React 对相同值会 bail out
    const onScroll = () => setCanTop(window.scrollY > window.innerHeight * SHOW_AFTER);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  const toggleImmersive = useCallback(() => setImmersive((v) => !v), []);

  if (!isArticle && !canTop) return null;

  return (
    <div className="float-tools" aria-label="页面工具">
      {isArticle && (
        <FloatButton
          label={immersive ? "退出沉浸阅读" : "沉浸阅读"}
          glyph={immersive ? "✕" : "◈"}
          onClick={toggleImmersive}
          active={immersive}
        />
      )}
      <FloatButton
        label="回到顶部"
        glyph="↑"
        onClick={scrollToTop}
        idle={!canTop}
      />
    </div>
  );
}