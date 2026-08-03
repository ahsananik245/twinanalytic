/* =====================================================================
   TwinAnalytic — Member Design & Detailing Engine
   ---------------------------------------------------------------------
   Ported from the BNBC 2020 / ACI 318 design workbooks. Returns the same
   result envelope as bnbc-calcs.js so the shared UI layer renders these
   calculators without any special casing.

   Working units follow the source workbooks: US customary (psi, kips,
   inches, feet) for the member design sheets, metric for the rebar
   detailing sheets. Every millimetre-to-inch conversion uses the exact
   25.4 factor.
   ===================================================================== */

const BNBCDesign = (function () {
  'use strict';

  const D = (typeof BNBC !== 'undefined') ? BNBC : (typeof require !== 'undefined' ? require('./bnbc-data.js') : null);
  const MM = 25.4;

  const num = (v, d) => { const n = parseFloat(v); return isFinite(n) ? n : (d === undefined ? 0 : d); };
  const fx = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 3 : d) : '—');
  const pass = c => c ? 'pass' : 'fail';
  const floorTo = (v, step) => Math.floor(v / step) * step;
  const barAreaIn2 = mm => Math.PI / 4 * Math.pow(mm / MM, 2);

  /* Solve As from Mu using the exact rectangular stress block, rather
     than assuming a lever arm. Mirrors the quadratic set up in the source
     workbooks but feeds the resulting "a" straight back in.
     Mu in lb-in, b and d in inches, f'c and fy in psi. */
  function asFromMoment(Mu, b, d, fc, fy, phi) {
    const A = phi * fy * fy;
    const B = -(1.7 * phi * fc * fy * d * b);
    const Cq = 1.7 * fc * b * Mu;
    const disc = B * B - 4 * A * Cq;
    if (disc < 0) return { As: NaN, a: NaN, ok: false };
    const r1 = (-B - Math.sqrt(disc)) / (2 * A);
    const r2 = (-B + Math.sqrt(disc)) / (2 * A);
    const As = Math.min(r1, r2);
    return { As, a: As * fy / (0.85 * fc * b), ok: As > 0 };
  }

  /* =====================================================================
     THREE SEGMENT BEAM SOLVER
     Used by the stair calculator so all six support configurations come
     out of one rigorous statics routine instead of six hand-written
     reaction formulas.
     segs : [{L, w}, ...]   supports at x = xa and x = xb
     ===================================================================== */
  function solveBeam(segs, xa, xb) {
    const total = segs.reduce((a, s) => a + s.L, 0);
    const wAt = x => {
      let acc = 0;
      for (const s of segs) { if (x < acc + s.L) return s.w; acc += s.L; }
      return segs.length ? segs[segs.length - 1].w : 0;
    };

    /* Resultant and its moment about x = 0 */
    let W = 0, Mo = 0, acc = 0;
    segs.forEach(s => { W += s.w * s.L; Mo += s.w * s.L * (acc + s.L / 2); acc += s.L; });

    /* Two supports: sum M about xa gives Rb */
    const span = xb - xa;
    const Rb = span > 0 ? (Mo - W * xa) / span : 0;
    const Ra = W - Rb;

    /* March along the beam building V and M */
    const N = 2000;
    const dx = total / N;
    let V = 0, M = 0, x = 0;
    const pts = [];
    let Mmax = 0, MmaxX = 0, Mmin = 0, MminX = 0, Vmax = 0;

    for (let i = 0; i <= N; i++) {
      x = i * dx;
      if (i > 0) {
        const w = wAt(x - dx / 2);
        M += V * dx - w * dx * dx / 2;
        V -= w * dx;
      }
      /* Apply the point reactions as the station passes them */
      if (i > 0) {
        const xPrev = x - dx;
        if (xPrev < xa && x >= xa) V += Ra;
        if (xPrev < xb && x >= xb) V += Rb;
      } else {
        if (xa === 0) V += Ra;
        if (xb === 0) V += Rb;
      }
      if (M > Mmax) { Mmax = M; MmaxX = x; }
      if (M < Mmin) { Mmin = M; MminX = x; }
      if (Math.abs(V) > Vmax) Vmax = Math.abs(V);
      pts.push({ x, V, M });
    }

    return { Ra, Rb, W, total, Mmax, MmaxX, Mmin, MminX, Vmax, pts };
  }

  /* =====================================================================
     D1–D6 — RC STAIR DESIGN (USD)
     Source workbooks: D1..D6-Stair-Design-USD-Case-1..6
     ===================================================================== */
  const STAIR_CASES = {
    1: { label: 'Case 1 — Landing / flight / landing, supported at both far ends',
         start: 'beam', end: 'beam', cantilever: false },
    2: { label: 'Case 2 — Both landings spanning transversely (half landing each end)',
         start: 'half', end: 'half', cantilever: false },
    3: { label: 'Case 3 — Half landing at start, beam supported landing at end',
         start: 'half', end: 'beam', cantilever: false },
    4: { label: 'Case 4 — Beam supported start landing, cantilevered end landing',
         start: 'beam', end: 'cant', cantilever: true },
    5: { label: 'Case 5 — Half landing at start, cantilevered end landing',
         start: 'half', end: 'cant', cantilever: true },
    6: { label: 'Case 6 — Beam supported start landing, short cantilevered end landing',
         start: 'beam', end: 'cant', cantilever: true }
  };

  function stairDesign(inp) {
    const warnings = [];
    const caseNo = String(inp.caseNo || '1');
    const cs = STAIR_CASES[caseNo] || STAIR_CASES['1'];

    const fc = num(inp.fc, 2800);          // psi
    const fy = num(inp.fy, 72500);         // psi
    const sdl = num(inp.sdl, 20);          // psf
    const ll = num(inp.ll, 100);           // psf
    const bw = num(inp.bw, 10);            // supporting beam width, in
    const bws = num(inp.bws, 10);          // stringer beam width, in
    const Ls = num(inp.startLanding, 3.5); // ft
    const Le = num(inp.endLanding, 3.5);   // ft
    const tread = num(inp.tread, 10);      // in
    const riser = num(inp.riser, 6);       // in
    const nT = num(inp.nTread, 6);
    const nR = num(inp.nRiser, 7);
    const cc = num(inp.cover, 0.75);       // in
    const dbMain = num(inp.dbMain, 12);    // mm
    const dbShear = num(inp.dbShear, 10);  // mm
    const t = num(inp.t, 6.5);             // waist thickness, in
    const phiV = num(inp.phiV, 0.75);
    const phiM = num(inp.phiM, 0.90);
    const lam = num(inp.lambda, 1.0);
    const conc = num(inp.concUW, 150);     // pcf

    /* Geometry. Exact PI is used for the angle; five of the six source
       workbooks substituted 3.1416. */
    const Lh = tread * nT / 12;            // horizontal run, ft
    const Hv = riser * nR / 12;            // vertical rise, ft
    const inc = Math.sqrt(Lh * Lh + Hv * Hv);
    const theta = Math.atan2(Hv, Lh) * 180 / Math.PI;
    const cosT = inc > 0 ? Lh / inc : 1;

    /* Segment lengths per support configuration */
    const L1 = (cs.start === 'half') ? Ls / 2 : Ls + bw / 24;
    const L2 = Lh;
    const L3 = (cs.end === 'half') ? Le / 2 : (cs.end === 'cant' ? Le : Le + bws / 24);

    /* Loads, per foot width of stair */
    const wWaist = (t / 12) * conc;                          // lb/ft
    const wSteps = inc > 0 ? (nT * 0.5 * (tread / 12) * (riser / 12) * conc) / inc : 0;
    const totalDL = wWaist + wSteps + sdl;
    const wfi = 1.2 * totalDL + 1.6 * ll;                    // on the incline
    const wfh = cosT > 0 ? wfi / cosT : wfi;                 // projected horizontally
    /* Landing carries the flat waist only. BNBC 2020 and ACI 318 use
       1.2D + 1.6L; the Case 6 workbook applied 1.4 to the dead load here,
       which does not correspond to any governing combination. */
    const wl = 1.2 * (wWaist + sdl) + 1.6 * ll;

    /* Statics */
    const segs = [{ L: L1, w: wl }, { L: L2, w: wfh }, { L: L3, w: wl }];
    const xa = 0;
    const xb = cs.cantilever ? (L1 + L2) : (L1 + L2 + L3);
    const bm = solveBeam(segs, xa, xb);

    const Leff = xb - xa;
    const Mu = bm.Mmax;                       // lb-ft (sagging)
    const Mneg = Math.abs(bm.Mmin);           // lb-ft (hogging at cantilever)
    const Vu = bm.Vmax;                       // lb

    /* Effective depth */
    const d = t - cc - (dbShear / MM) - (dbMain / (2 * MM));

    /* Minimum waist thickness, ACI 318 Table 9.5(a) for a simply
       supported one-way slab, with the modifier for fy other than
       60 000 psi. The source workbooks used a flat 0.85 factor, which
       understates the requirement whenever fy > 60 ksi. */
    const fyMod = 0.4 + fy / 100000;
    const tMin = (Leff / 20) * 12 * fyMod;
    const thickOK = t >= tMin;
    if (!thickOK) warnings.push('Waist thickness ' + fx(t, 2) + ' in is below the ACI Table 9.5(a) minimum of ' + fx(tMin, 2) + ' in for deflection control.');

    /* Shear */
    const b = 12;                              // design strip, in
    const phiVc = 2 * phiV * lam * Math.sqrt(fc) * b * d;   // lb
    const shearOK = Vu <= phiVc;
    const needsStirrups = Vu > phiVc / 2;
    if (!shearOK) warnings.push('Shear demand ' + fx(Vu, 0) + ' lb exceeds φVc = ' + fx(phiVc, 0) + ' lb. Increase the waist thickness.');

    /* Flexure — main steel over the flight */
    const solF = asFromMoment(Mu * 12, b, d, fc, fy, phiM);
    /* One-way slabs take As,min = 0.0018 Ag (ACI 318 7.6.1.1), not the
       beam expression used in the source workbooks. */
    const AsMinSlab = 0.0018 * b * t;
    const AsMinBeam = Math.max(3 * Math.sqrt(fc) / fy, 200 / fy) * b * d;
    const AsFlight = Math.max(solF.ok ? solF.As : 0, AsMinSlab);

    /* Flexure — landing / cantilever hogging steel */
    const solL = asFromMoment(Math.max(Mneg, Mu * 0.5) * 12, b, d, fc, fy, phiM);
    const AsLanding = Math.max(solL.ok ? solL.As : 0, AsMinSlab);

    /* Ductility */
    const beta1 = D.beta1PSI(fc);
    const rhoB = 0.85 * beta1 * (fc / fy) * (87000 / (87000 + fy));
    const rhoMax = 0.75 * rhoB;
    const rhoProv = AsFlight / (b * d);
    const ductileOK = rhoProv <= rhoMax;
    if (!ductileOK) warnings.push('Steel ratio ' + fx(rhoProv, 5) + ' exceeds 0.75ρb = ' + fx(rhoMax, 5) + '. Increase the section depth.');

    /* Spacing. All conversions use 25.4 — the source workbooks used 25.5
       in the main-bar spacing expression and 25 in the detailing sheet. */
    const AbMain = barAreaIn2(dbMain);
    const AbShear = barAreaIn2(dbShear);
    const fs = (2 / 3) * fy;
    const sCrackRaw = 15 * (40000 / fs) - 2.5 * cc;
    const sCrackCap = 12 * (40000 / fs);           // ACI 318-08 10.6.4 upper bound
    const sCrack = Math.min(sCrackRaw, sCrackCap);
    const sMaxCode = Math.min(3 * t, 18);          // ACI 318 7.7.2.3

    const sFlightReq = AsFlight > 0 ? AbMain * b / AsFlight : 0;
    const sFlight = floorTo(Math.min(sFlightReq, sCrack, sMaxCode), 0.25);
    const sLandingReq = AsLanding > 0 ? AbMain * b / AsLanding : 0;
    const sLanding = floorTo(Math.min(sLandingReq, sCrack, sMaxCode), 0.25);

    /* Distribution / temperature steel, ACI 318 7.6.4 & 7.7.6.2.1 */
    const AsTemp = 0.0018 * b * t;
    const sTempMax = Math.min(5 * t, 18);
    const sTemp = floorTo(Math.min(AbShear * b / AsTemp, sTempMax), 0.25);

    const status = (thickOK && shearOK && ductileOK) ? 'PASS' : 'FAIL';

    return {
      status,
      headline: cs.label.split('—')[0].trim() + ':  Mu = ' + fx(Mu, 0) + ' lb-ft,  waist ' + fx(t, 2) +
        ' in,  main ' + dbMain + ' mm @ ' + fx(sFlight, 2) + ' in c/c  — ' + (status === 'PASS' ? 'SECTION ADEQUATE' : 'SECTION INADEQUATE'),
      results: [
        { label: 'Configuration', value: cs.label },
        { label: 'Horizontal Run of Flight', value: fx(Lh, 3), unit: 'ft' },
        { label: 'Vertical Rise of Flight', value: fx(Hv, 3), unit: 'ft' },
        { label: 'Inclined Length', value: fx(inc, 3), unit: 'ft' },
        { label: 'Flight Angle (θ)', value: fx(theta, 3), unit: '°' },
        { label: 'Segment Lengths L1 / L2 / L3', value: fx(L1, 3) + ' / ' + fx(L2, 3) + ' / ' + fx(L3, 3), unit: 'ft' },
        { label: 'Effective Span', value: fx(Leff, 3), unit: 'ft' },
        { label: 'Waist Self Weight', value: fx(wWaist, 2), unit: 'lb/ft' },
        { label: 'Step Self Weight', value: fx(wSteps, 2), unit: 'lb/ft' },
        { label: 'Total Dead Load', value: fx(totalDL, 2), unit: 'lb/ft' },
        { label: 'Factored Flight Load (inclined) Wfi', value: fx(wfi, 2), unit: 'lb/ft' },
        { label: 'Factored Flight Load (horizontal) Wfh', value: fx(wfh, 2), unit: 'lb/ft' },
        { label: 'Factored Landing Load Wl', value: fx(wl, 2), unit: 'lb/ft' },
        { label: 'Reaction R1 / R2', value: fx(bm.Ra, 1) + ' / ' + fx(bm.Rb, 1), unit: 'lb' },
        { label: 'Maximum Shear (Vu)', value: fx(Vu, 1), unit: 'lb' },
        { label: 'Design Shear Capacity (φVc)', value: fx(phiVc, 1), unit: 'lb', flag: shearOK ? 'pass' : 'fail' },
        { label: 'Maximum Sagging Moment (Mu)', value: fx(Mu, 1), unit: 'lb-ft' },
        { label: 'Maximum Hogging Moment', value: fx(Mneg, 1), unit: 'lb-ft' },
        { label: 'Provided Effective Depth (d)', value: fx(d, 4), unit: 'in' },
        { label: 'Minimum Waist Thickness', value: fx(tMin, 3), unit: 'in', flag: thickOK ? 'pass' : 'fail' },
        { label: 'As required — Flight', value: fx(AsFlight, 4), unit: 'in²/ft' },
        { label: 'As required — Landing / cantilever', value: fx(AsLanding, 4), unit: 'in²/ft' },
        { label: 'As,min = 0.0018 Ag', value: fx(AsMinSlab, 4), unit: 'in²/ft' },
        { label: 'Steel Ratio ρ / 0.75ρb', value: fx(rhoProv, 5) + ' / ' + fx(rhoMax, 5), flag: ductileOK ? 'pass' : 'fail' },
        { label: 'Main Bars — Flight', value: dbMain + ' mm @ ' + fx(sFlight, 2) + ' in c/c' },
        { label: 'Main Bars — Landing', value: dbMain + ' mm @ ' + fx(sLanding, 2) + ' in c/c' },
        { label: 'Distribution Bars', value: dbShear + ' mm @ ' + fx(sTemp, 2) + ' in c/c' },
        { label: 'Shear Reinforcement', value: needsStirrups ? 'REQUIRED (Vu > φVc/2)' : 'Not required (Vu ≤ φVc/2)', flag: needsStirrups ? 'warn' : 'pass' }
      ],
      steps: [
        {
          n: 1, title: 'Flight Geometry', status: 'pass',
          formula: 'Run  = tread × n_tread / 12\nRise = riser × n_riser / 12\nInclined length = √(Run² + Rise²)\nθ = atan(Rise / Run)',
          sub: 'Run  = ' + tread + ' × ' + nT + ' / 12 = ' + fx(Lh, 4) + ' ft\nRise = ' + riser + ' × ' + nR + ' / 12 = ' + fx(Hv, 4) + ' ft\nInclined = ' + fx(inc, 4) + ' ft,  cos θ = ' + fx(cosT, 5),
          res: 'θ = ' + fx(theta, 4) + '°'
        },
        {
          n: 2, title: 'Span Segmentation', status: 'pass',
          formula: cs.label,
          sub: 'L1 (start landing) = ' + fx(L1, 4) + ' ft\nL2 (flight run)    = ' + fx(L2, 4) + ' ft\nL3 (end landing)   = ' + fx(L3, 4) + ' ft\nSupports at x = ' + fx(xa, 3) + ' ft and x = ' + fx(xb, 3) + ' ft' +
            (cs.cantilever ? '\nSegment 3 cantilevers beyond the second support.' : ''),
          res: 'Effective span = ' + fx(Leff, 4) + ' ft'
        },
        {
          n: 3, title: 'Load Take-off', status: 'pass',
          formula: 'Waist  = (t/12) × γc\nSteps  = n × ½ × (T/12) × (R/12) × γc / inclined length\nWfi = 1.2 D + 1.6 L      Wfh = Wfi / cos θ\nWl  = 1.2 (waist + SDL) + 1.6 L',
          sub: 'Waist = (' + t + '/12) × ' + conc + ' = ' + fx(wWaist, 3) + ' lb/ft\nSteps = ' + fx(wSteps, 3) + ' lb/ft\nTotal D = ' + fx(totalDL, 3) + ' lb/ft, L = ' + ll + ' psf\nWfi = ' + fx(wfi, 3) + ' lb/ft',
          res: 'Wfh = ' + fx(wfh, 3) + ' lb/ft   |   Wl = ' + fx(wl, 3) + ' lb/ft'
        },
        {
          n: 4, title: 'Shear and Moment', status: pass(shearOK),
          formula: 'Reactions from statics on the three loaded segments,\nthen V and M integrated along the span.',
          sub: 'R1 = ' + fx(bm.Ra, 2) + ' lb,  R2 = ' + fx(bm.Rb, 2) + ' lb\nMaximum sagging moment at x = ' + fx(bm.MmaxX, 3) + ' ft' +
            (Mneg > 0 ? ('\nMaximum hogging moment at x = ' + fx(bm.MminX, 3) + ' ft') : ''),
          res: 'Vu = ' + fx(Vu, 1) + ' lb   |   Mu = ' + fx(Mu, 1) + ' lb-ft'
        },
        {
          n: 5, title: 'Waist Thickness and Effective Depth', status: pass(thickOK),
          formula: 'tmin = (L / 20) × (0.4 + fy/100000)     ACI 318 Table 9.5(a)\nd = t − cover − ds − db/2',
          sub: 'fy modifier = 0.4 + ' + fy + '/100000 = ' + fx(fyMod, 4) +
            '\ntmin = (' + fx(Leff, 3) + '/20) × 12 × ' + fx(fyMod, 4) + ' = ' + fx(tMin, 3) + ' in\nd = ' + t + ' − ' + cc + ' − ' + fx(dbShear / MM, 4) + ' − ' + fx(dbMain / (2 * MM), 4),
          res: 't = ' + fx(t, 2) + ' in ' + (thickOK ? '≥ ' : '< ') + fx(tMin, 2) + ' in   |   d = ' + fx(d, 4) + ' in'
        },
        {
          n: 6, title: 'Shear Check', status: pass(shearOK),
          formula: 'φVc = 2 φ λ √f\'c · b · d        (b = 12 in strip)\nShear reinforcement required when Vu > φVc / 2',
          sub: 'φVc = 2 × ' + phiV + ' × ' + lam + ' × √' + fc + ' × 12 × ' + fx(d, 4) + '\n     = ' + fx(phiVc, 1) + ' lb\nVu = ' + fx(Vu, 1) + ' lb,  φVc/2 = ' + fx(phiVc / 2, 1) + ' lb',
          res: (shearOK ? 'Vu ≤ φVc — OK' : 'Vu > φVc — INADEQUATE') + '  |  stirrups ' + (needsStirrups ? 'required' : 'not required')
        },
        {
          n: 7, title: 'Flexural Reinforcement', status: pass(ductileOK),
          formula: 'Solve  φ As fy (d − a/2) = Mu   with  a = As fy / (0.85 f\'c b)\nAs,min = 0.0018 Ag        (ACI 318 7.6.1.1, one-way slab)',
          sub: 'Flight  : As = ' + fx(solF.ok ? solF.As : 0, 5) + ' in²/ft,  a = ' + fx(solF.a, 4) + ' in' +
            '\nLanding : As = ' + fx(solL.ok ? solL.As : 0, 5) + ' in²/ft' +
            '\nAs,min (0.0018 Ag) = ' + fx(AsMinSlab, 5) + ' in²/ft' +
            '\nFor reference the beam expression max(3√f\'c/fy, 200/fy)·b·d gives ' + fx(AsMinBeam, 5) + ' in²/ft.' +
            '\nρ = ' + fx(rhoProv, 5) + ' against 0.75ρb = ' + fx(rhoMax, 5),
          res: 'As flight = ' + fx(AsFlight, 4) + ' in²/ft,  As landing = ' + fx(AsLanding, 4) + ' in²/ft'
        },
        {
          n: 8, title: 'Bar Spacing', status: 'pass',
          formula: 's = Ab × b / As\nCrack control : s = 15(40000/fs) − 2.5cc  ≤ 12(40000/fs),  fs = ⅔fy\nCode maximum  : s ≤ min(3t, 18 in)',
          sub: 'Ab(' + dbMain + ' mm) = ' + fx(AbMain, 5) + ' in²  (using the exact 25.4 mm/in factor)\nfs = ' + fx(fs, 1) + ' psi\nCrack control = ' + fx(sCrackRaw, 3) + ' in, capped at ' + fx(sCrackCap, 3) + ' in\nCode maximum  = ' + fx(sMaxCode, 3) + ' in\nFlight requirement = ' + fx(sFlightReq, 3) + ' in',
          res: 'Flight ' + dbMain + ' mm @ ' + fx(sFlight, 2) + ' in c/c   |   Landing ' + dbMain + ' mm @ ' + fx(sLanding, 2) + ' in c/c'
        },
        {
          n: 9, title: 'Distribution Steel', status: 'pass',
          formula: 'As,temp = 0.0018 × b × t        (ACI 318 7.6.4)\ns ≤ min(5t, 18 in)             (ACI 318 7.7.6.2.1)',
          sub: 'As,temp = 0.0018 × 12 × ' + t + ' = ' + fx(AsTemp, 5) + ' in²/ft\nMaximum spacing = min(5 × ' + t + ', 18) = ' + fx(sTempMax, 2) + ' in',
          res: dbShear + ' mm @ ' + fx(sTemp, 2) + ' in c/c'
        }
      ],
      warnings,
      table: {
        title: 'Shear and Moment Envelope',
        headers: ['x (ft)', 'Shear V (lb)', 'Moment M (lb-ft)'],
        rows: (function () {
          const out = [];
          const step = Math.max(1, Math.floor(bm.pts.length / 24));
          for (let i = 0; i < bm.pts.length; i += step) {
            const p = bm.pts[i];
            out.push([fx(p.x, 3), fx(p.V, 1), fx(p.M, 1)]);
          }
          const lastPt = bm.pts[bm.pts.length - 1];
          out.push([fx(lastPt.x, 3), fx(lastPt.V, 1), fx(lastPt.M, 1)]);
          return out;
        })(),
        foot: null
      },
      raw: {
        caseNo, Lh, Hv, inc, theta, cosT, L1, L2, L3, Leff, wWaist, wSteps, totalDL,
        wfi, wfh, wl, Ra: bm.Ra, Rb: bm.Rb, Vu, Mu, Mneg, d, t, tMin, phiVc, shearOK,
        AsFlight, AsLanding, AsMinSlab, AsMinBeam, sFlight, sLanding, sTemp, rhoProv, rhoMax, pts: bm.pts
      }
    };
  }

  /* =====================================================================
     C9 — CANTILEVER SLAB / BALCONY (WSD)
     Source workbook: C9-Cantilever-Slab-Balcony-Design-WSD
     ===================================================================== */
  function cantileverSlabWSD(inp) {
    const warnings = [];
    const fc = num(inp.fc, 2800);
    const fy = num(inp.fy, 60000);
    const sdl = num(inp.sdl, 115);      // psf
    const ll = num(inp.ll, 100);        // psf
    const L = num(inp.L, 4);            // ft
    const t = num(inp.t, 6);            // in
    const cc = num(inp.cover, 0.75);    // in
    const mainNo = num(inp.mainBar, 3.15);   // eighths of an inch
    const distNo = num(inp.distBar, 3.15);
    const conc = num(inp.concUW, 150);

    const fsAllow = 0.4 * fy;
    const fcAllow = 0.45 * fc;

    /* Modular ratio. The source workbook stepped n down through a nested
       IF chain that returned 0 for n below 6, which divided by zero for
       high strength concrete. ACI 318 App-A rounds to the nearest whole
       number with a floor of 6. */
    const nRaw = 29e6 / (57000 * Math.sqrt(fc));
    const n = Math.max(6, Math.round(nRaw));

    const dbMain = mainNo / 8;          // in
    const dbDist = distNo / 8;
    const d = t - cc - dbMain / 2;

    const dl = (t / 12) * conc + sdl;
    const w = dl + ll;
    const M = w * L * L / 2;            // lb-ft per ft width (cantilever)

    const r = fsAllow / fcAllow;
    const k = n / (n + r);
    const j = 1 - k / 3;
    const R = 0.5 * fcAllow * j * k;

    const b = 12;
    const dReq = Math.sqrt((M * 12) / (R * b));
    const depthOK = d >= dReq;
    if (!depthOK) warnings.push('Provided effective depth ' + fx(d, 3) + ' in is less than the required ' + fx(dReq, 3) + ' in. Increase the slab thickness.');

    const tMin = L / 10 * 12;           // ACI Table 9.5(a) cantilever
    const tMinOK = t >= tMin;
    if (!tMinOK) warnings.push('Slab thickness ' + fx(t, 2) + ' in is below the ACI cantilever minimum L/10 = ' + fx(tMin, 2) + ' in.');

    const AsMain = (M * 12) / (fsAllow * j * d);
    const AsDist = 0.0018 * b * t;      /* ACI 318 shrinkage and temperature for fy >= 60 ksi */

    const AbMain = Math.PI / 4 * dbMain * dbMain;
    const AbDist = Math.PI / 4 * dbDist * dbDist;

    /* ACI 318 7.7.2.3 caps slab reinforcement spacing at min(3h, 18 in) */
    const sMainCap = Math.min(2 * t, 18);
    const sDistCap = Math.min(3 * t, 18);
    const sMain = floorTo(Math.min(AbMain * b / AsMain, sMainCap), 0.25);
    const sDist = floorTo(Math.min(AbDist * b / AsDist, sDistCap), 0.25);

    const status = (depthOK && tMinOK) ? 'PASS' : 'FAIL';

    return {
      status,
      headline: 'Cantilever ' + fx(L, 2) + ' ft:  M = ' + fx(M, 0) + ' lb-ft/ft,  main #' + mainNo + ' @ ' +
        fx(sMain, 2) + ' in c/c  — ' + (status === 'PASS' ? 'SECTION ADEQUATE' : 'INCREASE THICKNESS'),
      results: [
        { label: 'Allowable Steel Stress fs = 0.40 fy', value: fx(fsAllow, 0), unit: 'psi' },
        { label: 'Allowable Concrete Stress fc = 0.45 f\'c', value: fx(fcAllow, 0), unit: 'psi' },
        { label: 'Modular Ratio n', value: String(n) + '  (exact ' + fx(nRaw, 4) + ')' },
        { label: 'Slab Thickness t', value: fx(t, 2), unit: 'in' },
        { label: 'Minimum Thickness L/10', value: fx(tMin, 3), unit: 'in', flag: tMinOK ? 'pass' : 'fail' },
        { label: 'Effective Depth d', value: fx(d, 4), unit: 'in' },
        { label: 'Dead Load', value: fx(dl, 2), unit: 'psf' },
        { label: 'Total Service Load w', value: fx(w, 2), unit: 'psf' },
        { label: 'Maximum Moment M = wL²/2', value: fx(M, 2), unit: 'lb-ft/ft' },
        { label: 'k = n/(n+r)', value: fx(k, 5) },
        { label: 'j = 1 − k/3', value: fx(j, 5) },
        { label: 'R = ½ fc j k', value: fx(R, 3), unit: 'psi' },
        { label: 'Required Depth d(req)', value: fx(dReq, 4), unit: 'in', flag: depthOK ? 'pass' : 'fail' },
        { label: 'Main Steel As', value: fx(AsMain, 4), unit: 'in²/ft' },
        { label: 'Distribution Steel As', value: fx(AsDist, 4), unit: 'in²/ft' },
        { label: 'Main Bars', value: '#' + mainNo + ' @ ' + fx(sMain, 2) + ' in c/c (top)' },
        { label: 'Distribution Bars', value: '#' + distNo + ' @ ' + fx(sDist, 2) + ' in c/c' }
      ],
      steps: [
        {
          n: 1, title: 'Working Stress Allowables', status: 'pass',
          formula: 'fs = 0.40 fy        fc = 0.45 f\'c\nn  = Es / (57000 √f\'c),  rounded, minimum 6',
          sub: 'fs = 0.40 × ' + fy + ' = ' + fx(fsAllow, 0) + ' psi\nfc = 0.45 × ' + fc + ' = ' + fx(fcAllow, 0) + ' psi\nn  = 29×10⁶ / (57000 √' + fc + ') = ' + fx(nRaw, 4),
          res: 'n = ' + n
        },
        {
          n: 2, title: 'Minimum Thickness and Effective Depth', status: pass(tMinOK),
          formula: 'tmin = L / 10        (ACI 318 Table 9.5(a), cantilever)\nd = t − cover − db/2',
          sub: 'tmin = ' + fx(L, 2) + ' / 10 × 12 = ' + fx(tMin, 3) + ' in\nd = ' + t + ' − ' + cc + ' − ' + fx(dbMain / 2, 4),
          res: 't = ' + fx(t, 2) + ' in,  d = ' + fx(d, 4) + ' in'
        },
        {
          n: 3, title: 'Loads and Cantilever Moment', status: 'pass',
          formula: 'DL = (t/12) γc + SDL\nw  = DL + LL\nM  = w L² / 2',
          sub: 'DL = (' + t + '/12) × ' + conc + ' + ' + sdl + ' = ' + fx(dl, 2) + ' psf\nw = ' + fx(dl, 2) + ' + ' + ll + ' = ' + fx(w, 2) + ' psf\nM = ' + fx(w, 2) + ' × ' + fx(L, 2) + '² / 2',
          res: 'M = ' + fx(M, 2) + ' lb-ft per ft width'
        },
        {
          n: 4, title: 'Elastic Section Constants', status: 'pass',
          formula: 'r = fs / fc        k = n / (n + r)        j = 1 − k/3\nR = ½ fc j k',
          sub: 'r = ' + fx(fsAllow, 0) + ' / ' + fx(fcAllow, 0) + ' = ' + fx(r, 5) + '\nk = ' + n + ' / (' + n + ' + ' + fx(r, 4) + ') = ' + fx(k, 5) + '\nj = ' + fx(j, 5),
          res: 'R = ' + fx(R, 4) + ' psi'
        },
        {
          n: 5, title: 'Depth Check', status: pass(depthOK),
          formula: 'd(req) = √( M / (R · b) )        b = 12 in strip',
          sub: 'd(req) = √( ' + fx(M * 12, 1) + ' / (' + fx(R, 3) + ' × 12) )',
          res: 'd(req) = ' + fx(dReq, 4) + ' in ' + (depthOK ? '≤ ' : '> ') + fx(d, 4) + ' in provided'
        },
        {
          n: 6, title: 'Reinforcement', status: 'pass',
          formula: 'As = M / (fs · j · d)\nAs,temp = 0.0018 b t        s ≤ min(3h, 18 in)',
          sub: 'As = ' + fx(M * 12, 1) + ' / (' + fx(fsAllow, 0) + ' × ' + fx(j, 4) + ' × ' + fx(d, 4) + ')\nAs,temp = 0.0018 × 12 × ' + t + '\nBar #' + mainNo + ' → db = ' + fx(dbMain, 4) + ' in, Ab = ' + fx(AbMain, 5) + ' in²',
          res: 'Main #' + mainNo + ' @ ' + fx(sMain, 2) + ' in c/c   |   Distribution #' + distNo + ' @ ' + fx(sDist, 2) + ' in c/c'
        }
      ],
      warnings, table: null,
      raw: { fsAllow, fcAllow, n, d, dl, w, M, k, j, R, dReq, AsMain, AsDist, sMain, sDist, tMin }
    };
  }

  /* =====================================================================
     E1 — BEAM SHEAR (STIRRUP) REINFORCEMENT
     Source workbook: E1-Shear-Reinforcement-Calculation-for-beam
     ===================================================================== */
  function beamShearRebar(inp) {
    const warnings = [];
    const bw = num(inp.bw, 12);            // in
    const h = num(inp.h, 24);              // in
    const frame = inp.frame || 'SMF';
    const fy = num(inp.fy, 72.5);          // ksi
    const covEff = num(inp.covEff, 3.3);   // in
    const legs = num(inp.legs, 2);
    const AvReq = num(inp.AvReq, 0.7);     // in^2 per ft, from the model
    const dbStirrup = num(inp.dbStirrup, 12);  // mm
    const dbLongMin = num(inp.dbLongMin, 16);  // mm

    const d = h - covEff;
    const Av = barAreaIn2(dbStirrup) * legs;   // in^2 of one stirrup set

    /* Spacing required to deliver the Av/s demanded by the analysis */
    const sDesign = AvReq > 0 ? Av * 12 / AvReq : Infinity;

    /* ACI 318 minimum shear steel : Av,min = 50 bw s / fy  →  s = Av fy / (50 bw) */
    const sMinSteel = Av * fy * 1000 / (50 * bw);

    /* Seismic detailing limits. All millimetre limits convert with the
       exact 25.4 factor; the source workbook divided by 25. */
    const isSMF = frame === 'SMF';
    const limits = [];
    limits.push({ v: sDesign, why: 'Required by the analysis, Av/s demand' });
    limits.push({ v: sMinSteel, why: 'ACI minimum shear steel, Av,min = 50 bw s / fy' });
    if (isSMF) {
      limits.push({ v: d / 4, why: 'ACI 318 18.6.4.4(a) — d/4' });
      limits.push({ v: 8 * dbLongMin / MM, why: 'ACI 318 18.6.4.4(b) — 8 × smallest longitudinal bar' });
      limits.push({ v: 24 * dbStirrup / MM, why: 'ACI 318 18.6.4.4(c) — 24 × hoop bar diameter' });
      limits.push({ v: 300 / MM, why: 'ACI 318 18.6.4.4(d) — 300 mm' });
    } else {
      limits.push({ v: d / 2, why: 'ACI 318 9.7.6.2.2 — d/2' });
      limits.push({ v: 600 / MM, why: 'ACI 318 9.7.6.2.2 — 600 mm' });
    }

    const govern = limits.reduce((a, x) => (x.v < a.v ? x : a), limits[0]);
    const sEnd = floorTo(govern.v, 0.25);

    /* Middle portion outside the hinge region */
    const sMidRaw = Math.min(d / 2, sDesign, sMinSteel);
    const sMid = floorTo(sMidRaw, 0.25);

    /* Hinge region length, ACI 318 18.6.4.1 */
    const hingeLen = 2 * h;

    if (sEnd <= 0) warnings.push('Governing spacing is not positive — check the Av demand and section dimensions.');
    if (sDesign < sEnd) warnings.push('The analysis demand governs over the detailing limits; confirm the section is large enough.');

    return {
      status: 'INFO',
      headline: 'End zone ' + dbStirrup + ' mm — ' + legs + ' legs @ ' + fx(sEnd, 2) +
        ' in c/c over ' + fx(hingeLen, 1) + ' in,  middle @ ' + fx(sMid, 2) + ' in c/c',
      results: [
        { label: 'Frame Type', value: isSMF ? 'Special Moment Frame' : (frame === 'IMF' ? 'Intermediate Moment Frame' : 'Other') },
        { label: 'Beam Size b × h', value: fx(bw, 1) + ' × ' + fx(h, 1), unit: 'in' },
        { label: 'Effective Depth d', value: fx(d, 3), unit: 'in' },
        { label: 'Stirrup Bar', value: dbStirrup + ' mm, ' + legs + ' legs' },
        { label: 'Area of one Stirrup Set Av', value: fx(Av, 5), unit: 'in²' },
        { label: 'Av/s Demand from Analysis', value: fx(AvReq, 3), unit: 'in²/ft' },
        { label: 'Spacing for Analysis Demand', value: fx(sDesign, 3), unit: 'in' },
        { label: 'Spacing for Minimum Shear Steel', value: fx(sMinSteel, 3), unit: 'in' },
        { label: 'Governing Limit', value: govern.why },
        { label: 'End Zone Spacing (provide)', value: fx(sEnd, 2), unit: 'in c/c' },
        { label: 'Middle Zone Spacing (provide)', value: fx(sMid, 2), unit: 'in c/c' },
        { label: 'Hinge Region Length 2h', value: fx(hingeLen, 2), unit: 'in' }
      ],
      steps: [
        {
          n: 1, title: 'Stirrup Area', status: 'pass',
          formula: 'Av = n_legs × π/4 × (db / 25.4)²',
          sub: 'db = ' + dbStirrup + ' mm → ' + fx(dbStirrup / MM, 5) + ' in\nAv = ' + legs + ' × ' + fx(barAreaIn2(dbStirrup), 5),
          res: 'Av = ' + fx(Av, 5) + ' in²'
        },
        {
          n: 2, title: 'Spacing from the Analysis Demand', status: 'pass',
          formula: 's = Av × 12 / (Av/s demand per foot)',
          sub: 'Demand = ' + fx(AvReq, 4) + ' in²/ft\ns = ' + fx(Av, 5) + ' × 12 / ' + fx(AvReq, 4),
          res: 's = ' + fx(sDesign, 3) + ' in'
        },
        {
          n: 3, title: 'Minimum Shear Reinforcement', status: 'pass',
          formula: 'Av,min = 50 bw s / fy    →    s = Av fy / (50 bw)',
          sub: 's = ' + fx(Av, 5) + ' × ' + fx(fy * 1000, 0) + ' / (50 × ' + fx(bw, 1) + ')',
          res: 's = ' + fx(sMinSteel, 3) + ' in'
        },
        {
          n: 4, title: 'Detailing Limits', status: 'pass',
          formula: isSMF
            ? 'ACI 318 18.6.4.4 hoops over 2h from the face of support:\ns ≤ d/4,  8db(long),  24db(hoop),  300 mm'
            : 'ACI 318 9.7.6.2.2:  s ≤ d/2 and s ≤ 600 mm',
          sub: limits.map(l => '  ' + fx(l.v, 3).padStart(8) + ' in   ' + l.why).join('\n') +
            '\n\nMillimetre limits convert at exactly 25.4 mm per inch.',
          res: 'Governing: ' + fx(govern.v, 3) + ' in — ' + govern.why
        },
        {
          n: 5, title: 'Provided Spacing', status: 'pass',
          formula: 'Round the governing spacing down to the nearest ¼ inch.',
          sub: 'End zone   : min of all limits = ' + fx(govern.v, 3) + ' in\nMiddle zone: min(d/2, analysis demand, minimum steel) = ' + fx(sMidRaw, 3) + ' in\nHinge region length = 2h = ' + fx(hingeLen, 2) + ' in from each support face.',
          res: 'End ' + fx(sEnd, 2) + ' in c/c   |   Middle ' + fx(sMid, 2) + ' in c/c'
        }
      ],
      warnings,
      table: {
        title: 'Spacing Limits Considered',
        headers: ['Limit (in)', 'Basis'],
        rows: limits.map(l => [fx(l.v, 3), l.why]),
        foot: [fx(govern.v, 3), 'GOVERNS']
      },
      raw: { d, Av, sDesign, sMinSteel, sEnd, sMid, hingeLen, limits, govern }
    };
  }

  /* =====================================================================
     E2 — COLUMN TIE / HOOP REINFORCEMENT
     Source workbook: E2-Shear-Reinforcement-Calculation-For-Column
     ===================================================================== */
  function columnTieRebar(inp) {
    const warnings = [];
    const c1 = num(inp.c1, 22);            // max dimension, in
    const c2 = num(inp.c2, 15);            // min dimension, in
    const clear = num(inp.clearSpan, 8.75); // ft
    const frame = inp.frame || 'SMF';
    const legs = num(inp.legs, 4);
    const AvReq = num(inp.AvReq, 0.5);     // in^2 per ft
    const dbTie = num(inp.dbTie, 10);      // mm
    const dbLongMin = num(inp.dbLongMin, 16); // mm

    const isSMF = frame === 'SMF';
    const Av = barAreaIn2(dbTie) * legs;
    const sDesign = AvReq > 0 ? Av * 12 / AvReq : Infinity;

    /* hx — maximum horizontal spacing of laterally supported bars, mm.
       ACI 318 18.7.5.3: so = 100 + (350 − hx)/3, bounded to 100–150 mm. */
    const hx = Math.min(Math.max(c1 / 3 * MM, c2 / 2 * MM), 350);
    const soRaw = 100 + (350 - hx) / 3;
    const so = Math.min(150, Math.max(100, soRaw));   // both bounds applied

    const limits = [];
    limits.push({ v: sDesign, why: 'Required by the analysis, Av/s demand' });
    if (isSMF) {
      limits.push({ v: c2 / 4, why: 'ACI 318 18.7.5.3(a) — ¼ of the least column dimension' });
      limits.push({ v: 6 * dbLongMin / MM, why: 'ACI 318 18.7.5.3(b) — 6 × longitudinal bar diameter' });
      limits.push({ v: so / MM, why: 'ACI 318 18.7.5.3(c) — so = 100 + (350 − hx)/3, bounded 100–150 mm' });
    } else {
      limits.push({ v: c2 / 2, why: 'ACI 318 — ½ of the least column dimension' });
      limits.push({ v: 8 * dbLongMin / MM, why: 'ACI 318 — 8 × longitudinal bar diameter' });
      limits.push({ v: 12, why: 'ACI 318 — 12 in' });
    }

    const govern = limits.reduce((a, x) => (x.v < a.v ? x : a), limits[0]);
    const sConfined = floorTo(govern.v, 0.25);
    const sMiddle = floorTo(Math.min(sConfined * 2, sDesign), 0.25);

    /* Confinement length Lo, ACI 318 18.7.5.1 */
    const lo1 = clear * 12 / 6;
    const lo2 = Math.max(c1, c2);
    const lo3 = 18;
    const Lo = Math.max(lo1, lo2, lo3);

    if (soRaw > 150) warnings.push('so from the ACI expression is ' + fx(soRaw, 1) + ' mm; the code caps it at 150 mm, which has been applied.');
    if (soRaw < 100) warnings.push('so from the ACI expression is ' + fx(soRaw, 1) + ' mm; the code floors it at 100 mm, which has been applied.');

    return {
      status: 'INFO',
      headline: 'Confined zone ' + dbTie + ' mm — ' + legs + ' legs @ ' + fx(sConfined, 2) +
        ' in c/c over Lo = ' + fx(Lo, 1) + ' in,  middle @ ' + fx(sMiddle, 2) + ' in c/c',
      results: [
        { label: 'Frame Type', value: isSMF ? 'Special Moment Frame' : 'Intermediate / Other' },
        { label: 'Column C1 × C2', value: fx(c1, 1) + ' × ' + fx(c2, 1), unit: 'in' },
        { label: 'Clear Span', value: fx(clear, 2), unit: 'ft' },
        { label: 'Tie Bar', value: dbTie + ' mm, ' + legs + ' legs' },
        { label: 'Area of one Tie Set Av', value: fx(Av, 5), unit: 'in²' },
        { label: 'Av/s Demand from Analysis', value: fx(AvReq, 3), unit: 'in²/ft' },
        { label: 'Spacing for Analysis Demand', value: fx(sDesign, 3), unit: 'in' },
        { label: 'hx', value: fx(hx, 2), unit: 'mm' },
        { label: 'so = 100 + (350 − hx)/3', value: fx(soRaw, 2) + ' → ' + fx(so, 2), unit: 'mm' },
        { label: 'Governing Limit', value: govern.why },
        { label: 'Confined Zone Spacing (provide)', value: fx(sConfined, 2), unit: 'in c/c' },
        { label: 'Middle Zone Spacing (provide)', value: fx(sMiddle, 2), unit: 'in c/c' },
        { label: 'Confinement Length Lo', value: fx(Lo, 2), unit: 'in' }
      ],
      steps: [
        {
          n: 1, title: 'Tie Area', status: 'pass',
          formula: 'Av = n_legs × π/4 × (db / 25.4)²',
          sub: 'db = ' + dbTie + ' mm, legs = ' + legs,
          res: 'Av = ' + fx(Av, 5) + ' in²'
        },
        {
          n: 2, title: 'Maximum Horizontal Bar Spacing hx', status: 'pass',
          formula: 'hx = min[ max(C1/3, C2/2), 350 mm ]',
          sub: 'C1/3 = ' + fx(c1 / 3 * MM, 2) + ' mm,  C2/2 = ' + fx(c2 / 2 * MM, 2) + ' mm',
          res: 'hx = ' + fx(hx, 2) + ' mm'
        },
        {
          n: 3, title: 'Confinement Spacing so', status: 'pass',
          formula: 'so = 100 + (350 − hx) / 3        with 100 mm ≤ so ≤ 150 mm\n(ACI 318 18.7.5.3(c))',
          sub: 'so = 100 + (350 − ' + fx(hx, 2) + ') / 3 = ' + fx(soRaw, 3) + ' mm\nBoth the lower bound of 100 mm and the upper bound of 150 mm are applied.',
          res: 'so = ' + fx(so, 2) + ' mm = ' + fx(so / MM, 3) + ' in'
        },
        {
          n: 4, title: 'Spacing Limits', status: 'pass',
          formula: isSMF
            ? 'ACI 318 18.7.5.3 within Lo:\ns ≤ ¼ × least column dimension\ns ≤ 6 × longitudinal bar diameter\ns ≤ so'
            : 'ACI 318:  s ≤ ½ least dimension, 8db(long), 12 in',
          sub: limits.map(l => '  ' + fx(l.v, 3).padStart(8) + ' in   ' + l.why).join('\n'),
          res: 'Governing: ' + fx(govern.v, 3) + ' in — ' + govern.why
        },
        {
          n: 5, title: 'Confinement Length Lo', status: 'pass',
          formula: 'Lo = max( clear span / 6,  largest column dimension,  18 in )\n(ACI 318 18.7.5.1)',
          sub: 'Clear span / 6 = ' + fx(clear, 2) + ' × 12 / 6 = ' + fx(lo1, 2) + ' in\nLargest dimension = ' + fx(lo2, 2) + ' in\nAbsolute minimum = ' + fx(lo3, 2) + ' in',
          res: 'Lo = ' + fx(Lo, 2) + ' in from each joint face'
        },
        {
          n: 6, title: 'Provided Spacing', status: 'pass',
          formula: 'Confined zone : governing limit rounded down to ¼ in\nMiddle zone   : min(2 × confined spacing, analysis demand)',
          sub: 'Confined = ' + fx(govern.v, 3) + ' → ' + fx(sConfined, 2) + ' in\nMiddle   = ' + fx(Math.min(sConfined * 2, sDesign), 3) + ' → ' + fx(sMiddle, 2) + ' in',
          res: 'Confined ' + fx(sConfined, 2) + ' in c/c   |   Middle ' + fx(sMiddle, 2) + ' in c/c'
        }
      ],
      warnings,
      table: {
        title: 'Spacing Limits Considered',
        headers: ['Limit (in)', 'Basis'],
        rows: limits.map(l => [fx(l.v, 3), l.why]),
        foot: [fx(govern.v, 3), 'GOVERNS']
      },
      raw: { Av, sDesign, hx, so, sConfined, sMiddle, Lo, limits, govern }
    };
  }

  /* =====================================================================
     E3 — SHEAR WALL DISTRIBUTED REBAR
     Source workbook: E3-Shear-Wall-Rebar-Calculation-ACI-318-14
     ===================================================================== */
  function shearWallRebar(inp) {
    const warnings = [];
    const unit = inp.unit || 'FPS';
    const toMM = v => (unit === 'MKS' ? v : v * MM);
    const toM = v => (unit === 'MKS' ? v : v * 0.3048);

    const Hm = toM(num(inp.H, 10));            // wall height, m
    const Lm = toM(num(inp.L, 15.833));        // wall length, m
    const tmm = toMM(num(inp.t, 8));           // wall thickness, mm

    const dv = num(inp.dv, 12);                // vertical bar dia, mm
    const dh = num(inp.dh, 10);                // horizontal bar dia, mm
    const Sv = num(inp.Sv, 10);                // provided vertical spacing (in or mm)
    const Sh = num(inp.Sh, 8);
    const SvMM = toMM(Sv), ShMM = toMM(Sh);

    const rhoMinV = num(inp.rhoV, 0.0025);
    const rhoMinH = num(inp.rhoH, 0.0025);

    /* Steel demanded by the analysis. Av is the TOTAL vertical steel over
       the whole wall length; Ah is the horizontal steel per unit height. */
    const AvTot = num(inp.AvTot, 0);        // in^2 (FPS) or mm^2 (MKS), whole wall
    const AhRate = num(inp.AhRate, 0);      // in^2/ft (FPS) or mm^2/m (MKS)

    /* Two curtains of reinforcement */
    const Av2 = 2 * Math.PI / 4 * dv * dv;     // mm^2 per spacing
    const Ah2 = 2 * Math.PI / 4 * dh * dh;

    const rhoV = Av2 / (SvMM * tmm);
    const rhoH = Ah2 / (ShMM * tmm);
    const vOK = rhoV >= rhoMinV;
    const hOK = rhoH >= rhoMinH;

    /* Spacing required to just reach the minimum ratio */
    const SvReqRhoMM = Av2 / (rhoMinV * tmm);
    const ShReqRhoMM = Ah2 / (rhoMinH * tmm);

    /* Spacing required to deliver the analysis demand */
    const Av2Disp = (unit === 'MKS') ? Av2 : Av2 / (MM * MM);          // mm^2 or in^2
    const Ah2Disp = Av2Disp * (dh * dh) / (dv * dv);
    const wallLenDisp = (unit === 'MKS') ? Lm * 1000 : Lm / 0.3048 * 12;   // mm or in
    const perUnit = (unit === 'MKS') ? 1000 : 12;                        // mm per m, in per ft
    const SvDemandMM = AvTot > 0 ? toMM(Av2Disp * wallLenDisp / AvTot) : Infinity;
    const ShDemandMM = AhRate > 0 ? toMM(Ah2Disp * perUnit / AhRate) : Infinity;

    const SvReqMM = Math.min(SvReqRhoMM, SvDemandMM);
    const ShReqMM = Math.min(ShReqRhoMM, ShDemandMM);
    const vDemandOK = SvMM <= SvDemandMM;
    const hDemandOK = ShMM <= ShDemandMM;

    /* ACI 318-14 11.7.2.1 / 11.7.3.1 maximum spacing.
       The 18 in absolute limit converts at exactly 25.4 mm per inch. */
    const IN18 = 18 * MM;
    const vLimits = [
      { v: 3 * tmm, why: '3 × wall thickness' },
      { v: IN18, why: '18 in (457 mm)' },
      { v: Lm * 1000 / 3, why: 'lw / 3' }
    ];
    const hLimits = [
      { v: 3 * tmm, why: '3 × wall thickness' },
      { v: IN18, why: '18 in (457 mm)' },
      { v: Lm * 1000 / 5, why: 'lw / 5' }
    ];
    const svMax = vLimits.reduce((a, x) => (x.v < a.v ? x : a), vLimits[0]);
    const shMax = hLimits.reduce((a, x) => (x.v < a.v ? x : a), hLimits[0]);

    const svMaxOK = SvMM <= svMax.v;
    const shMaxOK = ShMM <= shMax.v;

    if (!vOK) warnings.push('Vertical reinforcement ratio ' + fx(rhoV, 5) + ' is below the minimum ' + fx(rhoMinV, 4) + '. Reduce the spacing to ' + fx(unit === 'MKS' ? SvReqMM : SvReqMM / MM, 2) + (unit === 'MKS' ? ' mm' : ' in') + ' or smaller.');
    if (!hOK) warnings.push('Horizontal reinforcement ratio ' + fx(rhoH, 5) + ' is below the minimum ' + fx(rhoMinH, 4) + '.');
    if (!svMaxOK) warnings.push('Vertical spacing exceeds the ACI maximum of ' + fx(unit === 'MKS' ? svMax.v : svMax.v / MM, 2) + (unit === 'MKS' ? ' mm' : ' in') + ' (' + svMax.why + ').');
    if (!shMaxOK) warnings.push('Horizontal spacing exceeds the ACI maximum of ' + fx(unit === 'MKS' ? shMax.v : shMax.v / MM, 2) + (unit === 'MKS' ? ' mm' : ' in') + ' (' + shMax.why + ').');

    if (!vDemandOK) warnings.push('Vertical spacing exceeds what the analysis demand of ' + fx(AvTot, 3) + ' requires (' + fx(unit === 'MKS' ? SvDemandMM : SvDemandMM / MM, 2) + (unit === 'MKS' ? ' mm' : ' in') + ').');
    if (!hDemandOK) warnings.push('Horizontal spacing exceeds what the analysis demand of ' + fx(AhRate, 3) + ' requires (' + fx(unit === 'MKS' ? ShDemandMM : ShDemandMM / MM, 2) + (unit === 'MKS' ? ' mm' : ' in') + ').');

    const U = unit === 'MKS' ? 'mm' : 'in';
    const disp = v => (isFinite(v) ? fx(unit === 'MKS' ? v : v / MM, 2) : 'n/a');
    const status = (vOK && hOK && svMaxOK && shMaxOK && vDemandOK && hDemandOK) ? 'PASS' : 'FAIL';

    return {
      status,
      headline: 'Vertical ' + dv + ' mm @ ' + fx(Sv, 2) + ' ' + U + ' (ρ = ' + fx(rhoV, 5) + '),  Horizontal ' +
        dh + ' mm @ ' + fx(Sh, 2) + ' ' + U + ' (ρ = ' + fx(rhoH, 5) + ')',
      results: [
        { label: 'Wall Height', value: fx(Hm, 3), unit: 'm' },
        { label: 'Wall Length lw', value: fx(Lm, 3), unit: 'm' },
        { label: 'Wall Thickness t', value: fx(tmm, 2), unit: 'mm' },
        { label: 'Curtains', value: '2 (each face)' },
        { label: 'Vertical Bar', value: dv + ' mm @ ' + fx(Sv, 2) + ' ' + U },
        { label: 'Vertical Steel Ratio ρv', value: fx(rhoV, 5), flag: vOK ? 'pass' : 'fail' },
        { label: 'Minimum ρv', value: fx(rhoMinV, 4) },
        { label: 'Spacing to reach minimum ρv', value: disp(SvReqRhoMM), unit: U },
        { label: 'Spacing for the analysis demand (vertical)', value: disp(SvDemandMM), unit: U, flag: vDemandOK ? 'pass' : 'fail' },
        { label: 'Maximum Vertical Spacing', value: disp(svMax.v) + ' ' + U + '  (' + svMax.why + ')', flag: svMaxOK ? 'pass' : 'fail' },
        { label: 'Horizontal Bar', value: dh + ' mm @ ' + fx(Sh, 2) + ' ' + U },
        { label: 'Horizontal Steel Ratio ρh', value: fx(rhoH, 5), flag: hOK ? 'pass' : 'fail' },
        { label: 'Minimum ρh', value: fx(rhoMinH, 4) },
        { label: 'Spacing to reach minimum ρh', value: disp(ShReqRhoMM), unit: U },
        { label: 'Spacing for the analysis demand (horizontal)', value: disp(ShDemandMM), unit: U, flag: hDemandOK ? 'pass' : 'fail' },
        { label: 'Maximum Horizontal Spacing', value: disp(shMax.v) + ' ' + U + '  (' + shMax.why + ')', flag: shMaxOK ? 'pass' : 'fail' }
      ],
      steps: [
        {
          n: 1, title: 'Steel Area per Spacing', status: 'pass',
          formula: 'A = 2 × π/4 × db²        (two curtains, one bar each face)',
          sub: 'Vertical   : 2 × π/4 × ' + dv + '² = ' + fx(Av2, 2) + ' mm²\nHorizontal : 2 × π/4 × ' + dh + '² = ' + fx(Ah2, 2) + ' mm²',
          res: 'Av = ' + fx(Av2, 2) + ' mm²,  Ah = ' + fx(Ah2, 2) + ' mm²'
        },
        {
          n: 2, title: 'Provided Reinforcement Ratios', status: pass(vOK && hOK),
          formula: 'ρ = A / (s × t)',
          sub: 'ρv = ' + fx(Av2, 2) + ' / (' + fx(SvMM, 2) + ' × ' + fx(tmm, 2) + ') = ' + fx(rhoV, 6) +
            '\nρh = ' + fx(Ah2, 2) + ' / (' + fx(ShMM, 2) + ' × ' + fx(tmm, 2) + ') = ' + fx(rhoH, 6),
          res: 'ρv = ' + fx(rhoV, 5) + (vOK ? ' ≥ ' : ' < ') + fx(rhoMinV, 4) + '   |   ρh = ' + fx(rhoH, 5) + (hOK ? ' ≥ ' : ' < ') + fx(rhoMinH, 4)
        },
        {
          n: 2.5, title: 'Spacing from the Analysis Demand', status: pass(vDemandOK && hDemandOK),
          formula: 'Vertical   : s = A(2 curtains) × wall length / Av(total)\nHorizontal : s = A(2 curtains) × unit height / Ah(per unit height)',
          sub: (AvTot > 0
            ? ('Av demand = ' + fx(AvTot, 4) + ' over a wall length of ' + fx(wallLenDisp, 2) + ' ' + U +
               '\ns = ' + fx(Av2Disp, 5) + ' × ' + fx(wallLenDisp, 2) + ' / ' + fx(AvTot, 4) + ' = ' + disp(SvDemandMM) + ' ' + U)
            : 'No total vertical steel demand entered — only the minimum ratio governs.') +
            '\n' + (AhRate > 0
            ? ('Ah demand = ' + fx(AhRate, 4) + ' per unit height\ns = ' + disp(ShDemandMM) + ' ' + U)
            : 'No horizontal steel demand entered — only the minimum ratio governs.'),
          res: 'Vertical ' + disp(SvDemandMM) + ' ' + U + '   |   Horizontal ' + disp(ShDemandMM) + ' ' + U
        },
        {
          n: 3, title: 'Maximum Spacing — Vertical Bars', status: pass(svMaxOK),
          formula: 's ≤ min( 3t,  18 in,  lw/3 )        (ACI 318-14 11.7.2.1)',
          sub: vLimits.map(l => '  ' + fx(l.v, 1).padStart(9) + ' mm   ' + l.why).join('\n') +
            '\n\n18 in converts at exactly 25.4 mm per inch = ' + fx(IN18, 1) + ' mm.',
          res: 'Maximum = ' + disp(svMax.v) + ' ' + U + ' (' + svMax.why + ')'
        },
        {
          n: 4, title: 'Maximum Spacing — Horizontal Bars', status: pass(shMaxOK),
          formula: 's ≤ min( 3t,  18 in,  lw/5 )        (ACI 318-14 11.7.3.1)',
          sub: hLimits.map(l => '  ' + fx(l.v, 1).padStart(9) + ' mm   ' + l.why).join('\n'),
          res: 'Maximum = ' + disp(shMax.v) + ' ' + U + ' (' + shMax.why + ')'
        }
      ],
      warnings, table: null,
      raw: {
        Hm, Lm, tmm, rhoV, rhoH, SvReqRhoMM, ShReqRhoMM, SvDemandMM, ShDemandMM,
        SvReqMM, ShReqMM, Av2, Ah2, svMax, shMax, vOK, hOK, svMaxOK, shMaxOK, vDemandOK, hDemandOK
      }
    };
  }

  /* =====================================================================
     E4 — DEVELOPMENT AND SPLICE LENGTHS  (ACI 318M Chapter 25 / 12)
     Source workbook: E4-DEVELOPMENT-AND-SPLICES-OF-REINFORCEMENT
     ===================================================================== */
  function developmentLength(inp) {
    const warnings = [];
    const fy = num(inp.fy, 413.89);       // MPa
    const fc = num(inp.fc, 24);           // MPa
    const psiT = num(inp.psiT, 1.0);      // top bar factor
    const psiE = num(inp.psiE, 1.0);      // epoxy coating factor
    const lam = num(inp.lambda, 1.0);     // lightweight factor
    const bars = (inp.bars && inp.bars.length) ? inp.bars : [10, 12, 14, 16, 18, 20, 22, 25, 28, 32];

    /* ACI 318M simplified tension development, Table 25.4.2.2 */
    const ldRatio = (db, top) => {
      const pt = top ? Math.max(psiT, 1.3) : psiT;
      const denom = (db <= 20) ? 2.1 : 1.7;
      return fy * pt * psiE / (denom * lam * Math.sqrt(fc));
    };

    /* Compression development, ACI 318M 25.4.9.2 */
    const ldcRatio = Math.max(0.24 * fy / (lam * Math.sqrt(fc)), 0.043 * fy);

    /* Standard hook, ACI 318M 25.4.3.1. This uses the epoxy factor psi_e,
       not the top-bar factor psi_t — the source workbook referenced psi_t
       in this expression. */
    const ldhRatio = 0.24 * psiE * fy / (lam * Math.sqrt(fc));

    /* Compression lap splice, ACI 318M 25.5.5.1 */
    let lscRatio = (fy <= 420) ? 0.071 * fy : (0.13 * fy - 24);
    const lowFc = fc < 21;
    if (lowFc) lscRatio *= (4 / 3);   /* increased by one third for f'c < 21 MPa */

    const rows = bars.map(db => {
      const ld = ldRatio(db, false) * db;
      const ldTop = ldRatio(db, true) * db;
      const ldh = Math.max(ldhRatio * db, 8 * db, 150);
      const ldc = Math.max(ldcRatio * db, 200);
      const lsc = Math.max(lscRatio * db, 300);
      return [
        String(db),
        fx(Math.max(ld, 300), 0),
        fx(ldh, 0),
        fx(Math.max(ld, 300), 0),
        fx(1.3 * Math.max(ld, 300), 0),
        fx(Math.max(ldTop, 300), 0),
        fx(1.3 * Math.max(ldTop, 300), 0),
        fx(ldc, 0),
        fx(lsc, 0)
      ];
    });

    if (lowFc) warnings.push("f'c is below 21 MPa, so the compression lap splice length has been increased by one third per ACI 318M 25.5.5.1.");
    if (fy > 550) warnings.push('fy above 550 MPa falls outside the range of the simplified development length expressions.');

    const db20 = 20;
    return {
      status: 'INFO',
      headline: 'Ld/db = ' + fx(ldRatio(16, false), 2) + ' for bars ≤ 20 mm and ' + fx(ldRatio(25, false), 2) +
        ' for bars > 20 mm,  Ldc/db = ' + fx(ldcRatio, 2) + ',  Ldh/db = ' + fx(ldhRatio, 2),
      results: [
        { label: 'Steel Yield Strength fy', value: fx(fy, 2), unit: 'MPa' },
        { label: "Concrete Strength f'c", value: fx(fc, 2), unit: 'MPa' },
        { label: 'Top Bar Factor ψt', value: fx(psiT, 2) },
        { label: 'Coating Factor ψe', value: fx(psiE, 2) },
        { label: 'Lightweight Factor λ', value: fx(lam, 2) },
        { label: 'Ld/db — bars ≤ 20 mm', value: fx(ldRatio(16, false), 3) },
        { label: 'Ld/db — bars > 20 mm', value: fx(ldRatio(25, false), 3) },
        { label: 'Ld/db — top bars ≤ 20 mm', value: fx(ldRatio(16, true), 3) },
        { label: 'Ld/db — top bars > 20 mm', value: fx(ldRatio(25, true), 3) },
        { label: 'Ldc/db (compression)', value: fx(ldcRatio, 3) },
        { label: 'Ldh/db (standard hook)', value: fx(ldhRatio, 3) },
        { label: 'Compression splice /db', value: fx(lscRatio, 3) + (lowFc ? '  (+⅓ for f\'c < 21 MPa)' : '') },
        { label: 'Class A Tension Splice', value: '1.0 × Ld' },
        { label: 'Class B Tension Splice', value: '1.3 × Ld' }
      ],
      steps: [
        {
          n: 1, title: 'Tension Development Length', status: 'pass',
          formula: "db ≤ 20 mm :  Ld/db = fy ψt ψe / (2.1 λ √f'c)\ndb > 20 mm :  Ld/db = fy ψt ψe / (1.7 λ √f'c)\nLd ≥ 300 mm        (ACI 318M Table 25.4.2.2)",
          sub: "fy = " + fx(fy, 2) + " MPa,  f'c = " + fx(fc, 2) + " MPa,  √f'c = " + fx(Math.sqrt(fc), 4) +
            '\nψt = ' + fx(psiT, 2) + ',  ψe = ' + fx(psiE, 2) + ',  λ = ' + fx(lam, 2),
          res: 'Ld/db = ' + fx(ldRatio(16, false), 4) + ' (≤20 mm)  and  ' + fx(ldRatio(25, false), 4) + ' (>20 mm)'
        },
        {
          n: 2, title: 'Top Bar Modification', status: 'pass',
          formula: 'ψt = 1.3 where more than 300 mm of fresh concrete is cast below the bar.',
          sub: 'Top bar Ld/db = ' + fx(ldRatio(16, true), 4) + ' (≤20 mm) and ' + fx(ldRatio(25, true), 4) + ' (>20 mm)',
          res: 'Top bar lengths are tabulated separately below.'
        },
        {
          n: 3, title: 'Compression Development Length', status: 'pass',
          formula: "Ldc/db = max( 0.24 fy / (λ √f'c),  0.043 fy )\nLdc ≥ 200 mm        (ACI 318M 25.4.9.2)",
          sub: "0.24 × " + fx(fy, 2) + " / √" + fx(fc, 2) + " = " + fx(0.24 * fy / (lam * Math.sqrt(fc)), 4) +
            '\n0.043 × ' + fx(fy, 2) + ' = ' + fx(0.043 * fy, 4),
          res: 'Ldc/db = ' + fx(ldcRatio, 4)
        },
        {
          n: 4, title: 'Standard Hook Development', status: 'pass',
          formula: "Ldh/db = 0.24 ψe fy / (λ √f'c)\nLdh ≥ max(8db, 150 mm)        (ACI 318M 25.4.3.1)",
          sub: 'The hook expression carries the coating factor ψe, not the top-bar factor ψt.\n0.24 × ' + fx(psiE, 2) + ' × ' + fx(fy, 2) + ' / √' + fx(fc, 2),
          res: 'Ldh/db = ' + fx(ldhRatio, 4)
        },
        {
          n: 5, title: 'Splice Lengths', status: 'pass',
          formula: 'Tension     : Class A = 1.0 Ld,  Class B = 1.3 Ld        (ACI 318M 25.5.2.1)\nCompression : fy ≤ 420 MPa → 0.071 fy db\n              fy > 420 MPa → (0.13 fy − 24) db\n              increased by ⅓ when f\'c < 21 MPa,  ≥ 300 mm',
          sub: 'fy = ' + fx(fy, 2) + ' MPa selects the ' + (fy <= 420 ? '0.071 fy' : '(0.13 fy − 24)') + ' branch.' +
            (lowFc ? "\nf'c = " + fx(fc, 2) + " MPa < 21 MPa, so the ⅓ increase applies." : ''),
          res: 'Compression splice / db = ' + fx(lscRatio, 4)
        }
      ],
      warnings,
      table: {
        title: 'Minimum Development and Splice Lengths (mm)',
        headers: ['Bar (mm)', 'Ld', 'Hook Ldh', 'Splice A', 'Splice B', 'Top Ld', 'Top Splice B', 'Ldc', 'Comp. Splice'],
        rows, foot: null
      },
      raw: { ldRatio: ldRatio(16, false), ldRatioBig: ldRatio(25, false), ldcRatio, ldhRatio, lscRatio, rows }
    };
  }

  /* =====================================================================
     F1 — FOUNDATION ESTIMATING AND COSTING
     Source workbook: F1-Foundation-Estimating-and-Costing
     ===================================================================== */
  function foundationEstimate(inp) {
    const warnings = [];
    const L = num(inp.L, 6), B = num(inp.B, 4);        // ft
    const depth = num(inp.depth, 3);                    // ft below EGL
    const tRCC = num(inp.tRCC, 12);                     // in
    const tCS = num(inp.tCS, 3);                        // in cement/sand soling
    const tBS = num(inp.tBS, 3);                        // in brick soling
    const cut = num(inp.sideCut, 12);                   // in working space each side
    const cover = num(inp.sideCover, 3);                // in clear cover
    const nBot = num(inp.nBotL, 10), dBotL = num(inp.dBotL, 16);
    const nBotB = num(inp.nBotB, 15), dBotB = num(inp.dBotB, 12);
    const hasTop = inp.hasTop !== false;
    const nTopL = num(inp.nTopL, 12), dTopL = num(inp.dTopL, 16);
    const nTopB = num(inp.nTopB, 15), dTopB = num(inp.dTopB, 20);
    const dryFactor = num(inp.dryFactor, 1.5);
    const cftPerBag = num(inp.cftPerBag, 1.25);
    const aggregate = inp.aggregate || 'Brick';

    const rcc = [num(inp.rccC, 1), num(inp.rccS, 1.5), num(inp.rccK, 3)];
    const cs = [num(inp.csC, 1), num(inp.csS, 3), num(inp.csK, 6)];
    const bs = [num(inp.bsC, 1), num(inp.bsS, 5)];

    const price = {
      cement: num(inp.pCement, 500), sandC: num(inp.pSandC, 35), sandL: num(inp.pSandL, 15),
      stone: num(inp.pStone, 171), brickChip: num(inp.pBrickChip, 90),
      steel: num(inp.pSteel, 96000), brick: num(inp.pBrick, 10),
      shutter: num(inp.pShutter, 15), earth: num(inp.pEarth, 5)
    };

    /* Quantities */
    const shutter = (2 * L + 2 * B) * ((tRCC + tCS) / 12);       // sq.ft
    const earth = (depth + (tRCC + tCS + tBS) / 12) * (L + cut / 12) * (B + cut / 12);  // cft
    const volRCC = (tRCC / 12) * L * B;                          // cft
    const volCS = (tCS / 12) * L * B;
    const volBS = (tBS / 12) * L * B;

    /* Bar lengths. Hook allowance is converted to feet — the source
       workbook added the top-bar hook in inches directly to a length in
       feet, inflating every top bar by about eleven inches. */
    const hookTop = d => 1.5 * d / MM / 12;      // ft
    const hookBot = d => 2 * 9 * d / (MM * 12);  // ft, 9db standard hook each end

    const lenTopL = hasTop ? nTopL * (L - cover * 2 / 12 + hookTop(dTopL)) : 0;
    const lenTopB = hasTop ? nTopB * (B - cover * 2 / 12 + hookTop(dTopB)) : 0;
    const lenBotL = nBot * (L - cover * 2 / 12 + hookBot(dBotL));
    const lenBotB = nBotB * (B - cover * 2 / 12 + hookBot(dBotB));

    /* Weight. d^2/162 kg/m is the standard shortcut; per foot that is
       d^2/531.5. The source workbook used 533. */
    const kgPerFt = (d, len) => (d * d / 162) * 0.3048 * len;
    const wTopL = kgPerFt(dTopL, lenTopL), wTopB = kgPerFt(dTopB, lenTopB);
    const wBotL = kgPerFt(dBotL, lenBotL), wBotB = kgPerFt(dBotB, lenBotB);
    const steelKg = wTopL + wTopB + wBotL + wBotB;

    /* Materials */
    const mix = (vol, ratio) => {
      const dry = vol * dryFactor;
      const sum = ratio.reduce((a, b) => a + b, 0);
      return {
        cement: dry * ratio[0] / sum / cftPerBag,
        sand: dry * ratio[1] / sum,
        khoa: ratio.length > 2 ? dry * ratio[2] / sum : 0
      };
    };
    const mRCC = mix(volRCC, rcc);
    const mCS = mix(volCS, cs);
    /* Brick soling uses a 0.35 mortar allowance of the gross volume */
    const bsSum = bs[0] + bs[1];
    const mBS = { cement: (volBS * 0.35 * bs[0] / bsSum) / cftPerBag, sand: volBS * 0.35 * bs[1] / bsSum };
    const bricks = volBS * num(inp.bricksPerCft, 12);

    const cement = mRCC.cement + mCS.cement + mBS.cement;
    const sandCoarse = mRCC.sand + mCS.sand;
    const sandLocal = mBS.sand;
    const khoa = mRCC.khoa + mCS.khoa;

    const items = [
      ['Cement', fx(cement, 3), 'bags', fx(price.cement, 2), fx(cement * price.cement, 2)],
      ['Sand (coarse)', fx(sandCoarse, 3), 'cft', fx(price.sandC, 2), fx(sandCoarse * price.sandC, 2)],
      ['Sand (local)', fx(sandLocal, 3), 'cft', fx(price.sandL, 2), fx(sandLocal * price.sandL, 2)],
      [aggregate === 'Stone' ? 'Stone chips' : 'Brick chips', fx(khoa, 3), 'cft',
        fx(aggregate === 'Stone' ? price.stone : price.brickChip, 2),
        fx(khoa * (aggregate === 'Stone' ? price.stone : price.brickChip), 2)],
      ['Reinforcement steel', fx(steelKg / 1000, 4), 'tonne', fx(price.steel, 2), fx(steelKg / 1000 * price.steel, 2)],
      ['Bricks', fx(bricks, 0), 'nos', fx(price.brick, 2), fx(bricks * price.brick, 2)],
      ['Shuttering', fx(shutter, 2), 'sq.ft', fx(price.shutter, 2), fx(shutter * price.shutter, 2)],
      ['Earthwork', fx(earth, 2), 'cft', fx(price.earth, 2), fx(earth * price.earth, 2)]
    ];
    const total = cement * price.cement + sandCoarse * price.sandC + sandLocal * price.sandL +
      khoa * (aggregate === 'Stone' ? price.stone : price.brickChip) +
      steelKg / 1000 * price.steel + bricks * price.brick +
      shutter * price.shutter + earth * price.earth;

    return {
      status: 'INFO',
      headline: 'Total foundation cost ≈ ' + fx(total, 2) + '  |  concrete ' + fx(volRCC, 2) +
        ' cft,  steel ' + fx(steelKg, 2) + ' kg,  earthwork ' + fx(earth, 2) + ' cft',
      results: [
        { label: 'Footing Plan L × B', value: fx(L, 2) + ' × ' + fx(B, 2), unit: 'ft' },
        { label: 'Shuttering Area', value: fx(shutter, 3), unit: 'sq.ft' },
        { label: 'Earthwork Volume', value: fx(earth, 3), unit: 'cft' },
        { label: 'RCC Volume', value: fx(volRCC, 3), unit: 'cft' },
        { label: 'CC Soling Volume', value: fx(volCS, 3), unit: 'cft' },
        { label: 'Brick Soling Volume', value: fx(volBS, 3), unit: 'cft' },
        { label: 'Bottom Steel — L direction', value: fx(lenBotL, 2) + ' ft of ' + dBotL + ' mm = ' + fx(wBotL, 2) + ' kg' },
        { label: 'Bottom Steel — B direction', value: fx(lenBotB, 2) + ' ft of ' + dBotB + ' mm = ' + fx(wBotB, 2) + ' kg' },
        { label: 'Top Steel — L direction', value: hasTop ? (fx(lenTopL, 2) + ' ft of ' + dTopL + ' mm = ' + fx(wTopL, 2) + ' kg') : 'none' },
        { label: 'Top Steel — B direction', value: hasTop ? (fx(lenTopB, 2) + ' ft of ' + dTopB + ' mm = ' + fx(wTopB, 2) + ' kg') : 'none' },
        { label: 'Total Reinforcement', value: fx(steelKg, 3), unit: 'kg' },
        { label: 'Cement', value: fx(cement, 3), unit: 'bags' },
        { label: 'Sand (coarse / local)', value: fx(sandCoarse, 2) + ' / ' + fx(sandLocal, 2), unit: 'cft' },
        { label: aggregate === 'Stone' ? 'Stone chips' : 'Brick chips', value: fx(khoa, 3), unit: 'cft' },
        { label: 'Bricks', value: fx(bricks, 0), unit: 'nos' },
        { label: 'TOTAL COST', value: fx(total, 2) }
      ],
      steps: [
        {
          n: 1, title: 'Shuttering and Earthwork', status: 'pass',
          formula: 'Shuttering = (2L + 2B) × (t_RCC + t_CS) / 12\nEarthwork  = (depth + Σt/12) × (L + cut/12) × (B + cut/12)',
          sub: 'Shuttering = (2×' + fx(L, 2) + ' + 2×' + fx(B, 2) + ') × (' + tRCC + ' + ' + tCS + ')/12\nEarthwork  = (' + fx(depth, 2) + ' + ' + fx((tRCC + tCS + tBS) / 12, 3) + ') × ' + fx(L + cut / 12, 3) + ' × ' + fx(B + cut / 12, 3),
          res: 'Shuttering = ' + fx(shutter, 3) + ' sq.ft   |   Earthwork = ' + fx(earth, 3) + ' cft'
        },
        {
          n: 2, title: 'Concrete Volumes', status: 'pass',
          formula: 'Volume = (thickness / 12) × L × B',
          sub: 'RCC        = (' + tRCC + '/12) × ' + fx(L, 2) + ' × ' + fx(B, 2) + ' = ' + fx(volRCC, 3) + ' cft\nCC soling  = ' + fx(volCS, 3) + ' cft\nBrick soling = ' + fx(volBS, 3) + ' cft',
          res: 'Total concrete = ' + fx(volRCC + volCS + volBS, 3) + ' cft'
        },
        {
          n: 3, title: 'Reinforcement Lengths', status: 'pass',
          formula: 'Bottom bar = n × (span − 2 × cover/12 + 2 × 9db/12)\nTop bar    = n × (span − 2 × cover/12 + 1.5db/12)\nAll hook allowances are converted to feet before being added.',
          sub: 'Bottom L : ' + nBot + ' × (' + fx(L, 2) + ' − ' + fx(cover * 2 / 12, 4) + ' + ' + fx(hookBot(dBotL), 4) + ') = ' + fx(lenBotL, 3) + ' ft\n' +
            'Bottom B : ' + nBotB + ' × (' + fx(B, 2) + ' − ' + fx(cover * 2 / 12, 4) + ' + ' + fx(hookBot(dBotB), 4) + ') = ' + fx(lenBotB, 3) + ' ft' +
            (hasTop ? ('\nTop L    : ' + fx(lenTopL, 3) + ' ft\nTop B    : ' + fx(lenTopB, 3) + ' ft') : '\nNo top reinforcement.'),
          res: 'Total bar length = ' + fx(lenBotL + lenBotB + lenTopL + lenTopB, 2) + ' ft'
        },
        {
          n: 4, title: 'Reinforcement Weight', status: 'pass',
          formula: 'Weight (kg/m) = d² / 162        →        kg = (d²/162) × 0.3048 × length(ft)',
          sub: 'Bottom L : ' + fx(wBotL, 3) + ' kg\nBottom B : ' + fx(wBotB, 3) + ' kg' +
            (hasTop ? ('\nTop L    : ' + fx(wTopL, 3) + ' kg\nTop B    : ' + fx(wTopB, 3) + ' kg') : ''),
          res: 'Total steel = ' + fx(steelKg, 3) + ' kg = ' + fx(steelKg / 1000, 4) + ' tonne'
        },
        {
          n: 5, title: 'Material Take-off', status: 'pass',
          formula: 'Dry volume = wet volume × ' + fx(dryFactor, 2) + '\nCement bags = dry × (C / ΣRatio) / ' + fx(cftPerBag, 2) + '\nSand, aggregate = dry × (part / ΣRatio)',
          sub: 'RCC mix ' + rcc.join(':') + '  →  cement ' + fx(mRCC.cement, 3) + ' bags, sand ' + fx(mRCC.sand, 3) + ' cft, aggregate ' + fx(mRCC.khoa, 3) + ' cft\n' +
            'CC mix ' + cs.join(':') + '  →  cement ' + fx(mCS.cement, 3) + ' bags, sand ' + fx(mCS.sand, 3) + ' cft, aggregate ' + fx(mCS.khoa, 3) + ' cft\n' +
            'Brick soling mortar ' + bs.join(':') + '  →  cement ' + fx(mBS.cement, 3) + ' bags, sand ' + fx(mBS.sand, 3) + ' cft',
          res: 'Cement ' + fx(cement, 3) + ' bags  |  Sand ' + fx(sandCoarse + sandLocal, 2) + ' cft  |  Aggregate ' + fx(khoa, 2) + ' cft'
        },
        {
          n: 6, title: 'Costing', status: 'pass',
          formula: 'Cost = Σ (quantity × unit rate)',
          sub: 'Aggregate type selected: ' + aggregate,
          res: 'Total = ' + fx(total, 2)
        }
      ],
      warnings,
      table: {
        title: 'Bill of Quantities',
        headers: ['Material', 'Quantity', 'Unit', 'Rate', 'Amount'],
        rows: items,
        foot: ['', '', '', 'TOTAL', fx(total, 2)]
      },
      raw: { shutter, earth, volRCC, volCS, volBS, steelKg, cement, sandCoarse, sandLocal, khoa, bricks, total, items }
    };
  }

  /* =====================================================================
     C1 / C2 — TWO-WAY SLAB BY THE ACI MOMENT COEFFICIENT METHOD
     Source workbooks: C1-Two-Way-Slab-Design-WSD, C2-Two-Way-Slab-Design-USD
     ===================================================================== */
  function twoWaySlabCoeff(inp) {
    const warnings = [];
    const method = inp.method || 'USD';
    const fc = num(inp.fc, 2800);
    const fy = num(inp.fy, 60000);
    const sdl = num(inp.sdl, 25);
    const ll = num(inp.ll, 40);
    const A = num(inp.A, 19.25);        // short span, ft (centre to centre)
    const B = num(inp.B, 20.5);         // long span, ft
    const X = num(inp.X, 8.5);          // half of the continuous panel, ft
    const bw = num(inp.bw, 10);         // beam width, in
    const bh = num(inp.bh, 18);         // beam depth, in
    const barNo = num(inp.barNo, 3.15); // eighths of an inch
    const tTrial = num(inp.t, 6);
    const cover = num(inp.cover, 0.75);
    const caseNo = Math.round(num(inp.caseNo, 4));
    const conc = num(inp.concUW, 150);

    const wallLen = num(inp.wallLen, 29.83);
    const wallTh = num(inp.wallTh, 0.5);
    const wallHt = num(inp.wallHt, 9.5);
    const wallUW = num(inp.wallUW, 120);

    if (B < A) warnings.push('The long span is shorter than the short span — swap the two values.');
    const ratioBA = A > 0 ? B / A : 0;
    const twoWay = ratioBA <= 2;
    if (!twoWay) warnings.push('B/A = ' + fx(ratioBA, 3) + ' exceeds 2, so the panel behaves as a one-way slab and the coefficient method does not apply.');

    /* ---- Minimum thickness, ACI 318 Eq 9-12 / 9-13 ------------------ */
    const IbEdge = 1.5 * bw * Math.pow(bh, 3) / 12;
    const IbInt = 2 * bw * Math.pow(bh, 3) / 12;
    /* Slab strip second moment. With the span expressed in feet the
       factor of 12 from b in inches cancels the /12 of bt^3/12. */
    const Is1 = B * Math.pow(tTrial, 3);
    const Is2 = A * Math.pow(tTrial, 3);
    const Is3 = X * Math.pow(tTrial, 3);
    const a1 = Is1 > 0 ? IbInt / Is1 : 0;
    const a2 = Is2 > 0 ? IbInt / Is2 : 0;
    const a3 = Is3 > 0 ? IbEdge / Is3 : 0;
    const aM = (a1 + a2 + a3) / 3;
    /* A and B are the clear spans face to face of beams, which is what
       both ACI Method 2 and the source workbook use throughout. */
    const clearL = B, clearS = A;
    const beta = clearS > 0 ? clearL / clearS : 1;

    const numer = clearL * 12 * (0.8 + fy / 200000);
    const hLow = Math.max(numer / (36 + 5 * beta * (aM - 0.2)), 5);
    const hHigh = Math.max(numer / (36 + 9 * beta), 3.5433);
    const hMin = (aM < 2) ? hLow : hHigh;
    const t = Math.max(tTrial, Math.ceil(hMin * 4) / 4);
    const thickOK = tTrial >= hMin;
    if (!thickOK) warnings.push('Trial thickness ' + fx(tTrial, 2) + ' in is below the ACI minimum ' + fx(hMin, 3) + ' in; ' + fx(t, 2) + ' in has been adopted.');

    /* ---- Effective depths ------------------------------------------- */
    const db = barNo / 8;
    const dShort = t - cover - db / 2;
    const dLong = dShort - db;

    /* ---- Loads ------------------------------------------------------- */
    const wallLoad = (A * B) > 0 ? (wallLen * wallTh * wallHt * wallUW) / (A * B) : 0;
    const DL = (t / 12) * conc + wallLoad + sdl;
    const W = (method === 'USD') ? (1.2 * DL + 1.6 * ll) : (DL + ll);

    /* ---- Moment coefficients ---------------------------------------- */
    const m = B > 0 ? A / B : 1;
    const CaNeg = D.slabCoeff('CA_NEG', m, caseNo, 'floor');
    const CbNeg = D.slabCoeff('CB_NEG', m, caseNo, 'ceil');
    const CaDL = D.slabCoeff('CA_DL', m, caseNo, 'floor');
    const CbDL = D.slabCoeff('CB_DL', m, caseNo, 'ceil');
    const CaLL = D.slabCoeff('CA_LL', m, caseNo, 'floor');
    const CbLL = D.slabCoeff('CB_LL', m, caseNo, 'ceil');

    /* Positive moments are split into their dead and live parts because
       the coefficients differ, but each part still carries its load
       factor under USD. The source USD workbook applied the factors to
       the negative moments only and used service DL and LL for the
       positive moments, which under-designs the bottom steel. */
    const DLf = (method === 'USD') ? 1.2 * DL : DL;
    const LLf = (method === 'USD') ? 1.6 * ll : ll;

    const MAneg = CaNeg * W * A * A;
    const MApos = CaLL * LLf * A * A + CaDL * DLf * A * A;
    const MBneg = CbNeg * W * B * B;
    const MBpos = CbLL * LLf * B * B + CbDL * DLf * B * B;
    /* A discontinuous end carries one third of the adjacent positive moment */
    const MAnegDis = MApos / 3;
    const MBnegDis = MBpos / 3;

    const Mmax = Math.max(MAneg, MApos, MBneg, MBpos);

    /* ---- Section capacity check ------------------------------------- */
    let dReq, R, phi = 0.9, jj = 0, kk = 0, nMod = 0;
    if (method === 'USD') {
      const beta1 = 0.85;
      const rho = 0.85 * beta1 * (fc / fy) * (0.003 / (0.003 + 0.004));
      R = rho * fy * (1 - (0.59 * rho * fy) / fc);
      dReq = Math.sqrt((Mmax * 12) / (phi * R * 12));
    } else {
      const fsA = 0.4 * fy, fcA = 0.45 * fc;
      nMod = Math.max(6, Math.round(29e6 / (57000 * Math.sqrt(fc))));
      const r = fsA / fcA;
      kk = nMod / (nMod + r);
      jj = 1 - kk / 3;
      R = 0.5 * fcA * jj * kk;
      dReq = Math.sqrt((Mmax * 12) / (R * 12));
    }
    const depthOK = dLong >= dReq;
    if (!depthOK) warnings.push('Effective depth in the long direction (' + fx(dLong, 3) + ' in) is less than the required ' + fx(dReq, 3) + ' in. Increase the slab thickness.');

    /* ---- Reinforcement ------------------------------------------- */
    const bStrip = 12;
    const AsMin = (fy >= 60000 ? 0.0018 : 0.0020) * bStrip * t;
    const solve = (M, d) => {
      if (method === 'USD') {
        const s = asFromMoment(M * 12, bStrip, d, fc, fy, phi);
        return Math.max(s.ok ? s.As : 0, AsMin);
      }
      const fsA = 0.4 * fy;
      return Math.max((M * 12) / (fsA * jj * d), AsMin);
    };

    const AsAneg = solve(MAneg, dShort);
    const AsApos = solve(MApos, dShort);
    const AsBneg = solve(MBneg, dLong);
    const AsBpos = solve(MBpos, dLong);
    const AsAnegDis = solve(MAnegDis, dShort);
    const AsBnegDis = solve(MBnegDis, dLong);

    const Ab = Math.PI / 4 * db * db;
    const sMax = Math.min(2 * t, 18);   /* ACI 318 8.7.2.2 for two-way slabs */
    const spacing = As => floorTo(Math.min(Ab * bStrip / As, sMax), 0.25);

    const rows = [
      ['Short A — negative at continuous edge', fx(MAneg, 1), fx(AsAneg, 4), fx(spacing(AsAneg), 2)],
      ['Short A — positive at midspan', fx(MApos, 1), fx(AsApos, 4), fx(spacing(AsApos), 2)],
      ['Short A — negative at discontinuous edge', fx(MAnegDis, 1), fx(AsAnegDis, 4), fx(spacing(AsAnegDis), 2)],
      ['Long B — negative at continuous edge', fx(MBneg, 1), fx(AsBneg, 4), fx(spacing(AsBneg), 2)],
      ['Long B — positive at midspan', fx(MBpos, 1), fx(AsBpos, 4), fx(spacing(AsBpos), 2)],
      ['Long B — negative at discontinuous edge', fx(MBnegDis, 1), fx(AsBnegDis, 4), fx(spacing(AsBnegDis), 2)]
    ];

    const status = (twoWay && depthOK) ? 'PASS' : 'FAIL';

    return {
      status,
      headline: (method === 'USD' ? 'USD' : 'WSD') + ' two-way slab, ' + D.SLAB_CASE_NAMES[caseNo - 1] +
        ':  t = ' + fx(t, 2) + ' in,  Mmax = ' + fx(Mmax, 0) + ' lb-ft/ft  — ' +
        (status === 'PASS' ? 'SECTION ADEQUATE' : 'REVIEW SECTION'),
      results: [
        { label: 'Design Method', value: method === 'USD' ? 'Ultimate Strength Design' : 'Working Stress Design' },
        { label: 'Panel Case', value: D.SLAB_CASE_NAMES[caseNo - 1] },
        { label: 'Short Span A / Long Span B', value: fx(A, 2) + ' / ' + fx(B, 2), unit: 'ft' },
        { label: 'B / A Ratio', value: fx(ratioBA, 4) + (twoWay ? '  ≤ 2 → two-way' : '  > 2 → one-way'), flag: twoWay ? 'pass' : 'fail' },
        { label: 'Span Ratio m = A/B', value: fx(m, 4) },
        { label: 'Beam Stiffness Ratio αm', value: fx(aM, 4) },
        { label: 'Clear Span Ratio β', value: fx(beta, 4) },
        { label: 'Minimum Thickness hmin', value: fx(hMin, 3), unit: 'in', flag: thickOK ? 'pass' : 'warn' },
        { label: 'Adopted Thickness t', value: fx(t, 2), unit: 'in' },
        { label: 'Effective Depth — short / long', value: fx(dShort, 4) + ' / ' + fx(dLong, 4), unit: 'in' },
        { label: 'Wall Load on Panel', value: fx(wallLoad, 3), unit: 'psf' },
        { label: 'Dead Load DL', value: fx(DL, 3), unit: 'psf' },
        { label: 'Design Load W', value: fx(W, 3), unit: 'psf' },
        { label: 'Ca,neg / Cb,neg', value: fx(CaNeg, 4) + ' / ' + fx(CbNeg, 4) },
        { label: 'Ca,DL / Cb,DL', value: fx(CaDL, 4) + ' / ' + fx(CbDL, 4) },
        { label: 'Ca,LL / Cb,LL', value: fx(CaLL, 4) + ' / ' + fx(CbLL, 4) },
        { label: 'Maximum Moment', value: fx(Mmax, 2), unit: 'lb-ft/ft' },
        { label: 'Required Depth d(req)', value: fx(dReq, 4), unit: 'in', flag: depthOK ? 'pass' : 'fail' },
        { label: 'Minimum Steel As,min', value: fx(AsMin, 4), unit: 'in²/ft' },
        { label: 'Maximum Bar Spacing', value: fx(sMax, 2), unit: 'in' }
      ],
      steps: [
        {
          n: 1, title: 'Panel Classification', status: pass(twoWay),
          formula: 'Two-way action when B / A ≤ 2',
          sub: 'A (short) = ' + fx(A, 3) + ' ft,  B (long) = ' + fx(B, 3) + ' ft\nB / A = ' + fx(ratioBA, 4),
          res: twoWay ? 'Two-way slab confirmed' : 'One-way slab — use a one-way design'
        },
        {
          n: 2, title: 'Minimum Slab Thickness', status: pass(thickOK),
          formula: 'Ib(interior) = 2 bw h³/12,  Ib(edge) = 1.5 bw h³/12\nα = Ib / Is,   β = clear long span / clear short span\nαm ≤ 2 : h = ln(0.8 + fy/200000) / (36 + 5β(αm − 0.2)) ≥ 125 mm\nαm > 2 : h = ln(0.8 + fy/200000) / (36 + 9β)          ≥ 90 mm',
          sub: 'Ib interior = ' + fx(IbInt, 1) + ' in⁴,  Ib edge = ' + fx(IbEdge, 1) + ' in⁴\nα1 = ' + fx(a1, 4) + ',  α2 = ' + fx(a2, 4) + ',  α3 = ' + fx(a3, 4) + '  →  αm = ' + fx(aM, 4) +
            '\nβ = ' + fx(clearL, 3) + ' / ' + fx(clearS, 3) + ' = ' + fx(beta, 4) +
            '\n' + (aM < 2 ? 'αm ≤ 2 branch' : 'αm > 2 branch') + ' governs',
          res: 'hmin = ' + fx(hMin, 3) + ' in  →  adopt t = ' + fx(t, 2) + ' in'
        },
        {
          n: 3, title: 'Loads', status: 'pass',
          formula: 'Wall load = (length × thickness × height × unit weight) / panel area\nDL = (t/12) γc + wall load + SDL\n' +
            (method === 'USD' ? 'W = 1.2 DL + 1.6 LL' : 'W = DL + LL'),
          sub: 'Wall = (' + fx(wallLen, 2) + ' × ' + fx(wallTh, 2) + ' × ' + fx(wallHt, 2) + ' × ' + fx(wallUW, 0) + ') / (' + fx(A, 2) + ' × ' + fx(B, 2) + ') = ' + fx(wallLoad, 3) + ' psf\n' +
            'Slab = (' + fx(t, 2) + '/12) × ' + fx(conc, 0) + ' = ' + fx((t / 12) * conc, 3) + ' psf\nSDL = ' + fx(sdl, 2) + ' psf,  LL = ' + fx(ll, 2) + ' psf',
          res: 'DL = ' + fx(DL, 3) + ' psf,  W = ' + fx(W, 3) + ' psf'
        },
        {
          n: 4, title: 'Moment Coefficients', status: 'pass',
          formula: 'm = A / B\nCa reads the table at the floor of m, Cb at the ceiling.',
          sub: 'm = ' + fx(m, 5) + '  →  Ca read at m = ' + fx(Math.floor(m / 0.05) * 0.05, 2) + ', Cb read at m = ' + fx(Math.ceil(m / 0.05) * 0.05, 2) +
            '\n' + D.SLAB_CASE_NAMES[caseNo - 1] +
            '\nCa,neg = ' + fx(CaNeg, 4) + '  Cb,neg = ' + fx(CbNeg, 4) +
            '\nCa,DL  = ' + fx(CaDL, 4) + '  Cb,DL  = ' + fx(CbDL, 4) +
            '\nCa,LL  = ' + fx(CaLL, 4) + '  Cb,LL  = ' + fx(CbLL, 4),
          res: 'Coefficients read from the ACI Method 2 tables'
        },
        {
          n: 5, title: 'Design Moments', status: 'pass',
          formula: 'M(neg) = C(neg) × W × L²\nM(pos) = C(LL) × LL × L² + C(DL) × DL × L²\nDiscontinuous edge negative moment = ⅓ × adjacent positive moment',
          sub: 'MA,neg = ' + fx(CaNeg, 4) + ' × ' + fx(W, 2) + ' × ' + fx(A, 2) + '² = ' + fx(MAneg, 2) + ' lb-ft\n' +
            'MA,pos = ' + fx(MApos, 2) + ' lb-ft\n' +
            'MB,neg = ' + fx(MBneg, 2) + ' lb-ft\n' +
            'MB,pos = ' + fx(MBpos, 2) + ' lb-ft',
          res: 'Mmax = ' + fx(Mmax, 2) + ' lb-ft per ft width'
        },
        {
          n: 6, title: 'Depth Check', status: pass(depthOK),
          formula: method === 'USD'
            ? "ρ = 0.85 β₁ (f'c/fy) × 0.003/(0.003+0.004)\nR = ρ fy (1 − 0.59 ρ fy / f'c)\nd(req) = √( Mmax / (φ R b) )"
            : 'n = Es/Ec rounded, k = n/(n+r), j = 1 − k/3\nR = ½ fc j k\nd(req) = √( Mmax / (R b) )',
          sub: method === 'USD'
            ? 'R = ' + fx(R, 3) + ' psi,  φ = ' + fx(phi, 2)
            : 'n = ' + nMod + ',  k = ' + fx(kk, 5) + ',  j = ' + fx(jj, 5) + ',  R = ' + fx(R, 3) + ' psi',
          res: 'd(req) = ' + fx(dReq, 4) + ' in ' + (depthOK ? '≤ ' : '> ') + fx(dLong, 4) + ' in provided'
        },
        {
          n: 7, title: 'Reinforcement and Spacing', status: 'pass',
          formula: (method === 'USD'
            ? 'Solve φ As fy (d − a/2) = M for As\n'
            : 'As = M / (fs j d)\n') +
            'As,min = 0.0018 b t for fy ≥ 60 ksi, 0.0020 b t otherwise\ns ≤ min(2t, 18 in)        (ACI 318 8.7.2.2)',
          sub: 'Bar #' + barNo + ' → db = ' + fx(db, 4) + ' in, Ab = ' + fx(Ab, 5) + ' in²\nAs,min = ' + fx(AsMin, 5) + ' in²/ft\nMaximum spacing = ' + fx(sMax, 2) + ' in',
          res: 'See the reinforcement schedule'
        }
      ],
      warnings,
      table: {
        title: 'Reinforcement Schedule (per foot width)',
        headers: ['Location', 'Moment (lb-ft)', 'As (in²/ft)', 'Spacing (in c/c)'],
        rows, foot: null
      },
      raw: {
        method, A, B, m, ratioBA, twoWay, aM, beta, hMin, t, dShort, dLong,
        wallLoad, DL, W, CaNeg, CbNeg, CaDL, CbDL, CaLL, CbLL,
        MAneg, MApos, MBneg, MBpos, MAnegDis, MBnegDis, Mmax, dReq, R,
        AsAneg, AsApos, AsBneg, AsBpos, AsMin, depthOK
      }
    };
  }

  return {
    stairDesign, cantileverSlabWSD, beamShearRebar, columnTieRebar,
    shearWallRebar, developmentLength, foundationEstimate, twoWaySlabCoeff,
    STAIR_CASES, solveBeam, asFromMoment
  };
})();

if (typeof window !== 'undefined') window.BNBCDesign = BNBCDesign;
if (typeof module !== 'undefined' && module.exports) module.exports = BNBCDesign;
