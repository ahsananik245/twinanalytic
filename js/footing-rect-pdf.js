// Attach to PDF Buttons
document.addEventListener('DOMContentLoaded', () => {
  const btnFootingPdf = document.getElementById('btn-footing-pdf');
  if (btnFootingPdf) {
    btnFootingPdf.addEventListener('click', downloadRectFootingPDF);
  }
});

function downloadRectFootingPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'letter', unit: 'in' });

  // Run every text call through the shared transliterator. jsPDF's Helvetica
  // is Latin-1, so the phi in "phi.Vc" was being truncated to its low byte
  // and printing as "Æ" — and the bad glyph threw off the width table after
  // it, which is what pushed the right-hand column off the page.
  if (window.BNBCPdf) window.BNBCPdf.harden(doc);

  /* The house header and footer, rather than the one-off logo, title and rule
     this report used to draw for itself. It was the only report in the suite
     that carried neither the shared band nor a page number, so a client
     receiving it alongside a beam or seismic report got an odd one out.

     BNBCPdf.geom() reads the page size the document was created with, so the
     mm/A4 geometry scales correctly onto this letter/inch page. */
  if (window.BNBCPdf) {
    window.BNBCPdf.page(doc, 'Isolated Rectangular Footing Design', 1);
  } else {
    if (window.TWBrandMark) window.TWBrandMark.draw(doc, 0.5, 0.48, 0.48);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(30, 40, 50);
    doc.text('ISOLATED RECTANGULAR FOOTING DESIGN', 1.1, 0.7);
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.02);
    doc.line(0.5, 1.1, 8.0, 1.1);
  }

  function v(id) {
    const el = document.getElementById(id);
    return el ? el.value || el.textContent : "N/A";
  }

  doc.setTextColor(0, 0, 0);
  doc.text(`Project Name: ${v('footing-proj-name')}`, 0.5, 1.5);
  doc.text(`Footing Mark: ${v('footing-mark')}`, 0.5, 1.8);
  doc.text(`Designer: ${v('footing-designer')}`, 0.5, 2.1);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 5.0, 1.5);

  doc.setFont('helvetica', 'bold');
  doc.text('1. INPUT PARAMETERS', 0.5, 2.8);
  doc.setFont('helvetica', 'normal');

  doc.text(`Concrete Strength, f'c: ${v('footing-fc')} psi`, 0.5, 3.2);
  doc.text(`Steel Yield Strength, fy: ${v('footing-fy')} psi`, 0.5, 3.5);
  doc.text(`Soil Bearing Capacity, Qa: ${v('footing-qa')} ksf`, 0.5, 3.8);
  doc.text(`Dead Load (DL): ${v('footing-dl')} kips`, 4.5, 3.2);
  doc.text(`Live Load (LL): ${v('footing-ll')} kips`, 4.5, 3.5);
  doc.text(`Trial Depth (d): ${v('footing-d')} inches`, 4.5, 3.8);

  doc.setFont('helvetica', 'bold');
  doc.text('2. ANALYSIS RESULTS', 0.5, 4.5);
  doc.setFont('helvetica', 'normal');

  doc.text(`Required Base Area: ${v('footing-out-area')} sq.ft`, 0.5, 4.9);
  doc.text(`Provided Dimension: ${v('footing-out-lb')} ft`, 0.5, 5.2);

  doc.text(`Two-Way Punching Shear (Vu): ${v('footing-out-vu1')} kips`, 0.5, 5.7);
  doc.text(`Two-Way Shear Capacity (φVc): ${v('footing-out-pvc1')} kips`, 4.5, 5.7);

  doc.text(`One-Way Beam Shear L-Dir (Vu): ${v('footing-out-vu2l')} kips`, 0.5, 6.0);
  doc.text(`One-Way Shear Cap L-Dir (φVc): ${v('footing-out-pvc2l')} kips`, 4.5, 6.0);

  doc.text(`One-Way Beam Shear B-Dir (Vu): ${v('footing-out-vu2b')} kips`, 0.5, 6.3);
  doc.text(`One-Way Shear Cap B-Dir (φVc): ${v('footing-out-pvc2b')} kips`, 4.5, 6.3);

  doc.setFont('helvetica', 'bold');
  doc.text(`L-Dir Reinforcement: ${v('footing-out-rebar-l')}`, 0.5, 7.0);
  doc.text(`B-Dir Reinforcement: ${v('footing-out-rebar-b')}`, 4.5, 7.0);

  doc.setTextColor(0,0,0);
  doc.text(`Status: ${v('footing-rect-status-badge')}`, 0.5, 7.6);

  /* An empty bordered box captioned "(Review Interactive Dimension Schematic
     Online)" used to sit here. On a report a client may print and file, a
     large blank rectangle telling them to go and look somewhere else reads as
     unfinished. The dimensions it was gesturing at are printed instead. */
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(30, 30, 30);
  doc.text('3. PROPORTIONS', 0.5, 8.1);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`Plan: ${v('footing-out-lb')} ft`, 0.5, 8.5);
  doc.text(`Trial effective depth, d: ${v('footing-d')} in`, 0.5, 8.8);
  doc.text(`Column: ${v('footing-c1')} in x ${v('footing-c2')} in`, 4.5, 8.5);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text('Plan and reinforcement layout are shown on the calculator page.', 0.5, 9.2);

  /* Certification. This report is a single letter page and the block fits
     below the proportions above; if the layout ever grows past it, this
     starts a fresh page rather than overprinting. */
  if (window.BNBCPdf && window.BNBCPdf.signatures) {
    let sy = 9.5;
    const blockH = window.BNBCPdf.signatures.height(doc, 3);
    if (sy + blockH > 10.3) {
      doc.addPage();
      window.BNBCPdf.page(doc, 'Isolated Rectangular Footing Design', 2);
      sy = 1.6;
    }
    window.BNBCPdf.signatures(doc, sy, {
      heading: 'Certification',
      designer: v('footing-designer') || ''
    });
  }

  doc.save(`twinanalytic_footing_rect_s-103_${new Date().toISOString().split('T')[0]}.pdf`);
}
