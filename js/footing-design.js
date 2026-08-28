// Basic locking mechanism hooks
// ACI 318 22.6.5.3 — alpha_s by column position.
const ALPHA_S = { interior: 40, edge: 30, corner: 20 };

function calculateFooting() {
  const unlocked = localStorage.getItem('tools_user_unlocked') === 'true';
  if (!unlocked) {
    if (typeof openAuthModal === 'function') {
      openAuthModal(runFootingLogic, 'Single Footing Design');
    }
    return;
  }
  runFootingLogic();
}

function runFootingLogic() {
  const fc = parseFloat(document.getElementById('footing-fc').value);
  const fy = parseFloat(document.getElementById('footing-fy').value);
  const gamma = parseFloat(document.getElementById('footing-gamma').value);
  const Qa = parseFloat(document.getElementById('footing-qa').value);

  const c1 = parseFloat(document.getElementById('footing-c1').value);
  const c2 = parseFloat(document.getElementById('footing-c2').value);
  const dl = parseFloat(document.getElementById('footing-dl').value);
  const ll = parseFloat(document.getElementById('footing-ll').value);
  const surcharge = parseFloat(document.getElementById('footing-surcharge').value);

  const cover = parseFloat(document.getElementById('footing-cover').value);
  const d = parseFloat(document.getElementById('footing-d').value);
  const rebarL = parseFloat(document.getElementById('footing-rebar-l').value);
  const rebarS = parseFloat(document.getElementById('footing-rebar-s').value);

  // Pressure of materials = gamma * surcharge
  const q_mat = gamma * surcharge; // psf

  // Available BC to carry column service load
  const q_e = (Qa * 1000) - q_mat; // psf

  // Required Footing Area
  const A_req = ((dl + ll) * 1000) / q_e; // sqft

  // Trial width B (Square footing)
  let B = Math.sqrt(A_req); // feet
  // Standardize B to next higher 0.25 ft (3 inches)
  B = Math.ceil(B * 4) / 4;

  const A_furnished = B * B; // sqft

  // Upward pressure by factored load
  const qu = (1.2 * dl + 1.6 * ll) / A_furnished; // ksf

  // 1. PUNCHING SHEAR (TWO-WAY)
  // Critical perimeter bo = 2*(c1+d) + 2*(c2+d)
  const bo = 2*(c1+d) + 2*(c2+d); // inches

  // Vu1
  const Vu1 = qu * (A_furnished - ((c1+d)/12)*((c2+d)/12)); // Kips

  // ACI 318 22.6.5.2 — two-way shear strength is the LEAST of three
  // expressions, not 4*sqrt(f'c) alone. The 4 term governs only for stocky,
  // roughly square columns; (2 + 4/betaC) takes over once the column is
  // elongated (betaC > 2) and (2 + alphaS*d/bo) once the critical perimeter is
  // long relative to the effective depth. Using 4 unconditionally overstates
  // the capacity in both of those cases — unconservative, and exactly the
  // defect CALCULATION-NOTES.md records against the source workbook.
  const betaC  = Math.max(c1, c2) / Math.min(c1, c2);
  const alphaS = ALPHA_S[(document.getElementById('footing-colpos') || {}).value] || 40;
  const vcCoeffs = [4, 2 + 4 / betaC, 2 + (alphaS * d) / bo];
  const vcCoeff  = Math.min(...vcCoeffs);
  const govern   = ['4√f′c', '(2+4/βc)√f′c', '(2+αs·d/bo)√f′c'][vcCoeffs.indexOf(vcCoeff)];
  const Vc1 = vcCoeff * Math.sqrt(fc) * bo * d / 1000;
  const pVc1 = 0.75 * Vc1;

  // 2. BEAM SHEAR (ONE-WAY)
  // L cantilever = (B - c1/12)/2
  // Vu2 acting on perimeter at d from column face
  const L_cant = (B - c1/12)/2;
  const L_shear = L_cant - (d/12);
  let Vu2 = 0;
  if (L_shear > 0) {
      Vu2 = qu * B * L_shear; // Kips
  }

  // Vc2 = 2 * sqrt(fc) * B(in inches) * d / 1000
  const Vc2 = 2 * Math.sqrt(fc) * (B * 12) * d / 1000;
  const pVc2 = 0.75 * Vc2;

  // 3. BENDING MOMENT & REBAR
  const Mu = qu * B * (L_cant * L_cant) / 2; // Kips-ft
  const Mu_k_in = Mu * 12; // Kips-in

  // Approximate As
  // As = Mu / (phi * fy * j * d) roughly j=0.9
  const a_approx = 0.75; // Assumed a
  const As_req = (Mu_k_in * 1000) / (0.9 * fy * (d - a_approx/2)); // in^2

  // Min As criteria
  const As_min1 = (3 * Math.sqrt(fc) * (B * 12) * d) / fy;
  const As_min2 = (200 * (B * 12) * d) / fy;

  let As_control = Math.max(As_req, As_min1, As_min2);

  // Rebar provided
  const area_barL = (Math.PI / 4) * Math.pow(rebarL / 25.4, 2);
  let num_bars = Math.ceil(As_control / area_barL);

  // Spacing
  let spacing = (B * 12 - (2 * cover)) / (num_bars - 1);
  spacing = Math.floor(spacing); // round down to whole inch

  // Publish the working so the report generator can show the full
  // step-by-step rather than only the final numbers.
  window.footingResults = {
    fc, fy, gamma, Qa, c1, c2, dl, ll, surcharge, cover, d, rebarL, rebarS,
    q_mat, q_e, A_req, B, A_furnished, qu,
    bo, Vu1, Vc1, pVc1, L_cant, L_shear, Vu2, Vc2, pVc2,
    Mu, Mu_k_in, a_approx, As_req, As_min1, As_min2, As_control,
    area_barL, num_bars, spacing,
    shearOK: (pVc1 >= Vu1 && pVc2 >= Vu2)
  };

  // DOM UPDATES
  document.getElementById('footing-out-area').textContent = A_req.toFixed(2);
  document.getElementById('footing-out-bb').textContent = B.toFixed(2) + " x " + B.toFixed(2);

  document.getElementById('footing-out-vu1').textContent = Vu1.toFixed(1);
  document.getElementById('footing-out-pvc1').textContent = pVc1.toFixed(1);
  const govEl = document.getElementById('footing-out-govern');
  if (govEl) govEl.textContent = govern;   // which of the three ACI terms controls

  document.getElementById('footing-out-vu2').textContent = Vu2.toFixed(1);
  document.getElementById('footing-out-pvc2').textContent = pVc2.toFixed(1);

  document.getElementById('footing-out-as').textContent = As_req.toFixed(2);
  document.getElementById('footing-out-asmin').textContent = Math.max(As_min1, As_min2).toFixed(2);

  document.getElementById('footing-out-rebar').textContent = `${rebarL}mm @ ${spacing}" c/c Both Dir`;

  const statusEl = document.getElementById('footing-status-badge');
  if (pVc1 >= Vu1 && pVc2 >= Vu2) {
    statusEl.textContent = "SHEAR CHECK PASSED";
    statusEl.style.backgroundColor = "rgba(46, 204, 113, 0.2)";
    statusEl.style.color = "#2ecc71";
    statusEl.style.border = "1px solid #2ecc71";

    // Enable PDF download button
    const pdfBtn = document.getElementById('btn-footing-pdf');
    if (pdfBtn) pdfBtn.disabled = false;
  } else {
    statusEl.textContent = "SHEAR FAILED (INCREASE d)";
    statusEl.style.backgroundColor = "rgba(231, 76, 60, 0.2)";
    statusEl.style.color = "#e74c3c";
    statusEl.style.border = "1px solid #e74c3c";

    // Disable PDF download button
    const pdfBtn = document.getElementById('btn-footing-pdf');
    if (pdfBtn) pdfBtn.disabled = true;
  }
  statusEl.style.display = 'inline-block';
  statusEl.style.marginBottom = '1.5rem';
  statusEl.style.padding = '0.4rem 0.8rem';

  drawFootingPlan(B, c1, c2, spacing, rebarL);
}

function drawFootingPlan(B, c1, c2, spacing, rebarL) {
    const container = document.getElementById('footing-diagram');
    container.innerHTML = '';

    // SVG Dimensions
    const w = 400;
    const h = 400;

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    // Scale footing width B (ft) to occupy max 320px
    const scale = 320 / B;
    const offset = 40; // padding

    // Draw Footing Base
    const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    base.setAttribute('x', offset);
    base.setAttribute('y', offset);
    base.setAttribute('width', B * scale);
    base.setAttribute('height', B * scale);
    base.setAttribute('fill', 'none');
    base.setAttribute('stroke', '#a0aec0');
    base.setAttribute('stroke-width', '2');
    svg.appendChild(base);

    // Draw Column
    const c1_ft = c1 / 12;
    const c2_ft = c2 / 12;
    const col = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    col.setAttribute('x', offset + (B/2 - c1_ft/2)*scale);
    col.setAttribute('y', offset + (B/2 - c2_ft/2)*scale);
    col.setAttribute('width', c1_ft * scale);
    col.setAttribute('height', c2_ft * scale);
    col.setAttribute('fill', 'rgba(201, 168, 76, 0.3)');
    col.setAttribute('stroke', '#c9a84c');
    col.setAttribute('stroke-width', '2');
    svg.appendChild(col);

    // Rebar grid approximation
    // Let's just draw 5 lines in each direction to simulate the mat
    for (let i = 1; i < 6; i++) {
        const lineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineH.setAttribute('x1', offset + 10);
        lineH.setAttribute('y1', offset + (i/6)*(B * scale));
        lineH.setAttribute('x2', offset + (B * scale) - 10);
        lineH.setAttribute('y2', offset + (i/6)*(B * scale));
        lineH.setAttribute('stroke', '#4a5568');
        lineH.setAttribute('stroke-width', '1');
        svg.appendChild(lineH);

        const lineV = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineV.setAttribute('x1', offset + (i/6)*(B * scale));
        lineV.setAttribute('y1', offset + 10);
        lineV.setAttribute('x2', offset + (i/6)*(B * scale));
        lineV.setAttribute('y2', offset + (B*scale) - 10);
        lineV.setAttribute('stroke', '#4a5568');
        lineV.setAttribute('stroke-width', '1');
        svg.appendChild(lineV);
    }

    // Labels
    const txtCols = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txtCols.setAttribute('x', w/2);
    txtCols.setAttribute('y', offset/2);
    txtCols.setAttribute('fill', '#e2e8f0');
    txtCols.setAttribute('font-family', 'sans-serif');
    txtCols.setAttribute('font-size', '12');
    txtCols.setAttribute('text-anchor', 'middle');
    txtCols.textContent = `Footing: ${B.toFixed(1)}' x ${B.toFixed(1)}' | Col: ${c1}" x ${c2}"`;
    svg.appendChild(txtCols);

    container.appendChild(svg);
}

// Map the HTML calculators.js logic since it might be required for the header/nav overlays
document.addEventListener('DOMContentLoaded', () => {
  // Try to use calculators.js init logic if included
  if (typeof initAdminPanel === 'function') initAdminPanel();
  if (typeof updateLockUI === 'function') updateLockUI();
});
document.addEventListener('DOMContentLoaded', () => {
  const btnFooting = document.getElementById('btn-calc-footing');
  if (btnFooting) {
    btnFooting.addEventListener('click', calculateFooting);
  }
});
