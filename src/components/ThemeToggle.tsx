"use client";
import { Moon, Sun } from "lucide-react";
import { cx } from "@/lib/format";
import { useTheme } from "./ThemeProvider";

/** Header button that switches between light and dark mode. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggleTheme } = useTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button type="button" onClick={toggleTheme} aria-label={`Switch to ${next} mode`} title={`Switch to ${next} mode`}
      className={cx("w-10 h-10 grid place-items-center rounded-lg text-soft hover:text-gold hover:bg-fg/5 transition-colors", className)}>
      {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
