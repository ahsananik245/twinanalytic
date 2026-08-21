#!/usr/bin/env python3
"""Build the site's concrete background texture from a source photograph.

    python scripts/build-texture.py <source-image> [-o assets/texture-concrete.jpg]

The output is a background, not a picture, and the difference is most of what
this script does. Three things have to be true or it cannot be used site-wide:

  1. No large-scale structure. A vignette or soft blotch that looks like
     lighting in a photograph reads as a rendering artefact once it is
     stretched behind a whole page, so the low frequencies are subtracted and
     only grain and cracks survive.

  2. No colour shift. The mean is pinned to BASE (the site's --bg-primary), so
     the texture adds depth without lifting or tinting the page. <html> carries
     the same colour, which is why a failed image load is invisible rather than
     a flash of white.

  3. No contrast regression. Darkening the background can only help text
     contrast, so shadows pass through linearly; highlights are the only side
     that can break WCAG AA, so they are soft-capped with tanh. Fine grain is
     nearly untouched, bright specks saturate instead of spiking.

The AA check at the end runs against the *decoded JPEG*, not the array in
memory: lossy compression can push a pixel brighter than anything the maths
produced, and that pixel is what visitors actually see. The script refuses to
write a file that fails.
"""

import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

BASE = np.array([0x13, 0x13, 0x13], dtype=float)   # css --bg-primary

# Sampled from :root in css/style.css. Every one of these can land on the
# background, so every one has to clear AA against its brightest pixel.
PALETTE = {
    "--text-primary":   "#F5F5F5",
    "--text-secondary": "#B8B8B8",
    "--color-steel":    "#B7B6B6",
    "--color-gold":     "#C9A84C",
}

WIDTH = 1280        # upscaled by `cover`; grain hides the interpolation
BLUR_RADIUS = 44    # low frequencies removed at this scale
DETAIL_GAIN = 0.95
HIGHLIGHT_CAP = 32.0
JPEG_QUALITY = 48
MIN_CONTRAST = 4.5  # WCAG 2.1 AA, normal text


def _linearize(channel):
    c = channel / 255.0
    return np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def relative_luminance(px):
    return (0.2126 * _linearize(px[..., 0])
            + 0.7152 * _linearize(px[..., 1])
            + 0.0722 * _linearize(px[..., 2]))


def contrast(fg_luminance, bg_luminance):
    hi, lo = max(fg_luminance, bg_luminance), min(fg_luminance, bg_luminance)
    return (hi + 0.05) / (lo + 0.05)


def build(source, dest):
    src = Image.open(source).convert("RGB")
    src.thumbnail((WIDTH, WIDTH), Image.LANCZOS)   # resample before processing,
                                                   # so grain is measured at the
                                                   # size it will ship at

    detail = (np.asarray(src, dtype=float)
              - np.asarray(src.filter(ImageFilter.GaussianBlur(BLUR_RADIUS)), dtype=float) * 0.92)
    detail -= detail.mean()
    detail *= DETAIL_GAIN
    detail = np.where(detail > 0, HIGHLIGHT_CAP * np.tanh(detail / HIGHLIGHT_CAP), detail)

    out = np.clip(BASE + detail, 0, 255).astype("uint8")
    Image.fromarray(out).save(dest, "JPEG", quality=JPEG_QUALITY,
                              optimize=True, progressive=True)

    decoded = np.asarray(Image.open(dest).convert("RGB"), dtype=float)
    worst = relative_luminance(decoded).max()

    print(f"{dest}  {src.size[0]}x{src.size[1]}  "
          f"{os.path.getsize(dest) / 1024:.1f} KB")
    print(f"  range #{int(decoded.min()):02x}..#{int(decoded.max()):02x}  "
          f"mean {decoded.mean():.1f}  sd {decoded.std():.2f}\n")

    failures = []
    for name, hexc in PALETTE.items():
        fg = np.array([int(hexc[i:i + 2], 16) for i in (1, 3, 5)], dtype=float)
        ratio = contrast(relative_luminance(fg), worst)
        ok = ratio >= MIN_CONTRAST
        failures += [] if ok else [name]
        print(f"  {name:18s} {hexc}  {ratio:5.2f}:1  {'PASS' if ok else 'FAIL'}")

    if failures:
        os.remove(dest)
        print(f"\nFAILED AA for {', '.join(failures)} — output removed.")
        print("Lower HIGHLIGHT_CAP or DETAIL_GAIN and rerun.")
        return 1

    print("\nAll palette colours clear WCAG AA against the brightest pixel.")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("source", help="source photograph")
    ap.add_argument("-o", "--out", default="assets/texture-concrete.jpg")
    args = ap.parse_args()
    sys.exit(build(args.source, args.out))
