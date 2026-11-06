"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { OverlayScrollbars } from "overlayscrollbars";
import "overlayscrollbars/overlayscrollbars.css";
import { viewportOf } from "@/lib/scroll-pane";

/** 每个路径记一份页面滚动位置（只在本标签页有效） */
const STORE_PREFIX = "app-scroll:";

/**
 * 根滚动容器：整页滚动从 document 搬到这一层。
 *
 * 为什么非得这么做：document 的滚动条由浏览器绘制，没有任何 API 能改它的外观。
 * 想全站统一成自绘的读数尺，就只能让 body 不滚、由我们自己的容器滚。
 * 代价是 `window.scrollY` 恒为 0，所以 hash 锚点与前进后退的位置恢复要在这里补。
 */
export function RootScroll({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    // 触屏设备保留系统惯性滚动，不接管
    if (window.matchMedia("(hover: none)").matches) return;
    const instance = OverlayScrollbars(host, {
      scrollbars: {
        autoHide: "leave",
        autoHideDelay: 500,
        dragScroll: true,
        clickScroll: true,
        visibility: "auto",
      },
    });
    return () => instance.destroy();
  }, []);

  // hash 锚点：document 不再滚，浏览器自带的跳转失效，这里补一刀
  useEffect(() => {
    const jump = () => {
      const pane = viewportOf(hostRef.current);
      const id = decodeURIComponent(location.hash.replace(/^#/, ""));
      if (!pane || !id) return;
      const target = document.getElementById(id);
      if (!target) return;
      const top =
        target.getBoundingClientRect().top -
        pane.getBoundingClientRect().top +
        pane.scrollTop;
      pane.scrollTo({ top: Math.max(0, top - 8) });
    };

    // 首屏内容可能还在流式渲染，跳两次：立刻一次、布局稳定后一次
    jump();
    const timer = window.setTimeout(jump, 300);
    window.addEventListener("hashchange", jump);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", jump);
    };
  }, []);

  // 前进/后退：浏览器恢复的是 document 的位置，这里自己记
  useEffect(() => {
    const pane = viewportOf(hostRef.current);
    if (!pane) return;

    const key = () => STORE_PREFIX + location.pathname;
    const save = () => {
      try {
        sessionStorage.setItem(key(), String(pane.scrollTop));
      } catch {
        // 隐私模式写不进去：放弃恢复，不影响滚动
      }
    };

    const restore = () => {
      let target = 0;
      try {
        target = Number(sessionStorage.getItem(key()) ?? 0);
      } catch {
        return;
      }
      if (!target) return;
      // Next 的 back 会重新渲染，高度需要一点时间才落定，轮询到能滚到目标为止
      let tries = 0;
      const tick = () => {
        tries += 1;
        const max = pane.scrollHeight - pane.clientHeight;
        if (max >= target || tries > 30) {
          pane.scrollTop = Math.min(target, Math.max(0, max));
          return;
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    pane.addEventListener("scroll", save, { passive: true });
    window.addEventListener("popstate", restore);
    return () => {
      pane.removeEventListener("scroll", save);
      window.removeEventListener("popstate", restore);
    };
  }, []);

  return (
    <div
      id="app-scroll"
      ref={hostRef}
      className="sb app-scroll"
      data-scroll-root=""
      data-overlayscrollbars-initialize=""
    >
      <div className="sb-content app-scroll-content">{children}</div>
    </div>
  );
}