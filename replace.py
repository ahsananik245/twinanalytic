import re

with open("footing-design.html", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("beam-design", "footing-design")
content = content.replace("Beam Design", "Single Footing Design")
content = content.replace("Free RC Beam Flexural Design Calculator", "Free RC Single Footing Design (Square)")
content = content.replace("reinforced concrete beams. Singly, doubly, and T-beam calculators", "isolated square footing")
content = content.replace("beam_report", "footing_report")
content = content.replace("Free RC Beam Designer", "Free RC Single Footing Designer")

footing_inputs = """
          <form id="footing-form" onsubmit="return false;">
            <div class="form-group-title" style="margin-top:0;">Project Information</div>
            <div class="input-grid">
              <div class="input-field"><label>Project Name</label><input type="text" id="footing-proj-name" value="TwinAnalytic Tower"></div>
              <div class="input-field"><label>Footing Mark</label><input type="text" id="footing-mark" value="F1"></div>
              <div class="input-field" style="grid-column: 1 / -1;"><label>Designer Name</label><input type="text" id="footing-designer" value="TwinAnalytic"></div>
            </div>
            <div class="form-group-title">Material Properties</div>
            <div class="input-grid">
              <div class="input-field"><label>Concrete fc (psi)</label><input type="number" id="footing-fc" value="3000" min="2000" max="10000" step="100"></div>
              <div class="input-field"><label>Steel fy (psi)</label><input type="number" id="footing-fy" value="60000" min="40000" max="100000" step="1000"></div>
              <div class="input-field"><label>Material Unit Wt (pcf)</label><input type="number" id="footing-gamma" value="100" min="50" max="150" step="10"></div>
              <div class="input-field"><label>Soil Bearing Qa (ksf)</label><input type="number" id="footing-qa" value="4" min="1" max="15" step="0.5"></div>
            </div>
            <div class="form-group-title">Column Details</div>
            <div class="input-grid">
              <div class="input-field"><label>Width C1 (X-dir, inch)</label><input type="number" id="footing-c1" value="12" min="6" max="60" step="1"></div>
              <div class="input-field"><label>Depth C2 (Y-dir, inch)</label><input type="number" id="footing-c2" value="12" min="6" max="60" step="1"></div>
            </div>
            <div class="form-group-title">Loading Details</div>
            <div class="input-grid">
              <div class="input-field"><label>Dead Load DL (kips)</label><input type="number" id="footing-dl" value="120" min="0" step="5"></div>
              <div class="input-field"><label>Live Load LL (kips)</label><input type="number" id="footing-ll" value="80" min="0" step="5"></div>
              <div class="input-field" style="grid-column: 1 / -1;"><label>Surcharge/Fill (ft)</label><input type="number" id="footing-surcharge" value="5" min="0" max="20" step="0.5"></div>
            </div>
            <div class="form-group-title">Footing Geometry &amp; Rebar</div>
            <div class="input-grid">
              <div class="input-field"><label>Clear Cover (inch)</label><input type="number" id="footing-cover" value="3" min="2" max="4" step="0.5"></div>
              <div class="input-field"><label>Trial Thickness d (inch)</label><input type="number" id="footing-d" value="12" min="6" max="60" step="1"></div>
              <div class="input-field">
                <label>Rebar L-Dir Dia (mm)</label>
                <select id="footing-rebar-l"><option value="12">12 mm</option><option value="16" selected>16 mm</option><option value="20">20 mm</option><option value="25">25 mm</option></select>
              </div>
              <div class="input-field">
                <label>Rebar S-Dir Dia (mm)</label>
                <select id="footing-rebar-s"><option value="12">12 mm</option><option value="16" selected>16 mm</option><option value="20">20 mm</option><option value="25">25 mm</option></select>
              </div>
            </div>
            <button type="button" class="btn btn-gold btn-calc" onclick="calculateFooting()" id="btn-calc-footing" style="width:100%; margin-top:2rem;">
              <i class="fa-solid fa-calculator"></i> Run Design Check
            </button>
          </form>
"""

content = re.sub(r'<form id="beam-form".*?</form>', footing_inputs, content, flags=re.DOTALL)

footing_outputs = """
        <!-- Right Column: Outputs -->
        <section class="tool-outputs-card col-right" id="footing-output-panel" style="position:relative;">
          <h3>Calculated Results</h3>
          <!-- Visual Block -->
          <div class="drawing-container" id="footing-diagram" style="background:#000; border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 1rem; min-height: 250px; display: flex; align-items: center; justify-content: center;">
             <p style="color:var(--text-secondary); font-size:0.9rem;">Run calculation to preview schematic.</p>
          </div>
          <div style="margin-top: 1.5rem;">
            <div class="result-row warning-badge" style="display:none;" id="footing-status-badge">Check Passed</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="result-row"><span class="lbl-prop">Req. Base Area:</span><span class="lbl-val"><span id="footing-out-area">0.0</span> ft²</span></div>
                <div class="result-row"><span class="lbl-prop">Design Dim (BxB):</span><span class="lbl-val"><span id="footing-out-bb" style="color:var(--color-gold); font-weight:bold;">0.0 x 0.0</span> ft</span></div>
                <div class="result-row"><span class="lbl-prop">Punching Shear:</span><span class="lbl-val"><span id="footing-out-vu1">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Capacity (pVc):</span><span class="lbl-val"><span id="footing-out-pvc1">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Beam Shear:</span><span class="lbl-val"><span id="footing-out-vu2">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Capacity (pVc2):</span><span class="lbl-val"><span id="footing-out-pvc2">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Calculated As:</span><span class="lbl-val"><span id="footing-out-as">0.0</span> in²</span></div>
                <div class="result-row"><span class="lbl-prop">Min. Control As:</span><span class="lbl-val"><span id="footing-out-asmin">0.0</span> in²</span></div>
            </div>
            <div class="result-row" style="margin-top:1rem; border-color:var(--color-gold); background:rgba(201,168,76,0.05);">
              <span class="lbl-prop">Reinforcement Provided (Both Dir):</span>
              <span class="lbl-val"><span id="footing-out-rebar" style="color:var(--color-gold); font-size:1.1rem; font-weight:600;">-</span></span>
            </div>
          </div>
          <button id="btn-footing-pdf" class="btn btn-secondary" style="width:100%; margin-top:2rem;" disabled>
            <i class="fa-solid fa-file-pdf"></i> Download PDF Report (Dev)
          </button>

          <div class="lock-overlay" style="display: none;">
            <div class="lock-icon"><i class="fa-solid fa-lock"></i></div>
            <h4>Analysis Locked</h4>
            <p>Please enter your details to view full limits state output and generate engineering reports.</p>
            <button class="btn btn-gold btn-sm" onclick="openAuthModal(() => { runFootingLogic(); }, 'Footing Unlock')">Unlock Tools</button>
          </div>
        </section>
"""

content = re.sub(r'<section class="tool-outputs-card col-right".*?</section>', footing_outputs, content, flags=re.DOTALL)

if 'js/calculators.js' not in content:
    content = content.replace('<script src="js/main.js"></script>', '<script src="js/main.js"></script>\n  <script src="js/calculators.js"></script>')

if 'js/footing-design.js' not in content:
    content = content.replace('<script src="js/calculators.js"></script>', '<script src="js/calculators.js"></script>\n  <script src="js/footing-design.js"></script>')

with open("footing-design.html", "w", encoding="utf-8") as f:
    f.write(content)

