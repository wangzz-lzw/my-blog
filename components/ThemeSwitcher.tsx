"use client";

import { useEffect, useRef, useState } from "react";

const THEMES = [
  { id: "cyber", name: "赛博青", swatch: ["#00f0ff", "#ff2a6d", "#05070d"] },
  { id: "indigo", name: "午夜靛", swatch: ["#7aa2ff", "#c084fc", "#070913"] },
  { id: "ember", name: "余烬橙", swatch: ["#ff9f45", "#ff5c8a", "#0e0703"] },
  { id: "forest", name: "苔原绿", swatch: ["#3ddc97", "#ffd166", "#040a07"] },
  { id: "sakura", name: "樱雾粉", swatch: ["#ff7ac6", "#8b5cf6", "#0c0710"] },
  { id: "daylight", name: "晨光白", swatch: ["#f5f7fa", "#0a6f92", "#c0246a"] },
] as const;

type ThemeId = (typeof THEMES)[number]["id"];

/** 页头/侧栏的主题切换器：写入 <html data-theme> + localStorage */
export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("cyber");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = document.documentElement.dataset.theme as ThemeId | undefined;
    if (t && THEMES.some((x) => x.id === t)) setTheme(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(id: ThemeId) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    try {
      localStorage.setItem("theme", id);
    } catch {
      // 隐私模式下忽略
    }
    setOpen(false);
  }

  const current = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div className="theme-switch" ref={ref}>
      <button
        type="button"
        className="theme-btn"
        aria-label="切换配色主题"
        aria-expanded={open}
        title="切换配色主题"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="theme-dots" aria-hidden="true">
          {current.swatch.map((c) => (
            <i key={c} style={{ background: c }} />
          ))}
        </span>
      </button>

      {open && (
        <div className="theme-menu" role="menu" aria-label="配色主题">
          <p className="theme-menu-title">配色主题</p>
          {THEMES.map((t) => (
            <button
              key={t.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === t.id}
              className={theme === t.id ? "active" : ""}
              onClick={() => choose(t.id)}
            >
              <span className="theme-dots" aria-hidden="true">
                {t.swatch.map((c) => (
                  <i key={c} style={{ background: c }} />
                ))}
              </span>
              <span className="theme-name">{t.name}</span>
              {theme === t.id && (
                <span className="theme-check" aria-hidden="true">
                  ✓
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
