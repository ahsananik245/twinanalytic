/* =====================================================================
   TwinAnalytic — Shared PDF Presentation Layer
   ---------------------------------------------------------------------
   One header, one footer, one logo and one text encoder for every report
   the site produces, so a beam report and a seismic report look like they
   came from the same office.

   The encoder matters: jsPDF's built-in Helvetica is a Latin-1 font. Every
   Greek letter and most maths symbols render as mojibake — a minus sign
   comes out as a quote, phi comes out as an accented capital. Engineering
   copy is full of both, so text is transliterated to ASCII on its way into
   the PDF while the on-screen HTML keeps the real symbols.
   ===================================================================== */

const BNBCPdf = (function () {
  'use strict';

  const GOLD = [201, 168, 76];
  const INK = [11, 15, 23];
  const SLATE = [240, 244, 248];

  /* The wordmark is two-tone in the artwork — TWIN in brushed steel,
     ANALYTIC in gold — and the reports used to set it in flat gold
     throughout.

     Each tone needs a light-background variant, because neither screen
     colour survives white paper. Measured against the rendered PDF:

                        on the textured band    on white
       #B7B6B6 steel          7.29:1              2.2:1  fails
       #C9A84C gold           6.45:1              2.29:1 fails
       #3A4048 steel-ink        --                10.46:1
       #8A6B2E gold-ink         --                4.97:1

     The light pair also has to stay distinguishable from each other, which
     is what rules out simply darkening both: #725A22 gold against #5C6169
     steel measures 1.05:1 and the split disappears. This pair sits 2.10:1
     apart with a warm/cool hue split on top of that. The gold-ink is close
     to the artwork's own median gold (#9F7C4C) — #C9A84C is the highlight
     of the metallic gradient, not its body colour. */
  const STEEL = [183, 182, 182];      // on the dark header bands
  const GOLD_INK = [138, 107, 46];    // gold, on white
  const STEEL_INK = [58, 64, 72];     // steel, on white

  /* -------------------------------------------------------------------
     Latin-1 safe transliteration.
     Ordered longest-first where a symbol maps to several characters.
     ------------------------------------------------------------------- */
  /* Compound forms first, so a subscripted symbol reads as an engineer
     would write it by hand rather than running together — "eps_t" not
     "epst", "sqrt(f'c)" not "sqrtf'c". Applied before the single-glyph
     table below. */
  const COMPOUND = [
    ["√f'c", "sqrt(f'c)"], ['√fc', 'sqrt(fc)'], ['√(', 'sqrt('],
    ['kN·m', 'kN-m'], ['N·m', 'N-m'], ['kg·m', 'kg-m'],
    ['φVc', 'phi.Vc'], ['φVn', 'phi.Vn'], ['φVs', 'phi.Vs'],
    ['φMn', 'phi.Mn'], ['φMb', 'phi.Mb'], ['φPn', 'phi.Pn'], ['φPb', 'phi.Pb'],
    ['εty', 'eps_ty'], ['εt', 'eps_t'], ['εy', 'eps_y'], ['εu', 'eps_u'],
    ['εs', 'eps_s'], ['εc', 'eps_c'],
    ['ρmin', 'rho_min'], ['ρmax', 'rho_max'], ['ρb', 'rho_b'], ['ρg', 'rho_g'],
    ['ρv', 'rho_v'], ['ρn', 'rho_n'], ['ρh', 'rho_h'], ['ρs', 'rho_s'],
    ['Δmax', 'Delta_max'], ['Δmin', 'Delta_min'], ['Δavg', 'Delta_avg'],
    ['Δa', 'Delta_a'], ['Δi', 'Delta_i'], ['Δm', 'Delta_m'],
    ['θmax', 'theta_max'],
    ['αc', 'alpha_c'], ['αm', 'alpha_m'], ['αs', 'alpha_s'],
    ['βdns', 'beta_dns'], ['βc', 'beta_c'], ['β1', 'beta_1'],
    ['ΣF', 'Sum F'], ['Σ ', 'Sum '],
    ['n₁', 'n1'], ['Ld/db', 'Ld/db']
  ];

  const MAP = [
    ['−', '-'],       // minus
    ['≤', '<='], ['≥', '>='], ['≠', '!='], ['≈', '~='],
    ['→', '->'], ['←', '<-'], ['⇒', '=>'],
    ['√', 'sqrt'], ['∞', 'inf'],
    ['✓', 'OK'], ['✔', 'OK'], ['✗', 'X'], ['✘', 'X'],
    ['✅', 'OK'], ['❌', 'X'],
    ['∑', 'Sum'], ['∏', 'Prod'], ['∂', 'd'], ['∆', 'Delta'],
    ['Δ', 'Delta'], ['Ω', 'Omega'], ['Σ', 'Sum'], ['Φ', 'Phi'],
    ['α', 'alpha'], ['β', 'beta'], ['γ', 'gamma'], ['δ', 'delta'],
    ['ε', 'eps'], ['η', 'eta'], ['θ', 'theta'], ['λ', 'lambda'],
    ['μ', 'mu'], ['ν', 'nu'], ['ξ', 'xi'], ['π', 'pi'],
    ['ρ', 'rho'], ['σ', 'sigma'], ['τ', 'tau'], ['φ', 'phi'],
    ['χ', 'chi'], ['ψ', 'psi'], ['ω', 'omega'],
    ['Ф', 'Phi'], ['ᵩ', 'v'],
    ['⅓', '1/3'], ['⅔', '2/3'], ['⅛', '1/8'],
    ['₁', '1'], ['₂', '2'], ['₃', '3'], ['₀', '0'],
    ['₄', '4'], ['₅', '5'], ['₆', '6'], ['₇', '7'],
    ['₈', '8'], ['₉', '9'], ['₊', '+'], ['₋', '-'],
    ['⁴', '^4'], ['⁰', '^0'], ['⁵', '^5'],
    ['≡', '='], ['·', '.'], ['•', '-'],
    ['‘', "'"], ['’', "'"], ['“', '"'], ['”', '"'],
    ['…', '...'], [' ', ' '],
    ['─', '-'], ['═', '='], ['│', '|'],
    ['—', ' - '], ['–', '-'],   // em and en dash also sit outside Latin-1
    ['🟢', ''], ['🔴', '']   // status circles
  ];

  /* Characters Helvetica does handle, kept as they are:
     × ÷ ² ³ ° ± ½ and everything in Latin-1 */
  /* Some report strings are shared with the on-screen markup and still carry
     HTML entities. A PDF has no markup layer to resolve them, so "DCR &lt;= 1.0"
     printed literally. Resolve the handful that appear in engineering copy
     before transliteration, so &le; becomes ≤ and is then mapped to <=. */
  const ENTITIES = [
    ['&lt;', '<'], ['&gt;', '>'], ['&le;', '≤'], ['&ge;', '≥'],
    ['&plusmn;', '±'], ['&times;', '×'], ['&divide;', '÷'],
    ['&middot;', '·'], ['&deg;', '°'], ['&minus;', '−'],
    ['&radic;', '√'], ['&sup2;', '²'], ['&sup3;', '³'],
    ['&phi;', 'φ'], ['&rho;', 'ρ'], ['&beta;', 'β'], ['&alpha;', 'α'],
    ['&gamma;', 'γ'], ['&delta;', 'δ'], ['&Delta;', 'Δ'], ['&lambda;', 'λ'],
    ['&mu;', 'μ'], ['&epsilon;', 'ε'], ['&theta;', 'θ'], ['&sigma;', 'σ'],
    ['&nbsp;', ' '], ['&quot;', '"'], ['&#39;', "'"], ['&apos;', "'"],
    ['&amp;', '&']          // last, so it cannot re-create another entity
  ];

  function safe(text) {
    if (text === null || text === undefined) return '';
    let s = String(text);
    if (s.indexOf('&') >= 0) {
      for (let i = 0; i < ENTITIES.length; i++) {
        if (s.indexOf(ENTITIES[i][0]) >= 0) s = s.split(ENTITIES[i][0]).join(ENTITIES[i][1]);
      }
    }
    for (let i = 0; i < COMPOUND.length; i++) {
      if (s.indexOf(COMPOUND[i][0]) >= 0) s = s.split(COMPOUND[i][0]).join(COMPOUND[i][1]);
    }
    for (let i = 0; i < MAP.length; i++) {
      if (s.indexOf(MAP[i][0]) >= 0) s = s.split(MAP[i][0]).join(MAP[i][1]);
    }
    /* A bare sqrt that ran into its operand still needs separating */
    s = s.replace(/sqrt(?=[A-Za-z0-9])/g, 'sqrt ');
    /* Anything still outside Latin-1 would render as noise — drop it. */
    return s.replace(/[^\x09\x0A\x0D\x20-\xFF]/g, '');
  }

  /* Wrap a jsPDF document so every text call is encoded automatically. */
  function harden(doc) {
    if (doc.__bnbcHardened) return doc;
    const origText = doc.text.bind(doc);
    doc.text = function (txt, x, y, opts) {
      if (Array.isArray(txt)) return origText(txt.map(safe), x, y, opts);
      return origText(safe(txt), x, y, opts);
    };
    const origSplit = doc.splitTextToSize.bind(doc);
    doc.splitTextToSize = function (txt, w, o) { return origSplit(safe(txt), w, o); };
    doc.__bnbcHardened = true;
    return doc;
  }

  /* -------------------------------------------------------------------
     The TwinAnalytic mark.

     This used to be an arrangement of jsPDF rectangles and lines that
     approximated a logo. It approximated the wrong one — clients were
     receiving calculation reports stamped with a mark that appears nowhere
     on the website, in the favicon, or on the letterhead. The real artwork
     now arrives via js/brand-mark.js, cut from the same master file that
     produces every other brand asset.

     The vector version is kept only as a fallback for the case where that
     script did not load. A report with an approximate logo beats a report
     that failed to download.
     ------------------------------------------------------------------- */
  function vectorMark(doc, x, y, size) {
    doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.setLineWidth(size * 0.04);
    doc.line(x + size * 0.05, y + size * 0.95, x + size * 0.95, y + size * 0.95);
    doc.setFillColor(SLATE[0], SLATE[1], SLATE[2]);
    doc.rect(x + size * 0.25, y + size * 0.2, size * 0.15, size * 0.75, 'F');
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(x + size * 0.6, y + size * 0.2, size * 0.15, size * 0.75, 'F');
    doc.rect(x + size * 0.15, y + size * 0.35, size * 0.7, size * 0.12, 'F');
    doc.setDrawColor(SLATE[0], SLATE[1], SLATE[2]);
    doc.setLineWidth(size * 0.08);
    doc.line(x + size * 0.25, y + size * 0.75, x + size * 0.75, y + size * 0.47);
    doc.setFillColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.rect(x + size * 0.45, y + size * 0.47, size * 0.1, size * 0.1, 'F');
  }

  /* `size` is the width to occupy. The artwork is wider than it is tall, so
     fitting by width keeps every existing call site's horizontal budget —
     the header, for one, starts its wordmark 3mm after the mark ends. */
  function mark(doc, x, y, size) {
    const art = (typeof window !== 'undefined') && window.TWBrandMark;
    if (art && art.draw(doc, x, y, size)) return;
    vectorMark(doc, x, y, size);
  }

  /* -------------------------------------------------------------------
     The wordmark, split the way the logo splits it.

     Returns the total width drawn, so a caller can lay something out after
     it. `upper` sets TWINANALYTIC rather than TwinAnalytic; `suffix` is set
     in the gold alongside ANALYTIC; `onLight` picks the steel that survives
     a white background; `align` accepts 'center' and 'right', which plain
     doc.text cannot do once a string is split across two colours.
     ------------------------------------------------------------------- */
  function wordmark(doc, x, y, opts) {
    opts = opts || {};
    const first = opts.upper ? 'TWIN' : 'Twin';
    const second = (opts.upper ? 'ANALYTIC' : 'Analytic') + (opts.suffix || '');
    doc.setFont('helvetica', opts.style || 'bold');
    if (opts.size) doc.setFontSize(opts.size);
    const w1 = doc.getTextWidth(first);
    const w2 = doc.getTextWidth(second);
    let sx = x;
    if (opts.align === 'center') sx = x - (w1 + w2) / 2;
    else if (opts.align === 'right') sx = x - (w1 + w2);
    const s = opts.onLight ? STEEL_INK : STEEL;
    const g = opts.onLight ? GOLD_INK : GOLD;
    doc.setTextColor(s[0], s[1], s[2]);
    doc.text(first, sx, y);
    doc.setTextColor(g[0], g[1], g[2]);
    doc.text(second, sx + w1, y);
    return w1 + w2;
  }

  /* A dark header band, backed by the slate texture rather than a flat
     fill. The flat colour goes down first and stays visible if the texture
     fails to decode, so the band is never left as bare white paper. */
  function bandFill(doc, x, y, w, h, rgb) {
    const c = rgb || INK;
    doc.setFillColor(c[0], c[1], c[2]);
    doc.rect(x, y, w, h, 'F');
    const art = (typeof window !== 'undefined') && window.TWBrandMark;
    if (art && art.band) art.band(doc, x, y, w, h);
  }

  /* -------------------------------------------------------------------
     Standard header band and footer rule. Every report in the suite calls
     these, so the identity and the geometry match everywhere.
     ------------------------------------------------------------------- */
  const M = 14, PW = 210, PH = 297, HEADER_H = 24;

  /* The suite writes in millimetres but the older member-design reports
     were laid out in inches. Read the page size the document was actually
     created with and scale the fixed geometry, so one header definition
     serves every report regardless of its unit system. */
  function geom(doc) {
    let w = PW, h = PH;
    try {
      w = doc.internal.pageSize.getWidth();
      h = doc.internal.pageSize.getHeight();
    } catch (e) { }
    const k = w / PW;                 // 1 for mm/A4, ~0.0405 for in/letter
    return { w, h, k, m: M * k, hh: HEADER_H * k };
  }

  function header(doc, title, subtitle) {
    harden(doc);
    const g = geom(doc);
    bandFill(doc, 0, 0, g.w, g.hh);

    /* 14mm wide leaves a 2mm gap before the wordmark at +16mm, and the y
       centres the mark on the two lines of type rather than on the band. */
    mark(doc, g.m, 5.9 * g.k, 14 * g.k);

    wordmark(doc, g.m + 16 * g.k, 12 * g.k, { size: 15 });

    doc.setTextColor(190, 195, 205);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7);
    doc.text(subtitle || 'PRECISION ANALYSIS SUITE  |  BNBC 2020 / ACI 318', g.m + 16 * g.k, 17.5 * g.k);

    doc.setFontSize(9); doc.setTextColor(255, 255, 255);
    doc.text(title || '', g.w - g.m, 11 * g.k, { align: 'right' });
    doc.setFontSize(7); doc.setTextColor(180, 180, 180);
    doc.text(new Date().toLocaleString(), g.w - g.m, 16.5 * g.k, { align: 'right' });

    doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]); doc.setLineWidth(0.4 * g.k);
    doc.line(g.m, g.hh, g.w - g.m, g.hh);
  }

  function footer(doc, page, total) {
    harden(doc);
    const g = geom(doc);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7); doc.setTextColor(130, 130, 130);
    doc.text('Page ' + page + (total ? ' of ' + total : ''), g.w / 2, g.h - 8 * g.k, { align: 'center' });
    doc.text('© ' + new Date().getFullYear() +
      ' TwinAnalytic  ·  twinanalytic.com  ·  Verify against project specific requirements before construction.',
      g.w / 2, g.h - 4 * g.k, { align: 'center' });
  }

  /* Header plus footer in one call, returning the y to start writing at */
  function page(doc, title, n, total, subtitle) {
    header(doc, title, subtitle);
    footer(doc, n, total);
    return HEADER_H + 8;
  }

  /* A section heading in the house style */
  function section(doc, y, text) {
    const g = geom(doc);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
    doc.setTextColor(20, 20, 20);
    doc.text(text, g.m, y);
    doc.setDrawColor(GOLD[0], GOLD[1], GOLD[2]); doc.setLineWidth(0.3 * g.k);
    doc.line(g.m, y + 1.5 * g.k, g.w - g.m, y + 1.5 * g.k);
    return y + 6 * g.k;
  }

  /* A label / value row */
  function row(doc, y, label, value, flag) {
    const g = geom(doc);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text(String(label), g.m + g.k, y);
    if (flag === 'fail') doc.setTextColor(190, 30, 20);
    else if (flag === 'pass') doc.setTextColor(20, 120, 40);
    else doc.setTextColor(20, 20, 20);
    doc.text(String(value), g.w - g.m - g.k, y, { align: 'right' });
    return y + 4.4 * g.k;
  }

  /* Stamp the standard header and footer onto every page of a finished
     document. Lets an existing report adopt the house identity without
     its body layout being rewritten. */
  function brandAllPages(doc, title, subtitle) {
    harden(doc);
    const total = doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      header(doc, title, subtitle);
      footer(doc, i, total);
    }
    return doc;
  }

  return {
    safe, harden, mark, wordmark, bandFill, header, footer, page, section, row, geom,
    brandAllPages, M, PW, PH, HEADER_H, GOLD, GOLD_INK, STEEL, STEEL_INK, INK
  };
})();

if (typeof window !== 'undefined') window.BNBCPdf = BNBCPdf;
if (typeof module !== 'undefined' && module.exports) module.exports = BNBCPdf;
