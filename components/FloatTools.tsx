"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { currentScrollPane, onPaneScroll, paneScrollState } from "@/lib/scroll-pane";

/** 滚动超过多少可视高度后，回到顶部按钮才可用 */
const SHOW_AFTER = 0.75;

/**
 * 滚回顶部。
 * 目标不是写死的 window——列表页滚的是列表容器，滚 window 会一点反应都没有。
 */
function scrollToTop() {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const behavior: ScrollBehavior = reduced ? "auto" : "smooth";
  const pane = currentScrollPane();
  if (pane instanceof HTMLElement) {
    pane.scrollTo({ top: 0, behavior });
  } else {
    window.scrollTo({ top: 0, behavior });
  }
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
    // 不做 rAF 节流：只是一次数值比较，React 对相同值会 bail out。
    // 监听的是「当前滚动层」：列表页是列表容器，其它页是 window。
    const pane = currentScrollPane();
    const read = () => {
      const { top, view } = paneScrollState(pane);
      setCanTop(top > view * SHOW_AFTER);
    };
    read();
    const offScroll = onPaneScroll(pane, read);
    window.addEventListener("resize", read);
    return () => {
      offScroll();
      window.removeEventListener("resize", read);
    };
    // 路由一变滚动层可能换人（列表页 ↔ 其它页），必须重新解析
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

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