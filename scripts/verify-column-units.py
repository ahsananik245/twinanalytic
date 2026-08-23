#!/usr/bin/env python3
"""Prove the column calculator gives the same answer in both unit systems.

    python -m http.server 8000          # or python dev-server.py
    python scripts/verify-column-units.py [--base http://localhost:8000]

The metric switch converts at the boundary and leaves the verified engine
alone, so the only thing that can go wrong is a conversion factor. This checks
that directly rather than trusting it:

  1. Equivalence — one physical column entered in imperial, then the identical
     column entered in metric. Every output, converted back, must agree.
  2. Regression  — imperial results must equal the values recorded before the
     switch existed.
  3. Round trip  — toggling repeatedly must not drift the inputs. Reversing a
     rounded display loses precision, so the module keeps the exact native
     value; this is what catches it if that breaks.
  4. Bar table   — metric bars must have the true area of their nominal
     diameter, not that of the nearest imperial bar.

Exit status is non-zero if any check fails, so it can gate a deploy.
"""

import argparse
import math
import sys

try:
    from playwright.sync_api import sync_playwright
except ImportError:
    sys.exit("Playwright is required:  pip install playwright && playwright install chromium")

KIP, KIPFT, KSI, IN, FT, IN2 = 4.4482216, 1.3558179, 6.8947573, 25.4, 0.3048, 645.16

IMPERIAL = {
    'column-height': '10', 'column-pdl': '300', 'column-pll': '200',
    'column-mux': '0', 'column-muy': '0', 'column-vu': '0',
    'column-fc': '4', 'column-fy': '60', 'column-fyt': '60', 'column-cover': '1.5',
}
METRIC = {
    'column-height': f"{10 * FT:.6g}", 'column-pdl': f"{300 * KIP:.6g}",
    'column-pll': f"{200 * KIP:.6g}", 'column-mux': '0', 'column-muy': '0', 'column-vu': '0',
    'column-fc': f"{4 * KSI:.6g}", 'column-fy': f"{60 * KSI:.6g}",
    'column-fyt': f"{60 * KSI:.6g}", 'column-cover': f"{1.5 * IN:.6g}",
}

# Recorded from the calculator before the metric switch was added.
BASELINE = {'column-out-dim': '17 in', 'column-out-tie-spacing': '16.00 in',
            'column-out-phi-pn': '697.0 k', 'column-out-ast': '6.32 in²'}

OUTPUTS = ['column-out-pu', 'column-out-ag', 'column-out-dim', 'column-out-final-area',
           'column-out-ast', 'column-out-tie-spacing', 'column-out-hook-extension',
           'column-out-pn-max', 'column-out-phi-pn', 'column-out-dc-ratio',
           'column-out-slenderness', 'column-out-slenderness-limit']

# Factor to bring a metric reading back to imperial. Anything absent is
# dimensionless and must match unchanged.
BACK = {'column-out-pu': KIP, 'column-out-ag': IN2, 'column-out-dim': IN,
        'column-out-final-area': IN2, 'column-out-ast': IN2,
        'column-out-tie-spacing': IN, 'column-out-hook-extension': IN,
        'column-out-pn-max': KIP, 'column-out-phi-pn': KIP}

DRIFT_FIELDS = list(IMPERIAL.keys())


def num(text):
    try:
        return float(str(text).strip().split()[0])
    except (ValueError, IndexError, AttributeError):
        return None


def fill(pg, values):
    for key, value in values.items():
        if not pg.query_selector('#' + key):
            continue
        if pg.evaluate(f"document.getElementById('{key}').tagName") == 'SELECT':
            pg.select_option('#' + key, value)
        else:
            pg.fill('#' + key, value)


def run(pg, values, system, bar, tie):
    pg.evaluate(f"window.TWColumnUnits.set('{system}')")
    pg.wait_for_timeout(400)
    fill(pg, values)
    pg.select_option('#column-main-bar', bar)
    pg.select_option('#column-tie-bar', tie)
    pg.click('#btn-calc-column')
    pg.wait_for_timeout(900)
    return pg.evaluate(
        "(ids) => Object.fromEntries(ids.map(i => [i, document.getElementById(i)?.textContent]))",
        OUTPUTS)


def main(base):
    failures = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        pg = browser.new_page(viewport={"width": 1440, "height": 950})
        pg.on("dialog", lambda d: d.dismiss())
        pg.goto(f"{base}/column-design.html", wait_until="networkidle")
        pg.evaluate("localStorage.setItem('tools_user_unlocked','true');"
                    "localStorage.removeItem('twinanalytic_column_units')")
        pg.reload(wait_until="networkidle")
        pg.wait_for_timeout(1800)

        # -- 4. bar table -----------------------------------------------------
        print("metric bar areas (true circle area of the nominal diameter)")
        for mm in (10, 12, 16, 20, 25, 32, 40):
            got = pg.evaluate(f"aciBar('{mm}mm').area") * IN2
            want = math.pi * mm * mm / 4
            ok = abs(got - want) < 0.5
            failures += [] if ok else [f"bar {mm}mm: {got:.1f} vs {want:.1f} mm2"]
            print(f"   {mm:2d} mm  {got:7.1f} mm2   {'OK' if ok else 'MISMATCH'}")

        # -- 1 & 2. equivalence and regression --------------------------------
        imp = run(pg, IMPERIAL, 'IMP', '#8', '#3')
        met = run(pg, METRIC, 'SI', '#8', '#3')

        print(f"\n{'output':30s} {'imperial':>14s} {'metric':>16s} {'back':>12s}")
        for key in OUTPUTS:
            a, b = num(imp[key]), num(met[key])
            if a is None or b is None:
                failures.append(f"{key}: unreadable ({imp[key]!r} / {met[key]!r})")
                continue
            back = b / BACK[key] if key in BACK else b
            ok = abs(back - a) <= max(0.02, abs(a) * 0.005)
            failures += [] if ok else [f"{key}: imperial {a} vs metric {back:.4f}"]
            print(f"{key:30s} {imp[key]:>14s} {met[key]:>16s} {back:>12.3f}  {'OK' if ok else 'MISMATCH'}")

        print("\nregression against pre-switch values")
        for key, want in BASELINE.items():
            got = imp[key]
            ok = got == want
            failures += [] if ok else [f"{key}: {got!r} != recorded {want!r}"]
            print(f"   {key:30s} {got!s:>12s}  {'OK' if ok else 'CHANGED, was ' + want}")

        # -- 3. round trip ----------------------------------------------------
        pg.evaluate("window.TWColumnUnits.set('IMP')")
        pg.wait_for_timeout(300)
        fill(pg, IMPERIAL)
        start = pg.evaluate("(f)=>Object.fromEntries(f.map(i=>[i,document.getElementById(i).value]))",
                            DRIFT_FIELDS)
        for _ in range(8):
            pg.evaluate("window.TWColumnUnits.set('SI')")
            pg.wait_for_timeout(90)
            pg.evaluate("window.TWColumnUnits.set('IMP')")
            pg.wait_for_timeout(90)
        end = pg.evaluate("(f)=>Object.fromEntries(f.map(i=>[i,document.getElementById(i).value]))",
                          DRIFT_FIELDS)
        drift = [f"{k}: {start[k]} -> {end[k]}"
                 for k in DRIFT_FIELDS if abs(float(start[k]) - float(end[k])) > 1e-9]
        failures += drift
        print(f"\nround trip x8: {'no drift' if not drift else drift}")

        browser.close()

    print()
    if failures:
        print(f"FAILED — {len(failures)} problem(s):")
        for f in failures:
            print("   ", f)
        return 1
    print("PASSED — both unit systems agree, imperial unchanged, no drift.")
    return 0


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('--base', default='http://localhost:8000')
    sys.exit(main(ap.parse_args().base.rstrip('/')))
