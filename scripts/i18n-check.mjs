// Checks the UI strings (packages/shared/i18n/app_<lang>.arb), run by `npm run typecheck`:
//   every language has exactly the English keys, no empty messages, the same {placeholders};
//   every t("key") in the website exists. (Flutter checks its own keys when it compiles.)
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const DIR = "packages/shared/i18n";
const load = (lang) => JSON.parse(readFileSync(join(DIR, `app_${lang}.arb`), "utf8"));
const messages = (arb) => Object.fromEntries(Object.entries(arb).filter(([k]) => !k.startsWith("@")));
const placeholders = (m) => [...m.matchAll(/\{(\w+)/g)].map((x) => x[1]).sort().join(",");

const en = messages(load("en"));
const langs = readdirSync(DIR).map((f) => f.match(/^app_(\w+)\.arb$/)?.[1]).filter((l) => l && l !== "en");
const errors = [];

for (const lang of langs) {
  const other = messages(load(lang));
  for (const k of Object.keys(en)) {
    if (!(k in other)) errors.push(`${lang}: missing "${k}"`);
    else if (!String(other[k]).trim()) errors.push(`${lang}: "${k}" is empty`);
    else if (placeholders(other[k]) !== placeholders(en[k])) errors.push(`${lang}: "${k}" has placeholders {${placeholders(other[k])}}, English has {${placeholders(en[k])}}`);
  }
  for (const k of Object.keys(other)) if (!(k in en)) errors.push(`${lang}: "${k}" is not in English (app_en.arb is the template)`);
}

function* files(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.tsx?$/.test(f)) yield p;
  }
}
for (const file of files("apps/web/src")) {
  const src = readFileSync(file, "utf8");
  for (const m of src.matchAll(/\bt\(\s*["'`]([A-Za-z0-9_]+)["'`]/g)) if (!(m[1] in en)) errors.push(`${file}: t("${m[1]}") is not in app_en.arb`);
}

if (errors.length) {
  console.error(errors.join("\n"));
  console.error(`\n${errors.length} i18n problem(s)`);
  process.exit(1);
}
console.log(`i18n: ${Object.keys(en).length} strings × ${langs.length + 1} languages OK`);
