import re

with open("footing-rect-design.html", "r", encoding="utf-8") as f:
    content = f.read()

content = content.replace("footing-design.js", "footing-rect-design.js")
content = content.replace("Single Footing Design", "Rectangular Footing Design")
content = content.replace("Free RC Single Footing Design (Square)", "Free RC Rectangular Footing Design")
content = content.replace("isolated square footing", "isolated rectangular footing")
content = content.replace("footing_report", "footing_rect_report")
content = content.replace("footing-diagram", "footing-rect-diagram")
content = content.replace("calculateFooting", "calculateRectFooting")
content = content.replace('id="btn-calc-footing"', 'id="btn-calc-footing-rect"')

# Add inputs for L and B trials just after Loading Details
geometry_inputs = """
            <div class="form-group-title">Footing Geometry & Rebar</div>
            <div class="input-grid">
              <div class="input-field"><label>Trial Length L (ft)</label><input type="number" id="footing-rect-l" value="11" min="2" max="60" step="0.25"></div>
              <div class="input-field"><label>Trial Width B (ft)</label><input type="number" id="footing-rect-b" value="8" min="2" max="60" step="0.25"></div>
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
"""

content = re.sub(r'<div class="form-group-title">Footing Geometry &amp; Rebar</div>.*?</div>\s*</div>', geometry_inputs, content, flags=re.DOTALL)

# Add split outputs for L and B directions in HTML output panel
outputs = """
          <div style="margin-top: 1.5rem;">
            <div class="result-row warning-badge" style="display:none;" id="footing-rect-status-badge">Check Passed</div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="result-row"><span class="lbl-prop">Req. Base Area:</span><span class="lbl-val"><span id="footing-out-area">0.0</span> ft²</span></div>
                <div class="result-row"><span class="lbl-prop">Design Dim (LxB):</span><span class="lbl-val"><span id="footing-out-lb" style="color:var(--color-gold); font-weight:bold;">0.0 x 0.0</span> ft</span></div>

                <div class="result-row"><span class="lbl-prop">Punching Shear:</span><span class="lbl-val"><span id="footing-out-vu1">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Capacity (pVc):</span><span class="lbl-val"><span id="footing-out-pvc1">0.0</span> kips</span></div>

                <div class="result-row"><span class="lbl-prop">Beam Shear L-Dir:</span><span class="lbl-val"><span id="footing-out-vu2l">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Cap. L-Dir (pVc):</span><span class="lbl-val"><span id="footing-out-pvc2l">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Beam Shear B-Dir:</span><span class="lbl-val"><span id="footing-out-vu2b">0.0</span> kips</span></div>
                <div class="result-row"><span class="lbl-prop">Cap. B-Dir (pVc):</span><span class="lbl-val"><span id="footing-out-pvc2b">0.0</span> kips</span></div>

                <div class="result-row"><span class="lbl-prop">Required As (L):</span><span class="lbl-val"><span id="footing-out-as-l">0.0</span> in²</span></div>
                <div class="result-row"><span class="lbl-prop">Required As (B):</span><span class="lbl-val"><span id="footing-out-as-b">0.0</span> in²</span></div>
            </div>
            <div class="result-row" style="margin-top:1rem; border-color:var(--color-gold); background:rgba(201,168,76,0.05); flex-direction:column; align-items:flex-start;">
              <span class="lbl-prop">Reinforcement Provided L-Dir:</span>
              <span class="lbl-val"><span id="footing-out-rebar-l" style="color:var(--color-gold); font-size:1.1rem; font-weight:600;">-</span></span>
              <span class="lbl-prop" style="margin-top:0.5rem;">Reinforcement Provided B-Dir:</span>
              <span class="lbl-val"><span id="footing-out-rebar-b" style="color:var(--color-gold); font-size:1.1rem; font-weight:600;">-</span></span>
            </div>
          </div>
"""

content = re.sub(r'<div style="margin-top: 1.5rem;">.*?<button id="btn-footing-pdf"', outputs + '\n          <button id="btn-footing-pdf"', content, flags=re.DOTALL)


with open("footing-rect-design.html", "w", encoding="utf-8") as f:
    f.write(content)

