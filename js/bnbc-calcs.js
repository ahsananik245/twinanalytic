/* =====================================================================
   TwinAnalytic — BNBC 2020 Analysis Engine
   ---------------------------------------------------------------------
   Pure calculation functions ported from the BNBC 2020 / ACI 318
   spreadsheet suite. Every function takes a plain input object and
   returns a uniform result envelope:

     {
       status  : 'PASS' | 'FAIL' | 'INFO',
       headline: string shown in the status banner,
       results : [ { label, value, unit, key, flag } ],
       steps   : [ { n, title, status, formula, sub, res } ],
       warnings: [ string ],
       table   : { title, headers, rows, foot } | null,
       raw     : { ...every intermediate value }
     }

   No DOM access lives in this file so the same functions can be unit
   tested against the source workbooks.
   ===================================================================== */

const BNBCCalc = (function () {
  'use strict';

  const D = (typeof BNBC !== 'undefined') ? BNBC : (typeof require !== 'undefined' ? require('./bnbc-data.js') : null);

  /* ---------- small helpers ---------- */
  const num = (v, dflt) => {
    const n = parseFloat(v);
    return (isFinite(n)) ? n : (dflt === undefined ? 0 : dflt);
  };
  const fx = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 3 : d) : '—');
  const pass = c => c ? 'pass' : 'fail';

  /* =====================================================================
     A1 — EQUIVALENT STATIC SEISMIC ANALYSIS  (BNBC 2020 Sec 2.5.7)
     Source workbook: A1-Earth-Quake-Analysis
     ===================================================================== */
  function seismicStatic(inp) {
    const warnings = [];

    const Z = num(inp.Z, 0.20);
    const I = num(inp.I, 1.0);
    const soil = D.SOIL_PARAMS[inp.soil] || D.SOIL_PARAMS.SD;
    const S = soil.S, TB = soil.TB, TC = soil.TC, TD = soil.TD;
    const pc = D.PERIOD_COEFF[inp.periodType] || D.PERIOD_COEFF.CMRF;
    const R = num(inp.R, 7);
    const xi = num(inp.damping, 0.05);          // fraction of critical damping
    const H = num(inp.H, 30);                    // total height above base, metres

    /* Damping correction factor, BNBC Eq 6.2.36 */
    const etaRaw = Math.sqrt(10 / (5 + xi * 100));
    const eta = Math.max(etaRaw, 0.55);

    /* Approximate fundamental period, BNBC Eq 6.2.38 */
    const T = pc.Ct * Math.pow(H, pc.m);

    /* Normalised acceleration response spectrum Cs, BNBC Eq 6.2.35.
       Four branches keyed on where T falls relative to TB, TC, TD.
       The source workbook returned zero for T > 4 s; the plateau is
       carried past 4 s here so a very tall/flexible building still
       produces a finite base shear instead of silently reading V = 0. */
    let Cs, branch;
    if (T <= TB) {
      Cs = S * (1 + (T / TB) * (2.5 * eta - 1));
      branch = '0 ≤ T ≤ TB';
    } else if (T <= TC) {
      Cs = 2.5 * S * eta;
      branch = 'TB ≤ T ≤ TC';
    } else if (T <= TD) {
      Cs = 2.5 * S * eta * (TC / T);
      branch = 'TC ≤ T ≤ TD';
    } else {
      Cs = 2.5 * S * eta * (TC * TD / (T * T));
      branch = 'TD ≤ T';
      if (T > 4) warnings.push('T exceeds 4 s. BNBC tabulates the spectrum to 4 s only — confirm a site specific spectrum is not required.');
    }

    /* Design spectral acceleration, BNBC Eq 6.2.34 */
    const SaCode = (2 * Z * I * Cs) / (3 * R);

    /* Lower bound carried over from the source workbook. Note that the
       soil factor S appears squared in that expression; it is reported
       separately so the governing term is always visible. */
    const SaFloor = 0.67 * 0.15 * Z * I * S * S;
    const Sa = Math.max(SaCode, SaFloor);
    const floorGoverns = SaFloor > SaCode;
    if (floorGoverns) {
      warnings.push('The minimum base shear floor governs over BNBC Eq 6.2.34. That floor term carries the soil factor S squared — verify it against your edition of the code before issuing.');
    }

    /* ---- Seismic weight ---------------------------------------------
       Storeys are taken from the supplied list. Each storey carries its
       own weight, so the distributed weights always sum exactly to W.
       The source workbook divided the total weight by a separately typed
       storey count, which silently disagreed with the number of storey
       rows actually filled in. */
    let storeys = (inp.storeys || []).filter(s => num(s.h, 0) > 0);
    if (!storeys.length) {
      const n = Math.max(1, Math.round(num(inp.n, 6)));
      const sh = num(inp.storeyHeight, 3);
      const wUnit = num(inp.wFloor, 0);           // weight per floor
      storeys = [];
      for (let i = 0; i < n; i++) storeys.push({ name: 'Level ' + (i + 1), h: sh, w: wUnit });
    }

    let cum = 0;
    storeys.forEach(s => { cum += num(s.h, 0); s.hx = cum; s.wx = num(s.w, 0); });
    const W = storeys.reduce((a, s) => a + s.wx, 0);
    const Hsum = cum;

    if (Math.abs(Hsum - H) / Math.max(H, 1e-9) > 0.02) {
      warnings.push('Sum of storey heights (' + fx(Hsum, 2) + ' m) differs from the height above base used for the period (' + fx(H, 2) + ' m).');
    }
    if (W <= 0) warnings.push('Total seismic weight is zero — enter a weight for each storey.');

    /* Base shear */
    const V = Sa * W;

    /* Vertical distribution exponent k, BNBC Eq 6.2.41 */
    let k;
    if (T <= 0.5) k = 1;
    else if (T >= 2.5) k = 2;
    else k = 1 + 0.5 * (T - 0.5);

    /* Storey force distribution, BNBC Eq 6.2.40 */
    let denom = 0;
    storeys.forEach(s => { s.whk = s.wx * Math.pow(s.hx, k); denom += s.whk; });
    let running = 0;
    storeys.slice().reverse().forEach(s => { running += (denom > 0 ? V * s.whk / denom : 0); s.Vstorey = running; });
    storeys.forEach(s => { s.Fx = denom > 0 ? V * s.whk / denom : 0; });

    const rows = storeys.map((s, i) => ([
      String(i + 1), s.name || ('Level ' + (i + 1)), fx(s.h, 2), fx(s.hx, 2),
      fx(s.wx, 2), fx(s.whk, 1), fx(s.Fx, 2), fx(s.Vstorey, 2)
    ]));

    return {
      status: 'INFO',
      headline: 'Design base shear V = ' + fx(V, 2) + ' kN  (Sa = ' + fx(Sa, 5) + ', T = ' + fx(T, 3) + ' s)',
      results: [
        { label: 'Seismic Zone Coefficient (Z)', value: fx(Z, 2) },
        { label: 'Importance Factor (I)', value: fx(I, 2) },
        { label: 'Soil Factor (S)', value: fx(S, 2), unit: soil.name.split('—')[1] || '' },
        { label: 'Damping Correction (η)', value: fx(eta, 4) },
        { label: 'Fundamental Period (T)', value: fx(T, 4), unit: 's' },
        { label: 'Spectrum Branch', value: branch },
        { label: 'Normalised Acceleration (Cs)', value: fx(Cs, 5) },
        { label: 'Sa per Eq 6.2.34', value: fx(SaCode, 6) },
        { label: 'Minimum Sa floor', value: fx(SaFloor, 6), flag: floorGoverns ? 'warn' : '' },
        { label: 'Governing Sa', value: fx(Sa, 6) },
        { label: 'Total Seismic Weight (W)', value: fx(W, 2), unit: 'kN' },
        { label: 'Design Base Shear (V)', value: fx(V, 2), unit: 'kN' },
        { label: 'Base Shear Coefficient (V/W)', value: fx(W > 0 ? V / W : 0, 5) },
        { label: 'Distribution Exponent (k)', value: fx(k, 4) }
      ],
      steps: [
        {
          n: 1, title: 'Damping Correction Factor η', status: 'pass',
          formula: 'η = √(10 / (5 + 100ξ))   and   η ≥ 0.55',
          sub: 'η = √(10 / (5 + 100×' + fx(xi, 3) + ')) = ' + fx(etaRaw, 4),
          res: 'η = ' + fx(eta, 4)
        },
        {
          n: 2, title: 'Approximate Fundamental Period T', status: 'pass',
          formula: 'T = Ct × H^m        (BNBC Eq 6.2.38, H in metres)',
          sub: 'Structure type: ' + pc.name + '\nCt = ' + pc.Ct + ',  m = ' + pc.m + ',  H = ' + fx(H, 2) + ' m\nT = ' + pc.Ct + ' × ' + fx(H, 2) + '^' + pc.m,
          res: 'T = ' + fx(T, 4) + ' s'
        },
        {
          n: 3, title: 'Normalised Response Spectrum Cs', status: 'pass',
          formula: '0 ≤ T ≤ TB : Cs = S[1 + (T/TB)(2.5η − 1)]\nTB ≤ T ≤ TC : Cs = 2.5 S η\nTC ≤ T ≤ TD : Cs = 2.5 S η (TC/T)\nTD ≤ T       : Cs = 2.5 S η (TC·TD/T²)',
          sub: 'S = ' + S + ',  TB = ' + TB + ' s,  TC = ' + TC + ' s,  TD = ' + TD + ' s\nT = ' + fx(T, 4) + ' s falls in branch ' + branch,
          res: 'Cs = ' + fx(Cs, 5)
        },
        {
          n: 4, title: 'Design Spectral Acceleration Sa', status: 'pass',
          formula: 'Sa = (2/3) × (Z·I / R) × Cs        (BNBC Eq 6.2.34)\nSa ≥ 0.67 × 0.15 × Z · I · S²   (workbook floor)',
          sub: 'Eq 6.2.34 : (2 × ' + Z + ' × ' + I + ' × ' + fx(Cs, 5) + ') / (3 × ' + R + ') = ' + fx(SaCode, 6) +
            '\nFloor      : 0.67 × 0.15 × ' + Z + ' × ' + I + ' × ' + S + '² = ' + fx(SaFloor, 6),
          res: 'Sa = ' + fx(Sa, 6) + (floorGoverns ? '  (floor governs)' : '  (Eq 6.2.34 governs)')
        },
        {
          n: 5, title: 'Seismic Weight and Base Shear', status: pass(W > 0),
          formula: 'W = Σ Wx        V = Sa × W        (BNBC Eq 6.2.33)',
          sub: 'Storeys entered: ' + storeys.length + '\nW = ' + fx(W, 2) + ' kN\nV = ' + fx(Sa, 6) + ' × ' + fx(W, 2),
          res: 'V = ' + fx(V, 2) + ' kN'
        },
        {
          n: 6, title: 'Vertical Distribution Exponent k', status: 'pass',
          formula: 'T ≤ 0.5 s : k = 1\n0.5 < T < 2.5 s : k = 1 + 0.5(T − 0.5)\nT ≥ 2.5 s : k = 2        (BNBC Eq 6.2.41)',
          sub: 'T = ' + fx(T, 4) + ' s',
          res: 'k = ' + fx(k, 4)
        },
        {
          n: 7, title: 'Storey Force Distribution', status: 'pass',
          formula: 'Fx = V × (Wx·hx^k) / Σ(Wi·hi^k)        (BNBC Eq 6.2.40)',
          sub: 'Σ Wx·hx^k = ' + fx(denom, 1) + '\nStorey forces are listed in the distribution table.',
          res: 'Σ Fx = ' + fx(storeys.reduce((a, s) => a + s.Fx, 0), 2) + ' kN = V ✓'
        }
      ],
      warnings,
      table: {
        title: 'Vertical Distribution of Base Shear',
        headers: ['#', 'Level', 'Storey Ht (m)', 'Cum. Ht hx (m)', 'Wx (kN)', 'Wx·hx^k', 'Fx (kN)', 'Storey Shear (kN)'],
        rows,
        foot: ['', 'TOTAL', fx(Hsum, 2), '', fx(W, 2), fx(denom, 1), fx(V, 2), '']
      },
      raw: { Z, I, S, TB, TC, TD, eta, T, Cs, SaCode, SaFloor, Sa, W, V, k, storeys, R, branch }
    };
  }

  /* =====================================================================
     A2 — WIND LOAD, MWFRS ANY HEIGHT  (BNBC 2020 Sec 2.4)
     Source workbook: A2-Wind-load-Analysis
     ===================================================================== */
  function windLoad(inp) {
    const warnings = [];

    const V = num(inp.V, 65.7);                 // basic wind speed, m/s
    const expKey = inp.exposure || 'A';
    const ex = D.EXPOSURE[expKey] || D.EXPOSURE.A;
    const Kzt = num(inp.Kzt, 1.0);
    const Kd = num(inp.Kd, 0.85);
    const I = num(inp.I, 1.0);
    const beta = num(inp.damping, 0.05);
    const hr = num(inp.hr, 33.53);              // ridge height, m
    const he = num(inp.he, 33.53);              // eave height, m
    const Wdim = num(inp.width, 27.13);         // dimension normal to ridge (X)
    const Ldim = num(inp.length, 23.17);        // dimension parallel to ridge (Y)
    const dir = inp.direction || 'Normal';
    const roof = inp.roofType || 'Gable';
    const GCpi = num(inp.GCpi, 0.18);
    const pc = D.PERIOD_COEFF[inp.periodType] || D.PERIOD_COEFF.CMRF;

    /* Roof angle and mean roof height */
    const half = (roof === 'Gable') ? (Wdim / 2) : Wdim;
    const theta = (half > 0) ? Math.atan((hr - he) / half) * 180 / Math.PI : 0;
    const h = (theta <= 10) ? he : he + (hr - he) / 2;

    /* B is across wind, L is along wind */
    const Lw = (dir === 'Normal') ? Wdim : Ldim;
    const Bw = (dir === 'Normal') ? Ldim : Wdim;

    /* Fundamental period and flexibility */
    const T = pc.Ct * Math.pow(h, pc.m);
    const n1 = 1 / T;
    const flexible = n1 < 1;

    /* ---- Gust effect factor -----------------------------------------
       Rigid : BNBC Eq 6.2.17.  Flexible : BNBC Eq 6.2.20. */
    const zBar = Math.max(0.6 * h, ex.zmin);
    const Lz = ex.l * Math.pow(zBar / 10, ex.epsBar);
    const Q = Math.sqrt(1 / (1 + 0.63 * Math.pow((Bw + h) / Lz, 0.63)));
    const Iz = ex.c * Math.pow(10 / zBar, 1 / 6);
    const Grigid = 0.925 * (1 + 1.7 * 3.4 * Iz * Q) / (1 + 1.7 * 3.4 * Iz);

    const Vz = V * ex.bBar * Math.pow(zBar / 10, ex.alphaBar);
    const etaH = 4.6 * n1 * h / Vz;
    const etaB = 4.6 * n1 * Bw / Vz;
    const etaL = 15.4 * n1 * Lw / Vz;
    const Rfn = e => (e > 0) ? (1 / e - (1 / (2 * e * e)) * (1 - Math.exp(-2 * e))) : 1;
    const Rh = Rfn(etaH), RB = Rfn(etaB), RL = Rfn(etaL);
    const N1 = n1 * Lz / Vz;
    const Rn = 7.47 * N1 / Math.pow(1 + 10.3 * N1, 5 / 3);
    const Rres = Math.sqrt((1 / beta) * Rn * Rh * RB * (0.53 + 0.47 * RL));
    const gR = Math.sqrt(2 * Math.log(3600 * n1)) + 0.577 / Math.sqrt(2 * Math.log(3600 * n1));
    const gQ = 3.4, gV = 3.4;
    const Gflex = 0.925 * (1 + 1.7 * Iz * Math.sqrt(gQ * gQ * Q * Q + gR * gR * Rres * Rres)) / (1 + 1.7 * gV * Iz);

    const G = flexible ? Gflex : Math.min(0.85, Grigid);

    /* ---- Wall pressure coefficients, Figure 6.2.6 --------------------
       Leeward Cp is negative across the whole L/B range. The source
       workbook dropped the minus sign on the 2 < L/B < 4 branch, which
       flipped the leeward wall into suction-free positive pressure. */
    const LB = Bw > 0 ? Lw / Bw : 1;
    const CpW = 0.8;
    let CpL;
    if (LB <= 1) CpL = -0.5;
    else if (LB >= 4) CpL = -0.2;
    else if (LB > 2) CpL = -(0.3 - 0.05 * (LB - 2));
    else CpL = -(0.5 - 0.2 * (LB - 1));
    const CpS = -0.7;

    /* ---- Velocity pressure ------------------------------------------
       Kz from the BNBC Eq in Table 6.2.11 note 2 rather than a stepped
       table read. The workbook mixed the two: the windward profile used
       the equation while Kh used a step lookup, so the two disagreed by
       up to 3 % at the same height. */
    const Kzf = z => 2.01 * Math.pow(Math.max(z, 4.57) / ex.zg, 2 / ex.alpha);
    const qzf = z => 0.000613 * Kzf(z) * Kzt * Kd * V * V * I;   // kN/m^2

    const Kh = Kzf(h);
    const qh = qzf(h);

    /* ---- Pressure profile up the windward face ---------------------- */
    let levels = (inp.levels || []).map(z => num(z, 0)).filter(z => z > 0);
    if (!levels.length) {
      levels = [];
      const step = Math.max(3, h / 10);
      for (let z = step; z < h; z += step) levels.push(z);
      levels.push(h);
    }
    levels.sort((a, b) => a - b);

    const rows = levels.map((z, i) => {
      const Kz = Kzf(z), qz = qzf(z);
      const pwPos = qz * G * CpW - qh * GCpi;
      const pwNeg = qz * G * CpW + qh * GCpi;
      return [String(i + 1), fx(z, 2), fx(Kz, 4), fx(qz, 4), fx(pwPos, 4), fx(pwNeg, 4)];
    });

    const plPos = qh * G * CpL - qh * GCpi;
    const plNeg = qh * G * CpL + qh * GCpi;
    const psPos = qh * G * CpS - qh * GCpi;
    const psNeg = qh * G * CpS + qh * GCpi;

    if (h > 60 * D.CONV.FT_TO_M) warnings.push('Mean roof height exceeds 18.3 m (60 ft) — the low-rise MWFRS provisions of Figure 6.2.10 do not apply.');
    if (flexible) warnings.push('n₁ = ' + fx(n1, 3) + ' Hz < 1 Hz — the structure is flexible, so the along-wind gust effect factor Gf governs.');

    return {
      status: 'INFO',
      headline: 'qₕ = ' + fx(qh, 4) + ' kN/m² at h = ' + fx(h, 2) + ' m,  ' + (flexible ? 'Gf' : 'G') + ' = ' + fx(G, 4),
      results: [
        { label: 'Basic Wind Speed (V)', value: fx(V, 1), unit: 'm/s' },
        { label: 'Exposure Category', value: expKey + ' (α = ' + ex.alpha + ', zg = ' + ex.zg + ' m)' },
        { label: 'Roof Angle (θ)', value: fx(theta, 2), unit: '°' },
        { label: 'Mean Roof Height (h)', value: fx(h, 3), unit: 'm' },
        { label: 'Along-wind L / Across-wind B', value: fx(Lw, 2) + ' / ' + fx(Bw, 2), unit: 'm' },
        { label: 'Fundamental Period (T)', value: fx(T, 4), unit: 's' },
        { label: 'Natural Frequency (n₁)', value: fx(n1, 4), unit: 'Hz' },
        { label: 'Structure Classification', value: flexible ? 'FLEXIBLE (n₁ < 1 Hz)' : 'RIGID (n₁ ≥ 1 Hz)' },
        { label: 'Gust Effect Factor', value: fx(G, 4) },
        { label: 'Kh at mean roof height', value: fx(Kh, 4) },
        { label: 'Velocity Pressure qₕ', value: fx(qh, 4), unit: 'kN/m²' },
        { label: 'Windward Cp', value: fx(CpW, 2) },
        { label: 'Leeward Cp  (L/B = ' + fx(LB, 3) + ')', value: fx(CpL, 3) },
        { label: 'Side wall Cp', value: fx(CpS, 2) },
        { label: 'Internal Pressure ±GCpi', value: '±' + fx(GCpi, 2) },
        { label: 'Leeward pressure (+GCpi / −GCpi)', value: fx(plPos, 4) + ' / ' + fx(plNeg, 4), unit: 'kN/m²' },
        { label: 'Side wall pressure (+GCpi / −GCpi)', value: fx(psPos, 4) + ' / ' + fx(psNeg, 4), unit: 'kN/m²' }
      ],
      steps: [
        {
          n: 1, title: 'Mean Roof Height and Roof Angle', status: 'pass',
          formula: 'θ = atan[(hr − he) / (W/2)] for a gable roof\nh = he            for θ ≤ 10°\nh = he + (hr − he)/2   for θ > 10°',
          sub: 'hr = ' + fx(hr, 2) + ' m,  he = ' + fx(he, 2) + ' m,  W = ' + fx(Wdim, 2) + ' m\nθ = ' + fx(theta, 3) + '°',
          res: 'h = ' + fx(h, 3) + ' m'
        },
        {
          n: 2, title: 'Fundamental Period and Rigidity', status: 'pass',
          formula: 'T = Ct × h^m,   n₁ = 1/T\nRigid if n₁ ≥ 1 Hz, flexible if n₁ < 1 Hz',
          sub: 'Ct = ' + pc.Ct + ',  m = ' + pc.m + ',  h = ' + fx(h, 3) + ' m\nT = ' + fx(T, 4) + ' s  →  n₁ = ' + fx(n1, 4) + ' Hz',
          res: flexible ? 'FLEXIBLE — use Gf' : 'RIGID — use G'
        },
        {
          n: 3, title: 'Gust Effect Factor', status: 'pass',
          formula: flexible
            ? 'Gf = 0.925 × [1 + 1.7 Iz√(gQ²Q² + gR²R²)] / (1 + 1.7 gV Iz)'
            : 'G = 0.925 × (1 + 1.7 × 3.4 × Iz × Q) / (1 + 1.7 × 3.4 × Iz),  G ≤ 0.85',
          sub: 'z̄ = max(0.6h, zmin) = ' + fx(zBar, 3) + ' m\nLz̄ = ' + fx(Lz, 3) + ' m,  Iz̄ = ' + fx(Iz, 5) + ',  Q = ' + fx(Q, 5) +
            (flexible ? ('\nVz̄ = ' + fx(Vz, 3) + ' m/s,  Rn = ' + fx(Rn, 5) + ',  Rh = ' + fx(Rh, 5) + ',  RB = ' + fx(RB, 5) + ',  RL = ' + fx(RL, 5) + '\nR = ' + fx(Rres, 5) + ',  gR = ' + fx(gR, 4)) : ''),
          res: (flexible ? 'Gf = ' : 'G = ') + fx(G, 5)
        },
        {
          n: 4, title: 'Velocity Pressure Exposure Coefficient Kz', status: 'pass',
          formula: 'Kz = 2.01 (z / zg)^(2/α)     for 4.57 m ≤ z ≤ zg\nKz = 2.01 (4.57 / zg)^(2/α)  for z < 4.57 m',
          sub: 'Exposure ' + expKey + ': α = ' + ex.alpha + ', zg = ' + ex.zg + ' m\nAt h = ' + fx(h, 3) + ' m  →  Kh = ' + fx(Kh, 5) +
            '\n\nThe closed-form equation is used at every level so Kh and the windward Kz profile stay consistent.',
          res: 'Kh = ' + fx(Kh, 5)
        },
        {
          n: 5, title: 'Velocity Pressure qz', status: 'pass',
          formula: 'qz = 0.000613 × Kz × Kzt × Kd × V² × I     (kN/m², V in m/s)',
          sub: 'Kzt = ' + fx(Kzt, 2) + ',  Kd = ' + fx(Kd, 2) + ',  V = ' + fx(V, 1) + ' m/s,  I = ' + fx(I, 2) +
            '\nqₕ = 0.000613 × ' + fx(Kh, 4) + ' × ' + fx(Kzt, 2) + ' × ' + fx(Kd, 2) + ' × ' + fx(V, 1) + '² × ' + fx(I, 2),
          res: 'qₕ = ' + fx(qh, 5) + ' kN/m²'
        },
        {
          n: 6, title: 'Wall Pressure Coefficients Cp', status: 'pass',
          formula: 'Windward  : Cp = +0.8\nLeeward   : L/B ≤ 1 → −0.5,  L/B ≥ 4 → −0.2, linear between\nSide walls: Cp = −0.7        (Figure 6.2.6)',
          sub: 'L/B = ' + fx(Lw, 2) + ' / ' + fx(Bw, 2) + ' = ' + fx(LB, 4) +
            '\nLeeward Cp = ' + fx(CpL, 4) + ' (suction — negative over the whole range)',
          res: 'Cpw = ' + fx(CpW, 2) + ',  CpL = ' + fx(CpL, 3) + ',  Cps = ' + fx(CpS, 2)
        },
        {
          n: 7, title: 'Design Pressure p', status: 'pass',
          formula: 'p = q · G · Cp − qᵢ · (GCpi)        (BNBC Eq 6.2.23)\nWindward uses qz at height z; leeward and side walls use qₕ.',
          sub: 'Both signs of the internal pressure are evaluated at every level.\nLeeward : ' + fx(plPos, 4) + ' / ' + fx(plNeg, 4) + ' kN/m²\nSide    : ' + fx(psPos, 4) + ' / ' + fx(psNeg, 4) + ' kN/m²',
          res: 'See the windward pressure profile table'
        }
      ],
      warnings,
      table: {
        title: 'Windward Wall Pressure Profile',
        headers: ['#', 'z (m)', 'Kz', 'qz (kN/m²)', 'p with +GCpi (kN/m²)', 'p with −GCpi (kN/m²)'],
        rows,
        foot: null
      },
      raw: { V, ex, h, theta, T, n1, flexible, G, Grigid, Gflex, Kh, qh, CpW, CpL, CpS, LB, Lw, Bw, GCpi, levels }
    };
  }

  /* =====================================================================
     A3 — VERTICAL EARTHQUAKE EFFECT  (BNBC 2020 / ASCE 7-16)
     Source workbook: A3-Vertical-Earthquake-Effect-Cal
     ===================================================================== */
  function verticalSeismic(inp) {
    const mode = inp.mode || 'BNBC';
    const warnings = [];
    let Ev, steps, results;

    if (mode === 'BNBC') {
      const Z = num(inp.Z, 0.36);
      const soil = D.SOIL_PARAMS[inp.soil] || D.SOIL_PARAMS.SC;
      const S = soil.S;
      const ah = (2 / 3) * Z * S;
      Ev = 0.5 * ah;
      results = [
        { label: 'Zone Coefficient (Z)', value: fx(Z, 3) },
        { label: 'Site Class', value: (inp.soil || 'SC') + ' — S = ' + fx(S, 2) },
        { label: 'Horizontal Acceleration aₕ = (2/3)ZS', value: fx(ah, 5), unit: 'g' },
        { label: 'Vertical Coefficient Ev = 0.5 aₕ', value: fx(Ev, 5) }
      ];
      steps = [
        {
          n: 1, title: 'Horizontal Ground Acceleration', status: 'pass',
          formula: 'aₕ = (2/3) × Z × S',
          sub: 'Z = ' + fx(Z, 3) + ',  S = ' + fx(S, 2) + '\naₕ = (2/3) × ' + fx(Z, 3) + ' × ' + fx(S, 2),
          res: 'aₕ = ' + fx(ah, 5) + ' g'
        },
        {
          n: 2, title: 'Vertical Earthquake Effect', status: 'pass',
          formula: 'Ev = 0.5 × aₕ × D        (BNBC 2020 Sec 2.5.13.3)',
          sub: 'Ev coefficient = 0.5 × ' + fx(ah, 5) + ' = (1/3) × Z × S',
          res: 'Ev = ' + fx(Ev, 5) + ' D'
        }
      ];
    } else {
      const Fa = num(inp.Fa, 0.9);
      const Ss = num(inp.Ss, 0.5);
      const SDS = (2 / 3) * Fa * Ss;
      Ev = 0.2 * SDS;
      results = [
        { label: 'Site Coefficient (Fa)', value: fx(Fa, 3) },
        { label: 'Mapped Acceleration (Ss)', value: fx(Ss, 3), unit: 'g' },
        { label: 'Fa × Ss', value: fx(Fa * Ss, 5) },
        { label: 'SDS = (2/3) Fa·Ss', value: fx(SDS, 5), unit: 'g' },
        { label: 'Vertical Coefficient Ev = 0.2 SDS', value: fx(Ev, 5) }
      ];
      steps = [
        {
          n: 1, title: 'Design Spectral Acceleration SDS', status: 'pass',
          formula: 'SDS = (2/3) × Fa × Ss        (ASCE 7-16 Eq 11.4-3)',
          sub: 'Fa = ' + fx(Fa, 3) + ',  Ss = ' + fx(Ss, 3) + ' g',
          res: 'SDS = ' + fx(SDS, 5) + ' g'
        },
        {
          n: 2, title: 'Vertical Earthquake Effect', status: 'pass',
          formula: 'Ev = 0.2 × SDS × D        (ASCE 7-16 Eq 12.4-4a)',
          sub: 'Ev coefficient = 0.2 × ' + fx(SDS, 5),
          res: 'Ev = ' + fx(Ev, 5) + ' D'
        }
      ];
    }

    const c5 = 1.2 + Ev;
    const c7 = 0.9 - Ev;
    results.push({ label: 'Modified Combination 5 factor on D', value: fx(c5, 5) });
    results.push({ label: 'Modified Combination 7 factor on D', value: fx(c7, 5) });
    steps.push({
      n: 3, title: 'Modified Load Combinations', status: 'pass',
      formula: 'Comb 5 : (1.2 + Ev) D + ρ Qᴇ + L + 0.2S\nComb 7 : (0.9 − Ev) D + ρ Qᴇ + 1.6H',
      sub: 'Ev = ' + fx(Ev, 5) + '\nComb 5 factor on D = 1.2 + ' + fx(Ev, 5) + '\nComb 7 factor on D = 0.9 − ' + fx(Ev, 5),
      res: '(' + fx(c5, 4) + ')D  and  (' + fx(c7, 4) + ')D'
    });

    return {
      status: 'INFO',
      headline: 'Ev = ' + fx(Ev, 5) + ' D  →  combinations become (' + fx(c5, 4) + ')D and (' + fx(c7, 4) + ')D',
      results, steps, warnings, table: null,
      raw: { Ev, c5, c7, mode }
    };
  }

  /* =====================================================================
     B1 — P-DELTA STABILITY CHECK  (BNBC 2020 Sec 2.5.7.9)
     Source workbook: B1-P-Delta-Check-of-a-Building
     ===================================================================== */
  function pDeltaCheck(inp) {
    const warnings = [];
    const I = num(inp.I, 1.0);
    const Cd = num(inp.Cd, 5.5);
    const betaSh = num(inp.beta, 1.0);   // ratio of shear demand to shear capacity

    /* Levels are supplied base-first. deltaXe is the elastic displacement
       at the centre of mass from the analysis model. */
    const lv = (inp.levels || []).filter(r => num(r.h, 0) > 0);
    let prev = 0;
    lv.forEach(r => {
      r.hsx = num(r.h, 0);
      r.P = num(r.P, 0);
      r.Vx = Math.abs(num(r.V, 0));
      r.dxe = num(r.disp, 0);
      r.deltaM = r.dxe * Cd / I;                     // amplified displacement
      r.drift = r.deltaM - prev;                     // design storey drift
      prev = r.deltaM;
      r.theta = (r.Vx > 0 && r.hsx > 0) ? Math.abs(r.P * r.drift / (r.Vx * r.hsx * Cd)) : 0;
    });

    /* Stability coefficient limit, BNBC Eq 6.2.46.
       theta_max = 0.5 / (beta * Cd)  and shall not exceed 0.25.
       The source workbook used MAX(0.5/Cd, 0.10), which raises the limit
       whenever 0.5/Cd falls below 0.10 and so passes storeys the code
       would reject. The governing form is a MIN against 0.25. */
    const thetaMax = Math.min(0.5 / (betaSh * Cd), 0.25);

    const thetaVals = lv.map(r => r.theta);
    const thetaPeak = thetaVals.length ? Math.max.apply(null, thetaVals) : 0;

    let verdict, status;
    if (thetaPeak <= 0.10) { verdict = 'P-Δ EFFECTS MAY BE NEGLECTED'; status = 'PASS'; }
    else if (thetaPeak <= thetaMax) { verdict = 'P-Δ EFFECTS MUST BE INCLUDED'; status = 'PASS'; }
    else { verdict = 'UNSTABLE — REDESIGN REQUIRED'; status = 'FAIL'; }

    lv.forEach(r => {
      r.verdict = (r.theta <= 0.10) ? 'Neglect' : (r.theta <= thetaMax ? 'Include P-Δ' : 'Redesign');
    });

    if (thetaPeak > thetaMax) warnings.push('θmax = ' + fx(thetaPeak, 4) + ' exceeds the limit ' + fx(thetaMax, 4) + '. The structure is potentially unstable and must be stiffened.');
    lv.forEach((r, i) => { if (r.drift < 0) warnings.push('Level "' + (r.name || i + 1) + '" has a negative storey drift — check that levels are entered from the base upwards.'); });

    const rows = lv.map((r, i) => ([
      String(i + 1), r.name || ('Level ' + (i + 1)), fx(r.hsx, 1), fx(r.P, 2), fx(r.Vx, 2),
      fx(r.dxe, 4), fx(r.deltaM, 4), fx(r.drift, 4), fx(r.theta, 5), r.verdict
    ]));

    return {
      status,
      headline: 'θmax = ' + fx(thetaPeak, 5) + ' vs limit ' + fx(thetaMax, 4) + ' — ' + verdict,
      results: [
        { label: 'Importance Factor (I)', value: fx(I, 2) },
        { label: 'Deflection Amplification (Cd)', value: fx(Cd, 2) },
        { label: 'Shear demand/capacity ratio (β)', value: fx(betaSh, 2) },
        { label: 'Maximum Stability Coefficient (θmax)', value: fx(thetaPeak, 5) },
        { label: 'Limiting θ = min(0.5/βCd, 0.25)', value: fx(thetaMax, 5) },
        { label: 'Neglect threshold', value: '0.100' },
        { label: 'Verdict', value: verdict, flag: status === 'FAIL' ? 'fail' : 'pass' }
      ],
      steps: [
        {
          n: 1, title: 'Design Storey Drift Δ', status: 'pass',
          formula: 'δx = Cd · δxe / I\nΔi = δx(i) − δx(i−1)        (BNBC Eq 6.2.44)',
          sub: 'Cd = ' + fx(Cd, 2) + ',  I = ' + fx(I, 2) + '\nAmplified displacements are differenced level by level from the base up.',
          res: 'See the storey table'
        },
        {
          n: 2, title: 'Stability Coefficient θ', status: 'pass',
          formula: 'θ = Px · Δ / (Vx · hsx · Cd)        (BNBC Eq 6.2.45)',
          sub: 'Px is the total gravity load at and above the level.\nVx is the seismic shear acting in the storey.\nhsx is the storey height.',
          res: 'θmax = ' + fx(thetaPeak, 5)
        },
        {
          n: 3, title: 'Stability Limit θmax', status: pass(thetaPeak <= thetaMax),
          formula: 'θmax = 0.5 / (β · Cd)   and   θmax ≤ 0.25        (BNBC Eq 6.2.46)',
          sub: 'β = ' + fx(betaSh, 2) + ',  Cd = ' + fx(Cd, 2) +
            '\n0.5 / (' + fx(betaSh, 2) + ' × ' + fx(Cd, 2) + ') = ' + fx(0.5 / (betaSh * Cd), 5) +
            '\nCapped at 0.25.',
          res: 'θmax = ' + fx(thetaMax, 5)
        },
        {
          n: 4, title: 'Verdict', status: pass(status !== 'FAIL'),
          formula: 'θ ≤ 0.10          → P-Δ may be neglected\n0.10 < θ ≤ θmax → P-Δ must be included in the analysis\nθ > θmax        → structure is unstable, stiffen and reanalyse',
          sub: 'θmax = ' + fx(thetaPeak, 5) + ' against a limit of ' + fx(thetaMax, 5),
          res: verdict
        }
      ],
      warnings,
      table: {
        title: 'Storey by Storey Stability Coefficients',
        headers: ['#', 'Level', 'hsx', 'Px', 'Vx', 'δxe', 'δx = Cdδxe/I', 'Δ storey', 'θ', 'Action'],
        rows, foot: null
      },
      raw: { thetaPeak, thetaMax, Cd, I, betaSh, levels: lv }
    };
  }

  /* =====================================================================
     B2 — BASE SHEAR VERIFICATION AGAINST A MODEL
     Source workbook: B2-Base-Shear-Check
     ===================================================================== */
  function baseShearCheck(inp) {
    const warnings = [];
    const DL = num(inp.DL, 0), SDL = num(inp.SDL, 0), LL = num(inp.LL, 0);
    /* BNBC 2020 Sec 2.5.7.2 counts only a fraction of the floor live load
       in the seismic weight. The source workbook summed the live load in
       full and then applied 0.25 to a separate, empty cell. */
    const llFactor = num(inp.llFactor, 0.25);
    const EQ = Math.abs(num(inp.EQ, 0));

    const W = DL + SDL + llFactor * LL;
    const ratioModel = W > 0 ? EQ / W : 0;

    const Z = num(inp.Z, 0.20), I = num(inp.I, 1.0), R = num(inp.R, 5);
    const Ct = num(inp.Ct, 0.0466), m = num(inp.m, 0.9), H = num(inp.H, 38);
    const T = Ct * Math.pow(H, m);

    const soil = D.SOIL_PARAMS[inp.soil] || D.SOIL_PARAMS.SD;
    const xi = num(inp.damping, 0.05);
    const eta = Math.max(Math.sqrt(10 / (5 + xi * 100)), 0.55);
    let Cs;
    if (T <= soil.TB) Cs = soil.S * (1 + (T / soil.TB) * (2.5 * eta - 1));
    else if (T <= soil.TC) Cs = 2.5 * soil.S * eta;
    else if (T <= soil.TD) Cs = 2.5 * soil.S * eta * (soil.TC / T);
    else Cs = 2.5 * soil.S * eta * (soil.TC * soil.TD / (T * T));

    const ratioCode = (2 * Z * I * Cs) / (3 * R);
    const diff = ratioModel > 0 ? (ratioModel - ratioCode) / ratioModel : 0;
    const ok = ratioModel >= ratioCode * 0.95;

    if (!ok) warnings.push('The model base shear is more than 5 % below the code value. Scale the seismic case up before designing members.');
    if (llFactor > 0.5) warnings.push('A live load participation above 0.5 is unusual — BNBC uses 0.25 for most occupancies.');

    return {
      status: ok ? 'PASS' : 'FAIL',
      headline: 'Model V/W = ' + fx(ratioModel, 5) + '  vs  code V/W = ' + fx(ratioCode, 5) + '  (' + fx(diff * 100, 2) + ' % difference)',
      results: [
        { label: 'Dead Load (DL)', value: fx(DL, 3), unit: 'kN' },
        { label: 'Super Dead Load (SDL)', value: fx(SDL, 3), unit: 'kN' },
        { label: 'Live Load (LL)', value: fx(LL, 3), unit: 'kN' },
        { label: 'Live Load Participation', value: fx(llFactor, 2) },
        { label: 'Seismic Weight W', value: fx(W, 3), unit: 'kN' },
        { label: 'Model Base Shear (EQ)', value: fx(EQ, 3), unit: 'kN' },
        { label: 'Model V/W', value: fx(ratioModel, 6) },
        { label: 'Fundamental Period (T)', value: fx(T, 4), unit: 's' },
        { label: 'Normalised Acceleration (Cs)', value: fx(Cs, 5) },
        { label: 'Code V/W = (2ZI·Cs)/(3R)', value: fx(ratioCode, 6) },
        { label: 'Difference', value: fx(diff * 100, 3), unit: '%' },
        { label: 'Verdict', value: ok ? 'MODEL ACCEPTABLE' : 'SCALE UP SEISMIC CASE', flag: ok ? 'pass' : 'fail' }
      ],
      steps: [
        {
          n: 1, title: 'Seismic Weight', status: 'pass',
          formula: 'W = DL + SDL + λ · LL,  λ = 0.25 for most occupancies (BNBC 2020 Sec 2.5.7.2)',
          sub: 'W = ' + fx(DL, 2) + ' + ' + fx(SDL, 2) + ' + ' + fx(llFactor, 2) + ' × ' + fx(LL, 2),
          res: 'W = ' + fx(W, 3) + ' kN'
        },
        {
          n: 2, title: 'Base Shear Coefficient from the Model', status: 'pass',
          formula: 'V/W = |EQ base reaction| / W',
          sub: '|EQ| = ' + fx(EQ, 3) + ' kN,  W = ' + fx(W, 3) + ' kN',
          res: 'V/W = ' + fx(ratioModel, 6)
        },
        {
          n: 3, title: 'Code Base Shear Coefficient', status: 'pass',
          formula: 'T = Ct · H^m\nSa = (2/3) × (Z·I / R) × Cs',
          sub: 'Ct = ' + fx(Ct, 4) + ',  m = ' + fx(m, 2) + ',  H = ' + fx(H, 2) + ' m → T = ' + fx(T, 4) + ' s\nZ = ' + fx(Z, 3) + ',  I = ' + fx(I, 2) + ',  R = ' + fx(R, 2) + ',  Cs = ' + fx(Cs, 5),
          res: 'Sa = ' + fx(ratioCode, 6)
        },
        {
          n: 4, title: 'Comparison', status: pass(ok),
          formula: 'The analysis base shear must not fall below the static value.\nBNBC allows a 5 % tolerance before scaling is required.',
          sub: 'Model ' + fx(ratioModel, 6) + ' vs code ' + fx(ratioCode, 6) + '\nDifference = ' + fx(diff * 100, 3) + ' %',
          res: ok ? 'Acceptable ✓' : 'Scale factor required = ' + fx(ratioModel > 0 ? ratioCode / ratioModel : 0, 4)
        }
      ],
      warnings, table: null,
      raw: { W, ratioModel, ratioCode, T, Cs, diff, ok }
    };
  }

  /* =====================================================================
     B3 / B6 — STOREY DRIFT, DRIFT RATIO AND SWAY LIMITATION
     Source workbooks: B3-Drifts-and-sway-limitation,
                       B6-Story-drift-and-drift-ratio-check
     ===================================================================== */
  function driftCheck(inp) {
    const warnings = [];
    const Cd = num(inp.Cd, 5.5);
    const I = num(inp.I, 1.0);
    const limitRatio = num(inp.driftLimit, 0.020);   // Table 6.2.21
    const swayDenom = num(inp.swayDenom, 500);       // total sway limit H/500

    const lv = (inp.levels || []).filter(r => num(r.h, 0) > 0);
    let prevAmp = 0, cum = 0;
    lv.forEach(r => {
      r.hsx = num(r.h, 0);                 // storey height, m
      r.dxe = num(r.disp, 0);              // elastic displacement, mm
      r.deltaM = r.dxe * Cd / I;           // amplified displacement, mm
      r.drift = r.deltaM - prevAmp;        // storey drift, mm
      prevAmp = r.deltaM;
      cum += r.hsx;
      r.cumH = cum;

      /* Allowable storey drift is a fraction of the STOREY height.
         The source B3 workbook multiplied the ratio by the TOTAL building
         height, which inflated the allowance by the number of storeys. */
      r.allow = limitRatio * r.hsx * 1000;         // mm
      r.driftOK = r.drift <= r.allow;
      r.ratio = r.hsx > 0 ? r.drift / (r.hsx * 1000) : 0;
      r.ratioOK = r.ratio <= limitRatio;

      /* Total sway limit measured on the un-amplified displacement */
      r.swayAllow = r.cumH * 1000 / swayDenom;     // mm
      r.swayOK = r.dxe <= r.swayAllow;
    });

    const worstDrift = lv.reduce((a, r) => Math.max(a, r.ratio), 0);
    const anyDriftFail = lv.some(r => !r.driftOK);
    const anySwayFail = lv.some(r => !r.swayOK);
    const totalH = cum;
    const topDisp = lv.length ? lv[lv.length - 1].dxe : 0;
    const swayAllowTop = totalH * 1000 / swayDenom;

    if (anyDriftFail) warnings.push('One or more storeys exceed the allowable drift — stiffen the lateral system.');
    if (anySwayFail) warnings.push('Total sway exceeds H/' + swayDenom + ' at one or more levels.');

    const status = (anyDriftFail || anySwayFail) ? 'FAIL' : 'PASS';

    const rows = lv.map((r, i) => ([
      String(i + 1), r.name || ('Level ' + (i + 1)), fx(r.hsx, 3), fx(r.cumH, 2),
      fx(r.dxe, 3), fx(r.deltaM, 3), fx(r.drift, 3), fx(r.allow, 2),
      fx(r.ratio, 5), r.driftOK ? 'Safe' : 'Unsafe',
      fx(r.swayAllow, 2), r.swayOK ? 'OK' : 'Not OK'
    ]));

    return {
      status,
      headline: 'Peak drift ratio = ' + fx(worstDrift, 5) + ' vs limit ' + fx(limitRatio, 4) +
        '  |  Top sway ' + fx(topDisp, 2) + ' mm vs H/' + swayDenom + ' = ' + fx(swayAllowTop, 2) + ' mm',
      results: [
        { label: 'Deflection Amplification (Cd)', value: fx(Cd, 2) },
        { label: 'Importance Factor (I)', value: fx(I, 2) },
        { label: 'Allowable Drift Ratio Δa/hsx', value: fx(limitRatio, 4) },
        { label: 'Total Building Height', value: fx(totalH, 3), unit: 'm' },
        { label: 'Peak Storey Drift Ratio', value: fx(worstDrift, 5), flag: worstDrift > limitRatio ? 'fail' : 'pass' },
        { label: 'Storey Drift Check', value: anyDriftFail ? 'FAILS at one or more levels' : 'ALL LEVELS SAFE', flag: anyDriftFail ? 'fail' : 'pass' },
        { label: 'Top Elastic Displacement', value: fx(topDisp, 3), unit: 'mm' },
        { label: 'Sway Limit H/' + swayDenom, value: fx(swayAllowTop, 3), unit: 'mm' },
        { label: 'Sway Check', value: anySwayFail ? 'FAILS at one or more levels' : 'ALL LEVELS OK', flag: anySwayFail ? 'fail' : 'pass' }
      ],
      steps: [
        {
          n: 1, title: 'Amplified Displacement', status: 'pass',
          formula: 'δx = Cd · δxe / I        (BNBC Eq 6.2.44)',
          sub: 'Cd = ' + fx(Cd, 2) + ',  I = ' + fx(I, 2) + '\nEach elastic displacement from the model is amplified by Cd/I = ' + fx(Cd / I, 4) + '.',
          res: 'See the drift table'
        },
        {
          n: 2, title: 'Storey Drift', status: pass(!anyDriftFail),
          formula: 'Δi = δx(i) − δx(i−1)',
          sub: 'Drifts are differenced level by level from the base upwards.',
          res: anyDriftFail ? 'One or more storeys exceed the allowance' : 'All storey drifts within allowance'
        },
        {
          n: 3, title: 'Allowable Storey Drift', status: pass(!anyDriftFail),
          formula: 'Δa = (allowable ratio) × hsx        (BNBC Table 6.2.21)\nOccupancy I,II → 0.020 hsx    III → 0.015 hsx    IV → 0.010 hsx',
          sub: 'The allowance is a fraction of the STOREY height hsx, not of the total building height.\nRatio in use = ' + fx(limitRatio, 4),
          res: 'Peak drift ratio = ' + fx(worstDrift, 5) + ' vs ' + fx(limitRatio, 4)
        },
        {
          n: 4, title: 'Drift Ratio', status: pass(!anyDriftFail),
          formula: 'drift ratio = Δi / hsx        must be ≤ the Table 6.2.21 value',
          sub: 'Computed with hsx in the same units as the drift so the ratio is dimensionless.',
          res: fx(worstDrift, 5) + (worstDrift <= limitRatio ? ' ≤ ' : ' > ') + fx(limitRatio, 4)
        },
        {
          n: 5, title: 'Total Sway Limitation', status: pass(!anySwayFail),
          formula: 'δtotal ≤ Hcum / ' + swayDenom + '        (serviceability sway limit)',
          sub: 'Checked at every level against the cumulative height above base.\nAt the top: ' + fx(topDisp, 3) + ' mm vs ' + fx(swayAllowTop, 3) + ' mm',
          res: anySwayFail ? 'Sway limit exceeded' : 'Sway within limit ✓'
        }
      ],
      warnings,
      table: {
        title: 'Storey Drift, Drift Ratio and Sway',
        headers: ['#', 'Level', 'hsx (m)', 'Cum H (m)', 'δxe (mm)', 'δx (mm)', 'Δ (mm)', 'Δa (mm)', 'Δ/hsx', 'Drift', 'Sway allow (mm)', 'Sway'],
        rows, foot: null
      },
      raw: { worstDrift, limitRatio, totalH, topDisp, swayAllowTop, levels: lv, anyDriftFail, anySwayFail }
    };
  }

  /* =====================================================================
     B4 — VERTICAL STIFFNESS (SOFT STOREY) IRREGULARITY
     Source workbook: B4-Soft-story-X-Y-Direction
     ===================================================================== */
  function softStorey(inp) {
    const warnings = [];
    /* Levels are supplied TOP FIRST so that "the storey above" is the
       preceding row, matching how ETABS prints storey stiffness. */
    const lv = (inp.levels || []).filter(r => num(r.k, 0) > 0);

    lv.forEach((r, i) => {
      r.K = num(r.k, 0);
      r.above1 = (i >= 1) ? lv[i - 1].K : null;
      r.avg3 = (i >= 3) ? (lv[i - 1].K + lv[i - 2].K + lv[i - 3].K) / 3 : null;

      r.r1 = (r.above1) ? r.K / r.above1 : null;
      r.r3 = (r.avg3) ? r.K / r.avg3 : null;

      /* BNBC 2020 Table 6.1.4 vertical irregularity type 1a / 1b.
         Both bounds use >= consistently; the source workbook mixed a
         strict > on one branch and >= on the rest. */
      r.soft = (r.r1 !== null && r.r1 < 0.70) || (r.r3 !== null && r.r3 < 0.80);
      r.extreme = (r.r1 !== null && r.r1 < 0.60) || (r.r3 !== null && r.r3 < 0.70);
      r.verdict = r.extreme ? 'Extreme Soft' : (r.soft ? 'Soft Storey' : 'Regular');
    });

    const softCount = lv.filter(r => r.soft).length;
    const extremeCount = lv.filter(r => r.extreme).length;
    const status = extremeCount ? 'FAIL' : (softCount ? 'FAIL' : 'PASS');

    if (extremeCount) warnings.push(extremeCount + ' storey(s) classified as EXTREME soft storey. BNBC prohibits this irregularity in Seismic Design Category D and above.');
    else if (softCount) warnings.push(softCount + ' storey(s) classified as soft storey. A dynamic analysis is required.');

    const rows = lv.map((r, i) => ([
      String(i + 1), r.name || ('Level ' + (i + 1)), fx(r.K, 4),
      r.r1 !== null ? fx(r.r1, 4) : '—',
      r.avg3 !== null ? fx(r.avg3, 4) : '—',
      r.r3 !== null ? fx(r.r3, 4) : '—',
      r.verdict
    ]));

    return {
      status,
      headline: softCount ? (extremeCount + ' extreme / ' + softCount + ' soft storey(s) detected') : 'No stiffness irregularity — all storeys regular',
      results: [
        { label: 'Levels Assessed', value: String(lv.length) },
        { label: 'Soft Storey Threshold vs storey above', value: '< 0.70' },
        { label: 'Soft Storey Threshold vs avg of 3 above', value: '< 0.80' },
        { label: 'Extreme Threshold vs storey above', value: '< 0.60' },
        { label: 'Extreme Threshold vs avg of 3 above', value: '< 0.70' },
        { label: 'Soft Storeys Found', value: String(softCount), flag: softCount ? 'fail' : 'pass' },
        { label: 'Extreme Soft Storeys Found', value: String(extremeCount), flag: extremeCount ? 'fail' : 'pass' }
      ],
      steps: [
        {
          n: 1, title: 'Stiffness Ratio against the Storey Above', status: pass(!softCount),
          formula: 'r₁ = Ki / Ki₊₁',
          sub: 'Soft storey when r₁ < 0.70.\nExtreme soft storey when r₁ < 0.60.',
          res: softCount ? 'Irregularity detected' : 'All ratios ≥ 0.70'
        },
        {
          n: 2, title: 'Stiffness Ratio against the Average of Three Above', status: pass(!softCount),
          formula: 'Kmi = (Ki₊₁ + Ki₊₂ + Ki₊₃) / 3\nr₃ = Ki / Kmi',
          sub: 'Soft storey when r₃ < 0.80.\nExtreme soft storey when r₃ < 0.70.\nThe top three levels have no three-storey average and are reported as —.',
          res: softCount ? 'Irregularity detected' : 'All ratios ≥ 0.80'
        },
        {
          n: 3, title: 'Classification', status: pass(status === 'PASS'),
          formula: 'BNBC 2020 Table 6.1.4, vertical irregularity types 1a and 1b',
          sub: 'Soft storeys: ' + softCount + '\nExtreme soft storeys: ' + extremeCount,
          res: status === 'PASS' ? 'Structure is regular in stiffness' : 'Stiffness irregularity present'
        }
      ],
      warnings,
      table: {
        title: 'Storey Stiffness Irregularity (levels entered top first)',
        headers: ['#', 'Level', 'Ki', 'Ki/Ki₊₁', 'Kmi (avg 3 above)', 'Ki/Kmi', 'Classification'],
        rows, foot: null
      },
      raw: { levels: lv, softCount, extremeCount }
    };
  }

  /* =====================================================================
     B5 — TORSIONAL IRREGULARITY
     Source workbook: B5-Torsional-Irregularity
     ===================================================================== */
  function torsionalIrregularity(inp) {
    const warnings = [];
    const cases = (inp.cases || []).filter(c => num(c.dmax, 0) > 0);

    cases.forEach(c => {
      c.dmaxV = num(c.dmax, 0);
      c.dminV = num(c.dmin, 0);
      c.davg = (c.dmaxV + c.dminV) / 2;
      c.ratio = c.davg > 0 ? c.dmaxV / c.davg : 0;
      /* BNBC 2020 Table 6.1.5 horizontal irregularity 1a / 1b.
         Irregular when ratio > 1.2, extreme when ratio > 1.4. The
         boundary at exactly 1.4 stays "Irregular". */
      if (c.ratio > 1.4) c.verdict = 'Extreme Irregular';
      else if (c.ratio > 1.2) c.verdict = 'Irregular';
      else c.verdict = 'Regular';
    });

    const irr = cases.filter(c => c.ratio > 1.2).length;
    const ext = cases.filter(c => c.ratio > 1.4).length;
    const peak = cases.reduce((a, c) => Math.max(a, c.ratio), 0);
    const status = irr ? 'FAIL' : 'PASS';

    if (ext) warnings.push(ext + ' load case(s) show EXTREME torsional irregularity (Δmax/Δavg > 1.4).');
    else if (irr) warnings.push(irr + ' load case(s) show torsional irregularity (Δmax/Δavg > 1.2). Amplify the accidental torsion with Ax.');

    /* Accidental torsion amplification factor Ax, BNBC Eq 6.2.43 */
    const Ax = Math.min(3.0, Math.max(1.0, Math.pow(peak / 1.2, 2)));

    const rows = cases.map((c, i) => ([
      String(i + 1), c.name || ('Case ' + (i + 1)), c.dir || '—',
      fx(c.dmaxV, 5), fx(c.dminV, 5), fx(c.davg, 5), fx(c.ratio, 4), c.verdict
    ]));

    return {
      status,
      headline: 'Peak Δmax/Δavg = ' + fx(peak, 4) + ' — ' + (ext ? 'EXTREME TORSIONAL IRREGULARITY' : (irr ? 'TORSIONAL IRREGULARITY' : 'REGULAR')),
      results: [
        { label: 'Load Cases Assessed', value: String(cases.length) },
        { label: 'Peak Δmax/Δavg', value: fx(peak, 4), flag: peak > 1.2 ? 'fail' : 'pass' },
        { label: 'Irregular Threshold', value: '> 1.20' },
        { label: 'Extreme Threshold', value: '> 1.40' },
        { label: 'Irregular Cases', value: String(irr), flag: irr ? 'fail' : 'pass' },
        { label: 'Extreme Cases', value: String(ext), flag: ext ? 'fail' : 'pass' },
        { label: 'Torsional Amplification Ax', value: fx(Ax, 4) }
      ],
      steps: [
        {
          n: 1, title: 'Average Storey Drift', status: 'pass',
          formula: 'Δavg = (Δmax + Δmin) / 2',
          sub: 'Both edge drifts must be taken from the same load case including accidental torsion.',
          res: 'See the case table'
        },
        {
          n: 2, title: 'Torsional Irregularity Ratio', status: pass(!irr),
          formula: 'ratio = Δmax / Δavg\nratio > 1.2 → torsional irregularity (type 1a)\nratio > 1.4 → extreme torsional irregularity (type 1b)',
          sub: 'Peak ratio across all cases = ' + fx(peak, 4),
          res: ext ? 'Extreme irregular' : (irr ? 'Irregular' : 'Regular')
        },
        {
          n: 3, title: 'Accidental Torsion Amplification', status: 'pass',
          formula: 'Ax = (Δmax / (1.2 Δavg))²,   1.0 ≤ Ax ≤ 3.0        (BNBC Eq 6.2.43)',
          sub: 'Applies when a torsional irregularity exists.\nAx = (' + fx(peak, 4) + ' / 1.2)²',
          res: 'Ax = ' + fx(Ax, 4)
        }
      ],
      warnings,
      table: {
        title: 'Torsional Irregularity by Load Case',
        headers: ['#', 'Load Case', 'Dir', 'Δmax', 'Δmin', 'Δavg', 'Δmax/Δavg', 'Classification'],
        rows, foot: null
      },
      raw: { cases, peak, irr, ext, Ax }
    };
  }

  /* =====================================================================
     B7 — OVERTURNING MOMENT STABILITY
     Source workbook: B7-Overturning-Moment-Check
     ===================================================================== */
  function overturningCheck(inp) {
    const warnings = [];
    /* inputMode 'force' : each row carries the storey FORCE Fx
       inputMode 'shear' : each row carries the storey SHEAR Vx
       Both reduce to the same overturning moment when handled correctly.
       The source workbook multiplied a storey SHEAR profile by the
       cumulative elevation, which double counts the lower storeys. */
    const mode = inp.inputMode || 'force';
    const lv = (inp.levels || []).filter(r => num(r.h, 0) > 0);

    let cum = 0;
    lv.forEach(r => { r.hsx = num(r.h, 0); cum += r.hsx; r.elev = cum; r.val = Math.abs(num(r.f, 0)); });

    let OTM = 0;
    if (mode === 'force') {
      lv.forEach(r => { r.contrib = r.val * r.elev; OTM += r.contrib; });
    } else {
      lv.forEach(r => { r.contrib = r.val * r.hsx; OTM += r.contrib; });
    }

    const Wt = num(inp.weight, 0);
    const dlFactor = num(inp.dlFactor, 0.9);   // 0.9D + 1.0E per BNBC combination 7
    const arm = num(inp.arm, 0);
    const MR = Wt * dlFactor * arm;
    const FS = OTM > 0 ? MR / OTM : 0;
    const FSreq = num(inp.FSreq, 1.5);
    const ok = FS >= FSreq;

    if (!ok) warnings.push('Factor of safety against overturning is below ' + fx(FSreq, 2) + '. Increase the base width or add hold-down capacity.');
    if (dlFactor > 0.9) warnings.push('A dead load factor above 0.9 is unconservative for an overturning check — BNBC combination 7 uses 0.9D with the seismic case.');

    const rows = lv.map((r, i) => ([
      String(i + 1), r.name || ('Level ' + (i + 1)), fx(r.hsx, 2), fx(r.elev, 2),
      fx(r.val, 3), fx(r.contrib, 2)
    ]));

    return {
      status: ok ? 'PASS' : 'FAIL',
      headline: 'FS = MR / OTM = ' + fx(MR, 1) + ' / ' + fx(OTM, 1) + ' = ' + fx(FS, 4) + (ok ? '  ≥ ' : '  < ') + fx(FSreq, 2),
      results: [
        { label: 'Input Mode', value: mode === 'force' ? 'Storey forces Fx' : 'Storey shears Vx' },
        { label: 'Overturning Moment (OTM)', value: fx(OTM, 2), unit: 'kN·m' },
        { label: 'Building Weight', value: fx(Wt, 2), unit: 'kN' },
        { label: 'Dead Load Factor', value: fx(dlFactor, 2) },
        { label: 'Resisting Lever Arm', value: fx(arm, 3), unit: 'm' },
        { label: 'Resisting Moment (MR)', value: fx(MR, 2), unit: 'kN·m' },
        { label: 'Factor of Safety', value: fx(FS, 4), flag: ok ? 'pass' : 'fail' },
        { label: 'Required Factor of Safety', value: fx(FSreq, 2) },
        { label: 'Verdict', value: ok ? 'STABLE' : 'UNSTABLE', flag: ok ? 'pass' : 'fail' }
      ],
      steps: [
        {
          n: 1, title: 'Overturning Moment', status: 'pass',
          formula: mode === 'force'
            ? 'OTM = Σ Fx · hx        (storey force × elevation above base)'
            : 'OTM = Σ Vx · hsx       (storey shear × storey height)',
          sub: mode === 'force'
            ? 'Each storey FORCE acts at its own elevation above the base.'
            : 'Each storey SHEAR acts over its own storey height. Multiplying a shear\nprofile by the cumulative elevation would count the lower storeys repeatedly.',
          res: 'OTM = ' + fx(OTM, 2) + ' kN·m'
        },
        {
          n: 2, title: 'Resisting Moment', status: 'pass',
          formula: 'MR = γD · W · d        with γD = 0.9 for BNBC combination 7',
          sub: 'W = ' + fx(Wt, 2) + ' kN,  γD = ' + fx(dlFactor, 2) + ',  lever arm d = ' + fx(arm, 3) + ' m\nThe lever arm is the horizontal distance from the overturning edge to the centre of mass.',
          res: 'MR = ' + fx(MR, 2) + ' kN·m'
        },
        {
          n: 3, title: 'Stability Check', status: pass(ok),
          formula: 'FS = MR / OTM ≥ ' + fx(FSreq, 2),
          sub: 'FS = ' + fx(MR, 2) + ' / ' + fx(OTM, 2),
          res: 'FS = ' + fx(FS, 4) + (ok ? '  — STABLE ✓' : '  — UNSTABLE ✗')
        }
      ],
      warnings,
      table: {
        title: 'Overturning Moment Build-up',
        headers: ['#', 'Level', 'Storey Ht (m)', 'Elevation (m)', mode === 'force' ? 'Fx (kN)' : 'Vx (kN)', 'Moment (kN·m)'],
        rows,
        foot: ['', 'TOTAL', '', fx(cum, 2), '', fx(OTM, 2)]
      },
      raw: { OTM, MR, FS, FSreq, ok, levels: lv }
    };
  }

  return {
    seismicStatic, windLoad, verticalSeismic,
    pDeltaCheck, baseShearCheck, driftCheck,
    softStorey, torsionalIrregularity, overturningCheck,
    _util: { num, fx }
  };
})();

if (typeof window !== 'undefined') window.BNBCCalc = BNBCCalc;
if (typeof module !== 'undefined' && module.exports) module.exports = BNBCCalc;
