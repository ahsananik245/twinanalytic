/* ==========================================================================
   TwinAnalytic — EtabsX licence request form
   --------------------------------------------------------------------------
   The page sold the software and then asked people to "email the machine
   code" without printing an address, a bKash number or a bank account. This
   is the missing step: the customer sends what is needed to issue a key, and
   the payment details are replied privately rather than published.

   Publishing a bKash number on a public page invites every scammer with a
   screenshot generator to impersonate it. Collecting the request and
   answering it keeps the account details between two people who are already
   talking.

   THE MACHINE CODE IS THE POINT
   Everything else here is ordinary contact detail. A key is bound to the
   machine code and unlocks nothing else, so a code that arrives with one
   character wrong produces a key that fails for the customer, costs a
   support round trip, and cannot be reused. It is validated here, hard,
   before anything is sent.

   Submission reuses the same Google Apps Script pipeline the contact form
   uses, so a licence request lands in the same sheet and the same Leads
   panel as everything else, with a local copy kept regardless.
   ========================================================================== */
(function () {
  'use strict';

  var MACHINE_RE = /^[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}$/;

  var PLANS = {
    project: 'Project — 30 days',
    quarterly: 'Quarterly — 90 days',
    annual: 'Annual — 365 days',
    perpetual: 'Perpetual — no expiry',
    academic: 'Academic — free',
    unsure: 'Not sure yet — advise me'
  };

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
               "'": '&#39;' }[c];
    });
  }

  /* Contact details come from data/content.json so they stay editable in the
     admin panel. A WhatsApp number is offered only if one is actually set —
     a dead button is worse than none. */
  function contact() {
    var c = (window.TWContent && window.TWContent.get &&
             window.TWContent.get('contact')) || {};
    return {
      email: (c.email || 'solutions@twinanalytic.com').trim(),
      whatsapp: String(c.whatsapp || '').replace(/[^\d]/g, '')
    };
  }

  function fieldError(el, msg) {
    var hint = el.parentNode.querySelector('.ord-err');
    if (!hint) {
      hint = document.createElement('p');
      hint.className = 'ord-err';
      el.parentNode.appendChild(hint);
    }
    hint.textContent = msg || '';
    el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    el.classList.toggle('is-bad', !!msg);
    return !msg;
  }

  function collect(form) {
    return {
      machine: ($('#ord-machine', form).value || '').trim().toUpperCase(),
      plan: $('#ord-plan', form).value,
      name: ($('#ord-name', form).value || '').trim(),
      firm: ($('#ord-firm', form).value || '').trim(),
      email: ($('#ord-email', form).value || '').trim(),
      phone: ($('#ord-phone', form).value || '').trim(),
      note: ($('#ord-note', form).value || '').trim()
    };
  }

  function validate(form, d) {
    var ok = true;
    ok = fieldError($('#ord-machine', form),
      !d.machine ? 'Open EtabsX and copy the machine code it shows.'
      : !MACHINE_RE.test(d.machine)
        ? 'That is not a machine code — it is sixteen characters in four ' +
          'groups, like ABCD-1234-EF56-7890. Copy it rather than retyping it.'
        : '') && ok;
    ok = fieldError($('#ord-name', form),
      d.name ? '' : 'Please give a name so we know who to reply to.') && ok;
    ok = fieldError($('#ord-email', form),
      !d.email ? 'An email address is needed to send the key.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)
        ? 'That email address does not look right.' : '') && ok;
    return ok;
  }

  /* A single plain-text block, used for both the WhatsApp message and the
     mailto body. One format means the seller reads the same thing whichever
     way it arrives. */
  function messageText(d) {
    return 'EtabsX licence request\n\n' +
      'Machine code: ' + d.machine + '\n' +
      'Plan: ' + (PLANS[d.plan] || d.plan) + '\n' +
      'Name: ' + d.name + '\n' +
      (d.firm ? 'Firm: ' + d.firm + '\n' : '') +
      'Email: ' + d.email + '\n' +
      (d.phone ? 'Phone: ' + d.phone + '\n' : '') +
      (d.note ? '\n' + d.note + '\n' : '') +
      '\nPlease send the payment details.';
  }

  function record(d) {
    /* Same shape the contact form writes, so licence requests appear in the
       Leads panel beside everything else rather than in a second place
       nobody remembers to check. */
    var lead = {
      name: d.name,
      email: d.email,
      phone: d.phone || 'N/A',
      timestamp: new Date().toLocaleString(),
      calcType: 'EtabsX licence [' + d.plan + ']: ' + d.machine,
      location: d.firm || 'N/A',
      geometry: d.machine,
      reinforcement: PLANS[d.plan] || d.plan,
      status: 'awaiting payment details',
      concreteVol: 'N/A',
      steelWeight: 'N/A',
      note: d.note || ''
    };
    try {
      var all = JSON.parse(localStorage.getItem('tools_leads') || '[]');
      all.push(lead);
      localStorage.setItem('tools_leads', JSON.stringify(all));
    } catch (e) { /* private windows throw; the send below still runs */ }

    var endpoint = window.TW_GOOGLE_SCRIPT_URL;
    if (endpoint) {
      /* no-cors, so the response cannot be read and failure cannot be
         detected. The local copy and the WhatsApp/email fallback below are
         what actually guarantee the request reaches someone. */
      fetch(endpoint, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(lead)
      }).catch(function () { });
    }
    return lead;
  }

  function success(form, d) {
    var c = contact();
    var msg = encodeURIComponent(messageText(d));
    var wa = c.whatsapp
      ? '<a class="btn btn-gold ord-send" target="_blank" rel="noopener" ' +
        'href="https://wa.me/' + esc(c.whatsapp) + '?text=' + msg + '">' +
        '<i class="fa-brands fa-whatsapp"></i> Send on WhatsApp</a>'
      : '';
    var mail = '<a class="btn ord-send" href="mailto:' + esc(c.email) +
      '?subject=' + encodeURIComponent('EtabsX licence — ' + d.machine) +
      '&body=' + msg + '"><i class="fa-solid fa-envelope"></i> Send by email</a>';

    form.parentNode.setAttribute('aria-live', 'polite');
    form.parentNode.innerHTML =
      '<div class="ord-done">' +
        '<div class="ord-tick"><i class="fa-solid fa-circle-check"></i></div>' +
        '<h3>Request received</h3>' +
        '<p>We have your machine code <strong class="ord-mono">' +
          esc(d.machine) + '</strong> and will reply to <strong>' +
          esc(d.email) + '</strong> with the payment details — bKash, Nagad ' +
          'or bank transfer.</p>' +
        '<p class="ord-sub">Once payment is confirmed you get a licence key. ' +
          'Paste it into EtabsX and it carries on where it left off — same ' +
          'program, no reinstall.</p>' +
        /* The send buttons are the point of this screen, not decoration. A
           form post through no-cors cannot be confirmed, so giving the
           customer a way to send the same details themselves is what makes
           the request reliable rather than hopeful. */
        '<p class="ord-sub"><strong>To reach us faster, send it directly:</strong></p>' +
        '<div class="ord-actions">' + wa + mail + '</div>' +
      '</div>';
  }

  function init() {
    var form = $('#etabsx-order');
    if (!form) return;

    var sel = $('#ord-plan', form);
    if (sel && !sel.options.length) {
      Object.keys(PLANS).forEach(function (k) {
        var o = document.createElement('option');
        o.value = k; o.textContent = PLANS[k];
        if (k === 'annual') o.selected = true;
        sel.appendChild(o);
      });
    }

    /* Uppercase as they type, and accept a code pasted without hyphens —
       people copy from a screenshot or read it over the phone. */
    var mach = $('#ord-machine', form);
    mach.addEventListener('input', function () {
      var raw = mach.value.replace(/[^0-9A-Fa-f]/g, '').toUpperCase().slice(0, 16);
      var parts = raw.match(/.{1,4}/g) || [];
      var pos = mach.selectionStart === mach.value.length;
      mach.value = parts.join('-');
      if (pos) mach.setSelectionRange(mach.value.length, mach.value.length);
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var d = collect(form);
      if (!validate(form, d)) {
        var bad = form.querySelector('.is-bad');
        if (bad) bad.focus();
        return;
      }
      record(d);
      success(form, d);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
