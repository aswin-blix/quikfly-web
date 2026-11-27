// Copies the master logo (brand/quikfly-logo.svg) to every app that shows it:
//   website  apps/web/public/assets/logo.svg     (SVG: browsers draw its glow filters)
//   admin    apps/admin/public/assets/logo.svg
//   apps     apps/mobile/assets/images/logo.png  (transparent PNG rendered by headless Chrome;
//            Flutter's SVG support drops blur filters, so the apps use a sharp raster of it)
//   browser notifications  apps/{web,admin}/public/assets/notify-icon.png (square, transparent:
//            browsers don't take SVG notification icons; the logo sits centred, never on a badge)
// Run from the repo root after replacing the master:  node scripts/logo.mjs
// then  node scripts/app-icons.mjs  (the launcher icons use the logo's Q).
// Chrome or Edge must be installed; set CHROME=/path/to/chrome if it isn't found.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { done, fileUrl, render } from "./lib/chrome.mjs";

const MASTER = resolve("brand/quikfly-logo.svg");
const COPIES = ["apps/web/public/assets/logo.svg", "apps/admin/public/assets/logo.svg"];
const APP_PNG = resolve("apps/mobile/assets/images/logo.png");
const APP_PNG_WIDTH = 1240; // 72 px tall at 3× (largest use: the login screen) needs ~216 px of height

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

const logo = (w) => `<img src="${fileUrl(MASTER)}" style="display:block;width:${w}px;height:${Math.round((w * vh) / vw)}px">`;

render(APP_PNG, APP_PNG_WIDTH, height, logo(APP_PNG_WIDTH));
console.log(`rendered → ${APP_PNG} (${APP_PNG_WIDTH}×${height}, transparent)`);

// Browser notification icon: square, the logo centred with a little room at the sides.
const NOTIFY_SIZE = 192;
const NOTIFY_LOGO_WIDTH = 180;
for (const out of ["apps/web/public/assets/notify-icon.png", "apps/admin/public/assets/notify-icon.png"].map((p) => resolve(p))) {
  render(out, NOTIFY_SIZE, NOTIFY_SIZE, `<div style="width:${NOTIFY_SIZE}px;height:${NOTIFY_SIZE}px;display:grid;place-items:center">${logo(NOTIFY_LOGO_WIDTH)}</div>`);
  console.log(`rendered → ${out} (${NOTIFY_SIZE}×${NOTIFY_SIZE}, transparent)`);
}
done();
