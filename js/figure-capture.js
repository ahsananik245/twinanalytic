/* =====================================================================
   TwinAnalytic — Figure capture for PDF reports
   ---------------------------------------------------------------------
   Twenty-two calculators already draw a figure: storey force distribution,
   drift profile, wind pressure profile, interaction curves. Every one of
   them was on screen only — the report a client actually receives had the
   numbers and none of the picture.

   This rasterises those figures so the PDF can carry them. Two things make
   it less trivial than it sounds.

   The figures are inline SVG, and turning SVG into pixels goes through an
   Image load, which is asynchronous. The report builders are synchronous.
   So capture happens before the build starts and the result is cached — see
   captureInto() and the await in bnbc-ui's export handler.

   And they are drawn for the dark site: #e2e8f0 text on a transparent
   background, with grid lines in white at 7% opacity. Dropped onto white
   paper as-is, a figure would be very nearly invisible. So the SVG source is
   recoloured for print on the way through. Anything not in the table below
   — the reds, greens and blues that carry meaning — is deliberately left
   alone.
   ===================================================================== */

const BNBCFigureCapture = (function () {
  'use strict';

  /* Dark-theme colour -> print equivalent. Order matters only in that the
     rgba forms must be matched literally as the library writes them. */
  const RECOLOUR = [
    ['#e2e8f0', '#1f2937'],                        // primary ink
    ['#94a3b8', '#5b6472'],                        // muted labels
    ['rgba(255,255,255,0.07)', 'rgba(0,0,0,0.12)'],// grid
    ['rgba(255,255,255,0.10)', 'rgba(0,0,0,0.16)'],
    ['rgba(255,255,255,0.14)', 'rgba(0,0,0,0.18)'],
    ['#c9a84c', '#8a6b2e'],                        // gold, to the print gold
    ['rgba(201,168,76,0.28)', 'rgba(201,168,76,0.45)'],
    ['rgba(120,140,170,0.18)', 'rgba(120,140,170,0.30)'],
    ['#ef5350', '#c62828'],
    ['#66bb6a', '#2e7d32'],
    ['#4f86c6', '#2a6496']
  ];

  const SCALE = 2;          // render at 2x so the figure is not soft in print

  function recolour(src) {
    let s = src;
    for (let i = 0; i < RECOLOUR.length; i++) {
      s = s.split(RECOLOUR[i][0]).join(RECOLOUR[i][1]);
    }
    return s;
  }

  /* One SVG element -> { dataUrl, w, h }. Resolves with null rather than
     rejecting: a report missing a figure is still a report. */
  function toPng(svgEl) {
    return new Promise(function (resolve) {
      try {
        const box = svgEl.getBoundingClientRect();
        const w = Math.max(1, Math.round(box.width || svgEl.viewBox.baseVal.width || 520));
        const h = Math.max(1, Math.round(box.height || svgEl.viewBox.baseVal.height || 300));

        const clone = svgEl.cloneNode(true);
        clone.setAttribute('width', w);
        clone.setAttribute('height', h);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        const src = recolour(new XMLSerializer().serializeToString(clone));

        const img = new Image();
        const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(src);
        let done = false;
        const finish = v => { if (!done) { done = true; resolve(v); } };

        img.onload = function () {
          try {
            const c = document.createElement('canvas');
            c.width = w * SCALE; c.height = h * SCALE;
            const ctx = c.getContext('2d');
            /* White, not transparent: the PDF page is white and a
               transparent PNG would be stored with a soft mask, which is
               what made the logo balloon to 230 KB inside every report. */
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, c.width, c.height);
            ctx.drawImage(img, 0, 0, c.width, c.height);
            finish({ dataUrl: c.toDataURL('image/jpeg', 0.86), w: w, h: h });
          } catch (e) { finish(null); }
        };
        img.onerror = function () { finish(null); };
        /* Never let a stuck decode hold up a download. */
        setTimeout(function () { finish(null); }, 4000);
        img.src = url;
      } catch (e) { resolve(null); }
    });
  }

  /* Capture every figure inside `host` and hang the result on `target`
     so a synchronous PDF builder can read it. */
  function captureInto(host, target) {
    if (!host || !target) return Promise.resolve([]);
    const svgs = Array.prototype.slice.call(host.querySelectorAll('svg'));
    if (!svgs.length) { target.figures = []; return Promise.resolve([]); }
    /* The figure library puts its caption in an <h4 class="figure-title">
       beside the svg, not inside it, so a raster of the svg alone loses it.
       Carried across as text for the PDF to set. */
    const titles = svgs.map(function (s) {
      const slot = s.closest ? s.closest('.figure-slot') : null;
      const cap = slot ? slot.querySelector('.figure-title') : null;
      return cap ? (cap.textContent || '').trim() : '';
    });
    return Promise.all(svgs.map(toPng)).then(function (list) {
      target.figures = list.map(function (f, i) {
        if (f) f.title = titles[i];
        return f;
      }).filter(Boolean);
      return target.figures;
    }).catch(function () { target.figures = []; return []; });
  }

  return { toPng: toPng, captureInto: captureInto, recolour: recolour };
})();

if (typeof window !== 'undefined') window.BNBCFigureCapture = BNBCFigureCapture;
