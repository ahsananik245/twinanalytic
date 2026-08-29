#!/usr/bin/env python3
"""
Rebuild every TwinAnalytic brand asset from one master file.

    python scripts/build-brand-assets.py

The single source of truth is assets/brand-source.jpg, the supplied brand
artwork at 1942x809. Everything the site and the PDF reports display is cut
from it here, so the mark in a calculation report, the favicon in a search
result and the logo in the nav bar can never drift apart again. If the brand
is ever redrawn, replace that one file and re-run this.

Outputs
    assets/logo.png         monogram, transparent, for the nav bar
    assets/logo-lockup.png  monogram over the wordmark, transparent
    assets/brand-banner.jpg og:image
    assets/favicon.png      192px, opaque, for browser tabs and Google
    favicon.ico             16/32/48/64 multi-size at the document root
    js/brand-mark.js        the monogram and the header texture, base64, for jsPDF

Why the artwork is masked rather than just cropped: it is a 3D render of the
logo standing on a dark textured wall, complete with bevels and a drop
shadow. A plain crop carries that wall into every PDF header. The mask below
separates the mark from it.
"""

import base64
import io
import os
from pathlib import Path

import cv2
import numpy as np
import scipy.ndimage as nd
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / 'assets' / 'brand-source.jpg'
TEX_SRC = ROOT / 'assets' / 'header-texture-source.jpg'

INK = (0x13, 0x13, 0x13)   # --bg-primary, the site background

# Regions of the master artwork, in source pixels. Measured from the
# luminance profile of brand-source.jpg, with a few px of padding so the
# bevel highlight on each edge is not clipped.
MONOGRAM = (771, 71, 1180, 431)
# Monogram, wordmark and the rule-and-tagline under it. The bottom edge
# is 614 because the tagline's baseline is 602 and the next line of the
# artwork (ARCHITECTURE | STRUCTURE | ...) starts at 648 — cropping any
# lower drags the tops of those letters in as a row of stubs.
# The left edge is 495 and not the 418 a naive threshold reports: the
# photographed building bleeds into that band and has to be excluded.
LOCKUP = (495, 71, 1475, 614)

# Masking constants. LUM_LO/LUM_HI bracket the ramp from wall to mark; the
# wall sits near 33 and the mark's own shadowed faces bottom out near 55.
LUM_LO, LUM_HI = 42.0, 82.0
CORE_LUM = 78          # confidently-mark pixels, used to find the blobs
ALPHA_FLOOR = 0.30     # for the monogram; see note in cut()
LOCKUP_FLOOR = 0.08    # the tagline is 20px type and cannot afford it
SS = 3                 # supersample factor while masking

# Header texture. See build_header_texture() for why these two exist.
TEX_MEAN = 26.0        # target mean luminance of the band
TEX_CAP = 54.0         # soft ceiling, so no patch washes out the gold


def cut(box, min_area=400, floor=ALPHA_FLOOR):
    """Lift one region of the artwork off its background.

    Returns RGBA with the original metallic colour preserved — a flat
    two-tone redraw would be crisper but would stop matching the website,
    and matching is the whole point of this script.
    """
    src = Image.open(SRC).convert('RGB')
    crop = src.crop(box)
    big = crop.resize((crop.width * SS, crop.height * SS), Image.LANCZOS)
    rgb = np.asarray(big)
    lum = cv2.cvtColor(rgb, cv2.COLOR_RGB2GRAY).astype(np.float32)

    # Keep only blobs that are plausibly part of the mark. The artwork has a
    # photographed building at the left and blueprint linework at the right;
    # both are bright enough to survive a threshold, so they are discarded
    # by size and by position instead.
    core = cv2.morphologyEx((lum > CORE_LUM).astype(np.uint8),
                            cv2.MORPH_CLOSE, np.ones((3 * SS, 3 * SS), np.uint8))
    n, lbl, stats, cent = cv2.connectedComponentsWithStats(core, 8)
    keep = np.zeros(core.shape, bool)
    h, w = core.shape
    for i in range(1, n):
        area = stats[i][4]
        cx, cy = cent[i]
        if area > min_area * SS * SS and 0.04 * w < cx < 0.96 * w and 0.03 * h < cy < 0.97 * h:
            keep |= (lbl == i)

    gate = nd.binary_dilation(keep, np.ones((5 * SS, 5 * SS)))
    solid = nd.binary_fill_holes(keep)          # solid interior for the T and A

    ramp = np.clip((lum - LUM_LO) / (LUM_HI - LUM_LO), 0, 1)
    alpha = np.where(solid, 1.0, ramp * gate)
    alpha = cv2.GaussianBlur(alpha, (0, 0), 0.8 * SS)

    # The T stem and the tower spires are drawn fading into shadow at their
    # feet. Against the dark site that fade is the design; against a white
    # PDF page it turns into visible drips, because "fades to black" becomes
    # "fades to transparent" and the page shows through. Lifting the floor
    # cuts the faintest third of the fade and leaves the spires intact —
    # tested against 0.10/0.45/0.60, which respectively kept the drips,
    # started eating the spires, and broke them up.
    alpha = np.clip((alpha - floor) / (1.0 - floor), 0, 1)

    out = Image.fromarray(
        np.dstack([rgb, (alpha * 255).astype(np.uint8)]).astype(np.uint8), 'RGBA')
    bb = out.split()[-1].point(lambda v: 255 if v > 10 else 0).getbbox()
    out = out.crop(bb)
    return out.resize((max(1, out.width // SS), max(1, out.height // SS)), Image.LANCZOS)


def fit(img, height):
    return img.resize((max(1, round(img.width * height / img.height)), height), Image.LANCZOS)


def web(img, height, colors=256):
    """Resize for the site and quantise.

    logo.png loads on all 53 pages, so its weight is site weight. The nav
    bar draws it 38px tall, which even a 3x display only needs 114px of, and
    a 256-colour palette is indistinguishable from full RGBA at that size —
    together roughly a sixth of the full-resolution file. The favicon and
    the PDF mark are cut from the master at full resolution earlier, so
    nothing downstream inherits this reduction.
    """
    out = fit(img, height)
    return out.quantize(colors=colors, method=Image.FASTOCTREE).convert('RGBA')


def on_ink(img, size, inset=0.76):
    """Square, opaque tile for favicons.

    Opaque because Google composites a transparent favicon onto a white
    circle, and this mark is drawn for charcoal. Inset because that circle
    crop would otherwise clip the corners of the monogram.
    """
    canvas = Image.new('RGBA', (size, size), INK + (255,))
    m = img.copy()
    m.thumbnail((int(size * inset), int(size * inset)), Image.LANCZOS)
    canvas.paste(m, ((size - m.width) // 2, (size - m.height) // 2), m)
    return canvas.convert('RGB')


def build_header_texture():
    """Prepare the slate texture that backs the dark header bands.

    Returns (base64 jpeg, (w, h)).

    The supplied photograph averages #2A2A2B, which is lighter than the flat
    fill it replaces and bright enough in places to drop the gold wordmark to
    4.0:1 — under AA for body text. So it is scaled to a mean of TEX_MEAN and
    its highlights are run through a soft knee rather than a hard clip, which
    holds the brightest 3% of the band at #2A2A2B and the gold above 6:1
    everywhere on it, while keeping the grain the clip would have flattened.
    """
    src = Image.open(TEX_SRC).convert('RGB')
    a = np.asarray(src).astype(np.float32)
    a = a * (TEX_MEAN / a.mean())
    knee = TEX_CAP * 0.6
    a = np.where(a > knee, knee + (TEX_CAP - knee) * np.tanh((a - knee) / (TEX_CAP - knee)), a)
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))

    # A wide strip, not the whole frame: the bands are 4.4:1 to 8.75:1, and
    # squashing a 3:2 photo into those smears the grain into streaks.
    strip = im.crop((0, 300, im.width, 640)).resize((1024, 226), Image.LANCZOS)
    buf = io.BytesIO()
    strip.save(buf, format='JPEG', quality=74, optimize=True)
    return base64.b64encode(buf.getvalue()).decode('ascii'), strip.size


def write(path, img, **kw):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, **kw)
    print(f'  {path.relative_to(ROOT).as_posix():28s} {str(img.size):12s} '
          f'{os.path.getsize(path):>8,d} bytes')


def main():
    if not SRC.exists():
        raise SystemExit(f'missing master artwork: {SRC}')
    print(f'source: {SRC.relative_to(ROOT).as_posix()} {Image.open(SRC).size}\n')

    mark = cut(MONOGRAM)
    # The wordmark strokes are thinner than the monogram's and the
    # tagline is set at 20px, where each letter's lower half is bevel
    # shadow. At the monogram's floor that half masks away and the
    # tagline reads as though it were guillotined, so this cut keeps
    # far more of the fade.
    lockup = cut(LOCKUP, min_area=60, floor=LOCKUP_FLOOR)

    write(ROOT / 'assets' / 'logo.png', web(mark, 256), optimize=True)
    write(ROOT / 'assets' / 'logo-lockup.png', web(lockup, 300), optimize=True)

    banner = Image.open(SRC).convert('RGB')
    write(ROOT / 'assets' / 'brand-banner.jpg',
          banner.resize((1200, round(1200 * banner.height / banner.width)), Image.LANCZOS),
          quality=88, optimize=True, progressive=True)

    write(ROOT / 'assets' / 'favicon.png', on_ink(mark, 192), format='PNG', optimize=True)
    ico = ROOT / 'favicon.ico'
    on_ink(mark, 64).save(ico, sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print(f'  {ico.name:28s} {"16/32/48/64":12s} {os.path.getsize(ico):>8,d} bytes')

    # The PDF copy, which is base64'd into a script every calculator page
    # loads, so its weight is page weight. 256px is better than 300 dpi at
    # the largest placement in the suite (0.8in, on the report cover), and
    # 128 colours is indistinguishable from full RGBA once the mark is drawn
    # at half an inch. Together they cost ~24 KB instead of ~71 KB.
    pdf_mark = mark.resize((256, round(256 * mark.height / mark.width)), Image.LANCZOS)
    pdf_mark = pdf_mark.quantize(colors=128, method=Image.FASTOCTREE).convert('RGBA')
    buf = io.BytesIO()
    pdf_mark.save(buf, format='PNG', optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    aspect = round(pdf_mark.width / pdf_mark.height, 5)

    tex_b64, tex_size = build_header_texture()

    def wrap(s, indent=4):
        parts = [s[i:i + 100] for i in range(0, len(s), 100)]
        return "'" + ("' +\n" + ' ' * indent + "'").join(parts) + "'"

    js = f'''/* =====================================================================
   TwinAnalytic — brand assets for PDF reports
   ---------------------------------------------------------------------
   GENERATED FILE. Do not edit by hand.
   Rebuild with: python scripts/build-brand-assets.py

   The reports used to draw an approximation of the logo with jsPDF
   rectangles and lines. It was not the logo — clients received reports
   carrying a mark that appears nowhere else — so the real artwork is
   embedded here instead, cut from the same assets/brand-source.jpg that
   produces the favicon and the nav bar logo.

   Mark:    {pdf_mark.width}x{pdf_mark.height}, over 300 dpi at the largest size the suite
            places it (0.8in, on the report cover).
   Texture: {tex_size[0]}x{tex_size[1]} slate, for the dark header bands that used to be
            a flat fill.
   ===================================================================== */

(function (root) {{
  'use strict';

  var PNG = 'data:image/png;base64,' +
    {wrap(b64)};

  var TEXTURE = 'data:image/jpeg;base64,' +
    {wrap(tex_b64)};

  var ASPECT = {aspect};   // width / height of the mark

  /* Draw the mark into a box `size` wide at (x, y), in whatever unit the
     document was created with. Fitted by width, never by height, so a
     caller that budgeted `size` of horizontal room for the old square mark
     still gets a logo that fits it. */
  function draw(doc, x, y, size) {{
    try {{
      doc.addImage(PNG, 'PNG', x, y, size, size / ASPECT);
      return true;
    }} catch (e) {{
      /* jsPDF throws if the image cannot be decoded. A report that is
         missing its logo is still a usable report, so never let this be
         the thing that stops a download. */
      if (typeof console !== 'undefined') console.warn('brand mark failed to draw:', e);
      return false;
    }}
  }}

  /* Fill a header band with the slate texture instead of flat black. The
     strip is stored wide (aspect ~4.5) because the bands it fills run from
     4.4:1 to 8.75:1 — stretching a squarer image into those would smear the
     grain into visible horizontal streaks.

     Callers must paint their flat fill first and treat this as an overlay
     that may not arrive: if the image fails to decode, the band is still
     the right colour, just untextured. */
  function band(doc, x, y, w, h) {{
    try {{
      doc.addImage(TEXTURE, 'JPEG', x, y, w, h);
      return true;
    }} catch (e) {{
      if (typeof console !== 'undefined') console.warn('header texture failed to draw:', e);
      return false;
    }}
  }}

  root.TWBrandMark = {{
    png: PNG, texture: TEXTURE, aspect: ASPECT,
    draw: draw, band: band,
    height: function (size) {{ return size / ASPECT; }}
  }};
}})(typeof window !== 'undefined' ? window : this);
'''
    out = ROOT / 'js' / 'brand-mark.js'
    out.write_text(js, encoding='utf-8', newline='\n')
    print(f'  {"js/brand-mark.js":28s} {f"{pdf_mark.width}x{pdf_mark.height}":12s} '
          f'{os.path.getsize(out):>8,d} bytes  (mark aspect {aspect}, '
          f'texture {tex_size[0]}x{tex_size[1]})')


if __name__ == '__main__':
    main()
