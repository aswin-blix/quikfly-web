"""Render the owner's Partner launcher icon (xxxhdpi-size PNGs) into every Android density.

Usage: python -I partner_icon.py <source dir> <flavor res dir>
Legacy icons (ic_launcher, ic_launcher_round) are 48 dp; adaptive layers are 108 dp.
"""
import sys
from pathlib import Path

from PIL import Image

src = Path(sys.argv[1])
res = Path(sys.argv[2])
DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
FILES = {
    "ic_launcher.png": 48,
    "ic_launcher_round.png": 48,
    "ic_launcher_background.png": 108,
    "ic_launcher_foreground.png": 108,
    "ic_launcher_monochrome.png": 108,
}

for name, dp in FILES.items():
    img = Image.open(src / name)
    for density, scale in DENSITIES.items():
        px = round(dp * scale)
        out_dir = res / f"mipmap-{density}"
        out_dir.mkdir(parents=True, exist_ok=True)
        out = img if img.size == (px, px) else img.resize((px, px), Image.LANCZOS)
        out.save(out_dir / name, optimize=True)
        print(f"{density:8} {name:28} {px}x{px}")

adaptive = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome" />
</adaptive-icon>
"""
v26 = res / "mipmap-anydpi-v26"
v26.mkdir(parents=True, exist_ok=True)
for xml in ("ic_launcher.xml", "ic_launcher_round.xml"):
    (v26 / xml).write_text(adaptive, encoding="utf-8")
    print(f"anydpi-v26 {xml}")
