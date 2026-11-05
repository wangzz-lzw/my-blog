"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/** 列表滚动位置只在会话内有效：新开标签页从头开始才符合直觉 */
const STORE_KEY = "blog:ledger-top";

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
    // 一次 history 导航只该恢复一次；之后的普通导航不算
    historyGuard = setTimeout(() => {
      cameFromHistory = false;
    }, 1200);
  });
}

/**
 * 文章列表的滚动面板。
 *
 * 列表是这一页唯一的滚动容器（见 openspec: blog-list-scrolling）：
 * - 滚动条贴在列表自己右缘，页头页脚与右侧栏不跟着走；
 * - 键盘用户 Tab 到这里后可用方向键 / PageDown / Home / End 滚动；
 * - 后退回来时恢复离开前的位置。
 *
 * 为纯 CSS 的高度链服务（`body:has(.sheet--scroll)` → `.list-host` → 本组件 → 内层滚动），
 * 所以这里只负责语义与滚动行为，不参与高度计算。
 */
export function ListScrollPane({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const pane = ref.current;
    if (!pane) return;

    if (cameFromHistory) {
      const saved = Number(sessionStorage.getItem(STORE_KEY) ?? 0);
      if (saved > 0) {
        // 等一帧：字体与布局落定后再写 scrollTop，避免被重排顶回去
        requestAnimationFrame(() => {
          pane.scrollTop = saved;
        });
      }
    } else {
      sessionStorage.removeItem(STORE_KEY);
      pane.scrollTop = 0;
    }

    // 写入很便宜（同一个键），不做节流；滚动事件本身已经被浏览器按帧合并
    const onScroll = () => {
      try {
        sessionStorage.setItem(STORE_KEY, String(pane.scrollTop));
      } catch {
        // 隐私模式下 sessionStorage 可能不可写：放弃恢复，不影响滚动
      }
    };
    pane.addEventListener("scroll", onScroll, { passive: true });
    return () => pane.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div
      ref={ref}
      className="ledger"
      data-scroll-pane
      role="region"
      aria-label="文章列表"
      tabIndex={0}
    >
      {children}
    </div>
  );
}