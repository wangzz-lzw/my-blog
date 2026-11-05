"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AuthPanel } from "@/components/welcome/AuthPanel";

/**
 * 欢迎页的「登录」入口：真链接（无 JS 直接去 /login）+ 点击后在右侧栏位的行内面板。
 * 面板用 portal 挂到页面预留的 `#welcome-auth-slot`，这样入口和面板可以待在不同布局位置。
 */
export function AuthTrigger() {
  const [open, setOpen] = useState(false);
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLAnchorElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("welcome-auth-slot"));
  }, []);

  function announce(open: boolean) {
    window.dispatchEvent(
      new CustomEvent("welcome:auth", { detail: { open } })
    );
  }

  function close(next: boolean) {
    setOpen(next);
    announce(next);
    if (!next) {
      // 关闭后焦点回到触发按钮
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  return (
    <>
      <a
        href="/login"
        className="welcome-secondary"
        ref={triggerRef}
        aria-expanded={open}
        onClick={(e) => {
          // 修饰键交给浏览器（新标签打开等）
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
            return;
          }
          e.preventDefault();
          setOpen(true);
        }}
      >
        <span className="welcome-label">登录</span>
      </a>
      {slot && createPortal(<AuthPanel open={open} onOpenChange={close} />, slot)}
    </>
  );
}