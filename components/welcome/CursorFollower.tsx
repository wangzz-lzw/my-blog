"use client";

import { useEffect, useRef } from "react";

/** 尾巴由几节组成：第一节跟手最紧，后面的依次拖后 */
const DOTS = 5;

/**
 * 跟随指针的小尾巴：一串由大到小、由深到淡的圆点，逐节追赶前一点。
 * 悬停到可点元素时整体转成品红——不换形状、不画框。
 * 只在精确指针设备启用；纯装饰，不接收事件、不进辅助技术树。
 */
export function CursorFollower() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const dotRefs = useRef<Array<HTMLSpanElement | null>>([]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!fine.matches || reduced.matches) return;

    const dots = dotRefs.current.filter((d): d is HTMLSpanElement => Boolean(d));
    if (dots.length === 0) return;

    // 每一节的位置（从指针指向尾端）
    const pos = dots.map(() => ({ x: window.innerWidth / 2, y: window.innerHeight / 2 }));
    let target = { x: pos[0].x, y: pos[0].y };
    let shown = false;
    let raf = 0;

    const render = () => {
      dots.forEach((dot, i) => {
        dot.style.transform = `translate3d(${pos[i].x}px, ${pos[i].y}px, 0)`;
      });
    };

    const tick = () => {
      // 第一节紧跟指针，其余依次追前一节 —— 自然形成拖尾
      pos[0].x += (target.x - pos[0].x) * 0.45;
      pos[0].y += (target.y - pos[0].y) * 0.45;
      for (let i = 1; i < pos.length; i += 1) {
        const k = 0.42 - i * 0.05;
        pos[i].x += (pos[i - 1].x - pos[i].x) * k;
        pos[i].y += (pos[i - 1].y - pos[i].y) * k;
      }
      render();
      raf = window.requestAnimationFrame(tick);
    };

    const isInteractive = (el: Element | null) =>
      Boolean(el?.closest("a, button, [role='button']"));

    const onMove = (e: PointerEvent) => {
      target = { x: e.clientX, y: e.clientY };
      if (!shown) {
        shown = true;
        // 首次出现：把整串直接放到指针处，避免从屏幕中间甩过来
        pos.forEach((p) => {
          p.x = e.clientX;
          p.y = e.clientY;
        });
        render();
        wrap.style.opacity = "1";
        raf = window.requestAnimationFrame(tick);
      }
    };

    const onOver = (e: Event) => {
      wrap.classList.toggle(
        "is-hot",
        e.target instanceof Element && isInteractive(e.target)
      );
    };

    const onLeaveWindow = () => {
      shown = false;
      wrap.style.opacity = "0";
      wrap.classList.remove("is-hot");
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerover", onOver);
    document.addEventListener("pointerleave", onLeaveWindow);
    window.addEventListener("blur", onLeaveWindow);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerover", onOver);
      document.removeEventListener("pointerleave", onLeaveWindow);
      window.removeEventListener("blur", onLeaveWindow);
      wrap.style.opacity = "0";
    };
  }, []);

  return (
    <div className="cursor-trail" aria-hidden="true" ref={wrapRef}>
      {Array.from({ length: DOTS }, (_, i) => (
        <span
          key={i}
          className="cursor-dot"
          ref={(el) => {
            dotRefs.current[i] = el;
          }}
        />
      ))}
    </div>
  );
}