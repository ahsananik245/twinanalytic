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

  // simple logo
  doc.setFillColor(201, 168, 76);
  doc.rect(0.5, 0.5, 0.4, 0.4, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 40, 50);
  doc.text('ISOLATED RECTANGULAR FOOTING DESIGN', 1.1, 0.7);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Calculated via TwinAnalytic — www.twinanalytic.com', 1.1, 0.85);

  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.02);
  doc.line(0.5, 1.1, 8.0, 1.1);

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

  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(0.5, 7.8, 7.0, 2.0, 0.1, 0.1, 'S');
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  doc.text('(Review Interactive Dimension Schematic Online)', 2.5, 8.8);

  doc.save(`twinanalytic_footing_rect_s-103_${new Date().toISOString().split('T')[0]}.pdf`);
}
