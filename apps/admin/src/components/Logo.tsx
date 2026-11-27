// The QuikFly logo (brand/quikfly-logo.svg, copied to public/assets by scripts/logo.mjs). It was drawn on black,
// so it sits on a dark plate in light mode and bare in dark mode (tokens --logo-plate*, class .logo-plate).
// Size it with `imgClassName` (a height, e.g. "h-10"); place the plate with `className` (margins).
import { cx } from "@/lib/format";

/** Width and height of the SVG's viewBox, so the browser reserves the right space before it loads. */
const LOGO_SIZE = { width: 1504, height: 458 };

export function Logo({ className, imgClassName, alt = "QuikFly" }: { className?: string; imgClassName?: string; alt?: string }) {
  return (
    <span className={cx("logo-plate", className)}>
      <img src="/assets/logo.svg" alt={alt} {...LOGO_SIZE} className={cx("block", imgClassName ?? "h-10 w-auto")} />
    </span>
  );
}
