"use client";
// Theme state for React. Persistence and DOM updates are delegated to lib/theme.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { applyTheme, DEFAULT_THEME, resolveTheme, saveTheme, storedTheme, systemTheme, type Theme } from "@/lib/theme";

interface ThemeCtx {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
}

const Ctx = createContext<ThemeCtx | null>(null);

export function useTheme() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useTheme outside ThemeProvider");
  return c;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  // Sync with what the inline head script already applied.
  useEffect(() => {
    const t = resolveTheme();
    setThemeState(t);
    applyTheme(t);
  }, []);

  // Follow the device setting until the visitor picks a theme themselves.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = () => {
      if (storedTheme()) return;
      const t = systemTheme();
      setThemeState(t);
      applyTheme(t);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    applyTheme(t);
    saveTheme(t);
  }, []);

  const toggleTheme = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <Ctx.Provider value={{ theme, setTheme, toggleTheme }}>{children}</Ctx.Provider>;
}
