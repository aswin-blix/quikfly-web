// Phone-width (390 px) screenshots in light and dark, through Chrome's DevTools protocol (no packages needed).
//   node scripts/phone-shot.mjs <url> "<text of an h2 to scroll to>" <out-prefix>   → <out-prefix>-light.png, -dark.png
// Why: headless Chrome's --window-size can't go below ~500 px on macOS, so a plain --screenshot at 390 is cropped,
// not a phone layout. This sets a real 390×844 mobile viewport and prints scrollWidth (390 = no sideways scroll).
// Pass "" as the heading to keep the top of the page. Needs Google Chrome in /Applications (macOS).
import { spawn } from "node:child_process";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, heading, out] = process.argv.slice(2);
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const port = 9333;
const proc = spawn(chrome, ["--headless=new", "--disable-gpu", `--remote-debugging-port=${port}`,
  `--user-data-dir=${mkdtempSync(join(tmpdir(), "cdp-"))}`, "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 50 && !target; i++) {
  await sleep(200);
  try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r));
let id = 0; const pending = new Map();
ws.addEventListener("message", (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((r) => { const n = ++id; pending.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); });

await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
for (const scheme of ["light", "dark"]) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await send("Page.navigate", { url });
  await sleep(6000);
  const r = await send("Runtime.evaluate", { returnByValue: true, expression: `(() => {
    const want = ${JSON.stringify(heading || "")};
    const h = want && [...document.querySelectorAll('h2')].find(e => e.textContent.includes(want));
    if (want && !h) return 'heading not found';
    if (h) window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 70);
    return 'scrollWidth=' + document.documentElement.scrollWidth + ' innerWidth=' + innerWidth;
  })()` });
  await sleep(1500);
  console.log(scheme, r.result.value);
  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${out}-${scheme}.png`, Buffer.from(shot.data, "base64"));
}
ws.close(); proc.kill();
