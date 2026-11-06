"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { viewportOf } from "@/lib/scroll-pane";

/** 列表滚动位置只在会话内有效：新开标签页从头开始才符合直觉 */
const STORE_KEY = "blog:ledger-top";

/** 阅读线：视口高度的这个比例处，谁跨过去谁就是"当前条目" */
const READ_LINE = 0.25;

/**
 * 后退/前进才恢复位置，从别的页面新进列表应该从顶部开始。
 * 浏览器只在 history 导航时派发 popstate，而 App Router 的 back 也走它，
 * 所以这里用模块级的 popstate 标记：模块在首次进入列表页时即加载，
 * 之后的后退事件一定先于组件重新挂载被捕获到。
 */
let cameFromHistory = false;
let historyGuard: ReturnType<typeof setTimeout> | undefined;

if (typeof window !== "undefined") {
  window.addEventListener("popstate", () => {
    cameFromHistory = true;
    if (historyGuard) clearTimeout(historyGuard);
    historyGuard = setTimeout(() => {
      cameFromHistory = false;
    }, 1200);
  });
}

/**
 * 文章列表的滚动面板（见 openspec: blog-list-scrolling / ledger-scroll-motion）。
 *
 * 三件事都在这里，因为它们共用同一份滚动位置：
 * 1. 容器本身换成全站统一的 ScrollArea（原生条被隐藏，换成自绘读数尺）；
 * 2. 后退时恢复位置；
 * 3. 滚动联动：写 `--p` 给左缘走线，切 `data-read` 给条目状态，
 *    并驱动滚动条旁边那行「第 03 / 14 条」读数。
 *
 * 性能约束：滚动帧里只读一次布局（容器的三个尺寸），条目的位置提前缓存，
 * 状态全写 DOM 属性与 CSS 变量，不触发 React 重渲染。
 */
export function ListScrollPane({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const readoutRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const pane = viewportOf(host);
    if (!pane) return;

    /* ---------- 1. 后退恢复 ---------- */
    const saved = (() => {
      try {
        return Number(sessionStorage.getItem(STORE_KEY) ?? 0);
      } catch {
        return 0;
      }
    })();

    if (cameFromHistory && saved > 0) {
      requestAnimationFrame(() => {
        pane.scrollTop = saved;
      });
    } else {
      try {
        sessionStorage.removeItem(STORE_KEY);
      } catch {
        /* 隐私模式：忽略 */
      }
      pane.scrollTop = 0;
    }

    let saveTimer = 0;
    const save = () => {
      // 写 sessionStorage 比一帧便宜，但没必要每个 scroll 事件都写
      if (saveTimer) return;
      saveTimer = window.setTimeout(() => {
        saveTimer = 0;
        try {
          sessionStorage.setItem(STORE_KEY, String(pane.scrollTop));
        } catch {
          /* 忽略 */
        }
      }, 120);
    };

    /* ---------- 2. 条目位置缓存 ---------- */
    const entries = Array.from(
      pane.querySelectorAll<HTMLElement>(".entry")
    );
    let tops: number[] = [];
    let total = 0;

    const measure = () => {
      const paneTop = pane.getBoundingClientRect().top;
      tops = entries.map(
        (el) => el.getBoundingClientRect().top - paneTop + pane.scrollTop
      );
      total = pane.scrollHeight;
    };

    /* ---------- 3. 滚动帧 ---------- */
    let dirty = true;
    let frame = 0;
    let hideTimer = 0;
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const render = () => {
      frame = 0;
      const max = pane.scrollHeight - pane.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, pane.scrollTop / max)) : 0;

      // 走线：一个 CSS 变量，走 transform，不碰布局。减弱动效时不推进（走线由 CSS 隐藏）
      if (reduced) host.dataset.reduced = "1";
      else host.style.setProperty("--p", p.toFixed(4));

      // 当前条目：跨过阅读线的最后一个
      const line = pane.scrollTop + pane.clientHeight * READ_LINE;
      let current = -1;
      for (let i = 0; i < tops.length; i += 1) {
        if (tops[i] <= line) current = i;
        else break;
      }
      entries.forEach((el, i) => {
        const next = i < current ? "past" : i === current ? "current" : "ahead";
        if (el.dataset.read !== next) el.dataset.read = next;
      });

      // 读数：第 n / 共 m 条
      const readout = readoutRef.current;
      if (readout) {
        readout.textContent =
          current < 0
            ? `01 / ${String(entries.length).padStart(2, "0")}`
            : `${String(current + 1).padStart(2, "0")} / ${String(entries.length).padStart(2, "0")}`;
        // 沿着轨道跟随当前进度
        readout.style.setProperty("--p", p.toFixed(4));
      }

      // 内容不足一屏：不显示走线与读数
      host.dataset.scrollable = max > 4 ? "1" : "0";

      save();
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        host.dataset.reading = "0";
      }, 900);
    };

    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(render);
    };

    const onScroll = () => {
      dirty = true;
      host.dataset.reading = "1";
      schedule();
    };

    const onEnter = () => {
      host.dataset.reading = "1";
      schedule();
    };

    measure();
    render();
    pane.addEventListener("scroll", onScroll, { passive: true });
    pane.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerenter", onEnter);
    // 指针在滚动条上时也应该看到读数
    host.addEventListener("pointermove", onEnter);

    window.addEventListener("resize", schedule);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        measure();
        schedule();
      });
      entries.forEach((el) => observer?.observe(el));
      observer.observe(pane);
    }

    return () => {
      pane.removeEventListener("scroll", onScroll);
      pane.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointermove", onEnter);
      window.removeEventListener("resize", schedule);
      observer?.disconnect();
      window.clearTimeout(hideTimer);
      if (frame) cancelAnimationFrame(frame);
      if (saveTimer) window.clearTimeout(saveTimer);
    };
  }, []);

  return (
    <ScrollArea
      hostRef={hostRef}
      className="ledger"
      dataPane
      role="region"
      ariaLabel="文章列表"
      tabIndex={0}
      overlay={
        <span className="sb-readout" ref={readoutRef} aria-hidden="true" />
      }
    >
      {children}
    </ScrollArea>
  );
}