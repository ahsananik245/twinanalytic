/* =====================================================================
   TwinAnalytic — Project Workspace and Unit System
   ---------------------------------------------------------------------
   Two things that cut across every calculator:

   1. A project. Storey data typed into the seismic calculator is the same
      data the drift, P-delta, soft storey and overturning checks need.
      It is stored once and offered back on any page that wants it, along
      with save, load and share-by-URL of the whole input set.

   2. A unit system. The engines work in the units their source workbooks
      used. This layer converts what the user types on the way in and what
      they read on the way out, so the verified core is never touched.
   ===================================================================== */

const BNBCProject = (function () {
  'use strict';

  const KEY = 'twinanalytic_project';
  const UNIT_KEY = 'twinanalytic_units';

  function readStore(k, dflt) {
    try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : dflt; }
    catch (e) { return dflt; }
  }
  function writeStore(k, v) {
    try { localStorage.setItem(k, JSON.stringify(v)); return true; }
    catch (e) { return false; }
  }

  /* ===================================================================
     UNIT SYSTEM
     Each quantity declares its factor from the engine's native unit to
     the display unit. Converting only at the edges keeps every verified
     calculation untouched.
     =================================================================== */
  const UNITS = {
    SI: {
      name: 'Metric (SI)',
      length_m: { f: 1, u: 'm' },
      length_mm: { f: 1, u: 'mm' },
      length_in: { f: 25.4, u: 'mm' },
      length_ft: { f: 0.3048, u: 'm' },
      force_kN: { f: 1, u: 'kN' },
      force_k: { f: 4.4482216, u: 'kN' },
      moment_kNm: { f: 1, u: 'kN·m' },
      moment_ftk: { f: 1.35581795, u: 'kN·m' },
      stress_MPa: { f: 1, u: 'MPa' },
      stress_psi: { f: 0.00689476, u: 'MPa' },
      stress_ksi: { f: 6.89476, u: 'MPa' },
      pressure_kPa: { f: 1, u: 'kPa' },
      pressure_ksf: { f: 47.880259, u: 'kPa' },
      pressure_psf: { f: 0.04788026, u: 'kPa' },
      area_mm2: { f: 1, u: 'mm²' },
      area_in2: { f: 645.16, u: 'mm²' },
      udl_kNm: { f: 1, u: 'kN/m' },
      udl_lbft: { f: 0.0145939, u: 'kN/m' },
      density_kNm3: { f: 1, u: 'kN/m³' },
      density_pcf: { f: 0.000157087, u: 'kN/m³' },
      /* Reinforcement area per unit length, how Av/s is quoted. */
      areaper_mm2m: { f: 1, u: 'mm²/m' },
      areaper_in2ft: { f: 2116.6667, u: 'mm²/m' }
    },
    IMP: {
      name: 'US Customary',
      length_m: { f: 3.280839895, u: 'ft' },
      length_mm: { f: 0.03937008, u: 'in' },
      length_in: { f: 1, u: 'in' },
      length_ft: { f: 1, u: 'ft' },
      force_kN: { f: 0.224808943, u: 'kip' },
      force_k: { f: 1, u: 'kip' },
      moment_kNm: { f: 0.737562149, u: 'ft-kip' },
      moment_ftk: { f: 1, u: 'ft-kip' },
      stress_MPa: { f: 145.0377, u: 'psi' },
      stress_psi: { f: 1, u: 'psi' },
      stress_ksi: { f: 1, u: 'ksi' },
      pressure_kPa: { f: 0.020885434, u: 'ksf' },
      pressure_ksf: { f: 1, u: 'ksf' },
      pressure_psf: { f: 1, u: 'psf' },
      areaper_mm2m: { f: 0.00047244, u: 'in²/ft' },
      areaper_in2ft: { f: 1, u: 'in²/ft' },
      area_mm2: { f: 0.001550003, u: 'in²' },
      area_in2: { f: 1, u: 'in²' },
      udl_kNm: { f: 68.5218, u: 'lb/ft' },
      udl_lbft: { f: 1, u: 'lb/ft' },
      density_kNm3: { f: 6365.88, u: 'pcf' },
      density_pcf: { f: 1, u: 'pcf' }
    }
  };

  let currentUnit = readStore(UNIT_KEY, 'SI');

  function unitSystem() { return currentUnit; }
  function setUnitSystem(u) {
    currentUnit = (u === 'IMP') ? 'IMP' : 'SI';
    writeStore(UNIT_KEY, currentUnit);
    document.documentElement.setAttribute('data-units', currentUnit);
  }

  /* Convert a value held in `kind`'s native unit into the display unit */
  function toDisplay(value, kind) {
    const sys = UNITS[currentUnit] || UNITS.SI;
    const spec = sys[kind];
    if (!spec || !isFinite(value)) return value;
    return value * spec.f;
  }
  function fromDisplay(value, kind) {
    const sys = UNITS[currentUnit] || UNITS.SI;
    const spec = sys[kind];
    if (!spec || !isFinite(value) || spec.f === 0) return value;
    return value / spec.f;
  }
  function unitLabel(kind) {
    const sys = UNITS[currentUnit] || UNITS.SI;
    return (sys[kind] || {}).u || '';
  }

  /* -------------------------------------------------------------------
     Map a unit string as it appears in a label or a result row onto the
     quantity kind. This lets the toggle work across every calculator
     without the engines needing to know units exist — the native unit is
     read from the markup the engine already produces.
     ------------------------------------------------------------------- */
  const UNIT_KIND = {
    'm': 'length_m', 'mm': 'length_mm', 'in': 'length_in', 'ft': 'length_ft',
    'kN': 'force_kN', 'k': 'force_k', 'kip': 'force_k', 'kips': 'force_k', 'lb': 'force_k',
    'kN·m': 'moment_kNm', 'kNm': 'moment_kNm', 'kN-m': 'moment_kNm',
    'ft-k': 'moment_ftk', 'ft-kip': 'moment_ftk', 'k-ft': 'moment_ftk', 'kip-ft': 'moment_ftk',
    'MPa': 'stress_MPa', 'psi': 'stress_psi', 'ksi': 'stress_ksi',
    'kPa': 'pressure_kPa', 'ksf': 'pressure_ksf', 'psf': 'pressure_psf',
    'kN/m²': 'pressure_kPa', 'kN/m2': 'pressure_kPa',
    'mm²': 'area_mm2', 'mm2': 'area_mm2', 'in²': 'area_in2', 'in2': 'area_in2',
    'kN/m': 'udl_kNm', 'lb/ft': 'udl_lbft',
    'kN/m³': 'density_kNm3', 'pcf': 'density_pcf',
    /* Bar spacings carry a c/c suffix. Without these the row keeps its
       imperial number on a metric page, next to rows that did convert. */
    'in²/ft': 'areaper_in2ft', 'in2/ft': 'areaper_in2ft', 'mm²/m': 'areaper_mm2m',
    'in c/c': 'length_in', 'mm c/c': 'length_mm',
    'ft c/c': 'length_ft', 'm c/c': 'length_m'
  };

  /* Which system a native unit belongs to, so we know whether to convert */
  const NATIVE_SYS = {
    length_m: 'SI', length_mm: 'SI', force_kN: 'SI', moment_kNm: 'SI',
    stress_MPa: 'SI', pressure_kPa: 'SI', area_mm2: 'SI', udl_kNm: 'SI', density_kNm3: 'SI', areaper_mm2m: 'SI',
    length_in: 'IMP', length_ft: 'IMP', force_k: 'IMP', moment_ftk: 'IMP',
    stress_psi: 'IMP', stress_ksi: 'IMP', pressure_ksf: 'IMP', pressure_psf: 'IMP',
    area_in2: 'IMP', udl_lbft: 'IMP', density_pcf: 'IMP', areaper_in2ft: 'IMP'
  };

  function kindOf(unitStr) {
    if (!unitStr) return null;
    const u = String(unitStr).trim().replace(/^\(|\)$/g, '');
    return UNIT_KIND[u] || null;
  }

  /* Convert a value expressed in `nativeKind` into the active system,
     returning both the number and the label to show. */
  function convert(value, nativeKind) {
    const kind = nativeKind;
    if (!kind || !isFinite(value)) return { v: value, u: unitLabel(kind) };
    const home = NATIVE_SYS[kind];
    if (!home) return { v: value, u: unitLabel(kind) };
    /* factor from the native unit to the active display unit */
    const f = (UNITS[currentUnit][kind] || { f: 1 }).f;
    const back = (UNITS[home][kind] || { f: 1 }).f;
    return { v: value * (back === 0 ? 1 : f / back), u: unitLabel(kind) };
  }

  /* psi and ksi share a kind bucket in the imperial column; keep them apart */
  UNITS.IMP.stress_psi = { f: 1, u: 'psi' };
  UNITS.IMP.stress_ksi = { f: 1, u: 'ksi' };
  UNITS.SI.stress_ksi = { f: 6.89476, u: 'MPa' };

  /* Build the toggle control and drop it into a host element */
  function mountUnitToggle(hostId, onChange) {
    const host = document.getElementById(hostId);
    if (!host) return;
    host.innerHTML =
      '<div class="unit-toggle" role="group" aria-label="Unit system">' +
      '  <button type="button" data-u="SI">Metric</button>' +
      '  <button type="button" data-u="IMP">Imperial</button>' +
      '</div>';
    const paint = () => host.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.getAttribute('data-u') === currentUnit));
    host.addEventListener('click', e => {
      const b = e.target.closest('button[data-u]');
      if (!b) return;
      setUnitSystem(b.getAttribute('data-u'));
      paint();
      if (onChange) onChange(currentUnit);
    });
    paint();
  }

  /* ===================================================================
     PROJECT — shared storey data and saved input sets
     =================================================================== */
  function get() {
    return readStore(KEY, { name: '', storeys: [], inputs: {}, saved: {} });
  }
  function save(p) { return writeStore(KEY, p); }

  /* Storey data shared by the seismic, drift, P-delta, soft storey and
     overturning calculators. Each stores the columns it owns; the level
     name and height are the common key. */
  function getStoreys() { return (get().storeys || []).slice(); }

  function setStoreys(rows) {
    const p = get();
    p.storeys = rows.map(r => ({
      name: r.name || '', h: r.h || 0, w: r.w, P: r.P, V: r.V,
      disp: r.disp, k: r.k, f: r.f
    }));
    save(p);
  }

  /* Merge new columns into the shared storey list, matching on position */
  function mergeStoreys(rows, keys) {
    const cur = getStoreys();
    rows.forEach((r, i) => {
      cur[i] = cur[i] || { name: r.name || ('Level ' + (i + 1)), h: r.h || 0 };
      if (r.name) cur[i].name = r.name;
      if (r.h) cur[i].h = r.h;
      keys.forEach(k => { if (r[k] !== undefined && !isNaN(r[k])) cur[i][k] = r[k]; });
    });
    cur.length = rows.length;
    setStoreys(cur);
    return cur;
  }

  /* ---- Named saves ---- */
  function listSaved() { return Object.keys(get().saved || {}).sort(); }
  function saveNamed(name, inputs) {
    if (!name) return false;
    const p = get();
    p.saved = p.saved || {};
    p.saved[name] = { inputs: inputs, at: new Date().toISOString() };
    return save(p);
  }
  function loadNamed(name) {
    const p = get();
    return (p.saved && p.saved[name]) ? p.saved[name].inputs : null;
  }
  function deleteNamed(name) {
    const p = get();
    if (p.saved) delete p.saved[name];
    return save(p);
  }

  /* ---- Share by URL ----
     Inputs are compacted into a base64url payload in the hash so nothing
     is sent to a server and the link works from a static host. */
  function encodeState(obj) {
    try {
      const json = JSON.stringify(obj);
      const b64 = btoa(unescape(encodeURIComponent(json)));
      return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) { return ''; }
  }
  function decodeState(s) {
    try {
      const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(b64))));
    } catch (e) { return null; }
  }
  function shareURL(inputs) {
    const payload = encodeState({ v: 1, u: currentUnit, i: inputs });
    return location.origin + location.pathname + '#s=' + payload;
  }
  function readShared() {
    const m = (location.hash || '').match(/[#&]s=([A-Za-z0-9\-_]+)/);
    if (!m) return null;
    const st = decodeState(m[1]);
    if (!st) return null;
    if (st.u) setUnitSystem(st.u);
    return st.i || null;
  }

  return {
    UNITS, UNIT_KIND, NATIVE_SYS, kindOf, convert,
    unitSystem, setUnitSystem, toDisplay, fromDisplay, unitLabel,
    mountUnitToggle,
    get, save, getStoreys, setStoreys, mergeStoreys,
    listSaved, saveNamed, loadNamed, deleteNamed,
    shareURL, readShared, encodeState, decodeState
  };
})();

if (typeof window !== 'undefined') {
  window.BNBCProject = BNBCProject;
  try { document.documentElement.setAttribute('data-units', BNBCProject.unitSystem()); } catch (e) { }
}
