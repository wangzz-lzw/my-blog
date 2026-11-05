"use client";

import { useEffect, useRef, useState } from "react";
import { applyTheme, currentTheme, THEMES, type ThemeId } from "@/lib/theme";

/** 页头（未登录）/后台侧栏的主题切换器：写入 <html data-theme> + localStorage */
export function ThemeSwitcher() {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>("cyber");
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setTheme(currentTheme());
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
    applyTheme(id);
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
