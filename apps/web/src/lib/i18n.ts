// UI languages. The strings live once, for the website and both apps, in
// packages/shared/i18n/app_<lang>.arb (Flutter's ARB format; English is the template).
// Screens call t(key, params) from useT() (components/LanguageProvider.tsx). A key
// missing in Tamil or Hindi falls back to English, so a half-translated screen still reads.
import en from "@quikfly/shared/i18n/app_en.arb";
import hi from "@quikfly/shared/i18n/app_hi.arb";
import ta from "@quikfly/shared/i18n/app_ta.arb";

export const LANGS = [
  { code: "en", name: "English" },
  { code: "ta", name: "தமிழ்" },
  { code: "hi", name: "हिन्दी" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const DEFAULT_LANG: Lang = "en";
export const LANG_KEY = "quikfly.lang";

const CATALOG: Record<Lang, Record<string, unknown>> = { en, ta, hi };

/** The locale for dates and numbers in each language (Indian formats). */
export const intlLocale = (lang: Lang) => `${lang}-IN`;

export const isLang = (v: unknown): v is Lang => LANGS.some((l) => l.code === v);

export function storedLang(): Lang {
  try { const v = localStorage.getItem(LANG_KEY); return isLang(v) ? v : DEFAULT_LANG; } catch { return DEFAULT_LANG; }
}
export function saveLang(lang: Lang) {
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage unavailable */ }
}

export type Params = Record<string, string | number>;

/**
 * The message for `key` in `lang` (English when missing), with {placeholders} filled in.
 * Supports ICU plurals of the form {count, plural, =0{…} =1{…} other{…}} ("#" is the number).
 */
export function translate(lang: Lang, key: string, params?: Params): string {
  const raw = CATALOG[lang][key] ?? CATALOG.en[key];
  if (typeof raw !== "string") return key;
  return format(raw, params);
}

export function format(message: string, params: Params = {}): string {
  let out = "";
  for (let i = 0; i < message.length; i++) {
    if (message[i] !== "{") { out += message[i]; continue; }
    // Find the matching close brace (plural branches nest one level).
    let depth = 1, j = i + 1;
    for (; j < message.length && depth; j++) depth += message[j] === "{" ? 1 : message[j] === "}" ? -1 : 0;
    const body = message.slice(i + 1, j - 1);
    out += placeholder(body, params);
    i = j - 1;
  }
  return out;
}

function placeholder(body: string, params: Params): string {
  const [name, kind, ...rest] = body.split(",");
  const value = params[name.trim()];
  if (kind?.trim() !== "plural") return value === undefined ? `{${body}}` : String(value);
  const n = Number(value);
  const branches = new Map<string, string>();
  const re = /\s*(=\d+|zero|one|two|few|many|other)\s*\{((?:[^{}]|\{[^{}]*\})*)\}/g;
  for (const m of rest.join(",").matchAll(re)) branches.set(m[1], m[2]);
  const pick = branches.get(`=${n}`) ?? (n === 1 ? branches.get("one") : undefined) ?? branches.get("other") ?? "";
  return format(pick.replace(/#/g, String(n)), params);
}
