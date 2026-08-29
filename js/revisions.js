/* =====================================================================
   TwinAnalytic — Revision history
   ---------------------------------------------------------------------
   A calculation gets re-issued: a load changes, a section grows, a checker
   sends it back. The report needs to say so, and until now it could not —
   the only revision history in the suite was the fabricated one hardcoded
   into the beam report, which claimed corrections to a beam nobody had
   designed.

   This is the real thing. Rows are entered by the user, kept per calculator
   in localStorage so they survive a reload, and printed as a table in the
   PDF. No rows means no table — an empty "Revision History" heading says
   less than nothing.

   The panel mounts itself above whichever PDF button the page has, so no
   calculator needed new markup for it.
   ===================================================================== */

const TWRevisions = (function () {
  'use strict';

  const PREFIX = 'tw_revisions_';
  const BUTTONS = '#btn-export-pdf, #btn-download-pdf, #btn-footing-pdf, #btn-download-slab-pdf, #btn-download-report-direct';

  function slug() {
    const f = (location.pathname.split('/').pop() || 'index').replace(/\.html$/, '');
    return f || 'index';
  }

  function load() {
    try {
      const raw = localStorage.getItem(PREFIX + slug());
      const v = raw ? JSON.parse(raw) : [];
      return Array.isArray(v) ? v : [];
    } catch (e) { return []; }
  }

  function save(rows) {
    try { localStorage.setItem(PREFIX + slug(), JSON.stringify(rows)); } catch (e) { }
  }

  /* Only rows with something in them. A blank row the user added and never
     filled is not a revision. */
  function rows() {
    return load().filter(function (r) {
      return (r.rev || '').trim() || (r.desc || '').trim();
    });
  }

  function today() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* ------------------------------------------------------------------
     Editor
     ------------------------------------------------------------------ */
  const CSS = `
.tw-rev { margin: 1.25rem 0 0.5rem; border: 1px solid rgba(201,168,76,0.18);
  border-radius: 6px; background: rgba(255,255,255,0.02); }
.tw-rev > summary { cursor: pointer; padding: 0.6rem 0.9rem; font-size: 0.8rem;
  letter-spacing: 0.06em; text-transform: uppercase; color: #c9a84c;
  font-family: var(--font-mono, monospace); list-style: none; }
.tw-rev > summary::-webkit-details-marker { display: none; }
.tw-rev > summary::before { content: '+ '; }
.tw-rev[open] > summary::before { content: '- '; }
.tw-rev-body { padding: 0 0.9rem 0.9rem; }
.tw-rev-hint { font-size: 0.72rem; color: #8b93a1; margin: 0 0 0.6rem; line-height: 1.5; }
.tw-rev-row { display: grid; grid-template-columns: 3.2rem 8rem 1fr 5.5rem 1.8rem;
  gap: 0.4rem; margin-bottom: 0.4rem; align-items: center; }
.tw-rev-row input { width: 100%; background: rgba(30,41,59,0.5);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; padding: 0.35rem 0.45rem;
  color: #fff; font-size: 0.78rem; font-family: var(--font-mono, monospace); }
.tw-rev-row input:focus { outline: none; border-color: #c9a84c; }
.tw-rev-head { font-size: 0.64rem; text-transform: uppercase; letter-spacing: 0.08em;
  color: #8b93a1; }
.tw-rev-del, .tw-rev-add { background: transparent; border: 1px solid rgba(255,255,255,0.15);
  color: #9aa0a6; border-radius: 4px; cursor: pointer; font-size: 0.75rem; padding: 0.3rem 0.5rem; }
.tw-rev-del:hover { border-color: #e57373; color: #e57373; }
.tw-rev-add:hover { border-color: #c9a84c; color: #c9a84c; }
@media (max-width: 640px) {
  .tw-rev-row { grid-template-columns: 2.6rem 1fr 1.8rem; }
  .tw-rev-row .tw-rev-desc { grid-column: 1 / -1; }
  .tw-rev-row .tw-rev-by { grid-column: 1 / -1; }
}`;

  function injectCss() {
    if (document.getElementById('tw-rev-css')) return;
    const st = document.createElement('style');
    st.id = 'tw-rev-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function readEditor(host) {
    return Array.from(host.querySelectorAll('.tw-rev-row[data-i]')).map(function (r) {
      const g = k => (r.querySelector('[data-k="' + k + '"]') || {}).value || '';
      return { rev: g('rev'), date: g('date'), desc: g('desc'), by: g('by') };
    });
  }

  function render(host, data) {
    const body = host.querySelector('.tw-rev-body');
    const list = body.querySelector('.tw-rev-list');
    list.innerHTML = '';
    data.forEach(function (r, i) {
      const row = document.createElement('div');
      row.className = 'tw-rev-row';
      row.setAttribute('data-i', i);
      row.innerHTML =
        '<input data-k="rev"  value="' + esc(r.rev) + '"  placeholder="0">' +
        '<input data-k="date" value="' + esc(r.date) + '" placeholder="YYYY-MM-DD">' +
        '<input data-k="desc" class="tw-rev-desc" value="' + esc(r.desc) + '" placeholder="What changed, and why">' +
        '<input data-k="by"   class="tw-rev-by" value="' + esc(r.by) + '" placeholder="Initials">' +
        '<button type="button" class="tw-rev-del" title="Remove">&times;</button>';
      list.appendChild(row);
    });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function build() {
    const btn = document.querySelector(BUTTONS);
    if (!btn || document.querySelector('.tw-rev')) return;
    injectCss();

    const host = document.createElement('details');
    host.className = 'tw-rev';
    host.innerHTML =
      '<summary>Revision history</summary>' +
      '<div class="tw-rev-body">' +
      '<p class="tw-rev-hint">Printed as a table in the PDF. Leave it empty for a first issue — ' +
      'nothing is added to the report until you enter a row. Kept in this browser only.</p>' +
      '<div class="tw-rev-row tw-rev-head"><span>Rev</span><span>Date</span>' +
      '<span>Description</span><span>By</span><span></span></div>' +
      '<div class="tw-rev-list"></div>' +
      '<button type="button" class="tw-rev-add">+ Add revision</button>' +
      '</div>';

    /* Above the download button, where someone is already thinking about
       issuing the report. */
    const anchor = btn.closest('div') || btn;
    anchor.parentNode.insertBefore(host, anchor);

    const data = load();
    render(host, data.length ? data : []);
    if (data.length) host.open = true;

    host.addEventListener('click', function (e) {
      if (e.target.classList.contains('tw-rev-add')) {
        const cur = readEditor(host);
        cur.push({ rev: String(cur.length), date: today(), desc: '', by: '' });
        render(host, cur); save(cur);
      } else if (e.target.classList.contains('tw-rev-del')) {
        const row = e.target.closest('.tw-rev-row');
        const i = parseInt(row.getAttribute('data-i'), 10);
        const cur = readEditor(host);
        cur.splice(i, 1);
        render(host, cur); save(cur);
      }
    });
    host.addEventListener('input', function () { save(readEditor(host)); });
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
  }

  return { rows: rows, load: load, save: save, slug: slug };
})();

if (typeof window !== 'undefined') window.TWRevisions = TWRevisions;
