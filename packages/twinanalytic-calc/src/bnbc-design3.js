/* =====================================================================
   TwinAnalytic — Slenderness, Moment Magnification and Load Combinations
   ---------------------------------------------------------------------
   Two calculators that sat between the existing tools:

   - the column pages ask for a "magnified moment" without anything to
     produce one, so slenderness and the ACI 318 6.6.4 magnifier are
     computed here;
   - the vertical earthquake tool produces Ev but nothing folded it into a
     full set of BNBC 2020 combinations.

   Same result envelope as the rest of the suite.
   ===================================================================== */

const BNBCDesign3 = (function () {
  'use strict';

  const D = (typeof BNBC !== 'undefined') ? BNBC : (typeof require !== 'undefined' ? require('./bnbc-data.js') : null);
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };
  const fx = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 3 : d) : '—');
  const pass = c => c ? 'pass' : 'fail';

  /* =====================================================================
     SLENDERNESS AND MOMENT MAGNIFICATION — ACI 318 Sec 6.6.4
     ===================================================================== */
  function momentMagnifier(inp) {
    const warnings = [];
    const braced = (inp.frame || 'braced') === 'braced';
    const shape = inp.shape || 'rect';

    const fc = num(inp.fc, 4);              // ksi
    const fy = num(inp.fy, 60);             // ksi
    const b = num(inp.b, 18);               // in
    const hDim = num(inp.h, 18);            // in
    const Dia = num(inp.D, 20);             // in
    const lu = num(inp.lu, 12) * 12;        // clear height, in
    const k = num(inp.k, 1.0);
    const Pu = num(inp.Pu, 400);            // kips
    const M1 = num(inp.M1, 60);             // smaller end moment, ft-k
    const M2raw = num(inp.M2, 100);         // larger end moment, ft-k
    const betaDns = num(inp.betaDns, 0.6);  // sustained axial load ratio
    const singleCurv = (inp.curvature || 'single') === 'single';
    /* Ec = 57000 sqrt(f'c) in psi; with f'c in ksi that is 57 sqrt(f'c*1000) ksi */
    const Ec = num(inp.Ec, 0) > 0 ? num(inp.Ec) : 57 * Math.sqrt(fc * 1000);   // ksi

    /* Section properties */
    const Ag = shape === 'circ' ? Math.PI / 4 * Dia * Dia : b * hDim;
    const Ig = shape === 'circ' ? Math.PI / 64 * Math.pow(Dia, 4) : b * Math.pow(hDim, 3) / 12;
    const r = Math.sqrt(Ig / Ag);
    const hEff = shape === 'circ' ? Dia : hDim;

    /* Slenderness ratio */
    const klr = r > 0 ? k * lu / r : 0;

    /* M1/M2 is negative for single curvature under ACI's sign convention */
    const M2 = Math.max(Math.abs(M2raw), Math.abs(M1));
    const M1abs = Math.min(Math.abs(M2raw), Math.abs(M1));
    const ratio = M2 > 0 ? (singleCurv ? -M1abs / M2 : M1abs / M2) : 0;

    /* Slenderness limit, ACI 318 6.2.5 */
    const limitBraced = Math.min(34 + 12 * ratio, 40);
    const limit = braced ? limitBraced : 22;
    const slender = klr > limit;

    /* Minimum moment, ACI 318 6.6.4.5.4 */
    const M2min = Pu * (0.6 + 0.03 * hEff) / 12;      // ft-k
    const M2used = Math.max(M2, M2min);
    const minGoverns = M2min > M2;

    /* Flexural stiffness, ACI 318 6.6.4.4.4 option (a) */
    const EI = 0.4 * Ec * Ig / (1 + betaDns);          // k-in^2

    /* Critical buckling load, ACI 318 Eq 6.6.4.4.2 */
    const Pc = Math.PI * Math.PI * EI / Math.pow(k * lu, 2);   // kips

    /* Cm, ACI 318 6.6.4.5.3 */
    const Cm = braced ? Math.max(0.4, 0.6 - 0.4 * ratio) : 1.0;

    /* Magnifier, ACI 318 Eq 6.6.4.5.2 */
    const denom = 1 - Pu / (0.75 * Pc);
    let delta = denom > 0 ? Cm / denom : Infinity;
    const stable = denom > 0;
    if (delta < 1.0) delta = 1.0;

    const Mc = slender ? delta * M2used : M2used;

    if (!stable) warnings.push('Pu = ' + fx(Pu, 1) + ' k reaches or exceeds 0.75 Pc = ' + fx(0.75 * Pc, 1) + ' k. The column is unstable — increase the section or reduce the unsupported length.');
    else if (delta > 1.4) warnings.push('The magnifier is ' + fx(delta, 3) + '. ACI suggests enlarging the section once magnification becomes large.');
    if (minGoverns) warnings.push('The minimum moment M2,min governs over the applied M2.');
    if (!braced && klr > 22) warnings.push('An unbraced frame with kl/r above 22 must also be checked for sidesway magnification with the whole storey, not just this column.');
    if (klr > 100) warnings.push('kl/r exceeds 100 — ACI 318 6.2.5.2 requires a second order analysis rather than the moment magnifier.');

    return {
      status: stable ? 'PASS' : 'FAIL',
      headline: slender
        ? ('Slender: kl/r = ' + fx(klr, 2) + ' > ' + fx(limit, 2) + ',  δ = ' + fx(delta, 3) + '  →  Mc = ' + fx(Mc, 2) + ' ft-k')
        : ('Short column: kl/r = ' + fx(klr, 2) + ' ≤ ' + fx(limit, 2) + ' — no magnification, Mc = ' + fx(Mc, 2) + ' ft-k'),
      results: [
        { label: 'Frame Type', value: braced ? 'Braced against sidesway' : 'Unbraced (sway) frame' },
        { label: 'Section', value: shape === 'circ' ? ('Circular D = ' + fx(Dia, 1) + ' in') : (fx(b, 1) + ' × ' + fx(hDim, 1) + ' in') },
        { label: 'Gross Area Ag', value: fx(Ag, 2), unit: 'in²' },
        { label: 'Moment of Inertia Ig', value: fx(Ig, 1), unit: 'in⁴' },
        { label: 'Radius of Gyration r', value: fx(r, 4), unit: 'in' },
        { label: 'Effective Length k·lu', value: fx(k * lu, 2), unit: 'in' },
        { label: 'Slenderness Ratio kl/r', value: fx(klr, 3) },
        { label: 'M1 / M2', value: fx(M1abs, 2) + ' / ' + fx(M2, 2), unit: 'ft-k' },
        { label: 'Curvature', value: singleCurv ? 'Single (M1/M2 negative)' : 'Double (M1/M2 positive)' },
        { label: 'M1/M2 Ratio', value: fx(ratio, 4) },
        { label: 'Slenderness Limit', value: fx(limit, 3), flag: slender ? 'warn' : 'pass' },
        { label: 'Classification', value: slender ? 'SLENDER — magnify' : 'SHORT — no magnification', flag: slender ? 'warn' : 'pass' },
        { label: 'Minimum Moment M2,min', value: fx(M2min, 3), unit: 'ft-k', flag: minGoverns ? 'warn' : '' },
        { label: 'M2 used in design', value: fx(M2used, 3), unit: 'ft-k' },
        { label: 'Concrete Modulus Ec', value: fx(Ec, 1), unit: 'ksi' },
        { label: 'Flexural Stiffness EI', value: fx(EI, 0), unit: 'k·in²' },
        { label: 'Critical Load Pc', value: fx(Pc, 2), unit: 'k' },
        { label: '0.75 Pc', value: fx(0.75 * Pc, 2), unit: 'k', flag: stable ? 'pass' : 'fail' },
        { label: 'Applied Pu', value: fx(Pu, 2), unit: 'k' },
        { label: 'Pu / 0.75Pc', value: fx(Pu / (0.75 * Pc), 4), flag: stable ? 'pass' : 'fail' },
        { label: 'Cm', value: fx(Cm, 4) },
        { label: 'Magnifier δ', value: fx(delta, 4), flag: delta > 1.4 ? 'warn' : 'pass' },
        { label: 'MAGNIFIED MOMENT Mc', value: fx(Mc, 3), unit: 'ft-k' }
      ],
      steps: [
        {
          n: 1, title: 'Section Properties and Slenderness Ratio', status: 'pass',
          formula: shape === 'circ'
            ? 'Ag = π D²/4,   Ig = π D⁴/64,   r = √(Ig/Ag) = D/4'
            : 'Ag = b h,   Ig = b h³/12,   r = √(Ig/Ag) = 0.289 h',
          sub: 'Ag = ' + fx(Ag, 2) + ' in²,  Ig = ' + fx(Ig, 1) + ' in⁴\nr = √(' + fx(Ig, 1) + ' / ' + fx(Ag, 2) + ') = ' + fx(r, 4) + ' in\nk = ' + fx(k, 2) + ',  lu = ' + fx(lu, 1) + ' in',
          res: 'kl/r = ' + fx(klr, 3)
        },
        {
          n: 2, title: 'Is the Column Slender?', status: slender ? 'fail' : 'pass',
          formula: braced
            ? 'Braced frame: slenderness may be neglected when\n  kl/r ≤ 34 + 12(M1/M2)   and   ≤ 40        (ACI 318 6.2.5)\nM1/M2 is negative for single curvature.'
            : 'Unbraced frame: slenderness may be neglected when kl/r ≤ 22',
          sub: braced
            ? 'M1/M2 = ' + (singleCurv ? '−' : '+') + fx(M1abs, 2) + '/' + fx(M2, 2) + ' = ' + fx(ratio, 4) +
              '\n34 + 12(' + fx(ratio, 4) + ') = ' + fx(34 + 12 * ratio, 3) + ', capped at 40\nLimit = ' + fx(limit, 3)
            : 'Limit = 22',
          res: 'kl/r = ' + fx(klr, 3) + (slender ? ' > ' : ' ≤ ') + fx(limit, 3) + '  →  ' + (slender ? 'SLENDER' : 'SHORT COLUMN')
        },
        {
          n: 3, title: 'Minimum Moment', status: 'pass',
          formula: 'M2,min = Pu (0.6 + 0.03 h)        (ACI 318 6.6.4.5.4, h in inches)',
          sub: 'M2,min = ' + fx(Pu, 2) + ' × (0.6 + 0.03 × ' + fx(hEff, 1) + ') / 12 = ' + fx(M2min, 3) + ' ft-k\nApplied M2 = ' + fx(M2, 3) + ' ft-k',
          res: 'M2 used = ' + fx(M2used, 3) + ' ft-k' + (minGoverns ? '  (minimum governs)' : '')
        },
        {
          n: 4, title: 'Flexural Stiffness and Critical Load', status: pass(stable),
          formula: "Ec = 57000 √f'c  (psi)\nEI = 0.4 Ec Ig / (1 + βdns)        (ACI 318 6.6.4.4.4a)\nPc = π² EI / (k lu)²               (ACI 318 Eq 6.6.4.4.2)",
          sub: 'Ec = ' + fx(Ec, 1) + ' ksi\nβdns = ' + fx(betaDns, 2) + '\nEI = 0.4 × ' + fx(Ec, 1) + ' × ' + fx(Ig, 1) + ' / (1 + ' + fx(betaDns, 2) + ') = ' + fx(EI, 0) + ' k·in²\nPc = π² × ' + fx(EI, 0) + ' / ' + fx(k * lu, 1) + '²',
          res: 'Pc = ' + fx(Pc, 2) + ' k,  0.75 Pc = ' + fx(0.75 * Pc, 2) + ' k'
        },
        {
          n: 5, title: 'Magnification Factor', status: pass(stable),
          formula: 'Cm = 0.6 − 0.4 (M1/M2) ≥ 0.4   for a braced frame\nCm = 1.0                       for an unbraced frame\nδ = Cm / (1 − Pu / 0.75Pc) ≥ 1.0        (ACI 318 Eq 6.6.4.5.2)',
          sub: 'Cm = ' + fx(Cm, 4) + '\nPu / 0.75Pc = ' + fx(Pu, 2) + ' / ' + fx(0.75 * Pc, 2) + ' = ' + fx(Pu / (0.75 * Pc), 4) +
            '\n1 − ' + fx(Pu / (0.75 * Pc), 4) + ' = ' + fx(denom, 4) +
            (stable ? '' : '\n\nThe denominator is not positive — the column buckles before reaching Pu.'),
          res: stable ? ('δ = ' + fx(delta, 4)) : 'UNSTABLE — no valid magnifier'
        },
        {
          n: 6, title: 'Magnified Design Moment', status: pass(stable),
          formula: 'Mc = δ × M2        (used only when the column is slender)',
          sub: slender
            ? 'Mc = ' + fx(delta, 4) + ' × ' + fx(M2used, 3)
            : 'The column is short, so no magnification applies and Mc = M2.',
          res: 'Mc = ' + fx(Mc, 3) + ' ft-k  →  use this as the design moment in the column calculator'
        }
      ],
      warnings,
      table: {
        title: 'Design Summary',
        headers: ['Quantity', 'Value', 'Unit'],
        rows: [
          ['Slenderness kl/r', fx(klr, 3), '—'],
          ['Slenderness limit', fx(limit, 3), '—'],
          ['Critical load Pc', fx(Pc, 2), 'k'],
          ['Magnifier δ', fx(delta, 4), '—'],
          ['Design moment Mc', fx(Mc, 3), 'ft-k']
        ],
        foot: null
      },
      raw: { Ag, Ig, r, klr, limit, slender, M1abs, M2, M2min, M2used, minGoverns, Ec, EI, Pc, Cm, delta, Mc, stable, braced, Pu }
    };
  }

  /* =====================================================================
     BNBC 2020 LOAD COMBINATIONS  (Sec 2.7, strength design)
     ===================================================================== */
  function loadCombinations(inp) {
    const warnings = [];
    const Dl = num(inp.D, 100);
    const Ll = num(inp.L, 50);
    const Lr = num(inp.Lr, 0);
    const Wl = num(inp.W, 40);
    const El = num(inp.E, 60);
    const Hl = num(inp.H, 0);
    const Fl = num(inp.F, 0);
    const Ev = num(inp.Ev, 0);          // vertical seismic coefficient
    const rho = num(inp.rho, 1.0);      // redundancy factor
    const f1 = num(inp.f1, 0.5);        // live load companion factor

    /* Ev acts on the dead load, so it shifts the dead load factor */
    const combos = [
      { n: 1, name: '1.4(D + F)', d: 1.4, l: 0, lr: 0, w: 0, e: 0, f: 1.4 },
      { n: 2, name: '1.2(D + F) + 1.6(L + H) + 0.5Lr', d: 1.2, l: 1.6, lr: 0.5, w: 0, e: 0, f: 1.2 },
      { n: 3, name: '1.2D + 1.6Lr + (f1·L or 0.8W)', d: 1.2, l: f1, lr: 1.6, w: 0, e: 0, f: 0 },
      { n: 4, name: '1.2D + 1.6Lr + 0.8W', d: 1.2, l: 0, lr: 1.6, w: 0.8, e: 0, f: 0 },
      { n: 5, name: '1.2D + 1.6W + f1·L + 0.5Lr', d: 1.2, l: f1, lr: 0.5, w: 1.6, e: 0, f: 0 },
      { n: 6, name: '(1.2 + Ev)D + ρE + f1·L', d: 1.2 + Ev, l: f1, lr: 0, w: 0, e: rho, f: 0, seismic: true },
      { n: 7, name: '0.9D + 1.6W + 1.6H', d: 0.9, l: 0, lr: 0, w: 1.6, e: 0, f: 0 },
      { n: 8, name: '(0.9 − Ev)D + ρE + 1.6H', d: 0.9 - Ev, l: 0, lr: 0, w: 0, e: rho, f: 0, seismic: true }
    ];

    combos.forEach(c => {
      c.value = c.d * Dl + c.l * Ll + c.lr * Lr + c.w * Wl + c.e * El + (c.f || 0) * Fl + (c.n === 2 || c.n === 7 || c.n === 8 ? 1.6 * Hl : 0);
    });

    const governing = combos.reduce((a, c) => (Math.abs(c.value) > Math.abs(a.value) ? c : a), combos[0]);
    /* The uplift case matters as much as the maximum */
    const minCombo = combos.reduce((a, c) => (c.value < a.value ? c : a), combos[0]);

    if (Ev > 0) warnings.push('The vertical earthquake effect Ev = ' + fx(Ev, 4) + ' has shifted the dead load factor in the seismic combinations to ' + fx(1.2 + Ev, 4) + ' and ' + fx(0.9 - Ev, 4) + '.');
    if (minCombo.value < 0) warnings.push('Combination ' + minCombo.n + ' produces net uplift (' + fx(minCombo.value, 2) + '). Check hold-down and overturning.');
    if (rho > 1.0) warnings.push('A redundancy factor above 1.0 applies where the seismic system lacks redundancy (BNBC 2020 Sec 2.5.13.4).');

    const rows = combos.map(c => ([
      String(c.n), c.name,
      fx(c.d, 3), fx(c.l, 2), fx(c.lr, 2), fx(c.w, 2), fx(c.e, 2),
      fx(c.value, 2),
      c.n === governing.n ? 'GOVERNS' : ''
    ]));

    return {
      status: 'INFO',
      headline: 'Governing combination ' + governing.n + ': ' + governing.name + '  =  ' + fx(governing.value, 2) +
        (minCombo.value < 0 ? '   |   minimum ' + fx(minCombo.value, 2) + ' (uplift)' : ''),
      results: [
        { label: 'Dead Load D', value: fx(Dl, 2) },
        { label: 'Live Load L', value: fx(Ll, 2) },
        { label: 'Roof Live Load Lr', value: fx(Lr, 2) },
        { label: 'Wind W', value: fx(Wl, 2) },
        { label: 'Earthquake E', value: fx(El, 2) },
        { label: 'Fluid F / Lateral Earth H', value: fx(Fl, 2) + ' / ' + fx(Hl, 2) },
        { label: 'Vertical Seismic Coefficient Ev', value: fx(Ev, 5) },
        { label: 'Redundancy Factor ρ', value: fx(rho, 2) },
        { label: 'Live Load Companion Factor f1', value: fx(f1, 2) },
        { label: 'Seismic Dead Load Factor (1.2 + Ev)', value: fx(1.2 + Ev, 4) },
        { label: 'Uplift Dead Load Factor (0.9 − Ev)', value: fx(0.9 - Ev, 4) },
        { label: 'Governing Combination', value: '#' + governing.n + ' — ' + governing.name },
        { label: 'Governing Value', value: fx(governing.value, 3) },
        { label: 'Minimum (uplift) Value', value: fx(minCombo.value, 3), flag: minCombo.value < 0 ? 'warn' : '' }
      ],
      steps: [
        {
          n: 1, title: 'Basic Strength Combinations', status: 'pass',
          formula: '1.  1.4(D + F)\n2.  1.2(D + F) + 1.6(L + H) + 0.5Lr\n3.  1.2D + 1.6Lr + (f1 L or 0.8W)\n4.  1.2D + 1.6Lr + 0.8W\n5.  1.2D + 1.6W + f1 L + 0.5Lr\n7.  0.9D + 1.6W + 1.6H',
          sub: 'f1 = ' + fx(f1, 2) + ' — take 1.0 for places of public assembly, garages and\nlive loads above 4.8 kN/m², otherwise 0.5.',
          res: 'Six gravity and wind combinations evaluated'
        },
        {
          n: 2, title: 'Seismic Combinations with the Vertical Effect', status: 'pass',
          formula: '6.  (1.2 + Ev) D + ρ E + f1 L\n8.  (0.9 − Ev) D + ρ E + 1.6H\n\nEv is the vertical earthquake effect from BNBC 2020 Sec 2.5.13.3.',
          sub: 'Ev = ' + fx(Ev, 5) + '\nCombination 6 dead load factor = 1.2 + ' + fx(Ev, 5) + ' = ' + fx(1.2 + Ev, 5) +
            '\nCombination 8 dead load factor = 0.9 − ' + fx(Ev, 5) + ' = ' + fx(0.9 - Ev, 5) +
            '\nρ = ' + fx(rho, 2),
          res: 'Combination 6 = ' + fx(combos[5].value, 2) + ',  combination 8 = ' + fx(combos[7].value, 2)
        },
        {
          n: 3, title: 'Governing Case', status: 'pass',
          formula: 'The design is controlled by the largest magnitude, and separately by\nthe most negative value where uplift or stress reversal is possible.',
          sub: combos.map(c => '  ' + String(c.n).padStart(2) + '.  ' + fx(c.value, 2).padStart(10) + '   ' + c.name).join('\n'),
          res: 'Maximum: combination ' + governing.n + ' = ' + fx(governing.value, 3) +
            '\nMinimum: combination ' + minCombo.n + ' = ' + fx(minCombo.value, 3)
        }
      ],
      warnings,
      table: {
        title: 'BNBC 2020 Strength Design Load Combinations',
        headers: ['#', 'Combination', 'D', 'L', 'Lr', 'W', 'E', 'Result', ''],
        rows, foot: null
      },
      raw: { combos, governing, minCombo, Ev, rho, f1, Dl, Ll, Lr, Wl, El }
    };
  }

  return { momentMagnifier, loadCombinations };
})();

if (typeof window !== 'undefined') window.BNBCDesign3 = BNBCDesign3;
if (typeof module !== 'undefined' && module.exports) module.exports = BNBCDesign3;
