"""Rebuild every EtabsX brand asset from assets/etabsx-source.png.

    python scripts/build-etabsx-brand.py

Writes into the WEBSITE repo:

    assets/etabsx-logo.png      the mark alone, transparent, 512 tall
    assets/etabsx-lockup.png    mark + wordmark + tagline, transparent
    assets/etabsx-mark-sm.png   the mark at 128, for inline use

and into the APP repo (C:\\ETABSX), because the two must not drift:

    etabsx.png                  256x256, the taskbar / iconphoto image
    etabsx.ico                  multi-resolution Windows icon, 16..256

WHY THIS EXISTS
---------------
The app icon was previously produced by make_icon.py and make_logo.py, which
DREW a logo in code - a slate badge with a cyan neon frame and an amber
foundation. It was never the real logo, and nothing connected it to the
artwork the brand actually uses, so the two could not be compared and drifted
completely apart. One script reading one source file cannot drift.

The source is a rendered metallic logo on near-black, not flat artwork:

    gold    the tower mass and the X's left blade
    steel   the stepped bars, the frame grid, and ETABS in the wordmark
    black   the field, luminance ~3

Masking is therefore a straight luminance ramp - unlike the TwinAnalytic
builder, which has to separate its mark from a photographed wall at
luminance 33. The colour is carried through rather than re-flattened, so the
brushed-metal gradients survive; a flat two-tone redraw would be crisper at
16px and would stop matching the website, which is the whole point.
"""
import os
import sys
from pathlib import Path

import numpy as np
import scipy.ndimage as nd
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'etabsx-source.png'
APP = Path(r'C:\ETABSX')

# Measured off the source, not guessed. See the module docstring.
#   MARK   the building + X device
#   FULL   mark, wordmark and tagline together
MARK = (249, 211, 1033, 736)
FULL = (135, 209, 1136, 1034)

# Measured off the source rather than guessed:
#
#   pure field          4 - 9
#   the render's glow  ~17 median, diffuse, strongest around the gold
#   real metal         55 - 230
#
# So the ramp starts well above the glow. A ramp from 8 - the obvious
# choice, since the field is at 4 - left the glow sitting at 17% alpha,
# which reads as a grey smudge the moment the logo is placed on anything
# lighter than the black it was rendered on.
# LUM_HI is 50, not 80. The gold's shadowed faces sit around 52, so a ramp
# topping out at 80 left them at 44% alpha - not holes, but washed-out
# patches that only appear once the logo is on a light background. The gate
# below is what makes a ramp this tight safe: distant glow is already
# excluded by distance, so brightness only has to separate shaded metal
# from the field immediately around it.
LUM_LO, LUM_HI = 22.0, 50.0
CORE_LUM = 60.0        # confidently metal
GATE_PX = 4            # how far the ramp may reach beyond the core
FLOOR = 0.04
SS = 3                 # supersample while masking

# The sidebar mark's drawn size. 36 is what subsample(7) of the 256px icon
# happened to produce, so matching it keeps the sidebar layout identical.
SIDE_PX = 36


def cut(box):
    """Lift a region off the black field, keeping its original colour."""
    src = Image.open(SRC).convert('RGB')
    crop = src.crop(box)
    big = crop.resize((crop.width * SS, crop.height * SS), Image.LANCZOS)
    rgb = np.asarray(big).astype(np.float32)
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722], np.float32)

    # Gate the ramp to a few pixels around confidently-metal pixels. The
    # glow is diffuse and reaches far from the mark, so distance is what
    # separates it from a genuinely dark METAL face - which is equally dim
    # but always sits right beside something bright. Thresholding on
    # brightness alone cannot tell those two apart, and picking a threshold
    # high enough to kill the glow punched holes in the shadowed side of
    # the gold instead.
    #
    # Holes are deliberately NOT filled. The frame's grid openings are real
    # openings that show the background through them; binary_fill_holes
    # would make the mark a solid slab and lose the structure it is of.
    core = (lum > CORE_LUM)
    gate = nd.binary_dilation(core, np.ones((GATE_PX * SS, GATE_PX * SS)))

    ramp = np.clip((lum - LUM_LO) / (LUM_HI - LUM_LO), 0, 1)
    alpha = ramp * gate
    alpha = np.clip((alpha - FLOOR) / (1.0 - FLOOR), 0, 1)
    alpha[alpha < 0.04] = 0.0

    out = Image.fromarray(np.dstack(
        [rgb.astype(np.uint8), (alpha * 255).astype(np.uint8)]), 'RGBA')
    bb = out.split()[-1].point(lambda v: 255 if v > 8 else 0).getbbox()
    out = out.crop(bb)
    return out.resize((max(1, out.width // SS), max(1, out.height // SS)),
                      Image.LANCZOS)


def fit(img, height):
    return img.resize(
        (max(1, round(img.width * height / img.height)), height),
        Image.LANCZOS)


def square(img, size, inset=0.88):
    """Centre `img` on a transparent square canvas.

    The mark is landscape (roughly 3:2), so an icon made by scaling it to a
    square would either distort it or crop the X. It is fitted by its LONG
    edge and centred, which leaves the tower vertically centred rather than
    sitting on the canvas floor.
    """
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    w = int(size * inset)
    h = max(1, round(img.height * w / img.width))
    if h > size * inset:                       # portrait-ish: fit by height
        h = int(size * inset)
        w = max(1, round(img.width * h / img.height))
    canvas.paste(img.resize((w, h), Image.LANCZOS),
                 ((size - w) // 2, (size - h) // 2))
    return canvas


def web(img, height, colors=256):
    """Resize for the site and quantise to a palette.

    The lockup is the hero image on the product page, so its weight is that
    page's weight. Measured on this artwork: full RGBA 295 KB, 256 colours
    158 KB for a mean channel error of 3.8/255 - below what anyone can see
    on a brushed-metal gradient, for a 46% saving. 64 colours halves it
    again but banded the gold visibly (mean 12.4), so it is not used.

    The APP assets are deliberately NOT put through this. They are already
    small, and the icon is rendered at 16px where a palette buys nothing.
    """
    return fit(img, height).quantize(
        colors=colors, method=Image.FASTOCTREE).convert('RGBA')


def write(path, img, **kw):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, **kw)
    print('   %-44s %5d x %-5d %6.1f KB'
          % (path.name, img.width, img.height,
             os.path.getsize(path) / 1024))


def main():
    if not SRC.exists():
        print('FAILED: no %s' % SRC)
        return 1
    print('EtabsX brand assets, from %s' % SRC.name)

    mark = cut(MARK)
    lock = cut(FULL)

    print('\n website (%s)' % ROOT)
    write(ROOT / 'assets' / 'etabsx-logo.png', web(mark, 512), optimize=True)
    write(ROOT / 'assets' / 'etabsx-lockup.png', web(lock, 560), optimize=True)
    write(ROOT / 'assets' / 'etabsx-mark-sm.png', web(mark, 128), optimize=True)

    if not APP.exists():
        print('\n NOTE: %s not found - app icons not written' % APP)
        return 0

    print('\n app (%s)' % APP)
    write(APP / 'etabsx.png', square(mark, 256), optimize=True)

    # The sidebar mark, pre-rendered at the size it is actually drawn.
    #
    # The app has no Pillow at runtime - rule 1 of that project is the
    # standard library only - so it was reaching for etabsx.png and calling
    # PhotoImage.subsample(7). subsample is nearest-neighbour DECIMATION: it
    # throws away six pixels in seven, which on a mark made of one-pixel
    # frame lines and brushed-metal gradients drops half the linework and
    # aliases what is left. Resampling properly here costs 3 KB in the
    # bundle and is the difference between a logo and a smear.
    write(APP / 'etabsx-side.png', square(mark, SIDE_PX), optimize=True)

    # Windows picks the nearest size rather than scaling, so every size the
    # shell asks for is rendered from the full-resolution mark instead of
    # being downsampled from one 256px image. 16 and 20 are the taskbar and
    # the title bar - the two a customer actually looks at.
    sizes = (16, 20, 24, 32, 40, 48, 64, 128, 256)
    icons = [square(mark, s) for s in sizes]
    ico = APP / 'etabsx.ico'
    icons[-1].save(ico, format='ICO',
                   sizes=[(s, s) for s in sizes],
                   append_images=icons[:-1])
    print('   %-44s %s  %6.1f KB'
          % (ico.name, 'x'.join(str(s) for s in sizes),
             os.path.getsize(ico) / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
