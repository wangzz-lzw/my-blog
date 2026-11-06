"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { toSiteImageUrl } from "@/lib/image-url";
import { url } from "node:inspector";

export type OrbitPost = {
  id: string;
  slug: string;
  title: string;
  cover: string | null;
  date: string;
  tags: string[];
};

/** 环上至少摆这么多格：3D 环背面会隐藏，格数太少就只能看见一两张 */
const MIN_SLOTS = 8;
/** 一圈多少秒 */
const REVOLUTION = 40;
/** 悬停时自转减速倍率 */
const SLOW = 0.25;
/** 透视距离：小一点 = 立体感更强 */
const PERSPECTIVE = 1100;
/** 拖拽灵敏度：度 / 像素 */
const DRAG_SENS = 0.35;
/** 超过这个位移才算拖拽，用来区分点击 */
const DRAG_THRESHOLD = 4;
/** 松手速度上限：度 / 毫秒 */
const MAX_V = 1.2;
/** 惯性滑行增益：速度 × 这个值 = 还要多转多少度 */
const MOMENTUM_GAIN = 260;
/** 滚轮节流：一次只走一格 */
const WHEEL_THROTTLE = 220;
/** 停手多久后恢复自动自转 */
const RESUME_MS = 1500;
/** 指针倾斜幅度上限（度） */
const TILT_MAX = 7;

type Slot = { post: OrbitPost; key: string; duplicate: boolean };
type Driver = "auto" | "drag" | "momentum" | "snap";

function buildSlots(posts: OrbitPost[]): Slot[] {
  if (posts.length === 0) return [];
  const slots: Slot[] = [];
  let i = 0;
  while (slots.length < Math.max(posts.length, MIN_SLOTS)) {
    const post = posts[i % posts.length];
    slots.push({ post, key: `${post.id}-${i}`, duplicate: i >= posts.length });
    i += 1;
  }
  return slots;
}

function CardFace({ post }: { post: OrbitPost }) {
  const cover = toSiteImageUrl(post.cover);
  return (
    <span
      className="orbit-text-cover"
      data-has-cover={cover ? "true" : "false"}
      // 有封面就当背景：文字压在图上，由 CSS 里那层渐变压暗保证可读
      style={cover ? { backgroundImage: `url("${cover}")` } : undefined}
    >
      <span className="orbit-mark" aria-hidden="true" />
      <span className="orbit-title">{post.title}</span>
      <span className="orbit-meta">
        {post.tags.length > 0
          ? post.tags.slice(0, 2).map((t) => `#${t}`).join("  ")
          : post.date}
      </span>
    </span>
  );
}

/**
 * 欢迎页右栏的 3D 环形文章导航。
 * 卡片立在圆筒外侧（rotateY + translateZ），由 GSAP 转圆筒的 rotationY。
 * 交互：拖拽旋转 + 惯性、指针倾斜、悬停前推、滚轮吸附、点击进详情。
 */
export function WelcomeOrbit({ posts }: { posts: OrbitPost[] }) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const tiltRef = useRef<HTMLDivElement | null>(null);
  const ringRef = useRef<HTMLUListElement | null>(null);
  const slots = buildSlots(posts);

  useEffect(() => {
    const stage = stageRef.current;
    const tilt = tiltRef.current;
    const ring = ringRef.current;
    if (!stage || !tilt || !ring || slots.length === 0) return;

    const items = Array.from(ring.querySelectorAll<HTMLElement>(".orbit-item"));
    const cardsOf = () =>
      Array.from(ring.querySelectorAll<HTMLElement>(".orbit-card"));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let alive = true;
    let radius = 0;
    let step = 45;
    /** 指针倾斜只在有悬停能力的宽屏上启用 */
    let tiltEnabled = false;
    const state = { rot: 0 };
    let tween: gsap.core.Tween | null = null;
    let driver: Driver = "auto";
    let resumeTimer = 0;

    const apply = () => gsap.set(ring, { rotationY: state.rot });

    /* ---------------- 圆周几何 ---------------- */

    const place = () => {
      const first = items[0];
      if (!first) return;
      const cardW = first.offsetWidth || 118;
      const n = items.length || 1;
      step = 360 / n;
      const minByChord = cardW / (2 * Math.sin(Math.PI / n));
      // 半径不能大过舞台：窄屏上按弦长算出来的圆会伸出容器，
      // 把半径压到「舞台宽 / 2 − 半张卡 − 一点余量」之内
      const byStage = Math.max(64, stage.clientWidth / 2 - cardW / 2 - 10);
      radius = Math.min(Math.max(cardW * 1.1, minByChord * 1.05), byStage);
      items.forEach((el, i) => {
        const angle = (i / n) * 360;
        el.style.transform = `translate(-50%, -50%) rotateY(${angle}deg) translateZ(${radius}px)`;
      });
    };

    /* ---------------- 驱动器 ---------------- */

    const killTween = () => {
      tween?.kill();
      tween = null;
    };

    const driveTo = (
      target: number,
      duration: number,
      ease: string,
      onDone?: () => void
    ) => {
      killTween();
      const aim = { v: state.rot };
      tween = gsap.to(aim, {
        v: target,
        duration,
        ease,
        onUpdate: () => {
          state.rot = aim.v;
          apply();
        },
        onComplete: onDone,
      });
    };

    const startAuto = () => {
      if (!alive) return;
      driver = "auto";
      const tick = () => {
        if (!alive) return;
        driver = "auto";
        driveTo(state.rot + 360, REVOLUTION, "none", tick);
      };
      tick();
    };

    const scheduleResume = () => {
      window.clearTimeout(resumeTimer);
      if (reduced.matches) return;
      resumeTimer = window.setTimeout(() => startAuto(), RESUME_MS);
    };

    const stopDrivers = () => {
      window.clearTimeout(resumeTimer);
      killTween();
    };

    /* ---------------- 指针倾斜 ---------------- */

    const tiltX = gsap.quickTo(tilt, "rotationX", {
      duration: 0.5,
      ease: "power3",
    });
    const tiltY = gsap.quickTo(tilt, "rotationY", {
      duration: 0.5,
      ease: "power3",
    });

    const updateTilt = (e: PointerEvent) => {
      if (!tiltEnabled || reduced.matches) return;
      const r = stage.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      tiltX(gsap.utils.clamp(-1, 1, -ny) * TILT_MAX);
      tiltY(gsap.utils.clamp(-1, 1, nx) * TILT_MAX);
    };

    const resetTilt = () => {
      tiltX(0);
      tiltY(0);
    };

    /* ---------------- 拖拽 ---------------- */

    let dragging = false;
    let dragged = false;
    let startX = 0;
    let startRot = 0;
    let lastX = 0;
    let lastT = 0;
    let velocity = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      stopDrivers();
      driver = "drag";
      dragging = true;
      dragged = false;
      startX = e.clientX;
      startRot = state.rot;
      lastX = e.clientX;
      lastT = performance.now();
      velocity = 0;
      stage.classList.add("is-grabbing");
    };

    const onPointerMove = (e: PointerEvent) => {
      updateTilt(e);
      if (!dragging) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > DRAG_THRESHOLD) dragged = true;
      state.rot = startRot + dx * DRAG_SENS;
      apply();
      const now = performance.now();
      const dt = now - lastT || 16;
      velocity = ((e.clientX - lastX) / dt) * DRAG_SENS;
      lastX = e.clientX;
      lastT = now;
    };

    const endDrag = () => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("is-grabbing");
      if (reduced.matches) {
        scheduleResume();
        return;
      }
      const v = gsap.utils.clamp(-MAX_V, MAX_V, velocity);
      if (Math.abs(v) > 0.05) {
        driver = "momentum";
        driveTo(
          state.rot + v * MOMENTUM_GAIN,
          0.9,
          "power3.out",
          scheduleResume
        );
      } else {
        scheduleResume();
      }
    };

    // 拖过的东西不当成点击
    const onClick = (e: MouseEvent) => {
      if (!dragged) return;
      e.preventDefault();
      e.stopPropagation();
      dragged = false;
    };

    /* ---------------- 滚轮吸附 ---------------- */

    let wheelAt = 0;

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 2) return;
      e.preventDefault();
      const now = performance.now();
      if (now - wheelAt < WHEEL_THROTTLE) return;
      wheelAt = now;
      stopDrivers();
      driver = "snap";
      const dir = e.deltaY > 0 ? 1 : -1;
      const snapped = Math.round(state.rot / step) * step;
      driveTo(snapped + dir * step, reduced.matches ? 0 : 0.55, "power3.out", scheduleResume);
    };

    /* ---------------- 悬停前推 ---------------- */

    const resetCards = () => {
      for (const card of cardsOf()) {
        gsap.to(card, { z: 0, scale: 1, opacity: 1, duration: 0.3 });
      }
      if (driver === "auto") tween?.timeScale(1);
    };

    const focusCard = (card: HTMLElement) => {
      gsap.to(card, { z: 40, scale: 1.03, duration: 0.35, ease: "power3.out" });
      for (const other of cardsOf()) {
        if (other !== card) gsap.to(other, { opacity: 0.65, duration: 0.25 });
      }
      if (driver === "auto") tween?.timeScale(SLOW);
    };

    const cardFrom = (target: EventTarget | null) =>
      target instanceof Element
        ? (target.closest(".orbit-card") as HTMLElement | null)
        : null;

    const onOver = (e: Event) => {
      const card = cardFrom(e.target);
      if (card) focusCard(card);
    };

    const onOut = (e: Event) => {
      const card = cardFrom(e.target);
      if (!card) return;
      // 在同一张卡内部移动不重置
      const next = (e as PointerEvent).relatedTarget;
      if (next instanceof Element && card.contains(next)) return;
      resetCards();
    };

    /* ---------------- 绑定 ---------------- */

    const prevOver = ring.dataset.bound;
    ring.dataset.bound = "1"; // 仅用于调试可读性
    void prevOver;

    ring.addEventListener("pointerover", onOver);
    ring.addEventListener("pointerout", onOut);
    ring.addEventListener("focusin", onOver);
    ring.addEventListener("focusout", onOut);
    ring.addEventListener("click", onClick, true);
    stage.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    stage.addEventListener("wheel", onWheel, { passive: false });
    stage.addEventListener("pointerleave", resetTilt);

    const mm = gsap.matchMedia();

    /**
     * 启用 3D 环。宽屏与窄屏只在参数上不同：
     * 窄屏卡片更小（CSS 里 --card-w 收小）、透视近一点、不做指针倾斜，
     * 但环本身照转——不再是"窄屏退回网格"。
     */
    const enableOrbit = (perspective: number, tilt: boolean) => () => {
      tiltEnabled = tilt;
      stage.style.position = "absolute";
      stage.style.inset = "0";
      stage.style.perspective = `${perspective}px`;
      stage.style.perspectiveOrigin = "50% 50%";
      stage.classList.add("is-orbit");
      ring.classList.add("is-orbiting");
      place();

      const ro = new ResizeObserver(() => place());
      ro.observe(stage);

      if (!reduced.matches) startAuto();

      return () => {
        tiltEnabled = false;
        ro.disconnect();
        stage.style.removeProperty("perspective");
        stage.style.removeProperty("perspective-origin");
        stage.classList.remove("is-orbit");
        ring.classList.remove("is-orbiting");
        stopDrivers();
        gsap.set(ring, { clearProps: "transform" });
        state.rot = 0;
        items.forEach((el) => {
          el.style.transform = "";
        });
      };
    };

    // 宽屏：完整形态（指针倾斜 + 1100 透视）
    mm.add("(min-width: 981px)", enableOrbit(PERSPECTIVE, true));
    // 窄屏 / 移动端：紧凑形态（更近的透视、不做倾斜，卡片尺寸交给 CSS）
    mm.add("(max-width: 980px)", enableOrbit(900, false));

    // 入场：在页面主序列之后出现
    if (!reduced.matches) {
      gsap.fromTo(
        stage,
        { opacity: 0, scale: 0.94 },
        { opacity: 1, scale: 1, duration: 0.6, delay: 1.3, ease: "power3.out" }
      );
    }

    // 与登录面板协调：面板打开时缩到右侧继续转
    const onAuth = (event: Event) => {
      const open = Boolean(
        (event as CustomEvent<{ open?: boolean }>).detail?.open
      );
      if (reduced.matches) return;
      gsap.to(stage, {
        scale: open ? 0.5 : 1,
        opacity: open ? 0.3 : 1,
        x: open ? 60 : 0,
        duration: 0.45,
        ease: "power3.out",
        overwrite: "auto",
      });
    };
    window.addEventListener("welcome:auth", onAuth);

    return () => {
      alive = false;
      window.removeEventListener("welcome:auth", onAuth);
      ring.removeEventListener("pointerover", onOver);
      ring.removeEventListener("pointerout", onOut);
      ring.removeEventListener("focusin", onOver);
      ring.removeEventListener("focusout", onOut);
      ring.removeEventListener("click", onClick, true);
      stage.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
      stage.removeEventListener("wheel", onWheel);
      stage.removeEventListener("pointerleave", resetTilt);
      mm.revert();
      stopDrivers();
      gsap.killTweensOf([stage, tilt]);
      gsap.set(tilt, { clearProps: "transform" });
    };
    // slots 由 posts 推导，长度变化时才需要重跑
  }, [slots.length]);

  if (slots.length === 0) return null;

  return (
    <div className="welcome-orbit" ref={stageRef} aria-label="最新文章">
      <div className="orbit-tilt" ref={tiltRef}>
        <ul className="welcome-orbit-list" ref={ringRef}>
          {slots.map(({ post, key, duplicate }) =>
            duplicate ? (
              <li key={key} className="orbit-item" aria-hidden="true">
                <span className="orbit-card orbit-card-static" draggable={false}>
                  <CardFace post={post} />
                </span>
              </li>
            ) : (
              <li key={key} className="orbit-item">
                <Link
                  href={`/posts/${post.slug}`}
                  className="orbit-card"
                  aria-label={`文章：${post.title}`}
                  draggable={false}
                >
                  <CardFace post={post} />
                </Link>
              </li>
            )
          )}
        </ul>
      </div>
    </div>
  );
}