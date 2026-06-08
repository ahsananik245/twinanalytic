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
    btnSlab.addEventListener('click', () => {
      checkAuthAndRun(() => {
        calculateSlab();
        const resEl = document.getElementById('slab-results-container');
        if (resEl) resEl.scrollIntoView({ behavior: 'smooth' });
      }, 'Slab Design');
    });
    // Auto-fill date
    const dateEl = document.getElementById('slab-date');
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toISOString().split('T')[0];
    }
    initSlabLiveUpdates();
    // Initial run if already unlocked
    if (localStorage.getItem('tools_user_unlocked') === 'true') {
      calculateSlab();
    }
  }
  const btnSlabPDFs = document.querySelectorAll('[id="btn-download-slab-pdf"]');
  btnSlabPDFs.forEach(btn => {
    btn.addEventListener('click', () => {
      const isUnlocked = localStorage.getItem('tools_user_unlocked');
      if (isUnlocked !== 'true') {
        openAuthModal(downloadSlabPDF, 'Slab PDF Export');
      } else {
        downloadSlabPDF();
      }
    });
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
      const lnLong = parseFloat(document.getElementById('slab-ln-long').value) || 0;
      const lnShort = parseFloat(document.getElementById('slab-ln-short').value) || 0;
      const fy = parseFloat(document.getElementById('slab-fy').value) || 60000;
      const fc = parseFloat(document.getElementById('slab-fc').value) || 3000;
      const type = document.getElementById('slab-type').value;
      const panel = document.getElementById('slab-panel').value;
      const drops = document.getElementById('slab-drops').value;
      const c1 = parseFloat(document.getElementById('slab-c1').value) || 0;
      const c2 = parseFloat(document.getElementById('slab-c2').value) || 0;
      const ll = parseFloat(document.getElementById('slab-ll').value) || 0;
      const sdl = parseFloat(document.getElementById('slab-sdl').value) || 0;
      const normalWeight = document.getElementById('slab-normal-weight').value;

      // Calculate thickness sizing to determine final adopted thickness hFinal
      let hCalc = 0;
      let hMin = 5.0;
      if (type !== 'with-beams') {
        hMin = (drops === 'yes') ? 4.0 : 5.0;
        let factor = 30;
        if (fy === 40000) {
          if (drops === 'no') {
            factor = (panel === 'exterior-no-edge') ? 33 : 36;
          } else {
            factor = (panel === 'exterior-no-edge') ? 36 : 40;
          }
        } else if (fy === 60000) {
          if (drops === 'no') {
            factor = (panel === 'exterior-no-edge') ? 30 : 33;
          } else {
            factor = (panel === 'exterior-no-edge') ? 33 : 36;
          }
        } else { // fy === 75000
          if (drops === 'no') {
            factor = (panel === 'exterior-no-edge') ? 28 : 31;
          } else {
            factor = (panel === 'exterior-no-edge') ? 31 : 34;
          }
        }
        hCalc = (lnLong * 12) / factor;
      } else {
        const alpha = parseFloat(document.getElementById('slab-alpha-fm').value) || 1.5;
        const beta = parseFloat(document.getElementById('slab-beta-val').value) || (lnLong / lnShort);
        if (alpha <= 0.2) {
          hMin = (drops === 'yes') ? 4.0 : 5.0;
          let factor = 30;
          if (fy === 40000) {
            factor = (panel === 'exterior-no-edge') ? 33 : 36;
          } else if (fy === 60000) {
            factor = (panel === 'exterior-no-edge') ? 30 : 33;
          } else {
            factor = (panel === 'exterior-no-edge') ? 28 : 31;
          }
          hCalc = (lnLong * 12) / factor;
        } else if (alpha > 0.2 && alpha <= 2.0) {
          hMin = 5.0;
          hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 5 * beta * (alpha - 0.2));
        } else {
          hMin = 3.5;
          hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 9 * beta);
        }
      }
      let hFinal = Math.max(hCalc, hMin);
      hFinal = Math.ceil(hFinal * 2) / 2; // round up to nearest 0.5 inches

      const concDensity = (normalWeight === 'yes') ? 150 : 110;
      const selfWeight = (hFinal / 12) * concDensity;
      const totalDL = sdl + selfWeight;
      const factoredQu = (1.2 * totalDL) + (1.6 * ll);

      const l1 = lnLong + c1 / 12;
      const l2 = lnShort + c2 / 12;

      const Mol = (factoredQu * l2 * Math.pow(lnLong, 2)) / 8 / 1000;
      const Mos = (factoredQu * l1 * Math.pow(lnShort, 2)) / 8 / 1000;

      const dAvg = hFinal - 1.5;
      const bo = 2 * (c1 + dAvg) + 2 * (c2 + dAvg);
      const punchVu = factoredQu * (l1 * l2 - (c1 + dAvg) * (c2 + dAvg) / 144) / 1000;
      const lambda = (normalWeight === 'yes') ? 1.0 : 0.75;
      const punchVc = 4 * lambda * Math.sqrt(fc) * bo * dAvg / 1000;
      const phiPunchVc = 0.75 * punchVc;

      const owVu = factoredQu * (lnLong / 2 - dAvg / 12) / 1000;
      const owVc = 2 * lambda * Math.sqrt(fc) * 12 * dAvg / 1000;
      const phiOwVc = 0.75 * owVc;

      const punchPass = phiPunchVc >= punchVu;
      const owPass = phiOwVc >= owVu;
      const allPassed = punchPass && owPass && (lnLong / lnShort <= 2.0);

      const concreteVol = ((hFinal / 12) * l1 * l2) * 0.02831685; // m3
      const steelWeight = (2 * 0.0018 * 12 * l1 * l2 * hFinal * 3.4) * 0.45359237; // kg

      metrics.geometry = `${lnLong}'x${lnShort}' (h=${hFinal.toFixed(1)}")`;
      metrics.reinforcement = `Mol = ${Mol.toFixed(1)} k-ft | Mos = ${Mos.toFixed(1)} k-ft`;
      metrics.status = allPassed ? "PASS" : "FAIL";
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
function initSlabLiveUpdates() {
  const slabInputs = [
    'slab-proj-name', 'slab-designer', 'slab-date', 'slab-location', 'slab-floor',
    'slab-ln-long', 'slab-ln-short', 'slab-fy', 'slab-fc', 'slab-type', 'slab-panel',
    'slab-drops', 'slab-c1', 'slab-c2', 'slab-ll', 'slab-sdl', 'slab-normal-weight',
    'slab-alpha-fm', 'slab-beta-val'
  ];
  slabInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', () => {
        const isUnlocked = localStorage.getItem('tools_user_unlocked');
        if (isUnlocked === 'true') {
          calculateSlab();
        }
      });
      el.addEventListener('change', () => {
        const isUnlocked = localStorage.getItem('tools_user_unlocked');
        if (isUnlocked === 'true') {
          calculateSlab();
        }
      });
    }
  });

  // Toggle stiffness and beta fields depending on slab-type selection
  const typeEl = document.getElementById('slab-type');
  if (typeEl) {
    const handleTypeChange = () => {
      const container = document.getElementById('slab-beams-inputs-container');
      if (container) {
        if (typeEl.value === 'with-beams') {
          container.style.display = 'block';
        } else {
          container.style.display = 'none';
        }
      }
    };
    typeEl.addEventListener('change', handleTypeChange);
    handleTypeChange(); // Initial check
  }

  // Bind reset button
  const btnReset = document.getElementById('btn-reset-slab');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      document.getElementById('slab-proj-name').value = "TwinAnalytic Tower";
      document.getElementById('slab-designer').value = "AH";
      document.getElementById('slab-date').value = new Date().toISOString().split('T')[0];
      document.getElementById('slab-location').value = "New York, NY";
      document.getElementById('slab-floor').value = "Floor 2";
      document.getElementById('slab-ln-long').value = "20";
      document.getElementById('slab-ln-short').value = "18";
      document.getElementById('slab-fy').value = "60000";
      document.getElementById('slab-fc').value = "3000";
      document.getElementById('slab-type').value = "flat-plate";
      document.getElementById('slab-panel').value = "interior";
      document.getElementById('slab-drops').value = "no";
      document.getElementById('slab-c1').value = "18";
      document.getElementById('slab-c2').value = "18";
      document.getElementById('slab-ll').value = "50";
      document.getElementById('slab-sdl').value = "40";
      document.getElementById('slab-normal-weight').value = "yes";
      document.getElementById('slab-alpha-fm').value = "1.5";
      document.getElementById('slab-beta-val').value = "1.11";
      
      const container = document.getElementById('slab-beams-inputs-container');
      if (container) container.style.display = 'none';
      
      const isUnlocked = localStorage.getItem('tools_user_unlocked');
      if (isUnlocked === 'true') {
        calculateSlab();
      }
    });
  }
}

function getRebarDesign(MuVal, bIn, dVal, hVal, fcPsi, fyPsi) {
  const absMu = Math.abs(MuVal);
  if (absMu <= 0) return { req: 0, min: 0, gov: 0, size: '#4', spacing: 18, num: 0 };
  
  const fcKsi = fcPsi / 1000;
  const fyKsi = fyPsi / 1000;
  
  // Ru = Mu / (phi * b * d^2)
  const Rn = (absMu * 12) / (0.9 * bIn * Math.pow(dVal, 2)); // ksi
  
  const minRatio = fyPsi <= 40000 ? 0.0020 : 0.0018;
  const minSteel = minRatio * bIn * hVal; // sq in
  
  let reqSteel = 0;
  if (Rn < 0.85 * fcKsi / 2) {
    const rho = (0.85 * fcKsi / fyKsi) * (1 - Math.sqrt(1 - (2 * Rn) / (0.85 * fcKsi)));
    reqSteel = rho * bIn * dVal;
  } else {
    reqSteel = 999; // requires resizing
  }
  
  const govSteel = Math.max(reqSteel, minSteel);
  
  // Bar selection: auto-suggest #4, #5, or #6
  const barSizes = [
    { size: '#4', area: 0.20 },
    { size: '#5', area: 0.31 },
    { size: '#6', area: 0.44 }
  ];
  
  let selected = barSizes[0];
  
  // Choose bar size that keeps spacing >= 6 inches if possible
  for (let i = 0; i < barSizes.length; i++) {
    selected = barSizes[i];
    const sTest = (selected.area * bIn) / govSteel;
    if (sTest >= 6.0 || i === barSizes.length - 1) {
      break;
    }
  }
  
  let s = (selected.area * bIn) / govSteel;
  const sMax = Math.min(2 * hVal, 18);
  s = Math.floor(s * 2) / 2; // round down to nearest 0.5 inches
  if (s > sMax) s = sMax;
  if (s < 1.5) s = 1.5;
  
  const numBars = Math.ceil(bIn / s);
  
  return {
    req: reqSteel,
    min: minSteel,
    gov: govSteel,
    size: selected.size,
    spacing: s,
    num: numBars
  };
}

function calculateSlab() {
  const lnLong = parseFloat(document.getElementById('slab-ln-long').value);
  const lnShort = parseFloat(document.getElementById('slab-ln-short').value);
  const fy = parseFloat(document.getElementById('slab-fy').value);
  const fc = parseFloat(document.getElementById('slab-fc').value);
  const type = document.getElementById('slab-type').value;
  const panel = document.getElementById('slab-panel').value;
  const drops = document.getElementById('slab-drops').value;
  const c1 = parseFloat(document.getElementById('slab-c1').value);
  const c2 = parseFloat(document.getElementById('slab-c2').value);
  const ll = parseFloat(document.getElementById('slab-ll').value);
  const sdl = parseFloat(document.getElementById('slab-sdl').value);
  const normalWeight = document.getElementById('slab-normal-weight').value;

  const outMethod = document.getElementById('slab-out-thickness-method');
  const outFormula = document.getElementById('slab-out-thickness-formula');
  const outSub = document.getElementById('slab-out-thickness-sub');
  const outCalc = document.getElementById('slab-out-thickness-calc');
  const outMin = document.getElementById('slab-out-thickness-min');
  const outFinal = document.getElementById('slab-out-thickness-final');
  
  const outSelfWeight = document.getElementById('slab-out-self-weight');
  const outTotalDL = document.getElementById('slab-out-total-dl');
  const outTotalLL = document.getElementById('slab-out-total-ll');
  const outFactoredQu = document.getElementById('slab-out-factored-qu');
  
  const outMolDetail = document.getElementById('slab-out-mol-detail');
  const outMolVal = document.getElementById('slab-out-mol-val');
  const outMosDetail = document.getElementById('slab-out-mos-detail');
  const outMosVal = document.getElementById('slab-out-mos-val');
  
  const momentsTbody = document.getElementById('slab-out-moments-tbody');
  const rebarTbody = document.getElementById('slab-out-rebar-tbody');
  
  const outBo = document.getElementById('slab-out-bo');
  const outPunchVu = document.getElementById('slab-out-punch-vu');
  const outPunchVc = document.getElementById('slab-out-punch-vc');
  const outPunchBadge = document.getElementById('slab-out-punch-badge');
  
  const outOwVu = document.getElementById('slab-out-ow-vu');
  const outOwVc = document.getElementById('slab-out-ow-vc');
  const outOwBadge = document.getElementById('slab-out-ow-badge');

  const badge = document.getElementById('slab-status-badge');
  const errorDiv = document.getElementById('slab-validation-error');

  // Input Validation
  if (isNaN(lnLong) || lnLong <= 0 || isNaN(lnShort) || lnShort <= 0 || isNaN(c1) || c1 <= 0 || isNaN(c2) || c2 <= 0 || isNaN(ll) || ll < 0 || isNaN(sdl) || sdl < 0) {
    errorDiv.style.display = 'block';
    errorDiv.textContent = "Please fill in all inputs with valid positive numbers.";
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'FAIL';
    return;
  }
  
  errorDiv.style.display = 'none';
  errorDiv.innerHTML = '';

  let warnings = [];
  
  if (lnLong / lnShort > 2.0) {
    warnings.push("Warning: Aspect span ratio (Beta = " + (lnLong / lnShort).toFixed(2) + ") exceeds 2.0 (ACI DDM limit).");
  }

  // 1. Thickness Sizing
  let hCalc = 0;
  let hMin = 5.0;
  let formulaStr = "";
  let subStr = "";
  let methodStr = "";

  if (type !== 'with-beams') {
    methodStr = "ACI 318-19 Table 8.3.1.1 (Without Interior Beams)";
    hMin = (drops === 'yes') ? 4.0 : 5.0;
    
    let factor = 30;
    if (fy === 40000) {
      if (drops === 'no') {
        factor = (panel === 'exterior-no-edge') ? 33 : 36;
      } else {
        factor = (panel === 'exterior-no-edge') ? 36 : 40;
      }
    } else if (fy === 60000) {
      if (drops === 'no') {
        factor = (panel === 'exterior-no-edge') ? 30 : 33;
      } else {
        factor = (panel === 'exterior-no-edge') ? 33 : 36;
      }
    } else { // fy === 75000
      if (drops === 'no') {
        factor = (panel === 'exterior-no-edge') ? 28 : 31;
      } else {
        factor = (panel === 'exterior-no-edge') ? 31 : 34;
      }
    }
    
    hCalc = (lnLong * 12) / factor;
    formulaStr = `h = ln / ${factor}`;
    subStr = `h = (${lnLong} ft * 12) / ${factor} = ${hCalc.toFixed(2)} in`;
  } else {
    methodStr = "ACI 318-19 Section 8.3.1.2 (With Interior Beams)";
    const alpha = parseFloat(document.getElementById('slab-alpha-fm').value) || 1.5;
    const beta = parseFloat(document.getElementById('slab-beta-val').value) || (lnLong / lnShort);
    
    if (alpha <= 0.2) {
      hMin = (drops === 'yes') ? 4.0 : 5.0;
      let factor = 30;
      if (fy === 40000) {
        factor = (panel === 'exterior-no-edge') ? 33 : 36;
      } else if (fy === 60000) {
        factor = (panel === 'exterior-no-edge') ? 30 : 33;
      } else {
        factor = (panel === 'exterior-no-edge') ? 28 : 31;
      }
      hCalc = (lnLong * 12) / factor;
      formulaStr = `h = ln / ${factor} (since αfm <= 0.2)`;
      subStr = `h = (${lnLong} ft * 12) / ${factor} = ${hCalc.toFixed(2)} in`;
    } else if (alpha > 0.2 && alpha <= 2.0) {
      hMin = 5.0;
      hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 5 * beta * (alpha - 0.2));
      formulaStr = `h = ln * (0.8 + fy/200,000) / [36 + 5*β*(αfm - 0.2)]`;
      subStr = `h = (${lnLong}*12 * (0.8 + ${fy}/200k)) / [36 + 5*${beta.toFixed(2)}*(${alpha} - 0.2)] = ${hCalc.toFixed(2)} in`;
    } else { // alpha > 2.0
      hMin = 3.5;
      hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 9 * beta);
      formulaStr = `h = ln * (0.8 + fy/200,000) / [36 + 9*β]`;
      subStr = `h = (${lnLong}*12 * (0.8 + ${fy}/200k)) / [36 + 9*${beta.toFixed(2)}] = ${hCalc.toFixed(2)} in`;
    }
  }

  let hFinal = Math.max(hCalc, hMin);
  hFinal = Math.ceil(hFinal * 2) / 2; // round up to nearest 0.5 inches

  // Update thickness outputs
  outMethod.textContent = methodStr;
  outFormula.textContent = formulaStr;
  outSub.textContent = subStr;
  outCalc.textContent = `${hCalc.toFixed(2)} in`;
  outMin.textContent = `${hMin.toFixed(1)} in`;
  outFinal.textContent = `${hFinal.toFixed(1)} in`;

  // 2. Load Calculations
  const concDensity = (normalWeight === 'yes') ? 150 : 110;
  const selfWeight = (hFinal / 12) * concDensity;
  const totalDL = sdl + selfWeight;
  const factoredQu = (1.2 * totalDL) + (1.6 * ll);

  if (ll > 2 * totalDL) {
    warnings.push("Warning: Live load exceeds 2x dead load (ACI DDM limit).");
  }
  
  outSelfWeight.textContent = `${selfWeight.toFixed(1)} psf`;
  outTotalDL.textContent = `${totalDL.toFixed(1)} psf`;
  outTotalLL.textContent = `${ll.toFixed(1)} psf`;
  outFactoredQu.textContent = `${factoredQu.toFixed(1)} psf`;

  // 3. Static Moments
  const l1 = lnLong + c1 / 12;
  const l2 = lnShort + c2 / 12;
  
  const Mol = (factoredQu * l2 * Math.pow(lnLong, 2)) / 8 / 1000;
  const Mos = (factoredQu * l1 * Math.pow(lnShort, 2)) / 8 / 1000;

  outMolDetail.textContent = `qu * l2 * ln_long² / 8 = ${factoredQu.toFixed(1)} * ${l2.toFixed(2)} * ${lnLong}² / 8000`;
  outMolVal.textContent = `${Mol.toFixed(2)} k-ft`;
  
  outMosDetail.textContent = `qu * l1 * ln_short² / 8 = ${factoredQu.toFixed(1)} * ${l1.toFixed(2)} * ${lnShort}² / 8000`;
  outMosVal.textContent = `${Mos.toFixed(2)} k-ft`;

  // 4. Moment Distribution Table
  let extNegCoeff = 0.26;
  let posCoeff = 0.52;
  let intNegCoeff = 0.70;

  if (panel === 'interior') {
    extNegCoeff = 0.65;
    posCoeff = 0.35;
    intNegCoeff = 0.65;
  } else if (panel === 'exterior-edge') {
    extNegCoeff = 0.30;
    posCoeff = 0.50;
    intNegCoeff = 0.70;
  } else if (type === 'with-beams') {
    extNegCoeff = 0.16;
    posCoeff = 0.57;
    intNegCoeff = 0.70;
  }

  const getMoments = (MoVal) => {
    let neg, pos;
    if (panel === 'interior') {
      neg = 0.65 * MoVal;
      pos = 0.35 * MoVal;
    } else {
      neg = intNegCoeff * MoVal; // interior negative moment governs design
      pos = posCoeff * MoVal;
    }
    return { neg, pos };
  };

  const longMoments = getMoments(Mol);
  const shortMoments = getMoments(Mos);

  const lColNeg = longMoments.neg * 0.75;
  const lColPos = longMoments.pos * 0.60;
  const lMidNeg = longMoments.neg * 0.25;
  const lMidPos = longMoments.pos * 0.40;

  const sColNeg = shortMoments.neg * 0.75;
  const sColPos = shortMoments.pos * 0.60;
  const sMidNeg = shortMoments.neg * 0.25;
  const sMidPos = shortMoments.pos * 0.40;

  momentsTbody.innerHTML = `
    <tr>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Column Strip</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Long</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">-${lColNeg.toFixed(1)}</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">+${lColPos.toFixed(1)}</td>
    </tr>
    <tr>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Middle Strip</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Long</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">-${lMidNeg.toFixed(1)}</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">+${lMidPos.toFixed(1)}</td>
    </tr>
    <tr>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Column Strip</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Short</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">-${sColNeg.toFixed(1)}</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">+${sColPos.toFixed(1)}</td>
    </tr>
    <tr>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Middle Strip</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Short</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">-${sMidNeg.toFixed(1)}</td>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold;">+${sMidPos.toFixed(1)}</td>
    </tr>
  `;

  // 5. Reinforcement Table
  const bColFt = 0.5 * Math.min(l1, l2);
  const bMidLongFt = l2 - bColFt;
  const bMidShortFt = l1 - bColFt;

  const bColIn = bColFt * 12;
  const bMidLongIn = bMidLongFt * 12;
  const bMidShortIn = bMidShortFt * 12;

  const dLong = hFinal - 1.25;
  const dShort = hFinal - 1.75;

  const designLColNeg = getRebarDesign(lColNeg, bColIn, dLong, hFinal, fc, fy);
  const designLColPos = getRebarDesign(lColPos, bColIn, dLong, hFinal, fc, fy);
  const designLMidNeg = getRebarDesign(lMidNeg, bMidLongIn, dLong, hFinal, fc, fy);
  const designLMidPos = getRebarDesign(lMidPos, bMidLongIn, dLong, hFinal, fc, fy);

  const designSColNeg = getRebarDesign(sColNeg, bColIn, dShort, hFinal, fc, fy);
  const designSColPos = getRebarDesign(sColPos, bColIn, dShort, hFinal, fc, fy);
  const designSMidNeg = getRebarDesign(sMidNeg, bMidShortIn, dShort, hFinal, fc, fy);
  const designSMidPos = getRebarDesign(sMidPos, bMidShortIn, dShort, hFinal, fc, fy);

  const formatRebarRow = (zone, Mu, d, design) => {
    return `
      <tr>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1);">${zone}</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1);">${Mu.toFixed(1)}</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1);">${d.toFixed(2)}</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1);">${design.req.toFixed(2)}</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1);">${design.min.toFixed(2)}</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; color: var(--color-gold);">${design.gov.toFixed(2)}</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1);">${design.size}</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1); font-weight: bold; color: var(--color-gold);">${design.spacing.toFixed(1)}"</td>
        <td style="padding: 0.4rem; border: 1px solid rgba(255,255,255,0.1);">${design.num}</td>
      </tr>
    `;
  };

  rebarTbody.innerHTML = `
    ${formatRebarRow('Col Strip Top (Long)', lColNeg, dLong, designLColNeg)}
    ${formatRebarRow('Col Strip Bot (Long)', lColPos, dLong, designLColPos)}
    ${formatRebarRow('Mid Strip Top (Long)', lMidNeg, dLong, designLMidNeg)}
    ${formatRebarRow('Mid Strip Bot (Long)', lMidPos, dLong, designLMidPos)}
    ${formatRebarRow('Col Strip Top (Short)', sColNeg, dShort, designSColNeg)}
    ${formatRebarRow('Col Strip Bot (Short)', sColPos, dShort, designSColPos)}
    ${formatRebarRow('Mid Strip Top (Short)', sMidNeg, dShort, designSMidNeg)}
    ${formatRebarRow('Mid Strip Bot (Short)', sMidPos, dShort, designSMidPos)}
  `;

  // 6. Shear Checks
  const dAvg = hFinal - 1.5;
  const bo = 2 * (c1 + dAvg) + 2 * (c2 + dAvg);
  const punchVu = factoredQu * (l1 * l2 - (c1 + dAvg) * (c2 + dAvg) / 144) / 1000;
  
  const lambda = (normalWeight === 'yes') ? 1.0 : 0.75;
  const punchVc = 4 * lambda * Math.sqrt(fc) * bo * dAvg / 1000;
  const phiPunchVc = 0.75 * punchVc;

  outBo.textContent = bo.toFixed(1);
  outPunchVu.textContent = punchVu.toFixed(1);
  outPunchVc.textContent = phiPunchVc.toFixed(1);

  const punchPass = phiPunchVc >= punchVu;
  outPunchBadge.textContent = punchPass ? "PASS" : "FAIL";
  outPunchBadge.style.backgroundColor = punchPass ? "rgba(30, 86, 49, 0.4)" : "rgba(245, 34, 45, 0.2)";
  outPunchBadge.style.color = punchPass ? "#81c784" : "#ff8a80";
  outPunchBadge.style.border = punchPass ? "1px solid #2e7d32" : "1px solid #c62828";

  if (!punchPass) {
    warnings.push("Warning: Punching shear capacity failed. Suggest increasing slab thickness (h) or concrete strength (f'c).");
  }

  // One-way shear check
  const owVu = factoredQu * (lnLong / 2 - dAvg / 12) / 1000; // kips per foot width
  const owVc = 2 * lambda * Math.sqrt(fc) * 12 * dAvg / 1000;
  const phiOwVc = 0.75 * owVc;

  outOwVu.textContent = owVu.toFixed(2);
  outOwVc.textContent = phiOwVc.toFixed(2);

  const owPass = phiOwVc >= owVu;
  outOwBadge.textContent = owPass ? "PASS" : "FAIL";
  outOwBadge.style.backgroundColor = owPass ? "rgba(30, 86, 49, 0.4)" : "rgba(245, 34, 45, 0.2)";
  outOwBadge.style.color = owPass ? "#81c784" : "#ff8a80";
  outOwBadge.style.border = owPass ? "1px solid #2e7d32" : "1px solid #c62828";

  // Check overall compliance status
  const allPassed = punchPass && owPass && (lnLong / lnShort <= 2.0) && (ll <= 2 * totalDL);
  badge.className = allPassed ? 'tool-status-badge pass' : 'tool-status-badge fail';
  badge.textContent = allPassed ? 'PASS' : 'FAIL';

  // Display warnings in validation error block
  if (warnings.length > 0) {
    errorDiv.style.display = 'block';
    errorDiv.innerHTML = warnings.join('<br>');
  }
}

function syncLeadDataBeforeDownload(Mol, Mos, hFinal, quVal) {
  try {
    const leads = JSON.parse(localStorage.getItem('tools_leads') || '[]');
    if (leads.length > 0) {
      const lastLead = leads[leads.length - 1];
      const timestamp = new Date().toLocaleString();
      
      const payload = {
        name: lastLead.name,
        email: lastLead.email,
        phone: lastLead.phone,
        timestamp: timestamp,
        calcType: 'Slab PDF Export',
        geometry: `${document.getElementById('slab-ln-long').value}'x${document.getElementById('slab-ln-short').value}' (h=${hFinal.toFixed(1)}")`,
        reinforcement: `Mol = ${Mol.toFixed(1)} k-ft | Mos = ${Mos.toFixed(1)} k-ft`,
        status: document.getElementById('slab-status-badge').textContent,
        concreteVol: `${(((hFinal / 12) * parseFloat(document.getElementById('slab-ln-long').value) * parseFloat(document.getElementById('slab-ln-short').value)) * 0.02831685).toFixed(2)} m³`,
        steelWeight: `${(2 * 0.0018 * 12 * parseFloat(document.getElementById('slab-ln-long').value) * parseFloat(document.getElementById('slab-ln-short').value) * hFinal * 3.4 * 0.45359237).toFixed(1)} kg`
      };

      // Save locally
      leads.push(payload);
      localStorage.setItem('tools_leads', JSON.stringify(leads));
      updateLeadsCount();

      // Post to Google Sheets
      if (GOOGLE_SCRIPT_URL && GOOGLE_SCRIPT_URL !== "YOUR_GOOGLE_APPS_SCRIPT_WEB_APP_URL") {
        fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          mode: 'no-cors',
          headers: {
            'Content-Type': 'text/plain'
          },
          body: JSON.stringify(payload)
        })
        .catch(err => console.error("Background sync error:", err));
      }
    }
  } catch (e) {
    console.error("Lead sync failed:", e);
  }
}

function downloadSlabPDF() {
  const projName = document.getElementById('slab-proj-name').value || "TwinAnalytic Tower";
  const designer = document.getElementById('slab-designer').value || "AH";
  const dateVal = document.getElementById('slab-date').value || new Date().toISOString().split('T')[0];
  const location = document.getElementById('slab-location').value || "New York, NY";
  const floor = document.getElementById('slab-floor').value || "Floor 2";

  const lnLong = parseFloat(document.getElementById('slab-ln-long').value);
  const lnShort = parseFloat(document.getElementById('slab-ln-short').value);
  const fy = parseFloat(document.getElementById('slab-fy').value);
  const fc = parseFloat(document.getElementById('slab-fc').value);
  const type = document.getElementById('slab-type').value;
  const panel = document.getElementById('slab-panel').value;
  const drops = document.getElementById('slab-drops').value;
  const c1 = parseFloat(document.getElementById('slab-c1').value);
  const c2 = parseFloat(document.getElementById('slab-c2').value);
  const ll = parseFloat(document.getElementById('slab-ll').value);
  const sdl = parseFloat(document.getElementById('slab-sdl').value);
  const normalWeight = document.getElementById('slab-normal-weight').value;

  if (isNaN(lnLong) || lnLong <= 0 || isNaN(lnShort) || lnShort <= 0 || isNaN(c1) || c1 <= 0 || isNaN(c2) || c2 <= 0 || isNaN(ll) || ll < 0 || isNaN(sdl) || sdl < 0) {
    alert('Please enter valid input parameters before downloading the PDF report.');
    return;
  }

  // Thickness calculations
  let hCalc = 0;
  let hMin = 5.0;
  let factor = 30;
  let formulaStr = "";
  let methodStr = "";

  if (type !== 'with-beams') {
    methodStr = "ACI 318-19 Table 8.3.1.1 (Without Interior Beams)";
    hMin = (drops === 'yes') ? 4.0 : 5.0;
    
    if (fy === 40000) {
      if (drops === 'no') {
        factor = (panel === 'exterior-no-edge') ? 33 : 36;
      } else {
        factor = (panel === 'exterior-no-edge') ? 36 : 40;
      }
    } else if (fy === 60000) {
      if (drops === 'no') {
        factor = (panel === 'exterior-no-edge') ? 30 : 33;
      } else {
        factor = (panel === 'exterior-no-edge') ? 33 : 36;
      }
    } else {
      if (drops === 'no') {
        factor = (panel === 'exterior-no-edge') ? 28 : 31;
      } else {
        factor = (panel === 'exterior-no-edge') ? 31 : 34;
      }
    }
    hCalc = (lnLong * 12) / factor;
    formulaStr = `h = ln / ${factor}`;
  } else {
    methodStr = "ACI 318-19 Section 8.3.1.2 (With Interior Beams)";
    const alpha = parseFloat(document.getElementById('slab-alpha-fm').value) || 1.5;
    const beta = parseFloat(document.getElementById('slab-beta-val').value) || (lnLong / lnShort);
    
    if (alpha <= 0.2) {
      hMin = (drops === 'yes') ? 4.0 : 5.0;
      if (fy === 40000) {
        factor = (panel === 'exterior-no-edge') ? 33 : 36;
      } else if (fy === 60000) {
        factor = (panel === 'exterior-no-edge') ? 30 : 33;
      } else {
        factor = (panel === 'exterior-no-edge') ? 28 : 31;
      }
      hCalc = (lnLong * 12) / factor;
      formulaStr = `h = ln / ${factor} (since αfm <= 0.2)`;
    } else if (alpha > 0.2 && alpha <= 2.0) {
      hMin = 5.0;
      hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 5 * beta * (alpha - 0.2));
      formulaStr = `h = ln * (0.8 + fy/200,000) / [36 + 5*β*(αfm - 0.2)]`;
    } else {
      hMin = 3.5;
      hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 9 * beta);
      formulaStr = `h = ln * (0.8 + fy/200,000) / [36 + 9*β]`;
    }
  }

  let hFinal = Math.max(hCalc, hMin);
  hFinal = Math.ceil(hFinal * 2) / 2;

  // Load calculations
  const concDensity = (normalWeight === 'yes') ? 150 : 110;
  const selfWeight = (hFinal / 12) * concDensity;
  const totalDL = sdl + selfWeight;
  const factoredQu = (1.2 * totalDL) + (1.6 * ll);

  // Static moments
  const l1 = lnLong + c1 / 12;
  const l2 = lnShort + c2 / 12;
  const Mol = (factoredQu * l2 * Math.pow(lnLong, 2)) / 8 / 1000;
  const Mos = (factoredQu * l1 * Math.pow(lnShort, 2)) / 8 / 1000;

  // Moment splits
  let extNegCoeff = 0.26;
  let posCoeff = 0.52;
  let intNegCoeff = 0.70;

  if (panel === 'interior') {
    extNegCoeff = 0.65;
    posCoeff = 0.35;
    intNegCoeff = 0.65;
  } else if (panel === 'exterior-edge') {
    extNegCoeff = 0.30;
    posCoeff = 0.50;
    intNegCoeff = 0.70;
  } else if (type === 'with-beams') {
    extNegCoeff = 0.16;
    posCoeff = 0.57;
    intNegCoeff = 0.70;
  }

  const getMoments = (MoVal) => {
    let neg, pos;
    if (panel === 'interior') {
      neg = 0.65 * MoVal;
      pos = 0.35 * MoVal;
    } else {
      neg = intNegCoeff * MoVal;
      pos = posCoeff * MoVal;
    }
    return { neg, pos };
  };

  const longMoments = getMoments(Mol);
  const shortMoments = getMoments(Mos);

  const lColNeg = longMoments.neg * 0.75;
  const lColPos = longMoments.pos * 0.60;
  const lMidNeg = longMoments.neg * 0.25;
  const lMidPos = longMoments.pos * 0.40;

  const sColNeg = shortMoments.neg * 0.75;
  const sColPos = shortMoments.pos * 0.60;
  const sMidNeg = shortMoments.neg * 0.25;
  const sMidPos = shortMoments.pos * 0.40;

  // Reinforcement design
  const bColFt = 0.5 * Math.min(l1, l2);
  const bMidLongFt = l2 - bColFt;
  const bMidShortFt = l1 - bColFt;

  const bColIn = bColFt * 12;
  const bMidLongIn = bMidLongFt * 12;
  const bMidShortIn = bMidShortFt * 12;

  const dLong = hFinal - 1.25;
  const dShort = hFinal - 1.75;

  const dLColNeg = getRebarDesign(lColNeg, bColIn, dLong, hFinal, fc, fy);
  const dLColPos = getRebarDesign(lColPos, bColIn, dLong, hFinal, fc, fy);
  const dLMidNeg = getRebarDesign(lMidNeg, bMidLongIn, dLong, hFinal, fc, fy);
  const dLMidPos = getRebarDesign(lMidPos, bMidLongIn, dLong, hFinal, fc, fy);

  const dSColNeg = getRebarDesign(sColNeg, bColIn, dShort, hFinal, fc, fy);
  const dSColPos = getRebarDesign(sColPos, bColIn, dShort, hFinal, fc, fy);
  const dSMidNeg = getRebarDesign(sMidNeg, bMidShortIn, dShort, hFinal, fc, fy);
  const dSMidPos = getRebarDesign(sMidPos, bMidShortIn, dShort, hFinal, fc, fy);

  // Shear checks
  const dAvg = hFinal - 1.5;
  const bo = 2 * (c1 + dAvg) + 2 * (c2 + dAvg);
  const punchVu = factoredQu * (l1 * l2 - (c1 + dAvg) * (c2 + dAvg) / 144) / 1000;
  const lambda = (normalWeight === 'yes') ? 1.0 : 0.75;
  const punchVc = 4 * lambda * Math.sqrt(fc) * bo * dAvg / 1000;
  const phiPunchVc = 0.75 * punchVc;

  const owVu = factoredQu * (lnLong / 2 - dAvg / 12) / 1000;
  const owVc = 2 * lambda * Math.sqrt(fc) * 12 * dAvg / 1000;
  const phiOwVc = 0.75 * owVc;

  const punchPass = phiPunchVc >= punchVu;
  const owPass = phiOwVc >= owVu;

  // Sync to database
  syncLeadDataBeforeDownload(Mol, Mos, hFinal, factoredQu);

  // Start PDF Generation
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  const drawBorder = (pageNo) => {
    doc.setDrawColor(201, 168, 76); // Gold border
    doc.setLineWidth(0.015);
    doc.rect(0.25, 0.25, 8.0, 10.5);
    
    // Page bottom note
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text('TwinAnalytic Engineering Group — Calculations Sheet S-102', 0.5, 10.5);
    doc.text(`Page ${pageNo} of 8`, 7.2, 10.5);
  };

  // ==========================================
  // PAGE 1 — COVER PAGE
  // ==========================================
  doc.setDrawColor(201, 168, 76);
  doc.rect(0.25, 0.25, 8.0, 10.5);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  doc.text('TWO-WAY SLAB DESIGN REPORT', 4.25, 2.5, { align: 'center' });

  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('As per ACI 318 Building Code Requirements', 4.25, 3.0, { align: 'center' });

  // Grid box for project info
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.01);
  doc.rect(1.5, 4.5, 5.5, 3.2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);

  const metaRows = [
    ['PROJECT NAME:', projName],
    ['DESIGNED BY:', designer],
    ['DATE:', dateVal],
    ['PROJECT LOCATION:', location],
    ['FLOOR LEVEL:', floor]
  ];

  let metaY = 4.9;
  metaRows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 1.8, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(val, 3.8, metaY);
    metaY += 0.5;
  });

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('TwinAnalytic', 4.25, 9.2, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Precision Engineering & Digital Twins', 4.25, 9.45, { align: 'center' });

  // ==========================================
  // PAGE 2 — DESIGN PARAMETERS SUMMARY
  // ==========================================
  doc.addPage();
  drawBorder(2);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('1. DESIGN PARAMETERS SUMMARY', 0.5, 0.7);
  doc.line(0.5, 0.78, 8.0, 0.78);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);

  const paramTable = [
    ['Long Clear Span (ln,long)', `${lnLong} ft`, 'Short Clear Span (ln,short)', `${lnShort} ft`],
    ['Long Span c-to-c (l1)', `${l1.toFixed(2)} ft`, 'Short Span c-to-c (l2)', `${l2.toFixed(2)} ft`],
    ['Steel Strength (fy)', `${fy} psi`, 'Concrete Strength (f\'c)', `${fc} psi`],
    ['Slab System Type', type === 'flat-plate' ? 'Flat Plate' : type === 'flat-slab' ? 'Flat Slab' : 'Continuous Beams', 'Panel Boundary Condition', panel === 'interior' ? 'Interior Panel' : 'Exterior Panel'],
    ['Drop Panels present', drops === 'yes' ? 'Yes' : 'No', 'Column dimensions (c1 x c2)', `${c1}" x ${c2}"`],
    ['Service Live Load', `${ll} psf`, 'Service Superimposed Dead Load', `${sdl} psf`],
    ['Slab Self-Weight', `${selfWeight.toFixed(1)} psf`, 'Total Factored Load (qu)', `${factoredQu.toFixed(1)} psf`],
    ['Normal Weight Concrete', normalWeight === 'yes' ? 'Yes' : 'No (Lightweight)', 'Calculated Span Ratio (β)', (lnLong / lnShort).toFixed(2)]
  ];

  let py = 1.2;
  doc.setLineWidth(0.008);
  doc.setDrawColor(220, 220, 220);

  paramTable.forEach(([l1, v1, l2, v2]) => {
    // Left Parameter
    doc.setFont('helvetica', 'bold');
    doc.text(l1, 0.6, py);
    doc.setFont('helvetica', 'normal');
    doc.text(v1, 2.8, py);

    // Right Parameter
    doc.setFont('helvetica', 'bold');
    doc.text(l2, 4.3, py);
    doc.setFont('helvetica', 'normal');
    doc.text(v2, 6.7, py);

    doc.line(0.5, py + 0.12, 8.0, py + 0.12);
    py += 0.42;
  });

  // ==========================================
  // PAGE 3 — SLAB THICKNESS CALCULATION
  // ==========================================
  doc.addPage();
  drawBorder(3);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('2. CODE SLAB THICKNESS SIZING & COMPLIANCE', 0.5, 0.7);
  doc.line(0.5, 0.78, 8.0, 0.78);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Step 3.1: Governing ACI Section Selection', 0.5, 1.2);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Based on the slab system type: "${type === 'with-beams' ? 'With Continuous Beams' : 'Without Interior Beams'}":`, 0.5, 1.45);
  doc.setFont('helvetica', 'bold');
  doc.text(methodStr, 0.5, 1.7);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Step 3.2: Formula & Parameter Substitution', 0.5, 2.2);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text('Symbolic Equation:', 0.5, 2.5);
  doc.setFont('courier', 'bold');
  doc.text(formulaStr, 0.5, 2.72);

  doc.setFont('helvetica', 'normal');
  doc.text('Value Substitution:', 0.5, 3.1);
  doc.setFont('courier', 'bold');
  const splitSub = doc.splitTextToSize(subStr, 7.0);
  doc.text(splitSub, 0.5, 3.32);

  let curY = 3.32 + splitSub.length * 0.22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Step 3.3: Minimum Slab Thickness Limits', 0.5, curY);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`- ACI Code absolute minimum slab thickness for this layout = ${hMin.toFixed(1)} inches.`, 0.5, curY + 0.25);
  doc.text(`- Calculated required slab thickness = ${hCalc.toFixed(2)} inches.`, 0.5, curY + 0.45);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Step 3.4: Final Adopted Member Thickness', 0.5, curY + 0.9);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const adoptedJustification = `The design requires an adopted thickness that exceeds both the calculated requirement and the absolute minimum limits. The adopted slab thickness is rounded to the nearest 0.5 inches for constructability.`;
  const splitJust = doc.splitTextToSize(adoptedJustification, 7.0);
  doc.text(splitJust, 0.5, curY + 1.15);

  doc.setDrawColor(201, 168, 76);
  doc.rect(0.5, curY + 1.8, 7.5, 0.75);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('ADOPTED SLAB THICKNESS (h):', 0.7, curY + 2.15);
  doc.setFontSize(18);
  doc.setTextColor(30, 120, 30);
  doc.text(`${hFinal.toFixed(1)} inches`, 0.7, curY + 2.45);

  // ==========================================
  // PAGE 4 — LOAD & MOMENT CALCULATIONS
  // ==========================================
  doc.addPage();
  drawBorder(4);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('3. LOADS & DIRECT DESIGN MOMENTS', 0.5, 0.7);
  doc.line(0.5, 0.78, 8.0, 0.78);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Step 4.1: Factored Load Sizing (qu)', 0.5, 1.2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`- Concrete density is assumed as ${concDensity} pcf (${normalWeight === 'yes' ? 'Normal Weight' : 'Lightweight'}).`, 0.5, 1.45);
  doc.text(`- Self-Weight = (${hFinal.toFixed(1)}" / 12) * ${concDensity} pcf = ${selfWeight.toFixed(1)} psf`, 0.5, 1.65);
  doc.text(`- Total DL = SDL (${sdl} psf) + Self-Weight = ${totalDL.toFixed(1)} psf`, 0.5, 1.85);
  doc.text(`- qu = 1.2 * DL + 1.6 * LL = 1.2 * ${totalDL.toFixed(1)} + 1.6 * ${ll} = ${factoredQu.toFixed(1)} psf`, 0.5, 2.05);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Step 4.2: Total Statical Moment Sizing (Mo)', 0.5, 2.6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Longitudinal spans are sized for l1 = ${l1.toFixed(2)} ft (ln = ${lnLong.toFixed(1)} ft).`, 0.5, 2.85);
  doc.text(`Transverse spans are sized for l2 = ${l2.toFixed(2)} ft (ln = ${lnShort.toFixed(1)} ft).`, 0.5, 3.05);

  doc.setFont('helvetica', 'bold');
  doc.text(`Long Direction (Mol):`, 0.5, 3.35);
  doc.setFont('courier', 'bold');
  doc.text(`Mol = qu * l2 * ln_long² / 8`, 0.6, 3.55);
  doc.text(`    = ${factoredQu.toFixed(1)} * ${l2.toFixed(2)} * ${lnLong}² / 8000 = ${Mol.toFixed(2)} k-ft`, 0.6, 3.75);

  doc.setFont('helvetica', 'bold');
  doc.text(`Short Direction (Mos):`, 0.5, 4.15);
  doc.setFont('courier', 'bold');
  doc.text(`Mos = qu * l1 * ln_short² / 8`, 0.6, 4.35);
  doc.text(`    = ${factoredQu.toFixed(1)} * ${l1.toFixed(2)} * ${lnShort}² / 8000 = ${Mos.toFixed(2)} k-ft`, 0.6, 4.55);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Step 4.3: Moment Distribution Coefficients', 0.5, 5.15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`Distribution coefficients based on panel boundaries (ACI 318 Table 8.10.5.1):`, 0.5, 5.4);
  doc.text(`- Interior negative moment coefficient = ${panel === 'interior' ? '0.65' : '0.70'}`, 0.5, 5.6);
  doc.text(`- Positive moment coefficient = ${panel === 'interior' ? '0.35' : posCoeff.toFixed(2)}`, 0.5, 5.8);
  doc.text(`- Exterior negative moment coefficient = ${panel === 'interior' ? 'N/A' : extNegCoeff.toFixed(2)}`, 0.5, 6.0);

  // ==========================================
  // PAGE 5 — REINFORCEMENT DESIGN
  // ==========================================
  doc.addPage();
  drawBorder(5);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('4. FLEXURAL REINFORCEMENT DESIGN', 0.5, 0.7);
  doc.line(0.5, 0.78, 8.0, 0.78);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DESIGN FORMULAS:', 0.5, 1.15);
  doc.setFont('courier', 'normal');
  doc.setFontSize(8.5);
  doc.text(`Ru = Mu / (0.9 * b * d²),   ρ = (0.85 * f'c / fy) * [1 - √(1 - 2*Ru / (0.85*f'c))]`, 0.5, 1.35);
  doc.text(`As,req = ρ * b * d,          As,min = ${fy <= 40000 ? '0.0020' : '0.0018'} * b * h`, 0.5, 1.55);

  // Table header
  let ry = 1.95;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  
  doc.text('Strip & Zone', 0.5, ry);
  doc.text('Mu (k-ft)', 2.5, ry);
  doc.text('d (in)', 3.3, ry);
  doc.text('As Req', 4.0, ry);
  doc.text('As Min', 4.7, ry);
  doc.text('As Used', 5.4, ry);
  doc.text('Rebar detail', 6.2, ry);
  doc.text('Bars', 7.4, ry);
  doc.line(0.5, ry + 0.05, 8.0, ry + 0.05);

  const rowsData = [
    ['Col Strip Top (Long)', lColNeg, dLong, dLColNeg],
    ['Col Strip Bot (Long)', lColPos, dLong, dLColPos],
    ['Mid Strip Top (Long)', lMidNeg, dLong, dLMidNeg],
    ['Mid Strip Bot (Long)', lMidPos, dLong, dLMidPos],
    ['Col Strip Top (Short)', sColNeg, dShort, dSColNeg],
    ['Col Strip Bot (Short)', sColPos, dShort, dSColPos],
    ['Mid Strip Top (Short)', sMidNeg, dShort, dSMidNeg],
    ['Mid Strip Bot (Short)', sMidPos, dShort, dSMidPos]
  ];

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  rowsData.forEach(([zone, MuVal, dVal, design]) => {
    ry += 0.32;
    doc.setFont('helvetica', 'bold');
    doc.text(zone, 0.5, ry);
    doc.setFont('helvetica', 'normal');
    doc.text(MuVal.toFixed(1), 2.5, ry);
    doc.text(dVal.toFixed(2), 3.3, ry);
    doc.text(design.req.toFixed(2), 4.0, ry);
    doc.text(design.min.toFixed(2), 4.7, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(201, 168, 76);
    doc.text(design.gov.toFixed(2), 5.4, ry);
    doc.text(`${design.size} @ ${design.spacing.toFixed(1)}" c/c`, 6.2, ry);
    doc.setTextColor(60, 60, 60);
    doc.text(`${design.num}`, 7.4, ry);
    doc.line(0.5, ry + 0.08, 8.0, ry + 0.08);
  });

  // ==========================================
  // PAGE 6 — SHEAR VERIFICATION
  // ==========================================
  doc.addPage();
  drawBorder(6);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('5. SHEAR STRENGTH VERIFICATIONS', 0.5, 0.7);
  doc.line(0.5, 0.78, 8.0, 0.78);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('5.1 Two-Way Punching Shear (ACI 318 Section 22.6)', 0.5, 1.25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`- Average effective depth: d_avg = h - 1.5" = ${dAvg.toFixed(2)} in`, 0.5, 1.5);
  doc.text(`- Column Size: c1 x c2 = ${c1} x ${c2} in`, 0.5, 1.7);
  doc.text(`- Critical perimeter bo = 2*(c1 + d) + 2*(c2 + d) = ${bo.toFixed(1)} in`, 0.5, 1.9);
  
  doc.text(`Factored punching shear force:`, 0.5, 2.2);
  doc.setFont('courier', 'bold');
  doc.text(`Vu = qu * (l1 * l2 - (c1 + d)*(c2 + d)/144)`, 0.6, 2.4);
  doc.text(`   = ${punchVu.toFixed(1)} kips`, 0.6, 2.6);

  doc.setFont('helvetica', 'normal');
  doc.text(`Nominal punching shear capacity (governed by 4*lambda*√f'c):`, 0.5, 2.9);
  doc.setFont('courier', 'bold');
  doc.text(`φVc = 0.75 * 4 * λ * √f'c * bo * d`, 0.6, 3.1);
  doc.text(`    = ${phiPunchVc.toFixed(1)} kips`, 0.6, 3.3);

  doc.setFont('helvetica', 'bold');
  doc.text(`Punching Shear Status:`, 0.5, 3.65);
  if (punchPass) {
    doc.setTextColor(30, 150, 30);
    doc.text('PASS (φVc >= Vu)', 2.3, 3.65);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('FAIL (φVc < Vu)', 2.3, 3.65);
  }
  doc.setTextColor(60, 60, 60);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('5.2 One-Way Beam Shear (ACI 318 Section 22.5)', 0.5, 4.25);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`One-way shear is checked on a 12-inch wide strip at a distance 'd' from column face.`, 0.5, 4.5);

  doc.setFont('courier', 'bold');
  doc.text(`Vu1 = qu * (ln_long/2 - d/12) = ${owVu.toFixed(2)} kips`, 0.6, 4.75);
  doc.text(`φVc = 0.75 * 2 * λ * √f'c * 12 * d = ${phiOwVc.toFixed(2)} kips`, 0.6, 4.95);

  doc.setFont('helvetica', 'bold');
  doc.text(`One-Way Shear Status:`, 0.5, 5.3);
  if (owPass) {
    doc.setTextColor(30, 150, 30);
    doc.text('PASS (φVc >= Vu1)', 2.3, 5.3);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('FAIL (φVc < Vu1)', 2.3, 5.3);
  }
  doc.setTextColor(60, 60, 60);

  // Critical perimeter text description
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('5.3 Critical Perimeter Description', 0.5, 5.9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const criticalText = `The critical perimeter for two-way punching shear is located at a distance d/2 from the face of the column. This forms a rectangle of dimensions (c1 + d) by (c2 + d) centered on the column. Concrete shear strength is checked along this boundary.`;
  const splitCrit = doc.splitTextToSize(criticalText, 7.0);
  doc.text(splitCrit, 0.5, 6.15);

  // ==========================================
  // PAGE 7 — REINFORCEMENT DETAILING DIAGRAM
  // ==========================================
  doc.addPage();
  drawBorder(7);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('6. REINFORCEMENT DETAILING DIAGRAM', 0.5, 0.7);
  doc.line(0.5, 0.78, 8.0, 0.78);

  // Top view
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.008);
  doc.rect(0.5, 1.2, 3.4, 2.8); // Panel top view

  // Boundaries for strips
  doc.setDrawColor(180, 180, 180);
  doc.setLineDashPattern([0.05, 0.05], 0);
  doc.line(1.35, 1.2, 1.35, 4.0);
  doc.line(3.05, 1.2, 3.05, 4.0);
  doc.line(0.5, 1.9, 3.9, 1.9);
  doc.line(0.5, 3.3, 3.9, 3.3);
  doc.setLineDashPattern([], 0); // Reset dash

  // Column square in center
  doc.setFillColor(60, 60, 60);
  doc.rect(2.0, 2.4, 0.4, 0.4, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.5);
  doc.setTextColor(60, 60, 60);
  doc.text('COLUMN STRIP', 1.8, 1.6);
  doc.text('MIDDLE STRIP', 0.6, 2.6);
  doc.text('COLUMN STRIP', 1.8, 3.7);

  doc.setFontSize(8);
  doc.text('TOP VIEW - PANEL ZONES', 0.5, 4.25);

  // Section A-A (Long direction)
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.015);
  doc.line(4.5, 1.6, 7.8, 1.6); // Slab top line
  doc.line(4.5, 2.2, 7.8, 2.2); // Slab bottom line
  doc.line(4.5, 1.6, 4.5, 2.2); // End support
  doc.line(7.8, 1.6, 7.8, 2.2); // End support
  
  // Rebar details - top bars
  doc.setDrawColor(220, 50, 50); // Red for rebar
  doc.setLineWidth(0.02);
  doc.line(4.5, 1.7, 5.2, 1.7); // top bar left
  doc.line(7.1, 1.7, 7.8, 1.7); // top bar right
  // Bottom bars
  doc.line(4.55, 2.1, 7.75, 2.1); // bottom bars continuous

  // Support column sketch
  doc.setFillColor(240, 240, 240);
  doc.setDrawColor(80, 80, 80);
  doc.rect(5.9, 2.2, 0.5, 0.8, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(30, 30, 30);
  doc.text('SECTION A-A (LONG DIRECTION)', 4.5, 1.4);
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Top Bars: extend 0.22ln', 4.55, 3.2);
  doc.text('Bottom Bars: 6" into support', 4.55, 3.4);

  // Detailing Table at the bottom
  let dty = 4.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(201, 168, 76);
  doc.text('REINFORCEMENT DETAILED EXTENSIONS', 0.5, dty);
  doc.line(0.5, dty + 0.05, 8.0, dty + 0.05);

  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  
  dty += 0.3;
  doc.setFont('helvetica', 'bold');
  doc.text('Slab Reinforcement Component', 0.6, dty);
  doc.text('ACI 318 Standard Extension Lengths', 4.0, dty);
  doc.line(0.5, dty + 0.05, 8.0, dty + 0.05);

  const detailRows = [
    ['Top bars at interior supports', 'Extend minimum 0.22 * ln beyond face of support'],
    ['Top bars at exterior supports', 'Extend minimum 0.15 * ln beyond face of support'],
    ['Bottom continuous reinforcement', 'Extend minimum 6 inches into support lines'],
    ['Bottom non-continuous reinforcement', 'Extend ln / 3 past midspan minimum'],
    ['At least 2 bottom bars', 'Must remain continuous through support boundary']
  ];

  detailRows.forEach(([lbl, desc]) => {
    dty += 0.26;
    doc.setFont('helvetica', 'bold');
    doc.text(lbl, 0.6, dty);
    doc.setFont('helvetica', 'normal');
    doc.text(desc, 4.0, dty);
  });

  // ==========================================
  // PAGE 8 — SUMMARY & CONCLUSION
  // ==========================================
  doc.addPage();
  drawBorder(8);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('7. DESIGN SUMMARY & CONCLUSION', 0.5, 0.7);
  doc.line(0.5, 0.78, 8.0, 0.78);

  // Table header
  let sy = 1.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text('Structural Item', 0.6, sy);
  doc.text('Calculated Sizing Value', 3.3, sy);
  doc.text('Adopted Design Value', 5.8, sy);
  doc.line(0.5, sy + 0.05, 8.0, sy + 0.05);

  const summaryData = [
    ['Slab Thickness (h)', `${hCalc.toFixed(2)} in`, `${hFinal.toFixed(1)} in`],
    ['Long Direction - Column Strip Top', `${dLColNeg.gov.toFixed(2)} in²`, `${dLColNeg.size} @ ${dLColNeg.spacing.toFixed(1)}" c/c`],
    ['Long Direction - Column Strip Bottom', `${dLColPos.gov.toFixed(2)} in²`, `${dLColPos.size} @ ${dLColPos.spacing.toFixed(1)}" c/c`],
    ['Long Direction - Middle Strip Top', `${dLMidNeg.gov.toFixed(2)} in²`, `${dLMidNeg.size} @ ${dLMidNeg.spacing.toFixed(1)}" c/c`],
    ['Long Direction - Middle Strip Bottom', `${dLMidPos.gov.toFixed(2)} in²`, `${dLMidPos.size} @ ${dLMidPos.spacing.toFixed(1)}" c/c`],
    ['Short Direction - Column Strip Top', `${dSColNeg.gov.toFixed(2)} in²`, `${dSColNeg.size} @ ${dSColNeg.spacing.toFixed(1)}" c/c`],
    ['Short Direction - Column Strip Bottom', `${dSColPos.gov.toFixed(2)} in²`, `${dSColPos.size} @ ${dSColPos.spacing.toFixed(1)}" c/c`],
    ['Short Direction - Middle Strip Top', `${dSMidNeg.gov.toFixed(2)} in²`, `${dSMidNeg.size} @ ${dSMidNeg.spacing.toFixed(1)}" c/c`],
    ['Short Direction - Middle Strip Bottom', `${dSMidPos.gov.toFixed(2)} in²`, `${dSMidPos.size} @ ${dSMidPos.spacing.toFixed(1)}" c/c`],
    ['Two-Way Punching Shear Check', `Vu = ${punchVu.toFixed(1)} kips`, punchPass ? 'PASS (Safe)' : 'FAIL (Resize)'],
    ['One-Way Beam Shear Check', `Vu1 = ${owVu.toFixed(2)} k/ft`, owPass ? 'PASS (Safe)' : 'FAIL (Resize)'],
    ['Span Aspect Ratio (ln,long/ln,short)', `${(lnLong/lnShort).toFixed(2)}`, (lnLong/lnShort <= 2.0) ? 'PASS (<= 2.0)' : 'FAIL (> 2.0)'],
    ['Live Load to Dead Load Ratio', `${(ll/totalDL).toFixed(2)}`, (ll <= 2 * totalDL) ? 'PASS (<= 2.0)' : 'FAIL (> 2.0)']
  ];

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  summaryData.forEach(([item, calc, adop]) => {
    sy += 0.28;
    doc.setFont('helvetica', 'bold');
    doc.text(item, 0.6, sy);
    doc.setFont('helvetica', 'normal');
    doc.text(calc, 3.3, sy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(201, 168, 76);
    doc.text(adop, 5.8, sy);
    doc.setTextColor(60, 60, 60);
    doc.line(0.5, sy + 0.05, 8.0, sy + 0.05);
  });

  // End design notes
  sy += 0.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(201, 168, 76);
  doc.text('CONCLUDING STRUCTURAL NOTES:', 0.5, sy);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  sy += 0.22;
  doc.text('* All reinforcement shall conform to ASTM A615 Grade 60.', 0.5, sy);
  sy += 0.18;
  doc.text('* Concrete clear cover to reinforcement = 3/4 inch.', 0.5, sy);
  sy += 0.18;
  doc.text('* Design based on ACI 318 Building Code Requirements.', 0.5, sy);

  // Signatures
  sy += 0.5;
  doc.setLineWidth(0.008);
  doc.setDrawColor(100, 100, 100);
  doc.line(0.7, sy + 0.5, 2.7, sy + 0.5);
  doc.line(5.3, sy + 0.5, 7.3, sy + 0.5);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.text('DESIGNER SIGNATURE', 1.0, sy + 0.65);
  doc.text('REVIEWER SIGNATURE', 5.6, sy + 0.65);

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
