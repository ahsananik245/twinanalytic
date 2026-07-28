// Attach to PDF Buttons
document.addEventListener('DOMContentLoaded', () => {
  const btnFootingPdf = document.getElementById('btn-footing-pdf');
  if (btnFootingPdf) {
    btnFootingPdf.addEventListener('click', downloadFootingPDF);
  }
});

function drawTwinAnalyticLogo(doc, x, y, size, isDarkBg) {
  // simple simplified draw logo to not depend on calculating js block if omitted
  doc.setFillColor(isDarkBg ? 0 : 201, isDarkBg ? 0 : 168, isDarkBg ? 0 : 76);
  doc.rect(x, y, size, size, 'F');
}

function downloadFootingPDF() {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ format: 'letter', unit: 'in' });

  // Common Header
  drawTwinAnalyticLogo(doc, 0.5, 0.5, 0.4, false);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(30, 40, 50);
  doc.text('ISOLATED SQUARE FOOTING DESIGN', 1.1, 0.7);

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Calculated via TwinAnalytic — www.twinanalytic.com', 1.1, 0.85);

  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.02);
  doc.line(0.5, 1.1, 8.0, 1.1);

  // Grab values safely
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
  doc.text(`Provided Dimension: ${v('footing-out-bb')} ft`, 0.5, 5.2);

  doc.text(`Two-Way Punching Shear (Vu): ${v('footing-out-vu1')} kips`, 0.5, 5.7);
  doc.text(`Two-Way Shear Capacity (φVc): ${v('footing-out-pvc1')} kips`, 4.5, 5.7);

  doc.text(`One-Way Beam Shear (Vu): ${v('footing-out-vu2')} kips`, 0.5, 6.0);
  doc.text(`One-Way Shear Capacity (φVc): ${v('footing-out-pvc2')} kips`, 4.5, 6.0);

  doc.text(`Calculated Req. Rebar: ${v('footing-out-as')} sq.in`, 0.5, 6.5);
  doc.text(`Minimum Control As: ${v('footing-out-asmin')} sq.in`, 4.5, 6.5);

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(201, 168, 76);
  doc.text(`Final Reinforcement: ${v('footing-out-rebar')}`, 0.5, 7.2);

  doc.setTextColor(0,0,0);
  doc.text(`Status: ${v('footing-status-badge')}`, 0.5, 7.6);

  // Diagram placeholder text
  doc.setDrawColor(200, 200, 200);
  doc.roundedRect(0.5, 8.0, 7.0, 2.0, 0.1, 0.1, 'S');
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  doc.text('(Review Interactive Dimension Schematic Online)', 2.5, 9.0);

  doc.save(`twinanalytic_footing_s-102_${new Date().toISOString().split('T')[0]}.pdf`);
}
