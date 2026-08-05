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
  function safe(text) {
    if (text === null || text === undefined) return '';
    let s = String(text);
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
     The TwinAnalytic mark, drawn as vectors so no raster asset is needed.
     ------------------------------------------------------------------- */
  function mark(doc, x, y, size) {
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
    doc.setFillColor(INK[0], INK[1], INK[2]);
    doc.rect(0, 0, g.w, g.hh, 'F');

    mark(doc, g.m, 5 * g.k, 13 * g.k);

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(15);
    doc.text('Twin', g.m + 16 * g.k, 12 * g.k);
    const wTwin = doc.getTextWidth('Twin');
    doc.setTextColor(GOLD[0], GOLD[1], GOLD[2]);
    doc.text('Analytic', g.m + 16 * g.k + wTwin, 12 * g.k);

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
    safe, harden, mark, header, footer, page, section, row, geom,
    brandAllPages, M, PW, PH, HEADER_H, GOLD
  };
})();

if (typeof window !== 'undefined') window.BNBCPdf = BNBCPdf;
if (typeof module !== 'undefined' && module.exports) module.exports = BNBCPdf;
