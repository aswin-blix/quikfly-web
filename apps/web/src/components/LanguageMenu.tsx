"use client";
// The language picker (English, தமிழ், हिन्दी). Hidden while the owner's featureLanguages
// switch is off. A native <select>, so it works with keyboards and screen readers as is.
import { Languages } from "lucide-react";
import { cx } from "@/lib/format";
import { isLang, LANGS } from "@/lib/i18n";
import { useLang } from "./LanguageProvider";

export function LanguageMenu({ className, compact }: { className?: string; compact?: boolean }) {
  const { lang, setLang, enabled, t } = useLang();
  if (!enabled) return null;
  return (
    <label className={cx("relative flex items-center gap-1.5 rounded-lg text-sm text-soft hover:text-gold hover:bg-fg/5 cursor-pointer", compact ? "px-2 h-10" : "px-3 py-2 border border-line", className)}>
      <Languages size={17} aria-hidden="true" />
      <span className="sr-only">{t("langMenu")}</span>
      {compact && <span aria-hidden="true" className="text-xs font-semibold uppercase">{lang}</span>}
      <select value={lang} onChange={(e) => isLang(e.target.value) && setLang(e.target.value)}
        className={cx("bg-transparent cursor-pointer focus-visible:outline-none", compact ? "absolute inset-0 opacity-0" : "pr-1")}>
        {LANGS.map((l) => <option key={l.code} value={l.code} lang={l.code}>{l.name}</option>)}
      </select>
    </label>
  );
}
