"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefObject,
} from "react";
import { OverlayScrollbars } from "overlayscrollbars";
import "overlayscrollbars/overlayscrollbars.css";

export type ScrollAreaProps = {
  children: ReactNode;
  /** host（外壳）的类名，负责尺寸与定位 */
  className?: string;
  /** 内容层的类名（真正被库搬进 viewport 的那层） */
  contentClassName?: string;
  /** 只纵滚 / 只横滚 / 双向 */
  axis?: "y" | "x" | "both";
  /** 滚动条什么时候可见；默认离开就淡出 */
  autoHide?: "never" | "leave" | "scroll" | "move";
  /** host 的引用：外部要靠它找 viewport、量尺寸 */
  hostRef?: RefObject<HTMLDivElement | null>;
  style?: CSSProperties;
  id?: string;
  role?: string;
  tabIndex?: number;
  ariaLabel?: string;
  /** 标记成「当前页的主滚动层」（外层用 currentScrollPane() 查找） */
  dataPane?: boolean;
  /** 固定在滚动区上方的浮层（读数之类），不随内容滚动 */
  overlay?: ReactNode;
};

/**
 * 全站统一的滚动容器。
 *
 * 原生滚动条由 OverlayScrollbars 隐藏，轨道与滑块由我们自己的 CSS 画
 * （`--sb-*` 那组变量）——系统条那 15px 宽和上下三角箭头是这一版最扎眼的
 * 外来件，靠 CSS 压不掉，只能自己接管。
 *
 * DOM 结构刻意保持「React 只持有自己那层」：内容的直接父节点永远是
 * `.sb-content`，库初始化时会把它整体搬进自己创建的 viewport。这样
 * 列表增长、刷新换数据时，React 的插入仍然发生在这个稳定节点里，
 * 不会被塞到滚动区外面。
 */
export function ScrollArea({
  children,
  className,
  contentClassName,
  axis = "y",
  autoHide = "leave",
  hostRef,
  style,
  id,
  role,
  tabIndex,
  ariaLabel,
  dataPane = false,
  overlay,
}: ScrollAreaProps) {
  const localHost = useRef<HTMLDivElement | null>(null);
  const host = hostRef ?? localHost;
  // 库在初始化时会把 host 里已有的子节点整体搬进它自己的 viewport，
  // 所以浮层要等初始化之后再挂——否则会跟着内容一起被卷走
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hostEl = host.current;
    if (!hostEl) return;
    // 触屏设备保留系统惯性滚动，不接管（自绘条在手指滚动时反而碍事）
    if (window.matchMedia("(hover: none)").matches) return;

    const instance = OverlayScrollbars(hostEl, {
      overflow: {
        x: axis === "y" ? "hidden" : "scroll",
        y: axis === "x" ? "hidden" : "scroll",
      },
      scrollbars: {
        autoHide,
        autoHideDelay: 500,
        dragScroll: true,
        clickScroll: true,
        visibility: "auto",
      },
    });

    const viewport = instance.elements().viewport;

    /* 可访问性：库自己造的 viewport 拿不到我们想要的属性，初始化后补上。
       tabIndex 给键盘滚动用（方向键 / PageDown / Home / End 是原生行为）。 */
    if (role) viewport.setAttribute("role", role);
    if (ariaLabel) viewport.setAttribute("aria-label", ariaLabel);
    if (typeof tabIndex === "number") viewport.tabIndex = tabIndex;

    /* 滚动条动效：滚动/拖拽期间给 host 打 is-scrolling，
       让滑块加宽发光、刻度亮起来；停下来 700ms 后落回安静态。 */
    let quiet = 0;
    const wake = (e?: Event) => {
      hostEl.dataset.sbActive = "1";
      if (e?.type === "pointerdown") hostEl.dataset.sbDrag = "1";
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => {
        delete hostEl.dataset.sbActive;
        delete hostEl.dataset.sbDrag;
      }, 700);
    };
    const sleep = () => {
      window.clearTimeout(quiet);
      quiet = window.setTimeout(() => {
        delete hostEl.dataset.sbActive;
        delete hostEl.dataset.sbDrag;
      }, 700);
    };

    viewport.addEventListener("scroll", wake, { passive: true });
    hostEl.addEventListener("pointerenter", wake);
    hostEl.addEventListener("pointerdown", wake);
    hostEl.addEventListener("pointerup", sleep);
    hostEl.addEventListener("pointerleave", sleep);

    setReady(true);

    /* 内容高度变化时重新量一次：库只在尺寸变化时自己更新，
       内容异步长高（后台、动态列表）会漏掉，进而把 overflow 判成 hidden */
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      let pending = 0;
      observer = new ResizeObserver(() => {
        window.clearTimeout(pending);
        pending = window.setTimeout(() => instance.update(true), 60);
      });
      observer.observe(hostEl);
      const content = hostEl.querySelector(".sb-content");
      if (content) observer.observe(content);
    }

    return () => {
      window.clearTimeout(quiet);
      observer?.disconnect();
      viewport.removeEventListener("scroll", wake);
      hostEl.removeEventListener("pointerenter", wake);
      hostEl.removeEventListener("pointerdown", wake);
      hostEl.removeEventListener("pointerup", sleep);
      hostEl.removeEventListener("pointerleave", sleep);
      instance.destroy();
    };
  }, [axis, autoHide, host, role, tabIndex, ariaLabel]);

  return (
    <div
      ref={host}
      id={id}
      className={className ? `sb ${className}` : "sb"}
      style={style}
      data-sb-host=""
      data-scroll-pane={dataPane || undefined}
      data-overlayscrollbars-initialize=""
    >
      <div className={contentClassName ? `sb-content ${contentClassName}` : "sb-content"}>
        {children}
      </div>
      {ready ? overlay : null}
    </div>
  );
}

/** 拿到某个滚动容器真正在滚的那一层（库初始化前后都适用） */
export function viewportOf(el: HTMLElement | null | undefined): HTMLElement | null {
  if (!el) return null;
  if (el.matches("[data-overlayscrollbars-viewport]")) return el;
  return el.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]");
}