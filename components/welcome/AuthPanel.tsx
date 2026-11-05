"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { LoginFields } from "@/components/auth/LoginFields";
import { RegisterFields } from "@/components/auth/RegisterFields";

type Tab = "login" | "register";

const TABS: { id: Tab; label: string }[] = [
  { id: "login", label: "登录" },
  { id: "register", label: "注册" },
];

function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 欢迎页右侧的行内登录面板（不是弹窗/抽屉）：
 * 打开时占住右栏，无遮罩、不锁滚动；Esc 关闭、焦点进第一个输入框、关闭后焦点回到触发按钮。
 * 两个 tab 的表单始终挂载，切换只改可见性——切回来输入还在。
 */
export function AuthPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("login");
  const panelRef = useRef<HTMLElement | null>(null);
  const formsRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    login: null,
    register: null,
  });
  const closingRef = useRef(false);

  /* ---------- 指示条 ---------- */

  const moveIndicator = useCallback(
    (animate: boolean) => {
      const btn = tabRefs.current[tab];
      const list = listRef.current;
      const indicator = indicatorRef.current;
      if (!btn || !list || !indicator) return;
      const btnRect = btn.getBoundingClientRect();
      const listRect = list.getBoundingClientRect();
      const x = btnRect.left - listRect.left;
      if (animate && !prefersReduced()) {
        gsap.to(indicator, {
          x,
          width: btnRect.width,
          duration: 0.3,
          ease: "power3.inOut",
        });
      } else {
        gsap.set(indicator, { x, width: btnRect.width });
      }
    },
    [tab]
  );

  /* ---------- 入场：抬一下 + 淡入，焦点进第一个输入框 ---------- */

  useLayoutEffect(() => {
    if (!open) return;
    closingRef.current = false;
    const panel = panelRef.current;
    if (!panel) return;
    moveIndicator(false);
    const firstInput = panel.querySelector<HTMLInputElement>("input");
    firstInput?.focus({ preventScroll: true });
    if (prefersReduced()) {
      gsap.set(panel, { opacity: 1, y: 0 });
      return;
    }
    gsap.fromTo(
      panel,
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.42, ease: "power3.out" }
    );
  }, [open, moveIndicator]);

  useLayoutEffect(() => {
    if (!open) return;
    moveIndicator(true);
    const pane = panelRef.current?.querySelector<HTMLElement>(
      `[data-pane="${tab}"]`
    );
    if (!pane) return;
    if (prefersReduced()) {
      gsap.set(pane, { x: 0, opacity: 1 });
      return;
    }
    gsap.fromTo(
      pane,
      { x: 12, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.26, ease: "power3.out" }
    );
  }, [tab, open, moveIndicator]);

  /* ---------- 两块表单高度对齐：切 tab 时面板尺寸不变 ---------- */

  useLayoutEffect(() => {
    if (!open) return;
    const forms = formsRef.current;
    if (!forms) return;
    const measure = () => {
      const panes = Array.from(forms.querySelectorAll<HTMLElement>(".auth-pane"));
      const max = Math.max(0, ...panes.map((p) => p.offsetHeight));
      if (max > 0) forms.style.minHeight = `${max}px`;
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, tab]);

  /* ---------- 关闭 ---------- */

  const requestClose = useCallback(() => {
    if (closingRef.current) return;
    closingRef.current = true;
    const panel = panelRef.current;
    if (!panel || prefersReduced()) {
      onOpenChange(false);
      return;
    }
    gsap.to(panel, {
      opacity: 0,
      y: 8,
      duration: 0.24,
      ease: "power2.in",
      onComplete: () => onOpenChange(false),
    });
  }, [onOpenChange]);

  const handleSuccess = useCallback(() => {
    const go = () => {
      onOpenChange(false);
      router.push("/blog");
      router.refresh();
    };
    const panel = panelRef.current;
    if (!panel || prefersReduced()) {
      go();
      return;
    }
    gsap.to(panel, { opacity: 0, y: -6, duration: 0.2, ease: "power2.in" });
    window.setTimeout(go, 200);
  }, [onOpenChange, router]);

  /* ---------- Esc 关闭（焦点在面板内时） ---------- */

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      requestClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  /* ---------- 键盘：tab 左右切换 ---------- */

  function onTabKeyDown(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next: Tab = tab === "login" ? "register" : "login";
    setTab(next);
    tabRefs.current[next]?.focus();
  }

  if (!open) return null;

  return (
    <section className="auth-panel" aria-label="登录或注册" ref={panelRef}>
      <span className="auth-seam" aria-hidden="true" />

      <div className="auth-panel-head">
        <div
          className="auth-tablist"
          role="tablist"
          aria-label="登录或注册"
          ref={listRef}
        >
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
              onClick={() => setTab(t.id)}
              onKeyDown={onTabKeyDown}
            >
              {t.label}
            </button>
          ))}
          <span className="auth-tab-indicator" aria-hidden="true" ref={indicatorRef} />
        </div>

        <button
          type="button"
          className="auth-close"
          aria-label="关闭登录面板"
          onClick={requestClose}
        >
          ✕
        </button>
      </div>

      <div className="auth-forms" ref={formsRef}>
        <div
          className="auth-pane"
          data-pane="login"
          data-active={tab === "login"}
          role="tabpanel"
          id="auth-pane-login"
          aria-labelledby="auth-tab-login"
        >
          <LoginFields onSuccess={handleSuccess} />
        </div>
        <div
          className="auth-pane"
          data-pane="register"
          data-active={tab === "register"}
          role="tabpanel"
          id="auth-pane-register"
          aria-labelledby="auth-tab-register"
        >
          <RegisterFields onSuccess={handleSuccess} />
        </div>
      </div>
    </section>
  );
}