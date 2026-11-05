"use client";

import { useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";

declare global {
  interface Window {
    /** 动效层报到标记：内联脚本的 2.5s 兜底靠它判断要不要摘掉 js-ready */
    __welcomeMotion?: boolean;
  }
}

const MAGNET_MAX = 8; // 磁吸位移上限（px）
const PARALLAX_MAX = 6; // 视差位移上限（px）

/**
 * 欢迎页动效增强层：不渲染可见内容，只操作页面上已有的 DOM。
 * 入场 timeline + 指针视差 + 磁吸 + 出页过渡；减弱动效时只落到最终态。
 */
export function WelcomeMotion() {
  const router = useRouter();
  const wipeRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const scope = document.querySelector<HTMLElement>(".page-welcome");
    if (!scope) return;

    // 告诉内联脚本的兜底逻辑：动效已经起来了，别摘 js-ready
    window.__welcomeMotion = true;
    document.documentElement.classList.add("js-ready");
    const q = gsap.utils.selector(scope);

    // 初始态由 JS 再钉一次：CSS 门控（html.js-ready）如果没生效、或被 HMR 的旧样式盖住，
    // 元素就会停在"被藏住但没人放出来"的状态——这里显式设一遍，保证 GSAP 一定接管。
    gsap.set(q(".welcome-grid"), { opacity: 0 });
    gsap.set(q(".welcome-prompt"), { opacity: 0, x: -8 });
    gsap.set(q(".welcome-caret"), { scaleY: 0, transformOrigin: "center bottom" });
    gsap.set(q(".welcome-letter"), { opacity: 0, y: 18 });
    gsap.set(q(".welcome-lead"), {
      opacity: 0,
      y: 10,
      clipPath: "inset(0 0 100% 0)",
    });
    gsap.set(q(".welcome-rule"), { scaleX: 0, transformOrigin: "left center" });
    gsap.set(q(".welcome-state, .welcome-actions"), { opacity: 0, y: 8 });

    const mm = gsap.matchMedia();

    /* ---------------- 减弱动效：只落最终态 ---------------- */
    mm.add("(prefers-reduced-motion: reduce)", () => {
      gsap.set(q(".welcome-grid"), { opacity: 0.55 });
      gsap.set(q(".welcome-prompt"), { opacity: 1, x: 0 });
      gsap.set(q(".welcome-caret"), { scaleY: 1 });
      gsap.set(q(".welcome-letter, .welcome-state, .welcome-actions"), {
        opacity: 1,
        y: 0,
      });
      gsap.set(q(".welcome-lead"), { opacity: 1, y: 0, clipPath: "none" });
      gsap.set(q(".welcome-rule"), { scaleX: 1 });
    });

    /* ---------------- 入场 + 出页过渡 ---------------- */
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: () => {
          gsap.set(q(".welcome-letter, .welcome-lead"), { clearProps: "willChange" });
        },
      });

      tl.to(q(".welcome-grid"), { opacity: 0.55, duration: 0.5 }, 0)
        .to(q(".welcome-prompt"), { opacity: 1, x: 0, duration: 0.3 }, 0.12)
        // 光标块从下往上立起来，之后交给 CSS 的短闪（占空比 12%）
        .to(q(".welcome-caret"), { scaleY: 1, duration: 0.18 }, 0.5)
        .to(
          q(".welcome-letter"),
          { y: 0, opacity: 1, duration: 0.42, stagger: 0.028 },
          0.6
        )
        .to(
          q(".welcome-lead"),
          {
            clipPath: "inset(0 0 0% 0)",
            y: 0,
            opacity: 1,
            duration: 0.5,
          },
          0.98
        )
        .to(q(".welcome-rule"), { scaleX: 1, duration: 0.35 }, 1.12)
        .to(q(".welcome-state"), { y: 0, opacity: 1, duration: 0.3 }, 1.22)
        .to(q(".welcome-actions"), { y: 0, opacity: 1, duration: 0.3 }, 1.32);

      // 出页过渡：点主按钮先扫过遮罩，再跳转
      const cta = scope.querySelector<HTMLAnchorElement>(".welcome-cta");
      const wipe = wipeRef.current;
      const onCtaClick = (e: MouseEvent) => {
        // 修饰键 / 中键：放行默认行为（新标签打开等）
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
          return;
        }
        if (!wipe) return;
        e.preventDefault();
        gsap
          .timeline({
            defaults: { ease: "power3.inOut" },
            onComplete: () => router.push("/blog"),
          })
          .to(q(".welcome-inner"), { opacity: 0, y: -8, duration: 0.3, ease: "power2.in" }, 0)
          .to(wipe, { scaleY: 1, duration: 0.45 }, 0.05);
      };
      cta?.addEventListener("click", onCtaClick);

      return () => {
        cta?.removeEventListener("click", onCtaClick);
      };
    });

    /* ---------------- 指针效果：视差 + 磁吸 ---------------- */
    mm.add(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
      () => {
        const grid = scope.querySelector<HTMLElement>(".welcome-grid");

        // 只有背景网格参与视差：文字（含字标）一律不动，
        // 否则粒子采样的"家"会和文字错位
        const gridX = grid ? gsap.quickTo(grid, "x", { duration: 0.8, ease: "power2" }) : null;
        const gridY = grid ? gsap.quickTo(grid, "y", { duration: 0.8, ease: "power2" }) : null;

        const onPointerMove = (e: PointerEvent) => {
          const nx = (e.clientX / window.innerWidth - 0.5) * 2;
          const ny = (e.clientY / window.innerHeight - 0.5) * 2;
          gridX?.(nx * PARALLAX_MAX);
          gridY?.(ny * PARALLAX_MAX);
        };
        window.addEventListener("pointermove", onPointerMove, { passive: true });

        // 磁吸：位移作用在 .welcome-label（内层），外层可点击区域不动
        const magnets = Array.from(
          scope.querySelectorAll<HTMLElement>(".welcome-cta, .welcome-secondary")
        );
        const cleanups: Array<() => void> = [];

        for (const el of magnets) {
          const inner = el.querySelector<HTMLElement>(".welcome-label") ?? el;
          const xTo = gsap.quickTo(inner, "x", { duration: 0.35, ease: "power3" });
          const yTo = gsap.quickTo(inner, "y", { duration: 0.35, ease: "power3" });

          const onMove = (e: PointerEvent) => {
            const rect = el.getBoundingClientRect();
            const dx = e.clientX - (rect.left + rect.width / 2);
            const dy = e.clientY - (rect.top + rect.height / 2);
            xTo(gsap.utils.clamp(-MAGNET_MAX, MAGNET_MAX, dx * 0.35));
            yTo(gsap.utils.clamp(-MAGNET_MAX, MAGNET_MAX, dy * 0.35));
          };
          const onLeave = () => {
            gsap.to(inner, {
              x: 0,
              y: 0,
              duration: 0.5,
              ease: "elastic.out(1, 0.45)",
            });
          };

          el.addEventListener("pointermove", onMove);
          el.addEventListener("pointerleave", onLeave);
          cleanups.push(() => {
            el.removeEventListener("pointermove", onMove);
            el.removeEventListener("pointerleave", onLeave);
            gsap.set(inner, { x: 0, y: 0 });
          });
        }

        return () => {
          window.removeEventListener("pointermove", onPointerMove);
          for (const fn of cleanups) fn();
          if (grid) gsap.set(grid, { x: 0, y: 0 });
        };
      }
    );

    return () => {
      mm.revert();
      document.documentElement.classList.remove("js-ready");
    };
  }, [router]);

  return <div className="welcome-wipe" aria-hidden="true" ref={wipeRef} />;
}