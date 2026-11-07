"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import {
  currentScrollPane,
  paneScrollMetrics,
  viewportOf,
} from "@/lib/scroll-pane";

/**
 * 文章页左侧大纲（见 openspec: post-outline）。
 *
 * 位置与正文的关系：`.article-shell` 只是 860px 居中，正文的 34em 量宽用不满这个壳，
 * 左侧那条留白本来是空的。大纲就借用它——绝对定位到壳的左外侧，再由内层 sticky 吸住。
 * 这样无论大纲在不在，正文的排版上下文都没变，左缘一个像素都不动。
 *
 * 标题不自己造：id 的唯一真相是正文渲染时 rehype-slug 生成的那些，这里只读 DOM。
 * 代价是无 JS 时没有大纲——它是增强导航，不是唯一入口（spec 的降级场景）。
 */

/** 宽屏门槛：轨宽 172 + 间距 28 = 200，壳 860 居中时左侧留白 (W-860)/2 要够它 */
const WIDE_QUERY = "(min-width: 1280px)";
/** 落点与页头之间留的呼吸 */
const HEAD_GAP = 24;
/** 判定线比落点稍低一点：跳转后标题正好压在落点上，不留偏置就总差一像素越不过去 */
const SPY_BIAS = 8;
/** 取不到页头高度时的兜底（60px 内容 + 1px 边框） */
const FALLBACK_HEADER = 61;
/** 只有一条的大纲没有导航价值 */
const MIN_ITEMS = 2;

type OutlineItem = {
  id: string;
  text: string;
  level: 2 | 3;
  /** 等宽序号：一级 01、二级 02.1 */
  label: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

/** 标题里被 rehype-autolink-headings 追加了一个 .heading-anchor（#），要剥掉 */
function headingText(el: HTMLElement): string {
  const clone = el.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".heading-anchor").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

function collectHeadings(root: ParentNode): OutlineItem[] {
  const nodes = Array.from(
    root.querySelectorAll<HTMLElement>(".prose h2[id], .prose h3[id]")
  );
  let h2 = 0;
  let h3 = 0;
  return nodes.map((el) => {
    const level: 2 | 3 = el.tagName === "H2" ? 2 : 3;
    if (level === 2) {
      h2 += 1;
      h3 = 0;
    } else {
      h3 += 1;
    }
    return {
      id: el.id,
      text: headingText(el),
      level,
      label: level === 2 ? pad(h2) : h2 > 0 ? `${pad(h2)}.${h3}` : "",
    };
  });
}

/** 页头是 sticky 的，落点必须绕过它，否则标题会被压在下面 */
function headerOffset(): number {
  const header = document.querySelector(".site-header");
  const height = header ? header.getBoundingClientRect().height : FALLBACK_HEADER;
  return height + HEAD_GAP;
}

export function PostOutline() {
  const [items, setItems] = useState<OutlineItem[]>([]);
  const [wide, setWide] = useState(false);
  const listRef = useRef<HTMLOListElement | null>(null);
  const hostRef = useRef<HTMLDivElement | null>(null);
  /** 跳转后的「停稳校正」句柄：新跳转会顶掉旧的 */
  const settleRef = useRef({ token: 0, raf: 0, timer: 0 });

  const ready = wide && items.length >= MIN_ITEMS;

  // 正文在同一个提交里已经渲染完，挂载后就能采集
  useEffect(() => {
    setItems(collectHeadings(document));
  }, []);

  // 断点门控：只靠 CSS 藏起来的话，spy 还会为看不见的列表算布局
  useEffect(() => {
    const mq = window.matchMedia(WIDE_QUERY);
    const sync = () => setWide(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  /**
   * 跳转分两步：先滚到位，等停稳后再校正一次并把焦点交给标题。
   *
   * 为什么要校正：路径上的图片是懒加载的，滚过去的过程中它们陆续落位，
   * 会把目标标题往下顶（实测一次能偏 60px 以上）。滚完重算一次差量就能对齐。
   *
   * 为什么焦点要放到最后：某些情况下浏览器不理会 `preventScroll`，
   * 会把还不可见的目标自行滚到视口顶部 —— 正好把精确落点盖掉。等它已经在
   * 视口里再聚焦，就不会再有位移了。
   */
  const jump = useCallback((id: string) => {
    const target = document.getElementById(id);
    if (!target) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const desired = () => {
      const pane = currentScrollPane();
      const top =
        pane instanceof HTMLElement
          ? target.getBoundingClientRect().top -
            pane.getBoundingClientRect().top +
            pane.scrollTop
          : target.getBoundingClientRect().top + window.scrollY;
      return Math.max(0, top - headerOffset());
    };

    const place = (top: number, behavior: ScrollBehavior) => {
      const pane = currentScrollPane();
      if (pane instanceof HTMLElement) pane.scrollTo({ top, behavior });
      else window.scrollTo({ top, behavior });
    };

    place(desired(), reduced ? "auto" : "smooth");

    // replaceState 而不是写 location.hash —— 后者每次点击都多一条历史记录
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#${encodeURIComponent(id)}`
    );

    const state = settleRef.current;
    const token = ++state.token;
    cancelAnimationFrame(state.raf);
    window.clearTimeout(state.timer);

    const pane = currentScrollPane();
    const paneEl = pane instanceof HTMLElement ? pane : null;
    const eventTarget: HTMLElement | Window = paneEl ?? window;

    // 用户中途自己滚了就别再校正，否则等于跟人抢滚动
    const userEvents = ["wheel", "touchstart", "keydown"] as const;
    const detach = () =>
      userEvents.forEach((type) => eventTarget.removeEventListener(type, cancel));
    const cancel = () => {
      detach();
      if (state.token === token) state.token += 1;
    };
    userEvents.forEach((type) =>
      eventTarget.addEventListener(type, cancel, { once: true, passive: true })
    );

    let last = Number.NaN;
    let stable = 0;
    const watch = () => {
      if (state.token !== token) return;
      const now = paneEl ? paneEl.scrollTop : window.scrollY;
      if (Math.abs(now - last) < 1) stable += 1;
      else stable = 0;
      last = now;

      if (stable < 6) {
        state.raf = requestAnimationFrame(watch);
        return;
      }

      // 停稳后再等一拍，让刚进入视口的图片落位，然后校正 + 聚焦
      state.timer = window.setTimeout(() => {
        detach();
        if (state.token !== token) return;
        const want = desired();
        if (Math.abs((paneEl ? paneEl.scrollTop : window.scrollY) - want) > 2) {
          place(want, "auto");
        }
        target.setAttribute("tabindex", "-1");
        target.focus({ preventScroll: true });
      }, 200);
    };
    state.raf = requestAnimationFrame(watch);
  }, []);

  // 卸载时收掉还在跑的校正
  useEffect(() => {
    const state = settleRef.current;
    return () => {
      cancelAnimationFrame(state.raf);
      window.clearTimeout(state.timer);
      state.token += 1;
    };
  }, []);

  // 滚动联动：位置一次性缓存，滚动帧里只做比较并写 DOM，不重渲染
  useEffect(() => {
    if (!ready) return;
    const list = listRef.current;
    if (!list) return;

    const links = Array.from(
      list.querySelectorAll<HTMLAnchorElement>("a[data-id]")
    );
    if (links.length !== items.length) return;

    const heads = items.map((it) => document.getElementById(it.id));
    if (heads.some((h) => h === null)) return;

    const pane = currentScrollPane();
    const paneEl = pane instanceof HTMLElement ? pane : null;

    let tops: number[] = [];
    let offset = headerOffset() + SPY_BIAS;
    let frame = 0;
    let current = -1;

    const measure = () => {
      offset = headerOffset() + SPY_BIAS;
      // 文档坐标（相对滚动层内容）：rect.top - (paneRect.top - scrollTop)
      const base = paneEl
        ? paneEl.getBoundingClientRect().top - paneEl.scrollTop
        : -window.scrollY;
      tops = heads.map(
        (h) => (h as HTMLElement).getBoundingClientRect().top - base
      );
    };

    /** 当前项滚出大纲可视范围时，只挪大纲自己 —— 绝不能带动页面 */
    const reveal = (index: number) => {
      const vp = viewportOf(hostRef.current);
      if (!vp) return; // 触屏：库没接管，目录走系统滚动，交给用户
      const link = links[index];
      if (!link) return;
      const lr = link.getBoundingClientRect();
      const vr = vp.getBoundingClientRect();
      if (lr.top < vr.top) {
        vp.scrollTop -= vr.top - lr.top + 8;
      } else if (lr.bottom > vr.bottom) {
        vp.scrollTop += lr.bottom - vr.bottom + 8;
      }
    };

    const paint = (index: number) => {
      if (index === current) return;
      current = index;
      links.forEach((link, i) => {
        const li = link.parentElement;
        if (!li) return;
        if (i === index) {
          li.dataset.active = "1";
          link.setAttribute("aria-current", "location");
        } else {
          delete li.dataset.active;
          link.removeAttribute("aria-current");
        }
      });
      if (index >= 0) reveal(index);
    };

    const render = () => {
      frame = 0;
      const m = paneScrollMetrics(pane);
      const line = m.top + offset;
      let index = -1;
      for (let i = 0; i < tops.length; i += 1) {
        if (tops[i] <= line) index = i;
        else break;
      }
      // 最后一节通常很短，永远越不过判定线：滚到文末直接把它定为当前
      if (m.top + m.view >= m.total - 2) index = tops.length - 1;
      paint(index);
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(render);
    };

    // 图片是懒加载的，正文高度会边滚边变，必须重测；除了尺寸观察，
    // 滚动停下后再补测一次 —— 跳转后的落点校正也走这条路，否则缓存会停在旧高度上
    const remeasure = () => {
      measure();
      schedule();
    };

    let rescan = 0;
    const onScroll = () => {
      schedule();
      window.clearTimeout(rescan);
      rescan = window.setTimeout(remeasure, 200);
    };

    measure();
    render();

    const scrollTarget: HTMLElement | Window = paneEl ?? window;
    scrollTarget.addEventListener("scroll", onScroll, { passive: true });

    const prose = document.querySelector(".prose");
    let observer: ResizeObserver | undefined;
    if (prose && typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(remeasure);
      observer.observe(prose);
    }
    window.addEventListener("resize", remeasure);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      if (paneEl) paneEl.removeEventListener("scroll", schedule);
      else window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", remeasure);
      observer?.disconnect();
    };
  }, [ready, items]);

  return (
    <aside className="article-rail" data-ready={ready ? "1" : undefined}>
      {ready && (
        <div className="article-rail-inner">
          <p className="article-rail-title">目录</p>
          <ScrollArea
            hostRef={hostRef}
            className="article-rail-scroll"
            contentClassName="article-rail-body"
            autoHide="leave"
          >
            <nav aria-label="文章大纲">
              <ol className="outline" ref={listRef}>
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="outline-item"
                    data-level={item.level}
                  >
                    <a
                      href={`#${item.id}`}
                      data-id={item.id}
                      draggable={false}
                      onClick={(e) => {
                        e.preventDefault();
                        jump(item.id);
                      }}
                    >
                      {item.label && (
                        <span className="outline-n" aria-hidden="true">
                          {item.label}
                        </span>
                      )}
                      <span className="outline-text">{item.text}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </ScrollArea>
        </div>
      )}
    </aside>
  );
}