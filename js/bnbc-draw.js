/* =====================================================================
   TwinAnalytic — Diagram Library
   ---------------------------------------------------------------------
   SVG primitives shared by every calculator in the Precision Analysis
   Suite: XY charts, storey profiles, and reinforced concrete sections.

   Everything renders to inline SVG so a figure survives the print
   stylesheet and the PDF preview without needing a canvas raster.
   ===================================================================== */

const BNBCDraw = (function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  const GOLD = '#c9a84c';
  const GOLD_DIM = 'rgba(201,168,76,0.28)';
  const INK = '#e2e8f0';
  const MUTED = '#94a3b8';
  const GRID = 'rgba(255,255,255,0.07)';
  const RED = '#ef5350';
  const GREEN = '#66bb6a';
  const BLUE = '#4f86c6';
  const CONC = 'rgba(120,140,170,0.18)';

  function el(name, attrs, parent) {
    const n = document.createElementNS(NS, name);
    for (const k in attrs) {
      if (attrs[k] !== undefined && attrs[k] !== null) n.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(n);
    return n;
  }

  function svg(host, w, h, title) {
    host.innerHTML = '';
    if (title) {
      const cap = document.createElement('h4');
      cap.className = 'figure-title';
      cap.textContent = title;
      host.appendChild(cap);
    }
    const box = document.createElement('div');
    box.className = 'figure-box';
    host.appendChild(box);
    const s = el('svg', {
      viewBox: '0 0 ' + w + ' ' + h,
      preserveAspectRatio: 'xMidYMid meet',
      class: 'figure-svg'
    }, box);
    return s;
  }

  function text(p, x, y, str, opt) {
    opt = opt || {};
    const t = el('text', {
      x: x, y: y,
      fill: opt.fill || MUTED,
      'font-size': opt.size || 9,
      'font-family': opt.mono === false ? 'inherit' : 'JetBrains Mono, monospace',
      'text-anchor': opt.anchor || 'start',
      'font-weight': opt.weight || 400,
      transform: opt.rotate ? ('rotate(' + opt.rotate + ' ' + x + ' ' + y + ')') : null
    }, p);
    t.textContent = str;
    return t;
  }

  /* -------------------------------------------------------------------
     Generic XY chart.

     series: [{ pts:[[x,y],...], color, width, fill, dash, label }]
     opts  : { xLabel, yLabel, xTicks, yTicks, hLines:[{y,label,color}],
               vLines:[{x,label,color}], flipY, title }
     ------------------------------------------------------------------- */
  function chart(host, series, opts) {
    opts = opts || {};
    const W = opts.width || 520, H = opts.height || 300;
    const m = { l: 54, r: 16, t: 14, b: 38 };
    const s = svg(host, W, H, opts.title);

    let xs = [], ys = [];
    series.forEach(se => se.pts.forEach(p => { xs.push(p[0]); ys.push(p[1]); }));
    (opts.hLines || []).forEach(l => ys.push(l.y));
    (opts.vLines || []).forEach(l => xs.push(l.x));
    if (!xs.length) { xs = [0, 1]; ys = [0, 1]; }

    let x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
    let y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
    if (opts.xFrom0) x0 = Math.min(0, x0);
    if (opts.yFrom0) y0 = Math.min(0, y0);
    if (x1 - x0 < 1e-9) { x1 = x0 + 1; }
    if (y1 - y0 < 1e-9) { y1 = y0 + 1; }
    const padY = (y1 - y0) * 0.08, padX = (x1 - x0) * 0.03;
    y0 -= padY; y1 += padY; x0 -= padX; x1 += padX;

    const px = v => m.l + (v - x0) / (x1 - x0) * (W - m.l - m.r);
    const py = v => opts.flipY
      ? m.t + (v - y0) / (y1 - y0) * (H - m.t - m.b)
      : H - m.b - (v - y0) / (y1 - y0) * (H - m.t - m.b);

    /* grid + ticks */
    const nx = opts.xTicks || 5, ny = opts.yTicks || 5;
    for (let i = 0; i <= ny; i++) {
      const v = y0 + (y1 - y0) * i / ny;
      el('line', { x1: m.l, y1: py(v), x2: W - m.r, y2: py(v), stroke: GRID, 'stroke-width': 1 }, s);
      text(s, m.l - 6, py(v) + 3, fmt(v), { anchor: 'end', size: 8 });
    }
    for (let i = 0; i <= nx; i++) {
      const v = x0 + (x1 - x0) * i / nx;
      el('line', { x1: px(v), y1: m.t, x2: px(v), y2: H - m.b, stroke: GRID, 'stroke-width': 1 }, s);
      text(s, px(v), H - m.b + 14, fmt(v), { anchor: 'middle', size: 8 });
    }

    /* zero axes */
    if (y0 < 0 && y1 > 0) el('line', { x1: m.l, y1: py(0), x2: W - m.r, y2: py(0), stroke: MUTED, 'stroke-width': 1.2 }, s);
    if (x0 < 0 && x1 > 0) el('line', { x1: px(0), y1: m.t, x2: px(0), y2: H - m.b, stroke: MUTED, 'stroke-width': 1.2 }, s);

    /* limit lines */
    (opts.hLines || []).forEach(l => {
      el('line', { x1: m.l, y1: py(l.y), x2: W - m.r, y2: py(l.y), stroke: l.color || RED, 'stroke-width': 1.3, 'stroke-dasharray': '5 3' }, s);
      if (l.label) text(s, W - m.r - 3, py(l.y) - 4, l.label, { anchor: 'end', fill: l.color || RED, size: 8 });
    });
    (opts.vLines || []).forEach(l => {
      el('line', { x1: px(l.x), y1: m.t, x2: px(l.x), y2: H - m.b, stroke: l.color || RED, 'stroke-width': 1.3, 'stroke-dasharray': '5 3' }, s);
      if (l.label) text(s, px(l.x) + 3, m.t + 10, l.label, { fill: l.color || RED, size: 8 });
    });

    /* series */
    series.forEach(se => {
      if (!se.pts.length) return;
      const d = se.pts.map((p, i) => (i ? 'L' : 'M') + px(p[0]) + ' ' + py(p[1])).join(' ');
      if (se.fill) {
        const base = opts.fillTo === 'x' ? px(0) : py(0);
        const closed = opts.fillTo === 'x'
          ? d + ' L' + base + ' ' + py(se.pts[se.pts.length - 1][1]) + ' L' + base + ' ' + py(se.pts[0][1]) + ' Z'
          : d + ' L' + px(se.pts[se.pts.length - 1][0]) + ' ' + base + ' L' + px(se.pts[0][0]) + ' ' + base + ' Z';
        el('path', { d: closed, fill: se.fill, stroke: 'none' }, s);
      }
      el('path', {
        d: d, fill: 'none', stroke: se.color || GOLD,
        'stroke-width': se.width || 1.8,
        'stroke-dasharray': se.dash || null,
        'stroke-linejoin': 'round'
      }, s);
      if (se.dots) se.pts.forEach(p => el('circle', { cx: px(p[0]), cy: py(p[1]), r: se.dots, fill: se.color || GOLD }, s));
    });

    /* markers */
    (opts.markers || []).forEach(mk => {
      el('circle', { cx: px(mk.x), cy: py(mk.y), r: 4, fill: mk.color || RED, stroke: '#0b0f17', 'stroke-width': 1.5 }, s);
      if (mk.label) text(s, px(mk.x) + 7, py(mk.y) - 5, mk.label, { fill: mk.color || RED, size: 8, weight: 600 });
    });

    if (opts.xLabel) text(s, (m.l + W - m.r) / 2, H - 4, opts.xLabel, { anchor: 'middle', size: 9, fill: INK });
    if (opts.yLabel) text(s, 12, (m.t + H - m.b) / 2, opts.yLabel, { anchor: 'middle', size: 9, fill: INK, rotate: -90 });

    /* legend */
    const labelled = series.filter(x => x.label);
    if (labelled.length > 1) {
      let lx = m.l + 4;
      labelled.forEach(se => {
        el('line', { x1: lx, y1: m.t + 6, x2: lx + 14, y2: m.t + 6, stroke: se.color || GOLD, 'stroke-width': 2.2 }, s);
        const t = text(s, lx + 18, m.t + 9, se.label, { size: 8, fill: INK });
        lx += 26 + se.label.length * 4.6;
      });
    }
    return s;
  }

  function fmt(v) {
    const a = Math.abs(v);
    if (a === 0) return '0';
    if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
    if (a >= 100) return v.toFixed(0);
    if (a >= 10) return v.toFixed(1);
    if (a >= 1) return v.toFixed(2);
    return v.toFixed(3);
  }

  /* -------------------------------------------------------------------
     Storey profile — a horizontal bar per level, drawn bottom up, with an
     optional limit line. Used for storey forces, drift, theta, stiffness.
     ------------------------------------------------------------------- */
  function storeyProfile(host, levels, opts) {
    opts = opts || {};
    const n = levels.length;
    if (!n) { host.innerHTML = ''; return; }
    const W = opts.width || 520;
    const rowH = Math.max(13, Math.min(26, 300 / n));
    const H = n * rowH + 58;
    const m = { l: 96, r: 46, t: 16, b: 30 };
    const s = svg(host, W, H, opts.title);

    const vals = levels.map(l => Math.abs(l.value));
    const limit = opts.limit;
    let vmax = Math.max.apply(null, vals.concat(limit ? [limit] : []));
    if (!(vmax > 0)) vmax = 1;
    const bw = W - m.l - m.r;

    levels.forEach((lv, i) => {
      const y = H - m.b - (i + 1) * rowH + 2;
      const w = Math.abs(lv.value) / vmax * bw;
      const bad = limit !== undefined && Math.abs(lv.value) > limit;
      el('rect', {
        x: m.l, y: y, width: Math.max(w, 0.5), height: rowH - 4,
        fill: bad ? 'rgba(239,83,80,0.5)' : GOLD_DIM,
        stroke: bad ? RED : GOLD, 'stroke-width': 1
      }, s);
      text(s, m.l - 6, y + rowH / 2, lv.name || ('L' + (i + 1)), { anchor: 'end', size: 8 });
      text(s, m.l + w + 5, y + rowH / 2, fmt(lv.value), { size: 8, fill: bad ? RED : INK });
    });

    /* base line */
    el('line', { x1: m.l, y1: H - m.b, x2: W - m.r, y2: H - m.b, stroke: MUTED, 'stroke-width': 1.2 }, s);
    el('line', { x1: m.l, y1: m.t, x2: m.l, y2: H - m.b, stroke: MUTED, 'stroke-width': 1.2 }, s);

    if (limit !== undefined && limit > 0) {
      const lx = m.l + limit / vmax * bw;
      el('line', { x1: lx, y1: m.t, x2: lx, y2: H - m.b, stroke: RED, 'stroke-width': 1.4, 'stroke-dasharray': '5 3' }, s);
      text(s, lx + 3, m.t + 9, opts.limitLabel || ('limit ' + fmt(limit)), { fill: RED, size: 8 });
    }
    if (opts.xLabel) text(s, (m.l + W - m.r) / 2, H - 6, opts.xLabel, { anchor: 'middle', size: 9, fill: INK });
    return s;
  }

  /* -------------------------------------------------------------------
     Rectangular RC section with reinforcement.
     ------------------------------------------------------------------- */
  function rectSection(host, o) {
    const W = o.width || 300, H = o.height || 300;
    const s = svg(host, W, H, o.title);
    const b = o.b, h = o.h;
    const pad = 46;
    const sc = Math.min((W - 2 * pad) / b, (H - 2 * pad) / h);
    const x0 = (W - b * sc) / 2, y0 = (H - h * sc) / 2;

    el('rect', { x: x0, y: y0, width: b * sc, height: h * sc, fill: CONC, stroke: INK, 'stroke-width': 1.6 }, s);

    /* compression block */
    if (o.a > 0) {
      el('rect', { x: x0, y: y0, width: b * sc, height: Math.min(o.a, h) * sc, fill: 'rgba(79,134,198,0.30)', stroke: BLUE, 'stroke-width': 1, 'stroke-dasharray': '3 2' }, s);
      text(s, x0 + b * sc / 2, y0 + Math.min(o.a, h) * sc / 2 + 3, 'a = ' + fmt(o.a), { anchor: 'middle', size: 8, fill: '#9dc0e8' });
    }
    /* neutral axis */
    if (o.c > 0 && o.c < h) {
      el('line', { x1: x0 - 8, y1: y0 + o.c * sc, x2: x0 + b * sc + 8, y2: y0 + o.c * sc, stroke: RED, 'stroke-width': 1.2, 'stroke-dasharray': '6 3' }, s);
      text(s, x0 + b * sc + 10, y0 + o.c * sc + 3, 'N.A.', { size: 8, fill: RED });
    }
    /* stirrup */
    if (o.cover) {
      const cv = o.cover * sc;
      el('rect', { x: x0 + cv, y: y0 + cv, width: b * sc - 2 * cv, height: h * sc - 2 * cv, fill: 'none', stroke: GREEN, 'stroke-width': 1.2, rx: 4 }, s);
    }
    /* bars */
    (o.bars || []).forEach(row => {
      const n = row.n, dia = (row.dia || 20) * sc / 2;
      const yb = y0 + row.y * sc;
      const usable = b * sc - 2 * (o.cover || 0) * sc - 2 * dia;
      for (let i = 0; i < n; i++) {
        const xb = n === 1
          ? x0 + b * sc / 2
          : x0 + (o.cover || 0) * sc + dia + usable * i / (n - 1);
        el('circle', { cx: xb, cy: yb, r: Math.max(2.5, dia), fill: GOLD, stroke: '#8a6f2a', 'stroke-width': 0.8 }, s);
      }
      if (row.label) text(s, x0 - 8, yb + 3, row.label, { anchor: 'end', size: 8, fill: GOLD });
    });

    /* dimensions */
    dimH(s, x0, x0 + b * sc, y0 + h * sc + 18, fmt(b) + (o.unit || ''));
    dimV(s, y0, y0 + h * sc, x0 + b * sc + 26, fmt(h) + (o.unit || ''));
    return s;
  }

  /* Circular RC section */
  function circSection(host, o) {
    const W = o.width || 300, H = o.height || 300;
    const s = svg(host, W, H, o.title);
    const R = Math.min(W, H) / 2 - 48;
    const cx = W / 2, cy = H / 2;
    const sc = R / (o.D / 2);

    el('circle', { cx: cx, cy: cy, r: R, fill: CONC, stroke: INK, 'stroke-width': 1.6 }, s);
    if (o.spiralR) el('circle', { cx: cx, cy: cy, r: o.spiralR * sc, fill: 'none', stroke: GREEN, 'stroke-width': 1.2, 'stroke-dasharray': '4 3' }, s);

    /* compression block chord */
    if (o.a > 0 && o.a < o.D) {
      const yTop = cy - R + o.a * sc;
      const half = Math.sqrt(Math.max(0, R * R - Math.pow(yTop - cy, 2)));
      el('path', {
        d: 'M ' + (cx - half) + ' ' + yTop + ' A ' + R + ' ' + R + ' 0 0 1 ' + (cx + half) + ' ' + yTop + ' Z',
        fill: 'rgba(79,134,198,0.30)', stroke: BLUE, 'stroke-width': 1
      }, s);
      el('line', { x1: cx - R - 8, y1: yTop, x2: cx + R + 8, y2: yTop, stroke: BLUE, 'stroke-width': 1, 'stroke-dasharray': '3 2' }, s);
      text(s, cx + R + 10, yTop + 3, 'a', { size: 8, fill: BLUE });
    }
    /* bars on the cage circle */
    const n = o.nBar || 8, Rs = (o.Rs || o.D / 2 * 0.75) * sc;
    const off = o.offset || 0;
    for (let i = 0; i < n; i++) {
      const ang = 2 * Math.PI * i / n + off - Math.PI / 2;
      el('circle', {
        cx: cx + Rs * Math.sin(ang + Math.PI / 2), cy: cy - Rs * Math.cos(ang + Math.PI / 2),
        r: Math.max(2.5, (o.db || 1) * sc / 2), fill: GOLD, stroke: '#8a6f2a', 'stroke-width': 0.8
      }, s);
    }
    dimH(s, cx - R, cx + R, cy + R + 22, 'D = ' + fmt(o.D) + (o.unit || ''));
    return s;
  }

  function dimH(s, x1, x2, y, label) {
    el('line', { x1: x1, y1: y, x2: x2, y2: y, stroke: MUTED, 'stroke-width': 1 }, s);
    el('line', { x1: x1, y1: y - 4, x2: x1, y2: y + 4, stroke: MUTED, 'stroke-width': 1 }, s);
    el('line', { x1: x2, y1: y - 4, x2: x2, y2: y + 4, stroke: MUTED, 'stroke-width': 1 }, s);
    text(s, (x1 + x2) / 2, y - 5, label, { anchor: 'middle', size: 8 });
  }
  function dimV(s, y1, y2, x, label) {
    el('line', { x1: x, y1: y1, x2: x, y2: y2, stroke: MUTED, 'stroke-width': 1 }, s);
    el('line', { x1: x - 4, y1: y1, x2: x + 4, y2: y1, stroke: MUTED, 'stroke-width': 1 }, s);
    el('line', { x1: x - 4, y1: y2, x2: x + 4, y2: y2, stroke: MUTED, 'stroke-width': 1 }, s);
    text(s, x + 5, (y1 + y2) / 2, label, { size: 8, rotate: -90 });
  }

  /* -------------------------------------------------------------------
     Beam elevation with reinforcement zones — used by the stirrup and
     estimating calculators.
     ------------------------------------------------------------------- */
  function beamElevation(host, o) {
    const W = o.width || 520, H = o.height || 170;
    const s = svg(host, W, H, o.title);
    const m = { l: 30, r: 30, t: 40, b: 40 };
    const L = o.L, bw = W - m.l - m.r, hh = H - m.t - m.b;
    const px = v => m.l + v / L * bw;

    el('rect', { x: m.l, y: m.t, width: bw, height: hh, fill: CONC, stroke: INK, 'stroke-width': 1.5 }, s);

    /* supports */
    (o.supports || [0, L]).forEach(xs => {
      const x = px(xs);
      el('path', { d: 'M' + x + ' ' + (m.t + hh) + ' l -9 14 l 18 0 Z', fill: MUTED }, s);
    });

    /* stirrup zones */
    (o.zones || []).forEach(z => {
      const xa = px(z.from), xb = px(z.to);
      el('rect', { x: xa, y: m.t, width: xb - xa, height: hh, fill: z.fill || 'rgba(102,187,106,0.10)', stroke: 'none' }, s);
      const step = Math.max(4, (z.spacing / L) * bw);
      for (let x = xa; x <= xb + 0.1; x += step) {
        el('line', { x1: x, y1: m.t + 5, x2: x, y2: m.t + hh - 5, stroke: z.color || GREEN, 'stroke-width': 1 }, s);
      }
      text(s, (xa + xb) / 2, m.t - 8, z.label, { anchor: 'middle', size: 8, fill: z.color || GREEN });
      dimH(s, xa, xb, m.t + hh + 26, fmt(z.to - z.from) + (o.unit || ''));
    });

    /* longitudinal bars */
    el('line', { x1: m.l + 6, y1: m.t + hh - 8, x2: W - m.r - 6, y2: m.t + hh - 8, stroke: GOLD, 'stroke-width': 2 }, s);
    el('line', { x1: m.l + 6, y1: m.t + 8, x2: W - m.r - 6, y2: m.t + 8, stroke: GOLD, 'stroke-width': 2 }, s);

    dimH(s, m.l, W - m.r, H - 6, 'L = ' + fmt(L) + (o.unit || ''));
    return s;
  }

  return {
    chart, storeyProfile, rectSection, circSection, beamElevation,
    svg, el, text, fmt,
    colors: { GOLD, INK, MUTED, RED, GREEN, BLUE, GRID, CONC, GOLD_DIM }
  };
})();

if (typeof window !== 'undefined') window.BNBCDraw = BNBCDraw;
