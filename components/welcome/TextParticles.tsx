"use client";

import { useEffect, useRef } from "react";

/** 指针进入文字外扩这个距离就触发 */
const HOVER_PAD = 24;
/** 粒子被推开的半径 */
const REPEL_RADIUS = 90;
/** 采样步长（CSS px）：越小越细，越多越费 */
const SAMPLE_STEP = 3;
/** 点数上限（超大字号时兜底） */
const MAX_POINTS = 3200;
/** 每颗粒子边长 */
const DOT = 1.5;
/** 判定"已经拼回去"的位移阈值 */
const SETTLED = 0.6;

type RGB = { r: number; g: number; b: number };
type Particle = {
  hx: number;
  hy: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

function readColor(value: string, fallback: RGB): RGB {
  const hex = value.trim().startsWith("#") ? value.trim().slice(1) : "";
  if (hex.length === 6) {
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  }
  return fallback;
}

/**
 * 文字粒子化：鼠标靠近字标时，文字散成粒子被推开；移开后粒子弹回原位拼回文字。
 * 做法是把字标用同样的字体画进离屏 canvas，逐像素采样出点位作为"家"。
 * 装饰层：不接收事件、对辅助技术隐藏；减弱动效时完全不启动。
 */
export function TextParticles({ selector }: { selector: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");
    if (reduce.matches || !finePointer.matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const styles = getComputedStyle(document.body);
    const idle = readColor(styles.getPropertyValue("--w-ink"), { r: 11, g: 14, b: 18 });
    const hot = readColor(styles.getPropertyValue("--w-signal"), { r: 15, g: 98, b: 254 });

    let width = 0;
    let height = 0;
    let dpr = 1;
    let points: Particle[] = [];
    let rect: DOMRect | null = null;
    let pointer: { x: number; y: number } | null = null;
    let active = false;
    let raf = 0;
    let last = 0;

    /** 把字标按相同字体画进离屏画布，逐像素采样出粒子"家"的位置 */
    const sample = () => {
      rect = target.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) {
        points = [];
        return;
      }

      const cs = getComputedStyle(target);
      const fontSize = parseFloat(cs.fontSize) || 32;
      const family = cs.fontFamily || "monospace";
      const weight = cs.fontWeight || "400";
      const tracking =
        cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing) || 0;

      const off = document.createElement("canvas");
      const w = Math.ceil(rect.width * dpr);
      const h = Math.ceil(rect.height * dpr);
      off.width = w;
      off.height = h;
      const octx = off.getContext("2d");
      if (!octx) return;

      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, rect.width, rect.height);
      octx.fillStyle = "#000";
      octx.font = `${weight} ${fontSize}px ${family}`;
      octx.textBaseline = "middle";

      // 逐字绘制并手动加字距，贴合 DOM 里的 letter-spacing
      const text = target.textContent ?? "";
      let x = 0;
      const baseline = rect.height / 2;
      for (const char of text) {
        octx.fillText(char, x, baseline);
        x += octx.measureText(char).width + tracking;
      }

      const data = octx.getImageData(0, 0, w, h).data;
      const step = Math.max(1, Math.round(SAMPLE_STEP * dpr));
      const next: Particle[] = [];
      for (let py = 0; py < h; py += step) {
        for (let px = 0; px < w; px += step) {
          const alpha = data[(py * w + px) * 4 + 3];
          if (alpha < 128) continue;
          const homeX = rect.left + px / dpr;
          const homeY = rect.top + py / dpr;
          next.push({ hx: homeX, hy: homeY, x: homeX, y: homeY, vx: 0, vy: 0 });
          if (next.length >= MAX_POINTS) break;
        }
        if (next.length >= MAX_POINTS) break;
      }
      points = next;
    };

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sample();
    };

    const inZone = (x: number, y: number) =>
      rect !== null &&
      x > rect.left - HOVER_PAD &&
      x < rect.right + HOVER_PAD &&
      y > rect.top - HOVER_PAD &&
      y < rect.bottom + HOVER_PAD;

    const setTextVisible = (visible: boolean) => {
      target.style.opacity = visible ? "" : "0";
    };

    const draw = () => {
      ctx.clearRect(0, 0, width, height);

      const r2 = REPEL_RADIUS * REPEL_RADIUS;
      let moving = 0;
      let hot2 = 0;

      ctx.fillStyle = `rgba(${idle.r}, ${idle.g}, ${idle.b}, 0.95)`;
      ctx.beginPath();
      for (const p of points) {
        if (pointer) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < r2) {
            const d = Math.sqrt(d2) || 1;
            const force = (1 - d / REPEL_RADIUS) * 3.2;
            p.vx += (dx / d) * force;
            p.vy += (dy / d) * force;
          }
        }
        p.vx += (p.hx - p.x) * 0.05;
        p.vy += (p.hy - p.y) * 0.05;
        p.vx *= 0.88;
        p.vy *= 0.88;
        p.x += p.vx;
        p.y += p.vy;

        const disp = Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy);
        if (disp > SETTLED) {
          moving += 1;
          if (disp > 6) hot2 += 1;
          continue;
        }
        ctx.rect(p.x, p.y, DOT, DOT);
      }
      ctx.fill();

      if (hot2 > 0) {
        ctx.fillStyle = `rgba(${hot.r}, ${hot.g}, ${hot.b}, 0.9)`;
        ctx.beginPath();
        for (const p of points) {
          const disp = Math.abs(p.x - p.hx) + Math.abs(p.y - p.hy);
          if (disp <= 6) continue;
          ctx.rect(p.x, p.y, DOT, DOT);
        }
        ctx.fill();
      }

      return { moving, total: points.length };
    };

    const loop = (now: number) => {
      // 固定步长感：每帧只跑一次物理，时间戳仅用于降频（低端机 30fps 也能看）
      if (now - last >= 8) {
        last = now;
        const { moving } = draw();
        if (!active && moving === 0) {
          // 已经拼回去了：粒子层隐去，真实文字恢复
          ctx.clearRect(0, 0, width, height);
          setTextVisible(true);
          raf = 0;
          return;
        }
      }
      raf = window.requestAnimationFrame(loop);
    };

    const start = () => {
      if (raf) return;
      last = 0;
      raf = window.requestAnimationFrame(loop);
    };

    const activate = () => {
      active = true;
      setTextVisible(false);
      start();
    };

    const deactivate = () => {
      active = false;
      pointer = null;
      start();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!inZone(e.clientX, e.clientY)) {
        if (active) deactivate();
        return;
      }
      if (!active) activate();
      pointer = { x: e.clientX, y: e.clientY };
    };

    const onLeaveWindow = () => {
      if (active) deactivate();
    };

    resize();
    // 字体加载完再采一次，避免用回退字体采样导致点位偏移
    if (document.fonts?.ready) {
      document.fonts.ready.then(() => sample()).catch(() => {});
    }

    window.addEventListener("resize", resize);
    // 页面滚动会让"家"的视口坐标失效，重新采样
    window.addEventListener("scroll", sample, { passive: true });
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.addEventListener("pointerleave", onLeaveWindow);
    window.addEventListener("blur", onLeaveWindow);

    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("scroll", sample);
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerleave", onLeaveWindow);
      window.removeEventListener("blur", onLeaveWindow);
      target.style.opacity = "";
      ctx.clearRect(0, 0, width, height);
    };
  }, [selector]);

  return <canvas className="welcome-text-particles" aria-hidden="true" ref={ref} />;
}