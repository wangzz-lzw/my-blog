"use client";

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { AuthSwitcher } from "@/components/auth/AuthSwitcher";

function prefersReduced() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * 欢迎页右侧的行内登录面板（不是弹窗/抽屉）：
 * 打开时占住右栏，无遮罩、不锁滚动；Esc 关闭、焦点进第一个输入框、关闭后焦点回到触发按钮。
 *
 * 面板自己只负责"开着时的进出与焦点"，登录/注册的切换与两步注册都交给 AuthSwitcher
 * —— 那块逻辑与 `/login`、`/register` 两个独立页共用（见 openspec: auth-panel）。
 */
export function AuthPanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
}) {
  const router = useRouter();
  const panelRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);

  /* ---------- 入场：抬一下 + 淡入，焦点进第一个输入框 ---------- */

  useLayoutEffect(() => {
    if (!open) return;
    closingRef.current = false;
    const panel = panelRef.current;
    if (!panel) return;
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
  }, [open]);

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

  const goBlog = useCallback(() => {
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

  /* ---------- Esc 关闭 ---------- */

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

  if (!open) return null;

  return (
    <section className="auth-panel" aria-label="登录或注册" ref={panelRef}>
      <span className="auth-seam" aria-hidden="true" />
      <span className="auth-ruler" aria-hidden="true" />

      <AuthSwitcher
        variant="panel"
        initialTab="login"
        onRequestClose={requestClose}
        onLoginSuccess={goBlog}
        onRegisterSuccess={goBlog}
      />
    </section>
  );
}
