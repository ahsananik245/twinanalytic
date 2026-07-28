function calculateRectFooting() {
  const unlocked = localStorage.getItem('tools_user_unlocked') === 'true';
  if (!unlocked) {
    if (typeof openAuthModal === 'function') {
      openAuthModal(runRectFootingLogic, 'Rectangular Footing Design');
    }
    return;
  }
  runRectFootingLogic();
}

function runRectFootingLogic() {
  const fc = parseFloat(document.getElementById('footing-fc').value);
  const fy = parseFloat(document.getElementById('footing-fy').value);
  const gamma = parseFloat(document.getElementById('footing-gamma').value);
  const Qa = parseFloat(document.getElementById('footing-qa').value);

  const c1 = parseFloat(document.getElementById('footing-c1').value);
  const c2 = parseFloat(document.getElementById('footing-c2').value);
  const dl = parseFloat(document.getElementById('footing-dl').value);
  const ll = parseFloat(document.getElementById('footing-ll').value);
  const surcharge = parseFloat(document.getElementById('footing-surcharge').value);

  const L_trial = parseFloat(document.getElementById('footing-rect-l').value);
  const B_trial = parseFloat(document.getElementById('footing-rect-b').value);
  const cover = parseFloat(document.getElementById('footing-cover').value);
  const d = parseFloat(document.getElementById('footing-d').value);

  const rebarL_mm = parseFloat(document.getElementById('footing-rebar-l').value);
  const rebarS_mm = parseFloat(document.getElementById('footing-rebar-s').value);

  // Material Pressure
  const q_mat = gamma * surcharge; // psf
  const q_e = (Qa * 1000) - q_mat; // psf

  // Required area
  const A_req = ((dl + ll) * 1000) / q_e; // sqft

  // Furnished Area based on trial dims
  const A_furnished = L_trial * B_trial;

  // Factored loads
  const qu = (1.2 * dl + 1.6 * ll) / A_furnished; // ksf

  // 1. PUNCHING SHEAR
  const bo = 2*(c1+d) + 2*(c2+d); // inches
  const Vu1 = qu * (A_furnished - ((c1+d)/12)*((c2+d)/12)); // Kips
  const Vc1 = 4 * Math.sqrt(fc) * bo * d / 1000;
  const pVc1 = 0.75 * Vc1;

  // 2. BEAM SHEAR (L-Dir)
  const L_cant_L = (L_trial - c1/12)/2;
  const L_shear_L = L_cant_L - (d/12);
  let Vu2L = 0;
  if(L_shear_L > 0) Vu2L = qu * B_trial * L_shear_L;
  const Vc2L = 2 * Math.sqrt(fc) * (B_trial * 12) * d / 1000;
  const pVc2L = 0.75 * Vc2L;

  // 3. BEAM SHEAR (B-Dir)
  const L_cant_B = (B_trial - c2/12)/2;
  const L_shear_B = L_cant_B - (d/12);
  let Vu2B = 0;
  if(L_shear_B > 0) Vu2B = qu * L_trial * L_shear_B;
  const Vc2B = 2 * Math.sqrt(fc) * (L_trial * 12) * d / 1000;
  const pVc2B = 0.75 * Vc2B;

  // 4. MOMENT AND REBAR L-DIR
  const MuL = qu * B_trial * (L_cant_L * L_cant_L) / 2; // K-ft
  const MuL_kin = MuL * 12;
  const As_req_L = (MuL_kin * 1000) / (0.9 * fy * (d - 0.65/2));
  const As_min1_L = (3 * Math.sqrt(fc) * (B_trial * 12) * d) / fy;
  const As_min2_L = (200 * (B_trial * 12) * d) / fy;
  const As_control_L = Math.max(As_req_L, As_min1_L, As_min2_L);

  const area_bL = (Math.PI / 4) * Math.pow(rebarL_mm / 25.4, 2);
  const n_bars_L = Math.ceil(As_control_L / area_bL);
  const spacing_L = Math.floor((B_trial * 12 - 2 * cover) / (n_bars_L - 1 || 1));

  // 5. MOMENT AND REBAR B-DIR
  const MuB = qu * L_trial * (L_cant_B * L_cant_B) / 2; // K-ft
  const MuB_kin = MuB * 12;
  const As_req_B = (MuB_kin * 1000) / (0.9 * fy * (d - 0.69/2));
  const As_min1_B = (3 * Math.sqrt(fc) * (L_trial * 12) * d) / fy;
  const As_min2_B = (200 * (L_trial * 12) * d) / fy;
  const As_control_B = Math.max(As_req_B, As_min1_B, As_min2_B);

  const area_bS = (Math.PI / 4) * Math.pow(rebarS_mm / 25.4, 2);
  const n_bars_B = Math.ceil(As_control_B / area_bS);
  const spacing_B = Math.floor((L_trial * 12 - 2 * cover) / (n_bars_B - 1 || 1));

  // DOM UPDATES
  document.getElementById('footing-out-area').textContent = A_req.toFixed(2);
  document.getElementById('footing-out-lb').textContent = `${L_trial.toFixed(2)} x ${B_trial.toFixed(2)}`;

  document.getElementById('footing-out-vu1').textContent = Vu1.toFixed(1);
  document.getElementById('footing-out-pvc1').textContent = pVc1.toFixed(1);

  document.getElementById('footing-out-vu2l').textContent = Vu2L.toFixed(1);
  document.getElementById('footing-out-pvc2l').textContent = pVc2L.toFixed(1);

  document.getElementById('footing-out-vu2b').textContent = Vu2B.toFixed(1);
  document.getElementById('footing-out-pvc2b').textContent = pVc2B.toFixed(1);

  document.getElementById('footing-out-as-l').textContent = As_req_L.toFixed(2);
  document.getElementById('footing-out-as-b').textContent = As_req_B.toFixed(2);

  document.getElementById('footing-out-rebar-l').textContent = `${rebarL_mm}mm @ ${spacing_L}" c/c`;
  document.getElementById('footing-out-rebar-b').textContent = `${rebarS_mm}mm @ ${spacing_B}" c/c`;

  const statusEl = document.getElementById('footing-rect-status-badge');
  if (pVc1 >= Vu1 && pVc2L >= Vu2L && pVc2B >= Vu2B && A_furnished >= A_req) {
    statusEl.textContent = "CHECK PASSED";
    statusEl.style.backgroundColor = "rgba(46, 204, 113, 0.2)";
    statusEl.style.color = "#2ecc71";
    statusEl.style.border = "1px solid #2ecc71";
  } else {
    statusEl.textContent = "CHECK FAILED (REVISE DIMS/d)";
    statusEl.style.backgroundColor = "rgba(231, 76, 60, 0.2)";
    statusEl.style.color = "#e74c3c";
    statusEl.style.border = "1px solid #e74c3c";
  }
  statusEl.style.display = 'inline-block';
  statusEl.style.marginBottom = '1.5rem';
  statusEl.style.padding = '0.4rem 0.8rem';

  drawRectFootingPlan(L_trial, B_trial, c1, c2, spacing_L, spacing_B);
}

function drawRectFootingPlan(L, B, c1, c2, spL, spB) {
    const container = document.getElementById('footing-rect-diagram');
    if(!container) return;
    container.innerHTML = '';

    const w = 500;
    const h = 400;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', '100%');
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

    const max_dim = Math.max(L, B);
    const scale = 280 / max_dim;

    const offset_x = (w - L*scale)/2;
    const offset_y = (h - B*scale)/2 + 20;

    const base = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    base.setAttribute('x', offset_x);
    base.setAttribute('y', offset_y);
    base.setAttribute('width', L * scale);
    base.setAttribute('height', B * scale);
    base.setAttribute('fill', 'none');
    base.setAttribute('stroke', '#a0aec0');
    base.setAttribute('stroke-width', '2');
    svg.appendChild(base);

    const c1_ft = c1 / 12;
    const c2_ft = c2 / 12;
    const col = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    col.setAttribute('x', offset_x + (L/2 - c1_ft/2)*scale);
    col.setAttribute('y', offset_y + (B/2 - c2_ft/2)*scale);
    col.setAttribute('width', c1_ft * scale);
    col.setAttribute('height', c2_ft * scale);
    col.setAttribute('fill', 'rgba(201, 168, 76, 0.3)');
    col.setAttribute('stroke', '#c9a84c');
    col.setAttribute('stroke-width', '2');
    svg.appendChild(col);

    for (let i = 1; i < 6; i++) {
        const lineH = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineH.setAttribute('x1', offset_x + 10);
        lineH.setAttribute('y1', offset_y + (i/6)*(B * scale));
        lineH.setAttribute('x2', offset_x + (L * scale) - 10);
        lineH.setAttribute('y2', offset_y + (i/6)*(B * scale));
        lineH.setAttribute('stroke', '#4a5568');
        lineH.setAttribute('stroke-width', '1');
        svg.appendChild(lineH);

        const lineV = document.createElementNS("http://www.w3.org/2000/svg", "line");
        lineV.setAttribute('x1', offset_x + (i/6)*(L * scale));
        lineV.setAttribute('y1', offset_y + 10);
        lineV.setAttribute('x2', offset_x + (i/6)*(L * scale));
        lineV.setAttribute('y2', offset_y + (B*scale) - 10);
        lineV.setAttribute('stroke', '#4a5568');
        lineV.setAttribute('stroke-width', '1');
        svg.appendChild(lineV);
    }

    const txtCols = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txtCols.setAttribute('x', w/2);
    txtCols.setAttribute('y', 20);
    txtCols.setAttribute('fill', '#e2e8f0');
    txtCols.setAttribute('font-family', 'sans-serif');
    txtCols.setAttribute('font-size', '14');
    txtCols.setAttribute('text-anchor', 'middle');
    txtCols.textContent = `Rect Footing: ${L.toFixed(1)}' x ${B.toFixed(1)}' | Col: ${c1}" x ${c2}"`;
    svg.appendChild(txtCols);

    container.appendChild(svg);
}

document.addEventListener('DOMContentLoaded', () => {
  const btnFootingRect = document.getElementById('btn-calc-footing-rect');
  if (btnFootingRect) {
    btnFootingRect.addEventListener('click', calculateRectFooting);
  }
});