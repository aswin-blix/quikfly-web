// Theme logic (no React, no styling). Colours for each theme live in
// src/styles/tokens.css; this file only decides which theme is active.

export type Theme = "light" | "dark";

export const THEMES: readonly Theme[] = ["dark", "light"];
export const DEFAULT_THEME: Theme = "dark";
export const THEME_STORAGE_KEY = "quikfly.theme";
export const THEME_ATTRIBUTE = "data-theme";

/** Browser chrome colour per theme — keep in sync with --bg in tokens.css. */
export const THEME_COLORS: Record<Theme, string> = { dark: "#07070a", light: "#faf8f3" };

const isTheme = (v: unknown): v is Theme => v === "light" || v === "dark";

/** The theme the visitor explicitly chose, if any. */
export function storedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(v) ? v : null;
  } catch {
    return null;
  }
}

export function systemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return DEFAULT_THEME;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Saved choice first, then the device setting. */
export const resolveTheme = (): Theme => storedTheme() ?? systemTheme();

export function applyTheme(theme: Theme) {
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
}

export function saveTheme(theme: Theme) {
  try { localStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* storage unavailable */ }
}

/**
 * Inlined in <head> so the right theme is set before first paint (no flash).
 * Must stay dependency-free: it runs before any bundle loads.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: light)").matches?"light":"dark"}document.documentElement.setAttribute(${JSON.stringify(THEME_ATTRIBUTE)},t)}catch(e){}})();`;
