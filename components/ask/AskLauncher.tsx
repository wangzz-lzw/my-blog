"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AskPanel } from "@/components/ask/AskPanel";

/**
 * 全站问答入口（见 openspec: add-ai-qa 的 D8）。
 *
 * 两个触发点共享同一份 open 状态与面板：
 *   - 页头导航里的「问问」按钮（显眼、常驻）
 *   - 右下角浮动按钮（贴边、随时可点）
 *
 * 面板用 portal 挂到 document.body，而不是留在按钮所在的 JSX 树里：
 * 页头有 backdrop-filter / sticky，会创建新的包含块，让 position:fixed 的面板
 * 相对页头而不是视口定位——实测面板被顶到屏幕上方（top:-567）。挂到 body 才能贴右下角。
 *
 * 无 JS：组件不渲染（"use client" + 首帧不挂载），不留空白。
 */

export function AskLauncher({ variant = "float" }: { variant?: "header" | "float" }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  function close() {
    setOpen(false);
    requestAnimationFrame(() => btnRef.current?.focus());
  }

  if (!mounted) return null;

  const label = open ? "收起问答" : "问问";

  const trigger = (
    <button
      ref={btnRef}
      type="button"
      className={variant === "header" ? `ask-nav-btn${open ? " is-active" : ""}` : `float-btn ask-launch${open ? " is-active" : ""}`}
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
      aria-label={variant === "float" ? label : undefined}
    >
      {variant === "header" ? (
        label
      ) : (
        <>
          <span className="float-btn__glyph" aria-hidden="true">
            ?
          </span>
          <span className="float-bubble" role="tooltip" aria-hidden="true">
            问问
          </span>
        </>
      )}
    </button>
  );

  return (
    <>
      {trigger}
      {open && createPortal(<AskPanel onClose={close} />, document.body)}
    </>
  );
}

