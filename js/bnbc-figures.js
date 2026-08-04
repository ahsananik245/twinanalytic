/* =====================================================================
   TwinAnalytic — Calculator Figures
   ---------------------------------------------------------------------
   One figure builder per calculator. Each takes the result envelope from
   the engine and a host element, and draws from the data the engine has
   already computed — the stair shear and moment envelope, the circular
   column interaction curve, the wind pressure profile and so on, all of
   which were previously discarded after the summary table was built.
   ===================================================================== */

const BNBCFigures = (function () {
  'use strict';

  const D = (typeof BNBCDraw !== 'undefined') ? BNBCDraw : null;
  const C = D ? D.colors : {};

  /* Split a host into stacked figure slots */
  function slots(host, n) {
    host.innerHTML = '';
    const out = [];
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      d.className = 'figure-slot';
      host.appendChild(d);
      out.push(d);
    }
    return out;
  }

  /* ---------------- A1 seismic ---------------- */
  function seismic(res, host) {
    const r = res.raw, st = r.storeys || [];
    if (!st.length) { host.innerHTML = ''; return; }
    const s = slots(host, 2);

    D.storeyProfile(s[0], st.map(x => ({ name: x.name, value: x.Fx })), {
      title: 'Storey Force Distribution (Fx)',
      xLabel: 'Lateral force at each level, kN'
    });

    /* Response spectrum with the building period marked */
    const soil = { TB: r.TB, TC: r.TC, TD: r.TD, S: r.S };
    const pts = [];
    for (let t = 0.01; t <= 4; t += 0.01) {
      let cs;
      if (t <= soil.TB) cs = soil.S * (1 + (t / soil.TB) * (2.5 * r.eta - 1));
      else if (t <= soil.TC) cs = 2.5 * soil.S * r.eta;
      else if (t <= soil.TD) cs = 2.5 * soil.S * r.eta * (soil.TC / t);
      else cs = 2.5 * soil.S * r.eta * (soil.TC * soil.TD / (t * t));
      pts.push([t, cs]);
    }
    D.chart(s[1], [{ pts: pts, color: C.GOLD, fill: 'rgba(201,168,76,0.10)', label: 'Cs' }], {
      title: 'Normalised Response Spectrum',
      xLabel: 'Period T (s)', yLabel: 'Cs',
      yFrom0: true, xFrom0: true, height: 250,
      vLines: [{ x: r.T, label: 'T = ' + D.fmt(r.T) + ' s', color: C.RED }],
      markers: [{ x: r.T, y: r.Cs, label: 'Cs = ' + D.fmt(r.Cs) }]
    });
  }

  /* ---------------- A2 wind ---------------- */
  function wind(res, host) {
    const r = res.raw;
    const lv = (r.levels || []).slice().sort((a, b) => a - b);
    if (!lv.length) { host.innerHTML = ''; return; }
    const s = slots(host, 1);
    const ex = r.ex;
    const Kz = z => 2.01 * Math.pow(Math.max(z, 4.57) / ex.zg, 2 / ex.alpha);
    const q = z => 0.000613 * Kz(z) * 1 * 0.85 * r.V * r.V;
    const pos = lv.map(z => [q(z) * r.G * r.CpW - r.qh * r.GCpi, z]);
    const neg = lv.map(z => [q(z) * r.G * r.CpW + r.qh * r.GCpi, z]);

    D.chart(s[0], [
      { pts: pos, color: C.GOLD, label: 'p with +GCpi', dots: 2.5 },
      { pts: neg, color: C.BLUE, label: 'p with −GCpi', dots: 2.5 }
    ], {
      title: 'Windward Pressure Profile',
      xLabel: 'Design pressure (kN/m²)', yLabel: 'Height above ground (m)',
      xFrom0: true, yFrom0: true, height: 320,
      hLines: [{ y: r.h, label: 'mean roof h = ' + D.fmt(r.h) + ' m', color: C.GREEN }]
    });
  }

  /* ---------------- B1 P-delta ---------------- */
  function pdelta(res, host) {
    const lv = res.raw.levels || [];
    if (!lv.length) { host.innerHTML = ''; return; }
    const s = slots(host, 1);
    D.storeyProfile(s[0], lv.map(x => ({ name: x.name, value: x.theta })), {
      title: 'Stability Coefficient θ by Storey',
      xLabel: 'θ  (0.10 = P-Δ may be neglected)',
      limit: res.raw.thetaMax,
      limitLabel: 'θmax = ' + D.fmt(res.raw.thetaMax)
    });
  }

  /* ---------------- B3/B6 drift ---------------- */
  function drift(res, host) {
    const lv = res.raw.levels || [];
    if (!lv.length) { host.innerHTML = ''; return; }
    const s = slots(host, 2);
    D.storeyProfile(s[0], lv.map(x => ({ name: x.name, value: x.ratio })), {
      title: 'Storey Drift Ratio',
      xLabel: 'Δ / hsx',
      limit: res.raw.limitRatio,
      limitLabel: 'allowable ' + D.fmt(res.raw.limitRatio)
    });
    const sway = lv.map(x => [x.dxe, x.cumH]);
    const allow = lv.map(x => [x.swayAllow, x.cumH]);
    D.chart(s[1], [
      { pts: sway, color: C.GOLD, label: 'elastic displacement', dots: 2.5 },
      { pts: allow, color: C.RED, dash: '5 3', label: 'H/' + D.fmt(res.raw.totalH * 1000 / (lv[lv.length - 1].swayAllow)) }
    ], {
      title: 'Total Sway against the Serviceability Limit',
      xLabel: 'Displacement (mm)', yLabel: 'Height above base (m)',
      xFrom0: true, yFrom0: true, height: 280
    });
  }

  /* ---------------- B4 soft storey ---------------- */
  function softStorey(res, host) {
    const lv = res.raw.levels || [];
    if (!lv.length) { host.innerHTML = ''; return; }
    const s = slots(host, 2);
    D.storeyProfile(s[0], lv.slice().reverse().map(x => ({ name: x.name, value: x.K })), {
      title: 'Storey Stiffness', xLabel: 'Ki'
    });
    const withR = lv.filter(x => x.r1 !== null);
    D.storeyProfile(s[1], withR.slice().reverse().map(x => ({ name: x.name, value: x.r1 })), {
      title: 'Stiffness Ratio against the Storey Above',
      xLabel: 'Ki / Ki₊₁   (soft below 0.70)',
      limit: 0.70, limitLabel: 'soft storey 0.70'
    });
  }

  /* ---------------- B5 torsion ---------------- */
  function torsion(res, host) {
    const cs = res.raw.cases || [];
    if (!cs.length) { host.innerHTML = ''; return; }
    const s = slots(host, 1);
    D.storeyProfile(s[0], cs.map(x => ({ name: (x.name || '') + ' ' + (x.dir || ''), value: x.ratio })), {
      title: 'Torsional Irregularity Ratio by Load Case',
      xLabel: 'Δmax / Δavg',
      limit: 1.2, limitLabel: 'irregular > 1.2'
    });
  }

  /* ---------------- B7 overturning ---------------- */
  function overturning(res, host) {
    const lv = res.raw.levels || [];
    if (!lv.length) { host.innerHTML = ''; return; }
    const s = slots(host, 1);
    D.storeyProfile(s[0], lv.map(x => ({ name: x.name, value: x.contrib })), {
      title: 'Overturning Moment Contribution by Level',
      xLabel: 'Moment about the base (kN·m)'
    });
  }

  /* ---------------- B2 base shear ---------------- */
  function baseShear(res, host) {
    const r = res.raw;
    const s = slots(host, 2);
    D.storeyProfile(s[0], [
      { name: 'Model V/W', value: r.ratioModel },
      { name: 'Code V/W', value: r.ratioCode }
    ], {
      title: 'Base Shear Coefficient — Model against Code',
      xLabel: 'V / W',
      limit: r.ratioCode, limitLabel: 'code minimum'
    });

    /* Where the building period lands on the spectrum */
    const pts = [];
    for (let t = 0.01; t <= 4; t += 0.01) {
      const scale = r.T > 0 ? r.Cs / csAt(r.T, r) : 1;
      pts.push([t, csAt(t, r) * (isFinite(scale) ? scale : 1)]);
    }
    D.chart(s[1], [{ pts: pts, color: C.GOLD, fill: 'rgba(201,168,76,0.10)' }], {
      title: 'Building Period on the Response Spectrum',
      xLabel: 'Period T (s)', yLabel: 'Cs', height: 240, yFrom0: true, xFrom0: true,
      vLines: [{ x: r.T, label: 'T = ' + D.fmt(r.T) + ' s', color: C.RED }],
      markers: [{ x: r.T, y: r.Cs, label: 'Cs = ' + D.fmt(r.Cs) }]
    });
  }

  /* Shape of the spectrum, used where the engine only returns the value at T */
  function csAt(t, r) {
    const TB = 0.2, TC = 0.8, TD = 2.0;
    if (t <= TB) return 1 + (t / TB) * 1.5;
    if (t <= TC) return 2.5;
    if (t <= TD) return 2.5 * (TC / t);
    return 2.5 * (TC * TD / (t * t));
  }

  /* ---------------- D stair ---------------- */
  function stair(res, host) {
    const r = res.raw, pts = r.pts || [];
    if (!pts.length) { host.innerHTML = ''; return; }
    const s = slots(host, 2);
    D.chart(s[0], [{ pts: pts.map(p => [p.x, p.V]), color: C.BLUE, fill: 'rgba(79,134,198,0.18)' }], {
      title: 'Shear Force Diagram',
      xLabel: 'Distance along the stair (ft)', yLabel: 'V (lb)',
      height: 210, xFrom0: true
    });
    D.chart(s[1], [{ pts: pts.map(p => [p.x, p.M]), color: C.GOLD, fill: 'rgba(201,168,76,0.16)' }], {
      title: 'Bending Moment Diagram',
      xLabel: 'Distance along the stair (ft)', yLabel: 'M (lb-ft)',
      height: 210, xFrom0: true,
      markers: [{ x: r.MmaxX !== undefined ? r.MmaxX : 0, y: r.Mu, label: 'Mmax = ' + D.fmt(r.Mu), color: C.RED }]
    });
  }

  /* ---------------- C5 circular column ---------------- */
  function circularColumn(res, host) {
    const r = res.raw, pts = r.pts || [];
    if (!pts.length) { host.innerHTML = ''; return; }
    const s = slots(host, 2);

    const curve = pts.map(p => [p.phiMn, Math.min(p.phiPn, r.phiPmax)]);
    const nominal = pts.map(p => [p.Mn, p.Pn]);
    D.chart(s[0], [
      { pts: nominal, color: 'rgba(148,163,184,0.55)', dash: '4 3', label: 'Nominal Pn–Mn' },
      { pts: curve, color: C.GOLD, width: 2.1, fill: 'rgba(201,168,76,0.10)', label: 'Design φPn–φMn' }
    ], {
      title: 'P–M Interaction Diagram',
      xLabel: 'Moment φMn (ft-k)', yLabel: 'Axial load φPn (k)',
      xFrom0: true, yFrom0: true, height: 330,
      markers: [{
        x: parseFloat(res.results.find(x => /Applied Mu/.test(x.label)).value),
        y: parseFloat(res.results.find(x => /Applied Pu/.test(x.label)).value),
        label: 'Demand', color: r.dcr <= 1 ? C.GREEN : C.RED
      }]
    });

    D.circSection(s[1], {
      title: 'Cross Section', D: parseFloat(res.results.find(x => /Diameter/.test(x.label)).value),
      Rs: r.Rs, nBar: r.Ast / (Math.PI / 4), db: 1, unit: ' in',
      spiralR: r.Rs * 1.06, height: 280
    });
  }

  /* ---------------- C7 combined footing ---------------- */
  function combinedFooting(res, host) {
    const r = res.raw;
    const s = slots(host, 1);
    D.beamElevation(s[0], {
      title: 'Footing Elevation and Column Positions',
      L: r.L, unit: ' ft', height: 160,
      supports: [],
      zones: [{
        from: 0, to: r.L, spacing: r.L / 14,
        label: 'uniform upward soil pressure qu = ' + D.fmt(r.qu) + ' ksf',
        color: C.BLUE, fill: 'rgba(79,134,198,0.10)'
      }]
    });
  }

  /* ---------------- C1/C2 two-way slab ---------------- */
  function twoWaySlab(res, host) {
    const r = res.raw;
    const s = slots(host, 1);
    const W = 420, H = 320;
    const sv = D.svg(s[0], W, H, 'Panel Layout and Moment Regions');
    const m = 56;
    const sc = Math.min((W - 2 * m) / r.B, (H - 2 * m) / r.A);
    const w = r.B * sc, h = r.A * sc;
    const x0 = (W - w) / 2, y0 = (H - h) / 2;

    D.el('rect', { x: x0, y: y0, width: w, height: h, fill: C.CONC, stroke: C.INK, 'stroke-width': 1.6 }, sv);
    /* middle strips */
    D.el('rect', { x: x0 + w * 0.25, y: y0 + h * 0.25, width: w * 0.5, height: h * 0.5, fill: 'rgba(201,168,76,0.10)', stroke: C.GOLD, 'stroke-width': 1, 'stroke-dasharray': '4 3' }, sv);
    D.text(sv, x0 + w / 2, y0 + h / 2, 'middle strip', { anchor: 'middle', size: 8, fill: C.GOLD });
    /* supporting beams */
    [[x0, y0, w, 6], [x0, y0 + h - 6, w, 6], [x0, y0, 6, h], [x0 + w - 6, y0, 6, h]].forEach(d => {
      D.el('rect', { x: d[0], y: d[1], width: d[2], height: d[3], fill: 'rgba(148,163,184,0.35)' }, sv);
    });
    D.text(sv, x0 + w / 2, y0 - 12, 'B = ' + D.fmt(r.B) + ' ft  (long)', { anchor: 'middle', size: 9, fill: C.INK });
    D.text(sv, x0 - 14, y0 + h / 2, 'A = ' + D.fmt(r.A) + ' ft  (short)', { anchor: 'middle', size: 9, fill: C.INK, rotate: -90 });
    D.text(sv, x0 + w / 2, y0 + h + 22, 't = ' + D.fmt(r.t) + ' in,  m = A/B = ' + D.fmt(r.m), { anchor: 'middle', size: 8 });
  }

  /* ---------------- C9 cantilever slab ---------------- */
  function cantileverSlab(res, host) {
    const r = res.raw;
    const s = slots(host, 1);
    const W = 460, H = 200;
    const sv = D.svg(s[0], W, H, 'Cantilever Section');
    const m = { l: 70, t: 50 };
    const Lpx = 300, tpx = Math.max(14, r.d * 5);
    D.el('rect', { x: m.l, y: m.t, width: Lpx, height: tpx, fill: C.CONC, stroke: C.INK, 'stroke-width': 1.5 }, sv);
    /* wall */
    D.el('rect', { x: m.l - 26, y: m.t - 26, width: 26, height: tpx + 52, fill: 'rgba(148,163,184,0.35)', stroke: C.INK, 'stroke-width': 1.2 }, sv);
    /* top steel */
    D.el('line', { x1: m.l + 4, y1: m.t + 5, x2: m.l + Lpx - 6, y2: m.t + 5, stroke: C.GOLD, 'stroke-width': 2.4 }, sv);
    D.text(sv, m.l + Lpx / 2, m.t - 8, 'top steel — tension face', { anchor: 'middle', size: 8, fill: C.GOLD });
    /* load arrows */
    for (let i = 0; i <= 8; i++) {
      const x = m.l + 8 + i * (Lpx - 16) / 8;
      D.el('line', { x1: x, y1: m.t - 34, x2: x, y2: m.t - 6, stroke: C.BLUE, 'stroke-width': 1 }, sv);
      D.el('path', { d: 'M' + x + ' ' + (m.t - 5) + ' l -3 -6 l 6 0 Z', fill: C.BLUE }, sv);
    }
    D.text(sv, m.l + Lpx / 2, m.t - 40, 'w = ' + D.fmt(r.w) + ' psf', { anchor: 'middle', size: 8, fill: C.BLUE });
    D.text(sv, m.l + Lpx / 2, m.t + tpx + 26, 'L = ' + D.fmt(res.raw.M / (res.raw.w / 2) > 0 ? Math.sqrt(2 * res.raw.M / res.raw.w) : 0, 2) + ' ft', { anchor: 'middle', size: 8 });
    D.text(sv, m.l + Lpx + 8, m.t + tpx / 2, 'd = ' + D.fmt(r.d) + ' in', { size: 8 });
  }

  /* ---------------- E1 beam stirrups ---------------- */
  function beamShear(res, host) {
    const r = res.raw;
    const s = slots(host, 1);
    const L = Math.max(r.hingeLen * 3, 120);
    D.beamElevation(s[0], {
      title: 'Stirrup Layout', L: L, unit: ' in', height: 180,
      zones: [
        { from: 0, to: r.hingeLen, spacing: r.sEnd, label: 'end zone @ ' + D.fmt(r.sEnd) + '"', color: C.RED, fill: 'rgba(239,83,80,0.10)' },
        { from: r.hingeLen, to: L - r.hingeLen, spacing: r.sMid, label: 'middle @ ' + D.fmt(r.sMid) + '"', color: C.GREEN },
        { from: L - r.hingeLen, to: L, spacing: r.sEnd, label: 'end zone @ ' + D.fmt(r.sEnd) + '"', color: C.RED, fill: 'rgba(239,83,80,0.10)' }
      ]
    });
  }

  /* ---------------- E2 column ties ---------------- */
  function columnTies(res, host) {
    const r = res.raw;
    const s = slots(host, 1);
    const W = 300, H = 340;
    const sv = D.svg(s[0], W, H, 'Tie Layout over the Column Height');
    const colW = 70, x0 = (W - colW) / 2, y0 = 28, colH = H - 70;
    D.el('rect', { x: x0, y: y0, width: colW, height: colH, fill: C.CONC, stroke: C.INK, 'stroke-width': 1.5 }, sv);
    const scale = colH / (r.Lo * 3.2);
    const loPx = r.Lo * scale;
    [[y0, loPx, r.sConfined, C.RED], [y0 + loPx, colH - 2 * loPx, r.sMiddle, C.GREEN], [y0 + colH - loPx, loPx, r.sConfined, C.RED]].forEach(z => {
      const step = Math.max(3, z[2] * scale);
      D.el('rect', { x: x0, y: z[0], width: colW, height: z[1], fill: z[3] === C.RED ? 'rgba(239,83,80,0.10)' : 'rgba(102,187,106,0.07)' }, sv);
      for (let y = z[0] + 2; y < z[0] + z[1]; y += step) {
        D.el('line', { x1: x0 + 4, y1: y, x2: x0 + colW - 4, y2: y, stroke: z[3], 'stroke-width': 1 }, sv);
      }
    });
    D.text(sv, x0 + colW + 8, y0 + loPx / 2, 'Lo = ' + D.fmt(r.Lo) + '"', { size: 8, fill: C.RED });
    D.text(sv, x0 + colW + 8, y0 + loPx / 2 + 11, '@ ' + D.fmt(r.sConfined) + '"', { size: 8, fill: C.RED });
    D.text(sv, x0 + colW + 8, y0 + colH / 2, 'middle @ ' + D.fmt(r.sMiddle) + '"', { size: 8, fill: C.GREEN });
  }

  /* ---------------- E4 development lengths ---------------- */
  function development(res, host) {
    const rows = res.raw.rows || [];
    if (!rows.length) { host.innerHTML = ''; return; }
    const s = slots(host, 1);
    D.chart(s[0], [
      { pts: rows.map(r => [parseFloat(r[0]), parseFloat(r[1])]), color: C.GOLD, label: 'Ld tension', dots: 2.5 },
      { pts: rows.map(r => [parseFloat(r[0]), parseFloat(r[5])]), color: C.RED, label: 'Ld top bar', dots: 2.5 },
      { pts: rows.map(r => [parseFloat(r[0]), parseFloat(r[7])]), color: C.GREEN, label: 'Ldc compression', dots: 2.5 },
      { pts: rows.map(r => [parseFloat(r[0]), parseFloat(r[2])]), color: C.BLUE, label: 'Ldh hook', dots: 2.5 }
    ], {
      title: 'Development Length by Bar Size',
      xLabel: 'Bar diameter (mm)', yLabel: 'Length (mm)',
      yFrom0: true, height: 300
    });
  }

  /* ---------------- F1 / F2 estimating ---------------- */
  function estimate(res, host) {
    const items = res.raw.items || res.raw.rows;
    if (!items || !items.length) { host.innerHTML = ''; return; }
    const s = slots(host, 1);
    const isF1 = !!res.raw.items;
    const data = isF1
      ? items.map(i => ({ name: i[0], value: parseFloat(i[4]) || 0 }))
      : items.map(i => ({ name: i[1].substring(0, 18), value: parseFloat(i[6]) || 0 }));
    D.storeyProfile(s[0], data, {
      title: isF1 ? 'Cost by Material' : 'Steel Weight by Bar Mark',
      xLabel: isF1 ? 'Amount' : 'Weight (kg)'
    });
  }

  /* ---------------- C8 shear wall ---------------- */
  function shearWall(res, host) {
    const r = res.raw;
    const s = slots(host, 1);
    const W = 520, H = 200;
    const sv = D.svg(s[0], W, H, 'Barbell Wall Section');
    const m = 50;
    const lw = res.results.find(x => /Wall Length/.test(x.label)).value;
    const Lin = parseFloat(lw) * 12;
    const sc = (W - 2 * m) / Lin;
    const t = parseFloat(res.results.find(x => /Web Thickness/.test(x.label)).value);
    const bd = res.results.find(x => /Bulb B/.test(x.label)).value.split('×');
    const B = parseFloat(bd[0]), Db = parseFloat(bd[1]);
    const y0 = H / 2 - B * sc / 2;

    /* web */
    D.el('rect', { x: m + Db * sc, y: H / 2 - t * sc / 2, width: (Lin - 2 * Db) * sc, height: t * sc, fill: C.CONC, stroke: C.INK, 'stroke-width': 1.4 }, sv);
    /* bulbs */
    [m, m + (Lin - Db) * sc].forEach(x => {
      D.el('rect', { x: x, y: H / 2 - Db * sc / 2, width: Db * sc, height: Db * sc, fill: 'rgba(148,163,184,0.28)', stroke: C.INK, 'stroke-width': 1.4 }, sv);
      /* confinement hoop */
      D.el('rect', { x: x + 4, y: H / 2 - Db * sc / 2 + 4, width: Db * sc - 8, height: Db * sc - 8, fill: 'none', stroke: r.hoopBok && r.hoopLok ? C.GREEN : C.RED, 'stroke-width': 1.1, rx: 2 }, sv);
      /* bulb bars, arranged around the hoop */
      const nb = Math.max(4, Math.round(r.Ast > 0 ? 8 : 8));
      const bx = x + 8, by = H / 2 - Db * sc / 2 + 8;
      const bw2 = Db * sc - 16, bh2 = Db * sc - 16;
      const per = Math.max(2, Math.round(nb / 4));
      for (let i = 0; i < per; i++) {
        const f = per === 1 ? 0.5 : i / (per - 1);
        [[bx + bw2 * f, by], [bx + bw2 * f, by + bh2]].forEach(pt =>
          D.el('circle', { cx: pt[0], cy: pt[1], r: 2.6, fill: C.GOLD }, sv));
      }
    });
    /* distributed web curtains */
    const nCurtain = Math.max(3, Math.round((Lin - 2 * Db) / 18));
    for (let i = 1; i < nCurtain; i++) {
      const x = m + Db * sc + (Lin - 2 * Db) * sc * i / nCurtain;
      D.el('line', { x1: x, y1: H / 2 - t * sc / 2 + 2, x2: x, y2: H / 2 + t * sc / 2 - 2, stroke: C.GOLD, 'stroke-width': 1 }, sv);
    }
    D.text(sv, W / 2, H / 2 - t * sc / 2 - 8, 'web  t = ' + D.fmt(t) + '"  —  vertical curtains ρv = ' + D.fmt(r.rhoV), { anchor: 'middle', size: 8 });
    D.text(sv, m + Db * sc / 2, H / 2 + Db * sc / 2 + 16, 'bulb ' + D.fmt(B) + '×' + D.fmt(Db) + '"', { anchor: 'middle', size: 8, fill: C.GOLD });
    D.text(sv, m + (Lin - Db / 2) * sc, H / 2 + Db * sc / 2 + 16, 'hoops ' + (r.hoopBok && r.hoopLok ? 'OK' : 'inadequate'), { anchor: 'middle', size: 8, fill: r.hoopBok && r.hoopLok ? C.GREEN : C.RED });
    D.text(sv, W / 2, H - 10, 'lw = ' + lw, { anchor: 'middle', size: 9, fill: C.INK });
  }

  /* ---------------- E3 shear wall rebar ---------------- */
  function shearWallRebar(res, host) {
    const r = res.raw;
    const s = slots(host, 2);

    /* Wall elevation showing the actual bar grid */
    const W = 480, H = 260;
    const sv = D.svg(s[0], W, H, 'Wall Elevation — Reinforcement Grid');
    const m = { l: 54, t: 30, r: 30, b: 40 };
    const ww = W - m.l - m.r, wh = H - m.t - m.b;
    const Lmm = r.Lm * 1000, Hmm = r.Hm * 1000;
    D.el('rect', { x: m.l, y: m.t, width: ww, height: wh, fill: C.CONC, stroke: C.INK, 'stroke-width': 1.6 }, sv);

    const nV = Math.min(40, Math.max(2, Math.round(Lmm / r.SvReqRhoMM * (r.SvReqRhoMM / (r.SvReqRhoMM)) ) || 2));
    const svSpacing = Lmm / Math.max(1, Math.round(Lmm / (r.SvReqRhoMM || 250)));
    for (let x = 0; x <= Lmm + 1; x += svSpacing) {
      const px = m.l + Math.min(x, Lmm) / Lmm * ww;
      D.el('line', { x1: px, y1: m.t + 3, x2: px, y2: m.t + wh - 3, stroke: C.GOLD, 'stroke-width': 1.1 }, sv);
    }
    const shSpacing = Hmm / Math.max(1, Math.round(Hmm / (r.ShReqRhoMM || 250)));
    for (let y = 0; y <= Hmm + 1; y += shSpacing) {
      const py = m.t + Math.min(y, Hmm) / Hmm * wh;
      D.el('line', { x1: m.l + 3, y1: py, x2: m.l + ww - 3, y2: py, stroke: C.BLUE, 'stroke-width': 1.1 }, sv);
    }
    D.text(sv, m.l + ww / 2, m.t - 10, 'vertical ρv = ' + D.fmt(r.rhoV) + (r.vOK ? ' ✓' : ' ✗') +
      '   ·   horizontal ρh = ' + D.fmt(r.rhoH) + (r.hOK ? ' ✓' : ' ✗'),
      { anchor: 'middle', size: 8, fill: C.INK });
    D.text(sv, m.l + ww / 2, H - 14, 'lw = ' + D.fmt(r.Lm) + ' m', { anchor: 'middle', size: 9, fill: C.INK });
    D.text(sv, m.l - 12, m.t + wh / 2, 'H = ' + D.fmt(r.Hm) + ' m', { anchor: 'middle', size: 9, fill: C.INK, rotate: -90 });

    D.storeyProfile(s[1], [
      { name: 'ρv provided', value: r.rhoV },
      { name: 'ρv minimum', value: 0.0025 },
      { name: 'ρh provided', value: r.rhoH },
      { name: 'ρh minimum', value: 0.0025 }
    ], { title: 'Reinforcement Ratios against the Minimum', xLabel: 'ρ' });
  }

  return {
    seismic, wind, pdelta, drift, softStorey, torsion, overturning, baseShear,
    stair, circularColumn, combinedFooting, twoWaySlab, cantileverSlab,
    beamShear, columnTies, development, estimate, shearWall, shearWallRebar
  };
})();

if (typeof window !== 'undefined') window.BNBCFigures = BNBCFigures;
