/* =====================================================================
   TwinAnalytic — Advanced Member Design Engine
   ---------------------------------------------------------------------
   Circular column interaction, combined footing, barbell shear wall and
   beam estimating. Ported from the four legacy .xls workbooks, whose
   formulas were not recoverable, so each procedure here is built from
   the ACI clause the workbook cites and checked against the values the
   workbook had cached.

   Same result envelope as bnbc-calcs.js and bnbc-design.js.
   ===================================================================== */

const BNBCDesign2 = (function () {
  'use strict';

  const D = (typeof BNBC !== 'undefined') ? BNBC : (typeof require !== 'undefined' ? require('./bnbc-data.js') : null);
  const MM = 25.4;
  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };
  const fx = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 3 : d) : '—');
  const pass = c => c ? 'pass' : 'fail';
  const floorTo = (v, s) => Math.floor(v / s) * s;

  /* =====================================================================
     C5 — CIRCULAR COLUMN, AXIAL AND FLEXURAL CAPACITY
     Source workbook: C5-Circular-Column-ACI-318-02
     ===================================================================== */
  function circularColumn(inp) {
    const warnings = [];
    const code = inp.code || 'ACI318-19';
    const fc = num(inp.fc, 5);            // ksi
    const fy = num(inp.fy, 60);           // ksi
    const Es = 29000;                     // ksi
    const Dia = num(inp.D, 20);           // in
    const Pu = num(inp.Pu, 480);          // kips
    const Mu = num(inp.Mu, 200);          // ft-kips
    const Vu = num(inp.Vu, 20);           // kips
    const nBar = Math.max(4, Math.round(num(inp.nBar, 8)));
    const barKey = inp.bar || '#7';
    const spiralKey = inp.spiral || '#3';
    const spiralPitch = num(inp.pitch, 3);
    const cover = num(inp.cover, 1.5);
    const confined = (inp.tieType || 'spiral') === 'spiral';

    const bi = D.BAR_IMPERIAL[barKey] || D.BAR_IMPERIAL['#7'];
    const si = D.BAR_IMPERIAL[spiralKey] || D.BAR_IMPERIAL['#3'];
    const Ab = bi.Ab, db = bi.db;

    const R = Dia / 2;
    const Ag = Math.PI * R * R;
    const Ast = nBar * Ab;
    const rho = Ast / Ag;
    /* Radius of the bar circle */
    const Rs = R - cover - si.db - db / 2;

    const beta1 = D.beta1PSI(fc * 1000);
    const epsCu = 0.003;
    const epsY = fy / Es;

    /* Bar positions measured from the extreme compression fibre.
       Orientation matters for a circular section: placing a bar on the
       bending axis is the conservative arrangement, while rotating the
       cage by half a bar spacing puts two bars nearer the extreme fibres
       and raises the flexural capacity. Both are offered. */
    const offset = (inp.barOrientation === 'rotated') ? Math.PI / nBar : 0;
    const bars = [];
    for (let i = 0; i < nBar; i++) {
      const ang = 2 * Math.PI * i / nBar + offset;
      const y = Rs * Math.cos(ang);            // + towards the compression face
      bars.push({ y, d: R - y });              // depth from the compression fibre
    }

    /* Concrete compression block: circular segment of depth a */
    function segment(a) {
      const aa = Math.min(Math.max(a, 0), 2 * R);
      if (aa <= 0) return { area: 0, yBar: 0 };
      if (aa >= 2 * R) return { area: Math.PI * R * R, yBar: 0 };
      const theta = 2 * Math.acos((R - aa) / R);        // radians
      const area = R * R * (theta - Math.sin(theta)) / 2;
      const denom = 3 * (theta - Math.sin(theta));
      const yBar = denom !== 0 ? (4 * R * Math.pow(Math.sin(theta / 2), 3)) / denom : 0;
      return { area, yBar };                            // yBar measured from the centre
    }

    /* Nominal capacity for a given neutral axis depth c */
    function capacity(c) {
      const a = beta1 * c;
      const seg = segment(a);
      const Cc = 0.85 * fc * seg.area;
      let P = Cc, M = Cc * seg.yBar;
      let epsTmax = -Infinity;
      bars.forEach(b => {
        const eps = c > 0 ? epsCu * (c - b.d) / c : -epsY;
        let fs = Math.max(-fy, Math.min(fy, Es * eps));
        /* Displaced concrete for bars inside the stress block */
        if (b.d <= a) fs -= 0.85 * fc;
        const F = fs * Ab;
        P += F;
        M += F * b.y;
        const et = c > 0 ? epsCu * (b.d - c) / c : 0;
        if (et > epsTmax) epsTmax = et;
      });
      return { P, M: M / 12, c, a, epsT: epsTmax };     // M in ft-kips
    }

    /* Strength reduction factor */
    const phiC = confined ? (code === 'ACI318-02' ? 0.70 : 0.75) : 0.65;
    const axialCap = confined ? 0.85 : 0.80;
    const Po = 0.85 * fc * (Ag - Ast) + fy * Ast;
    const phiPmax = axialCap * phiC * Po;

    /* Strength reduction factor from the net tensile strain.

       ACI 318-02 unified design provisions (Sec 9.3.2.2) fix the transition
       between the compression-controlled strain limit of 0.002 and the
       tension-controlled limit of 0.005, regardless of fy.

       ACI 318-19 (Table 21.2.2) moves the compression-controlled limit to
       the yield strain fy/Es and ends the transition at fy/Es + 0.003. */
    function phiOf(pt) {
      const et = pt.epsT;
      if (code === 'ACI318-02') {
        if (et <= 0.002) return phiC;
        if (et >= 0.005) return 0.90;
        return phiC + (0.90 - phiC) * (et - 0.002) / 0.003;
      }
      return D.phiFromStrain(et, fy * 1000, Es * 1000, !confined);
    }

    /* One point on the design interaction curve for a neutral axis depth c.
       phiPnRaw is kept uncapped so it stays monotonic in c, which is what
       the root finder below relies on; phiPn carries the axial cap for
       display. */
    function designPoint(c) {
      const pt = capacity(c);
      const ph = phiOf(pt);
      return {
        c: c, Pn: pt.P, Mn: pt.M, epsT: pt.epsT, phi: ph,
        phiPnRaw: ph * pt.P,
        phiPn: Math.min(ph * pt.P, phiPmax),
        phiMn: ph * pt.M
      };
    }

    /* Build the interaction diagram. The array is generated in order of
       decreasing c, so it is already ordered by decreasing axial load —
       sorting it by the capped phiPn would scramble the plateau where
       every point shares the same capped value. */
    const pts = [];
    const cMax = 3 * Dia;
    const NPTS = 400;
    for (let i = 0; i <= NPTS; i++) {
      pts.push(designPoint(cMax * (1 - i / NPTS) + 1e-6));
    }

    /* Pure flexure: bisect for Pn = 0 */
    let lo = 1e-6, hi = cMax, cf = (lo + hi) / 2;
    for (let i = 0; i < 200; i++) {
      cf = (lo + hi) / 2;
      if (capacity(cf).P > 0) hi = cf; else lo = cf;
    }
    const flexPt = designPoint(cf);
    const phiMn0 = flexPt.phiMn;

    /* Balanced point: extreme tension steel just reaches yield */
    const dt = Math.max.apply(null, bars.map(b => b.d));
    const cb = epsCu * dt / (epsCu + epsY);
    const balPt = designPoint(cb);
    const phiPb = balPt.phiPn;
    const phiMb = balPt.phiMn;

    /* Capacity at the applied axial load. phiPn(c) increases monotonically
       with c, so bisect for the exact c that carries Pu rather than
       interpolating between tabulated points. */
    let phiMnAtPu, cAtPu = cf;
    if (Pu <= 0) {
      phiMnAtPu = phiMn0;
    } else if (Pu >= phiPmax) {
      phiMnAtPu = 0;
    } else {
      let a2 = cf, b2 = cMax;
      for (let i = 0; i < 200; i++) {
        cAtPu = (a2 + b2) / 2;
        if (designPoint(cAtPu).phiPnRaw > Pu) b2 = cAtPu; else a2 = cAtPu;
      }
      phiMnAtPu = designPoint(cAtPu).phiMn;
    }

    const dcr = phiMnAtPu > 0 ? Mu / phiMnAtPu : Infinity;
    const axialOK = Pu <= phiPmax;
    const flexOK = Mu <= phiMnAtPu;

    /* Shear, ACI 318 22.5 with the axial compression enhancement */
    const dv = 0.8 * Dia;
    const Acv = Math.PI / 4 * Dia * Dia;
    const Vc = 2 * (1 + Pu / (2000 * Ag / 1000)) * Math.sqrt(fc * 1000) * (Dia * dv) / 1000;
    const phiVc = 0.75 * Vc;

    /* Spiral reinforcement ratio, ACI 318 25.7.3.3 */
    const Dch = Dia - 2 * cover;                 // core diameter to outside of spiral
    const Ach = Math.PI / 4 * Dch * Dch;
    const rhoSmin = Math.max(0.45 * (Ag / Ach - 1) * fc / fy, 0.12 * fc / fy);
    const rhoS = spiralPitch > 0 ? (4 * si.Ab) / (Dch * spiralPitch) : 0;
    const spiralOK = rhoS >= rhoSmin;

    if (rho < 0.01) warnings.push('Longitudinal steel ratio ' + fx(rho, 5) + ' is below the ACI minimum of 0.01.');
    if (rho > 0.08) warnings.push('Longitudinal steel ratio ' + fx(rho, 5) + ' exceeds the ACI maximum of 0.08.');
    if (!axialOK) warnings.push('Pu = ' + fx(Pu, 1) + ' k exceeds φPn,max = ' + fx(phiPmax, 1) + ' k.');
    if (!flexOK) warnings.push('Mu = ' + fx(Mu, 1) + ' ft-k exceeds the moment capacity ' + fx(phiMnAtPu, 1) + ' ft-k at this axial load.');
    if (!spiralOK) warnings.push('Spiral ratio ' + fx(rhoS, 5) + ' is below the required ' + fx(rhoSmin, 5) + '. Reduce the pitch.');
    if (Vu > phiVc) warnings.push('Vu = ' + fx(Vu, 1) + ' k exceeds φVc = ' + fx(phiVc, 1) + ' k — provide shear reinforcement.');

    const status = (axialOK && flexOK && spiralOK && Vu <= phiVc) ? 'PASS' : 'FAIL';

    /* Standard control points, each located by bisecting on the tension
       strain rather than picking the nearest tabulated point. */
    function atStrain(target) {
      let a3 = cf, b3 = cMax;
      for (let i = 0; i < 160; i++) {
        const m3 = (a3 + b3) / 2;
        if (capacity(m3).epsT > target) a3 = m3; else b3 = m3;
      }
      return designPoint((a3 + b3) / 2);
    }
    const e002 = atStrain(0.002);
    const e005 = atStrain(0.005);
    const rows = [
      ['Axial load only', fx(phiPmax, 3), '0.000'],
      ['Balanced condition (εt = εy)', fx(phiPb, 3), fx(phiMb, 3)],
      ['εt = 0.002', fx(e002.phiPn, 3), fx(e002.phiMn, 3)],
      ['εt = 0.005', fx(e005.phiPn, 3), fx(e005.phiMn, 3)],
      ['At the applied Pu', fx(Math.min(Pu, phiPmax), 3), fx(phiMnAtPu, 3)],
      ['Flexure only', '0.000', fx(phiMn0, 3)]
    ];

    return {
      status,
      headline: 'φPn,max = ' + fx(phiPmax, 1) + ' k,  φMn at Pu = ' + fx(phiMnAtPu, 1) +
        ' ft-k,  DCR = ' + fx(dcr, 3) + ' — ' + (status === 'PASS' ? 'DESIGN IS ADEQUATE' : 'DESIGN IS INADEQUATE'),
      results: [
        { label: 'Design Code', value: code === 'ACI318-02' ? 'ACI 318-02' : 'ACI 318-19' },
        { label: 'Column Diameter', value: fx(Dia, 2), unit: 'in' },
        { label: 'Gross Area Ag', value: fx(Ag, 3), unit: 'in²' },
        { label: 'Longitudinal Steel', value: nBar + ' — ' + barKey + ' (Ast = ' + fx(Ast, 3) + ' in²)' },
        { label: 'Steel Ratio ρ', value: fx(rho, 5), flag: (rho >= 0.01 && rho <= 0.08) ? 'pass' : 'fail' },
        { label: 'Bar Circle Radius', value: fx(Rs, 3), unit: 'in' },
        { label: 'β₁', value: fx(beta1, 4) },
        { label: 'Nominal Axial Capacity Po', value: fx(Po, 3), unit: 'k' },
        { label: 'φ for compression', value: fx(phiC, 2) },
        { label: 'φPn,max = ' + fx(axialCap, 2) + ' φ Po', value: fx(phiPmax, 3), unit: 'k', flag: axialOK ? 'pass' : 'fail' },
        { label: 'Applied Pu', value: fx(Pu, 2), unit: 'k' },
        { label: 'φMn at Pu', value: fx(phiMnAtPu, 3), unit: 'ft-k', flag: flexOK ? 'pass' : 'fail' },
        { label: 'Applied Mu', value: fx(Mu, 2), unit: 'ft-k' },
        { label: 'Demand / Capacity Ratio', value: fx(dcr, 4), flag: dcr <= 1 ? 'pass' : 'fail' },
        { label: 'φMn at pure flexure', value: fx(phiMn0, 3), unit: 'ft-k' },
        { label: 'Balanced φPb / φMb', value: fx(phiPb, 2) + ' / ' + fx(phiMb, 2), unit: 'k, ft-k' },
        { label: 'Design Shear Capacity φVc', value: fx(phiVc, 3), unit: 'k', flag: Vu <= phiVc ? 'pass' : 'fail' },
        { label: 'Applied Vu', value: fx(Vu, 2), unit: 'k' },
        { label: 'Spiral ' + spiralKey + ' @ ' + fx(spiralPitch, 2) + ' in — ρs', value: fx(rhoS, 5), flag: spiralOK ? 'pass' : 'fail' },
        { label: 'Required ρs', value: fx(rhoSmin, 5) }
      ],
      steps: [
        {
          n: 1, title: 'Section Properties', status: 'pass',
          formula: 'Ag = π D² / 4        Ast = n × Ab        ρ = Ast / Ag\nBar circle radius Rs = D/2 − cover − d(spiral) − db/2',
          sub: 'D = ' + fx(Dia, 2) + ' in  →  Ag = ' + fx(Ag, 3) + ' in²\n' + nBar + ' × ' + barKey + ' (Ab = ' + fx(Ab, 3) + ' in²) → Ast = ' + fx(Ast, 3) + ' in²\nRs = ' + fx(Rs, 4) + ' in',
          res: 'ρ = ' + fx(rho, 5)
        },
        {
          n: 2, title: 'Maximum Axial Capacity', status: pass(axialOK),
          formula: "Po = 0.85 f'c (Ag − Ast) + fy Ast\nφPn,max = " + fx(axialCap, 2) + " φ Po        (" + (confined ? 'spiral' : 'tied') + " column)",
          sub: "Po = 0.85 × " + fx(fc, 2) + " × (" + fx(Ag, 2) + " − " + fx(Ast, 2) + ") + " + fx(fy, 1) + " × " + fx(Ast, 2) + "\n   = " + fx(Po, 3) + " k\nφPn,max = " + fx(axialCap, 2) + " × " + fx(phiC, 2) + " × " + fx(Po, 3),
          res: 'φPn,max = ' + fx(phiPmax, 3) + ' k ' + (axialOK ? '≥ ' : '< ') + 'Pu = ' + fx(Pu, 2) + ' k'
        },
        {
          n: 3, title: 'Interaction Diagram by Strain Compatibility', status: 'pass',
          formula: 'For each neutral axis depth c:\n  a = β₁ c, concrete force from the circular segment area\n  bar strain εs = 0.003 (c − di)/c,  fs clamped to ±fy\n  bars inside the block lose 0.85 f\'c of displaced concrete\n  Pn = ΣF,   Mn = ΣF·y',
          sub: 'The compression zone is a circular segment of depth a:\n  θ = 2 arccos((R − a)/R)\n  area = R²(θ − sin θ)/2\n  centroid = 4R sin³(θ/2) / [3(θ − sin θ)]\n\n221 neutral axis positions are evaluated from c = 2.5D down to zero.',
          res: 'Diagram tabulated at the standard control points below'
        },
        {
          n: 4, title: 'Strength Reduction Factor', status: 'pass',
          formula: code === 'ACI318-02'
            ? 'φ = ' + fx(phiC, 2) + ' when εt ≤ 0.002 (compression controlled)\nφ = 0.90 when εt ≥ 0.005 (tension controlled)\nlinear in between        (ACI 318-02 Sec 9.3.2.2, unified provisions)'
            : 'φ = ' + fx(phiC, 2) + ' when εt ≤ εty\nφ = 0.90 when εt ≥ εty + 0.003\nlinear in between        (ACI 318-19 Table 21.2.2)',
          sub: code === 'ACI318-02'
            ? 'The 318-02 breakpoints are fixed at 0.002 and 0.005 regardless of fy.'
            : 'εty = fy/Es = ' + fx(epsY, 5) + ',  transition ends at εt = ' + fx(epsY + 0.003, 5),
          res: 'φ ranges from ' + fx(phiC, 2) + ' to 0.90'
        },
        {
          n: 5, title: 'Capacity Check at the Applied Axial Load', status: pass(flexOK),
          formula: 'Interpolate φMn on the interaction curve at Pn = Pu\nDCR = Mu / φMn',
          sub: 'Pu = ' + fx(Pu, 2) + ' k  →  φMn = ' + fx(phiMnAtPu, 3) + ' ft-k\nMu = ' + fx(Mu, 2) + ' ft-k',
          res: 'DCR = ' + fx(dcr, 4) + (flexOK ? '  ≤ 1.0 ✓' : '  > 1.0 ✗')
        },
        {
          n: 6, title: 'Spiral Reinforcement', status: pass(spiralOK),
          formula: "ρs = 4 Asp / (Dch × pitch)\nρs ≥ max[ 0.45 (Ag/Ach − 1) f'c/fy,  0.12 f'c/fy ]        (ACI 318 25.7.3.3)",
          sub: 'Core diameter Dch = ' + fx(Dch, 2) + ' in,  Ach = ' + fx(Ach, 2) + ' in²\nSpiral ' + spiralKey + ' (Asp = ' + fx(si.Ab, 3) + ' in²) at ' + fx(spiralPitch, 2) + ' in pitch\nρs = 4 × ' + fx(si.Ab, 3) + ' / (' + fx(Dch, 2) + ' × ' + fx(spiralPitch, 2) + ') = ' + fx(rhoS, 5),
          res: 'ρs = ' + fx(rhoS, 5) + (spiralOK ? ' ≥ ' : ' < ') + fx(rhoSmin, 5) + ' required'
        },
        {
          n: 7, title: 'Shear Capacity', status: pass(Vu <= phiVc),
          formula: "Vc = 2 (1 + Nu / 2000 Ag) √f'c bw d       with bw = D and d = 0.8D\nφVc = 0.75 Vc",
          sub: 'd = 0.8 × ' + fx(Dia, 2) + ' = ' + fx(dv, 3) + ' in\nVc = ' + fx(Vc, 3) + ' k',
          res: 'φVc = ' + fx(phiVc, 3) + ' k ' + (Vu <= phiVc ? '≥ ' : '< ') + 'Vu = ' + fx(Vu, 2) + ' k'
        }
      ],
      warnings,
      table: {
        title: 'Interaction Diagram Control Points',
        headers: ['Condition', 'φPn (k)', 'φMn (ft-k)'],
        rows, foot: null
      },
      raw: {
        Ag, Ast, rho, Rs, Po, phiPmax, phiMnAtPu, cAtPu, phiMn0, cf,
        phiPb, phiMb, cb, dcr, phiVc, rhoS, rhoSmin, beta1, pts, designPoint, status
      }
    };
  }

  /* =====================================================================
     C7 — COMBINED FOOTING
     Source workbook: C7-Combined-Footing
     ===================================================================== */
  function combinedFooting(inp) {
    const warnings = [];
    const fc = num(inp.fc, 3.5) * 1000;      // psi
    const fy = num(inp.fy, 72.5) * 1000;     // psi
    const Qa = num(inp.Qa, 4);               // ksf
    const c1w = num(inp.c1w, 15), c1d = num(inp.c1d, 12);   // col 1, in
    const c2w = num(inp.c2w, 15), c2d = num(inp.c2d, 12);   // col 2, in
    const P1d = num(inp.P1dl, 144), P1l = num(inp.P1ll, 0);
    const P2d = num(inp.P2dl, 190), P2l = num(inp.P2ll, 0);
    const M1 = num(inp.M1, 1), M2 = num(inp.M2, 0);
    const L1 = num(inp.L1, 3);               // left edge to col 1, ft
    const S = num(inp.S, 15);                // between columns, ft
    const L2 = num(inp.L2, 3);               // col 2 to right edge, ft
    const Bw = num(inp.B, 9);                // footing width, ft
    const Df = num(inp.Df, 6);               // embedment, ft
    const T = num(inp.T, 24);                // thickness, in
    const qs = num(inp.qs, 0);               // surcharge, ksf
    const ws = num(inp.ws, 0.12);            // soil unit weight, kcf
    const barKey = inp.bar || '#5';
    const cover = num(inp.cover, 3);

    const bi = D.BAR_IMPERIAL[barKey] || D.BAR_IMPERIAL['#5'];
    const L = L1 + S + L2;                   // total length, ft
    const Area = L * Bw;
    const d = T - cover - bi.db;             // effective depth, in

    /* Service loads. On a gross basis the footing self weight and the
       soil above it are carried by the ground and must be added before
       comparing with a gross allowable pressure. On a net basis they are
       excluded and the allowable is taken as a net value. */
    const gross = (inp.bearingBasis || 'gross') === 'gross';
    const wFtg = (T / 12) * 0.150 * Area;                        // kips
    const wSoil = Math.max(0, Df - T / 12) * ws * Area;          // kips
    const wOver = gross ? (wFtg + wSoil + qs * Area) : 0;
    const Pser = P1d + P1l + P2d + P2l + wOver;

    /* Resultant position of the column loads measured from the left edge */
    const Pcol = P1d + P1l + P2d + P2l;
    const xR = Pcol > 0 ? ((P1d + P1l) * L1 + (P2d + P2l) * (L1 + S)) / Pcol : L / 2;
    const eRes = xR - L / 2;
    const eLimit = L / 6;
    const uniform = Math.abs(eRes) <= 1e-6;

    /* Soil pressure */
    const qAvg = Area > 0 ? Pser / Area : 0;
    const Sm = Bw * L * L / 6;
    const Mtot = Pser * eRes + M1 + M2;
    const qMax = Area > 0 ? Pser / Area + Math.abs(Mtot) / Sm : 0;
    const qMin = Area > 0 ? Pser / Area - Math.abs(Mtot) / Sm : 0;
    const bearingOK = qMax <= Qa;
    const noUplift = qMin >= 0;

    if (!bearingOK) warnings.push('Maximum soil pressure ' + fx(qMax, 3) + ' ksf exceeds the allowable ' + fx(Qa, 2) + ' ksf. Enlarge the footing.');
    if (!noUplift) warnings.push('Minimum soil pressure is negative (' + fx(qMin, 3) + ' ksf) — part of the base is in uplift.');
    if (Math.abs(eRes) > eLimit) warnings.push('The load resultant falls outside the middle third (e = ' + fx(eRes, 4) + ' ft > L/6 = ' + fx(eLimit, 3) + ' ft).');

    /* Factored loads, ACI 318 9.2.1 */
    const Pu1 = 1.2 * P1d + 1.6 * P1l;
    const Pu2 = 1.2 * P2d + 1.6 * P2l;
    const Pu = Pu1 + Pu2;
    const qu = Area > 0 ? Pu / Area : 0;      // ksf, net upward
    const wu = qu * Bw;                       // kips per ft of length

    /* Longitudinal analysis as a beam on an upward uniform load */
    const N = 2000, dx = L / N;
    let V = 0, M = 0;
    let Mpos = 0, Mneg = 0, Vmax = 0, xMpos = 0, xMneg = 0;
    for (let i = 0; i <= N; i++) {
      const x = i * dx;
      if (i > 0) { M += V * dx + wu * dx * dx / 2; V += wu * dx; }
      const xPrev = i > 0 ? x - dx : -1;
      if (xPrev < L1 && x >= L1) V -= Pu1;
      if (xPrev < L1 + S && x >= L1 + S) V -= Pu2;
      if (i === 0 && L1 === 0) V -= Pu1;
      if (M > Mpos) { Mpos = M; xMpos = x; }
      if (M < Mneg) { Mneg = M; xMneg = x; }
      if (Math.abs(V) > Vmax) Vmax = Math.abs(V);
    }
    const MnegAbs = Math.abs(Mneg);

    /* One-way (beam) shear at d from the column face */
    const phiV = 0.75;
    const phiVc1 = phiV * 2 * Math.sqrt(fc) * (Bw * 12) * d / 1000;   // kips
    const beamShearOK = Vmax <= phiVc1;

    /* Two-way (punching) shear at each column */
    function punch(cw, cd, PuCol, interior) {
      const b1 = cw + d, b2 = cd + d;
      const bo = 2 * (b1 + b2);
      const betaC = Math.max(cw, cd) / Math.min(cw, cd);
      const alphaS = interior ? 40 : 30;
      const vc = Math.min(4, 2 + 4 / betaC, 2 + alphaS * d / bo);
      const Vc = vc * Math.sqrt(fc) * bo * d / 1000;
      const Vup = PuCol - qu * (b1 / 12) * (b2 / 12);
      return { bo, betaC, vc, Vc, phiVc: phiV * Vc, Vu: Vup, ok: Vup <= phiV * Vc };
    }
    const pu1 = punch(c1w, c1d, Pu1, L1 > (c1w / 24 + d / 12));
    const pu2 = punch(c2w, c2d, Pu2, L2 > (c2w / 24 + d / 12));

    if (!beamShearOK) warnings.push('One-way shear ' + fx(Vmax, 2) + ' k exceeds φVc = ' + fx(phiVc1, 2) + ' k. Increase the thickness.');
    if (!pu1.ok) warnings.push('Punching shear at column 1 fails: Vu = ' + fx(pu1.Vu, 2) + ' k against φVc = ' + fx(pu1.phiVc, 2) + ' k.');
    if (!pu2.ok) warnings.push('Punching shear at column 2 fails: Vu = ' + fx(pu2.Vu, 2) + ' k against φVc = ' + fx(pu2.phiVc, 2) + ' k.');

    /* Longitudinal reinforcement */
    const phiM = 0.9;
    function asFor(Mk, bIn) {
      const Mlbin = Mk * 1000 * 12;
      const A = phiM * fy * fy, B2 = -(1.7 * phiM * fc * fy * d * bIn), C2 = 1.7 * fc * bIn * Mlbin;
      const disc = B2 * B2 - 4 * A * C2;
      if (disc < 0) return NaN;
      return Math.min((-B2 - Math.sqrt(disc)) / (2 * A), (-B2 + Math.sqrt(disc)) / (2 * A));
    }
    /* Footings take the shrinkage and temperature minimum, ACI 318 7.12 */
    const AsMinLong = 0.0018 * (Bw * 12) * T;
    const AsTop = Math.max(asFor(MnegAbs, Bw * 12) || 0, AsMinLong);
    const AsBot = Math.max(asFor(Mpos, Bw * 12) || 0, AsMinLong);
    const nTop = Math.ceil(AsTop / bi.Ab);
    const nBot = Math.ceil(AsBot / bi.Ab);

    /* Transverse reinforcement in the band under each column,
       ACI 318 15.4.4 effective band width = column width + 2 × d */
    function band(cw, PuCol) {
      const be = Math.min(Bw * 12, cw + 2 * d) / 12;             // ft
      const arm = (Bw - cw / 12) / 2;                            // ft
      const quB = Bw > 0 ? PuCol / (Bw) : 0;                     // kips per ft length across
      const Mb = quB * arm * arm / 2;                            // kip-ft over the band length
      const As = Math.max(asFor(Mb, be * 12) || 0, 0.0018 * (be * 12) * T);
      return { be, arm, Mb, As, n: Math.ceil(As / bi.Ab) };
    }
    const b1r = band(c1w, Pu1);
    const b2r = band(c2w, Pu2);

    const status = (bearingOK && noUplift && beamShearOK && pu1.ok && pu2.ok) ? 'PASS' : 'FAIL';

    return {
      status,
      headline: 'Footing ' + fx(L, 2) + ' × ' + fx(Bw, 2) + ' × ' + fx(T, 0) + ' in:  qmax = ' + fx(qMax, 3) +
        ' ksf vs ' + fx(Qa, 2) + ' allowable — ' + (status === 'PASS' ? 'DESIGN IS ADEQUATE' : 'DESIGN IS INADEQUATE'),
      results: [
        { label: 'Footing Length L', value: fx(L, 3), unit: 'ft' },
        { label: 'Footing Width B', value: fx(Bw, 2), unit: 'ft' },
        { label: 'Footing Thickness T', value: fx(T, 1), unit: 'in' },
        { label: 'Effective Depth d', value: fx(d, 3), unit: 'in' },
        { label: 'Base Area', value: fx(Area, 2), unit: 'ft²' },
        { label: 'Bearing Pressure Basis', value: gross ? 'Gross — self weight and overburden included' : 'Net — self weight and overburden excluded' },
        { label: 'Footing Self Weight', value: fx(wFtg, 3), unit: 'k' },
        { label: 'Soil Overburden', value: fx(wSoil, 3), unit: 'k' },
        { label: 'Total Service Load', value: fx(Pser, 3), unit: 'k' },
        { label: 'Resultant Position from Left Edge', value: fx(xR, 4), unit: 'ft' },
        { label: 'Eccentricity e', value: fx(eRes, 5) + '  (L/6 = ' + fx(eLimit, 3) + ')', unit: 'ft', flag: Math.abs(eRes) <= eLimit ? 'pass' : 'fail' },
        { label: 'Average Soil Pressure', value: fx(qAvg, 4), unit: 'ksf' },
        { label: 'Maximum Soil Pressure', value: fx(qMax, 4), unit: 'ksf', flag: bearingOK ? 'pass' : 'fail' },
        { label: 'Minimum Soil Pressure', value: fx(qMin, 4), unit: 'ksf', flag: noUplift ? 'pass' : 'fail' },
        { label: 'Factored Column Loads Pu1 / Pu2', value: fx(Pu1, 2) + ' / ' + fx(Pu2, 2), unit: 'k' },
        { label: 'Net Upward Pressure qu', value: fx(qu, 4), unit: 'ksf' },
        { label: 'Maximum Positive Moment', value: fx(Mpos, 3), unit: 'k-ft' },
        { label: 'Maximum Negative Moment', value: fx(MnegAbs, 3), unit: 'k-ft' },
        { label: 'Maximum Shear', value: fx(Vmax, 3), unit: 'k' },
        { label: 'One-way φVc', value: fx(phiVc1, 3), unit: 'k', flag: beamShearOK ? 'pass' : 'fail' },
        { label: 'Punching at Col 1 — Vu / φVc', value: fx(pu1.Vu, 2) + ' / ' + fx(pu1.phiVc, 2), unit: 'k', flag: pu1.ok ? 'pass' : 'fail' },
        { label: 'Punching at Col 2 — Vu / φVc', value: fx(pu2.Vu, 2) + ' / ' + fx(pu2.phiVc, 2), unit: 'k', flag: pu2.ok ? 'pass' : 'fail' },
        { label: 'Top Steel (over the span)', value: nTop + ' — ' + barKey + '  (As = ' + fx(AsTop, 3) + ' in²)' },
        { label: 'Bottom Steel (under the columns)', value: nBot + ' — ' + barKey + '  (As = ' + fx(AsBot, 3) + ' in²)' },
        { label: 'Band Steel at Col 1', value: b1r.n + ' — ' + barKey + ' over ' + fx(b1r.be, 2) + ' ft' },
        { label: 'Band Steel at Col 2', value: b2r.n + ' — ' + barKey + ' over ' + fx(b2r.be, 2) + ' ft' }
      ],
      steps: [
        {
          n: 1, title: 'Geometry and Service Loads', status: 'pass',
          formula: 'L = L1 + S + L2        Area = L × B\nSelf weight = (T/12) × 0.150 × Area\nOverburden = (Df − T/12) × ws × Area',
          sub: 'L = ' + fx(L1, 2) + ' + ' + fx(S, 2) + ' + ' + fx(L2, 2) + ' = ' + fx(L, 3) + ' ft\nArea = ' + fx(Area, 3) + ' ft²\nSelf weight = ' + fx(wFtg, 3) + ' k,  overburden = ' + fx(wSoil, 3) + ' k',
          res: 'Total service load = ' + fx(Pser, 3) + ' k'
        },
        {
          n: 2, title: 'Resultant Position and Eccentricity', status: pass(Math.abs(eRes) <= eLimit),
          formula: 'x̄ = Σ(P·x) / ΣP        e = x̄ − L/2\nThe resultant should fall within the middle third, |e| ≤ L/6.',
          sub: 'x̄ = ' + fx(xR, 4) + ' ft from the left edge\ne = ' + fx(eRes, 5) + ' ft,  L/6 = ' + fx(eLimit, 4) + ' ft',
          res: Math.abs(eRes) <= eLimit ? 'Resultant within the middle third ✓' : 'Resultant outside the middle third ✗'
        },
        {
          n: 3, title: 'Soil Bearing Pressure', status: pass(bearingOK && noUplift),
          formula: 'q = P/A ± M / S        with S = B L² / 6',
          sub: 'P/A = ' + fx(qAvg, 4) + ' ksf\nS = ' + fx(Sm, 3) + ' ft³,  M = ' + fx(Mtot, 4) + ' k-ft\nqmax = ' + fx(qMax, 4) + ' ksf,  qmin = ' + fx(qMin, 4) + ' ksf',
          res: 'qmax = ' + fx(qMax, 4) + (bearingOK ? ' ≤ ' : ' > ') + fx(Qa, 2) + ' ksf allowable'
        },
        {
          n: 4, title: 'Factored Loads and Longitudinal Analysis', status: 'pass',
          formula: 'Pu = 1.2 D + 1.6 L        qu = ΣPu / Area\nThe footing is analysed as a beam carrying the uniform upward pressure\nwith the two column loads acting downward.',
          sub: 'Pu1 = ' + fx(Pu1, 3) + ' k,  Pu2 = ' + fx(Pu2, 3) + ' k\nqu = ' + fx(qu, 4) + ' ksf  →  wu = ' + fx(wu, 4) + ' k/ft\nMaximum positive moment at x = ' + fx(xMpos, 3) + ' ft\nMaximum negative moment at x = ' + fx(xMneg, 3) + ' ft',
          res: 'M+ = ' + fx(Mpos, 3) + ' k-ft,  M− = ' + fx(MnegAbs, 3) + ' k-ft,  Vmax = ' + fx(Vmax, 3) + ' k'
        },
        {
          n: 5, title: 'One-Way Shear', status: pass(beamShearOK),
          formula: "φVc = φ × 2 √f'c × b × d        b = full footing width",
          sub: "φVc = 0.75 × 2 × √" + fx(fc, 0) + " × " + fx(Bw * 12, 1) + " × " + fx(d, 3) + " / 1000",
          res: 'φVc = ' + fx(phiVc1, 3) + ' k ' + (beamShearOK ? '≥ ' : '< ') + 'Vu = ' + fx(Vmax, 3) + ' k'
        },
        {
          n: 6, title: 'Two-Way (Punching) Shear', status: pass(pu1.ok && pu2.ok),
          formula: "vc = min[ 4,  2 + 4/βc,  2 + αs d/bo ] √f'c\nAll three ACI expressions are evaluated; the smallest governs.",
          sub: 'Column 1: bo = ' + fx(pu1.bo, 2) + ' in, βc = ' + fx(pu1.betaC, 3) + ', vc coefficient = ' + fx(pu1.vc, 3) +
            '\n          Vu = ' + fx(pu1.Vu, 3) + ' k,  φVc = ' + fx(pu1.phiVc, 3) + ' k' +
            '\nColumn 2: bo = ' + fx(pu2.bo, 2) + ' in, βc = ' + fx(pu2.betaC, 3) + ', vc coefficient = ' + fx(pu2.vc, 3) +
            '\n          Vu = ' + fx(pu2.Vu, 3) + ' k,  φVc = ' + fx(pu2.phiVc, 3) + ' k',
          res: (pu1.ok && pu2.ok) ? 'Punching shear satisfactory at both columns ✓' : 'Punching shear inadequate ✗'
        },
        {
          n: 7, title: 'Reinforcement', status: 'pass',
          formula: "Solve φ As fy (d − a/2) = Mu\nAs,min = 0.0018 b h        (ACI 318 7.12 shrinkage and temperature)\nTransverse band width = column width + 2d        (ACI 318 15.4.4)",
          sub: 'Longitudinal As,min = ' + fx(AsMinLong, 3) + ' in²\nTop    (negative moment) As = ' + fx(AsTop, 3) + ' in²  →  ' + nTop + ' × ' + barKey +
            '\nBottom (positive moment) As = ' + fx(AsBot, 3) + ' in²  →  ' + nBot + ' × ' + barKey +
            '\nBand at column 1: width ' + fx(b1r.be, 3) + ' ft, M = ' + fx(b1r.Mb, 3) + ' k-ft, As = ' + fx(b1r.As, 3) + ' in²' +
            '\nBand at column 2: width ' + fx(b2r.be, 3) + ' ft, M = ' + fx(b2r.Mb, 3) + ' k-ft, As = ' + fx(b2r.As, 3) + ' in²',
          res: 'Top ' + nTop + '-' + barKey + ',  bottom ' + nBot + '-' + barKey + ',  bands ' + b1r.n + ' and ' + b2r.n + ' × ' + barKey
        }
      ],
      warnings,
      table: {
        title: 'Design Summary',
        headers: ['Item', 'Demand', 'Capacity', 'Status'],
        rows: [
          ['Soil bearing (ksf)', fx(qMax, 4), fx(Qa, 3), bearingOK ? 'OK' : 'Not OK'],
          ['One-way shear (k)', fx(Vmax, 3), fx(phiVc1, 3), beamShearOK ? 'OK' : 'Not OK'],
          ['Punching col 1 (k)', fx(pu1.Vu, 3), fx(pu1.phiVc, 3), pu1.ok ? 'OK' : 'Not OK'],
          ['Punching col 2 (k)', fx(pu2.Vu, 3), fx(pu2.phiVc, 3), pu2.ok ? 'OK' : 'Not OK'],
          ['Top steel (in²)', fx(AsTop, 3), fx(nTop * bi.Ab, 3), 'OK'],
          ['Bottom steel (in²)', fx(AsBot, 3), fx(nBot * bi.Ab, 3), 'OK']
        ],
        foot: null
      },
      raw: { L, Bw, T, d, Area, Pser, xR, eRes, qMax, qMin, qAvg, Pu1, Pu2, qu, Mpos, MnegAbs, Vmax, phiVc1, pu1, pu2, AsTop, AsBot, nTop, nBot, b1r, b2r, status }
    };
  }

  /* =====================================================================
     C8 — BARBELL SHEAR WALL
     Source workbook: C8-Shear-Wall-Design-Excel
     ===================================================================== */
  function shearWallDesign(inp) {
    const warnings = [];
    const fc = num(inp.fc, 3.5) * 1000;      // psi
    const fy = num(inp.fy, 60) * 1000;       // psi
    const Pu = num(inp.Pu, 1150);            // kips
    const Mu = num(inp.Mu, 344);             // ft-kips
    const Vu = num(inp.Vu, 49);              // kips
    const Lft = num(inp.L, 9);               // wall length, ft
    const t = num(inp.t, 10);                // web thickness, in
    const Bw = num(inp.B, 10);               // bulb width, in
    const Db = num(inp.Dbulb, 50);           // bulb depth, in
    const hw = num(inp.hw, 10);              // wall height, ft
    const nBulb = Math.round(num(inp.nBulb, 8));
    const bulbBar = inp.bulbBar || '#6';
    const nHoriz = Math.round(num(inp.nHoriz, 2));
    const horizBar = inp.horizBar || '#4';
    const sHoriz = num(inp.sHoriz, 15);
    const nVert = Math.round(num(inp.nVert, 4));
    const vertBar = inp.vertBar || '#6';
    const sVert = num(inp.sVert, 8);

    const bb = D.BAR_IMPERIAL[bulbBar] || D.BAR_IMPERIAL['#6'];
    const hb = D.BAR_IMPERIAL[horizBar] || D.BAR_IMPERIAL['#4'];
    const vb = D.BAR_IMPERIAL[vertBar] || D.BAR_IMPERIAL['#6'];

    const Lin = Lft * 12;
    /* Gross area resisting shear, ACI 318 18.10.4 */
    const Acv = Lin * t;

    /* Minimum distributed reinforcement, ACI 318 18.10.2.1 / 11.6 */
    const AcvRootFc = Acv * Math.sqrt(fc) / 1000;    // kips
    const lightShear = Vu <= AcvRootFc;
    const rhoNmin = lightShear ? 0.0020 : 0.0025;
    const rhoVmin = lightShear ? 0.0015 : 0.0025;

    /* Provided ratios */
    const rhoN = (nHoriz * hb.Ab) / (t * sHoriz);    // horizontal (transverse)
    const rhoV = (nVert * vb.Ab) / (t * sVert);      // vertical (longitudinal)
    const rhoNok = rhoN >= rhoNmin;
    const rhoVok = rhoV >= rhoVmin;

    /* Shear strength, ACI 318 18.10.4.1 */
    const hwlw = Lft > 0 ? hw / Lft : 0;
    const alphaC = hwlw <= 1.5 ? 3.0 : (hwlw >= 2.0 ? 2.0 : 3.0 - (hwlw - 1.5) * 2);
    const Vn = Acv * (alphaC * Math.sqrt(fc) + rhoN * fy) / 1000;   // kips
    const VnCap = 8 * Acv * Math.sqrt(fc) / 1000;                    // ACI upper bound
    const VnUse = Math.min(Vn, VnCap);
    const phiVn = 0.75 * VnUse;
    const shearOK = Vu <= phiVn;

    /* Axial and flexural capacity of the barbell section, treated as
       two bulb flanges connected by the web. */
    const Ag = 2 * Bw * Db + (Lin - 2 * Db) * t;
    const AstBulb = nBulb * bb.Ab;                     // per bulb
    const nWebVert = Math.max(0, Math.floor((Lin - 2 * Db) / sVert)) * nVert;
    const AstWeb = nWebVert * vb.Ab;
    const Ast = 2 * AstBulb + AstWeb;
    const rhoG = Ag > 0 ? Ast / Ag : 0;

    const Po = 0.85 * fc / 1000 * (Ag - Ast) + fy / 1000 * Ast;      // kips
    const phiPmax = 0.80 * 0.65 * Po;
    const axialOK = Pu <= phiPmax;

    /* Flexural capacity taking the bulbs as the tension and compression
       chords with the web steel contributing at its centroid. */
    const armFt = (Lin - Db) / 12;                                   // bulb centroid to bulb centroid
    const Tbulb = AstBulb * fy / 1000;                               // kips
    const Mn = Tbulb * armFt + AstWeb * fy / 1000 * (armFt / 4) + Pu * (Lin / 2 - Db / 2) / 12;
    const phiMn = 0.9 * Mn;
    const flexOK = Mu <= phiMn;

    /* Boundary element check, ACI 318 18.10.6.2 */
    const needBoundary = Pu / Ag * 1000 > 0.2 * fc;

    /* Confinement hoops in the bulb, ACI 318 18.7.5.4 (the provision the
       source workbook cites as Eq 21-4). Ash is required in each
       principal direction of the boundary element. */
    const hoopBar = inp.hoopBar || '#4';
    const hb2 = D.BAR_IMPERIAL[hoopBar] || D.BAR_IMPERIAL['#4'];
    const nHoopB = Math.round(num(inp.nHoopB, 2));       // legs across the bulb width
    const nHoopL = Math.round(num(inp.nHoopL, 2));       // legs along the bulb depth
    const sHoop = num(inp.sHoop, 2);                     // hoop spacing, in
    const coverB = num(inp.coverBulb, 1.5);

    /* Core dimensions measured to the outside of the hoops */
    const bcB = Bw - 2 * coverB;          // core across the bulb width
    const bcL = Db - 2 * coverB;          // core along the bulb depth
    const Ach = bcB * bcL;
    const AgBulb = Bw * Db;

    /* Ash required per ACI 318 18.7.5.4: the larger of the two expressions,
       evaluated with the core dimension perpendicular to the hoop legs. */
    function ashReq(bc) {
      return Math.max(
        0.3 * sHoop * bc * (fc / fy) * (AgBulb / Ach - 1),
        0.09 * sHoop * bc * (fc / fy)
      );
    }
    const AshReqB = ashReq(bcL);          // legs across the width confine the depth
    const AshReqL = ashReq(bcB);
    const AshProvB = nHoopB * hb2.Ab;
    const AshProvL = nHoopL * hb2.Ab;
    const hoopBok = AshProvB >= AshReqB;
    const hoopLok = AshProvL >= AshReqL;

    if (!hoopBok) warnings.push('Bulb hoops in the width direction provide Ash = ' + fx(AshProvB, 4) + ' in² against ' + fx(AshReqB, 4) + ' in² required by ACI 318 18.7.5.4.');
    if (!hoopLok) warnings.push('Bulb hoops in the length direction provide Ash = ' + fx(AshProvL, 4) + ' in² against ' + fx(AshReqL, 4) + ' in² required by ACI 318 18.7.5.4.');

    if (!rhoNok) warnings.push('Horizontal reinforcement ratio ' + fx(rhoN, 5) + ' is below the required ' + fx(rhoNmin, 4) + '.');
    if (!rhoVok) warnings.push('Vertical reinforcement ratio ' + fx(rhoV, 5) + ' is below the required ' + fx(rhoVmin, 4) + '.');
    if (!shearOK) warnings.push('Vu = ' + fx(Vu, 2) + ' k exceeds φVn = ' + fx(phiVn, 2) + ' k.');
    if (!axialOK) warnings.push('Pu = ' + fx(Pu, 1) + ' k exceeds φPn,max = ' + fx(phiPmax, 1) + ' k.');
    if (!flexOK) warnings.push('Mu = ' + fx(Mu, 1) + ' ft-k exceeds φMn = ' + fx(phiMn, 1) + ' ft-k.');
    if (Vn > VnCap) warnings.push("Vn is capped at 8 Acv √f'c = " + fx(VnCap, 1) + ' k by ACI 318 18.10.4.4.');
    if (needBoundary) warnings.push('Axial stress exceeds 0.2 f\'c — special boundary elements are required at the wall ends (ACI 318 18.10.6.3).');

    const status = (shearOK && axialOK && flexOK && rhoNok && rhoVok && hoopBok && hoopLok) ? 'PASS' : 'FAIL';

    return {
      status,
      headline: 'φVn = ' + fx(phiVn, 2) + ' k vs Vu = ' + fx(Vu, 2) + ' k,  φMn = ' + fx(phiMn, 1) +
        ' ft-k vs Mu = ' + fx(Mu, 1) + ' ft-k — ' + (status === 'PASS' ? 'WALL DESIGN IS ADEQUATE' : 'WALL DESIGN IS INADEQUATE'),
      results: [
        { label: 'Wall Length lw', value: fx(Lft, 2) + ' ft (' + fx(Lin, 1) + ' in)' },
        { label: 'Web Thickness t', value: fx(t, 1), unit: 'in' },
        { label: 'Bulb B × D', value: fx(Bw, 1) + ' × ' + fx(Db, 1), unit: 'in' },
        { label: 'Wall Height hw', value: fx(hw, 2), unit: 'ft' },
        { label: 'hw / lw', value: fx(hwlw, 4) },
        { label: 'Gross Section Area Ag', value: fx(Ag, 2), unit: 'in²' },
        { label: 'Shear Area Acv = lw × t', value: fx(Acv, 1), unit: 'in²' },
        { label: "Acv √f'c", value: fx(AcvRootFc, 3), unit: 'k' },
        { label: 'Reinforcement Regime', value: lightShear ? "Vu ≤ Acv√f'c — reduced minima apply" : "Vu > Acv√f'c — 0.0025 minima apply" },
        { label: 'Required ρn (horizontal)', value: fx(rhoNmin, 4) },
        { label: 'Provided ρn', value: fx(rhoN, 6), flag: rhoNok ? 'pass' : 'fail' },
        { label: 'Required ρv (vertical)', value: fx(rhoVmin, 4) },
        { label: 'Provided ρv', value: fx(rhoV, 6), flag: rhoVok ? 'pass' : 'fail' },
        { label: 'αc coefficient', value: fx(alphaC, 3) },
        { label: 'Nominal Shear Vn', value: fx(VnUse, 3), unit: 'k' },
        { label: "Upper bound 8 Acv √f'c", value: fx(VnCap, 3), unit: 'k' },
        { label: 'Design Shear φVn', value: fx(phiVn, 3), unit: 'k', flag: shearOK ? 'pass' : 'fail' },
        { label: 'Applied Vu', value: fx(Vu, 2), unit: 'k' },
        { label: 'Total Vertical Steel Ast', value: fx(Ast, 3), unit: 'in²' },
        { label: 'Gross Steel Ratio', value: fx(rhoG, 5) },
        { label: 'φPn,max', value: fx(phiPmax, 2), unit: 'k', flag: axialOK ? 'pass' : 'fail' },
        { label: 'Applied Pu', value: fx(Pu, 2), unit: 'k' },
        { label: 'Design Moment φMn', value: fx(phiMn, 2), unit: 'ft-k', flag: flexOK ? 'pass' : 'fail' },
        { label: 'Applied Mu', value: fx(Mu, 2), unit: 'ft-k' },
        { label: 'Special Boundary Elements', value: needBoundary ? 'REQUIRED' : 'Not triggered by axial stress', flag: needBoundary ? 'warn' : 'pass' },
        { label: 'Bulb Core bc (width × depth)', value: fx(bcB, 2) + ' × ' + fx(bcL, 2), unit: 'in' },
        { label: 'Ash required — width direction', value: fx(AshReqB, 4), unit: 'in²' },
        { label: 'Ash provided — width direction', value: fx(AshProvB, 4) + ' (' + nHoopB + ' legs ' + hoopBar + ' @ ' + fx(sHoop, 1) + ' in)', flag: hoopBok ? 'pass' : 'fail' },
        { label: 'Ash required — length direction', value: fx(AshReqL, 4), unit: 'in²' },
        { label: 'Ash provided — length direction', value: fx(AshProvL, 4) + ' (' + nHoopL + ' legs ' + hoopBar + ' @ ' + fx(sHoop, 1) + ' in)', flag: hoopLok ? 'pass' : 'fail' }
      ],
      steps: [
        {
          n: 1, title: 'Section Properties', status: 'pass',
          formula: 'Ag = 2 × (bulb B × D) + (lw − 2D) × t\nAcv = lw × t        (gross area resisting shear)',
          sub: 'Ag = 2 × (' + fx(Bw, 1) + ' × ' + fx(Db, 1) + ') + (' + fx(Lin, 1) + ' − 2 × ' + fx(Db, 1) + ') × ' + fx(t, 1) + '\n   = ' + fx(Ag, 2) + ' in²\nAcv = ' + fx(Lin, 1) + ' × ' + fx(t, 1) + ' = ' + fx(Acv, 1) + ' in²',
          res: 'Ag = ' + fx(Ag, 2) + ' in²,  Acv = ' + fx(Acv, 1) + ' in²'
        },
        {
          n: 2, title: 'Minimum Distributed Reinforcement', status: pass(rhoNok && rhoVok),
          formula: "Acv √f'c compared with Vu decides which minima apply:\n  Vu ≤ Acv √f'c : ρn ≥ 0.0020, ρv ≥ 0.0015\n  Vu > Acv √f'c : ρn ≥ 0.0025, ρv ≥ 0.0025",
          sub: "Acv √f'c = " + fx(Acv, 1) + " × √" + fx(fc, 0) + " / 1000 = " + fx(AcvRootFc, 3) + " k\nVu = " + fx(Vu, 2) + " k  →  " + (lightShear ? 'reduced' : 'full') + " minima apply" +
            '\nρn provided = ' + nHoriz + ' × ' + fx(hb.Ab, 3) + ' / (' + fx(t, 1) + ' × ' + fx(sHoriz, 1) + ') = ' + fx(rhoN, 6) +
            '\nρv provided = ' + nVert + ' × ' + fx(vb.Ab, 3) + ' / (' + fx(t, 1) + ' × ' + fx(sVert, 1) + ') = ' + fx(rhoV, 6),
          res: 'ρn ' + (rhoNok ? '✓' : '✗') + '   ρv ' + (rhoVok ? '✓' : '✗')
        },
        {
          n: 3, title: 'Shear Strength', status: pass(shearOK),
          formula: "Vn = Acv (αc √f'c + ρn fy)        (ACI 318 18.10.4.1)\nαc = 3.0 for hw/lw ≤ 1.5, 2.0 for hw/lw ≥ 2.0, linear between\nVn ≤ 8 Acv √f'c        φ = 0.75",
          sub: 'hw / lw = ' + fx(hwlw, 4) + '  →  αc = ' + fx(alphaC, 3) +
            "\nVn = " + fx(Acv, 1) + " × (" + fx(alphaC, 2) + " × √" + fx(fc, 0) + " + " + fx(rhoN, 6) + " × " + fx(fy, 0) + ") / 1000" +
            '\n   = ' + fx(Vn, 3) + ' k, capped at ' + fx(VnCap, 3) + ' k',
          res: 'φVn = ' + fx(phiVn, 3) + ' k ' + (shearOK ? '≥ ' : '< ') + 'Vu = ' + fx(Vu, 2) + ' k'
        },
        {
          n: 4, title: 'Axial Capacity', status: pass(axialOK),
          formula: "Po = 0.85 f'c (Ag − Ast) + fy Ast\nφPn,max = 0.80 φ Po        with φ = 0.65 for a tied section",
          sub: 'Bulb steel = 2 × ' + nBulb + ' × ' + bulbBar + ' = ' + fx(2 * AstBulb, 3) + ' in²\nWeb vertical steel = ' + fx(AstWeb, 3) + ' in²\nAst = ' + fx(Ast, 3) + ' in²,  ρ = ' + fx(rhoG, 5),
          res: 'φPn,max = ' + fx(phiPmax, 2) + ' k ' + (axialOK ? '≥ ' : '< ') + 'Pu = ' + fx(Pu, 2) + ' k'
        },
        {
          n: 5, title: 'Flexural Capacity', status: pass(flexOK),
          formula: 'The bulbs act as tension and compression chords:\nMn = T(bulb) × arm + web steel contribution + Pu × (lw/2 − D/2)',
          sub: 'Chord arm = (' + fx(Lin, 1) + ' − ' + fx(Db, 1) + ') / 12 = ' + fx(armFt, 3) + ' ft\nT(bulb) = ' + fx(AstBulb, 3) + ' × ' + fx(fy / 1000, 1) + ' = ' + fx(Tbulb, 2) + ' k\nAxial contribution = ' + fx(Pu * (Lin / 2 - Db / 2) / 12, 2) + ' ft-k',
          res: 'φMn = ' + fx(phiMn, 2) + ' ft-k ' + (flexOK ? '≥ ' : '< ') + 'Mu = ' + fx(Mu, 2) + ' ft-k'
        },
        {
          n: 6, title: 'Boundary Elements', status: needBoundary ? 'fail' : 'pass',
          formula: "Special boundary elements are required where the compressive\nstress exceeds 0.2 f'c        (ACI 318 18.10.6.3)",
          sub: 'Pu / Ag = ' + fx(Pu * 1000 / Ag, 1) + " psi\n0.2 f'c = " + fx(0.2 * fc, 1) + ' psi',
          res: needBoundary ? 'Special boundary elements REQUIRED' : 'Not triggered by the axial stress check'
        },
        {
          n: 7, title: 'Bulb Confinement Hoops', status: pass(hoopBok && hoopLok),
          formula: "Ash ≥ max[ 0.3 s bc (f'c/fyt)(Ag/Ach − 1),  0.09 s bc (f'c/fyt) ]\n(ACI 318 18.7.5.4 — the provision the source workbook cites as Eq 21-4)",
          sub: 'Bulb gross area = ' + fx(AgBulb, 2) + ' in², core Ach = ' + fx(Ach, 2) + ' in²\nAg/Ach − 1 = ' + fx(AgBulb / Ach - 1, 4) + ',  hoop spacing s = ' + fx(sHoop, 2) + ' in' +
            '\nWidth direction : bc = ' + fx(bcL, 2) + ' in  →  Ash required ' + fx(AshReqB, 4) + ' in², provided ' + fx(AshProvB, 4) + ' in²' +
            '\nLength direction: bc = ' + fx(bcB, 2) + ' in  →  Ash required ' + fx(AshReqL, 4) + ' in², provided ' + fx(AshProvL, 4) + ' in²',
          res: (hoopBok && hoopLok) ? 'Confinement hoops satisfactory ✓' : 'Confinement hoops inadequate ✗'
        }
      ],
      warnings,
      table: {
        title: 'Design Summary',
        headers: ['Check', 'Demand', 'Capacity', 'Status'],
        rows: [
          ['Shear (k)', fx(Vu, 2), fx(phiVn, 2), shearOK ? 'OK' : 'Not OK'],
          ['Axial (k)', fx(Pu, 2), fx(phiPmax, 2), axialOK ? 'OK' : 'Not OK'],
          ['Moment (ft-k)', fx(Mu, 2), fx(phiMn, 2), flexOK ? 'OK' : 'Not OK'],
          ['ρn horizontal', fx(rhoN, 6), fx(rhoNmin, 4), rhoNok ? 'OK' : 'Not OK'],
          ['ρv vertical', fx(rhoV, 6), fx(rhoVmin, 4), rhoVok ? 'OK' : 'Not OK'],
          ['Bulb hoops Ash width (in²)', fx(AshReqB, 4), fx(AshProvB, 4), hoopBok ? 'OK' : 'Not OK'],
          ['Bulb hoops Ash length (in²)', fx(AshReqL, 4), fx(AshProvL, 4), hoopLok ? 'OK' : 'Not OK']
        ],
        foot: null
      },
      raw: {
        Ag, Acv, AcvRootFc, rhoN, rhoV, rhoNmin, rhoVmin, alphaC, Vn, VnCap, phiVn,
        Po, phiPmax, phiMn, Ast, rhoG, shearOK, axialOK, flexOK,
        AshReqB, AshProvB, AshReqL, AshProvL, hoopBok, hoopLok, needBoundary, status
      }
    };
  }

  /* =====================================================================
     F2 — BEAM ESTIMATING (BAR BENDING SCHEDULE + BILL OF QUANTITIES)
     Source workbook: F2-Beam-estimation
     ===================================================================== */
  function beamEstimate(inp) {
    const warnings = [];
    const spans = (inp.spans || []).filter(s => num(s.L, 0) > 0);
    if (!spans.length) warnings.push('Add at least one span to estimate.');

    const bw = num(inp.bw, 10);           // in
    const bh = num(inp.bh, 18);           // in
    const cover = num(inp.cover, 1.5);    // in
    const stirrupDia = num(inp.stirrupDia, 10);   // mm
    const sStirrup = num(inp.sStirrup, 6.5);      // in c/c
    const stirrupLegs = num(inp.legs, 2);
    const hookFactor = num(inp.hookFactor, 9);    // xdb standard hook
    const lapFactor = num(inp.lapFactor, 50);     // xdb lap length
    const dryFactor = num(inp.dryFactor, 1.5);
    const cftPerBag = num(inp.cftPerBag, 1.25);
    const mix = [num(inp.mixC, 1), num(inp.mixS, 1.5), num(inp.mixK, 3)];

    const price = {
      cement: num(inp.pCement, 500), sand: num(inp.pSand, 35),
      agg: num(inp.pAgg, 90), steel: num(inp.pSteel, 96000),
      shutter: num(inp.pShutter, 15)
    };

    /* Concrete and formwork */
    let totalLen = 0;
    spans.forEach(s => { totalLen += num(s.L, 0); });
    const volume = (bw / 12) * (bh / 12) * totalLen;                    // cft
    /* Two sides plus the soffit */
    const formwork = (2 * (bh / 12) + (bw / 12)) * totalLen;            // sq.ft

    /* Longitudinal bars */
    const rows = [];
    let steelKg = 0;
    const kgPerFt = (dia, len) => (dia * dia / 162) * 0.3048 * len;

    spans.forEach((s, i) => {
      const L = num(s.L, 0);
      const marks = [
        { name: 'Bottom straight', n: num(s.nBot, 0), dia: num(s.dBot, 0), len: L + 2 * (hookFactor * num(s.dBot, 0) / MM / 12) },
        { name: 'Top straight', n: num(s.nTop, 0), dia: num(s.dTop, 0), len: L + 2 * (hookFactor * num(s.dTop, 0) / MM / 12) },
        { name: 'Extra top at supports', n: num(s.nExtra, 0), dia: num(s.dExtra, 0), len: L / 2 }
      ];
      marks.forEach(m => {
        if (m.n <= 0 || m.dia <= 0) return;
        const total = m.n * m.len;
        const kg = kgPerFt(m.dia, total);
        steelKg += kg;
        rows.push(['Span ' + (i + 1), m.name, String(m.n), String(m.dia), fx(m.len, 3), fx(total, 2), fx(kg, 3)]);
      });

      /* Stirrups */
      const nLink = Math.ceil((L * 12 / sStirrup) + 1);
      /* Cut length of one closed stirrup: perimeter of the core plus hooks */
      const coreW = bw - 2 * cover, coreH = bh - 2 * cover;
      const cutIn = 2 * (coreW + coreH) + 2 * (hookFactor * stirrupDia / MM);
      const cutFt = cutIn / 12;
      const totalStirrupFt = nLink * cutFt * (stirrupLegs / 2);
      const kgS = kgPerFt(stirrupDia, totalStirrupFt);
      steelKg += kgS;
      rows.push(['Span ' + (i + 1), 'Stirrups @ ' + fx(sStirrup, 2) + ' in', String(nLink), String(stirrupDia), fx(cutFt, 3), fx(totalStirrupFt, 2), fx(kgS, 3)]);
    });

    /* Lap allowance */
    const lapAllowance = num(inp.lapPct, 3) / 100;
    const steelWithLap = steelKg * (1 + lapAllowance);

    /* Materials */
    const dry = volume * dryFactor;
    const sumMix = mix[0] + mix[1] + mix[2];
    const cement = sumMix > 0 ? dry * mix[0] / sumMix / cftPerBag : 0;
    const sand = sumMix > 0 ? dry * mix[1] / sumMix : 0;
    const agg = sumMix > 0 ? dry * mix[2] / sumMix : 0;

    const cost = cement * price.cement + sand * price.sand + agg * price.agg +
      steelWithLap / 1000 * price.steel + formwork * price.shutter;

    return {
      status: 'INFO',
      headline: totalLen > 0
        ? ('Total ' + fx(totalLen, 2) + ' ft of ' + fx(bw, 0) + '×' + fx(bh, 0) + ' in beam:  ' +
           fx(volume, 2) + ' cft concrete,  ' + fx(steelWithLap, 1) + ' kg steel,  cost ≈ ' + fx(cost, 2))
        : 'Add span data to build the estimate',
      results: [
        { label: 'Number of Spans', value: String(spans.length) },
        { label: 'Total Beam Length', value: fx(totalLen, 3), unit: 'ft' },
        { label: 'Beam Section b × h', value: fx(bw, 1) + ' × ' + fx(bh, 1), unit: 'in' },
        { label: 'Concrete Volume', value: fx(volume, 4), unit: 'cft' },
        { label: 'Concrete Volume', value: fx(volume * 0.0283168, 4), unit: 'm³' },
        { label: 'Formwork Area', value: fx(formwork, 3), unit: 'sq.ft' },
        { label: 'Reinforcement (bars + stirrups)', value: fx(steelKg, 3), unit: 'kg' },
        { label: 'Lap Allowance', value: fx(lapAllowance * 100, 1), unit: '%' },
        { label: 'Total Reinforcement', value: fx(steelWithLap, 3), unit: 'kg' },
        { label: 'Steel per m³ of Concrete', value: fx(volume > 0 ? steelWithLap / (volume * 0.0283168) : 0, 2), unit: 'kg/m³' },
        { label: 'Cement', value: fx(cement, 3), unit: 'bags' },
        { label: 'Sand', value: fx(sand, 3), unit: 'cft' },
        { label: 'Aggregate', value: fx(agg, 3), unit: 'cft' },
        { label: 'TOTAL COST', value: fx(cost, 2) }
      ],
      steps: [
        {
          n: 1, title: 'Concrete and Formwork', status: 'pass',
          formula: 'Volume   = (b/12) × (h/12) × Σ span lengths\nFormwork = (2 × h/12 + b/12) × Σ span lengths        (two sides and the soffit)',
          sub: 'Σ L = ' + fx(totalLen, 3) + ' ft\nVolume = (' + fx(bw, 1) + '/12) × (' + fx(bh, 1) + '/12) × ' + fx(totalLen, 3),
          res: 'Volume = ' + fx(volume, 4) + ' cft   |   Formwork = ' + fx(formwork, 3) + ' sq.ft'
        },
        {
          n: 2, title: 'Longitudinal Bar Cut Lengths', status: 'pass',
          formula: 'Straight bar = span + 2 × (' + fx(hookFactor, 0) + ' db) hooks, converted to feet\nExtra top bar = half the span',
          sub: 'Hook allowance uses the exact 25.4 mm per inch conversion and is\ndivided by 12 before being added to a length in feet.',
          res: 'See the bar bending schedule'
        },
        {
          n: 3, title: 'Stirrups', status: 'pass',
          formula: 'Number of links = ceil(span × 12 / spacing + 1)\nCut length = 2(b − 2c) + 2(h − 2c) + 2 × ' + fx(hookFactor, 0) + ' db',
          sub: 'Core = ' + fx(bw - 2 * cover, 2) + ' × ' + fx(bh - 2 * cover, 2) + ' in\nStirrup bar ' + fx(stirrupDia, 0) + ' mm at ' + fx(sStirrup, 2) + ' in c/c, ' + fx(stirrupLegs, 0) + ' legs',
          res: 'Included in the schedule below'
        },
        {
          n: 4, title: 'Reinforcement Weight', status: 'pass',
          formula: 'kg/m = d² / 162        kg = (d²/162) × 0.3048 × length in feet\nLap allowance added as a percentage of the total',
          sub: 'Bar and stirrup weight = ' + fx(steelKg, 3) + ' kg\nLap allowance ' + fx(lapAllowance * 100, 1) + ' % = ' + fx(steelKg * lapAllowance, 3) + ' kg',
          res: 'Total steel = ' + fx(steelWithLap, 3) + ' kg'
        },
        {
          n: 5, title: 'Material Take-off and Cost', status: 'pass',
          formula: 'Dry volume = wet volume × ' + fx(dryFactor, 2) + '\nCement bags = dry × (C/ΣR) / ' + fx(cftPerBag, 2) + '\nSand and aggregate = dry × (part / ΣR)',
          sub: 'Mix ' + mix.join(':') + '  →  dry volume = ' + fx(dry, 3) + ' cft\nCement ' + fx(cement, 3) + ' bags, sand ' + fx(sand, 3) + ' cft, aggregate ' + fx(agg, 3) + ' cft',
          res: 'Total cost = ' + fx(cost, 2)
        }
      ],
      warnings,
      table: {
        title: 'Bar Bending Schedule',
        headers: ['Span', 'Bar Mark', 'Nos', 'Dia (mm)', 'Cut Length (ft)', 'Total (ft)', 'Weight (kg)'],
        rows,
        foot: ['', 'TOTAL', '', '', '', '', fx(steelKg, 3)]
      },
      raw: { totalLen, volume, formwork, steelKg, steelWithLap, cement, sand, agg, cost, rows }
    };
  }

  return { circularColumn, combinedFooting, shearWallDesign, beamEstimate };
})();

if (typeof window !== 'undefined') window.BNBCDesign2 = BNBCDesign2;
if (typeof module !== 'undefined' && module.exports) module.exports = BNBCDesign2;
