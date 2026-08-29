/* =====================================================================
   TwinAnalytic — Analysis Suite UI Layer
   ---------------------------------------------------------------------
   Renders the uniform result envelope produced by bnbc-calcs.js into the
   site's calculator shell: status banner, results console, step-by-step
   accordion, warning badges, an editable storey grid and a PDF export.

   A page wires itself up with a single BNBCUI.mount({...}) call, so the
   markup stays declarative and every calculator behaves identically.
   ===================================================================== */

const BNBCUI = (function () {
  'use strict';

  let CFG = null;
  let LAST = null;

  /* ------------------------------------------------------------------
     Editable storey / case grid
     ------------------------------------------------------------------ */
  function buildGrid(spec) {
    const host = document.getElementById(spec.mount);
    if (!host) return;

    const wrap = document.createElement('div');
    wrap.className = 'grid-editor';

    const table = document.createElement('table');
    table.className = 'grid-table';
    table.id = spec.mount + '-table';

    const thead = document.createElement('thead');
    const htr = document.createElement('tr');
    spec.columns.forEach(c => {
      const th = document.createElement('th');
      th.textContent = c.label;
      if (c.width) th.style.width = c.width;
      htr.appendChild(th);
    });
    const thAct = document.createElement('th');
    thAct.textContent = '';
    thAct.style.width = '34px';
    htr.appendChild(thAct);
    thead.appendChild(htr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    tbody.id = spec.mount + '-body';
    table.appendChild(tbody);
    wrap.appendChild(table);

    const bar = document.createElement('div');
    bar.className = 'grid-toolbar';
    bar.innerHTML =
      '<button type="button" class="grid-btn" data-act="add"><i class="fa-solid fa-plus"></i> Add Level</button>' +
      '<button type="button" class="grid-btn" data-act="dup"><i class="fa-solid fa-copy"></i> Duplicate Last</button>' +
      '<button type="button" class="grid-btn" data-act="clear"><i class="fa-solid fa-eraser"></i> Clear</button>' +
      '<span class="grid-hint">' + (spec.hint || '') + '</span>';
    wrap.appendChild(bar);

    host.appendChild(wrap);

    bar.addEventListener('click', e => {
      const btn = e.target.closest('button[data-act]');
      if (!btn) return;
      const act = btn.getAttribute('data-act');
      if (act === 'add') addRow(spec, null);
      else if (act === 'dup') {
        const rows = readGrid(spec);
        addRow(spec, rows.length ? rows[rows.length - 1] : null);
      } else if (act === 'clear') {
        tbody.innerHTML = '';
        addRow(spec, null);
      }
      run();
    });

    (spec.seed || []).forEach(r => addRow(spec, r));
    if (!tbody.children.length) addRow(spec, null);
  }

  function addRow(spec, values) {
    const tbody = document.getElementById(spec.mount + '-body');
    if (!tbody) return;
    const tr = document.createElement('tr');

    spec.columns.forEach(c => {
      const td = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = c.type || 'number';
      if (inp.type === 'number') { inp.step = c.step || 'any'; }
      inp.className = 'grid-input';
      inp.setAttribute('data-key', c.key);
      let v = (values && values[c.key] !== undefined) ? values[c.key] : (c.default !== undefined ? c.default : '');
      if (c.key === spec.autoNameKey && (!values || !values[c.key])) {
        v = 'Level ' + (tbody.children.length + 1);
      }
      inp.value = v;
      inp.addEventListener('input', run);
      td.appendChild(inp);
      tr.appendChild(td);
    });

    const tdA = document.createElement('td');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'grid-del';
    del.innerHTML = '<i class="fa-solid fa-xmark"></i>';
    del.addEventListener('click', () => { tr.remove(); run(); });
    tdA.appendChild(del);
    tr.appendChild(tdA);

    tbody.appendChild(tr);
  }

  function readGrid(spec) {
    const tbody = document.getElementById(spec.mount + '-body');
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll('tr')).map(tr => {
      const o = {};
      tr.querySelectorAll('input[data-key]').forEach(i => {
        const k = i.getAttribute('data-key');
        const col = spec.columns.find(c => c.key === k);
        o[k] = (col && col.type === 'text') ? i.value : parseFloat(i.value);
      });
      return o;
    });
  }

  /* ------------------------------------------------------------------
     Rendering
     ------------------------------------------------------------------ */
  function renderStatus(res) {
    const badge = document.getElementById('calc-status');
    const head = document.getElementById('calc-headline');
    if (badge) {
      badge.textContent = res.status;
      badge.className = 'tool-status-badge ' + (res.status === 'FAIL' ? 'fail' : 'pass');
    }
    if (head) {
      head.textContent = res.headline || '';
      head.className = 'calc-headline ' + (res.status === 'FAIL' ? 'is-fail' : (res.status === 'PASS' ? 'is-pass' : 'is-info'));
    }
  }

  /* Render one result row, converting it into the active unit system when
     its unit string identifies a convertible quantity. Anything else —
     ratios, verdicts, bar callouts — passes through untouched. */
  function displayResult(r) {
    const plain = r.value + (r.unit ? ' ' + r.unit : '');
    if (typeof BNBCProject === 'undefined' || !r.unit) return plain;
    const kind = BNBCProject.kindOf(r.unit);
    if (!kind) return plain;
    const home = BNBCProject.NATIVE_SYS[kind];
    const now = BNBCProject.unitSystem();
    if (!home || home === now) return plain;
    /* Only a bare number can be converted; leave composites like "3 / 4" alone */
    const n = parseFloat(r.value);
    if (!isFinite(n) || /[/×x]/.test(String(r.value))) return plain;
    const fNow = (BNBCProject.UNITS[now][kind] || { f: 1 }).f;
    const fHome = (BNBCProject.UNITS[home][kind] || { f: 1 }).f;
    const conv = n * fNow / fHome;
    const dp = Math.abs(conv) >= 100 ? 1 : (Math.abs(conv) >= 1 ? 3 : 5);
    return conv.toFixed(dp) + ' ' + BNBCProject.unitLabel(kind);
  }

  function renderResults(res) {
    const host = document.getElementById('calc-results');
    if (!host) return;
    host.innerHTML = '';
    (res.results || []).forEach(r => {
      const line = document.createElement('div');
      line.className = 'console-line';
      const lab = document.createElement('span');
      lab.className = 'console-label';
      lab.textContent = r.label;
      const val = document.createElement('span');
      val.className = 'console-val' + (r.flag === 'fail' ? ' val-fail' : (r.flag === 'warn' ? ' val-warn' : (r.flag === 'pass' ? ' val-pass' : '')));
      val.textContent = displayResult(r);
      line.appendChild(lab);
      line.appendChild(val);
      host.appendChild(line);
    });
  }

  function renderWarnings(res) {
    const host = document.getElementById('calc-warnings');
    if (!host) return;
    host.innerHTML = '';
    const w = res.warnings || [];
    if (!w.length) { host.classList.remove('active'); return; }
    host.classList.add('active');
    w.forEach(t => {
      const b = document.createElement('div');
      b.className = 'warning-badge';
      b.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span></span>';
      b.querySelector('span').textContent = t;
      host.appendChild(b);
    });
  }

  function renderSteps(res) {
    const host = document.getElementById('calc-steps');
    if (!host) return;
    host.innerHTML = '';
    (res.steps || []).forEach(s => {
      const card = document.createElement('div');
      card.className = 'accordion-card';

      const head = document.createElement('div');
      head.className = 'accordion-header';
      head.innerHTML =
        '<div class="accordion-header-left">' +
        '<span class="status-dot ' + (s.status || 'pass') + '"></span>' +
        '<h4></h4></div>' +
        '<i class="fa-solid fa-chevron-down"></i>';
      head.querySelector('h4').textContent = 'STEP ' + s.n + ' — ' + s.title;

      const body = document.createElement('div');
      body.className = 'accordion-body';
      body.innerHTML =
        '<div class="step-lab">Method</div><div class="step-math step-method"></div>' +
        '<div class="step-lab">Calculation</div><div class="step-math step-calc"></div>' +
        '<div class="step-lab step-lab-res">Result</div><div class="step-math step-res"></div>';
      body.querySelector('.step-method').textContent = s.formula || '';
      body.querySelector('.step-calc').textContent = s.sub || '';
      body.querySelector('.step-res').textContent = s.res || '';

      head.addEventListener('click', () => {
        const open = body.classList.contains('open');
        host.querySelectorAll('.accordion-body').forEach(b => b.classList.remove('open'));
        host.querySelectorAll('.accordion-header i').forEach(i => { i.className = 'fa-solid fa-chevron-down'; });
        if (!open) {
          body.classList.add('open');
          head.querySelector('i').className = 'fa-solid fa-chevron-up';
        }
      });

      card.appendChild(head);
      card.appendChild(body);
      host.appendChild(card);
    });
  }

  /* Draw the calculator's figure, if it declared one. A failure here must
     never take the numbers down with it. */
  function renderFigure(res) {
    const host = document.getElementById('calc-figure');
    if (!host) return;
    if (!CFG.figure || typeof BNBCDraw === 'undefined') { host.style.display = 'none'; return; }
    try {
      CFG.figure(res, host);
      host.style.display = host.children.length ? 'block' : 'none';
    } catch (err) {
      console.warn('[TwinAnalytic] figure failed', err);
      host.style.display = 'none';
    }
  }

  function renderTable(res) {
    const host = document.getElementById('calc-table');
    if (!host) return;
    host.innerHTML = '';
    const t = res.table;
    if (!t || !t.rows || !t.rows.length) { host.style.display = 'none'; return; }
    host.style.display = 'block';

    const h4 = document.createElement('h4');
    h4.className = 'out-table-title';
    h4.textContent = t.title || 'Results';
    host.appendChild(h4);

    const scroller = document.createElement('div');
    scroller.className = 'out-table-scroll';

    const tbl = document.createElement('table');
    tbl.className = 'out-table';

    const thead = document.createElement('thead');
    const tr = document.createElement('tr');
    (t.headers || []).forEach(x => { const th = document.createElement('th'); th.textContent = x; tr.appendChild(th); });
    thead.appendChild(tr);
    tbl.appendChild(thead);

    const tb = document.createElement('tbody');
    t.rows.forEach(r => {
      const rtr = document.createElement('tr');
      r.forEach(c => {
        const td = document.createElement('td');
        td.textContent = c;
        const s = String(c);
        if (/^(Unsafe|Redesign|Not OK|Soft Storey|Extreme Soft|Extreme Irregular|Irregular)$/i.test(s)) td.classList.add('cell-fail');
        else if (/^(Safe|OK|Regular|Neglect)$/i.test(s)) td.classList.add('cell-pass');
        else if (/^Include P-Δ$/i.test(s)) td.classList.add('cell-warn');
        rtr.appendChild(td);
      });
      tb.appendChild(rtr);
    });
    tbl.appendChild(tb);

    if (t.foot) {
      const tf = document.createElement('tfoot');
      const ftr = document.createElement('tr');
      t.foot.forEach(c => { const td = document.createElement('td'); td.textContent = c; ftr.appendChild(td); });
      tf.appendChild(ftr);
      tbl.appendChild(tf);
    }

    scroller.appendChild(tbl);
    host.appendChild(scroller);
  }

  /* ------------------------------------------------------------------
     Run
     ------------------------------------------------------------------ */
  function run() {
    if (!CFG) return;
    let res;
    try {
      const inputs = CFG.collect();
      res = CFG.calc(inputs);
      LAST = { inputs, res };
      window.calcResults = res.raw;
    } catch (err) {
      console.error('[TwinAnalytic] calculation error', err);
      const head = document.getElementById('calc-headline');
      if (head) { head.textContent = 'Check the inputs — ' + err.message; head.className = 'calc-headline is-fail'; }
      return;
    }
    renderStatus(res);
    renderResults(res);
    renderWarnings(res);
    renderSteps(res);
    renderFigure(res);
    renderTable(res);
    if (CFG.onRender) { try { CFG.onRender(res); } catch (e) { console.warn(e); } }
  }

  /* ------------------------------------------------------------------
     PDF export
     ------------------------------------------------------------------ */
  function exportPDF() {
    if (!LAST) run();
    if (!LAST || !window.jspdf) { window.print(); return; }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    /* Transliterate Greek and maths symbols on the way into the PDF —
       the built-in Helvetica is Latin-1 and renders them as mojibake. */
    if (typeof BNBCPdf !== 'undefined') BNBCPdf.harden(doc);
    const res = LAST.res;

    const M = 14;
    const PW = 210, PH = 297;
    let y = M;

    /* One shared header and footer for every report the site produces */
    function header(page) {
      if (typeof BNBCPdf !== 'undefined') {
        BNBCPdf.header(doc, CFG.title);
        BNBCPdf.footer(doc, page);
      }
    }

    let page = 1;
    header(page);
    y = 32;

    function need(h) {
      if (y + h > PH - 16) { doc.addPage(); page++; header(page); y = 32; }
    }

    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    if (typeof BNBCPdf !== 'undefined' && BNBCPdf.bookmark) BNBCPdf.bookmark(doc, CFG.title);
    doc.text(CFG.title, M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    /* Where the calculator reached a verdict, state it in the box rather
       than as another line of prose. The engines already make the
       distinction: a check sets status PASS or FAIL, while a pure analysis
       — base shear, wind pressure, load combinations — sets INFO, and there
       is nothing to pass or fail. So this needs no per-report judgement. */
    const isCheck = res.status === 'PASS' || res.status === 'FAIL';
    if (isCheck && typeof BNBCPdf !== 'undefined' && BNBCPdf.verdict) {
      y = BNBCPdf.verdict(doc, M, y - 3, PW - 2 * M, {
        pass: res.status === 'PASS',
        headline: res.headline || '',
        detail: (res.warnings && res.warnings.length)
          ? res.warnings.length + ' note' + (res.warnings.length > 1 ? 's' : '')
            + ' recorded below. Full working follows.'
          : 'Full working follows.'
      }) + 4;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      doc.setTextColor(60, 60, 60);
    } else {
      doc.splitTextToSize(res.headline || '', PW - 2 * M).forEach(l => { doc.text(l, M, y); y += 4.4; });
    }

    /* State the unit system the report was produced in. The suite converts
       at the display edge, so the same calculation can be exported in either
       — and a reader holding the paper has no other way to tell which. */
    if (typeof BNBCProject !== 'undefined' && BNBCProject.unitSystem) {
      const sys = BNBCProject.unitSystem();
      doc.setFontSize(7.5); doc.setTextColor(110, 110, 110);
      doc.text('Units: ' + (sys === 'IMP'
        ? 'US customary (kip, ft, in, ksi)'
        : 'Metric SI (kN, m, mm, MPa)'), M, y);
      doc.setFontSize(8.5); doc.setTextColor(60, 60, 60);
      y += 4.4;
    }
    y += 3;

    /* Inputs */
    if (CFG.pdfInputs) {
      need(12);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
      if (typeof BNBCPdf !== 'undefined' && BNBCPdf.bookmark) BNBCPdf.bookmark(doc, 'Design Inputs');
      doc.text('Design Inputs', M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      CFG.pdfInputs(LAST.inputs).forEach(p => {
        need(5);
        doc.setTextColor(90, 90, 90); doc.text(String(p[0]), M + 1, y);
        doc.setTextColor(20, 20, 20); doc.text(String(p[1]), PW - M - 1, y, { align: 'right' });
        y += 4.4;
      });
      y += 3;
    }

    /* Results */
    need(12);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
    if (typeof BNBCPdf !== 'undefined' && BNBCPdf.bookmark) BNBCPdf.bookmark(doc, 'Analysis Output');
    doc.text('Analysis Output', M, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
    (res.results || []).forEach(r => {
      need(5);
      doc.setTextColor(90, 90, 90); doc.text(String(r.label), M + 1, y);
      doc.setTextColor(r.flag === 'fail' ? 190 : 20, r.flag === 'fail' ? 30 : 20, 20);
      doc.text(String(r.value) + (r.unit ? ' ' + r.unit : ''), PW - M - 1, y, { align: 'right' });
      y += 4.4;
    });
    y += 3;

    /* Steps */
    (res.steps || []).forEach(s => {
      need(16);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(138, 107, 46);
      if (typeof BNBCPdf !== 'undefined' && BNBCPdf.bookmark) BNBCPdf.bookmark(doc, 'STEP ' + s.n + ' - ' + s.title);
      doc.text('STEP ' + s.n + ' — ' + s.title, M, y); y += 4.6;
      doc.setFont('courier', 'normal'); doc.setFontSize(7.2); doc.setTextColor(70, 70, 70);
      [s.formula, s.sub].forEach(block => {
        String(block || '').split('\n').forEach(ln => {
          doc.splitTextToSize(ln, PW - 2 * M - 4).forEach(l => { need(4); doc.text(l, M + 3, y); y += 3.4; });
        });
        y += 1;
      });
      doc.setFont('courier', 'bold'); doc.setTextColor(20, 110, 40);
      String(s.res || '').split('\n').forEach(ln => {
        doc.splitTextToSize(ln, PW - 2 * M - 4).forEach(l => { need(4); doc.text(l, M + 3, y); y += 3.6; });
      });
      y += 3;
    });

    /* Table */
    if (res.table && res.table.rows && res.table.rows.length) {
      doc.addPage(); page++; header(page); y = 32;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
      doc.text(res.table.title || 'Results Table', M, y); y += 6;

      const cols = res.table.headers.length;
      const cw = (PW - 2 * M) / cols;
      doc.setFontSize(6.4);
      doc.setFillColor(235, 232, 220);
      doc.rect(M, y - 3.6, PW - 2 * M, 5.2, 'F');
      res.table.headers.forEach((h, i) => {
        doc.setTextColor(40, 40, 40);
        doc.text(String(h).substring(0, 16), M + i * cw + 1, y);
      });
      y += 4;
      doc.setFont('helvetica', 'normal');
      res.table.rows.forEach((r, ri) => {
        if (y > PH - 20) { doc.addPage(); page++; header(page); y = 32; }
        if (ri % 2) { doc.setFillColor(247, 247, 244); doc.rect(M, y - 3.2, PW - 2 * M, 4.4, 'F'); }
        r.forEach((c, i) => {
          doc.setTextColor(45, 45, 45);
          doc.text(String(c).substring(0, 16), M + i * cw + 1, y);
        });
        y += 4.4;
      });
      if (res.table.foot) {
        doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 20, 20);
        res.table.foot.forEach((c, i) => doc.text(String(c).substring(0, 16), M + i * cw + 1, y));
      }
    }

    /* Warnings */
    if (res.warnings && res.warnings.length) {
      need(14);
      y += 4;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(170, 90, 10);
      if (typeof BNBCPdf !== 'undefined' && BNBCPdf.bookmark) BNBCPdf.bookmark(doc, 'Notes and Warnings');
      doc.text('Notes and Warnings', M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 70, 40);
      res.warnings.forEach(w => {
        doc.splitTextToSize('• ' + w, PW - 2 * M - 2).forEach(l => { need(4); doc.text(l, M + 1, y); y += 3.6; });
        y += 1;
      });
    }

    /* Certification block. Kept whole — if it will not fit in the space
       left, it starts a fresh page rather than splitting a signature row
       across the break. */
    if (typeof BNBCPdf !== 'undefined' && BNBCPdf.signatures) {
      const blockH = BNBCPdf.signatures.height(doc, 3);
      y += 6;
      need(blockH);
      BNBCPdf.bookmark(doc, 'Certification');
      BNBCPdf.signatures(doc, y, { heading: 'Certification' });
    }

    doc.save((CFG.slug || 'twinanalytic-report') + '.pdf');
  }

  /* ------------------------------------------------------------------
     Mount
     ------------------------------------------------------------------ */
  function mount(cfg) {
    CFG = cfg;

    (cfg.grids || []).forEach(buildGrid);

    document.addEventListener('DOMContentLoaded', bind);
    if (document.readyState !== 'loading') bind();

    let bound = false;
    function bind() {
      if (bound) return;
      bound = true;

      document.querySelectorAll('#calc-form input, #calc-form select').forEach(el => {
        el.addEventListener('input', run);
        el.addEventListener('change', run);
      });

      const btn = document.getElementById('btn-calculate');
      if (btn) {
        btn.addEventListener('click', e => {
          e.preventDefault();
          if (typeof checkAuthAndRun === 'function') checkAuthAndRun(run, cfg.title, 'calc');
          else run();
        });
      }

      const rst = document.getElementById('btn-reset');
      if (rst) {
        rst.addEventListener('click', e => { e.preventDefault(); window.location.reload(); });
      }

      /* Deliberately not "btn-download-pdf": calculators.js binds that id
         to the column report generator on every page it loads. */
      const pdf = document.getElementById('btn-export-pdf');
      if (pdf) {
        pdf.addEventListener('click', e => {
          e.preventDefault();
          if (typeof checkAuthAndRun === 'function') checkAuthAndRun(exportPDF, cfg.title + ' Report');
          else exportPDF();
        });
      }

      const ham = document.getElementById('hamburger');
      const nav = document.getElementById('nav-links');
      if (ham && nav) ham.addEventListener('click', () => { nav.classList.toggle('active'); ham.classList.toggle('active'); });

      bindWorkspace();

      run();
      if (typeof updateLockUI === 'function') updateLockUI();
    }
  }

  /* ------------------------------------------------------------------
     Project workspace: unit toggle, save / load, share by URL, and
     pulling shared storey data in from the other calculators.
     ------------------------------------------------------------------ */
  function collectFormState() {
    const state = {};
    document.querySelectorAll('#calc-form input, #calc-form select').forEach(el => {
      if (el.id) state[el.id] = el.value;
    });
    (CFG.grids || []).forEach(g => { state['__grid_' + g.mount] = readGrid(g); });
    return state;
  }

  function applyFormState(state) {
    if (!state) return;
    Object.keys(state).forEach(k => {
      if (k.indexOf('__grid_') === 0) return;
      const el = document.getElementById(k);
      if (el) el.value = state[k];
    });
    (CFG.grids || []).forEach(g => {
      const rows = state['__grid_' + g.mount];
      if (!rows || !rows.length) return;
      const body = document.getElementById(g.mount + '-body');
      if (!body) return;
      body.innerHTML = '';
      rows.forEach(r => addRow(g, r));
    });
    run();
  }

  function bindWorkspace() {
    if (typeof BNBCProject === 'undefined') return;

    tagUnits();
    repaintUnits(null);          // label only, no value change on first paint

    let prevSystem = BNBCProject.unitSystem();
    BNBCProject.mountUnitToggle('unit-toggle-host', now => {
      repaintUnits(prevSystem);
      prevSystem = now;
      run();
    });

    /* A link that was shared with inputs baked in */
    const shared = BNBCProject.readShared();
    if (shared) {
      applyFormState(shared);
      toast('Inputs loaded from the shared link.');
    }

    const btnSave = document.getElementById('btn-save-project');
    if (btnSave) btnSave.addEventListener('click', () => {
      const name = prompt('Save these inputs as:', BNBCProject.get().name || CFG.title);
      if (!name) return;
      BNBCProject.saveNamed(name, collectFormState());
      refreshSavedList();
      toast('Saved as "' + name + '".');
    });

    const btnShare = document.getElementById('btn-share-link');
    if (btnShare) btnShare.addEventListener('click', () => {
      const url = BNBCProject.shareURL(collectFormState());
      if (navigator.clipboard) {
        navigator.clipboard.writeText(url).then(
          () => toast('Share link copied to the clipboard.'),
          () => { location.hash = url.split('#')[1]; toast('Link is in the address bar.'); });
      } else {
        location.hash = url.split('#')[1];
        toast('Link is in the address bar.');
      }
    });

    const sel = document.getElementById('saved-project-select');
    if (sel) sel.addEventListener('change', () => {
      if (!sel.value) return;
      applyFormState(BNBCProject.loadNamed(sel.value));
      toast('Loaded "' + sel.value + '".');
    });
    refreshSavedList();

    /* Shared storey data */
    const gridSpec = (CFG.grids || [])[0];
    if (gridSpec && CFG.storeyKeys) {
      const btnPull = document.getElementById('btn-pull-storeys');
      if (btnPull) btnPull.addEventListener('click', () => {
        const rows = BNBCProject.getStoreys();
        if (!rows.length) { toast('No storey data saved yet — push it from another calculator first.'); return; }
        const body = document.getElementById(gridSpec.mount + '-body');
        body.innerHTML = '';
        rows.forEach(r => addRow(gridSpec, r));
        run();
        toast('Loaded ' + rows.length + ' levels from the project.');
      });
      const btnPush = document.getElementById('btn-push-storeys');
      if (btnPush) btnPush.addEventListener('click', () => {
        const rows = readGrid(gridSpec);
        BNBCProject.mergeStoreys(rows, CFG.storeyKeys);
        toast('Shared ' + rows.length + ' levels with the other calculators.');
      });
    }
  }

  function refreshSavedList() {
    const sel = document.getElementById('saved-project-select');
    if (!sel || typeof BNBCProject === 'undefined') return;
    const names = BNBCProject.listSaved();
    sel.innerHTML = '<option value="">Load saved…</option>' +
      names.map(n => '<option>' + n.replace(/</g, '&lt;') + '</option>').join('');
  }

  function toast(msg) {
    let t = document.getElementById('calc-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'calc-toast';
      t.className = 'calc-toast';
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._h);
    t._h = setTimeout(() => t.classList.remove('show'), 2600);
  }

  /* ------------------------------------------------------------------
     Unit handling.

     Each numeric input records the unit its label carried when the page
     loaded — that is the unit the engine expects. The field then displays
     whatever the active system uses, and v() converts back on the way in,
     so the verified engines never see a converted number.
     ------------------------------------------------------------------ */
  const UNIT_RE = /\(([^()]*)\)\s*$/;

  function labelFor(el) {
    const field = el.closest('.input-field');
    return field ? field.querySelector('label') : null;
  }

  function tagUnits() {
    if (typeof BNBCProject === 'undefined') return;
    document.querySelectorAll('#calc-form input[type="number"]').forEach(el => {
      if (el.dataset.nativeKind !== undefined) return;
      const lab = labelFor(el);
      const m = lab ? (lab.textContent || '').match(UNIT_RE) : null;
      const kind = m ? BNBCProject.kindOf(m[1]) : null;
      el.dataset.nativeKind = kind || '';
      if (kind && lab) lab.dataset.baseText = lab.textContent.replace(UNIT_RE, '').trim();
    });
  }

  /* Rewrite the displayed values and labels for the active unit system.

     Pass prevSystem = null on the first paint: the markup seeds each field
     in its own native unit, so the conversion is from the field's home
     system rather than from whatever was on screen before. Skipping that
     conversion would leave a native-imperial page showing inches under a
     millimetre label, and v() would then hand the engine a wrong number. */
  function repaintUnits(prevSystem) {
    if (typeof BNBCProject === 'undefined') return;
    const now = BNBCProject.unitSystem();
    document.querySelectorAll('#calc-form input[type="number"]').forEach(el => {
      const kind = el.dataset.nativeKind;
      if (!kind) return;
      const lab = labelFor(el);
      const home = BNBCProject.NATIVE_SYS[kind];
      const from = prevSystem || home;
      const val = parseFloat(el.value);
      if (isFinite(val) && home && from !== now) {
        const fFrom = (BNBCProject.UNITS[from][kind] || { f: 1 }).f;
        const fHome = (BNBCProject.UNITS[home][kind] || { f: 1 }).f;
        const fNow = (BNBCProject.UNITS[now][kind] || { f: 1 }).f;
        const native = val * fHome / fFrom;          // back to the native unit
        const shown = native * fNow / fHome;         // out to the active unit
        el.value = parseFloat(shown.toPrecision(6));
        /* Remember the exact native value alongside the rounded display
           value, so repeated switching does not drift the calculation. */
        el.dataset.nativeValue = String(native);
        el.dataset.shownValue = el.value;
      }
      if (lab && lab.dataset.baseText) {
        lab.textContent = lab.dataset.baseText + ' (' + BNBCProject.unitLabel(kind) + ')';
      }
    });
  }

  /* Convenience accessors used by the page-level collect() functions */
  function v(id, dflt) {
    const el = document.getElementById(id);
    if (!el) return dflt;
    if (el.type === 'number') {
      const n = parseFloat(el.value);
      if (!isFinite(n)) return dflt;
      const kind = el.dataset ? el.dataset.nativeKind : '';
      if (kind && typeof BNBCProject !== 'undefined') {
        const home = BNBCProject.NATIVE_SYS[kind];
        const now = BNBCProject.unitSystem();
        if (home && home !== now) {
          /* If the field still holds exactly what the last conversion wrote,
             use the exact native value rather than reversing the rounded
             display value — otherwise switching units repeatedly would
             slowly drift the inputs. */
          if (el.dataset.shownValue === el.value && el.dataset.nativeValue) {
            const cached = parseFloat(el.dataset.nativeValue);
            if (isFinite(cached)) return cached;
          }
          const fNow = (BNBCProject.UNITS[now][kind] || { f: 1 }).f;
          const fHome = (BNBCProject.UNITS[home][kind] || { f: 1 }).f;
          return n * fHome / fNow;
        }
      }
      return n;
    }
    return el.value;
  }
  function grid(mountId) {
    const spec = (CFG.grids || []).find(g => g.mount === mountId);
    return spec ? readGrid(spec) : [];
  }

  return { mount, run, v, grid, exportPDF, get last() { return LAST; } };
})();

if (typeof window !== 'undefined') window.BNBCUI = BNBCUI;
