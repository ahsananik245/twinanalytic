// Google Sheets Apps Script Web App Integration URL
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwOCu31hE-GRIvbTOH2HVb_PaAAFkDnyuqUZ1mRusZDll3NmeJ9JZ4ZBWxI_NRt1vCknQ/exec";

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initCalculators();
  initAdminPanel();
  updateLeadsCount();
});

// ==========================================
// 1. TABS MANAGEMENT
// ==========================================
function initTabs() {
  const tabs = document.querySelectorAll('.tool-tab-btn');
  const panels = document.querySelectorAll('.tool-content-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deactivate all
      tabs.forEach(t => t.classList.remove('active'));
      panels.forEach(p => p.classList.remove('active'));

      // Activate clicked
      tab.classList.add('active');
      const targetId = `panel-${tab.getAttribute('data-tab')}`;
      const activePanel = document.getElementById(targetId);
      if (activePanel) {
        activePanel.classList.add('active');
        // Trigger resize or redraw for the active canvas
        triggerCanvasRedraw(tab.getAttribute('data-tab'));
      }
    });
  });
}

function triggerCanvasRedraw(tabId) {
  switch(tabId) {
    case 'beam': calculateBeam(); break;
    case 'column': calculateColumn(); break;
    case 'slab': calculateSlab(); break;
    case 'pile-cap': calculatePileCap(); break;
    case 'footing': calculateFooting(); break;
  }
}

// Global variables to track callbacks after authentication
let pendingCallback = null;
let pendingType = '';

// ==========================================
// 2. CALCULATOR INITIALIZATIONS
// ==========================================
function initCalculators() {
  const btnBeam = document.getElementById('btn-calc-beam');
  const btnCol = document.getElementById('btn-calc-column');
  const btnSlab = document.getElementById('btn-calc-slab');
  const btnPile = document.getElementById('btn-calc-pile-cap');
  const btnFoot = document.getElementById('btn-calc-footing');

  if (btnBeam) {
    btnBeam.addEventListener('click', () => checkAuthAndRun(calculateBeam, 'Beam Design'));
    calculateBeam();
  }
  if (btnCol) {
    btnCol.addEventListener('click', () => checkAuthAndRun(calculateColumn, 'Column Design'));
    calculateColumn();
  }
  const btnPDF = document.getElementById('btn-download-pdf');
  if (btnPDF) {
    btnPDF.addEventListener('click', downloadColumnPDF);
  }
  if (btnSlab) {
    btnSlab.addEventListener('click', () => checkAuthAndRun(calculateSlab, 'Slab Design'));
    calculateSlab();
  }
  const btnSlabPDFs = document.querySelectorAll('[id="btn-download-slab-pdf"]');
  btnSlabPDFs.forEach(btn => {
    btn.addEventListener('click', downloadSlabPDF);
  });
  if (btnPile) {
    btnPile.addEventListener('click', () => checkAuthAndRun(calculatePileCap, 'Pile Cap Design'));
    calculatePileCap();
  }
  if (btnFoot) {
    btnFoot.addEventListener('click', () => checkAuthAndRun(calculateFooting, 'Footing Design'));
    calculateFooting();
  }

  // Bind auth modal form submission
  const authForm = document.getElementById('modal-auth-form');
  if (authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }
}

// Check if user is already authorized; if not, prompt modal form
function checkAuthAndRun(callback, calcType) {
  const isUnlocked = localStorage.getItem('tools_user_unlocked');
  if (isUnlocked === 'true') {
    callback();
  } else {
    openAuthModal(callback, calcType);
  }
}

// Display the glassmorphic auth modal
function openAuthModal(callback, calcType) {
  pendingCallback = callback;
  pendingType = calcType;
  
  const modal = document.getElementById('auth-modal');
  if (modal) {
    modal.classList.add('active');
  }
}

// Internal calculation engine to compute metrics before sending to database
function calculateMetricsInternally(calcType) {
  const metrics = {
    geometry: "N/A",
    reinforcement: "N/A",
    status: "PASS",
    concreteVol: "N/A",
    steelWeight: "N/A"
  };

  try {
    if (calcType.includes("Column")) {
      const pdl = parseFloat(document.getElementById('column-pdl').value) || 0;
      const pll = parseFloat(document.getElementById('column-pll').value) || 0;
      const fc = parseFloat(document.getElementById('column-fc').value) || 3;
      const fy = parseFloat(document.getElementById('column-fy').value) || 60;
      const phi = parseFloat(document.getElementById('column-phi').value) || 0.65;
      const p = parseFloat(document.getElementById('column-p').value) || 0.02;
      const colHeight = parseFloat(document.getElementById('column-height').value) || 10;

      const Pu = (1.2 * pdl) + (1.6 * pll);
      const denominator = phi * 0.80 * (0.85 * fc * (1 - p) + fy * p);
      if (denominator > 0) {
        const Ag = Pu / denominator;
        const Dim = Math.ceil(Math.sqrt(Ag));
        const ColumnArea = Dim * Dim;
        const Ast = ((Pu / (phi * 0.80)) - (0.85 * fc * ColumnArea)) / (fy - (0.85 * fc));

        const mainBarSize = document.getElementById('column-main-bar').value;
        const tieBarSize = document.getElementById('column-tie-bar').value;
        let mainBarDia = mainBarSize === '#7' ? 0.875 : mainBarSize === '#8' ? 1.0 : 1.128;
        let tieBarDia = tieBarSize === '#3' ? 0.375 : 0.500;
        const maxTieSpacing = Math.min(16 * mainBarDia, 48 * tieBarDia, Dim);

        const PnMax = 0.80 * (0.85 * fc * (ColumnArea - Ast) + fy * Ast);
        const PhiPn = 0.65 * PnMax;
        const dcRatio = PhiPn > 0 ? Pu / PhiPn : 0;

        const concreteVol = ((ColumnArea / 144) * colHeight) * 0.02831685;
        const steelWeight = ((Ast * 3.4) * colHeight) * 0.45359237;

        metrics.geometry = `${Dim}" x ${Dim}"`;
        metrics.reinforcement = `8 Nos ${mainBarSize} (Ties: ${maxTieSpacing.toFixed(1)}")`;
        metrics.status = dcRatio <= 1.0 ? `PASS [D/C = ${dcRatio.toFixed(2)}]` : `FAIL - OVERSTRESSED [D/C = ${dcRatio.toFixed(2)}]`;
        metrics.concreteVol = `${concreteVol.toFixed(2)} m³`;
        metrics.steelWeight = `${steelWeight.toFixed(1)} kg`;
      }
    } else if (calcType.includes("Beam")) {
      const b = parseFloat(document.getElementById('beam-w').value) || 0;
      const D = parseFloat(document.getElementById('beam-d').value) || 0;
      const Mu = parseFloat(document.getElementById('beam-moment').value) || 0;
      const cover = parseFloat(document.getElementById('beam-cover').value) || 0;
      const fck = parseFloat(document.getElementById('beam-concrete').value) || 25;
      const fy = parseFloat(document.getElementById('beam-steel').value) || 500;

      const d = D - cover - 12;
      const xuMax_d = fy === 500 ? 0.46 : 0.48;
      const RuLim = 0.36 * (fck / 1.5) * xuMax_d * (1 - 0.42 * xuMax_d);
      const MuLim = RuLim * b * d * d * 1e-6;

      let status = "PASS";
      let rebarText = "";
      if (Mu > MuLim) {
        status = "FAIL";
        rebarText = "Over-reinforced (Resize)";
      } else {
        let ast = (0.5 * fck * b * d / fy) * (1 - Math.sqrt(1 - (4.6 * Mu * 1e6) / (fck * b * d * d)));
        const astMin = (0.85 * b * d) / fy;
        if (ast < astMin) ast = astMin;
        const numBars = Math.max(2, Math.ceil(ast / (Math.PI * 16 * 16 / 4)));
        rebarText = `${numBars} Nos - 16mm`;
      }

      metrics.geometry = `${b}mm x ${D}mm`;
      metrics.reinforcement = rebarText;
      metrics.status = status;
    } else if (calcType.includes("Slab")) {
      const l1 = parseFloat(document.getElementById('slab-l1').value) || 0;
      const l2 = parseFloat(document.getElementById('slab-l2').value) || 0;
      const c1 = parseFloat(document.getElementById('slab-c1').value) || 0;
      const h = parseFloat(document.getElementById('slab-h').value) || 0;
      const sdl = parseFloat(document.getElementById('slab-sdl').value) || 0;
      const ll = parseFloat(document.getElementById('slab-ll').value) || 0;

      const wu = (1.2 * (sdl + (h / 12 * 150))) + (1.6 * ll); // psf
      const ln = l1 - (c1 / 12); // ft
      const Mo = (wu * l2 * Math.pow(ln, 2)) / 8 / 1000; // kip-ft

      const isSpanOk = ln >= 0.65 * l1;
      const status = isSpanOk ? "PASS" : "FAIL (Clear Span short)";

      const concreteVol = ((h / 12) * l1 * l2) * 0.02831685; // m3
      const steelWeight = (2 * 0.0018 * 12 * l1 * l2 * h * 3.4) * 0.45359237; // kg

      metrics.geometry = `${l1}'x${l2}' (h=${h}")`;
      metrics.reinforcement = `Mo = ${Mo.toFixed(1)} k-ft`;
      metrics.status = status;
      metrics.concreteVol = `${concreteVol.toFixed(2)} m³`;
      metrics.steelWeight = `${steelWeight.toFixed(1)} kg`;
    } else if (calcType.includes("Pile Cap")) {
      const dia = parseFloat(document.getElementById('pile-dia').value) || 0;
      const count = parseInt(document.getElementById('pile-count').value, 10) || 4;
      const load = parseFloat(document.getElementById('pile-load').value) || 0;
      const depth = parseFloat(document.getElementById('pile-depth').value) || 0;
      const fck = parseFloat(document.getElementById('pile-concrete').value) || 25;

      const d = depth - 100;
      const punchingStress = (load * 1e3) / (4 * 500 * d);
      const permissibleShear = 0.25 * Math.sqrt(fck);
      const ratio = punchingStress / permissibleShear;

      metrics.geometry = `depth: ${depth} mm`;
      metrics.reinforcement = `${count} piles (${dia}mm)`;
      metrics.status = ratio <= 1.0 ? "PASS" : "FAIL (Shear)";
    } else if (calcType.includes("Footing")) {
      const load = parseFloat(document.getElementById('footing-load').value) || 0;
      const sbc = parseFloat(document.getElementById('footing-sbc').value) || 150;
      const colSize = parseFloat(document.getElementById('footing-col').value) || 300;

      const reqArea = (load * 1.1) / sbc;
      const width = Math.ceil(Math.sqrt(reqArea) * 20) / 20;

      metrics.geometry = `${width.toFixed(2)}m x ${width.toFixed(2)}m`;
      metrics.reinforcement = `Col: ${colSize}mm`;
      metrics.status = "PASS";
    }
  } catch (err) {
    console.error("Internal calculation failed:", err);
  }

  return metrics;
}

// Handle auth form submission, save lead to Google Sheets and local database, and close modal
function handleAuthSubmit(event) {
  event.preventDefault();

  const name = document.getElementById('lead-name').value.trim();
  const phone = document.getElementById('lead-phone').value.trim();
  const email = document.getElementById('lead-email').value.trim();
  const timestamp = new Date().toLocaleString();

  // 1. Client-side Validation
  if (!name) {
    alert("Please enter your full name.");
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    alert("Please enter a valid business email address.");
    return;
  }

  // Validate Phone (accepting international E.164 formats, checking for 7 to 15 digits)
  const digitCount = phone.replace(/\D/g, '').length;
  if (digitCount < 7 || digitCount > 15) {
    alert("Please enter a valid contact number (7 to 15 digits, e.g., +1 (555) 123-4567).");
    return;
  }

  // 2. Button Loading State
  const submitBtn = event.target.querySelector('button[type="submit"]');
  const originalBtnText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.5rem;"></i> Unlocking...';

  // 3. Compute calculated metrics internally before submission
  const calculatedMetrics = calculateMetricsInternally(pendingType);

  const payload = {
    name: name,
    email: email,
    phone: phone, // preserve original formatting (including '+', spaces, and dashes)
    timestamp: timestamp,
    calcType: pendingType,
    geometry: calculatedMetrics.geometry,
    reinforcement: calculatedMetrics.reinforcement,
    status: calculatedMetrics.status,
    concreteVol: calculatedMetrics.concreteVol,
    steelWeight: calculatedMetrics.steelWeight
  };

  const completeUnlock = () => {
    // Save entry in leads array locally
    let leads = JSON.parse(localStorage.getItem('tools_leads') || '[]');
    leads.push({
      ...payload,
      timestamp: timestamp
    });
    localStorage.setItem('tools_leads', JSON.stringify(leads));
    localStorage.setItem('tools_user_unlocked', 'true');

    // Close modal
    const modal = document.getElementById('auth-modal');
    if (modal) {
      modal.classList.remove('active');
    }

    // Update lead indicators
    updateLeadsCount();

    // Run the blocked calculator callback (runs calculation or downloads PDF)
    if (pendingCallback) {
      pendingCallback();
    }

    // Reset button and form inputs
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
    event.target.reset();
  };

  // 4. API Posting block
  const googleScriptUrl = GOOGLE_SCRIPT_URL;
  if (!googleScriptUrl || googleScriptUrl === "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL") {
    console.warn("Google Sheets Apps Script URL not configured. Logging locally.");
    setTimeout(completeUnlock, 1000); // Simulate smooth network latency
    return;
  }

  fetch(googleScriptUrl, {
    method: 'POST',
    mode: 'no-cors', // standard way to post to Apps Script redirect URLs
    headers: {
      'Content-Type': 'text/plain'
    },
    body: JSON.stringify(payload)
  })
  .then(() => {
    completeUnlock();
  })
  .catch((error) => {
    console.error("Submission error:", error);
    alert("Error connecting to database. Please check your network connection and try again.");
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalBtnText;
  });
}

// Initialize admin leads management actions
function initAdminPanel() {
  const btnExport = document.getElementById('btn-export-leads');
  const btnClear = document.getElementById('btn-clear-leads');

  if (btnExport) {
    btnExport.addEventListener('click', exportLeadsToCSV);
  }
  if (btnClear) {
    btnClear.addEventListener('click', clearLeadsDatabase);
  }
}

// Update UI lead statistics
function updateLeadsCount() {
  const countEl = document.getElementById('leads-count');
  if (countEl) {
    const leads = JSON.parse(localStorage.getItem('tools_leads') || '[]');
    countEl.textContent = leads.length;
  }
}

// Convert localStorage leads to Excel-ready CSV file and trigger download
function exportLeadsToCSV() {
  const leads = JSON.parse(localStorage.getItem('tools_leads') || '[]');
  if (leads.length === 0) {
    alert('No lead records found in the database yet. Try running a calculator to populate the log!');
    return;
  }

  // Build CSV content
  const headers = ['Full Name', 'Contact Number', 'Business Email', 'Logged Timestamp', 'Calculator Action'];
  const rows = leads.map(l => [
    l.name,
    l.phone,
    l.email,
    l.timestamp,
    l.calcType
  ]);

  let csvContent = 'data:text/csv;charset=utf-8,\uFEFF'; // include BOM for Excel support
  csvContent += headers.map(h => `"${h.replace(/"/g, '""')}"`).join(',') + '\n';
  rows.forEach(r => {
    csvContent += r.map(val => `"${String(val).replace(/"/g, '""')}"`).join(',') + '\n';
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `twinanalytic_leads_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Reset localStorage logs
function clearLeadsDatabase() {
  const leads = JSON.parse(localStorage.getItem('tools_leads') || '[]');
  if (leads.length === 0) {
    alert('Database is already empty.');
    return;
  }

  if (confirm('Are you sure you want to delete all collected lead data? This cannot be undone.')) {
    localStorage.removeItem('tools_leads');
    localStorage.removeItem('tools_user_unlocked');
    updateLeadsCount();
    alert('Lead database successfully cleared.');
  }
}

// ==========================================
// 3. BEAM DESIGN LOGIC
// ==========================================
function calculateBeam() {
  const b = parseFloat(document.getElementById('beam-w').value);
  const D = parseFloat(document.getElementById('beam-d').value);
  const Mu = parseFloat(document.getElementById('beam-moment').value);
  const cover = parseFloat(document.getElementById('beam-cover').value);
  const fck = parseFloat(document.getElementById('beam-concrete').value);
  const fy = parseFloat(document.getElementById('beam-steel').value);

  // Outputs elements
  const outDepth = document.getElementById('beam-out-depth');
  const outMulim = document.getElementById('beam-out-mulim');
  const outAst = document.getElementById('beam-out-ast');
  const outBars = document.getElementById('beam-out-bars');
  const outAstmin = document.getElementById('beam-out-astmin');
  const outRatio = document.getElementById('beam-out-ratio');
  const badge = document.getElementById('beam-status-badge');

  // Math
  const d = D - cover - 12; // assuming 16mm rebar core + 8mm links
  outDepth.textContent = `${Math.round(d)} mm`;

  // Limiting neutral axis depth ratio
  const xuMax_d = fy === 500 ? 0.46 : 0.48;
  // Limiting moment factor
  const RuLim = 0.36 * (fck / 1.5) * xuMax_d * (1 - 0.42 * xuMax_d);
  const MuLim = RuLim * b * d * d * 1e-6; // kNm
  outMulim.textContent = `${MuLim.toFixed(1)} kNm`;

  let ast = 0;
  let status = 'PASS';
  let barsText = '';
  let astMin = (0.85 * b * d) / fy;
  outAstmin.textContent = `${Math.round(astMin)} mm²`;

  if (Mu > MuLim) {
    status = 'FAIL';
    ast = 0;
    barsText = 'Section Over-reinforced (Increase size)';
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'RESIZE';
  } else {
    // Singly reinforced design formula
    ast = (0.5 * fck * b * d / fy) * (1 - Math.sqrt(1 - (4.6 * Mu * 1e6) / (fck * b * d * d)));
    if (ast < astMin) ast = astMin;
    
    // Choose rebars (16mm default)
    const singleBarArea = Math.PI * 16 * 16 / 4;
    const numBars = Math.max(2, Math.ceil(ast / singleBarArea));
    barsText = `${numBars} Nos - 16mm dia`;
    badge.className = 'tool-status-badge pass';
    badge.textContent = 'PASS';
  }

  outAst.textContent = `${Math.round(ast)} mm²`;
  outBars.textContent = barsText;
  const ratio = (ast / (b * d)) * 100;
  outRatio.textContent = status === 'FAIL' ? 'N/A' : `${ratio.toFixed(2)}%`;

  // Draw on Canvas
  drawBeamCanvas(b, D, cover, status === 'FAIL' ? 0 : Math.round(ast / (Math.PI * 16 * 16 / 4)));
}

function drawBeamCanvas(w, h, cov, numBars) {
  const canvas = document.getElementById('beam-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Set scale
  const padding = 20;
  const scale = Math.min((canvas.width - padding * 2) / w, (canvas.height - padding * 2) / h);
  
  // Center drawing
  const drawW = w * scale;
  const drawH = h * scale;
  const startX = (canvas.width - drawW) / 2;
  const startY = (canvas.height - drawH) / 2;

  // Background
  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw Beam Outer Box (Steel Blue)
  ctx.strokeStyle = '#2a6496';
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, drawW, drawH);

  // Draw Link/Stirrup (Inner Ring)
  const covScale = cov * scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(startX + covScale, startY + covScale, drawW - covScale * 2, drawH - covScale * 2);

  // Draw Top Hanger Bars (2 Nos - green/blue)
  ctx.fillStyle = '#4f86c6';
  const barR = Math.max(4, 6 * scale);
  // Top Left
  ctx.beginPath();
  ctx.arc(startX + covScale + barR, startY + covScale + barR, barR, 0, Math.PI * 2);
  ctx.fill();
  // Top Right
  ctx.beginPath();
  ctx.arc(startX + drawW - covScale - barR, startY + covScale + barR, barR, 0, Math.PI * 2);
  ctx.fill();

  // Draw Bottom Tension Bars (Gold)
  ctx.fillStyle = '#C9A84C';
  const bottomY = startY + drawH - covScale - barR;
  const usableW = drawW - covScale * 2 - barR * 2;
  
  if (numBars > 0) {
    const spacing = numBars > 1 ? usableW / (numBars - 1) : 0;
    for (let i = 0; i < numBars; i++) {
      const barX = startX + covScale + barR + (i * spacing);
      ctx.beginPath();
      ctx.arc(barX, bottomY, barR * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Label Texts
  ctx.fillStyle = '#9AA0A6';
  ctx.font = '10px JetBrains Mono';
  ctx.fillText(`b = ${w}mm`, startX + drawW/2 - 20, startY - 6);
  
  // Vertical depth line
  ctx.fillText(`D = ${h}mm`, startX - 55, startY + drawH/2);
}


// ==========================================
function calculateColumn() {
  const pdl = parseFloat(document.getElementById('column-pdl').value);
  const pll = parseFloat(document.getElementById('column-pll').value);
  const fc = parseFloat(document.getElementById('column-fc').value);
  const fy = parseFloat(document.getElementById('column-fy').value);
  const phi = parseFloat(document.getElementById('column-phi').value);
  const p = parseFloat(document.getElementById('column-p').value);
  const colHeight = parseFloat(document.getElementById('column-height').value);

  const outPu = document.getElementById('column-out-pu');
  const outAg = document.getElementById('column-out-ag');
  const outDim = document.getElementById('column-out-dim');
  const outFinalArea = document.getElementById('column-out-final-area');
  const outAst = document.getElementById('column-out-ast');
  const outTieSpacing = document.getElementById('column-out-tie-spacing');
  const outHookExt = document.getElementById('column-out-hook-extension');
  const outPnMax = document.getElementById('column-out-pn-max');
  const outPhiPn = document.getElementById('column-out-phi-pn');
  const outDcRatio = document.getElementById('column-out-dc-ratio');
  const outConcreteVol = document.getElementById('column-out-concrete-vol');
  const outSteelWeight = document.getElementById('column-out-steel-weight');
  const badge = document.getElementById('column-status-badge');
  const errDiv = document.getElementById('column-validation-error');

  // Input Validation
  if (isNaN(pdl) || pdl <= 0 || isNaN(pll) || pll <= 0 || isNaN(fc) || fc <= 0 || isNaN(fy) || fy <= 0 || isNaN(phi) || phi <= 0 || phi > 1.0 || isNaN(p) || p < 0.01 || p > 0.08 || isNaN(colHeight) || colHeight <= 0) {
    if (errDiv) errDiv.classList.remove('hidden');
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'FAIL';
    
    outPu.textContent = 'N/A';
    outAg.textContent = 'N/A';
    outDim.textContent = 'N/A';
    outFinalArea.textContent = 'N/A';
    outAst.textContent = 'N/A';
    if (outTieSpacing) outTieSpacing.textContent = 'N/A';
    if (outHookExt) outHookExt.textContent = 'N/A';
    if (outPnMax) outPnMax.textContent = 'N/A';
    if (outPhiPn) outPhiPn.textContent = 'N/A';
    if (outDcRatio) outDcRatio.textContent = 'N/A';
    if (outConcreteVol) outConcreteVol.textContent = 'N/A';
    if (outSteelWeight) outSteelWeight.textContent = 'N/A';
    
    const warningRow = document.getElementById('column-row-warning');
    if (warningRow) warningRow.style.display = 'none';

    drawColumnCanvas(0, 0, 0);
    return;
  }

  if (errDiv) errDiv.classList.add('hidden');

  // Calculations
  // 1. Pu = (1.2 * PDL) + (1.6 * PLL)
  const Pu = (1.2 * pdl) + (1.6 * pll);

  // 2. Ag = Pu / (Phi * 0.80 * (0.85 * f'c * (1 - p) + fy * p))
  const denominator = phi * 0.80 * (0.85 * fc * (1 - p) + fy * p);
  const Ag = Pu / denominator;

  // 3. Dim = Math.ceil(Math.sqrt(Ag))
  const Dim = Math.ceil(Math.sqrt(Ag));

  // 4. ColumnArea = Dim * Dim
  const ColumnArea = Dim * Dim;

  // 5. Ast = ((Pu / (Phi * 0.80)) - (0.85 * f'c * ColumnArea)) / (fy - (0.85 * f'c))
  const Ast = ((Pu / (phi * 0.80)) - (0.85 * fc * ColumnArea)) / (fy - (0.85 * fc));

  // Reinforcement Detaining Spacing Logic
  const mainBarSize = document.getElementById('column-main-bar').value;
  const tieBarSize = document.getElementById('column-tie-bar').value;

  let mainBarDia = 1.0; // #8
  if (mainBarSize === '#7') mainBarDia = 0.875;
  else if (mainBarSize === '#8') mainBarDia = 1.000;
  else if (mainBarSize === '#9') mainBarDia = 1.128;

  let tieBarDia = 0.375; // #3
  if (tieBarSize === '#3') tieBarDia = 0.375;
  else if (tieBarSize === '#4') tieBarDia = 0.500;

  const clearCover = 1.5;

  const maxTieSpacing = Math.min(16 * mainBarDia, 48 * tieBarDia, Dim);
  const clearSpacing = (Dim - (2 * clearCover) - (2 * tieBarDia) - (3 * mainBarDia)) / 2;
  const hookExtension = Math.max(3.0, 6 * tieBarDia);

  // Strength Capacity Calculations
  // Pn_max = 0.80 * [0.85 * f'c * (Ag - Ast) + fy * Ast]
  const PnMax = 0.80 * (0.85 * fc * (ColumnArea - Ast) + fy * Ast);
  const PhiPn = 0.65 * PnMax;
  const dcRatio = Pu / PhiPn;

  // Materials Takeoff Estimates
  const concreteVol = ((ColumnArea / 144) * colHeight) * 0.02831685; // cubic feet to cubic meters
  const steelWeight = ((Ast * 3.4) * colHeight) * 0.45359237; // lbs to kg

  // Clear spacing checks: strictly greater than minAllowedSpacing
  const minAllowedSpacing = Math.max(1.5, 1.5 * mainBarDia);
  const isSpacingOk = clearSpacing > minAllowedSpacing;
  
  const warningRow = document.getElementById('column-row-warning');
  const warningText = document.getElementById('column-out-warning-text');

  if (dcRatio > 1.0) {
    if (warningRow && warningText) {
      warningRow.style.display = 'flex';
      warningText.textContent = `FAIL: Column is overstressed! (D/C Ratio of ${dcRatio.toFixed(2)} > 1.00)`;
    }
  } else if (!isSpacingOk) {
    if (warningRow && warningText) {
      warningRow.style.display = 'flex';
      warningText.textContent = "WARNING: Clear spacing too narrow for aggregate flow.";
    }
  } else {
    if (warningRow) {
      warningRow.style.display = 'none';
    }
  }

  // Format outputs
  outPu.textContent = `${Pu.toFixed(1)} k`;
  outAg.textContent = `${Ag.toFixed(2)} in²`;
  outDim.textContent = `${Dim} in`;
  outFinalArea.textContent = `${ColumnArea} in²`;
  outAst.textContent = `${Ast.toFixed(2)} in²`;
  if (outTieSpacing) outTieSpacing.textContent = `${maxTieSpacing.toFixed(2)} in`;
  if (outHookExt) outHookExt.textContent = `${hookExtension.toFixed(2)} in`;
  if (outPnMax) outPnMax.textContent = `${PnMax.toFixed(1)} k`;
  if (outPhiPn) outPhiPn.textContent = `${PhiPn.toFixed(1)} k`;
  if (outDcRatio) outDcRatio.textContent = `${dcRatio.toFixed(2)}`;
  if (outConcreteVol) outConcreteVol.textContent = `${concreteVol.toFixed(2)} m³`;
  if (outSteelWeight) outSteelWeight.textContent = `${steelWeight.toFixed(1)} kg`;

  if (dcRatio <= 1.0) {
    badge.className = 'tool-status-badge pass';
    badge.textContent = 'PASS';
  } else {
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'FAIL';
  }

  // Draw the Column Cross Section Schematic on the Canvas
  drawColumnCanvas(Dim, Dim, p);
}

function drawColumnCanvas(w, h, p) {
  const canvas = document.getElementById('column-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (w <= 0 || h <= 0) {
    ctx.fillStyle = '#0D1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9AA0A6';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('No geometry available', canvas.width/2 - 60, canvas.height/2);
    return;
  }

  const padding = 25;
  const scale = Math.min((canvas.width - padding * 2) / w, (canvas.height - padding * 2) / h);
  
  const drawW = w * scale;
  const drawH = h * scale;
  const startX = (canvas.width - drawW) / 2;
  const startY = (canvas.height - drawH) / 2;

  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Column Concrete Boundary (Steel blue)
  ctx.strokeStyle = '#2a6496';
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, drawW, drawH);

  // Stirrup Link (1.5 inches clear cover standard)
  const cover = 1.5;
  const covScale = cover * scale;
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(startX + covScale, startY + covScale, drawW - covScale * 2, drawH - covScale * 2);

  // Longitudinal Rebars (Gold circles)
  ctx.fillStyle = '#C9A84C';
  
  // Decide number of bars based on steel ratio p
  let numBars = 4;
  if (p > 0.05) {
    numBars = 12;
  } else if (p > 0.02) {
    numBars = 8;
  }

  const barR = Math.max(4, 5 * scale);
  const linkL = startX + covScale + barR;
  const linkR = startX + drawW - covScale - barR;
  const linkT = startY + covScale + barR;
  const linkB = startY + drawH - covScale - barR;

  // Corner Bars
  ctx.beginPath(); ctx.arc(linkL, linkT, barR, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(linkR, linkT, barR, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(linkL, linkB, barR, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(linkR, linkB, barR, 0, Math.PI*2); ctx.fill();

  if (numBars >= 8) {
    // Add middle bars on left & right
    const midY = (linkT + linkB) / 2;
    ctx.beginPath(); ctx.arc(linkL, midY, barR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(linkR, midY, barR, 0, Math.PI*2); ctx.fill();

    // Add middle bars on top & bottom
    const midX = (linkL + linkR) / 2;
    ctx.beginPath(); ctx.arc(midX, linkT, barR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(midX, linkB, barR, 0, Math.PI*2); ctx.fill();
  }

  if (numBars >= 12) {
    // Add two more intermediate bars on each face
    const stepY = (linkB - linkT) / 3;
    const stepX = (linkR - linkL) / 3;

    ctx.beginPath(); ctx.arc(linkL, linkT + stepY, barR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(linkL, linkT + 2 * stepY, barR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(linkR, linkT + stepY, barR, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(linkR, linkT + 2 * stepY, barR, 0, Math.PI*2); ctx.fill();
  }

  // Label Texts
  ctx.fillStyle = '#9AA0A6';
  ctx.font = '10px JetBrains Mono';
  ctx.fillText(`${w}" x ${h}"`, startX + drawW/2 - 25, startY - 8);
}


// ==========================================
// 5. SLAB DESIGN LOGIC
// ==========================================
function calculateSlab() {
  const l1 = parseFloat(document.getElementById('slab-l1').value);
  const l2 = parseFloat(document.getElementById('slab-l2').value);
  const c1 = parseFloat(document.getElementById('slab-c1').value);
  const c2 = parseFloat(document.getElementById('slab-c2').value);
  const h = parseFloat(document.getElementById('slab-h').value);
  const sdl = parseFloat(document.getElementById('slab-sdl').value);
  const ll = parseFloat(document.getElementById('slab-ll').value);
  const fc = parseFloat(document.getElementById('slab-fc').value);
  const fy = parseFloat(document.getElementById('slab-fy').value);

  const outWu = document.getElementById('slab-out-wu');
  const outLn = document.getElementById('slab-out-ln');
  const outMo = document.getElementById('slab-out-mo');
  const outColNeg = document.getElementById('slab-out-col-neg');
  const outColPos = document.getElementById('slab-out-col-pos');
  const outMidNeg = document.getElementById('slab-out-mid-neg');
  const outMidPos = document.getElementById('slab-out-mid-pos');
  const outConcreteVol = document.getElementById('slab-out-concrete-vol');
  const outSteelWeight = document.getElementById('slab-out-steel-weight');
  const badge = document.getElementById('slab-status-badge');
  const warningRow = document.getElementById('slab-row-warning');
  const warningText = document.getElementById('slab-out-warning-text');

  // Basic validation
  if (isNaN(l1) || l1 <= 0 || isNaN(l2) || l2 <= 0 || isNaN(c1) || c1 <= 0 || isNaN(c2) || c2 <= 0 || isNaN(h) || h <= 0 || isNaN(sdl) || sdl < 0 || isNaN(ll) || ll < 0 || isNaN(fc) || fc <= 0 || isNaN(fy) || fy <= 0) {
    if (warningRow && warningText) {
      warningRow.style.display = 'flex';
      warningText.textContent = "Please fill in all inputs with valid positive numbers.";
    }
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'FAIL';
    
    outWu.textContent = 'N/A';
    outLn.textContent = 'N/A';
    outMo.textContent = 'N/A';
    outColNeg.textContent = 'N/A';
    outColPos.textContent = 'N/A';
    outMidNeg.textContent = 'N/A';
    outMidPos.textContent = 'N/A';
    outConcreteVol.textContent = 'N/A';
    outSteelWeight.textContent = 'N/A';
    
    drawSlabCanvas(0, 0, 0, 0, 0);
    return;
  }

  // Calculate wu in ksf
  const wSelf = (h / 12) * 150; // psf
  const wuPsf = (1.2 * (sdl + wSelf)) + (1.6 * ll); // psf
  const wu = wuPsf / 1000; // ksf
  outWu.textContent = `${wu.toFixed(3)} ksf (${wuPsf.toFixed(1)} psf)`;

  // Clear span ln
  const ln = l1 - (c1 / 12); // ft
  outLn.textContent = `${ln.toFixed(2)} ft`;

  // Guardrail check
  const clearSpanLimit = 0.65 * l1;
  const isSpanOk = ln >= clearSpanLimit;

  if (!isSpanOk) {
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'RESIZE';
    if (warningRow && warningText) {
      warningRow.style.display = 'flex';
      warningText.textContent = "DDM geometry exception: clear span too short.";
    }
  } else {
    badge.className = 'tool-status-badge pass';
    badge.textContent = 'PASS';
    if (warningRow) warningRow.style.display = 'none';
  }

  // Mo
  const Mo = (wu * l2 * Math.pow(ln, 2)) / 8; // kip-ft
  outMo.textContent = `${Mo.toFixed(2)} kip-ft`;

  // Distribute Mo for an Interior Span
  const MuNeg = 0.65 * Mo;
  const MuPos = 0.35 * Mo;

  // Sub-allocate into Column Strip and Middle Strip
  const colNeg = 0.75 * MuNeg;
  const midNeg = 0.25 * MuNeg;
  const colPos = 0.60 * MuPos;
  const midPos = 0.40 * MuPos;

  outColNeg.textContent = `${colNeg.toFixed(2)} kip-ft`;
  outColPos.textContent = `${colPos.toFixed(2)} kip-ft`;
  outMidNeg.textContent = `${midNeg.toFixed(2)} kip-ft`;
  outMidPos.textContent = `${midPos.toFixed(2)} kip-ft`;

  // Materials takeoff
  const concreteVol = ((h / 12) * l1 * l2) * 0.02831685; // cubic meters
  const steelWeight = (2 * 0.0018 * 12 * l1 * l2 * h * 3.4) * 0.45359237; // kg

  outConcreteVol.textContent = `${concreteVol.toFixed(2)} m³`;
  outSteelWeight.textContent = `${steelWeight.toFixed(1)} kg`;

  // Draw schematic
  drawSlabCanvas(l1, l2, c1, ln, Mo);
}

function drawSlabCanvas(l1, l2, c1, ln, Mo) {
  const canvas = document.getElementById('slab-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (l1 <= 0 || ln <= 0) {
    ctx.fillStyle = '#9AA0A6';
    ctx.font = '10px JetBrains Mono';
    ctx.fillText('No geometry available', canvas.width/2 - 60, canvas.height/2);
    return;
  }

  // Draw support columns on both ends
  const padding = 40;
  const w = canvas.width - padding * 2;
  const scaleX = w / l1; // pixels per foot
  
  const colW = (c1 / 12) * scaleX;
  const clearW = ln * scaleX;
  
  const startX = padding;
  const endX = canvas.width - padding;
  const midX = canvas.width / 2;
  
  const slabY = 50;
  const slabH = 15;

  // Draw Slab horizontal line
  ctx.fillStyle = '#1f3d52';
  ctx.fillRect(startX, slabY, w, slabH);
  ctx.strokeStyle = '#2a6496';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(startX, slabY, w, slabH);

  // Draw Column supports (Gray blocks)
  ctx.fillStyle = '#2d3748';
  ctx.strokeStyle = '#4a5568';
  ctx.lineWidth = 1;
  // Left Column
  ctx.fillRect(startX, slabY + slabH, colW, 40);
  ctx.strokeRect(startX, slabY + slabH, colW, 40);
  // Right Column
  ctx.fillRect(endX - colW, slabY + slabH, colW, 40);
  ctx.strokeRect(endX - colW, slabY + slabH, colW, 40);

  // Moment baseline
  const baseLineY = 130;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(startX, baseLineY);
  ctx.lineTo(endX, baseLineY);
  ctx.stroke();

  // Draw Moment Curve: parabolic curve
  const maxH = 45; // max height for positive moment
  ctx.strokeStyle = '#C9A84C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  
  const centerLeftX = startX + colW/2;
  const centerRightX = endX - colW/2;
  const spanW = centerRightX - centerLeftX;
  
  for (let px = centerLeftX; px <= centerRightX; px++) {
    const x = (px - centerLeftX) / spanW; // 0 to 1
    const val = 4 * x * (1 - x) - 0.65;
    const y = baseLineY + (val * -maxH);
    if (px === centerLeftX) {
      ctx.moveTo(px, y);
    } else {
      ctx.lineTo(px, y);
    }
  }
  ctx.stroke();

  // Draw labels
  ctx.fillStyle = '#9AA0A6';
  ctx.font = '9px JetBrains Mono';
  
  // Span dimension line
  ctx.strokeStyle = '#4a5568';
  ctx.beginPath();
  ctx.moveTo(centerLeftX, slabY - 12);
  ctx.lineTo(centerRightX, slabY - 12);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(centerLeftX, slabY - 16); ctx.lineTo(centerLeftX, slabY - 8);
  ctx.moveTo(centerRightX, slabY - 16); ctx.lineTo(centerRightX, slabY - 8);
  ctx.stroke();
  
  ctx.fillStyle = '#C9A84C';
  ctx.fillText(`l1 = ${l1} ft (ln = ${ln.toFixed(1)} ft)`, midX - 60, slabY - 18);

  // Moment values labels
  ctx.fillStyle = '#E2E8F0';
  ctx.fillText(`Mu,neg = ${(0.65*Mo).toFixed(1)} k-ft`, centerLeftX - 10, baseLineY - maxH * 0.7 - 8);
  ctx.fillText(`Mu,pos = ${(0.35*Mo).toFixed(1)} k-ft`, midX - 40, baseLineY + maxH * 0.4 + 12);
}

function downloadSlabPDF() {
  const l1 = parseFloat(document.getElementById('slab-l1').value);
  const l2 = parseFloat(document.getElementById('slab-l2').value);
  const c1 = parseFloat(document.getElementById('slab-c1').value);
  const c2 = parseFloat(document.getElementById('slab-c2').value);
  const h = parseFloat(document.getElementById('slab-h').value);
  const sdl = parseFloat(document.getElementById('slab-sdl').value);
  const ll = parseFloat(document.getElementById('slab-ll').value);
  const fc = parseFloat(document.getElementById('slab-fc').value);
  const fy = parseFloat(document.getElementById('slab-fy').value);

  const projName = document.getElementById('slab-proj-name').value || "TwinAnalytic Tower";
  const slabId = document.getElementById('slab-id').value || "S101";
  const designer = document.getElementById('slab-designer').value || "AH";

  if (isNaN(l1) || l1 <= 0 || isNaN(l2) || l2 <= 0 || isNaN(c1) || c1 <= 0 || isNaN(c2) || c2 <= 0 || isNaN(h) || h <= 0 || isNaN(sdl) || sdl < 0 || isNaN(ll) || ll < 0 || isNaN(fc) || fc <= 0 || isNaN(fy) || fy <= 0) {
    alert('Please enter valid input parameters before downloading the PDF report.');
    return;
  }

  const isUnlocked = localStorage.getItem('tools_user_unlocked');
  if (isUnlocked !== 'true') {
    openAuthModal(downloadSlabPDF, 'Slab PDF Export');
    return;
  }

  calculateSlab();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  const wSelf = (h / 12) * 150; // psf
  const wuPsf = (1.2 * (sdl + wSelf)) + (1.6 * ll);
  const wu = wuPsf / 1000; // ksf
  const ln = l1 - (c1 / 12); // ft
  const Mo = (wu * l2 * Math.pow(ln, 2)) / 8; // kip-ft

  const MuNeg = 0.65 * Mo;
  const MuPos = 0.35 * Mo;

  const colNeg = 0.75 * MuNeg;
  const midNeg = 0.25 * MuNeg;
  const colPos = 0.60 * MuPos;
  const midPos = 0.40 * MuPos;

  const isSpanOk = ln >= 0.65 * l1;
  const statusText = isSpanOk ? "PASS" : "FAIL (Clear Span too short)";

  const concreteVol = ((h / 12) * l1 * l2) * 0.02831685;
  const steelWeight = (2 * 0.0018 * 12 * l1 * l2 * h * 3.4) * 0.45359237;

  // Header Table / Title Block
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.015);
  doc.rect(0.25, 0.25, 8.0, 1.3, 'S');

  doc.line(2.3, 0.25, 2.3, 1.55);
  doc.line(5.6, 0.25, 5.6, 1.55);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.text('TwinAnalytic', 0.4, 0.65);
  
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('STRUCTURAL MEMBER DESIGN SHEET', 0.4, 0.88);
  doc.text('ACI 318-19 COMPLIANCE AUDIT', 0.4, 1.08);
  doc.text('Calculations Sheet S-102', 0.4, 1.28);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PROJECT:', 2.5, 0.5);
  doc.setFont('helvetica', 'normal');
  const splitProjName = doc.splitTextToSize(projName, 2.0);
  doc.text(splitProjName, 3.4, 0.5);
  
  doc.setFont('helvetica', 'bold');
  doc.text('SLAB ID:', 2.5, 0.95);
  doc.setFont('helvetica', 'normal');
  doc.text(slabId, 3.4, 0.95);

  doc.setFont('helvetica', 'bold');
  doc.text('METHOD:', 2.5, 1.35);
  doc.setFont('helvetica', 'normal');
  doc.text('ACI Direct Design Method (DDM)', 3.4, 1.35);

  doc.line(5.6, 0.68, 8.25, 0.68);
  doc.line(5.6, 1.11, 8.25, 1.11);

  doc.setFont('helvetica', 'bold');
  doc.text('DESIGNED BY:', 5.75, 0.52);
  doc.setFont('helvetica', 'normal');
  doc.text(designer, 7.0, 0.52);

  doc.setFont('helvetica', 'bold');
  doc.text('CHECKED BY:', 5.75, 0.95);
  doc.setFont('helvetica', 'normal');
  doc.text('MB', 7.0, 0.95);

  doc.setFont('helvetica', 'bold');
  doc.text('DATE:', 5.75, 1.38);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(), 6.3, 1.38);

  // Outer gold page border
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.015);
  doc.rect(0.25, 0.25, 8.0, 10.5);

  let lx = 0.5;
  let ly = 1.9;

  // Section 1: Inputs Summary
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('1. INPUT DESIGN PARAMETERS', lx, ly);
  doc.line(lx, ly + 0.05, 4.1, ly + 0.05);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  const inputs = [
    ['Long Span (l1)', `${l1} ft`],
    ['Transverse Span (l2)', `${l2} ft`],
    ['Column Dimensions (c1 x c2)', `${c1}" x ${c2}"`],
    ['Slab Thickness (h)', `${h} in`],
    ['Superimposed Dead Load (SDL)', `${sdl} psf`],
    ['Live Load (LL)', `${ll} psf`],
    ['Concrete Strength (f\'c)', `${fc} ksi`],
    ['Steel Strength (fy)', `${fy} ksi`]
  ];

  ly += 0.22;
  inputs.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, lx, ly);
    doc.setFont('helvetica', 'normal');
    doc.text(val, lx + 2.2, ly);
    ly += 0.18;
  });

  // Section 2: DDM Calculations
  ly += 0.15;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('2. ACI 318 DIRECT DESIGN METHOD LOGIC', lx, ly);
  doc.line(lx, ly + 0.05, 4.1, ly + 0.05);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  ly += 0.22;
  doc.setFont('helvetica', 'bold');
  doc.text('Factored Load (wu):', lx, ly);
  doc.setFont('helvetica', 'normal');
  doc.text(`${wu.toFixed(3)} ksf (${wuPsf.toFixed(1)} psf)`, lx + 1.8, ly);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Formula: wu = 1.2 * (SDL + h/12 * 150) + 1.6 * LL`, lx, ly + 0.12);

  ly += 0.28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Clear Span (ln):', lx, ly);
  doc.setFont('helvetica', 'normal');
  doc.text(`${ln.toFixed(2)} ft`, lx + 1.8, ly);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Formula: ln = l1 - c1/12 (ACI 8.10.3.2)`, lx, ly + 0.12);

  ly += 0.28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Clear Span Check:', lx, ly);
  if (isSpanOk) {
    doc.setTextColor(30, 150, 30);
    doc.text('PASS', lx + 1.8, ly);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('FAIL (Guardrail Violation)', lx + 1.8, ly);
  }
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Requirement: ln >= 0.65 * l1`, lx, ly + 0.12);

  ly += 0.28;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('Total Static Moment (Mo):', lx, ly);
  doc.setFont('helvetica', 'normal');
  doc.text(`${Mo.toFixed(2)} kip-ft`, lx + 1.8, ly);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.text(`Formula: Mo = wu * l2 * (ln^2) / 8`, lx, ly + 0.12);

  // Section 3: Moment Distribution Table
  ly += 0.32;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('3. INTERIOR SPAN MOMENT DISTRIBUTION', lx, ly);
  doc.line(lx, ly + 0.05, 4.1, ly + 0.05);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  const momentsList = [
    ['Total Negative Moment (Mu_neg)', '0.65 * Mo', `${MuNeg.toFixed(2)} kip-ft`],
    ['Total Positive Moment (Mu_pos)', '0.35 * Mo', `${MuPos.toFixed(2)} kip-ft`],
    ['Column Strip Negative', '0.75 * Mu_neg', `${colNeg.toFixed(2)} kip-ft`],
    ['Middle Strip Negative', '0.25 * Mu_neg', `${midNeg.toFixed(2)} kip-ft`],
    ['Column Strip Positive', '0.60 * Mu_pos', `${colPos.toFixed(2)} kip-ft`],
    ['Middle Strip Positive', '0.40 * Mu_pos', `${midPos.toFixed(2)} kip-ft`]
  ];

  ly += 0.22;
  momentsList.forEach(([label, coeff, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, lx, ly);
    doc.setFont('helvetica', 'normal');
    doc.text(coeff, lx + 2.2, ly);
    doc.text(val, lx + 3.1, ly);
    ly += 0.18;
  });

  // Right column: Visual Moment Diagram + Bending Steel table
  let rx = 4.4;
  let ry = 1.9;

  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('4. DIRECT DESIGN MOMENT SCHEMATIC', rx, ry);
  doc.line(rx, ry + 0.05, 8.0, ry + 0.05);

  ry += 0.15;
  const schematicW = 3.6;
  const schematicH = 1.8;
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.008);
  doc.rect(rx, ry, schematicW, schematicH);

  const pdfCurveY = ry + 1.1;
  doc.setDrawColor(180, 180, 180);
  doc.line(rx + 0.2, pdfCurveY, rx + schematicW - 0.2, pdfCurveY);

  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.015);
  doc.beginPath();
  const pdfLeftX = rx + 0.5;
  const pdfRightX = rx + schematicW - 0.5;
  const pdfSpanW = pdfRightX - pdfLeftX;
  for (let px = pdfLeftX; px <= pdfRightX; px++) {
    const x = (px - pdfLeftX) / pdfSpanW;
    const val = 4 * x * (1 - x) - 0.65;
    const y = pdfCurveY - (val * 0.6);
    if (px === pdfLeftX) doc.moveTo(px, y);
    else doc.lineTo(px, y);
  }
  doc.stroke();

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text(`Mu,neg = ${MuNeg.toFixed(1)} k-ft`, pdfLeftX - 0.2, pdfCurveY - 0.45);
  doc.text(`Mu,pos = ${MuPos.toFixed(1)} k-ft`, rx + schematicW/2 - 0.35, pdfCurveY + 0.45);
  doc.text(`Clear Span ln = ${ln.toFixed(1)} ft`, rx + schematicW/2 - 0.45, ry + 0.2);

  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.02);
  doc.line(pdfLeftX, ry + 0.3, pdfLeftX, ry + 0.5);
  doc.line(pdfRightX, ry + 0.3, pdfRightX, ry + 0.5);

  ry += schematicH + 0.25;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('5. REINFORCEMENT BENDING STEEL DESIGN', rx, ry);
  doc.line(rx, ry + 0.05, 8.0, ry + 0.05);

  const bColFt = Math.min(0.5 * l1, 0.5 * l2);
  const bMidFt = l2 - bColFt;
  const bColIn = bColFt * 12;
  const bMidIn = bMidFt * 12;

  const d = h - 1.0;
  const Ab = 0.20;

  const designStripSteel = (MuVal, bIn) => {
    if (MuVal <= 0) return { req: 0, min: 0, gov: 0, spacing: 'N/A' };
    const Rn = (MuVal * 12) / (0.9 * bIn * Math.pow(d, 2));
    const minSteel = 0.0018 * bIn * h;
    if (Rn >= 0.85 * fc / 2) {
      return { req: 999, min: minSteel, gov: 999, spacing: 'RESIZE' };
    }
    const rho = (0.85 * fc / fy) * (1 - Math.sqrt(1 - (2 * Rn) / (0.85 * fc)));
    const reqSteel = rho * bIn * d;
    const govSteel = Math.max(reqSteel, minSteel);
    
    let s = (Ab * bIn) / govSteel;
    const sMax = Math.min(3 * h, 18);
    s = Math.floor(s * 2) / 2;
    s = Math.min(s, sMax);
    const spacingText = `#4 @ ${s.toFixed(1)}" c/c`;
    return { req: reqSteel, min: minSteel, gov: govSteel, spacing: spacingText };
  };

  const colNegSteel = designStripSteel(colNeg, bColIn);
  const colPosSteel = designStripSteel(colPos, bColIn);
  const midNegSteel = designStripSteel(midNeg, bMidIn);
  const midPosSteel = designStripSteel(midPos, bMidIn);

  ry += 0.25;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Strip & Moment', rx, ry);
  doc.text('Width', rx + 1.2, ry);
  doc.text('As,req', rx + 1.8, ry);
  doc.text('As,min', rx + 2.3, ry);
  doc.text('Spacing (#4)', rx + 2.8, ry);
  doc.line(rx, ry + 0.04, rx + 3.6, ry + 0.04);

  const tableRows = [
    ['Col Strip Neg', `${bColIn.toFixed(0)}"`, `${colNegSteel.req.toFixed(2)}`, `${colNegSteel.min.toFixed(2)}`, colNegSteel.spacing],
    ['Col Strip Pos', `${bColIn.toFixed(0)}"`, `${colPosSteel.req.toFixed(2)}`, `${colPosSteel.min.toFixed(2)}`, colPosSteel.spacing],
    ['Mid Strip Neg', `${bMidIn.toFixed(0)}"`, `${midNegSteel.req.toFixed(2)}`, `${midNegSteel.min.toFixed(2)}`, midNegSteel.spacing],
    ['Mid Strip Pos', `${bMidIn.toFixed(0)}"`, `${midPosSteel.req.toFixed(2)}`, `${midPosSteel.min.toFixed(2)}`, midPosSteel.spacing]
  ];

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  tableRows.forEach(([name, width, req, min, spacing]) => {
    ry += 0.18;
    doc.setFont('helvetica', 'bold');
    doc.text(name, rx, ry);
    doc.setFont('helvetica', 'normal');
    doc.text(width, rx + 1.2, ry);
    doc.text(req, rx + 1.8, ry);
    doc.text(min, rx + 2.3, ry);
    doc.setTextColor(201, 168, 76);
    doc.setFont('helvetica', 'bold');
    doc.text(spacing, rx + 2.8, ry);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
  });

  // Section 6: Takeoff Estimates
  ry += 0.35;
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('6. MATERIAL TAKEOFF ESTIMATE', rx, ry);
  doc.line(rx, ry + 0.05, 8.0, ry + 0.05);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  ry += 0.22;
  doc.text('Concrete Volume:', rx, ry);
  doc.setFont('helvetica', 'normal');
  doc.text(`${concreteVol.toFixed(2)} cu. m. (m³)`, rx + 1.6, ry);

  ry += 0.18;
  doc.setFont('helvetica', 'bold');
  doc.text('Steel Weight:', rx, ry);
  doc.setFont('helvetica', 'normal');
  doc.text(`${steelWeight.toFixed(1)} kg`, rx + 1.6, ry);

  ry += 0.18;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text(`* Estimate covers temperature/shrinkage steel in both directions.`, rx, ry);

  let footerY = 10.45;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('TwinAnalytic Engineering Group — Calculations Sheet S-102', 0.5, footerY);
  doc.text('Page 1 of 1', 7.2, footerY);

  doc.save(`twinanalytic_slab_report_${new Date().toISOString().split('T')[0]}.pdf`);
}


// ==========================================
// 6. PILE CAP DESIGN LOGIC
// ==========================================
function calculatePileCap() {
  const dia = parseFloat(document.getElementById('pile-dia').value);
  const count = parseInt(document.getElementById('pile-count').value, 10);
  const load = parseFloat(document.getElementById('pile-load').value);
  const depth = document.getElementById('pile-depth').value;
  const fck = parseFloat(document.getElementById('pile-concrete').value);

  const outTension = document.getElementById('pile-out-tension');
  const outAst = document.getElementById('pile-out-ast');
  const outBars = document.getElementById('pile-out-bars');
  const outPileLoad = document.getElementById('pile-out-pileload');
  const outShear = document.getElementById('pile-out-shear');
  const outShearCheck = document.getElementById('pile-out-shearcheck');
  const badge = document.getElementById('pile-cap-status-badge');

  // Load per pile (with self weight 1.05 factor)
  const pileLoad = (load * 1.05) / count;
  outPileLoad.textContent = `${pileLoad.toFixed(1)} kN`;

  const spacing = 3 * dia; // standard spacing
  const d = depth - 100; // effective depth

  // Calculate tension based on simple strut-and-tie models
  // 2 piles: T = Fpile * a / d where a = spacing/2
  // 4 piles: T = Fpile * spacing / (2 * d)
  let tension = 0;
  if (count === 2) {
    tension = (pileLoad * (spacing / 2)) / d;
  } else if (count === 3) {
    tension = (pileLoad * (spacing / Math.sqrt(3))) / d;
  } else { // 4 piles
    tension = (pileLoad * spacing) / (2 * d);
  }
  outTension.textContent = `${tension.toFixed(1)} kN`;

  // Required steel
  const ast = (tension * 1e3) / (0.87 * 500); // using Fe500
  outAst.textContent = `${Math.round(ast)} mm²`;

  const numBars = Math.max(4, Math.ceil(ast / (Math.PI * 20 * 20 / 4)));
  outBars.textContent = `${numBars} Nos - 20mm dia`;

  // Punching shear checks
  const punchingStress = (load * 1e3) / (4 * 500 * d); // simplified column face punching
  outShear.textContent = `${punchingStress.toFixed(2)} MPa`;

  const permissibleShear = 0.25 * Math.sqrt(fck);
  const ratio = punchingStress / permissibleShear;
  outShearCheck.textContent = ratio <= 1.0 ? `${ratio.toFixed(2)} (Safe)` : `${ratio.toFixed(2)} (Fail)`;

  if (ratio <= 1.0) {
    badge.className = 'tool-status-badge pass';
    badge.textContent = 'PASS';
  } else {
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'RESIZE';
  }

  drawPileCapCanvas(count);
}

function drawPileCapCanvas(count) {
  const canvas = document.getElementById('pile-cap-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const capSize = 130;
  const startX = (canvas.width - capSize) / 2;
  const startY = (canvas.height - capSize) / 2;

  // Outer cap (Steel blue)
  ctx.strokeStyle = '#2a6496';
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, startY, capSize, capSize);

  // Draw Piles as gray circles
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  const pileR = 15;

  const positions = [];
  if (count === 2) {
    positions.push({ x: startX + 25, y: startY + capSize/2 });
    positions.push({ x: startX + capSize - 25, y: startY + capSize/2 });
  } else if (count === 3) {
    positions.push({ x: startX + capSize/2, y: startY + 25 });
    positions.push({ x: startX + 25, y: startY + capSize - 25 });
    positions.push({ x: startX + capSize - 25, y: startY + capSize - 25 });
  } else { // 4 piles
    positions.push({ x: startX + 25, y: startY + 25 });
    positions.push({ x: startX + capSize - 25, y: startY + 25 });
    positions.push({ x: startX + 25, y: startY + capSize - 25 });
    positions.push({ x: startX + capSize - 25, y: startY + capSize - 25 });
  }

  positions.forEach(pos => {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pileR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });

  // Draw Column in center (Gold square)
  ctx.fillStyle = '#C9A84C';
  ctx.fillRect(startX + capSize/2 - 12, startY + capSize/2 - 12, 24, 24);
}


// ==========================================
// 7. FOOTING DESIGN LOGIC
// ==========================================
function calculateFooting() {
  const load = parseFloat(document.getElementById('footing-load').value);
  const sbc = parseFloat(document.getElementById('footing-sbc').value);
  const colSize = parseFloat(document.getElementById('footing-col').value);
  const fck = parseFloat(document.getElementById('footing-concrete').value);
  const fy = parseFloat(document.getElementById('footing-steel').value);

  const outArea = document.getElementById('footing-out-area');
  const outDim = document.getElementById('footing-out-dim');
  const outThickness = document.getElementById('footing-out-thickness');
  const outAst = document.getElementById('footing-out-ast');
  const outMesh = document.getElementById('footing-out-mesh');
  const outShear = document.getElementById('footing-out-shear');
  const badge = document.getElementById('footing-status-badge');

  // Footing Area (including 10% self weight)
  const reqArea = (load * 1.1) / sbc;
  outArea.textContent = `${reqArea.toFixed(2)} m²`;

  const width = Math.ceil(Math.sqrt(reqArea) * 20) / 20; // round up to 0.05m
  outDim.textContent = `${width.toFixed(2)}m x ${width.toFixed(2)}m`;

  // Thickness estimation based on punching shear (simplified)
  const netPressure = (load * 1.5) / (width * width); // Factored pressure
  let d = 350; // default d
  let checkPassed = false;
  let loops = 0;

  // Punching shear equation solver
  while (!checkPassed && loops < 100) {
    const colSizeM = colSize / 1000;
    const punchingPerimeter = 4 * (colSizeM + d/1000);
    const punchingArea = Math.pow(colSizeM + d/1000, 2);
    const shearForce = netPressure * (width * width - punchingArea);
    const shearStress = (shearForce * 1e3) / (punchingPerimeter * d * 1000);
    const permissibleStress = 0.25 * Math.sqrt(fck); // limit state

    if (shearStress <= permissibleStress) {
      checkPassed = true;
    } else {
      d += 10;
    }
    loops++;
  }

  const thick = d + 50; // clear cover 50mm
  outThickness.textContent = `${thick} mm`;

  // Bending Steel Calculation at face of column
  const cantilever = (width - colSize/1000) / 2;
  const moment = (netPressure * cantilever * cantilever) / 2; // kNm per meter width
  const totalMoment = moment * width;

  const ast = (0.5 * fck * width * 1000 * d / fy) * (1 - Math.sqrt(1 - (4.6 * totalMoment * 1e6) / (fck * width * 1000 * d * d)));
  outAst.textContent = `${Math.round(ast)} mm²`;

  const spacing = Math.min(300, Math.floor((1000 * (Math.PI * 12 * 12 / 4)) / (ast / width)));
  outMesh.textContent = `12mm dia @ ${Math.round(spacing)}mm c/c`;

  // One-way shear check
  const criticalSection = cantilever - d/1000;
  const oneWayShearForce = netPressure * width * Math.max(0, criticalSection);
  const oneWayShearStress = (oneWayShearForce * 1e3) / (width * 1000 * d);
  outShear.textContent = `${oneWayShearStress.toFixed(2)} MPa (Safe)`;

  badge.className = 'tool-status-badge pass';
  badge.textContent = 'PASS';

  drawFootingCanvas();
}

function drawFootingCanvas() {
  const canvas = document.getElementById('footing-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const startX = 40;
  const footingW = canvas.width - 80;
  const footingH = 35;
  const footingY = canvas.height - 70;

  // Draw Soil pressure arrows
  ctx.strokeStyle = '#2a6496';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 9; i++) {
    const arrowX = startX + 10 + i * (footingW - 20) / 8;
    ctx.beginPath();
    ctx.moveTo(arrowX, canvas.height - 15);
    ctx.lineTo(arrowX, footingY + footingH + 2);
    ctx.stroke();

    // arrow head
    ctx.beginPath();
    ctx.moveTo(arrowX - 3, footingY + footingH + 6);
    ctx.lineTo(arrowX, footingY + footingH + 2);
    ctx.lineTo(arrowX + 3, footingY + footingH + 6);
    ctx.stroke();
  }

  // Draw Footing Base (Steel blue border)
  ctx.strokeStyle = '#2a6496';
  ctx.lineWidth = 2;
  ctx.strokeRect(startX, footingY, footingW, footingH);

  // Draw Column sticking out
  ctx.strokeRect(canvas.width/2 - 15, footingY - 60, 30, 60);

  // Draw Tension reinforcement mesh at base (Gold lines)
  ctx.strokeStyle = '#C9A84C';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(startX + 12, footingY + footingH - 12);
  ctx.lineTo(startX + footingW - 12, footingY + footingH - 12);
  ctx.stroke();

  // Mesh dots
  ctx.fillStyle = '#4f86c6';
  for (let i = 0; i < 11; i++) {
    ctx.beginPath();
    ctx.arc(startX + 18 + i * (footingW - 36)/10, footingY + footingH - 12, 3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#9AA0A6';
  ctx.font = '9px JetBrains Mono';
  ctx.fillText('Mesh reinforcement at base', canvas.width/2 - 68, footingY + footingH + 20);
}


// ==========================================
// 8. PDF REPORT GENERATION
// ==========================================
function downloadColumnPDF() {
  const pdl = parseFloat(document.getElementById('column-pdl').value);
  const pll = parseFloat(document.getElementById('column-pll').value);
  const fc = parseFloat(document.getElementById('column-fc').value);
  const fy = parseFloat(document.getElementById('column-fy').value);
  const phi = parseFloat(document.getElementById('column-phi').value);
  const p = parseFloat(document.getElementById('column-p').value);
  const projName = document.getElementById('column-proj-name').value || "TwinAnalytic Tower";
  const projNum = document.getElementById('column-proj-num').value || "2026-001";
  const designerInitials = document.getElementById('column-designer').value || "AH";
  const reviewerInitials = document.getElementById('column-reviewer').value || "MB";
  const colHeight = parseFloat(document.getElementById('column-height').value) || 10.0;

  if (isNaN(pdl) || pdl <= 0 || isNaN(pll) || pll <= 0 || isNaN(fc) || fc <= 0 || isNaN(fy) || fy <= 0 || isNaN(phi) || phi <= 0 || phi > 1.0 || isNaN(p) || p < 0.01 || p > 0.08 || isNaN(colHeight) || colHeight <= 0) {
    alert('Please enter valid input parameters before downloading the PDF report.');
    return;
  }

  const isUnlocked = localStorage.getItem('tools_user_unlocked');
  if (isUnlocked !== 'true') {
    openAuthModal(downloadColumnPDF, 'Column PDF Export');
    return;
  }

  calculateColumn();

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  const mainBarSize = document.getElementById('column-main-bar').value;
  const tieBarSize = document.getElementById('column-tie-bar').value;

  const pu = document.getElementById('column-out-pu').textContent;
  const ag = document.getElementById('column-out-ag').textContent;
  const dim = document.getElementById('column-out-dim').textContent;
  const finalArea = document.getElementById('column-out-final-area').textContent;
  const ast = document.getElementById('column-out-ast').textContent;
  const tieSpacing = document.getElementById('column-out-tie-spacing').textContent;

  const dimVal = parseFloat(dim);
  const pVal = parseFloat(p);

  const mainBarDia = mainBarSize === '#7' ? 0.875 : mainBarSize === '#8' ? 1.0 : 1.128;
  const tieBarDia = tieBarSize === '#3' ? 0.375 : 0.5;

  const clearSpacingVal = (dimVal - (2 * 1.5) - (2 * tieBarDia) - (3 * mainBarDia)) / 2;

  const minAllowedSpacing = Math.max(1.5, 1.5 * mainBarDia);
  const hookExtension = Math.max(3.0, 6 * tieBarDia);

  const isCompliancePassed = clearSpacingVal > minAllowedSpacing;
  const complianceNotice = isCompliancePassed 
    ? `PASS: Clear spacing of ${clearSpacingVal.toFixed(2)}" meets ACI 318 min requirement of ${minAllowedSpacing.toFixed(2)}"`
    : `WARNING: Clear spacing too narrow for aggregate flow.`;

  const puVal = parseFloat(pu);
  const astVal = parseFloat(ast);
  const PnMax = 0.80 * (0.85 * fc * (dimVal * dimVal - astVal) + fy * astVal);
  const PhiPn = 0.65 * PnMax;
  const dcRatio = puVal / PhiPn;
  const concreteVol = (((dimVal * dimVal) / 144) * colHeight) * 0.02831685; // cubic feet to cubic meters
  const steelWeight = ((astVal * 3.4) * colHeight) * 0.45359237; // lbs to kg

  const maxTieSpacingCalculated = Math.min(16 * mainBarDia, 48 * tieBarDia, dimVal);
  let governingSpacingText = "";
  if (maxTieSpacingCalculated === 16 * mainBarDia) {
    governingSpacingText = "Spacing governed by 16x Main Bar Dia";
  } else if (maxTieSpacingCalculated === 48 * tieBarDia) {
    governingSpacingText = "Spacing governed by 48x Tie Bar Dia";
  } else {
    governingSpacingText = "Spacing governed by Least Column Dimension";
  }

  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.015);
  doc.rect(0.25, 0.25, 8.0, 1.3, 'S');

  doc.line(2.3, 0.25, 2.3, 1.55);
  doc.line(5.6, 0.25, 5.6, 1.55);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(18);
  doc.text('TwinAnalytic', 0.4, 0.65);
  
  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.text('STRUCTURAL MEMBER DESIGN SHEET', 0.4, 0.88);
  doc.text('ACI 318-19 COMPLIANCE AUDIT', 0.4, 1.08);
  doc.text('Calculations Sheet S-101', 0.4, 1.28);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('PROJECT:', 2.5, 0.5);
  doc.setFont('helvetica', 'normal');
  const splitProjName = doc.splitTextToSize(projName, 2.0);
  doc.text(splitProjName, 3.4, 0.5);
  
  doc.setFont('helvetica', 'bold');
  doc.text('PROJ. NO:', 2.5, 0.95);
  doc.setFont('helvetica', 'normal');
  doc.text(projNum, 3.4, 0.95);

  doc.setFont('helvetica', 'bold');
  doc.text('MEMBER:', 2.5, 1.35);
  doc.setFont('helvetica', 'normal');
  doc.text(`Concrete Column (${dimVal}" x ${dimVal}")`, 3.4, 1.35);

  doc.line(5.6, 0.68, 8.25, 0.68);
  doc.line(5.6, 1.11, 8.25, 1.11);

  doc.setFont('helvetica', 'bold');
  doc.text('DESIGNED BY:', 5.75, 0.52);
  doc.setFont('helvetica', 'normal');
  doc.text(designerInitials, 7.0, 0.52);

  doc.setFont('helvetica', 'bold');
  doc.text('CHECKED BY:', 5.75, 0.95);
  doc.setFont('helvetica', 'normal');
  doc.text(reviewerInitials, 7.0, 0.95);

  doc.setFont('helvetica', 'bold');
  doc.text('DATE:', 5.75, 1.38);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleDateString(), 6.3, 1.38);

  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.015);
  doc.rect(0.25, 0.25, 8.0, 10.5);

  let lx = 0.5;
  let ly = 1.8;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('1. INPUT PARAMETERS (ACI 318-19 Ch. 19 & 20)', lx, ly);
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.01);
  doc.line(lx, ly + 0.05, 4.1, ly + 0.05);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);

  const inputs = [
    ['Dead Load (PDL)', `${pdl} k`],
    ['Live Load (PLL)', `${pll} k`],
    ['Concrete Strength (f\'c)', `${fc} ksi`],
    ['Steel Strength (fy)', `${fy} ksi`],
    ['Phi Factor (Ø)', `${phi}`],
    ['Steel Ratio (ρ)', `${p}`],
    ['Main Bar size', `${mainBarSize}`],
    ['Tie Bar size', `${tieBarSize}`]
  ];

  ly += 0.25;
  inputs.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, lx, ly);
    doc.setFont('helvetica', 'normal');
    doc.text(val, lx + 2.3, ly);
    ly += 0.22;
  });

  ly += 0.2;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('2. DESIGN OUTPUT & SIZING (ACI 318-19 Ch. 10)', lx, ly);
  doc.line(lx, ly + 0.05, 4.1, ly + 0.05);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);

  const outputs = [
    ['Factored Load (Pu)', pu],
    ['Gross Concrete Area (Ag)', ag],
    ['Column Dimension (Dim)', dim],
    ['Final Column Area', finalArea],
    ['Required Steel Area (Ast)', ast],
    ['Max Tie Spacing (s_max)', tieSpacing]
  ];

  ly += 0.25;
  outputs.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, lx, ly);
    doc.setFont('helvetica', 'normal');
    doc.text(val, lx + 2.3, ly);
    ly += 0.22;
  });

  ly += 0.2;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('3. ACI CODE COMPLIANCE (ACI 318-19 Ch. 22 & 25)', lx, ly);
  doc.line(lx, ly + 0.05, 4.1, ly + 0.05);

  ly += 0.25;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Strength Capacity Check:', lx, ly);
  
  if (dcRatio <= 1.0) {
    doc.setTextColor(30, 150, 30);
    doc.text(`PASS [D/C = ${dcRatio.toFixed(2)}]`, lx + 2.0, ly);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('FAIL - OVERSTRESSED', lx + 2.0, ly);
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);
  ly += 0.18;
  doc.text(`* Nominal Max Strength Pn,max: ${PnMax.toFixed(1)} k (ACI 22.4.2)`, lx, ly);
  ly += 0.16;
  doc.text(`* Design Axial Strength Phi Pn: ${PhiPn.toFixed(1)} k (ACI 22.4.2)`, lx, ly);
  ly += 0.16;
  doc.text(`* Factored Axial Load Pu: ${puVal.toFixed(1)} k (ACI Ch. 10)`, lx, ly);

  ly += 0.25;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Clear Spacing Check:', lx, ly);
  doc.setFont('helvetica', 'normal');
  
  if (isCompliancePassed) {
    doc.setTextColor(30, 150, 30);
    doc.text('PASS', lx + 1.8, ly);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('FAIL', lx + 1.8, ly);
  }

  doc.setTextColor(80, 80, 80);
  doc.setFontSize(8.5);
  ly += 0.18;
  const splitCompliance = doc.splitTextToSize(complianceNotice + " (ACI Table 25.2.1)", 3.6);
  doc.text(splitCompliance, lx, ly);
  ly += splitCompliance.length * 0.16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  ly += 0.1;
  doc.text('Tie Spacing Limit:', lx, ly);
  doc.setFont('helvetica', 'normal');
  doc.text(`${tieSpacing} (ACI Table 25.7.2.1)`, lx + 1.6, ly);
  ly += 0.16;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(100, 100, 100);
  doc.text(`(${governingSpacingText})`, lx, ly);

  ly += 0.22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Standard Hook Details:', lx, ly);
  doc.setFont('helvetica', 'normal');
  doc.text(`${hookExtension.toFixed(2)}" extension (ACI 25.3)`, lx + 1.8, ly);

  let rx = 4.4;
  let ry = 1.8;

  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('4. VISUAL ENGINEERING BLUEPRINT', rx, ry);
  doc.line(rx, ry + 0.05, 8.0, ry + 0.05);

  ry += 0.3;
  const blueprintW = 3.6;
  const blueprintH = 3.6;
  const drawX = rx;
  const drawY = ry;

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.01);
  doc.rect(drawX, drawY, blueprintW, blueprintH);

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.01);
  for (let gx = drawX + 1.5; gx < drawX + blueprintW; gx += 1.5) {
    doc.line(gx, drawY, gx, drawY + blueprintH);
  }
  for (let gy = drawY + 1.5; gy < drawY + blueprintH; gy += 1.5) {
    doc.line(drawX, gy, drawX + blueprintW, gy);
  }

  const scaleBarX = drawX + 0.5;
  const scaleBarY = drawY + blueprintH - 0.25;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.015);
  doc.line(scaleBarX, scaleBarY, scaleBarX + 1.5, scaleBarY);
  doc.line(scaleBarX, scaleBarY - 0.05, scaleBarX, scaleBarY + 0.05);
  doc.line(scaleBarX + 1.5, scaleBarY - 0.05, scaleBarX + 1.5, scaleBarY + 0.05);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text('1.5" Scale Baseline', scaleBarX + 0.35, scaleBarY - 0.08);

  const drawBoxSize = 2.6;
  const offsetX = drawX + (blueprintW - drawBoxSize)/2;
  const offsetY = drawY + (blueprintH - drawBoxSize)/2;
  
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(30, 30, 30);
  doc.setLineWidth(0.04);
  doc.rect(offsetX, offsetY, drawBoxSize, drawBoxSize, 'FD');

  const drawScale = drawBoxSize / dimVal;
  const coverPaper = 1.5 * drawScale;
  const tieSizePaper = drawBoxSize - 2 * coverPaper;

  doc.setDrawColor(220, 50, 50);
  doc.setLineWidth(0.025);
  doc.rect(offsetX + coverPaper, offsetY + coverPaper, tieSizePaper, tieSizePaper, 'S');

  const hookX = offsetX + coverPaper;
  const hookY = offsetY + coverPaper;
  doc.setLineWidth(0.02);
  doc.setDrawColor(220, 50, 50);
  doc.line(hookX, hookY, hookX + 0.18, hookY + 0.18);
  doc.line(hookX, hookY, hookX + 0.08, hookY + 0.20);

  const barRPaper = Math.max(0.05, (mainBarDia / 2) * drawScale);
  const linkL = offsetX + coverPaper + barRPaper;
  const linkR = offsetX + drawBoxSize - coverPaper - barRPaper;
  const linkT = offsetY + coverPaper + barRPaper;
  const linkB = offsetY + drawBoxSize - coverPaper - barRPaper;

  doc.setFillColor(30, 30, 30);
  doc.setDrawColor(10, 10, 10);
  doc.setLineWidth(0.01);

  doc.circle(linkL, linkT, barRPaper, 'FD');
  doc.circle(linkR, linkT, barRPaper, 'FD');
  doc.circle(linkL, linkB, barRPaper, 'FD');
  doc.circle(linkR, linkB, barRPaper, 'FD');

  const midY = (linkT + linkB) / 2;
  const midX = (linkL + linkR) / 2;
  doc.circle(linkL, midY, barRPaper, 'FD');
  doc.circle(linkR, midY, barRPaper, 'FD');
  doc.circle(midX, linkT, barRPaper, 'FD');
  doc.circle(midX, linkB, barRPaper, 'FD');

  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.008);
  
  doc.line(offsetX, offsetY - 0.12, offsetX + drawBoxSize, offsetY - 0.12);
  doc.line(offsetX, offsetY - 0.18, offsetX, offsetY - 0.06);
  doc.line(offsetX + drawBoxSize, offsetY - 0.18, offsetX + drawBoxSize, offsetY - 0.06);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.text(`${dimVal}"`, offsetX + drawBoxSize/2 - 0.1, offsetY - 0.18);

  doc.line(offsetX - 0.12, offsetY, offsetX - 0.12, offsetY + drawBoxSize);
  doc.line(offsetX - 0.18, offsetY, offsetX - 0.06, offsetY);
  doc.line(offsetX - 0.18, offsetY + drawBoxSize, offsetX - 0.06, offsetY + drawBoxSize);
  doc.text(`${dimVal}"`, offsetX - 0.42, offsetY + drawBoxSize/2 + 0.05);

  ry += blueprintH + 0.25;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('5. DETAILING SPECIFICATIONS (ACI 318-19 Ch. 25)', rx, ry);
  doc.line(rx, ry + 0.05, 8.0, ry + 0.05);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(80, 80, 80);

  ry += 0.25;
  const specNotes = [
    `* Maximum Tie Spacing Limit: ${tieSpacing} (${governingSpacingText}).`,
    `* Clear Spacing Check Status: ${isCompliancePassed ? "PASS" : "FAIL - WARNING: Clear spacing too narrow for aggregate flow."}`,
    `* Standard Hook Details: Tie hook bend angle = 135 deg with a standard hook extension = ${hookExtension.toFixed(2)} in.`,
    `* Concrete clear cover requirement: 1.5 in clears all tie cages.`
  ];

  specNotes.forEach(note => {
    const splitNote = doc.splitTextToSize(note, 3.6);
    doc.text(splitNote, rx, ry);
    ry += splitNote.length * 0.16;
  });

  ry += 0.25;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('6. MATERIAL TAKEOFF ESTIMATE', rx, ry);
  doc.line(rx, ry + 0.05, 8.0, ry + 0.05);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(60, 60, 60);

  ry += 0.25;
  doc.text('Concrete Volume:', rx, ry);
  doc.setFont('helvetica', 'normal');
  doc.text(`${concreteVol.toFixed(2)} cu. m. (m³)`, rx + 1.8, ry);

  ry += 0.22;
  doc.setFont('helvetica', 'bold');
  doc.text('Steel Weight:', rx, ry);
  doc.setFont('helvetica', 'normal');
  doc.text(`${steelWeight.toFixed(1)} kg`, rx + 1.8, ry);

  ry += 0.22;
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.setTextColor(120, 120, 120);
  doc.text(`* Takeoff estimate based on column height of ${colHeight} ft`, rx, ry);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(150, 150, 150);
  doc.text('TwinAnalytic Engineering Group — Calculations Sheet S-101', 0.5, 10.5);
  doc.text('Page 1 of 1', 7.2, 10.5);

  doc.save(`twinanalytic_column_report_${new Date().toISOString().split('T')[0]}.pdf`);
}
