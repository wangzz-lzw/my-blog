/** 六套配色主题：页头菜单、底部切换器、后台侧栏共用同一份定义 */
export const THEMES = [
  { id: "cyber", name: "赛博青", swatch: ["#00f0ff", "#ff2a6d", "#05070d"] },
  { id: "indigo", name: "午夜靛", swatch: ["#7aa2ff", "#c084fc", "#070913"] },
  { id: "ember", name: "余烬橙", swatch: ["#ff9f45", "#ff5c8a", "#0e0703"] },
  { id: "forest", name: "苔原绿", swatch: ["#3ddc97", "#ffd166", "#040a07"] },
  { id: "sakura", name: "樱雾粉", swatch: ["#ff7ac6", "#8b5cf6", "#0c0710"] },
  { id: "daylight", name: "晨光白", swatch: ["#f5f7fa", "#0a6f92", "#c0246a"] },
] as const;

export type ThemeId = (typeof THEMES)[number]["id"];

const STORAGE_KEY = "theme";

/** 读当前主题（以 <html data-theme> 为准，SSR 下取默认） */
export function currentTheme(): ThemeId {
  if (typeof document === "undefined") return "cyber";
  const t = document.documentElement.dataset.theme;
  return THEMES.some((x) => x.id === t) ? (t as ThemeId) : "cyber";
}

/** 写入 <html data-theme> + localStorage（隐私模式下只改内存） */
export function applyTheme(id: ThemeId) {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // 隐私模式 / 禁用存储：忽略
  }
}