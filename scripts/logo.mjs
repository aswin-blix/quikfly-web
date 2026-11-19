// Copies the master logo (brand/quikfly-logo.svg) to every app that shows it:
//   website  apps/web/public/assets/logo.svg     (SVG: browsers draw its glow filters)
//   admin    apps/admin/public/assets/logo.svg
//   apps     apps/mobile/assets/images/logo.png  (transparent PNG rendered by headless Chrome;
//            Flutter's SVG support drops blur filters, so the apps use a sharp raster of it)
// Run from the repo root after replacing the master:  node scripts/logo.mjs
// Chrome or Edge must be installed; set CHROME=/path/to/chrome if it isn't found.
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MASTER = resolve("brand/quikfly-logo.svg");
const COPIES = ["apps/web/public/assets/logo.svg", "apps/admin/public/assets/logo.svg"];
const APP_PNG = resolve("apps/mobile/assets/images/logo.png");
const APP_PNG_WIDTH = 1240; // 72 px tall at 3× (largest use: the login screen) needs ~298 px of height

if (!existsSync(MASTER)) throw new Error(`Missing ${MASTER}`);
for (const c of COPIES) {
  mkdirSync(dirname(c), { recursive: true });
  copyFileSync(MASTER, c);
  console.log(`copied → ${c}`);
}

// Size the PNG from the SVG's own viewBox so the aspect ratio always matches.
const svg = readFileSync(MASTER, "utf8");
const [, , vw, vh] = svg.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const height = Math.round((APP_PNG_WIDTH * vh) / vw);

const chrome = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Chrome/Edge not found; set CHROME=/path/to/chrome");

const work = mkdtempSync(join(tmpdir(), "qf-logo-"));
const page = join(work, "logo.html");
writeFileSync(page, `<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent">
<img src="${pathToFileURL(MASTER).href}" style="display:block;width:${APP_PNG_WIDTH}px;height:${height}px"></body></html>`);
execFileSync(chrome, [
  "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
  `--window-size=${APP_PNG_WIDTH},${height}`, `--screenshot=${APP_PNG}`, pathToFileURL(page).href,
], { stdio: "ignore" });
rmSync(work, { recursive: true, force: true });
console.log(`rendered → ${APP_PNG} (${APP_PNG_WIDTH}×${height}, transparent)`);
