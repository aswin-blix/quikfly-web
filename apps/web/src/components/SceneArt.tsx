// Illustrated destination artwork (SVG) for holiday packages — no stock photos needed.
// Replace with real destination photos from the CMS when available.
import type { TourPackage } from "@quikfly/shared";

const ART_THEMES: readonly string[] = ["beach", "hills", "heritage", "international", "weekend"];

export function SceneArt({ tour, className }: { tour: TourPackage; className?: string }) {
  const h = tour.hue;
  // Themes without their own artwork (spiritual, women, seniors) use the next theme that has one.
  const theme = tour.themes.find((t) => ART_THEMES.includes(t)) ?? tour.themes[0];
  const sky = `hsl(${h} 55% 22%)`, sky2 = `hsl(${(h + 30) % 360} 60% 10%)`;
  const id = `g-${tour.id}`;
  return (
    <svg viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice" className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky2} /><stop offset="1" stopColor={sky} />
        </linearGradient>
        <radialGradient id={`${id}-sun`}>
          <stop offset="0" stopColor="#ffe7a3" /><stop offset="0.5" stopColor="#f2c14e" stopOpacity="0.6" /><stop offset="1" stopColor="#f2c14e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="400" height="240" fill={`url(#${id}-sky)`} />
      <circle cx="300" cy="78" r="70" fill={`url(#${id}-sun)`} />
      <circle cx="300" cy="78" r="20" fill="#ffe7a3" />
      {[...Array(14)].map((_, i) => <circle key={i} cx={(i * 53) % 400} cy={(i * 37) % 90} r="0.9" fill="#fff" opacity="0.5" />)}

      {theme === "beach" && (
        <g>
          <path d="M0 165 Q100 150 200 160 T400 158 V240 H0Z" fill={`hsl(${h} 60% 28%)`} />
          <path d="M0 180 Q100 170 200 178 T400 175 V240 H0Z" fill={`hsl(${h} 55% 20%)`} opacity="0.9" />
          <path d="M0 205 Q120 190 260 200 T400 196 V240 H0Z" fill="#c8961e" opacity="0.85" />
          <g stroke="#0b0b0f" strokeWidth="4" fill="none"><path d="M70 205 Q76 160 92 130" /></g>
          <g fill="#0b0b0f">
            <path d="M92 130 q-30 -6 -44 10 q24 -4 44 -8z" /><path d="M92 130 q30 -10 46 4 q-24 -2 -46 -2z" />
            <path d="M92 130 q-14 -24 -36 -26 q20 10 34 28z" /><path d="M92 130 q10 -26 34 -30 q-20 12 -32 32z" />
          </g>
        </g>
      )}
      {(theme === "hills" || theme === "heritage") && (
        <g>
          <path d="M0 170 L70 100 L120 140 L190 80 L260 150 L320 110 L400 160 V240 H0Z" fill={`hsl(${h} 35% 24%)`} />
          <path d="M0 195 L90 140 L160 180 L240 130 L330 185 L400 160 V240 H0Z" fill={`hsl(${h} 40% 16%)`} />
          <path d="M0 215 Q100 195 200 212 T400 205 V240 H0Z" fill={`hsl(${h} 45% 10%)`} />
          {theme === "heritage" && (
            <g fill="#0b0b0f" transform="translate(150 150)">
              <rect x="0" y="20" width="100" height="40" /><path d="M20 20 Q50 -15 80 20Z" /><rect x="-6" y="0" width="12" height="60" /><rect x="94" y="0" width="12" height="60" />
              <circle cx="0" cy="-4" r="6" /><circle cx="100" cy="-4" r="6" />
            </g>
          )}
          <path d="M175 88 l15 -8 l15 10" stroke="#fff" strokeOpacity="0.5" strokeWidth="2" fill="none" />
        </g>
      )}
      {theme === "international" && (
        <g fill="#0b0b0f">
          <path d="M0 200 Q200 185 400 200 V240 H0Z" fill={`hsl(${h} 50% 14%)`} />
          {[[20, 150, 26], [52, 130, 22], [80, 160, 30], [120, 120, 18], [150, 145, 28], [240, 155, 24], [270, 135, 20], [300, 160, 34], [345, 140, 26], [372, 165, 28]].map(([x, y, w], i) => (
            <rect key={i} x={x} y={y} width={w} height={240 - y} />
          ))}
          <path d="M196 200 L200 40 L204 200Z" /><rect x="190" y="110" width="20" height="90" />
          {[...Array(30)].map((_, i) => <rect key={i} x={20 + ((i * 47) % 360)} y={150 + ((i * 13) % 50)} width="3" height="4" fill="#f2c14e" opacity="0.7" />)}
        </g>
      )}
      {theme === "weekend" && (
        <g>
          <path d="M0 175 Q200 160 400 172 V240 H0Z" fill={`hsl(${h} 55% 24%)`} />
          <path d="M0 200 Q200 190 400 198 V240 H0Z" fill="#c8961e" opacity="0.7" />
          <path d="M40 240 L190 150 L210 150 L360 240Z" fill="#111116" />
          <path d="M200 160 V240" stroke="#f2c14e" strokeWidth="2" strokeDasharray="8 8" />
        </g>
      )}
      {/* plane */}
      <g transform="translate(60 52) rotate(-12)" fill="#fff" opacity="0.9">
        <path d="M0 6 L34 4 L44 0 L46 3 L38 7 L46 12 L44 14 L34 9 L0 8Z" />
      </g>
      <path d="M10 70 Q 40 60 58 58" stroke="#fff" strokeOpacity="0.35" strokeDasharray="3 4" fill="none" />
    </svg>
  );
}
