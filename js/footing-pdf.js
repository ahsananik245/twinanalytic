/* =====================================================================
   TwinAnalytic — Isolated Square Footing Report
   ---------------------------------------------------------------------
   Uses the shared presentation layer in bnbc-pdf.js so this report carries
   the same header, footer, logo and typography as every other report in
   the suite, and shows the same step-by-step working rather than only the
   final numbers.
   ===================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('btn-footing-pdf');
  if (btn) btn.addEventListener('click', downloadFootingPDF);
});

function downloadFootingPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const P = window.BNBCPdf;
  if (P) P.harden(doc);

  if (typeof runFootingLogic === 'function' && !window.footingResults) {
    try { runFootingLogic(); } catch (e) { }
  }
  const r = window.footingResults;
  if (!r) { alert('Run the calculation first.'); return; }

  const txt = id => { const el = document.getElementById(id); return el ? (el.value || el.textContent || '') : ''; };
  const proj = txt('footing-proj-name') || '—';
  const mark = txt('footing-mark') || 'F1';
  const designer = txt('footing-designer') || '—';

  const M = P ? P.M : 14, PW = P ? P.PW : 210, PH = P ? P.PH : 297;
  let page = 1, y = 32;

  function newPage(first) {
    if (!first) { doc.addPage(); page++; }
    y = P ? P.page(doc, 'Isolated Square Footing Design', page) : 32;
  }
  function need(h) { if (y + h > PH - 16) newPage(false); }
  function sec(t) { need(12); y = P ? P.section(doc, y, t) : y + 6; }
  function row(l, v, flag) { need(5); y = P ? P.row(doc, y, l, v, flag) : y + 4.4; }
  function step(n, title, formula, sub, res, ok) {
    need(22);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8);
    doc.setTextColor(138, 107, 46);
    doc.text('STEP ' + n + ' - ' + title, M, y); y += 4.6;
    doc.setFont('courier', 'normal'); doc.setFontSize(7.2); doc.setTextColor(70, 70, 70);
    [formula, sub].forEach(block => {
      String(block || '').split('\n').forEach(ln => {
        doc.splitTextToSize(ln, PW - 2 * M - 4).forEach(l => { need(4); doc.text(l, M + 3, y); y += 3.4; });
      });
      y += 1;
    });
    doc.setFont('courier', 'bold');
    doc.setTextColor(ok === false ? 190 : 20, ok === false ? 30 : 110, ok === false ? 20 : 40);
    String(res || '').split('\n').forEach(ln => {
      doc.splitTextToSize(ln, PW - 2 * M - 4).forEach(l => { need(4); doc.text(l, M + 3, y); y += 3.6; });
    });
    y += 3;
  }
  const f = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 2 : d) : '-');

  newPage(true);

  doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30, 30, 30);
  doc.text('Isolated Square Footing Design', M, y); y += 6;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
  doc.text('Project: ' + proj + '   ·   Footing mark: ' + mark + '   ·   Designer: ' + designer, M, y);
  y += 8;

  sec('1.0  Design Inputs');
  row("Concrete strength f'c", f(r.fc, 0) + ' psi');
  row('Steel yield fy', f(r.fy, 0) + ' psi');
  row('Allowable soil pressure Qa', f(r.Qa, 2) + ' ksf');
  row('Column size', f(r.c1, 1) + ' x ' + f(r.c2, 1) + ' in');
  row('Dead load / Live load', f(r.dl, 1) + ' / ' + f(r.ll, 1) + ' kips');
  row('Surcharge', f(r.surcharge, 2) + ' ft at ' + f(r.gamma, 0) + ' pcf');
  row('Effective depth d', f(r.d, 2) + ' in');
  row('Clear cover', f(r.cover, 2) + ' in');
  row('Main bar diameter', f(r.rebarL, 0) + ' mm');
  y += 4;

  sec('2.0  Step by Step Calculation');

  step(1, 'Available Bearing Pressure',
    'q(materials) = surcharge depth x unit weight\nq(available) = Qa x 1000 - q(materials)',
    'q(materials) = ' + f(r.surcharge, 2) + ' x ' + f(r.gamma, 0) + ' = ' + f(r.q_mat, 1) + ' psf\n' +
    'q(available) = ' + f(r.Qa, 2) + ' x 1000 - ' + f(r.q_mat, 1),
    'q(available) = ' + f(r.q_e, 2) + ' psf');

  step(2, 'Required Base Area',
    'A(required) = (DL + LL) x 1000 / q(available)\nB = sqrt(A), rounded up to a 0.25 ft module',
    'A = (' + f(r.dl, 1) + ' + ' + f(r.ll, 1) + ') x 1000 / ' + f(r.q_e, 2) + ' = ' + f(r.A_req, 3) + ' sq.ft\n' +
    'B = sqrt(' + f(r.A_req, 3) + ') = ' + f(Math.sqrt(r.A_req), 3) + ' ft',
    'Provide ' + f(r.B, 2) + ' ft x ' + f(r.B, 2) + ' ft = ' + f(r.A_furnished, 3) + ' sq.ft');

  step(3, 'Factored Upward Pressure',
    'qu = (1.2 DL + 1.6 LL) / (B x B)',
    'qu = (1.2 x ' + f(r.dl, 1) + ' + 1.6 x ' + f(r.ll, 1) + ') / ' + f(r.A_furnished, 3),
    'qu = ' + f(r.qu, 4) + ' ksf');

  step(4, 'Two-Way (Punching) Shear',
    "Critical perimeter at d/2 from the column face:\n  bo = 2(c1 + d) + 2(c2 + d)\n  Vu = qu [ B x B - (c1+d)(c2+d)/144 ]\n  Vc = 4 sqrt(f'c) bo d / 1000,  phi = 0.75",
    'bo = 2(' + f(r.c1, 1) + ' + ' + f(r.d, 2) + ') + 2(' + f(r.c2, 1) + ' + ' + f(r.d, 2) + ') = ' + f(r.bo, 2) + ' in\n' +
    'Vu = ' + f(r.Vu1, 2) + ' kips\n' +
    'phi Vc = 0.75 x ' + f(r.Vc1, 2) + ' = ' + f(r.pVc1, 2) + ' kips',
    'phi Vc = ' + f(r.pVc1, 2) + (r.pVc1 >= r.Vu1 ? ' >= ' : ' < ') + 'Vu = ' + f(r.Vu1, 2) +
    ' kips  ' + (r.pVc1 >= r.Vu1 ? 'OK' : 'INADEQUATE'), r.pVc1 >= r.Vu1);

  step(5, 'One-Way (Beam) Shear',
    "Critical section at d from the column face:\n  Vu = qu x B x (cantilever - d/12)\n  Vc = 2 sqrt(f'c) x (B x 12) x d / 1000,  phi = 0.75",
    'Cantilever arm = (' + f(r.B, 2) + ' - ' + f(r.c1, 1) + '/12) / 2 = ' + f(r.L_cant, 3) + ' ft\n' +
    'Shear arm = ' + f(r.L_cant, 3) + ' - ' + f(r.d / 12, 3) + ' = ' + f(r.L_shear, 3) + ' ft\n' +
    'Vu = ' + f(r.Vu2, 2) + ' kips,  phi Vc = ' + f(r.pVc2, 2) + ' kips',
    'phi Vc = ' + f(r.pVc2, 2) + (r.pVc2 >= r.Vu2 ? ' >= ' : ' < ') + 'Vu = ' + f(r.Vu2, 2) +
    ' kips  ' + (r.pVc2 >= r.Vu2 ? 'OK' : 'INADEQUATE'), r.pVc2 >= r.Vu2);

  step(6, 'Flexural Reinforcement',
    "Mu = qu x B x (cantilever)^2 / 2\nAs = Mu / (phi fy (d - a/2))\nAs,min = max[ 3 sqrt(f'c)/fy, 200/fy ] x b x d",
    'Mu = ' + f(r.qu, 4) + ' x ' + f(r.B, 2) + ' x ' + f(r.L_cant, 3) + '^2 / 2 = ' + f(r.Mu, 2) + ' kip-ft\n' +
    'As required = ' + f(r.As_req, 4) + ' sq.in\n' +
    "As,min (3 sqrt f'c) = " + f(r.As_min1, 4) + ' sq.in\n' +
    'As,min (200/fy) = ' + f(r.As_min2, 4) + ' sq.in',
    'As governing = ' + f(r.As_control, 4) + ' sq.in');

  step(7, 'Bar Layout',
    'Bar area = pi/4 x (dia / 25.4)^2\nNumber of bars = ceil(As / bar area)\nSpacing = (B x 12 - 2 cover) / (n - 1)',
    'Bar area = ' + f(r.area_barL, 5) + ' sq.in\n' +
    'n = ceil(' + f(r.As_control, 4) + ' / ' + f(r.area_barL, 5) + ') = ' + r.num_bars,
    'Provide ' + r.num_bars + ' nos ' + f(r.rebarL, 0) + ' mm at ' + f(r.spacing, 0) + ' in c/c, both directions');

  need(18); y += 2;
  const ok = r.shearOK;
  doc.setDrawColor(ok ? 20 : 190, ok ? 120 : 30, ok ? 40 : 20);
  doc.setLineWidth(0.5);
  doc.rect(M, y - 4, PW - 2 * M, 12);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
  doc.setTextColor(ok ? 20 : 190, ok ? 120 : 30, ok ? 40 : 20);
  doc.text('FOOTING ' + mark + ' IS ' + (ok ? 'ADEQUATE' : 'INADEQUATE') + ' FOR SHEAR',
    PW / 2, y + 3.5, { align: 'center' });

  /* Certification, kept whole. */
  if (P && P.signatures) {
    y += 16;
    need(P.signatures.height(doc, 3));
    P.signatures(doc, y, {
      heading: 'Certification',
      designer: designer && designer !== '—' ? designer : ''
    });
  }

  doc.save('twinanalytic-footing-' + String(mark || 'F1').toLowerCase().replace(/\s+/g, '-') + '.pdf');
}
