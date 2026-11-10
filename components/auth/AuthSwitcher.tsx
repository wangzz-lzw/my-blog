"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { LoginFields } from "@/components/auth/LoginFields";
import { RegisterFields } from "@/components/auth/RegisterFields";

/**
 * 登录 / 注册的切换器（见 openspec: auth-panel）。
 *
 * 三个入口共用这一个壳：欢迎页右侧的行内面板（variant="panel"）、
 * `/login` 与 `/register` 两个独立页（variant="page"）。
 * 差异只有"外观"与"成功后去哪"，切换动画、两步注册、输入保持这些逻辑完全共用——
 * 复制三份必然走形，所以抽出来。
 *
 * 两块表单始终挂载、始终在横向轨道上：切换时当前页向左退出、目标页从右侧进入。
 * 这样才有方向感（"翻页"），而不是原地淡入淡出。
 */

export type AuthTab = "login" | "register";

const TABS: { id: AuthTab; label: string }[] = [
  { id: "login", label: "登录" },
  { id: "register", label: "注册" },
];

/** 换页时长；与高度过渡配合，看起来是一个动作 */
const SLIDE_SECONDS = 0.4;
const REDUCED_SLIDE_SECONDS = 0;

function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export type AuthSwitcherProps = {
  /** 首次渲染落在哪个 tab（不受控模式下才会用到） */
  initialTab?: AuthTab;
  /**
   * 受控模式：外面传 `tab` + `onTabChange`，内部不再自管理。
   * 独立页需要这样——它要把 tab 状态提到外层，避免切换时组件被重建而丢输入。
   */
  tab?: AuthTab;
  variant: "panel" | "page";
  onTabChange?: (tab: AuthTab) => void;
  onLoginSuccess: () => void;
  onRegisterSuccess: () => void;
  /** 面板的关闭按钮；独立页不传 */
  onRequestClose?: () => void;
};

export function AuthSwitcher({
  initialTab = "login",
  tab: controlledTab,
  variant,
  onTabChange,
  onLoginSuccess,
  onRegisterSuccess,
  onRequestClose,
}: AuthSwitcherProps) {
  const [innerTab, setInnerTab] = useState<AuthTab>(initialTab);
  const tab = controlledTab ?? innerTab;
  const setTab = useCallback(
    (next: AuthTab) => {
      if (controlledTab === undefined) setInnerTab(next);
      onTabChange?.(next);
    },
    [controlledTab, onTabChange]
  );
  const trackRef = useRef<HTMLDivElement | null>(null);
  const paneRefs = useRef<Record<AuthTab, HTMLDivElement | null>>({
    login: null,
    register: null,
  });
  const listRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const tabRefs = useRef<Record<AuthTab, HTMLButtonElement | null>>({
    login: null,
    register: null,
  });
  /** 首次挂载时不做动画，直接摆到位 */
  const firstRun = useRef(true);

  /* ---------- 指示条：跟着 tab 走，不参与横向轨道 ---------- */

  const moveIndicator = useCallback((animate: boolean) => {
    const btn = tabRefs.current[tab];
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!btn || !list || !indicator) return;
    const btnRect = btn.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    const x = btnRect.left - listRect.left;
    const width = btnRect.width;

    gsap.killTweensOf(indicator);
    if (animate && !prefersReduced()) {
      gsap.to(indicator, { x, width, duration: SLIDE_SECONDS * 0.75, ease: "power3.inOut" });
    } else {
      gsap.set(indicator, { x, width });
    }
  }, [tab]);

  /* ---------- 横向换页 + 高度跟随 ---------- */

  const placePanes = useCallback(
    (animate: boolean, prevTab?: AuthTab) => {
      const track = trackRef.current;
      if (!track) return;
      const active = paneRefs.current[tab];
      const other = prevTab ? paneRefs.current[prevTab] : null;

      const reduced = prefersReduced();
      const dur = animate && !reduced ? SLIDE_SECONDS : REDUCED_SLIDE_SECONDS;

      // 每次切换先杀掉旧动画：快速连点时不能被上一段拖住
      (Object.keys(paneRefs.current) as AuthTab[]).forEach((k) => {
        const el = paneRefs.current[k];
        if (el) gsap.killTweensOf(el);
      });

      // 目标页从对应方向进场；非目标页退到另一侧
      (Object.keys(paneRefs.current) as AuthTab[]).forEach((k) => {
        const el = paneRefs.current[k];
        if (!el) return;
        if (k === tab) {
          gsap.to(el, { xPercent: 0, duration: dur, ease: "power3.out" });
        } else {
          // 从登录切到注册：登录往左（-100），注册原先在右（+100）
          // 反向时符号相反，靠"相对于当前 tab 的位置"决定
          const dir = k === "login" ? -100 : 100;
          gsap.to(el, { xPercent: dir, duration: dur, ease: "power3.out" });
        }
      });

      // 高度跟到激活块的自然高度
      if (active) {
        const h = active.offsetHeight;
        if (h > 0) {
          if (reduced) {
            track.style.transition = "none";
            track.style.height = `${h}px`;
          } else {
            track.style.transition = `height ${SLIDE_SECONDS * 0.9}s cubic-bezier(.22,.61,.36,1)`;
            track.style.height = `${h}px`;
          }
        }
      }
      void other;
    },
    [tab]
  );

  // 首次挂载：直接摆位，不播动画
  useLayoutEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    // 非激活块一开始就待在右侧视野外
    (Object.keys(paneRefs.current) as AuthTab[]).forEach((k) => {
      const el = paneRefs.current[k];
      if (!el) return;
      if (k === tab) gsap.set(el, { xPercent: 0 });
      else gsap.set(el, { xPercent: k === "login" ? -100 : 100 });
    });
    const active = paneRefs.current[tab];
    if (active) track.style.height = `${active.offsetHeight}px`;
    moveIndicator(false);
    firstRun.current = false;
    // 只在挂载与 tab 变化时跑；prevTab 由下面的 effect 负责
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // tab 变化：换页
  const prevTabRef = useRef<AuthTab>(initialTab);
  useLayoutEffect(() => {
    if (firstRun.current) return;
    const prev = prevTabRef.current;
    if (prev === tab) return;
    placePanes(true, prev);
    moveIndicator(true);
    prevTabRef.current = tab;
  }, [tab, placePanes, moveIndicator]);

  /* ---------- 内容高度变化（两步注册、错误提示）时重算轨道高度 ---------- */

  useEffect(() => {
    const track = trackRef.current;
    const active = paneRefs.current[tab];
    if (!track || !active) return;
    let frame = 0;
    const sync = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const h = active.offsetHeight;
        if (h > 0 && Math.abs(parseFloat(track.style.height || "0") - h) > 1) {
          track.style.height = `${h}px`;
        }
      });
    };
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(sync);
    observer.observe(active);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [tab]);

  /* ---------- tab 切换 ---------- */

  function selectTab(next: AuthTab) {
    if (next === tab) return;
    setTab(next);
    onTabChange?.(next);
  }

  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: AuthTab = tab === "login" ? "register" : "login";
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="auth-switcher" data-variant={variant}>
      <div className="auth-panel-head">
        <div className="auth-tablist" role="tablist" aria-label="登录或注册" ref={listRef}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`auth-tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`auth-pane-${t.id}`}
              tabIndex={tab === t.id ? 0 : -1}
              className="auth-tab"
              ref={(el) => {
                tabRefs.current[t.id] = el;
              }}
              onClick={() => selectTab(t.id)}
              onKeyDown={onTabKeyDown}
            >
              {t.label}
            </button>
          ))}
          <span className="auth-tab-indicator" aria-hidden="true" ref={indicatorRef} />
        </div>

        {onRequestClose && (
          <button
            type="button"
            className="auth-close"
            aria-label="关闭登录面板"
            onClick={onRequestClose}
          >
            ✕
          </button>
        )}
      </div>

      {/* 横向轨道：两块 pane 叠在同一位置，靠 transform 左右换页 */}
      <div className="auth-track" ref={trackRef}>
        <div
          className="auth-pane"
          data-pane="login"
          data-active={tab === "login"}
          role="tabpanel"
          id="auth-pane-login"
          aria-labelledby="auth-tab-login"
          aria-hidden={tab !== "login"}
          ref={(el) => {
            paneRefs.current.login = el;
          }}
        >
          <LoginFields onSuccess={onLoginSuccess} />
        </div>
        <div
          className="auth-pane"
          data-pane="register"
          data-active={tab === "register"}
          role="tabpanel"
          id="auth-pane-register"
          aria-labelledby="auth-tab-register"
          aria-hidden={tab !== "register"}
          ref={(el) => {
            paneRefs.current.register = el;
          }}
        >
          <RegisterFields onSuccess={onRegisterSuccess} />
        </div>
      </div>
    </div>
  );
}
