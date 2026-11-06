/**
 * 「当前页到底谁在滚」。
 *
 * 全站换自绘滚动条后（见 openspec: custom-scrollbars），能滚的一共三层：
 * - 根容器 `[data-scroll-root]`：所有页面的整页滚动（document 已经不再滚）；
 * - 列表容器 `[data-scroll-pane]`：文章列表页，列表自己滚；
 * - 兜底 `window`：自定义滚动条还没接管时的降级路径（无 JS、触屏）。
 *
 * 这三层都由 OverlayScrollbars 接管，真正读写的元素是库创建出来的
 * `[data-overlayscrollbars-viewport]`，不是我们给的那个 host。所以这里
 * 先解到 viewport 再返回——所有调用方（浮动控件、阅读进度、位置恢复）
 * 都只跟"能滚的那一层"打交道。
 */
export function viewportOf(el: Element | null | undefined): HTMLElement | null {
  if (!el) return null;
  if (!(el instanceof HTMLElement)) return null;
  if (el.matches("[data-overlayscrollbars-viewport]")) return el;
  return el.querySelector<HTMLElement>("[data-overlayscrollbars-viewport]");
}

export function currentScrollPane(): HTMLElement | Window {
  if (typeof document === "undefined") return window;
  const pane = document.querySelector("[data-scroll-pane]");
  const root = document.querySelector("[data-scroll-root]");
  // 库接管时滚的是 viewport；触屏/无 JS 时退化成 host 自己滚
  return viewportOf(pane) ?? (pane as HTMLElement | null) ?? viewportOf(root) ?? (root as HTMLElement | null) ?? window;
}

/** 唯一常驻的根滚动层（页面级滚动），拿不到时退回 window */
export function rootScrollPane(): HTMLElement | Window {
  if (typeof document === "undefined") return window;
  const root = document.querySelector("[data-scroll-root]");
  return viewportOf(root) ?? (root as HTMLElement | null) ?? window;
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

/** 滚动层的总高度与可视高度，用来算进度条 */
export function paneScrollMetrics(pane: HTMLElement | Window): {
  top: number;
  view: number;
  total: number;
} {
  if (pane instanceof HTMLElement) {
    return { top: pane.scrollTop, view: pane.clientHeight, total: pane.scrollHeight };
  }
  const doc = document.documentElement;
  return { top: window.scrollY, view: window.innerHeight, total: doc.scrollHeight };
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