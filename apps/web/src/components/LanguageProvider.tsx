"use client";
// The visitor's language (English, Tamil or Hindi), saved in this browser. While the owner
// has the language menu switched off (Settings → featureLanguages), everyone sees English.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANG, intlLocale, saveLang, storedLang, translate, type Lang, type Params } from "@/lib/i18n";
import { useSettings } from "./ConfigProvider";

interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** The language menu is shown (owner switch). */
  enabled: boolean;
  /** For dates and numbers: "en-IN", "ta-IN" or "hi-IN". */
  locale: string;
  t: (key: string, params?: Params) => string;
}

const Ctx = createContext<LangCtx | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const enabled = useSettings().featureLanguages === true;
  const [chosen, setChosen] = useState<Lang>(DEFAULT_LANG);
  useEffect(() => setChosen(storedLang()), []);
  const lang = enabled ? chosen : DEFAULT_LANG;
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = useCallback((l: Lang) => { setChosen(l); saveLang(l); }, []);
  const value = useMemo<LangCtx>(() => ({ lang, setLang, enabled, locale: intlLocale(lang), t: (key, params) => translate(lang, key, params) }), [lang, setLang, enabled]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLang() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useLang outside LanguageProvider");
  return c;
}

/** t(key, params): the message in the visitor's language. */
export const useT = () => useLang().t;
