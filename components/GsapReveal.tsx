"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";

/**
 * 入场揭示动画：容器内带 data-reveal 的元素依次淡入 + 上移。
 * - 使用 useLayoutEffect，在浏览器绘制前设置初始状态，避免闪烁
 * - 尊重 prefers-reduced-motion（用户系统级减弱动态效果时直接跳过）
 * - 无 JS / 服务端渲染时内容正常可见，不影响 SEO 与可访问性
 */
export function GsapReveal({
  children,
  className,
  stagger = 0.08,
  distance = 18,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  distance?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const items = root.querySelectorAll<HTMLElement>("[data-reveal]");
    if (items.length === 0) return;

    let cleanup = () => {};
    const ctx = gsap.context(() => {
      gsap.fromTo(
        items,
        { opacity: 0, y: distance },
        {
          opacity: 1,
          y: 0,
          duration: 0.45,
          stagger,
          ease: "power2.out",
          clearProps: "transform",
        }
      );
    }, root);
    cleanup = () => ctx.revert();
    return cleanup;
  }, [stagger, distance]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
