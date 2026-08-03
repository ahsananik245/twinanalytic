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
      val.textContent = r.value + (r.unit ? ' ' + r.unit : '');
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
    const res = LAST.res;

    const M = 14;
    const PW = 210, PH = 297;
    let y = M;

    function header(page) {
      doc.setFillColor(11, 15, 23);
      doc.rect(0, 0, PW, 24, 'F');
      doc.setTextColor(201, 168, 76);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text('TwinAnalytic', M, 11);
      doc.setTextColor(220, 220, 220);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
      doc.text('Precision Analysis Suite  |  BNBC 2020 / ACI 318', M, 17);
      doc.setFontSize(9); doc.setTextColor(255, 255, 255);
      doc.text(CFG.title, PW - M, 11, { align: 'right' });
      doc.setFontSize(7); doc.setTextColor(180, 180, 180);
      doc.text(new Date().toLocaleString(), PW - M, 17, { align: 'right' });
      doc.setDrawColor(201, 168, 76); doc.setLineWidth(0.4);
      doc.line(M, 24, PW - M, 24);
      doc.setFontSize(7); doc.setTextColor(130, 130, 130);
      doc.text('Page ' + page, PW / 2, PH - 8, { align: 'center' });
      doc.text('Generated by twinanalytic.com — verify against project specific requirements before construction.', PW / 2, PH - 4, { align: 'center' });
    }

    let page = 1;
    header(page);
    y = 32;

    function need(h) {
      if (y + h > PH - 16) { doc.addPage(); page++; header(page); y = 32; }
    }

    doc.setTextColor(30, 30, 30);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12);
    doc.text(CFG.title, M, y); y += 6;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
    doc.setTextColor(60, 60, 60);
    doc.splitTextToSize(res.headline || '', PW - 2 * M).forEach(l => { doc.text(l, M, y); y += 4.4; });
    y += 3;

    /* Inputs */
    if (CFG.pdfInputs) {
      need(12);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(20, 20, 20);
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
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8.8); doc.setTextColor(201, 140, 20);
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
      doc.text('Notes and Warnings', M, y); y += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(90, 70, 40);
      res.warnings.forEach(w => {
        doc.splitTextToSize('• ' + w, PW - 2 * M - 2).forEach(l => { need(4); doc.text(l, M + 1, y); y += 3.6; });
        y += 1;
      });
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
          if (typeof checkAuthAndRun === 'function') checkAuthAndRun(run, cfg.title);
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

      run();
      if (typeof updateLockUI === 'function') updateLockUI();
    }
  }

  /* Convenience accessors used by the page-level collect() functions */
  function v(id, dflt) {
    const el = document.getElementById(id);
    if (!el) return dflt;
    if (el.type === 'number') { const n = parseFloat(el.value); return isFinite(n) ? n : dflt; }
    return el.value;
  }
  function grid(mountId) {
    const spec = (CFG.grids || []).find(g => g.mount === mountId);
    return spec ? readGrid(spec) : [];
  }

  return { mount, run, v, grid, exportPDF, get last() { return LAST; } };
})();

if (typeof window !== 'undefined') window.BNBCUI = BNBCUI;
