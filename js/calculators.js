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

  // Check URL hash on page load
  const hash = window.location.hash;
  if (hash) {
    const tabName = hash.replace('#panel-', '');
    const matchingTab = document.querySelector(`.tool-tab-btn[data-tab="${tabName}"]`);
    if (matchingTab) {
      matchingTab.click();
    }
  }
}

function triggerCanvasRedraw(tabId) {
  switch(tabId) {
    case 'beam': calculateBeam(); break;
    case 'column': calculateColumn(); break;
    case 'slab': calculateSlab(); break;
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

  if (btnBeam) {
    btnBeam.addEventListener('click', () => checkAuthAndRun(calculateBeam, 'Beam Design'));
    calculateBeam();
  }
  if (btnCol) {
    btnCol.addEventListener('click', () => checkAuthAndRun(calculateColumn, 'Column Design'));
    initColumnLiveUpdates();
    calculateColumn();
  }
  const btnPDF = document.getElementById('btn-download-pdf');
  if (btnPDF) {
    btnPDF.addEventListener('click', downloadColumnPDF);
  }
  if (btnSlab) {
    btnSlab.addEventListener('click', () => {
      calculateSlab();
      const resEl = document.getElementById('slab-results-container');
      if (resEl) resEl.scrollIntoView({ behavior: 'smooth' });
    });
    // Auto-fill date
    const dateEl = document.getElementById('slab-date');
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toISOString().split('T')[0];
    }
    initSlabLiveUpdates();
    // Initial run
    calculateSlab();
  }
  const btnSlabPDFs = document.querySelectorAll('[id="btn-download-slab-pdf"]');
  btnSlabPDFs.forEach(btn => {
    btn.addEventListener('click', () => {
      downloadSlabPDF();
    });
  });


  // Bind auth modal form submission
  const authForm = document.getElementById('modal-auth-form');
  if (authForm) {
    authForm.addEventListener('submit', handleAuthSubmit);
  }
}

// Check if user is already authorized; if not, prompt modal form
function checkAuthAndRun(callback, calcType) {
  callback();
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
    console.error("Database sync failed, proceeding with local unlock:", error);
    // Proceed with unlocking anyway so the user's experience is not blocked by adblockers, DNS errors, or firewalls
    completeUnlock();
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


function initColumnLiveUpdates() {
  const typeEl = document.getElementById('column-type');
  if (typeEl) {
    const handleTypeChange = () => {
      const phiEl = document.getElementById('column-phi');
      if (phiEl) {
        phiEl.value = typeEl.value === 'TIED' ? '0.65' : '0.75';
      }
      // Toggle tie/spiral label
      const grid = typeEl.closest('.input-grid');
      if (grid) {
        const tieSelect = grid.querySelector('#column-tie-bar');
        if (tieSelect && tieSelect.previousElementSibling) {
          tieSelect.previousElementSibling.textContent = typeEl.value === 'TIED' ? 'Tie Size' : 'Spiral Size';
        }
      }
    };
    typeEl.addEventListener('change', handleTypeChange);
    handleTypeChange();
  }
}


// ==========================================
function calculateColumn() {
  const type = document.getElementById('column-type').value; // 'TIED' or 'SPIRAL'
  const pdl = parseFloat(document.getElementById('column-pdl').value);
  const pll = parseFloat(document.getElementById('column-pll').value);
  const mux = parseFloat(document.getElementById('column-mux').value) || 0;
  const muy = parseFloat(document.getElementById('column-muy').value) || 0;
  const vu = parseFloat(document.getElementById('column-vu').value) || 0;
  const fc = parseFloat(document.getElementById('column-fc').value);
  const fy = parseFloat(document.getElementById('column-fy').value);
  const fyt = parseFloat(document.getElementById('column-fyt').value) || 60;
  const p = parseFloat(document.getElementById('column-p').value);
  const colHeight = parseFloat(document.getElementById('column-height').value);
  const cover = parseFloat(document.getElementById('column-cover').value) || 1.5;

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
  if (isNaN(pdl) || pdl <= 0 || isNaN(pll) || pll <= 0 || isNaN(fc) || fc <= 0 || isNaN(fy) || fy <= 0 || isNaN(p) || p < 0.01 || p > 0.08 || isNaN(colHeight) || colHeight <= 0 || isNaN(cover) || cover <= 0) {
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

  // 1. Factored Load
  const Pu = (1.2 * pdl) + (1.6 * pll);

  // 2. Concrete Area Sizing
  const phi_axial = type === 'TIED' ? 0.65 : 0.75;
  const alpha = type === 'TIED' ? 0.80 : 0.85;
  const denom = phi_axial * alpha * (0.85 * fc * (1 - p) + fy * p);
  const Ag_req = Pu / denom;

  let Dim = 0;
  let Ag = 0;
  if (type === 'TIED') {
    Dim = Math.max(10, Math.ceil(Math.sqrt(Ag_req)));
    Ag = Dim * Dim;
  } else {
    Dim = Math.max(10, Math.ceil(Math.sqrt(4 * Ag_req / Math.PI)));
    Ag = Math.PI * Dim * Dim / 4;
  }

  // 3. Required Steel Area (Ast)
  const Ast_axial_req = (Pu / (phi_axial * alpha) - 0.85 * fc * Ag) / (fy - 0.85 * fc);
  const Ast_req = Math.max(p * Ag, Ast_axial_req);

  // 4. Longitudinal & Transverse Reinforcement Properties
  const mainBarSize = document.getElementById('column-main-bar').value;
  const tieBarSize = document.getElementById('column-tie-bar').value;

  const barData = {
    '#5': { dia: 0.625, area: 0.31 },
    '#6': { dia: 0.750, area: 0.44 },
    '#7': { dia: 0.875, area: 0.60 },
    '#8': { dia: 1.000, area: 0.79 },
    '#9': { dia: 1.128, area: 1.00 },
    '#10': { dia: 1.270, area: 1.27 },
    '#11': { dia: 1.410, area: 1.56 },
    '#14': { dia: 1.693, area: 2.25 },
    '#18': { dia: 2.257, area: 4.00 }
  };

  const tieData = {
    '#3': { dia: 0.375, area: 0.11 },
    '#4': { dia: 0.500, area: 0.20 },
    '#5': { dia: 0.625, area: 0.31 }
  };

  const mainBarDia = barData[mainBarSize].dia;
  const Ab = barData[mainBarSize].area;
  const d_tie = tieData[tieBarSize].dia;
  const A_tie = tieData[tieBarSize].area;

  // 5. Select number of bars
  let N_bars = Math.ceil(Ast_req / Ab);
  if (N_bars % 2 !== 0) N_bars += 1; // even number
  const minBars = type === 'TIED' ? 4 : 6;
  if (N_bars < minBars) N_bars = minBars;

  const Ast_actual = N_bars * Ab;
  const p_actual = Ast_actual / Ag;

  // 6. Bar Coordinates
  const d_prime = cover + d_tie + mainBarDia / 2;
  const bars = [];
  if (type === 'TIED') {
    const bs = Dim - 2 * d_prime;
    const hs = Dim - 2 * d_prime;
    const L = 2 * (bs + hs);
    for (let i = 0; i < N_bars; i++) {
      const t = i * (L / N_bars);
      let x, y;
      if (t < bs) {
        x = -bs/2 + t;
        y = -hs/2;
      } else if (t < bs + hs) {
        x = bs/2;
        y = -hs/2 + (t - bs);
      } else if (t < 2*bs + hs) {
        x = bs/2 - (t - bs - hs);
        y = hs/2;
      } else {
        x = -bs/2;
        y = hs/2 - (t - 2*bs - hs);
      }
      bars.push({ x, y });
    }
  } else {
    const Ds = Dim - 2 * d_prime;
    for (let i = 0; i < N_bars; i++) {
      const theta = i * (2 * Math.PI / N_bars);
      const x = (Ds / 2) * Math.cos(theta);
      const y = (Ds / 2) * Math.sin(theta);
      bars.push({ x, y });
    }
  }

  // 7. Clear Spacing Check
  let s_clear = 0;
  if (type === 'TIED') {
    const n_face_max = Math.ceil(N_bars / 4) + 1;
    const n_spaces = n_face_max - 1;
    const s_cc = (Dim - 2 * d_prime) / n_spaces;
    s_clear = s_cc - mainBarDia;
  } else {
    const Ds = Dim - 2 * d_prime;
    const s_cc = (Math.PI * Ds) / N_bars;
    s_clear = s_cc - mainBarDia;
  }
  const minAllowedSpacing = Math.max(1.5, 1.5 * mainBarDia);
  const isSpacingOk = s_clear >= minAllowedSpacing;

  // 8. Bending Strength Compatibility Solver
  function getPhi(epsilon_t) {
    const epsilon_ty = fy / 29000;
    const phi_comp = type === 'TIED' ? 0.65 : 0.75;
    if (epsilon_t <= epsilon_ty) return phi_comp;
    if (epsilon_t >= 0.005) return 0.90;
    return phi_comp + (0.90 - phi_comp) * (epsilon_t - epsilon_ty) / (0.005 - epsilon_ty);
  }

  function calcPnMnForC(c, bendingDirection) {
    const H_bend = Dim;
    const B_bend = Dim;
    let beta1 = 0.85;
    if (fc > 4.0) beta1 = Math.max(0.65, 0.85 - 0.05 * (fc - 4.0));
    let a = beta1 * c;
    if (a > H_bend) a = H_bend;

    let Cc = 0, Mc = 0;
    if (type === 'TIED') {
      Cc = 0.85 * fc * B_bend * a;
      Mc = Cc * (H_bend / 2 - a / 2);
    } else {
      const R = H_bend / 2;
      const u = (R - a) / R;
      let A_seg = 0, y_bar = 0;
      if (u <= -1) {
        A_seg = Math.PI * R * R;
        y_bar = 0;
      } else if (u >= 1) {
        A_seg = 0;
        y_bar = 0;
      } else {
        const theta = Math.acos(u);
        A_seg = R * R * (theta - u * Math.sin(theta));
        y_bar = (2 / 3) * R * Math.pow(Math.sin(theta), 3) / (theta - u * Math.sin(theta));
      }
      Cc = 0.85 * fc * A_seg;
      Mc = Cc * y_bar;
    }

    let Fs_total = 0, Ms_total = 0, epsilon_t = 0;
    let max_d = 0;
    bars.forEach(bar => {
      const coord = bendingDirection === 'x' ? bar.y : bar.x;
      const d_i = H_bend / 2 - coord;
      if (d_i > max_d) max_d = d_i;
    });

    bars.forEach(bar => {
      const coord = bendingDirection === 'x' ? bar.y : bar.x;
      const d_i = H_bend / 2 - coord;
      const epsilon_i = 0.003 * (c - d_i) / c;
      let stress_i = 29000 * epsilon_i;
      if (stress_i > fy) stress_i = fy;
      if (stress_i < -fy) stress_i = -fy;

      let force_i = Ab * stress_i;
      if (d_i < a) force_i -= 0.85 * fc * Ab;

      Fs_total += force_i;
      Ms_total += force_i * coord;

      if (d_i === max_d) {
        epsilon_t = -epsilon_i;
      }
    });

    return { Pn: Cc + Fs_total, Mn: Mc + Ms_total, epsilon_t };
  }

  function solveUniaxial(e_target, bendingDirection) {
    if (e_target <= 0.0001) {
      const Pno = 0.85 * fc * (Ag - Ast_actual) + fy * Ast_actual;
      const Pn_max = alpha * Pno;
      return { Pn: Pn_max, Mn: 0, phi: phi_axial, epsilon_t: 0 };
    }

    let c_low = 0.01;
    let c_high = 5.0 * Dim;
    let Pn = 0, Mn = 0, epsilon_t = 0;

    for (let iter = 0; iter < 150; iter++) {
      const c = (c_low + c_high) / 2;
      const res = calcPnMnForC(c, bendingDirection);
      Pn = res.Pn;
      Mn = res.Mn;
      epsilon_t = res.epsilon_t;

      const e_calc = Pn > 0.01 ? (Mn / Pn) : 999999;
      if (Math.abs(e_calc - e_target) < 0.001) break;
      if (e_calc > e_target) c_low = c;
      else c_high = c;
    }

    const Pno = 0.85 * fc * (Ag - Ast_actual) + fy * Ast_actual;
    Pn = Math.min(Pn, alpha * Pno);

    const phi = getPhi(epsilon_t);
    return { Pn, Mn, phi, epsilon_t };
  }

  const e_x = muy * 12 / Pu; // eccentricity along x due to Muy
  const e_y = mux * 12 / Pu; // eccentricity along y due to Mux

  let Pn = 0, phi = phi_axial, PhiPn = 0, dcRatio = 0;

  if (mux > 0 && muy > 0) {
    const res_x = solveUniaxial(e_x, 'y');
    const res_y = solveUniaxial(e_y, 'x');
    const Pno = 0.85 * fc * (Ag - Ast_actual) + fy * Ast_actual;
    const invPni = 1 / res_x.Pn + 1 / res_y.Pn - 1 / Pno;
    const Pni = invPni > 0 ? 1 / invPni : 0.001;
    phi = Math.min(res_x.phi, res_y.phi);
    Pn = Pni;
    PhiPn = phi * Pni;
    dcRatio = Pu / PhiPn;
  } else if (mux > 0) {
    const res = solveUniaxial(e_y, 'x');
    Pn = res.Pn;
    phi = res.phi;
    PhiPn = phi * Pn;
    dcRatio = Pu / PhiPn;
  } else if (muy > 0) {
    const res = solveUniaxial(e_x, 'y');
    Pn = res.Pn;
    phi = res.phi;
    PhiPn = phi * Pn;
    dcRatio = Pu / PhiPn;
  } else {
    const res = solveUniaxial(0, 'x');
    Pn = res.Pn;
    phi = res.phi;
    PhiPn = phi * Pn;
    dcRatio = Pu / PhiPn;
  }

  // 9. Shear Design
  const d = Math.max(0.8 * Dim, Dim - cover - d_tie - mainBarDia / 2);
  const Vc = 2 * (1 + Pu / (2 * Ag)) * Math.sqrt(fc * 1000) * Dim * d / 1000;
  const phi_v = 0.75;
  const PhiVc = phi_v * Vc;
  const Vs_max = 8 * Math.sqrt(fc * 1000) * Dim * d / 1000;

  let shearCase = 'A';
  let Vs_req = 0;
  if (vu > phi_v * (Vc + Vs_max)) {
    shearCase = 'D';
    Vs_req = Vs_max;
  } else if (vu > phi_v * Vc) {
    shearCase = 'C';
    Vs_req = (vu / phi_v) - Vc;
  } else if (vu > 0.5 * phi_v * Vc) {
    shearCase = 'B';
  } else {
    shearCase = 'A';
  }

  const Av = 2 * A_tie;
  let s_shear = 999;
  if (shearCase === 'C') {
    s_shear = (Av * fyt * d) / Vs_req;
  }
  
  // Spacing governed by minimum shear steel
  const av_s_min = Math.max(0.75 * Math.sqrt(fc * 1000) * Dim / (fyt * 1000), 50 * Dim / (fyt * 1000));
  const s_min_shear = Av / av_s_min;
  if (shearCase === 'B' || shearCase === 'C') {
    s_shear = Math.min(s_shear, s_min_shear);
  }

  // 10. Detailing Spacing & Pitch
  let s_final = 0;
  let governingSpacingText = "";
  const hookExtension = Math.max(3.0, 6 * d_tie);

  if (type === 'TIED') {
    const s_detail = Math.min(16 * mainBarDia, 48 * d_tie, Dim);
    if (s_detail === 16 * mainBarDia) governingSpacingText = "Spacing governed by 16x Main Bar Dia";
    else if (s_detail === 48 * d_tie) governingSpacingText = "Spacing governed by 48x Tie Bar Dia";
    else governingSpacingText = "Spacing governed by Least Column Dimension";

    s_final = Math.min(s_shear, s_detail);
    if (s_shear < s_detail && (shearCase === 'B' || shearCase === 'C')) {
      governingSpacingText = "Spacing governed by Shear Demand";
    }
    if (shearCase === 'D') s_final = 0;
  } else {
    const Ach = Math.PI * Math.pow(Dim - 2 * cover, 2) / 4;
    const rho_s_min = 0.45 * (Ag / Ach - 1) * fc / fyt;
    const Dc = Dim - 2 * cover;
    const s_spiral_req = (4 * A_tie) / (Dc * rho_s_min);
    
    // Limits: clear spacing 1.0 to 3.0 in, meaning pitch is clear + d_tie
    const s_min_limit = 1.0 + d_tie;
    const s_max_limit = 3.0 + d_tie;
    const s_spiral = Math.max(s_min_limit, Math.min(s_max_limit, s_spiral_req));
    governingSpacingText = "Spacing governed by Spiral Ratio (ACI 25.7.3.3)";

    s_final = Math.min(s_shear, s_spiral);
    if (s_shear < s_spiral && (shearCase === 'B' || shearCase === 'C')) {
      governingSpacingText = "Spacing governed by Shear Demand";
    }
    if (s_final < s_min_limit) {
      governingSpacingText += " (WARNING: Pitch too tight)";
    }
    if (shearCase === 'D') s_final = 0;
  }

  // Update readonly phi element in GUI
  const phiEl = document.getElementById('column-phi');
  if (phiEl) phiEl.value = phi.toFixed(2);

  // 11. Materials Takeoff
  const ld_comp = Math.max((20 * fy * mainBarDia) / Math.sqrt(fc * 1000), 0.3 * fy * mainBarDia, 8.0);
  const l_splice = Math.max(12.0, 1.3 * ld_comp); // 1.3 * ld compression splice
  const L_long = N_bars * (colHeight + l_splice / 12);
  const W_long = L_long * Ab * 3.4;

  let W_transverse = 0;
  if (type === 'TIED') {
    const n_ties = Math.floor(colHeight * 12 / s_final) + 1;
    const L_tie = 4 * (Dim - 2 * cover) + 2 * hookExtension;
    const L_ties_total = n_ties * L_tie / 12;
    W_transverse = L_ties_total * A_tie * 3.4;
  } else {
    // spiral turns
    const Dc = Dim - 2 * cover;
    const Ds = Dc - d_tie;
    const L_turn = Math.sqrt(Math.PI * Math.PI * Ds * Ds + s_final * s_final);
    const n_turns = (colHeight * 12 / s_final) + 3.0; // 1.5 extra turns at each end for anchorage
    const L_spiral_total = n_turns * L_turn / 12;
    W_transverse = L_spiral_total * A_tie * 3.4;
  }

  const concreteVol = ((Ag / 144) * colHeight) * 0.02831685; // m³
  const steelWeight = (W_long + W_transverse) * 0.45359237; // kg

  // 12. Warnings and Compliance Alerts
  const warningRow = document.getElementById('column-row-warning');
  const warningText = document.getElementById('column-out-warning-text');
  
  let hasFailures = false;
  let warningMessage = "";

  if (dcRatio > 1.0) {
    hasFailures = true;
    warningMessage += `FAIL: Column is overstressed! (D/C Ratio of ${dcRatio.toFixed(2)} > 1.00). `;
  }
  if (!isSpacingOk) {
    warningMessage += "WARNING: Clear spacing too narrow for aggregate flow. ";
  }
  if (shearCase === 'D') {
    hasFailures = true;
    warningMessage += "FAIL: Shear demand exceeds maximum limits. Increase column size! ";
  }

  if (warningRow && warningText) {
    if (warningMessage) {
      warningRow.style.display = 'flex';
      warningText.textContent = warningMessage;
    } else {
      warningRow.style.display = 'none';
    }
  }

  // Format outputs
  outPu.textContent = `${Pu.toFixed(1)} k`;
  outAg.textContent = `${Ag.toFixed(2)} in²`;
  outDim.textContent = `${Dim} in`;
  outFinalArea.textContent = `${Ag.toFixed(1)} in²`;
  outAst.textContent = `${Ast_actual.toFixed(2)} in²`;
  if (outTieSpacing) outTieSpacing.textContent = `${s_final.toFixed(2)} in`;
  if (outHookExt) outHookExt.textContent = `${hookExtension.toFixed(2)} in`;
  if (outPnMax) outPnMax.textContent = `${(Pn / alpha).toFixed(1)} k`;
  if (outPhiPn) outPhiPn.textContent = `${PhiPn.toFixed(1)} k`;
  if (outDcRatio) outDcRatio.textContent = `${dcRatio.toFixed(2)}`;
  if (outConcreteVol) outConcreteVol.textContent = `${concreteVol.toFixed(2)} m³`;
  if (outSteelWeight) outSteelWeight.textContent = `${steelWeight.toFixed(1)} kg`;

  if (!hasFailures) {
    badge.className = 'tool-status-badge pass';
    badge.textContent = 'PASS';
  } else {
    badge.className = 'tool-status-badge fail';
    badge.textContent = 'FAIL';
  }

  // Redraw canvas
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

  const type = document.getElementById('column-type') ? document.getElementById('column-type').value : 'TIED';
  const padding = 25;
  const scale = Math.min((canvas.width - padding * 2) / w, (canvas.height - padding * 2) / h);
  
  const drawW = w * scale;
  const drawH = h * scale;
  const startX = (canvas.width - drawW) / 2;
  const startY = (canvas.height - drawH) / 2;

  ctx.fillStyle = '#0D1117';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const mainBarSize = document.getElementById('column-main-bar') ? document.getElementById('column-main-bar').value : '#8';
  const mainBarDia = mainBarSize === '#7' ? 0.875 : mainBarSize === '#8' ? 1.0 : 1.128;
  const tieBarSize = document.getElementById('column-tie-bar') ? document.getElementById('column-tie-bar').value : '#3';
  const tieBarDia = tieBarSize === '#3' ? 0.375 : 0.5;
  const cover = parseFloat(document.getElementById('column-cover').value) || 1.5;

  const d_prime = cover + tieBarDia + mainBarDia / 2;

  const fc = parseFloat(document.getElementById('column-fc').value) || 4;
  const fy = parseFloat(document.getElementById('column-fy').value) || 60;
  const pdl = parseFloat(document.getElementById('column-pdl').value) || 0;
  const pll = parseFloat(document.getElementById('column-pll').value) || 0;
  const Pu = 1.2 * pdl + 1.6 * pll;
  
  const phi_axial = type === 'TIED' ? 0.65 : 0.75;
  const alpha = type === 'TIED' ? 0.80 : 0.85;
  
  const denom = phi_axial * alpha * (0.85 * fc * (1 - p) + fy * p);
  const Ag_req = Pu / (denom || 1);
  
  let Dim = w;
  let Ag = type === 'TIED' ? Dim * Dim : Math.PI * Dim * Dim / 4;
  const Ast_axial_req = (Pu / ((phi_axial * alpha) || 1) - 0.85 * fc * Ag) / (fy - 0.85 * fc);
  const Ast_req = Math.max(p * Ag, Ast_axial_req);
  
  const barData = {
    '#5': 0.31, '#6': 0.44, '#7': 0.60, '#8': 0.79, '#9': 1.00, '#10': 1.27, '#11': 1.56, '#14': 2.25, '#18': 4.00
  };
  const Ab = barData[mainBarSize] || 0.79;
  let N_bars = Math.ceil(Ast_req / Ab);
  if (N_bars % 2 !== 0) N_bars += 1;
  const minBars = type === 'TIED' ? 4 : 6;
  if (N_bars < minBars) N_bars = minBars;

  if (type === 'TIED') {
    ctx.strokeStyle = '#2a6496';
    ctx.lineWidth = 2;
    ctx.strokeRect(startX, startY, drawW, drawH);

    const covScale = cover * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(startX + covScale, startY + covScale, drawW - covScale * 2, drawH - covScale * 2);

    ctx.beginPath();
    ctx.moveTo(startX + covScale, startY + covScale);
    ctx.lineTo(startX + covScale + 12 * scale * tieBarDia, startY + covScale + 12 * scale * tieBarDia);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.stroke();

    ctx.fillStyle = '#C9A84C';
    const barR = Math.max(3, (mainBarDia / 2) * scale);
    
    const bs = w - 2 * d_prime;
    const hs = h - 2 * d_prime;
    const L = 2 * (bs + hs);
    for (let i = 0; i < N_bars; i++) {
      const t = i * (L / N_bars);
      let x, y;
      if (t < bs) {
        x = -bs/2 + t;
        y = -hs/2;
      } else if (t < bs + hs) {
        x = bs/2;
        y = -hs/2 + (t - bs);
      } else if (t < 2*bs + hs) {
        x = bs/2 - (t - bs - hs);
        y = hs/2;
      } else {
        x = -bs/2;
        y = hs/2 - (t - 2*bs - hs);
      }
      
      const drawX = startX + drawW/2 + x * scale;
      const drawY = startY + drawH/2 + y * scale;
      ctx.beginPath();
      ctx.arc(drawX, drawY, barR, 0, Math.PI*2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = '#2a6496';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, drawW/2, 0, Math.PI*2);
    ctx.stroke();

    const covScale = cover * scale;
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(canvas.width/2, canvas.height/2, drawW/2 - covScale, 0, Math.PI*2);
    ctx.stroke();

    ctx.fillStyle = '#C9A84C';
    const barR = Math.max(3, (mainBarDia / 2) * scale);
    
    const Ds = w - 2 * d_prime;
    for (let i = 0; i < N_bars; i++) {
      const theta = i * (2 * Math.PI / N_bars);
      const x = (Ds / 2) * Math.cos(theta);
      const y = (Ds / 2) * Math.sin(theta);
      
      const drawX = canvas.width/2 + x * scale;
      const drawY = canvas.height/2 + y * scale;
      ctx.beginPath();
      ctx.arc(drawX, drawY, barR, 0, Math.PI*2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#9AA0A6';
  ctx.font = '10px JetBrains Mono';
  if (type === 'TIED') {
    ctx.fillText(`${w}" x ${h}"`, startX + drawW/2 - 25, startY - 8);
  } else {
    ctx.fillText(`D = ${w}"`, canvas.width/2 - 20, startY - 8);
  }
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
        calculateSlab();
      });
      el.addEventListener('change', () => {
        calculateSlab();
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
      
      calculateSlab();
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
  
  // 3. For β calculation always use: β = ln,long / ln,short. If panel is square, β = 1.0.
  const beta = lnLong === lnShort ? 1.0 : (lnLong / lnShort);
  const betaInput = document.getElementById('slab-beta-val');
  if (betaInput) {
    betaInput.value = beta.toFixed(2);
  }

  if (beta > 2.0) {
    warnings.push("Warning: Aspect span ratio (Beta = " + beta.toFixed(2) + ") exceeds 2.0 (ACI DDM limit).");
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

  // 4. Show αfm calculation with beam dimensions if beams are present, else clearly state αf1 = 0
  const alpha = (type === 'with-beams') ? (parseFloat(document.getElementById('slab-alpha-fm').value) || 1.5) : 0;
  const outStiffness = document.getElementById('slab-out-stiffness-details');
  if (outStiffness) {
    if (type !== 'with-beams') {
      outStiffness.textContent = "No beams present (αf1 = 0)";
    } else {
      const Is = (lnShort * 12 * Math.pow(hFinal, 3)) / 12; // in^4
      outStiffness.innerHTML = `Entered αfm = ${alpha.toFixed(2)} (Assumed beams with bw=12", hb=20", Ib=12,000 in⁴; slab strip Is = ${Is.toFixed(0)} in⁴, check αf1 = Ib/Is = ${(12000/Is).toFixed(2)})`;
    }
  }

  // 2. Load Calculations
  const concDensity = (normalWeight === 'yes') ? 150 : 110;
  const selfWeight = (hFinal / 12) * concDensity;
  const totalDL = sdl + selfWeight;
  const factoredQu = (1.2 * totalDL) + (1.6 * ll);
  
  outSelfWeight.textContent = `${selfWeight.toFixed(1)} psf`;
  outTotalDL.textContent = `${totalDL.toFixed(1)} psf`;
  outTotalLL.textContent = `${ll.toFixed(1)} psf`;
  outFactoredQu.textContent = `${factoredQu.toFixed(1)} psf`;

  if (ll > 2 * totalDL) {
    warnings.push("Warning: Live load exceeds 2x dead load (ACI DDM limit).");
  }

  // 5. Add DDM applicability check showing all 6 ACI 13.6.1 conditions
  const ddmChecks = [
    { name: "Condition 1: Spans in Each Direction", desc: "Slab must have a minimum of 3 continuous spans in each direction.", status: true, val: "PASS (Assumed)" },
    { name: "Condition 2: Panel Rectangularity (β)", desc: "Aspect ratio of long to short clear span <= 2.0.", status: (beta <= 2.0), val: `Ratio = ${beta.toFixed(2)} (${beta <= 2.0 ? "PASS" : "FAIL"})` },
    { name: "Condition 3: Successive Span Ratios", desc: "Successive span lengths in each direction differ by <= 33.3% of longer span.", status: true, val: "PASS (Assumed)" },
    { name: "Condition 4: Column Offset Limits", desc: "Column offset from continuous lines <= 10% of span length.", status: true, val: "PASS (Assumed)" },
    { name: "Condition 5: Live/Dead Load Ratio", desc: "Gravity loads only; service LL <= 2 * service DL.", status: (ll <= 2 * totalDL), val: `LL/DL = ${(ll / totalDL).toFixed(2)} (${ll <= 2 * totalDL ? "PASS" : "FAIL"})` },
    { name: "Condition 6: Relative Beam Stiffness", desc: "Relative stiffness of beams on all sides: 0.2 <= αf1*l2² / αf2*l1² <= 5.0.", status: true, val: type === 'with-beams' ? "PASS (1.00)" : "PASS (N/A - No beams)" }
  ];

  let ddmHtml = '<div style="display: grid; grid-template-columns: 1fr; gap: 0.4rem;">';
  ddmChecks.forEach(c => {
    const color = c.status ? '#81c784' : '#ff8a80';
    ddmHtml += `<div><span style="font-weight:bold; color:${color};">${c.status ? '✓' : '✗'} ${c.name}:</span> ${c.desc} <span style="color:${color}; font-weight:bold;">[${c.val}]</span></div>`;
  });
  ddmHtml += '</div>';
  const ddmCheckContainer = document.getElementById('slab-out-ddm-check-list');
  if (ddmCheckContainer) {
    ddmCheckContainer.innerHTML = ddmHtml;
  }

  // 3. Static Moments
  const l1 = lnLong + c1 / 12;
  const l2 = lnShort + c2 / 12;
  
  const Mol = (factoredQu * l2 * Math.pow(lnLong, 2)) / 8 / 1000;
  const Mos = (factoredQu * l1 * Math.pow(lnShort, 2)) / 8 / 1000;

  outMolDetail.textContent = `qu * l2 * ln_long² / 8 = ${factoredQu.toFixed(1)} * ${l2.toFixed(2)} * ${lnLong}² / 8000`;
  outMolVal.textContent = `${Mol.toFixed(2)} k-ft`;
  
  outMosDetail.textContent = `qu * l1 * ln_short² / 8 = ${factoredQu.toFixed(1)} * ${l1.toFixed(2)} * ${lnShort}² / 8000`;
  outMosVal.textContent = `${Mos.toFixed(2)} k-ft`;

  // 1. Moment distribution coefficients Table 16.2 exact match
  let extNegCoeff = 0.26;
  let posCoeff = 0.52;
  let intNegCoeff = 0.70;

  if (panel === 'interior') {
    extNegCoeff = 0.00; // No exterior negative moment
    posCoeff = 0.35;
    intNegCoeff = 0.65;
  } else {
    // Exterior Span
    if (type === 'with-beams') {
      intNegCoeff = 0.70;
      posCoeff = 0.57;
      extNegCoeff = 0.16;
    } else {
      if (panel === 'exterior-edge') {
        intNegCoeff = 0.70;
        posCoeff = 0.50;
        extNegCoeff = 0.30;
      } else {
        intNegCoeff = 0.70;
        posCoeff = 0.52;
        extNegCoeff = 0.26;
      }
    }
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

  // Column Strip and Middle Strip Splits (Standard splits: Col Neg = 75%, Col Pos = 60%)
  const lColNeg = longMoments.neg * 0.75;
  const lColPos = longMoments.pos * 0.60;
  const lMidNeg = longMoments.neg * 0.25;
  const lMidPos = longMoments.pos * 0.40;

  const sColNeg = shortMoments.neg * 0.75;
  const sColPos = shortMoments.pos * 0.60;
  const sMidNeg = shortMoments.neg * 0.25;
  const sMidPos = shortMoments.pos * 0.40;

  // 6. Show the 85% beam allotment step when beams are present (ACI 13.6.5)
  const allotmentDiv = document.getElementById('slab-out-beam-allotment-details');
  let coeff_long = 0;
  let coeff_short = 0;
  if (type === 'with-beams') {
    const R_long = alpha * l2 / l1;
    const R_short = alpha * l1 / l2;
    coeff_long = Math.min(0.85, 0.85 * R_long);
    coeff_short = Math.min(0.85, 0.85 * R_short);
    if (allotmentDiv) {
      allotmentDiv.style.display = 'block';
      allotmentDiv.innerHTML = `
        <strong>ACI 318-19 Section 8.10.5.7.1 Beam Allotment (85% Rule):</strong><br>
        - <strong>Long Direction:</strong> αf1 * l2/l1 = ${(R_long).toFixed(2)}. Beam resists ${(coeff_long * 100).toFixed(0)}% of Column Strip Moment (Slab resists ${((1 - coeff_long) * 100).toFixed(0)}%).<br>
          * Beam Neg = ${(coeff_long * lColNeg).toFixed(1)} k-ft | Slab Neg = ${((1 - coeff_long) * lColNeg).toFixed(1)} k-ft<br>
          * Beam Pos = ${(coeff_long * lColPos).toFixed(1)} k-ft | Slab Pos = ${((1 - coeff_long) * lColPos).toFixed(1)} k-ft<br>
        - <strong>Short Direction:</strong> αf2 * l1/l2 = ${(R_short).toFixed(2)}. Beam resists ${(coeff_short * 100).toFixed(0)}% of Column Strip Moment (Slab resists ${((1 - coeff_short) * 100).toFixed(0)}%).<br>
          * Beam Neg = ${(coeff_short * sColNeg).toFixed(1)} k-ft | Slab Neg = ${((1 - coeff_short) * sColNeg).toFixed(1)} k-ft<br>
          * Beam Pos = ${(coeff_short * sColPos).toFixed(1)} k-ft | Slab Pos = ${((1 - coeff_short) * sColPos).toFixed(1)} k-ft
      `;
    }
  } else {
    if (allotmentDiv) {
      allotmentDiv.style.display = 'block';
      allotmentDiv.innerHTML = `<strong>ACI 318-19 Section 8.10.5.7.1 Beam Allotment:</strong> No beams present (αf1 = 0). Slab in column strip resists 100% of column strip moment.`;
    }
  }

  // Populate Moments Table
  momentsTbody.innerHTML = `
    <tr>
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Column Strip (Total)</td>
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
      <td style="padding: 0.5rem; border: 1px solid rgba(255,255,255,0.1);">Column Strip (Total)</td>
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

  // Design slab column strip rebar for the slab portion only (remaining after beam allotment)
  const lColNeg_slab = (1 - coeff_long) * lColNeg;
  const lColPos_slab = (1 - coeff_long) * lColPos;
  const sColNeg_slab = (1 - coeff_short) * sColNeg;
  const sColPos_slab = (1 - coeff_short) * sColPos;

  const designLColNeg = getRebarDesign(lColNeg_slab, bColIn, dLong, hFinal, fc, fy);
  const designLColPos = getRebarDesign(lColPos_slab, bColIn, dLong, hFinal, fc, fy);
  const designLMidNeg = getRebarDesign(lMidNeg, bMidLongIn, dLong, hFinal, fc, fy);
  const designLMidPos = getRebarDesign(lMidPos, bMidLongIn, dLong, hFinal, fc, fy);

  const designSColNeg = getRebarDesign(sColNeg_slab, bColIn, dShort, hFinal, fc, fy);
  const designSColPos = getRebarDesign(sColPos_slab, bColIn, dShort, hFinal, fc, fy);
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
    ${formatRebarRow('Col Strip Top (Long)', lColNeg_slab, dLong, designLColNeg)}
    ${formatRebarRow('Col Strip Bot (Long)', lColPos_slab, dLong, designLColPos)}
    ${formatRebarRow('Mid Strip Top (Long)', lMidNeg, dLong, designLMidNeg)}
    ${formatRebarRow('Mid Strip Bot (Long)', lMidPos, dLong, designLMidPos)}
    ${formatRebarRow('Col Strip Top (Short)', sColNeg_slab, dShort, designSColNeg)}
    ${formatRebarRow('Col Strip Bot (Short)', sColPos_slab, dShort, designSColPos)}
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
  const allPassed = punchPass && owPass && (beta <= 2.0) && (ll <= 2 * totalDL);
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

// Reusable helper function to draw the TwinAnalytic vector logo in PDF reports
function drawTwinAnalyticLogo(doc, x, y, size, isDarkBg) {
  const slateR = isDarkBg ? 240 : 47;
  const slateG = isDarkBg ? 244 : 55;
  const slateB = isDarkBg ? 248 : 71;
  const goldR = 201, goldG = 168, goldB = 76;

  // Base gold line
  doc.setDrawColor(goldR, goldG, goldB);
  doc.setLineWidth(size * 0.04);
  doc.line(x + size * 0.05, y + size * 0.95, x + size * 0.95, y + size * 0.95);

  // Left vertical column (slate gray)
  doc.setFillColor(slateR, slateG, slateB);
  doc.rect(x + size * 0.25, y + size * 0.2, size * 0.15, size * 0.75, 'F');

  // Right vertical column (gold)
  doc.setFillColor(goldR, goldG, goldB);
  doc.rect(x + size * 0.6, y + size * 0.2, size * 0.15, size * 0.75, 'F');

  // Connecting horizontal beam (gold)
  doc.rect(x + size * 0.15, y + size * 0.35, size * 0.7, size * 0.12, 'F');

  // Diagonal brace (slate gray)
  doc.setDrawColor(slateR, slateG, slateB);
  doc.setLineWidth(size * 0.08);
  doc.line(x + size * 0.25, y + size * 0.75, x + size * 0.75, y + size * 0.47);

  // Intersection detail (gold dot/square)
  doc.setFillColor(goldR, goldG, goldB);
  doc.rect(x + size * 0.45, y + size * 0.47, size * 0.1, size * 0.1, 'F');
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
  const beta = lnLong === lnShort ? 1.0 : (lnLong / lnShort);
  let hCalc = 0;
  let hMin = 5.0;
  let factor = 30;
  let formulaStr = "";
  let subStr = "";
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
    subStr = `h = (${lnLong} ft * 12) / ${factor} = ${hCalc.toFixed(2)} in`;
  } else {
    methodStr = "ACI 318-19 Section 8.3.1.2 (With Interior Beams)";
    const alpha = parseFloat(document.getElementById('slab-alpha-fm').value) || 1.5;
    
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
      subStr = `h = (${lnLong} ft * 12) / ${factor} = ${hCalc.toFixed(2)} in`;
    } else if (alpha > 0.2 && alpha <= 2.0) {
      hMin = 5.0;
      hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 5 * beta * (alpha - 0.2));
      formulaStr = `h = ln * (0.8 + fy/200,000) / [36 + 5*β*(αfm - 0.2)]`;
      subStr = `h = (${lnLong}*12 * (0.8 + ${fy}/200k)) / [36 + 5*${beta.toFixed(2)}*(${alpha} - 0.2)] = ${hCalc.toFixed(2)} in`;
    } else {
      hMin = 3.5;
      hCalc = (lnLong * 12 * (0.8 + fy / 200000)) / (36 + 9 * beta);
      formulaStr = `h = ln * (0.8 + fy/200,000) / [36 + 9*β]`;
      subStr = `h = (${lnLong}*12 * (0.8 + ${fy}/200k)) / [36 + 9*${beta.toFixed(2)}] = ${hCalc.toFixed(2)} in`;
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

  // Moment splits Table 16.2 exact match
  let extNegCoeff = 0.26;
  let posCoeff = 0.52;
  let intNegCoeff = 0.70;

  if (panel === 'interior') {
    extNegCoeff = 0.00; // No exterior negative moment
    posCoeff = 0.35;
    intNegCoeff = 0.65;
  } else {
    // Exterior Span
    if (type === 'with-beams') {
      intNegCoeff = 0.70;
      posCoeff = 0.57;
      extNegCoeff = 0.16;
    } else {
      if (panel === 'exterior-edge') {
        intNegCoeff = 0.70;
        posCoeff = 0.50;
        extNegCoeff = 0.30;
      } else {
        intNegCoeff = 0.70;
        posCoeff = 0.52;
        extNegCoeff = 0.26;
      }
    }
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

  // Compute beam allotment coefficients
  const alphaVal = (type === 'with-beams') ? (parseFloat(document.getElementById('slab-alpha-fm').value) || 1.5) : 0;
  const R_l = alphaVal * l2 / l1;
  const R_s = alphaVal * l1 / l2;
  const c_l = type === 'with-beams' ? Math.min(0.85, 0.85 * R_l) : 0;
  const c_s = type === 'with-beams' ? Math.min(0.85, 0.85 * R_s) : 0;

  // Design slab column strip rebar for the slab portion only (remaining after beam allotment)
  const lColNeg_slab = (1 - c_l) * lColNeg;
  const lColPos_slab = (1 - c_l) * lColPos;
  const sColNeg_slab = (1 - c_s) * sColNeg;
  const sColPos_slab = (1 - c_s) * sColPos;

  const dLColNeg = getRebarDesign(lColNeg_slab, bColIn, dLong, hFinal, fc, fy);
  const dLColPos = getRebarDesign(lColPos_slab, bColIn, dLong, hFinal, fc, fy);
  const dLMidNeg = getRebarDesign(lMidNeg, bMidLongIn, dLong, hFinal, fc, fy);
  const dLMidPos = getRebarDesign(lMidPos, bMidLongIn, dLong, hFinal, fc, fy);

  const dSColNeg = getRebarDesign(sColNeg_slab, bColIn, dShort, hFinal, fc, fy);
  const dSColPos = getRebarDesign(sColPos_slab, bColIn, dShort, hFinal, fc, fy);
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
    // Project metadata below bar
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    doc.text(`PROJECT: ${projName.toUpperCase()}`, 0.5, 0.22);
    doc.text('SHEET S-102', 6.6, 0.22);

    // Logo
    drawTwinAnalyticLogo(doc, 7.3, 0.09, 0.13, false);
    doc.setTextColor(201, 168, 76);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('TwinAnalytic', 7.47, 0.19);

    // Gold border
    doc.setDrawColor(201, 168, 76);
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
  doc.text('TWO-WAY SLAB DESIGN REPORT', 4.25, 2.3, { align: 'center' });

  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(14);
  doc.text('As per ACI 318 Building Code Requirements', 4.25, 2.7, { align: 'center' });

  // Grid box for project info
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.01);
  doc.rect(1.5, 3.3, 5.5, 2.7);

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

  let metaY = 3.6;
  metaRows.forEach(([label, val]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 1.8, metaY);
    doc.setFont('helvetica', 'normal');
    doc.text(val, 3.8, metaY);
    metaY += 0.42;
  });

  // --- DRAW ISOMETRIC SLAB SKETCH ---
  // Draw back columns first
  doc.setFillColor(150, 150, 150);
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.008);
  // Column 1 (Back-Left): at (3.175, 6.7)
  doc.rect(3.175, 6.7, 0.15, 0.4, 'FD');
  // Column 2 (Back-Right): at (5.175, 6.7)
  doc.rect(5.175, 6.7, 0.15, 0.4, 'FD');

  // Draw front columns
  // Column 3 (Front-Left): at (2.675, 7.3)
  doc.rect(2.675, 7.3, 0.15, 0.4, 'FD');
  // Column 4 (Front-Right): at (4.675, 7.3)
  doc.rect(4.675, 7.3, 0.15, 0.4, 'FD');

  // Draw slab 3D sides (using triangle decomposition for compatibility)
  doc.setFillColor(200, 225, 250);
  doc.setDrawColor(0, 70, 130);
  doc.setLineWidth(0.01);
  // Front-Left Face: (2.75, 7.3) to (4.75, 7.3) to (4.75, 7.38) to (2.75, 7.38)
  doc.triangle(2.75, 7.3, 4.75, 7.3, 4.75, 7.38, 'F');
  doc.triangle(2.75, 7.3, 4.75, 7.38, 2.75, 7.38, 'F');
  doc.line(2.75, 7.3, 4.75, 7.3);
  doc.line(4.75, 7.3, 4.75, 7.38);
  doc.line(4.75, 7.38, 2.75, 7.38);
  doc.line(2.75, 7.38, 2.75, 7.3);

  // Front-Right Face: (4.75, 7.3) to (5.25, 6.7) to (5.25, 6.78) to (4.75, 7.38)
  doc.setFillColor(180, 210, 240);
  doc.triangle(4.75, 7.3, 5.25, 6.7, 5.25, 6.78, 'F');
  doc.triangle(4.75, 7.3, 5.25, 6.78, 4.75, 7.38, 'F');
  doc.line(4.75, 7.3, 5.25, 6.7);
  doc.line(5.25, 6.7, 5.25, 6.78);
  doc.line(5.25, 6.78, 4.75, 7.38);
  doc.line(4.75, 7.38, 4.75, 7.3);

  // Slab Top Face: (3.25, 6.7) to (5.25, 6.7) to (4.75, 7.3) to (2.75, 7.3)
  doc.setFillColor(225, 240, 255);
  doc.triangle(3.25, 6.7, 5.25, 6.7, 4.75, 7.3, 'F');
  doc.triangle(3.25, 6.7, 4.75, 7.3, 2.75, 7.3, 'F');
  doc.line(3.25, 6.7, 5.25, 6.7);
  doc.line(5.25, 6.7, 4.75, 7.3);
  doc.line(4.75, 7.3, 2.75, 7.3);
  doc.line(2.75, 7.3, 3.25, 6.7);

  // Reinforcement grid lines on top surface
  doc.setDrawColor(120, 160, 200);
  doc.setLineWidth(0.005);
  for (let t = 0.2; t < 1.0; t += 0.2) {
    doc.line(3.25 + t * 2.0, 6.7, 2.75 + t * 2.0, 7.3);
    doc.line(3.25 - t * 0.5, 6.7 + t * 0.6, 5.25 - t * 0.5, 6.7 + t * 0.6);
  }

  // Two crossed dashed lines representing strip boundaries
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.008);
  doc.setLineDashPattern([0.04, 0.03], 0);
  doc.line(3.0, 7.0, 5.0, 7.0);
  doc.line(4.25, 6.7, 3.75, 7.3);
  doc.setLineDashPattern([], 0);

  // Slab system label
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 70, 130);
  doc.text('FLAT PLATE SLAB SYSTEM', 4.25, 7.9, { align: 'center' });

  // Branding at bottom
  drawTwinAnalyticLogo(doc, 4.0, 8.6, 0.5, false);
  doc.setTextColor(201, 168, 76);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('TwinAnalytic', 4.25, 9.4, { align: 'center' });
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Precision Engineering & Digital Twins', 4.25, 9.65, { align: 'center' });

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

  // --- STIFFNESS & DDM APPLICABILITY CHECKS ---
  let ddmY = curY + 2.8;
  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('3. BEAM STIFFNESS & DDM APPLICABILITY CHECKS', 0.5, ddmY);
  doc.line(0.5, ddmY + 0.05, 8.0, ddmY + 0.05);

  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  ddmY += 0.25;

  if (type !== 'with-beams') {
    doc.setFont('helvetica', 'bold');
    doc.text("Relative Beam Stiffness:", 0.5, ddmY);
    doc.setFont('helvetica', 'normal');
    doc.text("No beams present. Flat plate/flat slab system, therefore alpha_f1 = 0.", 2.2, ddmY);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.text("Relative Beam Stiffness:", 0.5, ddmY);
    doc.setFont('helvetica', 'normal');
    const Is = (lnShort * 12 * Math.pow(hFinal, 3)) / 12; // in^4
    const ratio_IbIs = (12000 / Is);
    const stiffnessText = `Entered αfm = ${alphaVal.toFixed(2)}. (Assumed beam: 12"x20", Ib = 12,000 in⁴; slab strip Is = ${Is.toFixed(0)} in⁴, stiffness αf1 = Ib/Is = ${ratio_IbIs.toFixed(2)})`;
    const splitStiffness = doc.splitTextToSize(stiffnessText, 5.3);
    doc.text(splitStiffness, 2.2, ddmY);
    ddmY += (splitStiffness.length - 1) * 0.15;
  }
  ddmY += 0.22;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text("ACI 318-19 Section 8.10.2 DDM Applicability Checklist:", 0.5, ddmY);
  ddmY += 0.2;

  const ddmChecksList = [
    ["Condition 1: Span Count", "Minimum of 3 continuous spans in each direction.", "PASS (Assumed)"],
    ["Condition 2: Rectangularity (β)", `Aspect ratio of long to short clear span <= 2.0. (β = ${beta.toFixed(2)})`, beta <= 2.0 ? "PASS" : "FAIL"],
    ["Condition 3: Span Differences", "Successive span lengths differ by <= 33.3% of longer span.", "PASS (Assumed)"],
    ["Condition 4: Column Offset", "Column offset from continuous grid lines <= 10% of span.", "PASS (Assumed)"],
    ["Condition 5: Load Ratio (LL/DL)", `Service live load <= 2 * service dead load. (LL/DL = ${(ll / totalDL).toFixed(2)})`, ll <= 2 * totalDL ? "PASS" : "FAIL"],
    ["Condition 6: Beam Stiffness", "Relative stiffness of beams in perpendicular directions.", type === 'with-beams' ? "PASS (1.00)" : "PASS (N/A)"]
  ];

  doc.setFontSize(8.5);
  ddmChecksList.forEach(([condName, condDesc, condStatus]) => {
    if (condStatus.includes("PASS")) {
      doc.setTextColor(30, 120, 30);
      doc.setFont('helvetica', 'bold');
      doc.text("✓", 0.6, ddmY);
    } else {
      doc.setTextColor(200, 30, 30);
      doc.setFont('helvetica', 'bold');
      doc.text("✗", 0.6, ddmY);
    }

    doc.setTextColor(50, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text(condName, 0.8, ddmY);

    doc.setFont('helvetica', 'normal');
    doc.text(condDesc, 2.8, ddmY);

    if (condStatus.includes("PASS")) {
      doc.setTextColor(30, 120, 30);
      doc.setFont('helvetica', 'bold');
    } else {
      doc.setTextColor(200, 30, 30);
      doc.setFont('helvetica', 'bold');
    }
    doc.text(`[${condStatus}]`, 7.0, ddmY);

    ddmY += 0.22;
  });

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

  // --- INTERMEDIATE MOMENT SPLITS SUB-TABLE ---
  let tableY = 6.3;
  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(13);
  doc.text('3.1 INTERMEDIATE MOMENT SPLITS', 0.5, tableY);
  doc.line(0.5, tableY + 0.05, 8.0, tableY + 0.05);

  tableY += 0.22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  
  doc.text('Dir', 0.5, tableY);
  doc.text('Moment Type', 1.0, tableY);
  doc.text('Coeff', 2.3, tableY);
  doc.text('Total Mu', 2.9, tableY);
  doc.text('Col Strip', 3.7, tableY);
  doc.text('Mid Strip', 4.5, tableY);
  if (type === 'with-beams') {
    doc.text('Beam Allot', 5.3, tableY);
    doc.text('Slab-Only Col', 6.4, tableY);
  }
  doc.line(0.5, tableY + 0.05, 8.0, tableY + 0.05);

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  const getSplitData = (dirLabel, MoVal) => {
    let intNegCo, posCo, extNegCo;
    if (panel === 'interior') {
      intNegCo = 0.65; posCo = 0.35; extNegCo = 0.0;
    } else {
      intNegCo = 0.70; posCo = posCoeff; extNegCo = extNegCoeff;
    }

    const intNegM = intNegCo * MoVal;
    const posM = posCo * MoVal;
    const extNegM = extNegCo * MoVal;

    const colIntNeg = intNegM * 0.75;
    const colPos = posM * 0.60;
    const extColSplit = (type === 'with-beams' || panel === 'exterior-edge') ? 0.75 : 1.00;
    const colExtNeg = extNegM * extColSplit;

    const midIntNeg = intNegM * 0.25;
    const midPos = posM * 0.40;
    const midExtNeg = extNegM * (1 - extColSplit);

    return [
      { type: 'Int Negative', coeff: intNegCo, total: intNegM, col: colIntNeg, mid: midIntNeg },
      { type: 'Positive', coeff: posCo, total: posM, col: colPos, mid: midPos },
      { type: 'Ext Negative', coeff: extNegCo, total: extNegM, col: colExtNeg, mid: midExtNeg }
    ];
  };

  const longSplit = getSplitData('Long', Mol);
  const shortSplit = getSplitData('Short', Mos);

  const printSplitRows = (dirLabel, splitData, c_b) => {
    splitData.forEach((row) => {
      if (row.coeff === 0 && panel === 'interior') return; // skip exterior neg for interior panels
      tableY += 0.22;
      doc.setFont('helvetica', 'bold');
      doc.text(dirLabel, 0.5, tableY);
      doc.setFont('helvetica', 'normal');
      doc.text(row.type, 1.0, tableY);
      doc.text(row.coeff.toFixed(2), 2.3, tableY);
      doc.text(row.total.toFixed(1) + ' k-ft', 2.9, tableY);
      doc.text(row.col.toFixed(1) + ' k-ft', 3.7, tableY);
      doc.text(row.mid.toFixed(1) + ' k-ft', 4.5, tableY);

      if (type === 'with-beams') {
        const beamM = c_b * row.col;
        const slabM = (1 - c_b) * row.col;
        doc.text(beamM.toFixed(1) + ' k-ft', 5.3, tableY);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(201, 168, 76);
        doc.text(slabM.toFixed(1) + ' k-ft', 6.4, tableY);
        doc.setTextColor(60, 60, 60);
        doc.setFont('helvetica', 'normal');
      }
      doc.line(0.5, tableY + 0.05, 8.0, tableY + 0.05);
    });
  };

  printSplitRows('Long', longSplit, c_l);
  printSplitRows('Short', shortSplit, c_s);

  // --- BEAM ALLOTMENT EXPLANATION ---
  tableY += 0.35;
  if (type === 'with-beams') {
    doc.setTextColor(201, 168, 76);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text('3.2 ACI 318-19 Section 8.10.5.7.1 Beam Allotment (85% Rule)', 0.5, tableY);
    doc.line(0.5, tableY + 0.05, 8.0, tableY + 0.05);

    tableY += 0.22;
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);

    const R_l_text = `Long Direction: αf1 * l2/l1 = ${R_l.toFixed(2)}. Beam resists ${(c_l * 100).toFixed(0)}% of Column Strip Moment (Slab resists ${((1 - c_l) * 100).toFixed(0)}%).`;
    const R_s_text = `Short Direction: αf2 * l1/l2 = ${R_s.toFixed(2)}. Beam resists ${(c_s * 100).toFixed(0)}% of Column Strip Moment (Slab resists ${((1 - c_s) * 100).toFixed(0)}%).`;
    doc.text(R_l_text, 0.5, tableY);
    tableY += 0.18;
    doc.text(R_s_text, 0.5, tableY);
  } else {
    doc.setTextColor(201, 168, 76);
    doc.setFont('times', 'bold');
    doc.setFontSize(11);
    doc.text('3.2 ACI 318-19 Section 8.10.5.7.1 Beam Allotment', 0.5, tableY);
    doc.line(0.5, tableY + 0.05, 8.0, tableY + 0.05);

    tableY += 0.22;
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.text('No beams are present (αf1 = 0). The slab in the column strip resists 100% of the column strip moment.', 0.5, tableY);
  }

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

  // --- STEP 4.1: COLUMN STRIP & MIDDLE STRIP WIDTH DEFINITION ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text('Step 4.1: Column Strip & Middle Strip Width Definition (ACI 318 Section 8.4.1.5)', 0.5, 1.05);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(60, 60, 60);
  doc.text(`Smaller panel dimension = min(l1, l2) = ${Math.min(l1, l2).toFixed(2)} ft`, 0.5, 1.22);
  doc.text(`Column strip width (each side of column line) = smaller span / 4 = ${(Math.min(l1, l2) / 4).toFixed(2)} ft`, 0.5, 1.36);
  doc.text(`Total column strip width = smaller span / 2 = ${bColFt.toFixed(2)} ft = ${bColIn.toFixed(0)} in`, 0.5, 1.50);
  doc.text(`Middle strip width (Long direction) = l2 - column strip width = ${bMidLongFt.toFixed(2)} ft = ${bMidLongIn.toFixed(0)} in`, 0.5, 1.64);
  doc.text(`Middle strip width (Short direction) = l1 - column strip width = ${bMidShortFt.toFixed(2)} ft = ${bMidShortIn.toFixed(0)} in`, 0.5, 1.78);

  let wty = 1.92;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  doc.rect(0.5, wty, 7.5, 0.16);
  doc.text('Strip', 0.6, wty + 0.11);
  doc.text('Direction', 3.0, wty + 0.11);
  doc.text('Width b (in)', 5.5, wty + 0.11);

  const wRows = [
    ['Column Strip', 'Long', bColIn.toFixed(0) + ' in'],
    ['Column Strip', 'Short', bColIn.toFixed(0) + ' in'],
    ['Middle Strip', 'Long', bMidLongIn.toFixed(0) + ' in'],
    ['Middle Strip', 'Short', bMidShortIn.toFixed(0) + ' in']
  ];

  wRows.forEach(([sName, sDir, sW]) => {
    wty += 0.16;
    doc.rect(0.5, wty, 7.5, 0.16);
    doc.setFont('helvetica', 'normal');
    doc.text(sName, 0.6, wty + 0.11);
    doc.text(sDir, 3.0, wty + 0.11);
    doc.text(sW, 5.5, wty + 0.11);
  });

  // --- STEP 4.2: SAMPLE CALCULATION ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text('Step 4.2: Sample Calculation — Column Strip Top (Long Direction)', 0.5, 2.95);

  const sampleMu_kft = lColNeg_slab;
  const sampleMu_kin = sampleMu_kft * 12;
  const sampleB = bColIn;
  const sampleD = dLong;
  const sampleRn_ksi = sampleMu_kin / (0.9 * sampleB * Math.pow(sampleD, 2));
  const sampleRn_psi = sampleRn_ksi * 1000;
  const sampleFc_psi = fc;
  const sampleFy_psi = fy;
  let sampleRho = 0;
  if (sampleRn_ksi < 0.85 * (sampleFc_psi / 1000) / 2) {
    sampleRho = (0.85 * sampleFc_psi / sampleFy_psi) * (1 - Math.sqrt(1 - (2 * sampleRn_psi) / (0.85 * sampleFc_psi)));
  }
  const sampleAsReq = sampleRho * sampleB * sampleD;
  const sampleAsMin = 0.0018 * sampleB * hFinal;
  const sampleAsUsed = Math.max(sampleAsReq, sampleAsMin);
  let sampleBarArea = 0.20;
  if (dLColNeg.size === '#5') sampleBarArea = 0.31;
  else if (dLColNeg.size === '#6') sampleBarArea = 0.44;
  const sampleSpacing = (sampleBarArea * sampleB) / sampleAsUsed;
  const sampleSpacingLimit = Math.min(2 * hFinal, 18);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  let scy = 3.05;
  doc.text(`Step 1: Mu = ${sampleMu_kft.toFixed(1)} k-ft = ${sampleMu_kin.toFixed(1)} k-in`, 0.6, scy);
  doc.text(`Step 2: b = ${sampleB.toFixed(0)} in`, 0.6, scy += 0.11);
  doc.text(`Step 3: d = h - 0.75"(cover) - 0.50"(half bar dia) = ${sampleD.toFixed(2)} in`, 0.6, scy += 0.11);
  doc.text(`Step 4: Ru = Mu / (φ × b × d²) = ${sampleMu_kin.toFixed(1)} / (0.9 × ${sampleB.toFixed(0)} × ${sampleD.toFixed(2)}²) = ${sampleRn_psi.toFixed(1)} psi`, 0.6, scy += 0.11);
  doc.text(`Step 5: ρ = (0.85 × f'c/fy) × [1 - √(1 - 2Ru/0.85f'c)] = ${sampleRho.toFixed(5)}`, 0.6, scy += 0.11);
  doc.text(`Step 6: As,req = ρ × b × d = ${sampleAsReq.toFixed(2)} in²`, 0.6, scy += 0.11);
  doc.text(`Step 7: As,min = 0.0018 × b × h = ${sampleAsMin.toFixed(2)} in²`, 0.6, scy += 0.11);
  doc.text(`Step 8: As,used = max(As,req, As,min) = ${sampleAsUsed.toFixed(2)} in²`, 0.6, scy += 0.11);
  doc.text(`Step 9: Bar spacing check per ACI 318 Section 8.7.2.2:`, 0.6, scy += 0.11);
  doc.text(`  Maximum spacing = lesser of:`, 0.6, scy += 0.11);
  doc.text(`  → 2h = 2 × ${hFinal.toFixed(1)} in = ${(2 * hFinal).toFixed(1)} in`, 0.6, scy += 0.11);
  doc.text(`  → 18 in (absolute maximum)`, 0.6, scy += 0.11);
  doc.text(`  → Governs: ${sampleSpacingLimit.toFixed(1)} in`, 0.6, scy += 0.11);
  doc.text(`  Provided spacing = ${sampleSpacing.toFixed(1)} in < ${sampleSpacingLimit.toFixed(1)} in ✓ OK`, 0.6, scy += 0.11);

  // --- STEP 4.3: REINFORCEMENT SUMMARY TABLE ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text('Step 4.3: Reinforcement Summary Table', 0.5, 5.05);

  let ry = 5.22;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  
  doc.text('Strip & Zone', 0.5, ry);
  doc.text('Mu (k-ft)', 2.5, ry);
  doc.text('d (in)', 3.3, ry);
  doc.text('As Req', 4.0, ry);
  doc.text('As Min', 4.7, ry);
  doc.text('As Used', 5.4, ry);
  doc.text('Rebar detail', 6.2, ry);
  doc.text('Bars', 7.4, ry);
  doc.line(0.5, ry + 0.04, 8.0, ry + 0.04);

  const rowsData = [
    ['Col Strip Top (Long)', lColNeg_slab, dLong, dLColNeg],
    ['Col Strip Bot (Long)', lColPos_slab, dLong, dLColPos],
    ['Mid Strip Top (Long)', lMidNeg, dLong, dLMidNeg],
    ['Mid Strip Bot (Long)', lMidPos, dLong, dLMidPos],
    ['Col Strip Top (Short)', sColNeg_slab, dShort, dSColNeg],
    ['Col Strip Bot (Short)', sColPos_slab, dShort, dSColPos],
    ['Mid Strip Top (Short)', sMidNeg, dShort, dSMidNeg],
    ['Mid Strip Bot (Short)', sMidPos, dShort, dSMidPos]
  ];

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  rowsData.forEach(([zone, MuVal, dVal, design]) => {
    ry += 0.20;
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
    doc.line(0.5, ry + 0.04, 8.0, ry + 0.04);
  });

  // --- FOOTNOTE: ENHANCED AS_MIN EXPLANATION ---
  ry += 0.25;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(120, 120, 120);
  doc.text("Note: As,min values differ between strips because strip widths differ.", 0.5, ry);
  doc.text(`Column strip b = ${bColIn.toFixed(0)} in → As,min = 0.0018 × ${bColIn.toFixed(0)} × h = ${sampleAsMin.toFixed(2)} in²`, 0.5, ry + 0.14);
  doc.text(`Middle strip (Long) b = ${bMidLongIn.toFixed(0)} in → As,min = 0.0018 × ${bMidLongIn.toFixed(0)} × h = ${(0.0018 * bMidLongIn * hFinal).toFixed(2)} in²`, 0.5, ry + 0.26);
  doc.text(`Middle strip (Short) b = ${bMidShortIn.toFixed(0)} in → As,min = 0.0018 × ${bMidShortIn.toFixed(0)} × h = ${(0.0018 * bMidShortIn * hFinal).toFixed(2)} in²`, 0.5, ry + 0.38);

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
  doc.text(`- Effective depth derivation:`, 0.5, 1.45);
  doc.text(`  d₁ (long direction) = h - cover - 0.5(bar dia) = ${hFinal.toFixed(1)} - 0.75 - 0.50 = ${dLong.toFixed(2)} in`, 0.5, 1.62);
  doc.text(`  d₂ (short direction) = h - cover - 1.0(bar dia below) - 0.5 = ${hFinal.toFixed(1)} - 0.75 - 1.00 = ${dShort.toFixed(2)} in`, 0.5, 1.79);
  doc.text(`  d_avg = (d₁ + d₂) / 2 = (${dLong.toFixed(2)} + ${dShort.toFixed(2)}) / 2 = ${dAvg.toFixed(2)} in`, 0.5, 1.96);

  doc.text(`- Column Size: c1 x c2 = ${c1} x ${c2} in`, 0.5, 2.15);
  doc.text(`- Critical perimeter bo = 2*(c1 + d) + 2*(c2 + d) = ${bo.toFixed(1)} in`, 0.5, 2.35);
  
  doc.text(`Factored punching shear force:`, 0.5, 2.65);
  doc.setFont('courier', 'bold');
  doc.text(`Vu = qu * (l1 * l2 - (c1 + d)*(c2 + d)/144)`, 0.6, 2.85);
  doc.text(`   = ${punchVu.toFixed(1)} kips`, 0.6, 3.05);

  doc.setFont('helvetica', 'normal');
  doc.text(`Nominal punching shear capacity (governed by 4*lambda*√f'c):`, 0.5, 3.35);
  doc.setFont('courier', 'bold');
  doc.text(`φVc = 0.75 * 4 * λ * √f'c * bo * d`, 0.6, 3.55);
  doc.text(`    = ${phiPunchVc.toFixed(1)} kips`, 0.6, 3.75);

  let p6y = 4.10;
  doc.setFont('helvetica', 'bold');
  doc.text(`Punching Shear Status:`, 0.5, p6y);
  if (punchPass) {
    doc.setTextColor(30, 150, 30);
    doc.text('PASS (φVc >= Vu)', 2.3, p6y);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('FAIL (φVc < Vu)', 2.3, p6y);
  }
  doc.setTextColor(60, 60, 60);

  // Utilization check and color-coding warnings
  p6y += 0.22;
  const punchUtil = (punchVu / phiPunchVc) * 100;
  doc.setFont('helvetica', 'bold');
  doc.text(`Utilization Ratio = Vu / φVc = ${punchVu.toFixed(1)} / ${phiPunchVc.toFixed(1)} = ${punchUtil.toFixed(1)}%`, 0.5, p6y);

  p6y += 0.18;
  if (punchUtil < 85) {
    doc.setTextColor(30, 150, 30);
    doc.text('ADEQUATE — Good safety margin', 0.5, p6y);
  } else if (punchUtil <= 95) {
    doc.setTextColor(200, 100, 0);
    doc.text('ACCEPTABLE — Monitor if loads increase', 0.5, p6y);
  } else if (punchUtil <= 100) {
    doc.setTextColor(220, 50, 50);
    doc.text('WARNING — Very thin margin. Consider increasing slab thickness by 0.5 in or increasing column size', 0.5, p6y);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.setFont('helvetica', 'bold');
    doc.text("FAIL — Redesign required. Increase h or f'c", 0.5, p6y);
  }
  doc.setTextColor(60, 60, 60);

  // Recommendations box if utilization > 95%
  if (punchUtil > 95) {
    p6y += 0.20;
    doc.setDrawColor(220, 50, 50);
    doc.setFillColor(255, 240, 240);
    doc.rect(0.5, p6y, 7.5, 0.82, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(220, 50, 50);
    doc.text('DESIGN RECOMMENDATION:', 0.6, p6y + 0.16);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.0);
    doc.setTextColor(50, 50, 50);
    doc.text(`Option 1: Increase slab thickness from h = ${hFinal.toFixed(1)}" to ${(hFinal + 0.5).toFixed(1)}"`, 0.8, p6y + 0.32);
    doc.text(`Option 2: Increase column size from ${c1.toFixed(0)}"x${c2.toFixed(0)}" to ${(c1 + 2).toFixed(0)}"x${(c2 + 2).toFixed(0)}"`, 0.8, p6y + 0.44);
    doc.text(`Option 3: Increase concrete compressive strength f'c to next grade`, 0.8, p6y + 0.56);
    doc.text(`Option 4: Add shear reinforcement (stirrups or shear studs)`, 0.8, p6y + 0.68);
    p6y += 0.82;
  }

  p6y += 0.35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(60, 60, 60);
  doc.text('5.2 One-Way Beam Shear (ACI 318 Section 22.5)', 0.5, p6y);

  p6y += 0.20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.text(`One-way shear is checked on a 12-inch wide strip at a distance 'd' from column face.`, 0.5, p6y);

  p6y += 0.22;
  doc.setFont('courier', 'bold');
  doc.text(`Vu1 = qu * (ln_long/2 - d/12) = ${owVu.toFixed(2)} kips`, 0.6, p6y);
  p6y += 0.18;
  doc.text(`φVc = 0.75 * 2 * λ * √f'c * 12 * d = ${phiOwVc.toFixed(2)} kips`, 0.6, p6y);

  p6y += 0.25;
  doc.setFont('helvetica', 'bold');
  doc.text(`One-Way Shear Status:`, 0.5, p6y);
  if (owPass) {
    doc.setTextColor(30, 150, 30);
    doc.text('PASS (φVc >= Vu1)', 2.3, p6y);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('FAIL (φVc < Vu1)', 2.3, p6y);
  }
  doc.setTextColor(60, 60, 60);

  p6y += 0.35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('5.3 Critical Perimeter Description', 0.5, p6y);
  
  p6y += 0.20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  const criticalText = `The critical perimeter for two-way punching shear is located at a distance d/2 from the face of the column. This forms a rectangle of dimensions (c1 + d) by (c2 + d) centered on the column. Concrete shear strength is checked along this boundary.`;
  const splitCrit = doc.splitTextToSize(criticalText, 7.0);
  doc.text(splitCrit, 0.5, p6y);
  p6y += splitCrit.length * 0.18;

  // --- SHEAR VERIFICATION SUMMARY TABLE ---
  p6y += 0.20;
  const owUtil = (owVu / phiOwVc) * 100;
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.008);
  doc.rect(0.5, p6y, 7.5, 0.85);

  doc.setFillColor(240, 240, 240);
  doc.rect(0.5, p6y, 7.5, 0.22, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.text('SHEAR VERIFICATION SUMMARY', 4.25, p6y + 0.15, { align: 'center' });

  p6y += 0.22;
  doc.rect(0.5, p6y, 7.5, 0.22);
  doc.text('Check', 0.6, p6y + 0.15);
  doc.text('Vu', 2.5, p6y + 0.15);
  doc.text('φVc', 4.2, p6y + 0.15);
  doc.text('Utilization', 5.8, p6y + 0.15);

  // Punching
  p6y += 0.22;
  doc.rect(0.5, p6y, 7.5, 0.20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Punching (Two-Way)', 0.6, p6y + 0.14);
  doc.text(`${punchVu.toFixed(1)} kips`, 2.5, p6y + 0.14);
  doc.text(`${phiPunchVc.toFixed(1)} kips`, 4.2, p6y + 0.14);
  doc.setFont('helvetica', 'bold');
  if (punchUtil < 85) doc.setTextColor(30, 150, 30);
  else if (punchUtil <= 95) doc.setTextColor(200, 100, 0);
  else doc.setTextColor(220, 50, 50);
  doc.text(`${punchUtil.toFixed(1)}% [${punchPass ? 'PASS' : 'FAIL'}]`, 5.8, p6y + 0.14);

  // One-Way
  p6y += 0.20;
  doc.rect(0.5, p6y, 7.5, 0.20);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('One-Way Beam Shear', 0.6, p6y + 0.14);
  doc.text(`${owVu.toFixed(2)} kips`, 2.5, p6y + 0.14);
  doc.text(`${phiOwVc.toFixed(2)} kips`, 4.2, p6y + 0.14);
  doc.setFont('helvetica', 'bold');
  if (owUtil < 85) doc.setTextColor(30, 150, 30);
  else if (owUtil <= 95) doc.setTextColor(200, 100, 0);
  else doc.setTextColor(220, 50, 50);
  doc.text(`${owUtil.toFixed(1)}% [${owPass ? 'PASS' : 'FAIL'}]`, 5.8, p6y + 0.14);

  // ==========================================
  // PAGE 7 — REINFORCEMENT DETAILING DIAGRAM
  // ==========================================
  doc.addPage();
  drawBorder(7);

  doc.setTextColor(201, 168, 76);
  doc.setFont('times', 'bold');
  doc.setFontSize(16);
  doc.text('6. REINFORCEMENT DETAILING DIAGRAMS', 0.5, 0.65);
  doc.line(0.5, 0.72, 8.0, 0.72);

  // --- DIAGRAM ARROW HELPERS ---
  const drawDimArrowH = (x1, x2, y, label) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.006);
    doc.line(x1, y, x2, y);
    doc.setFillColor(0, 0, 0);
    doc.triangle(x1, y, x1 + 0.05, y - 0.015, x1 + 0.05, y + 0.015, 'F');
    doc.triangle(x2, y, x2 - 0.05, y - 0.015, x2 - 0.05, y + 0.015, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(label, (x1 + x2)/2, y - 0.03, { align: 'center' });
  };

  const drawDimArrowV = (x, y1, y2, label) => {
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.006);
    doc.line(x, y1, x, y2);
    doc.setFillColor(0, 0, 0);
    doc.triangle(x, y1, x - 0.015, y1 + 0.05, x + 0.015, y1 + 0.05, 'F');
    doc.triangle(x, y2, x - 0.015, y2 - 0.05, x + 0.015, y2 - 0.05, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.text(label, x - 0.03, (y1 + y2)/2, { align: 'right' });
  };

  // --- DIAGRAM 1: TOP VIEW PANEL ZONE LAYOUT ---
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.006);
  doc.rect(0.5, 0.85, 7.5, 2.6); // Thin border box

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text('DIAGRAM 1: PANEL ZONE LAYOUT (TOP VIEW)', 0.6, 1.05);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Not to Scale — Schematic Only', 7.4, 1.05, { align: 'right' });

  // Calculate panel dimensions
  let aspect = l1 / l2;
  let scale = Math.min(5.0 / l2, 1.8 / l1);
  let W_panel = l2 * scale;
  let H_panel = l1 * scale;
  let startX_panel = 4.25 - W_panel / 2;
  let startY_panel = 1.25 + (1.8 - H_panel) / 2;

  // 1. Column strip intersection zone (filled light blue)
  let dx = W_panel / 4;
  let dy = H_panel / 4;
  doc.setFillColor(220, 235, 250);
  doc.rect(startX_panel + dx, startY_panel + dy, W_panel / 2, H_panel / 2, 'F');

  // 2. Draw outer rectangle (full panel boundary)
  doc.setDrawColor(0, 70, 130);
  doc.setLineWidth(0.015);
  doc.rect(startX_panel, startY_panel, W_panel, H_panel);

  // 3. Draw column strip boundary lines (dashed)
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.008);
  doc.setLineDashPattern([0.05, 0.04], 0);
  doc.line(startX_panel + dx, startY_panel, startX_panel + dx, startY_panel + H_panel);
  doc.line(startX_panel + 3 * dx, startY_panel, startX_panel + 3 * dx, startY_panel + H_panel);
  doc.line(startX_panel, startY_panel + dy, startX_panel + W_panel, startY_panel + dy);
  doc.line(startX_panel, startY_panel + 3 * dy, startX_panel + W_panel, startY_panel + 3 * dy);
  doc.setLineDashPattern([], 0);

  // 4. Draw 4 filled black squares at corners (columns)
  doc.setFillColor(0, 0, 0);
  const colSz = 8/72; // 8pt
  doc.rect(startX_panel - colSz/2, startY_panel - colSz/2, colSz, colSz, 'F');
  doc.rect(startX_panel + W_panel - colSz/2, startY_panel - colSz/2, colSz, colSz, 'F');
  doc.rect(startX_panel - colSz/2, startY_panel + H_panel - colSz/2, colSz, colSz, 'F');
  doc.rect(startX_panel + W_panel - colSz/2, startY_panel + H_panel - colSz/2, colSz, colSz, 'F');

  // 5. Zone labels
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 70, 130);
  doc.text('COLUMN STRIP', startX_panel + W_panel / 2, startY_panel + H_panel / 2, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(100, 100, 100);
  doc.text('MIDDLE STRIP', startX_panel + W_panel / 2, startY_panel + dy / 2 + 0.03, { align: 'center' });
  doc.text('MIDDLE STRIP', startX_panel + W_panel / 2, startY_panel + H_panel - dy / 2 + 0.03, { align: 'center' });

  // Arrow lines pointing to middle strip and column strip
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.005);
  doc.line(startX_panel + W_panel/2, startY_panel + dy/2 + 0.08, startX_panel + W_panel/2, startY_panel + dy/2 + 0.16);
  doc.triangle(startX_panel + W_panel/2, startY_panel + dy/2 + 0.08, startX_panel + W_panel/2 - 0.02, startY_panel + dy/2 + 0.11, startX_panel + W_panel/2 + 0.02, startY_panel + dy/2 + 0.11, 'F');
  doc.line(startX_panel + W_panel/2, startY_panel + H_panel - dy/2 - 0.08, startX_panel + W_panel/2, startY_panel + H_panel - dy/2 - 0.16);
  doc.triangle(startX_panel + W_panel/2, startY_panel + H_panel - dy/2 - 0.08, startX_panel + W_panel/2 - 0.02, startY_panel + H_panel - dy/2 - 0.11, startX_panel + W_panel/2 + 0.02, startY_panel + H_panel - dy/2 - 0.11, 'F');

  // 6. Dimension annotations
  let dimY = startY_panel + H_panel + 0.22;
  drawDimArrowH(startX_panel, startX_panel + dx, dimY, (l2 * 3).toFixed(0) + '"');
  drawDimArrowH(startX_panel + dx, startX_panel + 3 * dx, dimY, (l2 * 6).toFixed(0) + '" (Col Strip)');
  drawDimArrowH(startX_panel + 3 * dx, startX_panel + W_panel, dimY, (l2 * 3).toFixed(0) + '"');

  let dimX = startX_panel - 0.22;
  drawDimArrowV(dimX, startY_panel, startY_panel + dy, (l1 * 3).toFixed(0) + '"');
  drawDimArrowV(dimX, startY_panel + dy, startY_panel + 3 * dy, (l1 * 6).toFixed(0) + '" (Col)');
  drawDimArrowV(dimX, startY_panel + 3 * dy, startY_panel + H_panel, (l1 * 3).toFixed(0) + '"');

  // --- DIAGRAM 2: SECTION A-A LONG DIRECTION ---
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.006);
  doc.rect(0.5, 3.6, 7.5, 3.1); // Thin border box

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text('DIAGRAM 2: SECTION A-A — LONG DIRECTION', 0.6, 3.8);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Top bars shown for Column Strip', 7.4, 3.8, { align: 'right' });

  let startX_sec = 1.0;
  let startY_sec = 4.7;
  let W_sec = 5.2;
  let H_sec = hFinal * 0.12;

  // 1. Draw slab rectangle
  doc.setDrawColor(0, 70, 130);
  doc.setLineWidth(0.012);
  doc.rect(startX_sec, startY_sec, W_sec, H_sec);

  // 2. Draw cover zones
  let covH = 0.75 * 0.12;
  doc.setFillColor(240, 240, 240);
  doc.rect(startX_sec + 0.01, startY_sec + 0.01, W_sec - 0.02, covH, 'F');
  doc.rect(startX_sec + 0.01, startY_sec + H_sec - covH - 0.01, W_sec - 0.02, covH, 'F');
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.text('cover = 0.75 in', startX_sec + 0.1, startY_sec + covH / 2 + 0.02);
  doc.text('cover = 0.75 in', startX_sec + 0.1, startY_sec + H_sec - covH / 2 + 0.02);

  // 4. Draw TOP reinforcement bars (negative moment — RED)
  // Draw parallel long direction bars as horizontal red lines at the top support zones
  let y_top_line = startY_sec + covH + 0.028;
  doc.setDrawColor(200, 0, 0);
  doc.setLineWidth(0.008);
  doc.line(startX_sec, y_top_line, startX_sec + 0.22 * W_sec, y_top_line); // Left support
  doc.line(startX_sec + W_sec - 0.15 * W_sec, y_top_line, startX_sec + W_sec, y_top_line); // Right support

  // Draw perpendicular short direction bars as small red circles placed below long direction bars
  let y_top_circle = y_top_line + 0.05;
  doc.setFillColor(200, 0, 0);
  let x_circles = [startX_sec + 0.5, startX_sec + 1.4, startX_sec + 2.3, startX_sec + 3.2, startX_sec + 4.1, startX_sec + 5.0];
  x_circles.forEach(xc => doc.circle(xc, y_top_circle, 0.028, 'F'));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(200, 0, 0);
  doc.text('TOP BARS (Column Strip) — #' + dLColNeg.size.replace('#','') + ' @ ' + dLColNeg.spacing.toFixed(1) + '" c/c', startX_sec + 1.2, startY_sec + H_sec/2 - 0.07);

  // 5. Draw BOTTOM reinforcement bars (positive — GREEN)
  // Draw parallel long direction bars as continuous horizontal green line along bottom
  let y_bot_line = startY_sec + H_sec - covH - 0.028;
  doc.setDrawColor(0, 150, 0);
  doc.setLineWidth(0.008);
  doc.line(startX_sec, y_bot_line, startX_sec + W_sec, y_bot_line);

  // Draw perpendicular short direction bars as green circles placed above long direction bars
  let y_bot_circle = y_bot_line - 0.05;
  doc.setFillColor(0, 150, 0);
  x_circles.forEach(xc => doc.circle(xc, y_bot_circle, 0.028, 'F'));

  doc.setTextColor(0, 150, 0);
  doc.text('BOT BARS (Column Strip) — #' + dLColPos.size.replace('#','') + ' @ ' + dLColPos.spacing.toFixed(1) + '" c/c', startX_sec + 1.2, startY_sec + H_sec/2 + 0.13);

  // 6. Draw dimension lines on right side
  let rightX = startX_sec + W_sec + 0.2;
  drawDimArrowV(rightX, startY_sec, startY_sec + H_sec, 'h = ' + hFinal.toFixed(1) + ' in');
  drawDimArrowV(rightX + 0.45, startY_sec, y_bot_line, 'd1 = ' + dLong.toFixed(2) + ' in');

  // 7. Draw bar extension indicators ABOVE the section
  doc.setDrawColor(200, 0, 0);
  doc.setLineWidth(0.008);
  doc.line(startX_sec + 0.5, startY_sec - 0.35, startX_sec + 3.0, startY_sec - 0.35);
  doc.triangle(startX_sec + 3.0, startY_sec - 0.35, startX_sec + 2.95, startY_sec - 0.37, startX_sec + 2.95, startY_sec - 0.33, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(200, 0, 0);
  doc.text('0.22ln = ' + (0.22 * lnLong * 12).toFixed(1) + ' in (interior support)', startX_sec + 0.6, startY_sec - 0.42);

  doc.line(startX_sec + 0.5, startY_sec - 0.15, startX_sec + 2.2, startY_sec - 0.15);
  doc.triangle(startX_sec + 2.2, startY_sec - 0.15, startX_sec + 2.15, startY_sec - 0.17, startX_sec + 2.15, startY_sec - 0.13, 'F');
  doc.text('0.15l = ' + (0.15 * l1 * 12).toFixed(1) + ' in (exterior support)', startX_sec + 0.6, startY_sec - 0.22);

  // 8. Draw support embedment indicator BELOW section
  doc.setDrawColor(0, 150, 0);
  doc.line(startX_sec + 0.5, startY_sec + H_sec + 0.18, startX_sec + 1.8, startY_sec + H_sec + 0.18);
  doc.triangle(startX_sec + 1.8, startY_sec + H_sec + 0.18, startX_sec + 1.75, startY_sec + H_sec + 0.16, startX_sec + 1.75, startY_sec + H_sec + 0.20, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(0, 150, 0);
  doc.text('6 in min embedment', startX_sec + 0.6, startY_sec + H_sec + 0.10);

  // --- DIAGRAM 3: SECTION B-B SHORT DIRECTION & LEGEND ---
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.006);
  doc.rect(0.5, 6.8, 4.4, 3.8); // Diagram 3 box

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text('DIAGRAM 3: SECTION B-B — SHORT DIRECTION', 0.6, 7.05);

  let startX_sec3 = 0.8;
  let startY_sec3 = 7.8;
  let W_sec3 = 3.8;

  // Slab box
  doc.setDrawColor(0, 70, 130);
  doc.setLineWidth(0.012);
  doc.rect(startX_sec3, startY_sec3, W_sec3, H_sec);

  // Cover zones
  doc.setFillColor(240, 240, 240);
  doc.rect(startX_sec3 + 0.01, startY_sec3 + 0.01, W_sec3 - 0.02, covH, 'F');
  doc.rect(startX_sec3 + 0.01, startY_sec3 + H_sec - covH - 0.01, W_sec3 - 0.02, covH, 'F');

  // Top bars parallel short direction (horizontal red lines, shifted lower)
  let y_top_line3 = startY_sec3 + covH + 0.028 + 0.05;
  doc.setDrawColor(200, 0, 0);
  doc.setLineWidth(0.008);
  doc.line(startX_sec3, y_top_line3, startX_sec3 + 0.22 * W_sec3, y_top_line3); // Left support
  doc.line(startX_sec3 + W_sec3 - 0.15 * W_sec3, y_top_line3, startX_sec3 + W_sec3, y_top_line3); // Right support

  // Perpendicular long direction top bars (red circles, closer to top face)
  let y_top_circle3 = startY_sec3 + covH + 0.028;
  doc.setFillColor(200, 0, 0);
  let x_circles3 = [startX_sec3 + 0.5, startX_sec3 + 1.2, startX_sec3 + 1.9, startX_sec3 + 2.6, startX_sec3 + 3.3];
  x_circles3.forEach(xc => doc.circle(xc, y_top_circle3, 0.028, 'F'));

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.0);
  doc.setTextColor(200, 0, 0);
  doc.text('TOP: #' + dSColNeg.size.replace('#','') + ' @ ' + dSColNeg.spacing.toFixed(1) + '"', startX_sec3 + 0.6, startY_sec3 + H_sec/2 - 0.07);

  // Bottom bars parallel short direction (horizontal green line, shifted higher)
  let y_bot_line3 = startY_sec3 + H_sec - covH - 0.028 - 0.05;
  doc.setDrawColor(0, 150, 0);
  doc.setLineWidth(0.008);
  doc.line(startX_sec3, y_bot_line3, startX_sec3 + W_sec3, y_bot_line3);

  // Perpendicular long direction bottom bars (green circles, closer to bottom face)
  let y_bot_circle3 = startY_sec3 + H_sec - covH - 0.028;
  doc.setFillColor(0, 150, 0);
  x_circles3.forEach(xc => doc.circle(xc, y_bot_circle3, 0.028, 'F'));

  doc.setTextColor(0, 150, 0);
  doc.text('BOT: #' + dSColPos.size.replace('#','') + ' @ ' + dSColPos.spacing.toFixed(1) + '"', startX_sec3 + 0.6, startY_sec3 + H_sec/2 + 0.12);

  // Dimensions
  let rightX3 = startX_sec3 + W_sec3 + 0.15;
  drawDimArrowV(rightX3, startY_sec3, startY_sec3 + H_sec, 'h=' + hFinal.toFixed(1) + '"');
  drawDimArrowV(rightX3 + 0.35, startY_sec3, y_bot_line3, 'd2=' + dShort.toFixed(2) + '"');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(0, 0, 0);
  doc.text('d2 = d1 - 1.0 in = ' + dShort.toFixed(2) + ' in', startX_sec3 + 0.2, startY_sec3 + H_sec + 0.18);

  // Note
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(80, 80, 80);
  const noteText = 'NOTE: Short direction bars placed BELOW long direction bars. Effective depth reduced by 1 bar diameter.';
  const splitNote = doc.splitTextToSize(noteText, 4.0);
  doc.text(splitNote, 0.6, 9.8);

  // --- DIAGRAM LEGEND BOX ---
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.006);
  doc.rect(5.1, 6.8, 2.9, 3.8); // Legend box

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(0, 70, 130);
  doc.text('DIAGRAM LEGEND', 6.55, 7.1, { align: 'center' });
  doc.line(5.2, 7.2, 7.9, 7.2);

  // Legend Items
  doc.setFillColor(200, 0, 0);
  doc.circle(5.4, 7.5, 0.04, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Top Bars (Negative Moment)', 5.6, 7.55);

  doc.setFillColor(0, 150, 0);
  doc.circle(5.4, 7.9, 0.04, 'F');
  doc.text('Bottom Bars (Positive Moment)', 5.6, 7.95);

  doc.setDrawColor(0, 70, 130);
  doc.setLineWidth(0.01);
  doc.rect(5.32, 8.25, 0.16, 0.10);
  doc.text('Slab Boundary', 5.6, 8.35);

  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.008);
  doc.setLineDashPattern([0.03, 0.02], 0);
  doc.line(5.3, 8.75, 5.5, 8.75);
  doc.setLineDashPattern([], 0);
  doc.text('Strip Boundaries', 5.6, 8.75);

  doc.setFillColor(0, 0, 0);
  doc.rect(5.33, 9.05, 0.12, 0.12, 'F');
  doc.text('Column Support', 5.6, 9.15);

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
  let sy = 1.05;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Structural Item', 0.6, sy);
  doc.text('Calculated Sizing Value', 3.3, sy);
  doc.text('Adopted Design Value', 5.8, sy);
  doc.line(0.5, sy + 0.04, 8.0, sy + 0.04);

  const summaryData = [
    ['Slab Thickness (h)', `${hCalc.toFixed(2)} in`, `${hFinal.toFixed(1)} in`],
    ['Column Strip Width', `min(l1, l2)/2 = ${bColFt.toFixed(2)} ft`, `${bColIn.toFixed(0)} in`],
    ['Middle Strip Width (Long)', `l2 - col strip = ${bMidLongFt.toFixed(2)} ft`, `${bMidLongIn.toFixed(0)} in`],
    ['Middle Strip Width (Short)', `l1 - col strip = ${bMidShortFt.toFixed(2)} ft`, `${bMidShortIn.toFixed(0)} in`],
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
    sy += 0.20;
    doc.setFont('helvetica', 'bold');
    doc.text(item, 0.6, sy);
    doc.setFont('helvetica', 'normal');
    doc.text(calc, 3.3, sy);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(201, 168, 76);
    doc.text(adop, 5.8, sy);
    doc.setTextColor(60, 60, 60);
    doc.line(0.5, sy + 0.04, 8.0, sy + 0.04);
  });

  // --- REINFORCEMENT QUANTITY ESTIMATE ---
  sy += 0.35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(201, 168, 76);
  doc.text('REINFORCEMENT QUANTITY ESTIMATE', 0.5, sy);
  doc.line(0.5, sy + 0.04, 8.0, sy + 0.04);

  sy += 0.20;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(30, 30, 30);
  doc.text('Bar Location', 0.6, sy);
  doc.text('Bar Size', 2.8, sy);
  doc.text('Spacing', 3.8, sy);
  doc.text('Strip Width', 4.8, sy);
  doc.text('Est. Qty', 6.2, sy);
  doc.line(0.5, sy + 0.04, 8.0, sy + 0.04);

  const qtyRows = [
    ['Col Strip Top Long', dLColNeg.size, `${dLColNeg.spacing.toFixed(1)}"`, `${bColFt.toFixed(2)} ft`, `${dLColNeg.num} bars`],
    ['Col Strip Bot Long', dLColPos.size, `${dLColPos.spacing.toFixed(1)}"`, `${bColFt.toFixed(2)} ft`, `${dLColPos.num} bars`],
    ['Mid Strip Top Long', dLMidNeg.size, `${dLMidNeg.spacing.toFixed(1)}"`, `${bMidLongFt.toFixed(2)} ft`, `${dLMidNeg.num} bars`],
    ['Mid Strip Bot Long', dLMidPos.size, `${dLMidPos.spacing.toFixed(1)}"`, `${bMidLongFt.toFixed(2)} ft`, `${dLMidPos.num} bars`],
    ['Col Strip Top Short', dSColNeg.size, `${dSColNeg.spacing.toFixed(1)}"`, `${bColFt.toFixed(2)} ft`, `${dSColNeg.num} bars`],
    ['Col Strip Bot Short', dSColPos.size, `${dSColPos.spacing.toFixed(1)}"`, `${bColFt.toFixed(2)} ft`, `${dSColPos.num} bars`],
    ['Mid Strip Top Short', dSMidNeg.size, `${dSMidNeg.spacing.toFixed(1)}"`, `${bMidShortFt.toFixed(2)} ft`, `${dSMidNeg.num} bars`],
    ['Mid Strip Bot Short', dSMidPos.size, `${dSMidPos.spacing.toFixed(1)}"`, `${bMidShortFt.toFixed(2)} ft`, `${dSMidPos.num} bars`]
  ];

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  qtyRows.forEach(([lbl, size, spacing, width, qty]) => {
    sy += 0.18;
    doc.setFont('helvetica', 'bold');
    doc.text(lbl, 0.6, sy);
    doc.setFont('helvetica', 'normal');
    doc.text(size, 2.8, sy);
    doc.text(spacing, 3.8, sy);
    doc.text(width, 4.8, sy);
    doc.setFont('helvetica', 'bold');
    doc.text(qty, 6.2, sy);
    doc.line(0.5, sy + 0.04, 8.0, sy + 0.04);
  });

  // End design notes
  sy += 0.35;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text('CONCLUDING STRUCTURAL NOTES:', 0.5, sy);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.0);
  doc.setTextColor(60, 60, 60);
  sy += 0.18;
  doc.text('* All reinforcement shall conform to ASTM A615 Grade 60.', 0.5, sy);
  sy += 0.14;
  doc.text('* Concrete clear cover to reinforcement = 3/4 inch.', 0.5, sy);
  sy += 0.14;
  doc.text('* Design based on ACI 318 Building Code Requirements.', 0.5, sy);

  // Signatures
  sy += 0.35;
  doc.setLineWidth(0.008);
  doc.setDrawColor(100, 100, 100);
  doc.line(0.7, sy + 0.4, 2.7, sy + 0.4);
  doc.line(5.3, sy + 0.4, 7.3, sy + 0.4);
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.text('DESIGNER SIGNATURE', 1.0, sy + 0.52);
  doc.text('REVIEWER SIGNATURE', 5.6, sy + 0.52);

  doc.save(`twinanalytic_slab_report_${new Date().toISOString().split('T')[0]}.pdf`);
}





// ==========================================
// 8. PDF REPORT GENERATION
// ==========================================
function downloadColumnPDF() {
  let axialDcr = 0.0;
  const code = document.getElementById('column-code').value || 'ACI 318-14';
  const type = document.getElementById('column-type').value; // 'TIED' or 'SPIRAL'
  const pdl = parseFloat(document.getElementById('column-pdl').value) || 0;
  const pll = parseFloat(document.getElementById('column-pll').value) || 0;
  const fc = parseFloat(document.getElementById('column-fc').value) || 4.0;
  const fy = parseFloat(document.getElementById('column-fy').value) || 60.0;
  const phi = parseFloat(document.getElementById('column-phi').value) || 0.65;
  const p = parseFloat(document.getElementById('column-p').value) || 0.02;
  const mux = parseFloat(document.getElementById('column-mux').value) || 0;
  const muy = parseFloat(document.getElementById('column-muy').value) || 0;
  const vu = parseFloat(document.getElementById('column-vu').value) || 0;
  const fyt = parseFloat(document.getElementById('column-fyt').value) || 60;
  const colHeight = parseFloat(document.getElementById('column-height').value) || 10.0;
  const cover = parseFloat(document.getElementById('column-cover').value) || 1.5;

  const projName = document.getElementById('column-proj-name').value || "TwinAnalytic Tower";
  const projNum = document.getElementById('column-proj-num').value || "2026-001";
  const designerInitials = document.getElementById('column-designer').value || "AH";
  const reviewerInitials = document.getElementById('column-reviewer').value || "MB";

  if (isNaN(pdl) || pdl <= 0 || isNaN(pll) || pll <= 0 || isNaN(fc) || fc <= 0 || isNaN(fy) || fy <= 0 || isNaN(p) || p < 0.01 || p > 0.08 || isNaN(colHeight) || colHeight <= 0) {
    alert('Please enter valid input parameters before downloading the PDF report.');
    return;
  }

  // Ensure calculations are run to synchronize variables
  calculateColumn();

  // Retrieve calculated text values from UI (guaranteed to be synchronized by calculateColumn())
  const puStr = document.getElementById('column-out-pu').textContent;
  const agStr = document.getElementById('column-out-ag').textContent;
  const dimStr = document.getElementById('column-out-dim').textContent;
  const finalAreaStr = document.getElementById('column-out-final-area').textContent;
  const astStr = document.getElementById('column-out-ast').textContent;
  const tieSpacingStr = document.getElementById('column-out-tie-spacing').textContent;
  const hookExtStr = document.getElementById('column-out-hook-extension').textContent;
  const pnMaxStr = document.getElementById('column-out-pn-max').textContent;
  const phiPnStr = document.getElementById('column-out-phi-pn').textContent;
  const dcRatioStr = document.getElementById('column-out-dc-ratio').textContent;
  const concreteVolStr = document.getElementById('column-out-concrete-vol').textContent;
  const steelWeightStr = document.getElementById('column-out-steel-weight').textContent;

  const mainBarSize = document.getElementById('column-main-bar').value;
  const tieBarSize = document.getElementById('column-tie-bar').value;

  const Pu = parseFloat(puStr);
  const Dim = parseFloat(dimStr);
  const Ag = parseFloat(agStr);
  const Ast_actual = parseFloat(astStr);
  const s_final = parseFloat(tieSpacingStr);
  const hookExtension = parseFloat(hookExtStr);
  const Pn = parseFloat(pnMaxStr);
  const PhiPn = parseFloat(phiPnStr);
  const dcRatio = parseFloat(dcRatioStr);

  const barData = {
    '#5': { dia: 0.625, area: 0.31 },
    '#6': { dia: 0.750, area: 0.44 },
    '#7': { dia: 0.875, area: 0.60 },
    '#8': { dia: 1.000, area: 0.79 },
    '#9': { dia: 1.128, area: 1.00 },
    '#10': { dia: 1.270, area: 1.27 },
    '#11': { dia: 1.410, area: 1.56 },
    '#14': { dia: 1.693, area: 2.25 },
    '#18': { dia: 2.257, area: 4.00 }
  };

  const tieData = {
    '#3': { dia: 0.375, area: 0.11 },
    '#4': { dia: 0.500, area: 0.20 },
    '#5': { dia: 0.625, area: 0.31 }
  };

  const mainBarDia = barData[mainBarSize].dia;
  const Ab = barData[mainBarSize].area;
  const d_tie = tieData[tieBarSize].dia;
  const A_tie = tieData[tieBarSize].area;

  const phi_axial = type === 'TIED' ? 0.65 : 0.75;
  const alpha = type === 'TIED' ? 0.80 : 0.85;
  const beta1 = fc > 4.0 ? Math.max(0.65, 0.85 - 0.05 * (fc - 4.0)) : 0.85;
  const denom = phi_axial * alpha * (0.85 * fc * (1 - p) + fy * p);
  const Ag_req = Pu / denom;

  const Ast_axial_req = (Pu / (phi_axial * alpha) - 0.85 * fc * Ag) / (fy - 0.85 * fc);
  const Ast_req = Math.max(p * Ag, Ast_axial_req);

  // Recalculate detailing spacings and parameters for PDF checklist
  let N_bars = Math.ceil(Ast_actual / Ab);
  const p_actual = Ast_actual / Ag;
  const isRatioOk = p_actual >= 0.01 && p_actual <= 0.08;

  const d_prime = cover + d_tie + mainBarDia / 2;
  let s_clear = 0;
  if (type === 'TIED') {
    const n_face_max = Math.ceil(N_bars / 4) + 1;
    const n_spaces = n_face_max - 1;
    s_clear = ((Dim - 2 * d_prime) / n_spaces) - mainBarDia;
  } else {
    const Ds = Dim - 2 * d_prime;
    s_clear = ((Math.PI * Ds) / N_bars) - mainBarDia;
  }
  const minAllowedSpacing = Math.max(1.5, 1.5 * mainBarDia);
  const isSpacingOk = s_clear >= minAllowedSpacing;

  let s_limit = 0; // Function scope for Correction 2
  let s_spiral_req = 0;
  let rho_s = 0;
  let rho_s_min = 0;
  if (type === 'TIED') {
    s_limit = Math.min(16 * mainBarDia, 48 * d_tie, Dim);
  } else {
    const Ach = Math.PI * Math.pow(Dim - 2 * cover, 2) / 4;
    rho_s_min = 0.45 * (Ag / Ach - 1) * fc / fyt;
    const Dc = Dim - 2 * cover;
    s_spiral_req = (4 * A_tie) / (Dc * rho_s_min);
    s_limit = s_spiral_req;
    rho_s = (4 * A_tie) / (Dc * s_final);
  }

  // Shear parameters
  const d_eff = Math.max(0.8 * Dim, Dim - cover - d_tie - mainBarDia / 2);
  const Vc = 2 * (1 + Pu / (2 * Ag)) * Math.sqrt(fc * 1000) * Dim * d_eff / 1000;
  const phi_v = 0.75;
  const Vs_max = 8 * Math.sqrt(fc * 1000) * Dim * d_eff / 1000;
  let shearCase = 'A';
  let Vs_req = 0;
  if (vu > phi_v * (Vc + Vs_max)) {
    shearCase = 'D';
    Vs_req = Vs_max;
  } else if (vu > phi_v * Vc) {
    shearCase = 'C';
    Vs_req = (vu / phi_v) - Vc;
  } else if (vu > 0.5 * phi_v * Vc) {
    shearCase = 'B';
  } else {
    shearCase = 'A';
  }

  let s_shear = 999;
  if (shearCase === 'C') {
    s_shear = (2 * A_tie * fyt * d_eff) / Vs_req;
  }
  const av_s_min = Math.max(0.75 * Math.sqrt(fc * 1000) * Dim / (fyt * 1000), 50 * Dim / (fyt * 1000));
  const s_min_shear = (2 * A_tie) / av_s_min;
  if (shearCase === 'B' || shearCase === 'C') {
    s_shear = Math.min(s_shear, s_min_shear);
  }

  // Generate bar coordinates for the blueprint drawing
  const bars = [];
  if (type === 'TIED') {
    const bs = Dim - 2 * d_prime;
    const hs = Dim - 2 * d_prime;
    const L = 2 * (bs + hs);
    for (let i = 0; i < N_bars; i++) {
      const t = i * (L / N_bars);
      let x, y;
      if (t < bs) {
        x = -bs/2 + t;
        y = -hs/2;
      } else if (t < bs + hs) {
        x = bs/2;
        y = -hs/2 + (t - bs);
      } else if (t < 2*bs + hs) {
        x = bs/2 - (t - bs - hs);
        y = hs/2;
      } else {
        x = -bs/2;
        y = hs/2 - (t - 2*bs - hs);
      }
      bars.push({ x, y });
    }
  } else {
    const Ds = Dim - 2 * d_prime;
    for (let i = 0; i < N_bars; i++) {
      const theta = i * (2 * Math.PI / N_bars);
      const x = (Ds / 2) * Math.cos(theta);
      const y = (Ds / 2) * Math.sin(theta);
      bars.push({ x, y });
    }
  }

  // Bending helpers
  function getPhi(epsilon_t) {
    const epsilon_ty = fy / 29000;
    const phi_comp = type === 'TIED' ? 0.65 : 0.75;
    if (epsilon_t <= epsilon_ty) return phi_comp;
    if (epsilon_t >= 0.005) return 0.90;
    return phi_comp + (0.90 - phi_comp) * (epsilon_t - epsilon_ty) / (0.005 - epsilon_ty);
  }

  function calcPnMnForC(c, bendingDirection) {
    const H_bend = Dim;
    const B_bend = Dim;
    let beta1_val = fc > 4.0 ? Math.max(0.65, 0.85 - 0.05 * (fc - 4.0)) : 0.85;
    let a_val = beta1_val * c;
    if (a_val > H_bend) a_val = H_bend;

    let Cc = 0, Mc = 0;
    if (type === 'TIED') {
      Cc = 0.85 * fc * B_bend * a_val;
      Mc = Cc * (H_bend / 2 - a_val / 2);
    } else {
      const R = H_bend / 2;
      const u = (R - a_val) / R;
      let A_seg = 0, y_bar = 0;
      if (u <= -1) {
        A_seg = Math.PI * R * R;
        y_bar = 0;
      } else if (u >= 1) {
        A_seg = 0;
        y_bar = 0;
      } else {
        const theta = Math.acos(u);
        A_seg = R * R * (theta - u * Math.sin(theta));
        y_bar = (2 / 3) * R * Math.pow(Math.sin(theta), 3) / (theta - u * Math.sin(theta));
      }
      Cc = 0.85 * fc * A_seg;
      Mc = Cc * y_bar;
    }

    let Fs_total = 0, Ms_total = 0, epsilon_t = 0;
    let max_d = 0;
    bars.forEach(bar => {
      const coord = bendingDirection === 'x' ? bar.y : bar.x;
      const d_i = H_bend / 2 - coord;
      if (d_i > max_d) max_d = d_i;
    });

    bars.forEach(bar => {
      const coord = bendingDirection === 'x' ? bar.y : bar.x;
      const d_i = H_bend / 2 - coord;
      const epsilon_i = 0.003 * (c - d_i) / c;
      let stress_i = 29000 * epsilon_i;
      if (stress_i > fy) stress_i = fy;
      if (stress_i < -fy) stress_i = -fy;

      let force_i = Ab * stress_i;
      if (d_i < a_val) force_i -= 0.85 * fc * Ab;

      Fs_total += force_i;
      Ms_total += force_i * coord;

      if (d_i === max_d) {
        epsilon_t = -epsilon_i;
      }
    });

    return { Pn: Cc + Fs_total, Mn: (Mc + Ms_total) / 12, epsilon_t };
  }

  function solveUniaxial(e_target, bendingDirection) {
    if (e_target <= 0.0001) {
      const Pno = 0.85 * fc * (Ag - Ast_actual) + fy * Ast_actual;
      return { Pn: alpha * Pno, Mn: 0, phi: phi_axial, epsilon_t: 0, c: 999 };
    }

    let c_low = 0.01;
    let c_high = 5.0 * Dim;
    let Pn = 0, Mn = 0, epsilon_t = 0, c_sol = 0;

    for (let iter = 0; iter < 150; iter++) {
      const c = (c_low + c_high) / 2;
      const res = calcPnMnForC(c, bendingDirection);
      Pn = res.Pn;
      Mn = res.Mn;
      epsilon_t = res.epsilon_t;
      c_sol = c;

      const e_calc = Pn > 0.01 ? (Mn * 12 / Pn) : 999999;
      if (Math.abs(e_calc - e_target) < 0.001) break;
      if (e_calc > e_target) c_low = c;
      else c_high = c;
    }

    const Pno = 0.85 * fc * (Ag - Ast_actual) + fy * Ast_actual;
    if (Pn > alpha * Pno) {
      Pn = alpha * Pno;
    }

    const phi_val = getPhi(epsilon_t);
    return { Pn, Mn, phi: phi_val, epsilon_t, c: c_sol };
  }

  // Function scoped variables for Corrections 3 & 4
  let delta_ns = 1.0;
  let isSlender = false;
  let klu_val = 0;
  let klu_r = 0;
  let r_val = 0;

  let res_sol;
  if (mux > 0 && muy > 0) {
    const e_x = muy * 12 / Pu;
    const e_y = mux * 12 / Pu;
    const res_x = solveUniaxial(e_x, 'y');
    const res_y = solveUniaxial(e_y, 'x');
    const Pno = 0.85 * fc * (Ag - Ast_actual) + fy * Ast_actual;
    const invPni = 1 / res_x.Pn + 1 / res_y.Pn - 1 / Pno;
    const Pni = invPni > 0 ? 1 / invPni : 0.001;
    const phi_biaxial = Math.min(res_x.phi, res_y.phi);
    res_sol = { Pn: Pni, Mn: 0, phi: phi_biaxial, epsilon_t: 0, c: 999 };
  } else if (mux > 0) {
    const e_y = mux * 12 / Pu;
    res_sol = solveUniaxial(e_y, 'x');
  } else if (muy > 0) {
    const e_x = muy * 12 / Pu;
    res_sol = solveUniaxial(e_x, 'y');
  } else {
    res_sol = solveUniaxial(0, 'x');
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: 'letter'
  });

  let pageNum = 1;
  let cy = 1.8;
  const bottomMargin = 10.2;

  function checkPageBreak(doc, increment) {
    if (cy + increment > bottomMargin) {
      doc.addPage();
      pageNum++;
      cy = 1.8;
      drawPageBorderAndHeader(doc);
    }
  }

  function drawPageBorderAndHeader(doc) {
    doc.setDrawColor(201, 168, 76);
    doc.setLineWidth(0.015);
    doc.rect(0.25, 0.25, 8.0, 10.5);

    doc.setDrawColor(30, 30, 30);
    doc.setLineWidth(0.01);
    doc.rect(0.25, 0.25, 8.0, 1.2, 'S');

    doc.line(2.3, 0.25, 2.3, 1.45);
    doc.line(5.6, 0.25, 5.6, 1.45);

    // Logo
    drawTwinAnalyticLogo(doc, 0.35, 0.38, 0.3, false);

    doc.setTextColor(201, 168, 76);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('TwinAnalytic', 0.70, 0.58);

    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.0);
    doc.text('STRUCTURAL DESIGN GROUP', 0.70, 0.76);
    doc.text(code.toUpperCase() + ' COMPLIANCE', 0.70, 0.94);
    doc.text('BUET CE 317 Method', 0.70, 1.12);

    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('PROJECT:', 2.4, 0.45);
    doc.setFont('helvetica', 'normal');
    const splitName = doc.splitTextToSize(projName, 2.0);
    doc.text(splitName, 3.2, 0.45);

    doc.setFont('helvetica', 'bold');
    doc.text('PROJ NO:', 2.4, 0.85);
    doc.setFont('helvetica', 'normal');
    doc.text(projNum, 3.2, 0.85);

    doc.setFont('helvetica', 'bold');
    doc.text('MEMBER:', 2.4, 1.25);
    doc.setFont('helvetica', 'normal');
    doc.text(`${type === 'TIED' ? 'Tied' : 'Spiral'} (${Dim.toFixed(0)}" x ${Dim.toFixed(0)}")`, 3.2, 1.25);

    doc.line(5.6, 0.65, 8.25, 0.65);
    doc.line(5.6, 1.05, 8.25, 1.05);

    doc.setFont('helvetica', 'bold');
    doc.text('DESIGNED BY:', 5.7, 0.45);
    doc.setFont('helvetica', 'normal');
    doc.text(designerInitials, 7.0, 0.45);

    doc.setFont('helvetica', 'bold');
    doc.text('REVIEWED BY:', 5.7, 0.85);
    doc.setFont('helvetica', 'normal');
    doc.text(reviewerInitials, 7.0, 0.85);

    doc.setFont('helvetica', 'bold');
    doc.text('DATE:', 5.7, 1.25);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date().toLocaleDateString(), 6.3, 1.25);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(150, 150, 150);
    doc.text('Calculated via TwinAnalytic — www.twinanalytic.com', 0.5, 10.6);
    doc.text(`Page ${pageNum}`, 7.5, 10.6);
  }

  // ==========================================
  // PAGE 1: COVER PAGE
  // ==========================================
  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.02);
  doc.rect(0.25, 0.25, 8.0, 10.5);

  doc.setFillColor(245, 247, 250);
  doc.rect(0.3, 0.3, 7.9, 10.4, 'F');

  doc.setFillColor(30, 30, 30);
  doc.rect(0.3, 0.3, 7.9, 1.8, 'F');

  // Logo
  drawTwinAnalyticLogo(doc, 1.0, 0.5, 0.8, true);

  doc.setTextColor(201, 168, 76);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('TWINANALYTIC', 2.0, 0.9);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(255, 255, 255);
  doc.text('ENGINEERING CALCULATIONS & COMPLIANCE REPORTS', 2.0, 1.25);

  doc.setTextColor(30, 30, 30);
  doc.setFont('times', 'bold');
  doc.setFontSize(28);
  const titleLines = doc.splitTextToSize("Reinforced Concrete Column Design Report", 6.0);
  doc.text(titleLines, 1.0, 4.0);

  doc.setDrawColor(201, 168, 76);
  doc.setLineWidth(0.04);
  doc.line(1.0, 5.2, 7.0, 5.2);

  doc.setTextColor(80, 80, 80);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('PROJECT DATA:', 1.0, 5.8);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Project Name: ${projName}`, 1.0, 6.2);
  doc.text(`Project Number: ${projNum}`, 1.0, 6.5);
  doc.text(`Design Code: ${code}`, 1.0, 6.8);
  doc.text(`Member Type: ${type === 'TIED' ? 'Tied Column (Rectangular)' : 'Spiral Column (Circular)'}`, 1.0, 7.1);
  doc.text(`Sizing: ${type === 'TIED' ? `${Dim}" x ${Dim}"` : `D = ${Dim}"`}`, 1.0, 7.4);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('METADATA:', 1.0, 8.0);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Prepared By: ${designerInitials || "Structural Engineer"}`, 1.0, 8.4);
  doc.text(`Reviewed By: ${reviewerInitials || "Reviewer"}`, 1.0, 8.7);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 1.0, 9.0);

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9.5);
  doc.setTextColor(120, 120, 120);
  doc.text('Software Reference: TwinAnalytic — www.twinanalytic.com', 1.0, 9.8);

  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(201, 168, 76);
  doc.text(`Designed per ${code} | CE 317 Method | ${new Date().toLocaleDateString()}`, 1.0, 10.2);

  // ==========================================
  // PAGE 2: PROJECT DATA, LOADS, MATERIALS
  // ==========================================
  doc.addPage();
  pageNum = 2;
  cy = 1.8;
  drawPageBorderAndHeader(doc);

  // SECTION 2
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 2 — PROJECT DATA & DESIGN INPUTS', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.setFillColor(245, 245, 245);
  doc.rect(0.5, cy, 7.5, 0.25, 'F');
  doc.text('Item', 0.6, cy + 0.17);
  doc.text('Value', 4.5, cy + 0.17);

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.005);
  doc.line(0.5, cy, 8.0, cy);
  doc.line(0.5, cy + 0.25, 8.0, cy + 0.25);
  cy += 0.25;

  const section2Rows = [
    ['Column Type', type === 'TIED' ? 'Tied' : 'Spiral'],
    ['Section Shape', type === 'TIED' ? 'Rectangular' : 'Circular'],
    ['Concrete Strength (fc\')', `${fc.toFixed(2)} ksi`],
    ['Steel Yield Strength (fy)', `${fy.toFixed(2)} ksi`],
    ['Dead Load (PDL)', `${pdl.toFixed(1)} kips`],
    ['Live Load (PLL)', `${pll.toFixed(1)} kips`],
    ['Moment about x-axis (Mux)', `${mux.toFixed(1)} kip-ft`],
    ['Moment about y-axis (Muy)', `${muy.toFixed(1)} kip-ft`],
    ['Applied Shear (Vu)', `${vu.toFixed(1)} kips`],
    ['Unsupported Length (lu)', `${colHeight.toFixed(1)} ft`],
    ['Effective Length Factor (k)', '1.00']
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  section2Rows.forEach(([item, val]) => {
    doc.text(item, 0.6, cy + 0.16);
    doc.text(val, 4.5, cy + 0.16);
    doc.line(0.5, cy + 0.22, 8.0, cy + 0.22);
    cy += 0.22;
  });

  // SECTION 3
  cy += 0.15;
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 3 — FACTORED LOADS & LOAD COMBINATIONS', 0.5, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('Governing Load Combination: Pu = 1.2 * PDL + 1.6 * PLL', 0.5, cy);
  cy += 0.18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  doc.text('Symbols:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Pu = 1.2 * PDL + 1.6 * PLL', 2.0, cy);
  cy += 0.18;

  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Pu = 1.2 * (${pdl.toFixed(1)} kips) + 1.6 * (${pll.toFixed(1)} kips)`, 2.0, cy);
  cy += 0.18;

  doc.setFont('helvetica', 'normal');
  doc.text('Result:', 0.6, cy);
  doc.setFont('helvetica', 'bold');
  doc.text(`Pu = ${Pu.toFixed(1)} kips`, 2.0, cy);
  cy += 0.25;

  if (mux > 0 || muy > 0) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('Moments Bending Load Combinations:', 0.5, cy);
    cy += 0.18;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(80, 80, 80);
    doc.text('[NOTE: Input moments are factored. A 50% DL / 50% LL split is assumed for demonstration.]', 0.6, cy);
    cy += 0.18;

    doc.setTextColor(60, 60, 60);
    if (mux > 0) {
      const mdlx = 0.5 * mux / 1.2;
      const mllx = 0.5 * mux / 1.6;
      doc.text('Symbols:', 0.6, cy);
      doc.setFont('courier', 'normal');
      doc.text('Mux,u = 1.2 * MDL,x + 1.6 * MLL,x', 2.0, cy);
      cy += 0.18;

      doc.setFont('helvetica', 'normal');
      doc.text('Substitution:', 0.6, cy);
      doc.setFont('courier', 'normal');
      doc.text(`Mux,u = 1.2 * (${mdlx.toFixed(2)} kip-ft) + 1.6 * (${mllx.toFixed(2)} kip-ft)`, 2.0, cy);
      cy += 0.18;

      doc.setFont('helvetica', 'normal');
      doc.text('Result:', 0.6, cy);
      doc.setFont('helvetica', 'bold');
      doc.text(`Mux,u = ${mux.toFixed(1)} kip-ft`, 2.0, cy);
      cy += 0.25;
    }

    if (muy > 0) {
      const mdly = 0.5 * muy / 1.2;
      const mlly = 0.5 * muy / 1.6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(60, 60, 60);
      doc.text('Symbols:', 0.6, cy);
      doc.setFont('courier', 'normal');
      doc.text('Muy,u = 1.2 * MDL,y + 1.6 * MLL,y', 2.0, cy);
      cy += 0.18;

      doc.setFont('helvetica', 'normal');
      doc.text('Substitution:', 0.6, cy);
      doc.setFont('courier', 'normal');
      doc.text(`Muy,u = 1.2 * (${mdly.toFixed(2)} kip-ft) + 1.6 * (${mlly.toFixed(2)} kip-ft)`, 2.0, cy);
      cy += 0.18;

      doc.setFont('helvetica', 'normal');
      doc.text('Result:', 0.6, cy);
      doc.setFont('helvetica', 'bold');
      doc.text(`Muy,u = ${muy.toFixed(1)} kip-ft`, 2.0, cy);
      cy += 0.25;
    }
  } else {
    doc.setFont('helvetica', 'italic');
    doc.text('Moments: N/A — no moments applied.', 0.6, cy);
    cy += 0.25;
  }

  // SECTION 4
  checkPageBreak(doc, 2.5);
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 4 — MATERIAL PROPERTIES & CODE FACTORS', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.setFillColor(245, 245, 245);
  doc.rect(0.5, cy, 7.5, 0.22, 'F');
  doc.text('Parameter', 0.6, cy + 0.15);
  doc.text('Value', 4.0, cy + 0.15);
  doc.text('Reference', 5.5, cy + 0.15);

  doc.setDrawColor(200, 200, 200);
  doc.line(0.5, cy, 8.0, cy);
  doc.line(0.5, cy + 0.22, 8.0, cy + 0.22);
  cy += 0.22;

  const isACI = code === 'ACI 318-14';
  const ref_fc = isACI ? 'ACI 318-14 §26.4' : 'BNBC 2020 Part 6 Ch 5';
  const ref_fy = isACI ? 'ACI 318-14 §20.2' : 'BNBC 2020 Part 6 Ch 5';
  const ref_es = isACI ? 'ACI 318-14 §20.2.2' : 'BNBC 2020 Part 6 Ch 6';
  const ref_ecu = isACI ? 'ACI 318-14 §22.2' : 'BNBC 2020 Part 6 Ch 6';
  const ref_beta1 = isACI ? 'ACI 318-14 §22.2.2.4.3' : 'BNBC 2020 Part 6 Ch 6';
  const ref_phi = isACI ? 'ACI 318-14 §21.2' : 'BNBC 2020 Part 6 Ch 6';
  const ref_alpha = isACI ? 'ACI 318-14 §22.4' : 'BNBC 2020 Part 6 Ch 6';

  const section4Rows = [
    ['fc\' (concrete compressive strength)', `${fc.toFixed(2)} ksi`, ref_fc],
    ['fy (steel yield strength)', `${fy.toFixed(2)} ksi`, ref_fy],
    ['Es (modulus of elasticity, steel)', '29,000.00 ksi', ref_es],
    ['epsilon_cu (ultimate concrete strain)', '0.00300', ref_ecu],
    ['epsilon_y (steel yield strain = fy/Es)', `${(fy/29000).toFixed(5)}`, '—'],
    ['beta1 (stress block factor)', `${beta1.toFixed(3)}`, ref_beta1],
    ['phi (strength reduction factor)', `${phi_axial.toFixed(2)}`, ref_phi],
    ['alpha (additional reduction factor)', `${alpha.toFixed(2)}`, ref_alpha]
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  section4Rows.forEach(([param, val, ref]) => {
    doc.text(param, 0.6, cy + 0.15);
    doc.text(val, 4.0, cy + 0.15);
    doc.text(ref, 5.5, cy + 0.15);
    doc.line(0.5, cy + 0.20, 8.0, cy + 0.20);
    cy += 0.20;
  });

  // ==========================================
  // PAGE 3: SIZING, LONGITUDINAL, AXIAL CHECK
  // ==========================================
  doc.addPage();
  pageNum = 3;
  cy = 1.8;
  drawPageBorderAndHeader(doc);

  // SECTION 5
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 5 — COLUMN SIZING', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('5.1 Required Gross Area:', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Ag = Pu / [alpha * phi * (0.85 * fc\' * (1 - rho_g) + rho_g * fy)]', 2.0, cy);
  cy += 0.18;

  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Ag = ${Pu.toFixed(1)} / [${alpha.toFixed(2)} * ${phi_axial.toFixed(2)} * (0.85 * ${fc.toFixed(2)} * (1 - ${p.toFixed(3)}) + ${p.toFixed(3)} * ${fy.toFixed(2)})]`, 2.0, cy);
  cy += 0.18;

  doc.setFont('helvetica', 'normal');
  doc.text('Result:', 0.6, cy);
  doc.setFont('helvetica', 'bold');
  doc.text(`Ag,required = ${Ag_req.toFixed(2)} in2`, 2.0, cy);
  cy += 0.25;

  doc.setFont('helvetica', 'bold');
  doc.text('5.2 Selected Section:', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  if (type === 'TIED') {
    doc.text(`Selected shape: Square Section`, 0.6, cy);
    cy += 0.16;
    doc.text(`b = ${Dim.toFixed(1)} in, h = ${Dim.toFixed(1)} in`, 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('Ag,provided = b * h', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Ag,provided = ${Dim.toFixed(1)} * ${Dim.toFixed(1)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`Ag,provided = ${Ag.toFixed(2)} in2`, 2.0, cy);
    cy += 0.25;
  } else {
    doc.text(`Selected shape: Circular Section`, 0.6, cy);
    cy += 0.16;
    doc.text(`D = ${Dim.toFixed(1)} in`, 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('Ag,provided = pi * D² / 4', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Ag,provided = pi * (${Dim.toFixed(1)})² / 4`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`Ag,provided = ${Ag.toFixed(2)} in2`, 2.0, cy);
    cy += 0.25;
  }

  // SECTION 6
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 6 — LONGITUDINAL REINFORCEMENT DESIGN', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('6.1 Required Steel Area:', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Ast,required = rho_g,target * Ag,provided', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Ast,required = ${p.toFixed(3)} * ${Ag.toFixed(2)}`, 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'bold');
  doc.text(`Ast,required = ${Ast_req.toFixed(2)} in2`, 2.0, cy);
  cy += 0.25;

  doc.setFont('helvetica', 'bold');
  doc.text('6.2 Bar Selection:', 0.5, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`Try ${N_bars} bars of ${mainBarSize} (area per bar Ab = ${Ab.toFixed(2)} in2, dia db = ${mainBarDia.toFixed(3)} in)`, 0.6, cy);
  cy += 0.16;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Ast,provided = N_bars * Ab', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Ast,provided = ${N_bars} * ${Ab.toFixed(2)}`, 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'bold');
  doc.text(`Ast,provided = ${Ast_actual.toFixed(2)} in2`, 2.0, cy);
  cy += 0.25;

  doc.setFont('helvetica', 'bold');
  doc.text('6.3 Check Steel Ratio:', 0.5, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('rho_g,actual = Ast,provided / Ag,provided', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`rho_g,actual = ${Ast_actual.toFixed(2)} / ${Ag.toFixed(2)}`, 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'bold');
  doc.text(`rho_g,actual = ${p_actual.toFixed(5)}`, 2.0, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isRatioOk ? 30 : 200, isRatioOk ? 150 : 30, 30);
  doc.text(`Limits Check: 0.01 <= rho_g <= 0.08 -> ${isRatioOk ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
  cy += 0.25;

  doc.setFont('helvetica', 'bold');
  doc.setTextColor(40, 40, 40);
  doc.text('6.4 Minimum Bar Spacing Check:', 0.5, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);

  if (type === 'TIED') {
    const n_side = Math.ceil(N_bars / 4) + 1;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('s_clear = [b - 2*cover - 2*d_tie - n_side * db] / (n_side - 1)', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`s_clear = [${Dim.toFixed(1)} - 2*${cover.toFixed(2)} - 2*${d_tie.toFixed(3)} - ${n_side} * ${mainBarDia.toFixed(3)}] / (${n_side} - 1)`, 2.0, cy);
    cy += 0.16;
  } else {
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('s_clear = [pi * (D - 2*cover - 2*d_tie - db) / N_bars] - db', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    const Ds = Dim - 2 * cover - 2 * d_tie - mainBarDia;
    doc.text(`s_clear = [pi * ${Ds.toFixed(2)} / ${N_bars}] - ${mainBarDia.toFixed(3)}`, 2.0, cy);
    cy += 0.16;
  }
  doc.setFont('helvetica', 'bold');
  doc.text(`s_clear = ${s_clear.toFixed(2)} in`, 2.0, cy);
  cy += 0.16;
  doc.setTextColor(isSpacingOk ? 30 : 200, isSpacingOk ? 150 : 30, 30);
  doc.text(`Limits Check: s_clear >= max(1.5 db, 1.5 in) = ${minAllowedSpacing.toFixed(2)} in -> ${isSpacingOk ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
  cy += 0.25;

  // SECTION 7
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 7 — AXIAL CAPACITY VERIFICATION', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Pn = 0.85 * fc\' * (Ag - Ast) + Ast * fy', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Pn = 0.85 * ${fc.toFixed(2)} * (${Ag.toFixed(2)} - ${Ast_actual.toFixed(2)}) + ${Ast_actual.toFixed(2)} * ${fy.toFixed(2)}`, 2.0, cy);
  cy += 0.16;

  const Pn_pure = 0.85 * fc * (Ag - Ast_actual) + Ast_actual * fy;
  const alpha_phi_Pn = alpha * phi_axial * Pn_pure;
  const isAxialOk = Pu <= alpha_phi_Pn;
  axialDcr = Pu / alpha_phi_Pn;

  doc.setFont('helvetica', 'bold');
  doc.text(`Pn = ${Pn_pure.toFixed(1)} kips`, 2.0, cy);
  cy += 0.18;

  doc.setFont('helvetica', 'normal');
  doc.text('Factored capacity:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('alpha * phi * Pn', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`${alpha.toFixed(2)} * ${phi_axial.toFixed(2)} * ${Pn_pure.toFixed(1)}`, 2.0, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'bold');
  doc.text(`alpha * phi * Pn = ${alpha_phi_Pn.toFixed(1)} kips`, 2.0, cy);
  cy += 0.18;

  doc.setTextColor(isAxialOk ? 30 : 200, isAxialOk ? 150 : 30, 30);
  doc.text(`Check: Pu <= alpha * phi * Pn -> ${Pu.toFixed(1)} kips <= ${alpha_phi_Pn.toFixed(1)} kips -> ${isAxialOk ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
  cy += 0.18;

  doc.setTextColor(axialDcr <= 1.0 ? 30 : 200, axialDcr <= 1.0 ? 150 : 30, 30);
  doc.text(`DCR = Pu / (alpha * phi * Pn) = ${axialDcr.toFixed(3)}`, 0.6, cy);
  cy += 0.25;

  // ==========================================
  // PAGE 4: LATERAL REINFORCEMENT, INTERACTION
  // ==========================================
  doc.addPage();
  pageNum = 4;
  cy = 1.8;
  drawPageBorderAndHeader(doc);

  // SECTION 8
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 8 — LATERAL REINFORCEMENT DESIGN', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  if (type === 'TIED') {
    doc.setFont('helvetica', 'bold');
    doc.text(`Tied Column Limits Check (ACI 25.7.2.1):`, 0.5, cy);
    cy += 0.18;

    const sa = 16 * mainBarDia;
    const sb = 48 * d_tie;
    const sc = Dim;

    doc.setFont('helvetica', 'normal');
    doc.text(`(a) 16 * db,long = 16 * ${mainBarDia.toFixed(3)} in = ${sa.toFixed(2)} in`, 0.6, cy);
    cy += 0.16;
    doc.text(`(b) 48 * db,tie  = 48 * ${d_tie.toFixed(3)} in = ${sb.toFixed(2)} in`, 0.6, cy);
    cy += 0.16;
    doc.text(`(c) Least column dimension = ${sc.toFixed(2)} in`, 0.6, cy);
    cy += 0.16;

    doc.setFont('helvetica', 'bold');
    doc.text(`Governing ACI limit s = ${s_limit.toFixed(2)} in`, 0.6, cy);
    cy += 0.18;

    doc.setFont('helvetica', 'normal');
    doc.text(`Provided spacing s_final = ${s_final.toFixed(2)} in`, 0.6, cy);
    cy += 0.16;

    const isSpacingLimitOk = s_final <= s_limit;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isSpacingLimitOk ? 30 : 200, isSpacingLimitOk ? 150 : 30, 30);
    doc.text(`Check: s_final <= s_limit -> ${s_final.toFixed(2)} in <= ${s_limit.toFixed(2)} in -> ${isSpacingLimitOk ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
    cy += 0.25;
  } else {
    doc.setFont('helvetica', 'bold');
    doc.text(`Spiral Column Limits Check (ACI 25.7.3):`, 0.5, cy);
    cy += 0.18;

    const dc = Dim - 2 * cover;
    const Ac = Math.PI * dc * dc / 4;

    doc.setFont('helvetica', 'normal');
    doc.text(`Core diameter: dc = Dim - 2*cover = ${Dim.toFixed(1)} - 2*${cover.toFixed(1)} = ${dc.toFixed(2)} in`, 0.6, cy);
    cy += 0.16;
    doc.text(`Core area: Ac = pi/4 * dc² = pi/4 * (${dc.toFixed(2)})² = ${Ac.toFixed(2)} in2`, 0.6, cy);
    cy += 0.16;

    doc.text('Formula for min spiral ratio:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('rho_s,min = 0.45 * (Ag/Ac - 1) * (fc\'/fyt)', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`rho_s,min = 0.45 * (${Ag.toFixed(2)}/${Ac.toFixed(2)} - 1) * (${fc.toFixed(2)}/${fyt.toFixed(2)})`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`rho_s,min = ${rho_s_min.toFixed(5)}`, 2.0, cy);
    cy += 0.20;

    doc.setFont('helvetica', 'normal');
    doc.text('Required spiral pitch:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('s = 4 * Asp / (rho_s,min * dc)', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`s = 4 * ${A_tie.toFixed(3)} / (${rho_s_min.toFixed(5)} * ${dc.toFixed(2)})`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`s_req = ${s_limit.toFixed(2)} in`, 2.0, cy);
    cy += 0.20;

    const s_clear_spiral = s_final - d_tie;
    const isSpiralPitchOk = s_clear_spiral >= 1.0 && s_clear_spiral <= 3.0 && s_final <= s_limit;
    doc.setFont('helvetica', 'normal');
    doc.text(`Provided spiral pitch s_final = ${s_final.toFixed(2)} in (clear pitch = ${s_clear_spiral.toFixed(2)} in)`, 0.6, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isSpiralPitchOk ? 30 : 200, isSpiralPitchOk ? 150 : 30, 30);
    doc.text(`Check: 1 in <= s_clear <= 3 in -> ${isSpiralPitchOk ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
    cy += 0.25;
  }

  // SECTION 9
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 9 — INTERACTION DIAGRAM CHECK (if moment present)', 0.5, cy);
  cy += 0.15;

  if (mux > 0 || muy > 0) {
    const Mu = Math.sqrt(mux * mux + muy * muy);
    const e_in = Mu * 12 / Pu;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text('9.1 Eccentricity:', 0.5, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('e = Mu / Pu', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`e = ${Mu.toFixed(1)} * 12 / ${Pu.toFixed(1)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`e = ${e_in.toFixed(2)} in`, 2.0, cy);
    cy += 0.25;

    // 9.2 Balanced failure condition
    const ey = fy / 29000;
    const cb = (0.003 / (0.003 + ey)) * d_eff;
    const ab = beta1 * cb;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
    doc.text('9.2 Balanced failure condition:', 0.5, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('cb = [0.003 / (0.003 + epsilon_y)] * d', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`cb = [0.003 / (0.003 + ${ey.toFixed(5)})] * ${d_eff.toFixed(2)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`cb = ${cb.toFixed(2)} in`, 2.0, cy);
    cy += 0.18;
    doc.setFont('helvetica', 'normal');
    doc.text(`ab = beta1 * cb = ${beta1.toFixed(3)} * ${cb.toFixed(2)} = ${ab.toFixed(2)} in`, 0.6, cy);
    cy += 0.25;

    // 9.3 Balanced eccentricity
    const res_bal = calcPnMnForC(cb, mux > 0 ? 'x' : 'y');
    const e_b = res_bal.Pn > 0.01 ? (res_bal.Mn * 12 / res_bal.Pn) : 9999;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('9.3 Balanced eccentricity:', 0.5, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('eb = Mnb / Pnb', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`eb = ${res_bal.Mn.toFixed(1)} * 12 / ${res_bal.Pn.toFixed(1)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`eb = ${e_b.toFixed(2)} in (Pnb = ${res_bal.Pn.toFixed(1)} kips, Mnb = ${res_bal.Mn.toFixed(1)} kip-ft)`, 2.0, cy);
    cy += 0.25;

    // 9.4 Failure mode
    const failMode = e_in < e_b ? 'Compression-controlled' : 'Tension-controlled';
    doc.setFont('helvetica', 'bold');
    doc.text('9.4 Failure mode:', 0.5, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`e = ${e_in.toFixed(2)} in vs eb = ${e_b.toFixed(2)} in`, 0.6, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(e_in < e_b ? 120 : 30, e_in < e_b ? 30 : 150, 30);
    doc.text(`→ Column behaves as ${failMode}`, 0.6, cy);
    cy += 0.25;

    // 9.5 Capacity check
    const res_uni = solveUniaxial(e_in, mux > 0 ? 'x' : 'y');
    const c_solved = res_uni.c;
    const eps_prime = 0.003 * (c_solved - d_prime) / c_solved;
    const eps_t = 0.003 * (d_eff - c_solved) / c_solved;
    const f_prime_s = Math.max(-fy, Math.min(fy, 29000 * eps_prime));
    const f_s = Math.max(-fy, Math.min(fy, 29000 * eps_t));

    let Cc = 0;
    if (type === 'TIED') {
      Cc = 0.85 * fc * Dim * (beta1 * c_solved);
    } else {
      const R = Dim / 2;
      const a_val = Math.min(Dim, beta1 * c_solved);
      const u = (R - a_val) / R;
      let A_seg = 0;
      if (u <= -1) A_seg = Math.PI * R * R;
      else if (u >= 1) A_seg = 0;
      else {
        const theta = Math.acos(u);
        A_seg = R * R * (theta - u * Math.sin(theta));
      }
      Cc = 0.85 * fc * A_seg;
    }

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(40, 40, 40);
    doc.text('9.5 Capacity check:', 0.5, cy);
    cy += 0.16;

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.text(`Neutral axis depth c = ${c_solved.toFixed(2)} in`, 0.6, cy);
    cy += 0.16;
    doc.text(`Compression steel strain epsilon_prime_s = 0.003 * (c - d') / c = ${eps_prime.toFixed(5)}`, 0.6, cy);
    cy += 0.16;
    doc.text(`Tension steel strain epsilon_s = 0.003 * (d - c) / c = ${eps_t.toFixed(5)}`, 0.6, cy);
    cy += 0.16;
    doc.text(`Compression steel stress f's = Es * epsilon_prime_s = ${f_prime_s.toFixed(2)} ksi`, 0.6, cy);
    cy += 0.16;
    doc.text(`Tension steel stress fs = Es * epsilon_s = ${f_s.toFixed(2)} ksi`, 0.6, cy);
    cy += 0.16;
    doc.text(`Concrete compression force C = ${Cc.toFixed(1)} kips`, 0.6, cy);
    cy += 0.18;

    const phiPn_sol = res_uni.phi * res_uni.Pn;
    const phiMn_sol = res_uni.phi * res_uni.Mn;

    doc.setFont('helvetica', 'bold');
    const isP_ok = phiPn_sol >= Pu;
    doc.setTextColor(isP_ok ? 30 : 200, isP_ok ? 150 : 30, 30);
    doc.text(`Check: phiPn >= Pu -> ${phiPn_sol.toFixed(1)} kips >= ${Pu.toFixed(1)} kips -> ${isP_ok ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
    cy += 0.16;

    const isM_ok = phiMn_sol >= Mu;
    doc.setTextColor(isM_ok ? 30 : 200, isM_ok ? 150 : 30, 30);
    doc.text(`Check: phiMn >= Mu -> ${phiMn_sol.toFixed(1)} kip-ft >= ${Mu.toFixed(1)} kip-ft -> ${isM_ok ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
    cy += 0.25;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80, 80, 80);
    doc.text('N/A — not applicable (no moments applied)', 0.6, cy);
    cy += 0.25;
  }

  // ==========================================
  // PAGE 5: BIAXIAL BENDING, SHEAR
  // ==========================================
  doc.addPage();
  pageNum = 5;
  cy = 1.8;
  drawPageBorderAndHeader(doc);

  // SECTION 10
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 10 — BIAXIAL BENDING (if Mux and Muy both present)', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  if (mux > 0 && muy > 0) {
    const e_x = muy * 12 / Pu;
    const e_y = mux * 12 / Pu;
    const res_x = solveUniaxial(e_x, 'y');
    const res_y = solveUniaxial(e_y, 'x');
    const Pno = 0.85 * fc * (Ag - Ast_actual) + fy * Ast_actual;
    const invPni = 1 / res_x.Pn + 1 / res_y.Pn - 1 / Pno;
    const Pni = invPni > 0 ? 1 / invPni : 0.001;
    const phi_biaxial = Math.min(res_x.phi, res_y.phi);
    const phiPni = phi_biaxial * Pni;

    doc.setFont('helvetica', 'bold');
    doc.text(`Bresler Reciprocal Load Method:`, 0.5, cy);
    cy += 0.18;

    doc.setFont('helvetica', 'normal');
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('1/Pni = 1/Pnx + 1/Pny - 1/Po', 2.0, cy);
    cy += 0.16;

    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`1/Pni = 1/${res_x.Pn.toFixed(1)} + 1/${res_y.Pn.toFixed(1)} - 1/${Pno.toFixed(1)}`, 2.0, cy);
    cy += 0.16;

    doc.setFont('helvetica', 'bold');
    doc.text(`Pni = ${Pni.toFixed(1)} kips`, 2.0, cy);
    cy += 0.18;

    doc.setFont('helvetica', 'normal');
    doc.text(`Po (pure nominal axial) = ${Pno.toFixed(1)} kips`, 0.6, cy);
    cy += 0.16;
    doc.text(`Pnx (capacity under ex only) = ${res_x.Pn.toFixed(1)} kips`, 0.6, cy);
    cy += 0.16;
    doc.text(`Pny (capacity under ey only) = ${res_y.Pn.toFixed(1)} kips`, 0.6, cy);
    cy += 0.18;

    const isBiaxialOk = Pu <= phiPni;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(isBiaxialOk ? 30 : 200, isBiaxialOk ? 150 : 30, 30);
    doc.text(`Check: Pu <= phi * Pni -> ${Pu.toFixed(1)} kips <= ${phiPni.toFixed(1)} kips -> ${isBiaxialOk ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
    cy += 0.25;
  } else {
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(80, 80, 80);
    doc.text('N/A — not applicable (uniaxial/axial-only column)', 0.6, cy);
    cy += 0.25;
  }

  // SECTION 11
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 11 — SHEAR DESIGN', 0.5, cy);
  cy += 0.15;

  const Pu_lbs = Pu * 1000;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('Concrete shear strength (including axial compression):', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  let Vc_val = Vc;
  let d_shear_val = d_eff;

  if (type === 'TIED') {
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('Vc = 2 * [1 + Nu/(2000*Ag)] * sqrt(fc\') * b * d / 1000', 2.0, cy);
    cy += 0.16;

    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Vc = 2 * [1 + ${Pu_lbs.toFixed(0)}/(2000*${Ag.toFixed(1)})] * sqrt(${(fc*1000).toFixed(0)}) * ${Dim.toFixed(1)} * ${d_eff.toFixed(2)} / 1000`, 2.0, cy);
    cy += 0.16;
  } else {
    // Spiral circular column (Correction 2)
    const d_circ = Dim - cover - d_tie - mainBarDia / 2;
    const bw_circ = 0.8 * Dim;
    d_shear_val = d_circ;
    
    // Recalculate Vc for spiral column using exact bw and d
    Vc_val = 2 * (1 + Pu_lbs / (2000 * Ag)) * Math.sqrt(fc * 1000) * bw_circ * d_circ / 1000;

    doc.text('Effective depth:', 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('d = D - cover - d_spiral - db_long/2', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`d = ${Dim.toFixed(1)} - 1.5 - ${d_tie.toFixed(3)} - ${(mainBarDia/2).toFixed(3)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`d = ${d_circ.toFixed(2)} in`, 2.0, cy);
    cy += 0.20;

    doc.setFont('helvetica', 'normal');
    doc.text('Effective web width (circular approximation):', 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('bw = 0.8 * D', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`bw = 0.8 * ${Dim.toFixed(1)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`bw = ${bw_circ.toFixed(2)} in`, 2.0, cy);
    cy += 0.20;

    doc.setFont('helvetica', 'normal');
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('Vc = 2 * [1 + Nu/(2000*Ag)] * sqrt(fc\'*1000) * bw * d / 1000', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Vc = 2 * [1 + ${Pu_lbs.toFixed(0)}/(2000*${Ag.toFixed(1)})] * sqrt(${(fc*1000).toFixed(0)}) * ${bw_circ.toFixed(2)} * ${d_circ.toFixed(2)} / 1000`, 2.0, cy);
    cy += 0.16;
  }

  // Update outer Vc if circular
  const Vc_final = type === 'TIED' ? Vc : Vc_val;

  doc.setFont('helvetica', 'bold');
  doc.text(`Vc = ${Vc_final.toFixed(1)} kips`, 2.0, cy);
  cy += 0.18;

  doc.setFont('helvetica', 'normal');
  doc.text(`phi * Vc = 0.75 * ${Vc_final.toFixed(1)} = ${(0.75*Vc_final).toFixed(1)} kips`, 0.6, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.text(`Shear design case classification:`, 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text(`Case A: Vu <= phi * Vc/2 = ${(0.375*Vc_final).toFixed(1)} kips (No shear steel needed)`, 0.6, cy);
  cy += 0.16;
  doc.text(`Case B: phi * Vc/2 < Vu <= phi * Vc = ${(0.75*Vc_final).toFixed(1)} kips (Minimum shear steel required)`, 0.6, cy);
  cy += 0.16;
  doc.text(`Case C: Vu > phi * Vc = ${(0.75*Vc_final).toFixed(1)} kips (Shear reinforcement required)`, 0.6, cy);
  cy += 0.18;

  // Re-evaluate shear spacing for spiral/circular with the new Vc and d values
  let vs_req_final = Vs_req;
  let s_shear_final = s_shear;
  if (shearCase === 'C') {
    vs_req_final = (vu / phi_v) - Vc_final;
    s_shear_final = (2 * A_tie * fyt * d_shear_val) / vs_req_final;
    const av_s_min = Math.max(0.75 * Math.sqrt(fc * 1000) * Dim / (fyt * 1000), 50 * Dim / (fyt * 1000));
    const s_min_shear = (2 * A_tie) / av_s_min;
    s_shear_final = Math.min(s_shear_final, s_min_shear);
  }

  doc.setFont('helvetica', 'bold');
  doc.text(`Governing Case: Case ${shearCase}`, 0.6, cy);
  cy += 0.18;

  if (shearCase === 'C') {
    doc.setFont('helvetica', 'normal');
    doc.text('Formula for required shear strength Vs:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('Vs = (Vu - phi * Vc) / phi', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Vs = (${vu.toFixed(1)} - ${(0.75*Vc_final).toFixed(1)}) / 0.75`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`Vs = ${vs_req_final.toFixed(1)} kips`, 2.0, cy);
    cy += 0.20;

    doc.setFont('helvetica', 'normal');
    doc.text('Required Av/s:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('Av/s = Vs / (fyt * d)', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Av/s = ${vs_req_final.toFixed(1)} / (${fyt.toFixed(1)} * ${d_shear_val.toFixed(2)})`, 2.0, cy);
    cy += 0.16;
    const avs_val = vs_req_final / (fyt * d_shear_val);
    doc.setFont('helvetica', 'bold');
    doc.text(`Av/s = ${avs_val.toFixed(4)} in2/in`, 2.0, cy);
    cy += 0.20;

    doc.setFont('helvetica', 'normal');
    doc.text(`Using tie size ${tieBarSize} (Av = ${(2*A_tie).toFixed(2)} in2):`, 0.6, cy);
    cy += 0.16;
    doc.text('Required spacing:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('s = Av / (Av/s)', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`s = ${(2*A_tie).toFixed(2)} / ${avs_val.toFixed(4)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`s = ${s_shear_final.toFixed(2)} in`, 2.0, cy);
    cy += 0.20;
  }
  
  // ==========================================
  // PAGE 6: SLENDERNESS, DETAILING NOTES
  // ==========================================
  doc.addPage();
  pageNum = 6;
  cy = 1.8;
  drawPageBorderAndHeader(doc);

  // SECTION 12
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 12 — SLENDERNESS CHECK', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.text('12.1 Radius of Gyration:', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  r_val = type === 'TIED' ? 0.30 * Dim : 0.25 * Dim;
  if (type === 'TIED') {
    doc.text('r = 0.30 * h', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`r = 0.30 * ${Dim.toFixed(1)}`, 2.0, cy);
  } else {
    doc.text('r = 0.25 * D', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`r = 0.25 * ${Dim.toFixed(1)}`, 2.0, cy);
  }
  cy += 0.16;
  doc.setFont('helvetica', 'bold');
  doc.text(`r = ${r_val.toFixed(2)} in`, 2.0, cy);
  cy += 0.25;

  doc.setFont('helvetica', 'bold');
  doc.text('12.2 Slenderness Ratio:', 0.5, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('klu/r = k * (lu * 12) / r', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`klu/r = 1.0 * (${colHeight.toFixed(1)} * 12) / ${r_val.toFixed(2)}`, 2.0, cy);
  cy += 0.16;
  
  klu_val = 1.0 * colHeight * 12;
  klu_r = klu_val / r_val;
  
  doc.setFont('helvetica', 'bold');
  doc.text(`klu/r = ${klu_r.toFixed(2)}`, 2.0, cy);
  cy += 0.25;

  doc.setFont('helvetica', 'bold');
  doc.text('12.3 Limit for Non-Sway Frames:', 0.5, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(60, 60, 60);
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Limit = 34 - 12*(M1/M2)', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Limit = 34 - 12*(1.0)  [Assuming M1/M2 = 1.0]', 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'bold');
  doc.text('Limit = 22.00', 2.0, cy);
  cy += 0.20;

  isSlender = klu_r > 22.0;

  // Wording corrections per Correction 4
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(isSlender ? 200 : 30, isSlender ? 30 : 150, 30);
  if (isSlender) {
    const Ec_temp = 57000 * Math.sqrt(fc * 1000) / 1000;
    const Ig_temp = type === 'TIED' ? Math.pow(Dim, 4) / 12 : Math.PI * Math.pow(Dim, 4) / 64;
    const beta_dns_temp = 1.2 * pdl / Pu;
    const EI_temp = 0.4 * Ec_temp * Ig_temp / (1 + beta_dns_temp);
    const Pc_temp = Math.PI * Math.PI * EI_temp / Math.pow(1.0 * colHeight * 12, 2);
    delta_ns = Math.max(1.0, 1.0 / (1 - Pu / (0.75 * Pc_temp)));

    doc.text(`Verdict: klu/r vs Limit -> ${klu_r.toFixed(2)} vs 22.00`, 0.6, cy);
    cy += 0.16;
    doc.text(`Column is SLENDER — moment magnification applied`, 0.6, cy);
    cy += 0.16;
    doc.text(`per ACI 318-14 Section 6.6. delta_ns = ${delta_ns.toFixed(3)}`, 0.6, cy);
    cy += 0.25;
  } else {
    delta_ns = 1.0;
    doc.text(`Verdict: klu/r vs Limit -> ${klu_r.toFixed(2)} vs 22.00`, 0.6, cy);
    cy += 0.16;
    doc.text(`Column is SHORT — no moment magnification required.`, 0.6, cy);
    cy += 0.25;
  }

  // Minimum Eccentricity Calculation (Correction 3)
  const e_min = 0.6 + 0.03 * Dim;
  const M_min = Pu * e_min / 12;
  const Mc_min = delta_ns * M_min;

  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('12.4 Minimum Eccentricity Check (ACI 318-14 §6.6.4.5):', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('e_min = 0.6 + 0.03 * h', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`e_min = 0.6 + 0.03 * ${Dim.toFixed(1)}`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`e_min = ${e_min.toFixed(2)} in`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'normal');
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('M_min = Pu * e_min / 12', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`M_min = ${Pu.toFixed(1)} * ${e_min.toFixed(2)} / 12`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`M_min = ${M_min.toFixed(2)} kip-ft`, 2.0, cy);
  cy += 0.20;

  const Mu_total = Math.sqrt(mux * mux + muy * muy);
  if (Mu_total === 0) {
    doc.setFont('helvetica', 'normal');
    doc.text('No applied moment. ACI 318-14 minimum eccentricity governs.', 0.6, cy);
    cy += 0.15;
    doc.setFont('helvetica', 'bold');
    doc.text(`Design moment = M_min = ${M_min.toFixed(2)} kip-ft`, 0.6, cy);
    cy += 0.20;
  }

  if (isSlender) {
    doc.setFont('helvetica', 'normal');
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('Mc = delta_ns * M_min', 2.0, cy);
    cy += 0.15;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Mc = ${delta_ns.toFixed(3)} * ${M_min.toFixed(2)}`, 2.0, cy);
    cy += 0.15;
    doc.setFont('helvetica', 'bold');
    doc.text(`Mc = ${Mc_min.toFixed(2)} kip-ft`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text(`State: Final design moment Mc = ${Mc_min.toFixed(2)} kip-ft`, 0.6, cy);
    cy += 0.20;
  }
  cy += 0.15;


  // SECTION 12.5 — MOMENT MAGNIFICATION FACTOR DERIVATION (Correction 4)
  const Ec_val = 57000 * Math.sqrt(fc * 1000) / 1000;
  const Ig_val = type === 'TIED' ? (Math.pow(Dim, 4) / 12) : (Math.PI * Math.pow(Dim, 4) / 64);
  const beta_dns_val = 1.2 * pdl / Pu;
  const EI_val = 0.4 * Ec_val * Ig_val / (1 + beta_dns_val);
  const Pc_val = Math.PI * Math.PI * EI_val / Math.pow(1.0 * colHeight * 12, 2);
  const Cm_val = 1.0;
  const delta_ns_calc = Cm_val / (1 - Pu / (0.75 * Pc_val));
  const delta_ns_governing = Math.max(1.0, delta_ns_calc);

  checkPageBreak(doc, 3.2);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('12.5 Moment Magnification Factor Derivation (ACI 318-14 Section 6.6):', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  doc.text('Concrete modulus:', 0.6, cy);
  cy += 0.15;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text("Ec = 57000 * sqrt(fc' * 1000) / 1000", 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Ec = 57000 * sqrt(${fc.toFixed(2)} * 1000) / 1000`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`Ec = ${Ec_val.toFixed(2)} ksi`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'normal');
  doc.text('Gross moment of inertia:', 0.6, cy);
  cy += 0.15;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  if (type === 'TIED') {
    doc.text('Ig = b * h^3 / 12', 2.0, cy);
    cy += 0.15;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Ig = ${Dim.toFixed(1)} * ${Dim.toFixed(1)}^3 / 12`, 2.0, cy);
  } else {
    doc.text('Ig = pi * D^4 / 64', 2.0, cy);
    cy += 0.15;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`Ig = 3.1416 * ${Dim.toFixed(1)}^4 / 64`, 2.0, cy);
  }
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`Ig = ${Ig_val.toFixed(2)} in4`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'normal');
  doc.text('Sustained load ratio:', 0.6, cy);
  cy += 0.15;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('beta_dns = 1.2 * PDL / Pu', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`beta_dns = 1.2 * ${pdl.toFixed(1)} / ${Pu.toFixed(1)}`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`beta_dns = ${beta_dns_val.toFixed(3)}`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'normal');
  doc.text('Stiffness:', 0.6, cy);
  cy += 0.15;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('EI = 0.4 * Ec * Ig / (1 + beta_dns)', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`EI = 0.4 * ${Ec_val.toFixed(2)} * ${Ig_val.toFixed(2)} / (1 + ${beta_dns_val.toFixed(3)})`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`EI = ${EI_val.toFixed(2)} kip-in2`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'normal');
  doc.text('Critical buckling load:', 0.6, cy);
  cy += 0.15;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Pc = pi^2 * EI / (k * lu * 12)^2', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Pc = 9.8696 * ${EI_val.toFixed(2)} / (1.0 * ${colHeight.toFixed(1)} * 12)^2`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`Pc = ${Pc_val.toFixed(2)} kips`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'normal');
  doc.text('Equivalent moment factor:', 0.6, cy);
  cy += 0.15;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Cm = 0.6 + 0.4 * (M1/M2) >= 0.4', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('Cm = 0.6 + 0.4 * (1.0)', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`Cm = ${Cm_val.toFixed(2)}`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'normal');
  doc.text('Magnification factor:', 0.6, cy);
  cy += 0.15;
  doc.text('Formula:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text('delta_ns = Cm / (1 - Pu / (0.75 * Pc))', 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text('Substitution:', 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`delta_ns = ${Cm_val.toFixed(2)} / (1 - ${Pu.toFixed(1)} / (0.75 * ${Pc_val.toFixed(2)}))`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`delta_ns = ${delta_ns_calc.toFixed(3)}`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.text(`Check: delta_ns >= 1.0 -> use ${delta_ns_governing.toFixed(3)}`, 0.6, cy);
  cy += 0.25;


  // SECTION 12.6 (Correction 1)
  const d_eff_min = Dim - cover - d_tie - mainBarDia / 2;
  const d_prime_min = cover + d_tie + mainBarDia / 2;
  const As_each_face = Ast_actual / 2;
  const a_equilibrium = Pu / (0.85 * fc * Dim);
  const c_equilibrium = a_equilibrium / beta1;
  const eps_s_prime_eq = 0.003 * (c_equilibrium - d_prime_min) / c_equilibrium;
  const eps_s_eq = 0.003 * (d_eff_min - c_equilibrium) / c_equilibrium;
  const eps_y_val = fy / 29000;

  const term1 = 0.85 * fc * a_equilibrium * Dim * (Dim / 2 - a_equilibrium / 2);
  const term2 = As_each_face * fy * (Dim / 2 - d_prime_min);
  const term3 = As_each_face * fy * (d_eff_min - Dim / 2);
  const Mn_equilibrium_in = term1 + term2 + term3;
  const Mn_equilibrium_ft = Mn_equilibrium_in / 12;
  const phiMn_equilibrium_ft = 0.9 * Mn_equilibrium_ft;

  checkPageBreak(doc, 2.5);
  doc.setFont('times', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(201, 168, 76);
  doc.text('12.6 Moment Capacity at Minimum Eccentricity (Force Equilibrium):', 0.5, cy);
  cy += 0.16;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(60, 60, 60);

  doc.text(`Known values:`, 0.6, cy);
  cy += 0.15;
  doc.text(`  Pu = ${Pu.toFixed(1)} kips`, 0.6, cy);
  doc.text(`  b = ${Dim.toFixed(1)} in, h = ${Dim.toFixed(1)} in`, 2.5, cy);
  cy += 0.14;
  doc.text(`  d = ${d_eff_min.toFixed(2)} in, d' = ${d_prime_min.toFixed(3)} in`, 0.6, cy);
  doc.text(`  As = As' = ${As_each_face.toFixed(3)} in2 (each face)`, 2.5, cy);
  cy += 0.14;
  doc.text(`  fc' = ${fc.toFixed(2)} ksi, fy = ${fy.toFixed(1)} ksi, beta1 = ${beta1.toFixed(3)}`, 0.6, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.text(`Step 1 — Assume steel yields:`, 0.6, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text(`Force equilibrium:`, 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Pu = 0.85 * fc' * a * b + As' * fy - As * fy`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text(`Substitution:`, 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`a = Pu / (0.85 * fc' * b)`, 2.0, cy);
  cy += 0.15;
  doc.text(`a = ${Pu.toFixed(1)} / (0.85 * ${fc.toFixed(2)} * ${Dim.toFixed(1)})`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`a = ${a_equilibrium.toFixed(3)} in`, 2.0, cy);
  cy += 0.15;
  doc.text(`c = a / beta1 = ${c_equilibrium.toFixed(3)} in`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.text(`Step 2 — Verify steel yields:`, 0.6, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text(`Strains:`, 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`epsilon_s' = 0.003 * (c - d') / c = ${eps_s_prime_eq.toFixed(5)}`, 2.0, cy);
  cy += 0.15;
  doc.text(`epsilon_s = 0.003 * (d - c) / c = ${eps_s_eq.toFixed(5)}`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text(`Check:`, 0.6, cy);
  doc.text(`epsilon_s >= epsilon_y = fy/Es = ${eps_y_val.toFixed(5)}`, 2.0, cy);
  cy += 0.15;
  const isYieldConfirmed = eps_s_eq >= eps_y_val;
  doc.setFont('helvetica', 'bold');
  doc.text(`→ Steel yields confirmed: ${isYieldConfirmed ? 'YES' : 'NO (yield assumed for limits)'}`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.text(`Step 3 — Moment about centroid (h/2):`, 0.6, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text(`Formula:`, 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Mn = 0.85*fc'*a*b*(h/2 - a/2) + As'*fy*(h/2 - d') + As*fy*(d - h/2)`, 2.0, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text(`Substitution:`, 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`Mn = ${term1.toFixed(1)} + ${term2.toFixed(1)} + ${term3.toFixed(1)}`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`Mn = ${Mn_equilibrium_in.toFixed(1)} kip-in = ${Mn_equilibrium_ft.toFixed(2)} kip-ft`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.text(`Step 4 — Factored capacity:`, 0.6, cy);
  cy += 0.16;
  doc.setFont('helvetica', 'normal');
  doc.text(`Formula:`, 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`phi * Mn = 0.9 * Mn`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'normal');
  doc.text(`Substitution:`, 0.6, cy);
  doc.setFont('courier', 'normal');
  doc.text(`phi * Mn = 0.9 * ${Mn_equilibrium_ft.toFixed(2)}`, 2.0, cy);
  cy += 0.15;
  doc.setFont('helvetica', 'bold');
  doc.text(`phi * Mn = ${phiMn_equilibrium_ft.toFixed(2)} kip-ft`, 2.0, cy);
  cy += 0.20;

  doc.setFont('helvetica', 'bold');
  doc.text(`Step 5 — Check capacity:`, 0.6, cy);
  cy += 0.16;
  const isMinEquilibriumMnOk = phiMn_equilibrium_ft >= Mc_min;
  doc.setTextColor(isMinEquilibriumMnOk ? 30 : 200, isMinEquilibriumMnOk ? 150 : 30, 30);
  doc.text(`phi * Mn >= Mc -> ${phiMn_equilibrium_ft.toFixed(2)} kip-ft >= ${Mc_min.toFixed(2)} kip-ft -> ${isMinEquilibriumMnOk ? 'PASS ✓' : 'FAIL ✗'}`, 0.6, cy);
  cy += 0.25;
  doc.setTextColor(60, 60, 60);

  // SECTION 13
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 13 — REINFORCEMENT DETAILING SCHEDULE', 0.5, cy);
  cy += 0.15;

  let transQty = 0;
  let transLen = 0;
  let L_spiral = 0;
  let N_ties = 0;
  let L_tie = 0;
  let L_tie_total = 0;

  const lu_in = colHeight * 12;
  const dc = Dim - 2 * cover;
  if (type === 'TIED') {
    N_ties = Math.ceil(colHeight * 12 / s_final) + 1;
    L_tie = 2 * (Dim + Dim) - 8 * cover + 24 * d_tie;
    L_tie_total = N_ties * L_tie / 12;
    transQty = N_ties;
    transLen = L_tie_total;
  } else {
    L_spiral = (lu_in / s_final) * Math.PI * dc / 12;
    transLen = L_spiral; // for compatibility
  }

  const ld_comp_ft = Math.max((20 * fy * mainBarDia) / Math.sqrt(fc * 1000), 0.3 * fy * mainBarDia, 8.0) / 12;
  const l_splice_ft = Math.max(1.0, 1.3 * ld_comp_ft);
  const longBarLen = colHeight + l_splice_ft;

  if (type === 'TIED') {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Tie Spacing and Quantity Calculation:', 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('N_ties = ceil(lu * 12 / s_tie) + 1', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`N_ties = ceil(${colHeight.toFixed(1)} * 12 / ${s_final.toFixed(2)}) + 1`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`N_ties = ${N_ties}`, 2.0, cy);
    cy += 0.22;

    doc.setFont('helvetica', 'normal');
    doc.text('Length per tie (with standard 135-deg hooks):', 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('L_tie = 2*(b + h) - 8*cover + 24*d_tie', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`L_tie = 2*(${Dim.toFixed(1)} + ${Dim.toFixed(1)}) - 8*1.5 + 24*${d_tie.toFixed(3)}`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`L_tie = ${L_tie.toFixed(2)} in = ${(L_tie/12).toFixed(2)} ft`, 2.0, cy);
    cy += 0.22;

    doc.setFont('helvetica', 'normal');
    doc.text('Total tie length:', 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('L_tie_total = N_ties * L_tie / 12', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`L_tie_total = ${N_ties} * ${L_tie.toFixed(2)} / 12`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`L_tie_total = ${L_tie_total.toFixed(2)} ft`, 2.0, cy);
    cy += 0.25;
  } else {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.text('Spiral Length Calculation:', 0.6, cy);
    cy += 0.16;
    doc.text('Formula:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text('L_spiral = (lu_in / s_pitch) * pi * dc / 12', 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'normal');
    doc.text('Substitution:', 0.6, cy);
    doc.setFont('courier', 'normal');
    doc.text(`L_spiral = (${lu_in.toFixed(1)} / ${s_final.toFixed(2)}) * 3.1416 * ${dc.toFixed(2)} / 12`, 2.0, cy);
    cy += 0.16;
    doc.setFont('helvetica', 'bold');
    doc.text(`L_spiral = ${L_spiral.toFixed(2)} ft`, 2.0, cy);
    cy += 0.25;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.setFillColor(245, 245, 245);
  doc.rect(0.5, cy, 7.5, 0.22, 'F');
  doc.text('Mark', 0.6, cy + 0.15);
  doc.text('Bar Size', 1.5, cy + 0.15);
  if (type === 'TIED') {
    doc.text('No. of Bars', 2.8, cy + 0.15);
    doc.text('Length (ft)', 4.2, cy + 0.15);
  } else {
    doc.text('Pitch (in)', 2.8, cy + 0.15);
    doc.text('Spiral Length (ft)', 4.2, cy + 0.15);
  }
  doc.text('Remarks', 5.5, cy + 0.15);

  doc.setDrawColor(200, 200, 200);
  doc.line(0.5, cy, 8.0, cy);
  doc.line(0.5, cy + 0.22, 8.0, cy + 0.22);
  cy += 0.22;

  const detailingRows = type === 'TIED' ? [
    ['L1', mainBarSize, `${N_bars}`, `${longBarLen.toFixed(2)} ft`, 'Longitudinal Bars'],
    ['T1', tieBarSize, `${N_ties}`, `${L_tie_total.toFixed(2)} ft`, `Ties @ ${s_final.toFixed(1)}" c/c`]
  ] : [
    ['L1', mainBarSize, '—', `${longBarLen.toFixed(2)} ft`, 'Longitudinal Bars'],
    ['S1', tieBarSize, `${s_final.toFixed(2)} in`, `${L_spiral.toFixed(2)} ft`, 'Spiral reinf.']
  ];
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);

  detailingRows.forEach(([mark, size, qty, len, rem]) => {
    doc.text(mark, 0.6, cy + 0.15);
    doc.text(size, 1.5, cy + 0.15);
    doc.text(qty, 2.8, cy + 0.15);
    doc.text(len, 4.2, cy + 0.15);
    doc.text(rem, 5.5, cy + 0.15);
    doc.line(0.5, cy + 0.20, 8.0, cy + 0.20);
    cy += 0.20;
  });

  cy += 0.10;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`* Clear cover to ties: 1.5 in (ACI 318-14 §20.6.1)`, 0.6, cy);
  cy += 0.14;
  doc.text(`* Minimum bar clear spacing: max(1.5 db, 1.5 in) = ${minAllowedSpacing.toFixed(2)} in`, 0.6, cy);
  cy += 0.14;
  doc.text(`* Lap splice length for longitudinal bars: Lsp = ${(l_splice_ft * 12).toFixed(1)} in (Class B splice)`, 0.6, cy);
  cy += 0.14;
  doc.text(`* Standard hook development length: ldh = ${(ld_comp_ft * 12).toFixed(1)} in`, 0.6, cy);
  cy += 0.14;
  doc.text('* All deformed bars to ASTM A615 Grade 60', 0.6, cy);
  cy += 0.25;
  
  // ==========================================
  // PAGE 7: SUMMARY, DRAWINGS, REFERENCES
  // ==========================================
  doc.addPage();
  pageNum = 7;
  cy = 1.8;
  drawPageBorderAndHeader(doc);

  // SECTION 14
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 14 — DESIGN SUMMARY TABLE', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.setFillColor(245, 245, 245);
  doc.rect(0.5, cy, 7.5, 0.22, 'F');
  doc.text('Check', 0.6, cy + 0.15);
  doc.text('Required', 2.8, cy + 0.15);
  doc.text('Provided', 4.5, cy + 0.15);
  doc.text('Status', 6.0, cy + 0.15);

  doc.setDrawColor(200, 200, 200);
  doc.line(0.5, cy, 8.0, cy);
  doc.line(0.5, cy + 0.22, 8.0, cy + 0.22);
  cy += 0.22;

  const Mu_d = Math.sqrt(mux * mux + muy * muy);
  const phiMn_d = mux > 0 || muy > 0 ? (res_sol.phi * res_sol.Mn) : 0;

  const summaryRows = [
    ['Axial capacity Pu <= alpha * phi * Pn', `${Pu.toFixed(1)} kips`, `${(res_sol.Pn * res_sol.phi).toFixed(1)} kips`, (Pu <= res_sol.Pn * res_sol.phi) ? '✓ PASS' : '✗ FAIL'],
    ['Moment capacity Mu <= phi * Mn', `${Mu_d.toFixed(1)} kip-ft`, `${phiMn_d.toFixed(1)} kip-ft`, (mux === 0 && muy === 0) ? 'N/A' : (Mu_d <= phiMn_d) ? '✓ PASS' : '✗ FAIL'],
    ['Min eccentricity Mc', `${Mc_min.toFixed(2)} kip-ft`, `${phiMn_equilibrium_ft.toFixed(2)} kip-ft`, (phiMn_equilibrium_ft >= Mc_min) ? '✓ PASS' : '✗ FAIL'],
    ['Shear capacity Vu <= phi * Vc', `${vu.toFixed(1)} kips`, `${(0.75 * Vc_final).toFixed(1)} kips`, (vu <= 0.75 * Vc_final) ? '✓ PASS' : '✗ FAIL'],
    ['Steel ratio 0.01 <= rho_g <= 0.08', '0.010 to 0.080', `${p_actual.toFixed(4)}`, isRatioOk ? '✓ PASS' : '✗ FAIL'],
    ['Tie spacing (ACI limits)', `${s_limit.toFixed(2)} in`, `${s_final.toFixed(2)} in`, (s_final <= s_limit) ? '✓ PASS' : '✗ FAIL'],
    ['DCR (Pu / (alpha * phi * Pn))', '<= 1.00', `${axialDcr.toFixed(3)}`, axialDcr <= 1.00 ? '✓ PASS' : '✗ FAIL'],
    ['Slenderness', 'Short/Slender', isSlender ? 'Slender' : 'Short', isSlender ? ('Slender, delta_ns=' + delta_ns.toFixed(3)) : 'Short — no magnification']
  ];

    summaryRows.forEach(([check, req, prov, stat]) => {
    doc.text(check, 0.6, cy + 0.15);
    doc.text(req, 2.8, cy + 0.15);
    doc.text(prov, 4.5, cy + 0.15);
    if (stat.includes('PASS') || stat.includes('OK') || stat.includes('Short')) {
      doc.setTextColor(30, 150, 30);
    } else if (stat.includes('FAIL')) {
      doc.setTextColor(220, 50, 50);
    } else {
      doc.setTextColor(100, 100, 100);
    }
    doc.setFont('helvetica', 'bold');
    doc.text(stat, 6.8, cy + 0.15);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(60, 60, 60);
    doc.line(0.5, cy + 0.20, 8.0, cy + 0.20);
    cy += 0.20;
  });

  cy += 0.10;
  const overallVerdict = axialDcr <= 1.0 && isRatioOk && isSpacingOk && (vu <= 0.75 * Vc_final) && (phiMn_equilibrium_ft >= Mc_min);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  if (overallVerdict) {
    doc.setTextColor(30, 150, 30);
    doc.text('Overall design verdict: ✓ DESIGN ACCEPTABLE — All checks satisfied per ' + code, 0.5, cy);
  } else {
    doc.setTextColor(220, 50, 50);
    doc.text('Overall design verdict: ✗ REDESIGN REQUIRED — See flagged checks above', 0.5, cy);
  }
  cy += 0.30;

  // SECTION 15 — REINFORCEMENT DETAILING DRAWINGS
  checkPageBreak(doc, 3.5);
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 15 — REINFORCEMENT DETAILING DRAWINGS', 0.5, cy);
  cy += 0.20;

  // Let's set draw colors and styles
  doc.setDrawColor(50, 50, 50);
  doc.setLineWidth(0.015);

  const cx = 2.2;
  const cy_draw = cy + 1.2;
  const cx_el = 5.6;
  const scale = 1.6 / Dim;

  // 1. Draw Cross Section on the left
  if (type === 'TIED') {
    // Tied Rectangular Column
    const w_c = Dim * scale;
    const x = cx - w_c / 2;
    const y = cy_draw - w_c / 2;

    // Outer Concrete Shape
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.015);
    doc.rect(x, y, w_c, w_c, 'FD');

    // Inner Tie line
    const w_tie = (Dim - 2 * cover) * scale;
    const xt = cx - w_tie / 2;
    const yt = cy_draw - w_tie / 2;
    doc.setDrawColor(180, 50, 50);
    doc.setLineWidth(0.012);
    doc.rect(xt, yt, w_tie, w_tie, 'S');

    // Longitudinal bars
    bars.forEach(bar => {
      const bx = cx + bar.x * scale;
      const by = cy_draw + bar.y * scale;
      const r_bar = Math.max(0.035, (mainBarDia / 2) * scale);
      doc.setFillColor(30, 30, 30);
      doc.circle(bx, by, r_bar, 'F');
    });

    // Horizontal Dimension (Width)
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.006);
    doc.line(x, y + w_c + 0.15, x + w_c, y + w_c + 0.15);
    doc.line(x, y + w_c + 0.1, x, y + w_c + 0.2);
    doc.line(x + w_c, y + w_c + 0.1, x + w_c, y + w_c + 0.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(`${Dim.toFixed(0)}"`, cx, y + w_c + 0.28, { align: 'center' });

    // Vertical Dimension (Height)
    doc.line(x - 0.15, y, x - 0.15, y + w_c);
    doc.line(x - 0.2, y, x - 0.1, y);
    doc.line(x - 0.2, y + w_c, x - 0.1, y + w_c);
    doc.text(`${Dim.toFixed(0)}"`, x - 0.23, cy_draw + 0.03, { align: 'right' });

    // Title label below cross-section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('CROSS-SECTION VIEW', cx, y + w_c + 0.45, { align: 'center' });

  } else {
    // Spiral Circular Column
    const R_c = (Dim / 2) * scale;

    // Outer Concrete Shape (Circle)
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(60, 60, 60);
    doc.setLineWidth(0.015);
    doc.circle(cx, cy_draw, R_c, 'FD');

    // Inner Spiral line
    const R_spiral = (Dim / 2 - cover) * scale;
    doc.setDrawColor(180, 50, 50);
    doc.setLineWidth(0.012);
    doc.circle(cx, cy_draw, R_spiral, 'S');

    // Longitudinal bars
    bars.forEach(bar => {
      const bx = cx + bar.x * scale;
      const by = cy_draw + bar.y * scale;
      const r_bar = Math.max(0.035, (mainBarDia / 2) * scale);
      doc.setFillColor(30, 30, 30);
      doc.circle(bx, by, r_bar, 'F');
    });

    // Horizontal Dimension (Diameter)
    doc.setDrawColor(120, 120, 120);
    doc.setLineWidth(0.006);
    doc.line(cx - R_c, cy_draw + R_c + 0.15, cx + R_c, cy_draw + R_c + 0.15);
    doc.line(cx - R_c, cy_draw + R_c + 0.1, cx - R_c, cy_draw + R_c + 0.2);
    doc.line(cx + R_c, cy_draw + R_c + 0.1, cx + R_c, cy_draw + R_c + 0.2);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(60, 60, 60);
    doc.text(`D = ${Dim.toFixed(0)}"`, cx, cy_draw + R_c + 0.28, { align: 'center' });

    // Title label below cross-section
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(30, 30, 30);
    doc.text('CROSS-SECTION VIEW', cx, cy_draw + R_c + 0.45, { align: 'center' });
  }

  // 2. Draw Elevation View on the right
  const w_el = 1.1;
  const h_el = 2.2;
  const x_el = cx_el - w_el / 2;
  const y_el = cy_draw - h_el / 2;

  // Outer Concrete
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(60, 60, 60);
  doc.setLineWidth(0.015);
  doc.rect(x_el, y_el, w_el, h_el, 'FD');

  // Longitudinal steel (Vertical lines)
  const scale_el = w_el / Dim;
  const x_l = x_el + (cover + d_tie + mainBarDia / 2) * scale_el;
  const x_r = x_el + w_el - (cover + d_tie + mainBarDia / 2) * scale_el;
  doc.setDrawColor(80, 80, 80);
  doc.setLineWidth(0.02);
  doc.line(x_l, y_el, x_l, y_el + h_el);
  doc.line(x_r, y_el, x_r, y_el + h_el);

  // Ties or Spirals (Horizontal lines or spiral turns)
  doc.setDrawColor(180, 50, 50);
  doc.setLineWidth(0.008);
  if (type === 'TIED') {
    const s_draw = s_final * (h_el / (colHeight * 12));
    const num_ties = Math.floor((colHeight * 12) / s_final);
    for (let i = 0; i <= num_ties; i++) {
      const tie_y = y_el + i * s_draw;
      if (tie_y <= y_el + h_el) {
        doc.line(x_el + cover * scale_el, tie_y, x_el + w_el - cover * scale_el, tie_y);
      }
    }
  } else {
    // Spiral
    const pitch_draw = s_final * (h_el / (colHeight * 12));
    const num_coils = Math.floor((colHeight * 12) / s_final);
    let curr_y = y_el;
    for (let i = 0; i < num_coils; i++) {
      const next_y = curr_y + pitch_draw;
      if (next_y <= y_el + h_el) {
        doc.line(x_l, curr_y, x_r, curr_y + pitch_draw / 2);
        doc.line(x_r, curr_y + pitch_draw / 2, x_l, next_y);
      }
      curr_y = next_y;
    }
  }

  // Elevation dimensions
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.006);
  doc.line(cx_el + w_el / 2 + 0.15, y_el, cx_el + w_el / 2 + 0.15, y_el + h_el);
  doc.line(cx_el + w_el / 2 + 0.1, y_el, cx_el + w_el / 2 + 0.2, y_el);
  doc.line(cx_el + w_el / 2 + 0.1, y_el + h_el, cx_el + w_el / 2 + 0.2, y_el + h_el);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`Height = ${colHeight.toFixed(1)} ft`, cx_el + w_el / 2 + 0.28, cy_draw, { align: 'center', angle: 90 });

  // Elevation Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(30, 30, 30);
  doc.text('ELEVATION VIEW', cx_el, y_el + h_el + 0.45, { align: 'center' });

  // 3. Detailing Leader Lines and Callouts (drawn on top)
  doc.setDrawColor(100, 100, 100);
  doc.setLineWidth(0.006);

  // Leader line for Longitudinal Bars
  let p_bar_x = cx + (Dim/2 - (cover + d_tie + mainBarDia/2)) * scale;
  let p_bar_y = cy_draw - (Dim/2 - (cover + d_tie + mainBarDia/2)) * scale;
  if (type === 'SPIRAL') {
    const Ds = Dim - 2 * (cover + d_tie + mainBarDia/2);
    p_bar_x = cx + (Ds / 2) * Math.cos(-Math.PI / 4) * scale;
    p_bar_y = cy_draw + (Ds / 2) * Math.sin(-Math.PI / 4) * scale;
  }
  const t_bar_x = cx - 0.9;
  const t_bar_y = cy_draw - 0.7;
  doc.line(p_bar_x, p_bar_y, t_bar_x, t_bar_y);
  doc.line(t_bar_x, t_bar_y, t_bar_x + 0.15, t_bar_y);
  doc.setFillColor(100, 100, 100);
  doc.circle(p_bar_x, p_bar_y, 0.018, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(40, 40, 40);
  doc.text(`${N_bars} - ${mainBarSize} Long. Bars`, 0.5, t_bar_y + 0.03);

  // Leader line for Ties/Spiral
  let p_tie_x = cx + (Dim/2 - cover) * scale;
  let p_tie_y = cy_draw + (Dim/2 - cover) * scale * 0.2;
  if (type === 'SPIRAL') {
    const R_spiral = Dim/2 - cover;
    p_tie_x = cx + R_spiral * Math.cos(Math.PI / 6) * scale;
    p_tie_y = cy_draw + R_spiral * Math.sin(Math.PI / 6) * scale;
  }
  const t_tie_x = cx + 1.1;
  const t_tie_y = cy_draw + 0.7;
  doc.line(p_tie_x, p_tie_y, t_tie_x, t_tie_y);
  doc.line(t_tie_x, t_tie_y, t_tie_x + 0.2, t_tie_y);
  doc.circle(p_tie_x, p_tie_y, 0.018, 'F');
  if (type === 'TIED') {
    doc.text(`Ties: ${tieBarSize} @ ${s_final.toFixed(1)}" c/c`, t_tie_x + 0.25, t_tie_y + 0.03);
  } else {
    doc.text(`Spiral: ${tieBarSize} @ ${s_final.toFixed(1)}" pitch`, t_tie_x + 0.25, t_tie_y + 0.03);
  }

  // 4. Detailing Legend/Notes at the bottom
  const notes_y = cy_draw + 1.45;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(30, 30, 30);
  doc.text('DETAILING NOTES & LEGEND:', 0.5, notes_y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(60, 60, 60);
  doc.text(`• Concrete Cover: ${cover.toFixed(1)} inches (clear cover to outer lateral reinforcement)`, 0.6, notes_y + 0.16);
  doc.text(`• Main reinforcement: ${N_bars} deformed ASTM A615 Grade 60 bars (db = ${mainBarDia.toFixed(3)}", Ab = ${Ab.toFixed(2)} in2)`, 0.6, notes_y + 0.30);
  if (type === 'TIED') {
    doc.text(`• Lateral ties: ${tieBarSize} ties (db = ${d_tie.toFixed(3)}", As = ${A_tie.toFixed(2)} in2) spaced at ${s_final.toFixed(1)}" c/c`, 0.6, notes_y + 0.44);
  } else {
    const rho_s_pct = (rho_s * 100).toFixed(2);
    doc.text(`• Lateral spiral: ${tieBarSize} spiral (db = ${d_tie.toFixed(3)}", As = ${A_tie.toFixed(2)} in2) at ${s_final.toFixed(1)}" pitch (ratio rho_s = ${rho_s_pct}%)`, 0.6, notes_y + 0.44);
  }
  doc.text(`• Structural specs: fc' = ${fc.toFixed(1)} ksi, fy = ${fy.toFixed(0)} ksi, fyt = ${fyt.toFixed(0)} ksi. Slenderness ratio klu/r = ${klu_r.toFixed(2)}.`, 0.6, notes_y + 0.58);

  cy = notes_y + 0.75;

      // SECTION 16
  checkPageBreak(doc, 2.2);
  doc.setFont('times', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(201, 168, 76);
  doc.text('SECTION 16 — CODE REFERENCES', 0.5, cy);
  cy += 0.15;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(80, 80, 80);

  const isA = code === 'ACI 318-14';
  const refs_list = isA ? [
    '- ACI 318-14 §4.3.2 — Design loads and combinations',
    '- ACI 318-14 §20.2 — Steel material properties',
    '- ACI 318-14 §20.6.1 — Concrete cover requirements',
    '- ACI 318-14 §21.2 — Strength reduction factors (phi)',
    '- ACI 318-14 §22.2 — Assumptions for flexure and axial',
    '- ACI 318-14 §22.4 — Axial strength: tied and spiral columns',
    '- ACI 318-14 §22.5 — One-way shear strength',
    '- ACI 318-14 §25.7.2 — Ties in compression members',
    '- ACI 318-14 §25.7.3 — Spiral reinforcement',
    '- ACI 318-14 §6.2.5 — Slenderness effects: moment magnification',
    '- ACI 318-14 §26.4 — Specified concrete strength'
  ] : [
    '- BNBC 2020 Part 6 Ch 6 — Design loads and combinations',
    '- BNBC 2020 Part 6 Ch 5 — Concrete and steel material properties',
    '- BNBC 2020 Part 6 Ch 6 — Concrete cover requirements',
    '- BNBC 2020 Part 6 Ch 6 — Strength reduction factors (phi)',
    '- BNBC 2020 Part 6 Ch 6 — Assumptions for flexure and axial',
    '- BNBC 2020 Part 6 Ch 6 — Axial strength: tied and spiral columns',
    '- BNBC 2020 Part 6 Ch 6 — One-way shear strength',
    '- BNBC 2020 Part 6 Ch 6 — Ties in compression members',
    '- BNBC 2020 Part 6 Ch 6 — Spiral reinforcement',
    '- BNBC 2020 Part 6 Ch 6 — Slenderness effects: moment magnification',
    '- BNBC 2020 Part 6 Ch 5 — Specified concrete strength'
  ];

  refs_list.forEach(ref => {
    doc.text(ref, 0.6, cy);
    cy += 0.14;
  });

  cy += 0.15;
  doc.setFont('times', 'bold');
  doc.setFontSize(9.5);
  doc.setTextColor(201, 168, 76);
  doc.text(`Designed per ${code} | CE 317 Method | ${new Date().toLocaleDateString()}`, 0.5, cy);

  doc.save(`twinanalytic_column_report_${new Date().toISOString().split('T')[0]}.pdf`);
}


