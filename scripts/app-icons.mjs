// Builds the three apps' launcher icons from the Q of the master logo (brand/quikfly-logo.svg):
//   QuikFly          the gold Q on the navy background (apps/mobile/assets/icon/background.png)
//   QuikFly Partner  the gold Q with a blue tick on the brand's near-black (PARTNER_BG), so the two are easy
//                    to tell apart; the logo was drawn on black, so its gold and glow read best there
//   QuikFly Captain  the gold Q with a green navigation arrow on a deep green (CAPTAIN_BG): the drivers' app
// Writes every Android density for both flavors (legacy, round and the adaptive background, foreground
// and monochrome layers), the old shared icon in src/main, and the 1024 px squares in assets/icon/ that
// `swift tool/ios_icons.swift` (run in apps/mobile, on a Mac) turns into the iPhone icons.
// Run from the repo root:  node scripts/app-icons.mjs   (needs Chrome or Edge; see lib/chrome.mjs)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { done, fileUrl, render, work } from "./lib/chrome.mjs";

const MASTER = resolve("brand/quikfly-logo.svg");
const MOBILE = resolve("apps/mobile");
const NAVY_BACKGROUND = join(MOBILE, "assets/icon/background.png");
for (const f of [MASTER, NAVY_BACKGROUND]) if (!existsSync(f)) throw new Error(`Missing ${f}`);

// ---- The Q inside the master, in the SVG's own units. Re-measure these if the logo is redrawn. ----
const VIEWBOX = { x: 60, y: 34, w: 1504 }; // the master's viewBox origin and width
const Q = { cx: 369, cy: 219, w: 398 }; // centre and width of the Q with its wing
// Outline that keeps the Q and leaves out the "u" beside it and the swoosh under it.
const Q_OUTLINE = [
  [160, 40], [600, 40], [600, 150], [572, 150], [568, 178], [548, 215], [540, 240], [536, 300], [502, 360], [498, 377],
  [470, 380], [400, 376], [330, 370], [270, 364], [235, 360], [212, 350], [190, 328], [165, 290], [160, 250],
];

// ---- Icon geometry, as fractions of an adaptive layer (108 dp; launchers show about the middle 72). ----
const LAYER_DP = 108;
const LEGACY_DP = 48;
const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
const VISIBLE = 72 / 108; // the part of a layer a launcher shows
const IOS_VISIBLE = 1 / 1.3; // iOS has square-ish corners, so its icon shows a little more of the layer
const SOURCE = 1024; // every design is drawn once at this size, then scaled down

const BLUE = ["#4f7df0", "#1f3d9e"]; // the Partner tick
const GREEN = ["#34c77b", "#137a45"]; // the Captain arrow
const TICK_RIM = "#ffffff"; // a thin rim keeps the blue tick clear of the dark background
// The Partner background: near-black with a soft lift in the middle (dark tokens --surface → --bg).
const PARTNER_BG = "radial-gradient(circle at 50% 42%,#26262f 0%,#111116 50%,#07070a 100%)";
// The Captain background: the same near-black lifted with a deep green, so it sits apart from the other two.
const CAPTAIN_BG = "radial-gradient(circle at 50% 42%,#123d2a 0%,#0a1f16 55%,#07070a 100%)";
const APPS = {
  customer: {
    mark: { cx: 0.5, cy: 0.5, w: 0.47 },
    glow: "drop-shadow(0 0 0.012em rgba(255,176,40,.55)) drop-shadow(0 0.012em 0.02em rgba(0,0,0,.45))",
    background: (s) => `<img src="${fileUrl(NAVY_BACKGROUND)}" style="position:absolute;left:0;top:0;width:${s}px;height:${s}px">`,
  },
  partner: {
    mark: { cx: 0.475, cy: 0.465, w: 0.43 },
    tick: { cx: 0.652, cy: 0.648, r: 0.088 },
    badge: { colours: BLUE, glyph: "tick" },
    glow: "drop-shadow(0 0 0.012em rgba(255,176,40,.55)) drop-shadow(0 0.012em 0.02em rgba(0,0,0,.45))",
    background: (s) => `<div style="position:absolute;left:0;top:0;width:${s}px;height:${s}px;background:${PARTNER_BG}"></div>`,
  },
  captain: {
    mark: { cx: 0.475, cy: 0.465, w: 0.43 },
    tick: { cx: 0.652, cy: 0.648, r: 0.088 },
    badge: { colours: GREEN, glyph: "arrow" },
    glow: "drop-shadow(0 0 0.012em rgba(255,176,40,.55)) drop-shadow(0 0.012em 0.02em rgba(0,0,0,.45))",
    background: (s) => `<div style="position:absolute;left:0;top:0;width:${s}px;height:${s}px;background:${CAPTAIN_BG}"></div>`,
  },
};

/** The Q, cut out of the master and placed on a layer `s` px wide. */
function mark(s, { cx, cy, w }, glow, tick) {
  const k = (s * w) / Q.w; // px per SVG unit
  const outline = Q_OUTLINE.map(([x, y]) => `${((x - VIEWBOX.x) * k).toFixed(1)}px ${((y - VIEWBOX.y) * k).toFixed(1)}px`).join(",");
  const left = s * cx - (Q.cx - VIEWBOX.x) * k;
  const top = s * cy - (Q.cy - VIEWBOX.y) * k;
  // The tick sits on the Q's tail: clear a little room around it.
  const room = tick ? `-webkit-mask-image:radial-gradient(circle at ${s * tick.cx}px ${s * tick.cy}px,transparent ${s * tick.r * 1.16}px,#000 ${s * tick.r * 1.16 + 1}px);` : "";
  return `<div style="position:absolute;left:0;top:0;width:${s}px;height:${s}px;font-size:${s}px;${room}filter:${glow}">
    <img src="${fileUrl(MASTER)}" style="position:absolute;left:${left}px;top:${top}px;width:${VIEWBOX.w * k}px;clip-path:polygon(${outline})"></div>`;
}

/** The badge on the Q's tail: a coloured disc with a white glyph (or, for the one-colour layer, a ring and the glyph). */
function tickBadge(s, { cx, cy, r }, oneColour, badge = { colours: BLUE, glyph: "tick" }) {
  const R = s * r;
  const colours = badge.colours;
  const disc = oneColour
    ? `<circle r="${R * 0.9}" fill="none" stroke="#fff" stroke-width="${R * 0.2}"/>`
    : `<circle r="${R}" fill="url(#b)" stroke="${TICK_RIM}" stroke-width="${R * 0.09}"/>`;
  return `<svg width="${s}" height="${s}" style="position:absolute;left:0;top:0${oneColour ? "" : ";filter:drop-shadow(0 0.01em 0.012em rgba(0,0,0,.35));font-size:" + s + "px"}">
    <defs><linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${colours[0]}"/><stop offset="1" stop-color="${colours[1]}"/></linearGradient></defs>
    <g transform="translate(${s * cx} ${s * cy})">${disc}
    ${badge.glyph === "arrow"
      // A navigation arrowhead, pointing up and to the right (on the road).
      ? `<path transform="rotate(45)" d="M0 ${-R * 0.52} L${R * 0.4} ${R * 0.44} L0 ${R * 0.2} L${-R * 0.4} ${R * 0.44} Z" fill="#fff" stroke="#fff" stroke-width="${R * 0.06}" stroke-linejoin="round"/>`
      : `<path d="M${-R * 0.45} ${R * 0.02} L${-R * 0.12} ${R * 0.36} L${R * 0.48} ${-R * 0.32}" fill="none" stroke="#fff" stroke-width="${R * 0.24}" stroke-linecap="round" stroke-linejoin="round"/>`}</g></svg>`;
}

// Turns the solid gold into flat white and drops the dark outlines and the soft glow (alpha = 8 × brightness
// + 8 × opacity − 10): the themed (one-colour) icon of Android 13+.
const ONE_COLOUR = `<svg width="0" height="0" style="position:absolute"><filter id="one" color-interpolation-filters="sRGB">
  <feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.7 5.72 0.58 8 -10"/></filter></svg>`;

const layers = (app) => {
  const { mark: m, glow, tick, badge, background } = APPS[app];
  return {
    background: (s) => background(s),
    foreground: (s) => mark(s, m, glow, tick) + (tick ? tickBadge(s, tick, false, badge) : ""),
    monochrome: (s) => `${ONE_COLOUR}<div style="position:absolute;left:0;top:0;width:${s}px;height:${s}px;filter:url(#one)">${mark(s, m, "none", tick)}</div>${tick ? tickBadge(s, tick, true, badge) : ""}`,
  };
};

/** Background and foreground as a launcher shows them: a `size` px window onto the middle of the layers. */
function composed(app, size, visible) {
  const l = layers(app);
  const s = size / visible;
  const off = -(s - size) / 2;
  return `<div style="position:absolute;left:${off}px;top:${off}px;width:${s}px;height:${s}px">${l.background(s)}${l.foreground(s)}</div>`;
}
const box = (size, inner, style = "") => `<div style="position:relative;width:${size}px;height:${size}px;overflow:hidden;${style}">${inner}</div>`;

/** Draws one design at SOURCE size, then writes each `[path, px]` as a scaled copy of it. */
function design(name, body, outputs) {
  const source = join(work, `${name}.png`);
  render(source, SOURCE, SOURCE, body);
  for (const [out, px] of outputs) {
    render(out, px, px, `<img src="${fileUrl(source)}" style="display:block;width:${px}px;height:${px}px">`);
  }
  console.log(`${name} → ${outputs.length} file(s)`);
}

const res = (flavor, folder, density, file) => join(MOBILE, "android/app/src", flavor, "res", `${folder}-${density}`, file);
const perDensity = (dp, path) => Object.entries(DENSITIES).map(([d, scale]) => [path(d), Math.round(dp * scale)]);

const ADAPTIVE_XML = `<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
`;

for (const app of Object.keys(APPS)) {
  const l = layers(app);
  for (const layer of ["background", "foreground", "monochrome"]) {
    design(`${app}-${layer}`, box(SOURCE, l[layer](SOURCE)), perDensity(LAYER_DP, (d) => res(app, "mipmap", d, `ic_launcher_${layer}.png`)));
  }
  // Legacy icons (Android 7 and older): a rounded square and a circle with a little room around them.
  const legacy = (inset, radius) => box(SOURCE, box(SOURCE * (1 - 2 * inset), composed(app, SOURCE * (1 - 2 * inset), VISIBLE), `position:absolute;left:${SOURCE * inset}px;top:${SOURCE * inset}px;border-radius:${radius}`));
  design(`${app}-legacy`, legacy(0.06, "22%"), perDensity(LEGACY_DP, (d) => res(app, "mipmap", d, "ic_launcher.png")));
  design(`${app}-round`, legacy(0.03, "50%"), perDensity(LEGACY_DP, (d) => res(app, "mipmap", d, "ic_launcher_round.png")));
  mkdirSync(join(MOBILE, "android/app/src", app, "res/mipmap-anydpi-v26"), { recursive: true });
  for (const xml of ["ic_launcher.xml", "ic_launcher_round.xml"]) writeFileSync(join(MOBILE, "android/app/src", app, "res/mipmap-anydpi-v26", xml), ADAPTIVE_XML);
}

// The full square icons: the iPhone icon sources (tool/ios_icons.swift removes their alpha channel).
design("customer-square", box(SOURCE, composed("customer", SOURCE, IOS_VISIBLE)), [[join(MOBILE, "assets/icon/icon.png"), SOURCE]]);
design("partner-square", box(SOURCE, composed("partner", SOURCE, IOS_VISIBLE)), [[join(MOBILE, "assets/icon/icon-partner.png"), SOURCE]]);
design("captain-square", box(SOURCE, composed("captain", SOURCE, IOS_VISIBLE)), [[join(MOBILE, "assets/icon/icon-captain.png"), SOURCE]]);

// src/main: the shared icon no flavor shows any more (see apps/mobile/README.md); kept current all the same.
// Its adaptive icon insets the foreground by 16% over the brand's dark colour, so this foreground is the bare Q, larger.
const mainForeground = box(SOURCE, mark(SOURCE, { cx: 0.5, cy: 0.5, w: 0.66 }, APPS.customer.glow));
design("main-foreground", mainForeground, [
  [join(MOBILE, "assets/icon/icon-foreground.png"), SOURCE],
  ...perDensity(LAYER_DP, (d) => res("main", "drawable", d, "ic_launcher_foreground.png")),
]);
design("main-legacy", box(SOURCE, composed("customer", SOURCE, VISIBLE)), perDensity(LEGACY_DP, (d) => res("main", "mipmap", d, "ic_launcher.png")));

done();
