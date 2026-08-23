/* ==========================================================================
   TwinAnalytic — Metric/imperial switching for the RC column calculator
   --------------------------------------------------------------------------
   column-design.html predates the BNBC engine and its unit layer, so it was
   US customary only: feet, kips, ksi, inches and ACI bar numbers. On a site
   written against BNBC 2020 that is the wrong system for most of the people
   using it.

   The verified engine is not touched. It continues to think in imperial from
   end to end; this module converts at the two boundaries:

     on calculate — metric values in the fields are written back as imperial
                    before calculateColumn() reads them, then restored
     after        — the named output fields are rewritten into metric

   Doing it this way means no arithmetic inside the engine changes, so the
   numbers a metric user sees are the same numbers an imperial user sees,
   expressed differently. That is checked by equivalence rather than assumed:
   see scripts/verify-column-units.py.

   Metric bar sizes are handled separately, in js/calculators.js, by adding
   them to the shared lookup with their diameter and area expressed in inches.
   The engine reads a diameter and an area and does not care what the key
   means, so a metric bar needs no conversion at all.
   ========================================================================== */

(function () {
  'use strict';

  var KEY = 'twinanalytic_column_units';   // separate from the BNBC suite's
                                           // key: these are different pages
                                           // with different field sets, and
                                           // sharing it would half-convert one
                                           // of them on load.

  var IN_PER_FT = 12;
  var MM_PER_IN = 25.4;
  var KN_PER_KIP = 4.4482216;
  var KNM_PER_KIPFT = 1.3558179;
  var MPA_PER_KSI = 6.8947573;
  var MM2_PER_IN2 = 645.16;

  /* Every convertible field, with the factor that turns the imperial value the
     engine uses into the metric value shown. `dp` is display precision.

     Fields absent from this table — the steel ratio, the design code, the
     names — are dimensionless or textual and are deliberately left alone. */
  var INPUTS = {
    'column-height': { f: 0.3048,        si: 'm',    imp: 'ft',   dpSi: 3, dpImp: 2, label: 'Column Height' },
    'column-pdl':    { f: KN_PER_KIP,    si: 'kN',   imp: 'k',    dpSi: 1, dpImp: 1, label: 'Dead Load, PDL' },
    'column-pll':    { f: KN_PER_KIP,    si: 'kN',   imp: 'k',    dpSi: 1, dpImp: 1, label: 'Live Load, PLL' },
    'column-mux':    { f: KNM_PER_KIPFT, si: 'kN·m', imp: 'k-ft', dpSi: 1, dpImp: 1, label: 'Factored Moment, Mux' },
    'column-muy':    { f: KNM_PER_KIPFT, si: 'kN·m', imp: 'k-ft', dpSi: 1, dpImp: 1, label: 'Factored Moment, Muy' },
    'column-vu':     { f: KN_PER_KIP,    si: 'kN',   imp: 'k',    dpSi: 1, dpImp: 1, label: 'Factored Shear, Vu' },
    'column-fc':     { f: MPA_PER_KSI,   si: 'MPa',  imp: 'ksi',  dpSi: 1, dpImp: 2, label: 'Concrete Strength, f′c' },
    'column-fy':     { f: MPA_PER_KSI,   si: 'MPa',  imp: 'ksi',  dpSi: 0, dpImp: 1, label: 'Steel Strength, fy' },
    'column-fyt':    { f: MPA_PER_KSI,   si: 'MPa',  imp: 'ksi',  dpSi: 0, dpImp: 1, label: 'Transverse Steel, fyt' },
    'column-cover':  { f: MM_PER_IN,     si: 'mm',   imp: 'in',   dpSi: 0, dpImp: 2, label: 'Clear Cover' }
  };

  function dpFor(spec) { return current === 'SI' ? spec.dpSi : spec.dpImp; }

  /* Outputs, by element id. The engine writes "123.4 in" style strings, so the
     number is parsed out, scaled and put back with the metric unit.

     This is an explicit list rather than a sweep over the results panel: a
     generic walker would have to decide for itself which numbers are lengths
     and which are ratios, and getting that wrong in a structural tool means
     printing a confidently wrong figure. Anything not named here — the D/C
     ratio, slenderness, the concrete volume and steel weight, which the engine
     already reports in m3 and kg — is left exactly as the engine wrote it. */
  var OUTPUTS = {
    'column-out-pu':              { f: KN_PER_KIP, si: 'kN',    dp: 1 },
    'column-out-ag':              { f: MM2_PER_IN2, si: 'mm²', dp: 0 },
    'column-out-dim':             { f: MM_PER_IN,  si: 'mm',    dp: 0 },
    'column-out-final-area':      { f: MM2_PER_IN2, si: 'mm²', dp: 0 },
    'column-out-ast':             { f: MM2_PER_IN2, si: 'mm²', dp: 0 },
    'column-out-tie-spacing':     { f: MM_PER_IN,  si: 'mm',    dp: 0 },
    'column-out-hook-extension':  { f: MM_PER_IN,  si: 'mm',    dp: 0 },
    'column-out-pn-max':          { f: KN_PER_KIP, si: 'kN',    dp: 1 },
    'column-out-phi-pn':          { f: KN_PER_KIP, si: 'kN',    dp: 1 }
  };

  var current = 'IMP';

  function read() {
    try { return localStorage.getItem(KEY) === 'SI' ? 'SI' : 'IMP'; }
    catch (e) { return 'IMP'; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode */ }
  }

  function el(id) { return document.getElementById(id); }

  /* Trailing zeros are only noise after a decimal point. A blanket
     /\.?0+$/ strip turns 400 into 4, which is the kind of quiet corruption
     that is very hard to notice in a field you did not type into. */
  function trim(value, dp) {
    var out = value.toFixed(dp);
    if (out.indexOf('.') !== -1) out = out.replace(/0+$/, '').replace(/\.$/, '');
    return out === '' || out === '-' ? '0' : out;
  }

  function labelFor(id) {
    var input = el(id);
    if (!input) return null;
    var field = input.closest('.input-field');
    return field ? field.querySelector('label') : null;
  }

  /* -------------------------------------------------------------- display */

  function repaint(previous) {
    Object.keys(INPUTS).forEach(function (id) {
      var spec = INPUTS[id];
      var input = el(id);
      if (!input) return;

      var v = parseFloat(input.value);
      if (isFinite(v) && previous !== current) {
        /* Reversing the rounded display would lose whatever the rounding threw
           away — a 1.5 in cover shows as 38 mm, and 38/25.4 comes back as 1.50
           only if you keep the original. So use the cached native whenever the
           field still holds what the last conversion wrote. */
        var native;
        var cached = parseFloat(input.dataset.nativeValue);
        var displayedFromCache = isFinite(cached) &&
          trim(previous === 'SI' ? cached * spec.f : cached,
               previous === 'SI' ? spec.dpSi : spec.dpImp) === input.value.trim();
        if (displayedFromCache) native = cached;
        else native = previous === 'SI' ? v / spec.f : v;

        var shown = current === 'SI' ? native * spec.f : native;
        input.value = trim(shown, dpFor(spec));
        input.dataset.nativeValue = String(native);
      }

      var lab = labelFor(id);
      if (lab) {
        lab.textContent = spec.label + ' (' + (current === 'SI' ? spec.si : spec.imp) + ')';
      }
    });
  }

  /* Native value for the engine: the cached exact one when the field has not
     been retyped since the last conversion, otherwise reverse the display. */
  function nativeOf(id) {
    var spec = INPUTS[id];
    var input = el(id);
    if (!input) return null;
    var v = parseFloat(input.value);
    if (!isFinite(v)) return null;
    if (current !== 'SI') return v;
    var cached = parseFloat(input.dataset.nativeValue);
    if (isFinite(cached) && Math.abs(cached * spec.f - v) < Math.pow(10, -spec.dpSi) / 2) {
      return cached;
    }
    return v / spec.f;
  }

  /* ------------------------------------------------------------ calculate */

  /* Swap imperial in, let the untouched engine run, swap the display back,
     then convert what it wrote. The restore happens in a finally block so a
     throw inside the engine cannot leave imperial numbers sitting under
     metric labels. */
  function runWithNativeInputs(fn) {
    if (current !== 'SI') return fn();

    var saved = {};
    Object.keys(INPUTS).forEach(function (id) {
      var input = el(id);
      if (!input) return;
      saved[id] = input.value;
      var n = nativeOf(id);
      if (n !== null) input.value = String(n);
    });

    try {
      return fn();
    } finally {
      Object.keys(saved).forEach(function (id) {
        var input = el(id);
        if (input) input.value = saved[id];
      });
    }
  }

  var NUM = /^\s*(-?[\d.]+)\s*(.*)$/;

  function convertOutputs() {
    if (current !== 'SI') return;
    Object.keys(OUTPUTS).forEach(function (id) {
      var node = el(id);
      if (!node) return;
      var txt = (node.textContent || '').trim();
      if (!txt || txt === 'N/A') return;
      var m = txt.match(NUM);
      if (!m) return;
      var v = parseFloat(m[1]);
      if (!isFinite(v)) return;
      var spec = OUTPUTS[id];
      node.textContent = (v * spec.f).toFixed(spec.dp) + ' ' + spec.si;
    });
  }

  /* ----------------------------------------------------------------- init */

  function mountToggle() {
    var host = el('column-unit-toggle');
    if (!host) return;
    host.innerHTML =
      '<div class="unit-toggle" role="group" aria-label="Unit system">' +
      '  <button type="button" data-u="SI">Metric</button>' +
      '  <button type="button" data-u="IMP">Imperial</button>' +
      '</div>';
    var paint = function () {
      host.querySelectorAll('button').forEach(function (b) {
        b.classList.toggle('active', b.getAttribute('data-u') === current);
      });
    };
    host.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-u]');
      if (!b) return;
      var next = b.getAttribute('data-u');
      if (next === current) return;
      var previous = current;
      current = next;
      write(current);
      repaint(previous);
      paint();
      recalculate();
    });
    paint();
  }

  function recalculate() {
    var btn = el('btn-calc-column');
    if (btn) btn.click();
  }

  function init() {
    if (!el('column-main-bar')) return;      // not the column page
    current = read();

    mountToggle();
    // The markup is authored in imperial, so that is always what the first
    // paint is converting *from*. Passing the opposite made a fresh load read
    // 10 ft as 10 m and rewrite it as 32.808, and reduced a 1.5 in cover to 0.
    repaint('IMP');

    /* Wrap the engine rather than editing it. Capture phase so the conversion
       is in place before the page's own click handler reads the fields. */
    var btn = el('btn-calc-column');
    if (btn) {
      btn.addEventListener('click', function () {
        /* The page's handler runs after this one in the bubble phase, so the
           swap has to persist across it and be undone afterwards. */
      }, true);
    }

    /* calculateColumn is global, so wrapping it is cleaner and catches every
       caller — the button, the live-update handlers and the initial run. */
    if (typeof window.calculateColumn === 'function') {
      var original = window.calculateColumn;
      window.calculateColumn = function () {
        var out = runWithNativeInputs(function () { return original.apply(this, arguments); });
        convertOutputs();
        return out;
      };
    }

    window.TWColumnUnits = {
      system: function () { return current; },
      set: function (v) {
        var previous = current;
        current = v === 'SI' ? 'SI' : 'IMP';
        write(current);
        repaint(previous);
        mountToggle();
        recalculate();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
