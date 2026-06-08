// --- STRUCTURAL ENGINEERING DESIGN CALCULATORS & CANVAS DRAWINGS ---

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

// Handle auth form submission, save lead to localStorage database, and close modal
function handleAuthSubmit(event) {
  event.preventDefault();
  
  const name = document.getElementById('lead-name').value;
  const phone = document.getElementById('lead-phone').value;
  const email = document.getElementById('lead-email').value;
  const timestamp = new Date().toLocaleString();

  // Save entry in leads array
  let leads = JSON.parse(localStorage.getItem('tools_leads') || '[]');
  leads.push({
    name: name,
    phone: phone,
    email: email,
    timestamp: timestamp,
    calcType: pendingType
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

  // Run the calculator
  if (pendingCallback) {
    pendingCallback();
  }

  // Reset form inputs
  event.target.reset();
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
  const L = parseFloat(document.getElementById('slab-span').value);
  const t = parseFloat(document.getElementById('slab-t').value);
  const liveLoad = parseFloat(document.getElementById('slab-load').value);
  const fck = parseFloat(document.getElementById('slab-concrete').value);
  const fy = parseFloat(document.getElementById('slab-steel').value);

  const outWu = document.getElementById('slab-out-wu');
  const outMu = document.getElementById('slab-out-mu');
  const outAst = document.getElementById('slab-out-ast');
  const outSpacing = document.getElementById('slab-out-spacing');
  const outDist = document.getElementById('slab-out-dist');
  const outDeflect = document.getElementById('slab-out-deflect');
  const badge = document.getElementById('slab-status-badge');

  // Load calculations
  const deadLoad = 25 * (t / 1000); // 25 kN/m3 concrete density
  const wu = 1.5 * (deadLoad + liveLoad + 1.0); // 1.0 finish load assumed
  outWu.textContent = `${wu.toFixed(2)} kN/m`;

  const Mu = (wu * L * L) / 8; // Simply supported bending moment
  outMu.textContent = `${Mu.toFixed(2)} kNm`;

  // Effective depth (15mm cover, 10mm bar)
  const d = t - 20;
  
  // Required steel area per meter width (b = 1000mm)
  let ast = (0.5 * fck * 1000 * d / fy) * (1 - Math.sqrt(1 - (4.6 * Mu * 1e6) / (fck * 1000 * d * d)));
  const astMin = 0.0012 * 1000 * t; // 0.12% for high-strength steel (Fe500)
  outDist.textContent = `${Math.round(astMin)} mm²/m`;

  let status = 'PASS';
  let spacingText = '';

  if (isNaN(ast)) {
    status = 'FAIL';
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'RESIZE';
    outAst.textContent = 'N/A';
    outSpacing.textContent = 'Depth too thin for moment';
    outDeflect.textContent = 'FAIL';
  } else {
    if (ast < astMin) ast = astMin;
    outAst.textContent = `${Math.round(ast)} mm²/m`;

    // 10mm bars spacing calculation
    const singleBarArea = Math.PI * 10 * 10 / 4; // 78.5 mm2
    let spacing = (1000 * singleBarArea) / ast;
    spacing = Math.floor(spacing / 10) * 10; // round down to nearest 10mm
    spacing = Math.min(spacing, 3 * d, 300); // Code limit
    spacingText = `10mm @ ${spacing}mm c/c`;
    outSpacing.textContent = spacingText;

    // Deflection Check ratio (L/d <= 20 * modification factor)
    const ratioVal = L * 1000 / d;
    const pt = (ast / (1000 * d)) * 100;
    const fs = 0.58 * fy;
    const mf = 1 / (0.225 + 0.0032 * fs - 0.625 * Math.log10(1/pt)); // approximate modification factor
    const allowableRatio = 20 * (isNaN(mf) || mf < 0.5 ? 1.0 : Math.min(mf, 2.0));

    if (ratioVal <= allowableRatio) {
      outDeflect.textContent = `${(ratioVal / allowableRatio).toFixed(2)} (Safe)`;
      badge.className = 'tool-status-badge pass';
      badge.textContent = 'PASS';
    } else {
      outDeflect.textContent = `${(ratioVal / allowableRatio).toFixed(2)} (Deflection Fail)`;
      badge.className = 'tool-status-badge fail';
      badge.textContent = 'RESIZE';
      status = 'FAIL';
    }
  }

  drawSlabCanvas(t, status === 'FAIL' ? 0 : 200);
}

function drawSlabCanvas(thickness, spacingVal) {
  const canvas = document.getElementById('slab-canvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const drawH = Math.max(30, thickness * 0.5);
  const startY = (canvas.height - drawH) / 2;

  // Draw slab segment
  ctx.strokeStyle = '#2a6496';
  ctx.lineWidth = 2;
  ctx.strokeRect(10, startY, canvas.width - 20, drawH);

  // Draw bottom longitudinal bars (lines at the bottom with hooks)
  ctx.strokeStyle = '#C9A84C';
  ctx.lineWidth = 1.5;
  const barY = startY + drawH - 12;

  ctx.beginPath();
  // Left hook
  ctx.moveTo(20, barY - 10);
  ctx.lineTo(20, barY);
  ctx.lineTo(canvas.width - 20, barY);
  // Right hook
  ctx.lineTo(canvas.width - 20, barY - 10);
  ctx.stroke();

  // Draw transverse rebars (dots along slab)
  ctx.fillStyle = '#4f86c6';
  const steps = 8;
  const dist = (canvas.width - 60) / (steps - 1);
  for (let i = 0; i < steps; i++) {
    ctx.beginPath();
    ctx.arc(30 + i * dist, barY - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#9AA0A6';
  ctx.font = '10px JetBrains Mono';
  ctx.fillText(`Thickness = ${thickness}mm`, canvas.width/2 - 60, startY - 8);
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
