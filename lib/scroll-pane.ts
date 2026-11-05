/**
 * 「当前页到底谁在滚」。
 *
 * 绝大多数页面滚的是文档本身（window）；文章列表页例外——列表是独立的滚动容器
 * （见 openspec: blog-list-scrolling），这时滚 window 什么也不会发生。
 * 所以凡是要读写滚动位置的地方，都先问这里拿滚动层，而不是写死 window。
 *
 * 用 DOM 标记而不是 React context：调用方（页头页脚那层的浮动控件）与列表容器
 * 不在同一棵子树里，一个 data- 属性是最小的耦合面。
 */
export function currentScrollPane(): HTMLElement | Window {
  if (typeof document === "undefined") return window;
  return document.querySelector<HTMLElement>("[data-scroll-pane]") ?? window;
}

/** 滚动层「已经滚了多远 / 可视多高」——元素与 window 两套属性的统一读法 */
export function paneScrollState(pane: HTMLElement | Window): {
  top: number;
  view: number;
} {
  if (pane instanceof HTMLElement) {
    return { top: pane.scrollTop, view: pane.clientHeight };
  }
  return { top: window.scrollY, view: window.innerHeight };
}

/** 监听滚动层滚动，返回取消监听的函数 */
export function onPaneScroll(
  pane: HTMLElement | Window,
  handler: () => void
): () => void {
  if (pane instanceof HTMLElement) {
    pane.addEventListener("scroll", handler, { passive: true });
    return () => pane.removeEventListener("scroll", handler);
  }
  window.addEventListener("scroll", handler, { passive: true });
  return () => window.removeEventListener("scroll", handler);
}