"""Customer app (QuikFly) launcher icon: resizes the sources in assets/icon/customer/ into the
customer flavor's Android resources (android/app/src/customer/res), which override the shared
icon in src/main (QuikFly Partner keeps that one).

Sources (Android Studio "Image Asset" layout):
  ic_launcher.png             192 px legacy icon (whole icon, for Android 7 and launchers without adaptive icons)
  ic_launcher_foreground.png  432 px adaptive foreground (108 dp canvas, mark inside the 66 dp safe zone)
  ic_launcher_monochrome.png  432 px themed-icon layer (Android 13+ "Themed icons")
The adaptive background is the navy gradient in drawable/ic_launcher_bg.xml.

Run from apps/mobile after replacing a source:  python tool/customer_icon.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "icon" / "customer"
RES = ROOT / "android" / "app" / "src" / "customer" / "res"

# Density buckets: legacy icon is 48 dp, adaptive layers are 108 dp.
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}


def save(src: Image.Image, size: int, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    src.resize((size, size), Image.LANCZOS).save(out, optimize=True)


legacy = Image.open(SRC / "ic_launcher.png").convert("RGBA")
foreground = Image.open(SRC / "ic_launcher_foreground.png").convert("RGBA")
monochrome = Image.open(SRC / "ic_launcher_monochrome.png").convert("RGBA")

for name, scale in DENSITIES.items():
    save(legacy, round(48 * scale), RES / f"mipmap-{name}" / "ic_launcher.png")
    save(foreground, round(108 * scale), RES / f"drawable-{name}" / "ic_launcher_foreground.png")
    save(monochrome, round(108 * scale), RES / f"drawable-{name}" / "ic_launcher_monochrome.png")
print(f"wrote {len(DENSITIES) * 3} PNGs under {RES}")
