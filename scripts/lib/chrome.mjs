// Headless Chrome as an image renderer, shared by logo.mjs and app-icons.mjs.
// Chrome or Edge must be installed; set CHROME=/path/to/chrome if it isn't found.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const chrome = [
  process.env.CHROME,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!chrome) throw new Error("Chrome/Edge not found; set CHROME=/path/to/chrome");

/** A scratch folder for intermediate files; call `done()` when finished. */
export const work = mkdtempSync(join(tmpdir(), "qf-logo-"));
export const done = () => rmSync(work, { recursive: true, force: true });

/** Renders `body` (HTML on a transparent page) to a `width`×`height` PNG at `out`. */
export function render(out, width, height, body) {
  const page = join(work, "page.html");
  writeFileSync(page, `<!doctype html><html style="background:transparent"><body style="margin:0;background:transparent;overflow:hidden">${body}</body></html>`);
  mkdirSync(dirname(out), { recursive: true });
  execFileSync(chrome, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--default-background-color=00000000",
    `--window-size=${width},${height}`, `--screenshot=${out}`, pathToFileURL(page).href,
  ], { stdio: "ignore" });
}

export const fileUrl = (path) => pathToFileURL(path).href;
