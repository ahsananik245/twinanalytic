/* ==========================================================================
   TwinAnalytic — Admin Control Panel
   --------------------------------------------------------------------------
   A no-build, single-page control panel for a static site.

   How it works
     1. Fetches data/content.json (the published state).
     2. Keeps a working copy ("draft") in localStorage, autosaved as you type.
     3. Renders forms from js/admin-schema.js.
     4. Publishing commits the draft back to data/content.json through the
        GitHub Contents API, which triggers a Vercel redeploy. If no token is
        configured you can download the file and upload it by hand instead.

   Security note
     The passcode is a client-side lock only. The GitHub token is the real
     credential and never leaves this browser.
   ========================================================================== */

(function () {
  'use strict';

  var SCHEMA = window.ADMIN_SCHEMA;
  var CONTENT_URL = 'data/content.json';

  var K = {
    PASS: 'tw_admin_passhash',
    SESSION: 'tw_admin_session',
    DRAFT: 'tw_content_draft',
    PREVIEW: 'tw_preview_enabled',
    GH: 'tw_gh_settings',
    BACKUPS: 'tw_content_backups',
    LEADS: 'tools_leads'
  };

  var MAX_BACKUPS = 15;

  var state = {
    published: null,   // last known contents of data/content.json
    draft: null,       // working copy being edited
    section: 'dashboard',
    leads: [],
    leadSort: { key: 'timestamp', dir: 'desc' },
    leadQuery: '',
    publishing: false
  };

  // ======================================================================
  // STORAGE HELPERS
  // Hardened profiles and private windows can throw on any localStorage
  // access, so every call is wrapped.
  // ======================================================================
  function lsGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function lsDel(key) {
    try { localStorage.removeItem(key); } catch (e) { /* nothing to clean up */ }
  }
  function jsonGet(key, fallback) {
    var raw = lsGet(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function jsonSet(key, value) {
    return lsSet(key, JSON.stringify(value));
  }

  // ======================================================================
  // SMALL UTILITIES
  // ======================================================================
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function getPath(obj, path) {
    if (!obj) return undefined;
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function setPath(obj, path, value) {
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      var key = parts[i];
      var nextIsIndex = /^\d+$/.test(parts[i + 1]);
      if (cur[key] === null || typeof cur[key] !== 'object') {
        cur[key] = nextIsIndex ? [] : {};
      }
      cur = cur[key];
    }
    cur[parts[parts.length - 1]] = value;
  }

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function debounce(fn, ms) {
    var t;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }

  function formatDateTime(value) {
    if (!value) return '—';
    var d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) return String(value);
    // Intl keeps the format correct for the viewer's own locale.
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium', timeStyle: 'short'
    }).format(d);
  }

  function formatNumber(n) {
    return new Intl.NumberFormat().format(n || 0);
  }

  // UTF-8 safe base64, required by the GitHub Contents API.
  function toBase64(str) {
    var bytes = new TextEncoder().encode(str);
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }

  function sha256Hex(text) {
    var data = new TextEncoder().encode(text);
    return crypto.subtle.digest('SHA-256', data).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  // ======================================================================
  // TOASTS
  // ======================================================================
  var ICONS = {
    success: 'fa-solid fa-circle-check',
    error: 'fa-solid fa-circle-exclamation',
    info: 'fa-solid fa-circle-info'
  };

  function toast(message, kind, ms) {
    kind = kind || 'info';
    var host = $('#a-toasts');
    if (!host) return;

    var el = document.createElement('div');
    el.className = 'a-toast is-' + kind;
    el.innerHTML = '<i class="' + ICONS[kind] + '" aria-hidden="true"></i><span></span>';
    el.querySelector('span').textContent = message;
    host.appendChild(el);

    setTimeout(function () {
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 200);
    }, ms || 4000);
  }

  // ======================================================================
  // CONFIRMATION MODAL
  // Destructive actions never fire immediately.
  // ======================================================================
  function confirmAction(opts) {
    return new Promise(function (resolve) {
      var modal = $('#a-modal');
      var confirmBtn = $('#a-modal-confirm');
      var cancelBtn = $('#a-modal-cancel');
      var lastFocus = document.activeElement;

      $('#a-modal-title').textContent = opts.title || 'Are you sure?';
      $('#a-modal-body').textContent = opts.body || 'This action cannot be undone.';
      confirmBtn.textContent = opts.confirmLabel || 'Confirm';
      confirmBtn.className = 'a-btn ' + (opts.danger === false ? 'a-btn-gold' : 'a-btn-danger');

      modal.hidden = false;
      confirmBtn.focus();

      function cleanup(result) {
        modal.hidden = true;
        confirmBtn.removeEventListener('click', onYes);
        cancelBtn.removeEventListener('click', onNo);
        document.removeEventListener('keydown', onKey);
        if (lastFocus && lastFocus.focus) lastFocus.focus();
        resolve(result);
      }
      function onYes() { cleanup(true); }
      function onNo() { cleanup(false); }
      function onKey(e) {
        if (e.key === 'Escape') cleanup(false);
      }

      confirmBtn.addEventListener('click', onYes);
      cancelBtn.addEventListener('click', onNo);
      document.addEventListener('keydown', onKey);
    });
  }

  // ======================================================================
  // PASSCODE GATE
  // ======================================================================
  function initGate() {
    var gate = $('#a-gate');
    var form = $('#a-gate-form');
    var input = $('#a-gate-input');
    var confirmField = $('#a-gate-confirm-field');
    var confirmInput = $('#a-gate-confirm');
    var errorEl = $('#a-gate-error');
    var submit = $('#a-gate-submit');
    var sub = $('#a-gate-sub');

    var storedHash = lsGet(K.PASS);
    var isFirstRun = !storedHash;

    if (isFirstRun) {
      sub.textContent = 'Create a passcode to protect this control panel.';
      confirmField.hidden = false;
      confirmInput.required = true;
      input.setAttribute('autocomplete', 'new-password');
      submit.textContent = 'Set Passcode & Continue';
    }

    // An unlocked session survives page reloads but not closing the browser.
    try {
      if (sessionStorage.getItem(K.SESSION) === 'true' && !isFirstRun) {
        return openApp();
      }
    } catch (e) { /* sessionStorage unavailable — fall through to the prompt */ }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      errorEl.textContent = '';

      var value = input.value;
      if (!value) {
        errorEl.textContent = 'Enter a passcode to continue.';
        input.focus();
        return;
      }

      if (isFirstRun) {
        if (value.length < 6) {
          errorEl.textContent = 'Use at least 6 characters so it is not trivially guessable.';
          input.focus();
          return;
        }
        if (value !== confirmInput.value) {
          errorEl.textContent = 'The two passcodes do not match. Re-enter them.';
          confirmInput.focus();
          return;
        }
        sha256Hex(value).then(function (hash) {
          lsSet(K.PASS, hash);
          try { sessionStorage.setItem(K.SESSION, 'true'); } catch (err) { /* optional */ }
          openApp();
        });
        return;
      }

      submit.disabled = true;
      sha256Hex(value).then(function (hash) {
        submit.disabled = false;
        if (hash === storedHash) {
          try { sessionStorage.setItem(K.SESSION, 'true'); } catch (err) { /* optional */ }
          openApp();
        } else {
          errorEl.textContent = 'That passcode is not correct. Try again.';
          input.value = '';
          input.focus();
        }
      });
    });

    input.focus();

    function openApp() {
      gate.hidden = true;
      $('#a-app').hidden = false;
      boot();
    }
  }

  // ======================================================================
  // BOOT
  // ======================================================================
  function boot() {
    buildNav();
    wireShell();

    fetch(CONTENT_URL, { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (published) {
        state.published = published;
        var draft = jsonGet(K.DRAFT, null);
        state.draft = draft ? mergeDraft(published, draft) : clone(published);
        finishBoot();
      })
      .catch(function (err) {
        // Without the published file there is nothing safe to edit against —
        // publishing a draft built on guesses could wipe real content.
        $('#a-panels').innerHTML =
          '<div class="a-callout a-callout-danger">' +
            '<i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
            '<div><strong>Could not load data/content.json</strong><br>' +
            esc(String(err.message || err)) +
            '<br><br>If you opened this file directly from disk, browsers block the fetch. ' +
            'Run <code>python dev-server.py</code> and open ' +
            '<code>http://localhost:8000/admin.html</code> instead.</div>' +
          '</div>';
      });
  }

  // Old drafts must not resurrect keys that were deleted from the published
  // file, but they must survive new keys being added to it.
  function mergeDraft(published, draft) {
    var base = clone(published);
    Object.keys(draft).forEach(function (key) {
      base[key] = draft[key];
    });
    return base;
  }

  function finishBoot() {
    state.leads = jsonGet(K.LEADS, []);
    buildPanels();
    var initial = (location.hash || '').replace(/^#/, '');
    showSection(sectionExists(initial) ? initial : 'dashboard');
    updateDirty();
    updateNavCounts();
  }

  function sectionExists(id) {
    return SCHEMA.sections.some(function (s) { return s.id === id; });
  }

  // ======================================================================
  // SHELL WIRING
  // ======================================================================
  function wireShell() {
    var sidebar = $('#a-sidebar');
    var scrim = $('#a-sidebar-scrim');
    var toggle = $('#a-menu-toggle');

    toggle.addEventListener('click', function () {
      var open = sidebar.classList.toggle('is-open');
      scrim.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });

    scrim.addEventListener('click', closeSidebar);

    function closeSidebar() {
      sidebar.classList.remove('is-open');
      scrim.hidden = true;
      toggle.setAttribute('aria-expanded', 'false');
    }
    window.__closeSidebar = closeSidebar;

    $('#a-btn-publish').addEventListener('click', function () { showSection('publish'); });
    $('#a-btn-preview').addEventListener('click', openPreview);

    // Deep links: the URL always reflects the open section.
    window.addEventListener('hashchange', function () {
      var id = (location.hash || '').replace(/^#/, '');
      if (sectionExists(id) && id !== state.section) showSection(id);
    });

    // Unsaved work must never be lost silently.
    window.addEventListener('beforeunload', function (e) {
      if (isDirty()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });

    document.addEventListener('keydown', function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveDraft();
        toast('Draft saved in this browser. Publish to make it live.', 'info');
      }
    });
  }

  function openPreview() {
    saveDraft();
    lsSet(K.PREVIEW, 'true');
    window.open('index.html?preview=1', '_blank', 'noopener');
    toast('Draft preview opened in a new tab.', 'info');
  }

  // ======================================================================
  // NAVIGATION
  // ======================================================================
  function buildNav() {
    var nav = $('#a-nav');
    var groups = [];
    var byGroup = {};

    SCHEMA.sections.forEach(function (s) {
      var g = s.group || 'General';
      if (!byGroup[g]) { byGroup[g] = []; groups.push(g); }
      byGroup[g].push(s);
    });

    nav.innerHTML = groups.map(function (g) {
      return '<div class="a-nav-group">' +
        '<p class="a-nav-group-title">' + esc(g) + '</p>' +
        byGroup[g].map(function (s) {
          return '<button type="button" class="a-nav-btn" data-section="' + esc(s.id) + '">' +
            '<i class="' + esc(s.icon) + '" aria-hidden="true"></i>' +
            '<span>' + esc(s.label) + '</span>' +
            '<span class="a-nav-count" data-count-for="' + esc(s.id) + '" hidden></span>' +
          '</button>';
        }).join('') +
      '</div>';
    }).join('');

    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-section]');
      if (!btn) return;
      showSection(btn.getAttribute('data-section'));
      if (window.__closeSidebar) window.__closeSidebar();
    });
  }

  function updateNavCounts() {
    setCount('services', (state.draft.services || []).length);
    setCount('team', (state.draft.team || []).length);
    setCount('projects', (state.draft.projects || []).length);
    setCount('blog', (state.draft.blog || []).length);
    setCount('testimonials', (state.draft.testimonials || []).length);
    setCount('calculators', (state.draft.calculators || []).length);
    setCount('leads', state.leads.length);
    setCount('history', jsonGet(K.BACKUPS, []).length);
  }

  function setCount(id, n) {
    var el = $('[data-count-for="' + id + '"]');
    if (!el) return;
    el.hidden = !n;
    el.textContent = formatNumber(n);
  }

  function showSection(id) {
    state.section = id;
    if (location.hash.replace(/^#/, '') !== id) {
      history.replaceState(null, '', '#' + id);
    }

    $$('.a-nav-btn').forEach(function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-section') === id);
    });

    $$('.a-panel').forEach(function (p) {
      p.hidden = p.getAttribute('data-panel') !== id;
    });

    var section = SCHEMA.sections.filter(function (s) { return s.id === id; })[0];
    $('#a-topbar-title').textContent = section ? section.title || section.label : 'Control Panel';

    // Custom panels hold live data, so they re-render on every visit.
    if (section && section.custom) renderCustomPanel(section);

    $('#a-main-content').scrollTo ? window.scrollTo(0, 0) : null;
  }

  // ======================================================================
  // PANEL CONSTRUCTION
  // ======================================================================
  function buildPanels() {
    var host = $('#a-panels');
    host.innerHTML = SCHEMA.sections.map(function (s) {
      return '<section class="a-panel" data-panel="' + esc(s.id) + '" hidden>' +
          '<header class="a-panel-head">' +
            '<h2>' + esc(s.title || s.label) + '</h2>' +
            (s.desc ? '<p>' + esc(s.desc) + '</p>' : '') +
          '</header>' +
          '<div data-panel-body="' + esc(s.id) + '">' +
            (s.cards ? s.cards.map(function (card, i) { return renderCard(card, s.id + '-' + i); }).join('') : '') +
          '</div>' +
        '</section>';
    }).join('');

    wireInputs(host);
  }

  function renderCard(card, uid) {
    var body;
    if (card.type === 'list') {
      body = '<div data-list-host="' + esc(card.path) + '">' + renderList(card) + '</div>';
    } else if (card.type === 'tags') {
      body = renderTagsEditor(card.path, card.hint);
    } else {
      body = '<div class="a-grid">' + card.fields.map(function (f) {
        return renderField(f, card.path ? card.path + '.' + f.key : f.key);
      }).join('') + '</div>';
    }

    return '<div class="a-card"' + (card.danger ? ' style="border-color: rgba(240,80,90,0.3);"' : '') + ' data-card="' + esc(uid) + '">' +
        '<h3 class="a-card-title"><i class="' + esc(card.icon || 'fa-solid fa-square') + '" aria-hidden="true"></i>' + esc(card.title) + '</h3>' +
        (card.desc ? '<p class="a-card-desc">' + esc(card.desc) + '</p>' : '') +
        body +
      '</div>';
  }

  // ---------------------------------------------------------------- fields
  var fieldSeq = 0;

  function renderField(f, path) {
    var id = 'fld-' + (++fieldSeq);
    var value = getPath(state.draft, path);
    var wide = f.wide || f.type === 'textarea' || f.type === 'html' ? ' is-wide' : '';

    var control;
    switch (f.type) {
      case 'toggle':
        return '<div class="a-field is-wide">' +
            '<div class="a-toggle-row">' +
              '<span class="a-switch">' +
                '<input type="checkbox" id="' + id + '" data-path="' + esc(path) + '" data-type="toggle"' +
                  (value === true ? ' checked' : '') + '>' +
                '<span class="a-switch-track"></span>' +
              '</span>' +
              '<span class="a-toggle-text">' +
                '<label for="' + id + '"><strong>' + esc(f.label) + '</strong></label>' +
                (f.hint ? '<span>' + esc(f.hint) + '</span>' : '') +
              '</span>' +
            '</div>' +
          '</div>';

      case 'color':
        control =
          '<div class="a-color-row">' +
            '<input type="color" class="a-color-swatch" value="' + esc(value || '#000000') + '"' +
              ' data-path="' + esc(path) + '" data-type="color" aria-label="' + esc(f.label) + ' colour picker">' +
            '<input type="text" class="a-input is-mono" id="' + id + '" value="' + esc(value) + '"' +
              ' data-path="' + esc(path) + '" data-type="text" data-color-text="1"' +
              ' spellcheck="false" autocomplete="off" placeholder="#C9A84C">' +
          '</div>';
        break;

      case 'image':
        control =
          '<div class="a-image-row">' +
            '<img class="a-image-preview" src="' + esc(value || '') + '" alt="" data-image-preview="' + esc(path) + '" width="72" height="54" loading="lazy">' +
            '<div class="a-image-fields">' +
              '<input type="text" class="a-input is-mono" id="' + id + '" value="' + esc(value) + '"' +
                ' data-path="' + esc(path) + '" data-type="image" spellcheck="false" autocomplete="off"' +
                ' placeholder="assets/your-image.jpg" list="a-assets">' +
            '</div>' +
          '</div>';
        break;

      case 'icon':
        control =
          '<div class="a-icon-row">' +
            '<span class="a-icon-preview" data-icon-preview="' + esc(path) + '" aria-hidden="true"><i class="' + esc(value) + '"></i></span>' +
            '<input type="text" class="a-input is-mono" id="' + id + '" value="' + esc(value) + '"' +
              ' data-path="' + esc(path) + '" data-type="icon" spellcheck="false" autocomplete="off"' +
              ' placeholder="fa-solid fa-cube" list="a-icons">' +
          '</div>';
        break;

      case 'textarea':
      case 'html':
        control = '<textarea class="a-textarea' + (f.mono ? ' is-mono' : '') + '" id="' + id + '"' +
          ' data-path="' + esc(path) + '" data-type="text"' +
          (f.counter ? ' data-counter="' + f.counter + '"' : '') +
          ' rows="3" placeholder="' + esc(f.placeholder || '') + '">' + esc(value) + '</textarea>';
        break;

      case 'select':
        var options = [];
        if (f.optionsFrom) {
          var src = getPath(state.draft, f.optionsFrom) || [];
          if (f.skipFirst) src = src.slice(1);
          options = src.map(function (o) { return { value: o.value, label: o.label }; });
        } else {
          options = (f.options || []).map(function (o) {
            return typeof o === 'string' ? { value: o, label: o } : o;
          });
        }
        control = '<select class="a-select" id="' + id + '" data-path="' + esc(path) + '" data-type="text">' +
          '<option value="">— none —</option>' +
          options.map(function (o) {
            return '<option value="' + esc(o.value) + '"' + (o.value === value ? ' selected' : '') + '>' + esc(o.label) + '</option>';
          }).join('') +
          '</select>';
        break;

      case 'tags':
        return renderTagsField(f, path, id);

      case 'number':
        control = '<input type="number" class="a-input" id="' + id + '" value="' + esc(value) + '"' +
          ' data-path="' + esc(path) + '" data-type="number" inputmode="numeric"' +
          (f.min !== undefined ? ' min="' + f.min + '"' : '') +
          (f.max !== undefined ? ' max="' + f.max + '"' : '') + '>';
        break;

      case 'email':
        control = '<input type="email" class="a-input" id="' + id + '" value="' + esc(value) + '"' +
          ' data-path="' + esc(path) + '" data-type="text" inputmode="email" spellcheck="false" autocomplete="off"' +
          ' placeholder="' + esc(f.placeholder || 'name@example.com') + '">';
        break;

      case 'url':
        control = '<input type="url" class="a-input' + (f.mono ? ' is-mono' : '') + '" id="' + id + '" value="' + esc(value) + '"' +
          ' data-path="' + esc(path) + '" data-type="text" inputmode="url" spellcheck="false" autocomplete="off"' +
          ' placeholder="' + esc(f.placeholder || 'https://example.com') + '">';
        break;

      default:
        control = '<input type="text" class="a-input' + (f.mono ? ' is-mono' : '') + '" id="' + id + '" value="' + esc(value) + '"' +
          ' data-path="' + esc(path) + '" data-type="text" autocomplete="off"' +
          (f.counter ? ' data-counter="' + f.counter + '"' : '') +
          ' placeholder="' + esc(f.placeholder || '') + '">';
    }

    return '<div class="a-field' + wide + '">' +
        '<label for="' + id + '">' + esc(f.label) + '</label>' +
        control +
        (f.counter ? '<p class="a-field-hint" data-counter-for="' + id + '"></p>' : '') +
        (f.hint ? '<p class="a-field-hint">' + esc(f.hint) + '</p>' : '') +
      '</div>';
  }

  // A tags field edits an array of plain strings as one-per-line text.
  function renderTagsField(f, path, id) {
    var value = getPath(state.draft, path) || [];
    return '<div class="a-field is-wide">' +
        '<label for="' + id + '">' + esc(f.label) + '</label>' +
        '<textarea class="a-textarea" id="' + id + '" rows="4"' +
          ' data-path="' + esc(path) + '" data-type="lines" spellcheck="false">' +
          esc(value.join('\n')) +
        '</textarea>' +
        (f.hint ? '<p class="a-field-hint">' + esc(f.hint) + '</p>' : '') +
      '</div>';
  }

  function renderTagsEditor(path, hint) {
    var value = getPath(state.draft, path) || [];
    var id = 'fld-' + (++fieldSeq);
    return '<div class="a-field is-wide">' +
        '<label for="' + id + '" class="a-sr-only">Items, one per line</label>' +
        '<textarea class="a-textarea" id="' + id + '" rows="6"' +
          ' data-path="' + esc(path) + '" data-type="lines" spellcheck="false">' +
          esc(value.join('\n')) +
        '</textarea>' +
        (hint ? '<p class="a-field-hint">' + esc(hint) + '</p>' : '') +
      '</div>';
  }

  // ----------------------------------------------------------------- lists
  function renderList(card) {
    var items = getPath(state.draft, card.path) || [];
    var html = '';

    if (!items.length) {
      html += '<div class="a-list-empty">' + esc(card.emptyText || 'Nothing here yet.') + '</div>';
    }

    html += items.map(function (item, i) {
      var itemPath = card.path + '.' + i;
      var label = item[card.itemLabel] || '(untitled)';
      var off = item.enabled === false;

      var inner = card.fields.map(function (f) {
        if (f.type === 'list') {
          // Nested list (footer column links).
          return '<div class="a-field is-wide">' +
              '<span class="a-label">' + esc(f.label) + '</span>' +
              '<div data-list-host="' + esc(itemPath + '.' + f.key) + '">' +
                renderList({
                  path: itemPath + '.' + f.key,
                  fields: f.fields,
                  itemLabel: f.itemLabel,
                  addLabel: f.addLabel,
                  emptyText: 'No links yet.'
                }) +
              '</div>' +
            '</div>';
        }
        return renderField(f, itemPath + '.' + f.key);
      }).join('');

      return '<div class="a-list-item' + (off ? ' is-disabled' : '') + '" data-item-index="' + i + '">' +
          '<div class="a-list-head">' +
            '<span class="a-list-handle">' + String(i + 1).padStart(2, '0') + '</span>' +
            '<span class="a-list-title">' + esc(label) + '</span>' +
            '<button type="button" class="a-btn a-btn-sm a-btn-icon" data-list-act="up" data-list-path="' + esc(card.path) + '" data-index="' + i + '" aria-label="Move ' + esc(label) + ' up"' + (i === 0 ? ' disabled' : '') + '>' +
              '<i class="fa-solid fa-chevron-up" aria-hidden="true"></i></button>' +
            '<button type="button" class="a-btn a-btn-sm a-btn-icon" data-list-act="down" data-list-path="' + esc(card.path) + '" data-index="' + i + '" aria-label="Move ' + esc(label) + ' down"' + (i === items.length - 1 ? ' disabled' : '') + '>' +
              '<i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>' +
            '<button type="button" class="a-btn a-btn-sm a-btn-icon" data-list-act="dup" data-list-path="' + esc(card.path) + '" data-index="' + i + '" aria-label="Duplicate ' + esc(label) + '">' +
              '<i class="fa-solid fa-copy" aria-hidden="true"></i></button>' +
            '<button type="button" class="a-btn a-btn-sm a-btn-icon a-btn-danger" data-list-act="del" data-list-path="' + esc(card.path) + '" data-index="' + i + '" aria-label="Delete ' + esc(label) + '">' +
              '<i class="fa-solid fa-trash" aria-hidden="true"></i></button>' +
            '<button type="button" class="a-btn a-btn-sm a-btn-icon" data-list-act="toggle" data-list-path="' + esc(card.path) + '" data-index="' + i + '" aria-label="Expand or collapse ' + esc(label) + '" aria-expanded="false">' +
              '<i class="fa-solid fa-chevron-right" aria-hidden="true"></i></button>' +
          '</div>' +
          '<div class="a-list-body" hidden><div class="a-grid">' + inner + '</div></div>' +
        '</div>';
    }).join('');

    html += '<button type="button" class="a-btn a-btn-sm" data-list-act="add" data-list-path="' + esc(card.path) + '" data-fields=\'' +
      esc(JSON.stringify(card.fields.map(function (f) { return { key: f.key, type: f.type }; }))) +
      '\'><i class="fa-solid fa-plus" aria-hidden="true"></i> ' + esc(card.addLabel || 'Add Item') + '</button>';

    return html;
  }

  function findCardByPath(path) {
    var found = null;
    SCHEMA.sections.forEach(function (s) {
      (s.cards || []).forEach(function (c) {
        if (c.path === path) found = c;
        (c.fields || []).forEach(function (f) {
          if (f.type === 'list' && path.indexOf('.' + f.key) === path.length - f.key.length - 1) {
            found = found || { path: path, fields: f.fields, itemLabel: f.itemLabel, addLabel: f.addLabel, emptyText: 'No links yet.' };
          }
        });
      });
    });
    return found;
  }

  function rerenderList(path) {
    var host = $('[data-list-host="' + path + '"]');
    if (!host) return;
    var card = findCardByPath(path);
    if (!card) return;
    host.innerHTML = renderList(card);
    wireInputs(host);
    updateNavCounts();
  }

  // ======================================================================
  // INPUT WIRING
  // ======================================================================
  var saveDraftDebounced = debounce(function () { saveDraft(); }, 400);

  function wireInputs(root) {
    // Text-ish inputs update on every keystroke; the draft save is debounced.
    root.addEventListener('input', onInput);
    root.addEventListener('change', onInput);
    root.addEventListener('click', onClick);
  }

  function onInput(e) {
    var el = e.target;
    var path = el.getAttribute && el.getAttribute('data-path');
    if (!path) return;

    var type = el.getAttribute('data-type');
    var value;

    switch (type) {
      case 'toggle':
        value = el.checked;
        var item = el.closest('.a-list-item');
        if (item && /\.enabled$/.test(path)) item.classList.toggle('is-disabled', !value);
        break;
      case 'number':
        value = el.value === '' ? '' : Number(el.value);
        break;
      case 'lines':
        value = el.value.split('\n').map(function (s) { return s.trim(); }).filter(Boolean);
        break;
      case 'color':
        value = el.value;
        // Keep the paired hex text box in sync.
        var textBox = el.parentNode.querySelector('[data-color-text]');
        if (textBox) textBox.value = value;
        break;
      case 'image':
        value = el.value;
        var preview = $('[data-image-preview="' + path + '"]');
        if (preview) preview.src = value;
        break;
      case 'icon':
        value = el.value;
        var iconBox = $('[data-icon-preview="' + path + '"]');
        if (iconBox) iconBox.innerHTML = '<i class="' + esc(value) + '"></i>';
        break;
      default:
        value = el.value;
        if (el.hasAttribute('data-color-text')) {
          var swatch = el.parentNode.querySelector('.a-color-swatch');
          if (swatch && /^#[0-9a-f]{6}$/i.test(value)) swatch.value = value;
        }
    }

    setPath(state.draft, path, value);

    // Keep the collapsed list header label in step with its title field.
    var listItem = el.closest && el.closest('.a-list-item');
    if (listItem) {
      var titleEl = listItem.querySelector('.a-list-title');
      var firstText = listItem.querySelector('.a-list-body input[data-type="text"]');
      if (titleEl && firstText && firstText === el) titleEl.textContent = el.value || '(untitled)';
    }

    // Character counters for SEO fields.
    var limit = el.getAttribute('data-counter');
    if (limit) {
      var counter = $('[data-counter-for="' + el.id + '"]');
      if (counter) {
        var len = el.value.length;
        counter.textContent = len + ' / ' + limit + ' characters';
        counter.style.color = len > Number(limit) ? 'var(--a-amber)' : 'var(--a-text-faint)';
      }
    }

    markDirty();
    saveDraftDebounced();
  }

  function onClick(e) {
    var btn = e.target.closest('[data-list-act]');
    if (!btn) return;

    var act = btn.getAttribute('data-list-act');
    var path = btn.getAttribute('data-list-path');
    var index = Number(btn.getAttribute('data-index'));

    if (act === 'toggle') {
      var item = btn.closest('.a-list-item');
      var body = item.querySelector('.a-list-body');
      var open = body.hidden;
      body.hidden = !open;
      item.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.querySelector('i').className = open ? 'fa-solid fa-chevron-down' : 'fa-solid fa-chevron-right';
      return;
    }

    var list = getPath(state.draft, path);
    if (!Array.isArray(list)) {
      list = [];
      setPath(state.draft, path, list);
    }

    if (act === 'add') {
      var fields = JSON.parse(btn.getAttribute('data-fields'));
      var blank = {};
      fields.forEach(function (f) {
        if (f.key === 'enabled') blank[f.key] = true;
        else if (f.type === 'tags' || f.type === 'list') blank[f.key] = [];
        else if (f.type === 'toggle') blank[f.key] = true;
        else blank[f.key] = '';
      });
      list.push(blank);
      commitList(path);
      return;
    }

    if (act === 'up' && index > 0) {
      list.splice(index - 1, 0, list.splice(index, 1)[0]);
      commitList(path);
      return;
    }

    if (act === 'down' && index < list.length - 1) {
      list.splice(index + 1, 0, list.splice(index, 1)[0]);
      commitList(path);
      return;
    }

    if (act === 'dup') {
      list.splice(index + 1, 0, clone(list[index]));
      commitList(path);
      return;
    }

    if (act === 'del') {
      var label = list[index] && (list[index].title || list[index].name || list[index].label) || 'this item';
      confirmAction({
        title: 'Delete this item?',
        body: 'Removing “' + label + '” takes effect on your live site the next time you publish.',
        confirmLabel: 'Delete Item'
      }).then(function (ok) {
        if (!ok) return;
        list.splice(index, 1);
        commitList(path);
        toast('Item deleted from the draft.', 'success');
      });
    }
  }

  function commitList(path) {
    rerenderList(path);
    markDirty();
    saveDraft();
  }

  // ======================================================================
  // DRAFT / DIRTY STATE
  // ======================================================================
  function isDirty() {
    if (!state.published || !state.draft) return false;
    return JSON.stringify(state.draft) !== JSON.stringify(state.published);
  }

  function saveDraft() {
    if (!state.draft) return;
    if (!jsonSet(K.DRAFT, state.draft)) {
      toast('Could not save the draft — this browser is blocking storage.', 'error', 7000);
    }
  }

  function markDirty() {
    updateDirty();
  }

  function updateDirty() {
    var el = $('#a-dirty-indicator');
    if (!el) return;
    var dirty = isDirty();
    el.classList.toggle('is-dirty', dirty);
    el.classList.toggle('is-clean', !dirty);
    el.textContent = dirty ? 'Unpublished Changes' : 'All Changes Published';
    var btn = $('#a-btn-publish');
    if (btn) btn.classList.toggle('a-btn-gold', true);
    if (state.section === 'dashboard' || state.section === 'publish') {
      var section = SCHEMA.sections.filter(function (s) { return s.id === state.section; })[0];
      if (section) renderCustomPanel(section);
    }
  }

  // ======================================================================
  // CUSTOM PANELS
  // ======================================================================
  function renderCustomPanel(section) {
    var body = $('[data-panel-body="' + section.id + '"]');
    if (!body) return;

    switch (section.custom) {
      case 'dashboard': body.innerHTML = dashboardHtml(); wireDashboard(body); break;
      case 'leads': body.innerHTML = leadsHtml(); wireLeads(body); break;
      case 'publish': body.innerHTML = publishHtml(); wirePublish(body); break;
      case 'history': body.innerHTML = historyHtml(); wireHistory(body); break;
      case 'settings': body.innerHTML = settingsHtml(); wireSettings(body); break;
      case 'themeExtras':
        // Theme panel keeps its schema cards; just append the live swatch strip.
        if (!body.querySelector('[data-theme-extras]')) {
          var extra = document.createElement('div');
          extra.setAttribute('data-theme-extras', '1');
          extra.innerHTML = themeExtrasHtml();
          body.appendChild(extra);
          wireThemeExtras(extra);
        }
        break;
      case 'calcTools':
        if (!body.querySelector('[data-calc-tools]')) {
          var tools = document.createElement('div');
          tools.setAttribute('data-calc-tools', '1');
          tools.innerHTML = calcToolsHtml();
          body.appendChild(tools);
          wireCalcTools(tools);
        }
        break;

      case 'seoPreview':
        if (!body.querySelector('[data-seo-note]')) {
          var note = document.createElement('div');
          note.setAttribute('data-seo-note', '1');
          note.className = 'a-callout a-callout-info';
          note.innerHTML = '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
            '<div>Aim for tab titles under 60 characters and descriptions under 160 — ' +
            'search engines truncate anything longer. The counters under each field turn amber when you go over.</div>';
          body.insertBefore(note, body.firstChild);
        }
        break;
    }
  }

  // ---------------------------------------------------------------- dashboard
  function dashboardHtml() {
    var d = state.draft || {};
    var dirty = isDirty();
    var recent = state.leads.slice(-5).reverse();

    return '' +
      (dirty
        ? '<div class="a-callout a-callout-warn"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
          '<div><strong>You have unpublished changes.</strong> They are saved in this browser but are not live yet. ' +
          'Open <button type="button" class="a-btn a-btn-sm" data-go="publish" style="margin: 0 0.25rem;">Publish</button> when you are ready.</div></div>'
        : '<div class="a-callout a-callout-info"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>' +
          '<div>Your draft matches what is published. Nothing pending.</div></div>') +

      (getPath(d, 'features.maintenanceMode')
        ? '<div class="a-callout a-callout-danger"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>' +
          '<div><strong>Maintenance mode is on.</strong> Visitors see a holding page instead of your site.</div></div>'
        : '') +

      '<div class="a-stats">' +
        stat((d.services || []).length, 'Services') +
        stat((d.projects || []).length, 'Projects') +
        stat((d.team || []).length, 'Team Members') +
        stat(((d.calculators || []).filter(function (c) { return c.enabled !== false; })).length, 'Live Calculators') +
        stat((d.blog || []).length, 'Articles') +
        stat(state.leads.length, 'Leads Captured') +
      '</div>' +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-bolt" aria-hidden="true"></i>Quick Actions</h3>' +
        '<p class="a-card-desc">Jump straight to the things you change most often.</p>' +
        '<div class="a-btn-row">' +
          quick('home-hero', 'fa-solid fa-star', 'Edit Hero') +
          quick('services', 'fa-solid fa-briefcase', 'Edit Services') +
          quick('projects', 'fa-solid fa-building', 'Add a Project') +
          quick('contact', 'fa-solid fa-address-book', 'Contact Details') +
          quick('theme', 'fa-solid fa-palette', 'Change Colours') +
          quick('features', 'fa-solid fa-toggle-on', 'Feature Toggles') +
        '</div>' +
      '</div>' +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-inbox" aria-hidden="true"></i>Latest Leads</h3>' +
        (recent.length
          ? '<div class="a-table-wrap"><table class="a-table"><thead><tr>' +
              '<th scope="col">Name</th><th scope="col">Email</th><th scope="col">Source</th><th scope="col">When</th>' +
            '</tr></thead><tbody>' +
            recent.map(function (l) {
              return '<tr><td>' + esc(l.name || '—') + '</td>' +
                '<td>' + esc(l.email || '—') + '</td>' +
                '<td><span class="a-tag">' + esc(l.calcType || '—') + '</span></td>' +
                '<td class="is-num">' + esc(l.timestamp || '—') + '</td></tr>';
            }).join('') +
            '</tbody></table></div>' +
            '<div class="a-btn-row" style="margin-top: 1rem;">' + quick('leads', 'fa-solid fa-inbox', 'View All Leads') + '</div>'
          : '<p class="a-card-desc" style="margin: 0;">No leads captured in this browser yet.</p>') +
      '</div>';
  }

  function stat(value, label) {
    return '<div class="a-stat"><div class="a-stat-value">' + formatNumber(value) + '</div>' +
      '<div class="a-stat-label">' + esc(label) + '</div></div>';
  }

  function quick(target, icon, label) {
    return '<button type="button" class="a-btn a-btn-sm" data-go="' + esc(target) + '">' +
      '<i class="' + esc(icon) + '" aria-hidden="true"></i> ' + esc(label) + '</button>';
  }

  function wireDashboard(root) {
    root.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-go]');
      if (btn) showSection(btn.getAttribute('data-go'));
    });
  }

  // ------------------------------------------------------------ theme extras
  function themeExtrasHtml() {
    return '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i>Presets</h3>' +
        '<p class="a-card-desc">Apply a ready-made palette, then fine-tune it above. This only changes the draft — publish to go live.</p>' +
        '<div class="a-btn-row">' +
          preset('gold', 'Signature Gold', '#C9A84C') +
          preset('steel', 'Steel Blue', '#4F86C6') +
          preset('emerald', 'Emerald', '#3FB984') +
          preset('copper', 'Copper', '#C87941') +
          preset('violet', 'Violet', '#8B7BD8') +
        '</div>' +
        '<hr class="a-divider">' +
        '<div class="a-btn-row">' +
          '<button type="button" class="a-btn a-btn-sm" data-theme-act="preview-live">' +
            '<i class="fa-solid fa-eye" aria-hidden="true"></i> Preview on the Site</button>' +
          '<button type="button" class="a-btn a-btn-sm" data-theme-act="reset">' +
            '<i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Reset to Published Colours</button>' +
        '</div>' +
      '</div>';
  }

  function preset(id, label, swatch) {
    return '<button type="button" class="a-btn a-btn-sm" data-preset="' + esc(id) + '">' +
      '<span style="width:0.8rem;height:0.8rem;border-radius:50%;background:' + esc(swatch) + ';display:inline-block;" aria-hidden="true"></span> ' +
      esc(label) + '</button>';
  }

  var PRESETS = {
    gold:    { colorGold: '#C9A84C', colorGoldLight: '#E8C97E', bgPrimary: '#0A0A0A', bgSecondary: '#0D1117' },
    steel:   { colorGold: '#4F86C6', colorGoldLight: '#87B4E4', bgPrimary: '#080A0D', bgSecondary: '#0C1219' },
    emerald: { colorGold: '#3FB984', colorGoldLight: '#7BD9B0', bgPrimary: '#070B09', bgSecondary: '#0B1512' },
    copper:  { colorGold: '#C87941', colorGoldLight: '#E5A473', bgPrimary: '#0B0806', bgSecondary: '#15100B' },
    violet:  { colorGold: '#8B7BD8', colorGoldLight: '#B3A7EC', bgPrimary: '#08070D', bgSecondary: '#100E1A' }
  };

  function wireThemeExtras(root) {
    root.addEventListener('click', function (e) {
      var presetBtn = e.target.closest('[data-preset]');
      if (presetBtn) {
        var p = PRESETS[presetBtn.getAttribute('data-preset')];
        Object.keys(p).forEach(function (k) { state.draft.theme[k] = p[k]; });
        refreshPanelFields('theme');
        markDirty();
        saveDraft();
        toast('Palette applied to the draft.', 'success');
        return;
      }

      var act = e.target.closest('[data-theme-act]');
      if (!act) return;

      if (act.getAttribute('data-theme-act') === 'preview-live') {
        openPreview();
      } else {
        state.draft.theme = clone(state.published.theme);
        refreshPanelFields('theme');
        markDirty();
        saveDraft();
        toast('Colours reset to the published values.', 'info');
      }
    });
  }

  // Re-render a schema-driven panel in place (used after bulk value changes).
  function refreshPanelFields(sectionId) {
    var section = SCHEMA.sections.filter(function (s) { return s.id === sectionId; })[0];
    var body = $('[data-panel-body="' + sectionId + '"]');
    if (!section || !body || !section.cards) return;

    var extras = body.querySelector('[data-theme-extras]');
    body.innerHTML = section.cards.map(function (card, i) {
      return renderCard(card, sectionId + '-' + i);
    }).join('');
    if (extras) body.appendChild(extras);
    wireInputs(body);
  }

  // -------------------------------------------------------------- calc tools
  function calcToolsHtml() {
    var unlocked = lsGet('tools_user_unlocked') === 'true';
    return '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-flask" aria-hidden="true"></i>Test the Lead Gate</h3>' +
        '<p class="a-card-desc">Once you unlock a calculator as a visitor, this browser stays unlocked. ' +
        'Reset it here to see the gate again exactly as a first-time visitor does.</p>' +
        '<p class="a-field-hint" style="margin-bottom: 1rem;">Current state in this browser: <strong style="color: ' +
          (unlocked ? 'var(--a-green)' : 'var(--a-amber)') + ';">' +
          (unlocked ? 'Unlocked' : 'Locked') + '</strong></p>' +
        '<div class="a-btn-row">' +
          '<button type="button" class="a-btn" data-calc-act="lock"><i class="fa-solid fa-lock" aria-hidden="true"></i> Reset to Locked</button>' +
          '<button type="button" class="a-btn" data-calc-act="unlock"><i class="fa-solid fa-lock-open" aria-hidden="true"></i> Unlock This Browser</button>' +
          '<a class="a-btn" href="calculators.html" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square" aria-hidden="true"></i> Open Calculators</a>' +
        '</div>' +
      '</div>';
  }

  function wireCalcTools(root) {
    root.addEventListener('click', function (e) {
      var act = e.target.closest('[data-calc-act]');
      if (!act) return;

      if (act.getAttribute('data-calc-act') === 'lock') {
        lsDel('tools_user_unlocked');
        toast('Reset. Calculators will show the lead gate again in this browser.', 'success');
      } else {
        lsSet('tools_user_unlocked', 'true');
        toast('This browser is now treated as unlocked.', 'success');
      }

      root.innerHTML = calcToolsHtml();
    });
  }

  // ------------------------------------------------------------------- leads
  function leadsHtml() {
    var leads = filteredLeads();

    return '' +
      '<div class="a-stats">' +
        stat(state.leads.length, 'Total Leads') +
        stat(uniqueEmails(), 'Unique Emails') +
        stat(leadsThisWeek(), 'Last 7 Days') +
      '</div>' +

      '<div class="a-card">' +
        '<div class="a-btn-row" style="margin-bottom: 1rem;">' +
          '<div class="a-search">' +
            '<i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i>' +
            '<label for="a-lead-search" class="a-sr-only">Search leads</label>' +
            '<input type="search" id="a-lead-search" class="a-input" placeholder="Search name, email, or source…" value="' + esc(state.leadQuery) + '" autocomplete="off">' +
          '</div>' +
          '<button type="button" class="a-btn a-btn-sm" data-lead-act="csv"><i class="fa-solid fa-file-csv" aria-hidden="true"></i> Export CSV</button>' +
          '<button type="button" class="a-btn a-btn-sm" data-lead-act="json"><i class="fa-solid fa-file-code" aria-hidden="true"></i> Export JSON</button>' +
          '<button type="button" class="a-btn a-btn-sm a-btn-danger" data-lead-act="clear"><i class="fa-solid fa-trash" aria-hidden="true"></i> Clear All</button>' +
        '</div>' +

        '<div class="a-table-wrap">' +
          '<table class="a-table">' +
            '<thead><tr>' +
              leadTh('name', 'Name') +
              leadTh('email', 'Email') +
              leadTh('phone', 'Phone / Country') +
              leadTh('calcType', 'Source') +
              leadTh('timestamp', 'Logged') +
              '<th scope="col"><span class="a-sr-only">Actions</span></th>' +
            '</tr></thead>' +
            '<tbody>' +
              (leads.length
                ? leads.map(function (l) {
                    return '<tr>' +
                      '<td style="color: var(--a-text);">' + esc(l.name || '—') + '</td>' +
                      '<td><a href="mailto:' + esc(l.email || '') + '">' + esc(l.email || '—') + '</a></td>' +
                      '<td>' + esc(l.country || l.phone || '—') + '</td>' +
                      '<td><span class="a-tag">' + esc(l.calcType || '—') + '</span></td>' +
                      '<td class="is-num">' + esc(l.timestamp || '—') + '</td>' +
                      '<td><button type="button" class="a-btn a-btn-sm a-btn-icon a-btn-danger" data-lead-del="' + esc(l.__i) + '" aria-label="Delete lead from ' + esc(l.name || l.email || 'unknown') + '">' +
                        '<i class="fa-solid fa-xmark" aria-hidden="true"></i></button></td>' +
                    '</tr>';
                  }).join('')
                : '<tr class="a-table-empty"><td colspan="6">' +
                  (state.leadQuery ? 'No leads match “' + esc(state.leadQuery) + '”.' : 'No leads captured in this browser yet.') +
                  '</td></tr>') +
            '</tbody>' +
          '</table>' +
        '</div>' +
      '</div>' +

      '<div class="a-callout a-callout-info">' +
        '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
        '<div>Leads are stored in <strong>this browser only</strong>, plus your Google Apps Script sheet if one is configured under Integrations. ' +
        'Clearing your browser data removes them here — export regularly, or rely on the sheet as the system of record.</div>' +
      '</div>';
  }

  function leadTh(key, label) {
    var active = state.leadSort.key === key;
    var arrow = active ? (state.leadSort.dir === 'asc' ? 'fa-arrow-up-short-wide' : 'fa-arrow-down-wide-short') : 'fa-sort';
    return '<th scope="col"><button type="button" data-lead-sort="' + esc(key) + '">' + esc(label) +
      ' <i class="fa-solid ' + arrow + '" aria-hidden="true"></i></button></th>';
  }

  function filteredLeads() {
    var q = state.leadQuery.toLowerCase().trim();
    var list = state.leads.map(function (l, i) {
      var copy = Object.assign({}, l);
      copy.__i = i;
      return copy;
    });

    if (q) {
      list = list.filter(function (l) {
        return [l.name, l.email, l.calcType, l.phone, l.country, l.location]
          .filter(Boolean).join(' ').toLowerCase().indexOf(q) !== -1;
      });
    }

    var key = state.leadSort.key;
    var dir = state.leadSort.dir === 'asc' ? 1 : -1;
    list.sort(function (a, b) {
      var av = String(a[key] || '').toLowerCase();
      var bv = String(b[key] || '').toLowerCase();
      if (key === 'timestamp') {
        var ad = Date.parse(a.timestamp), bd = Date.parse(b.timestamp);
        if (!isNaN(ad) && !isNaN(bd)) return (ad - bd) * dir;
      }
      return av < bv ? -dir : av > bv ? dir : 0;
    });

    return list;
  }

  function uniqueEmails() {
    var seen = {};
    state.leads.forEach(function (l) { if (l.email) seen[l.email.toLowerCase()] = 1; });
    return Object.keys(seen).length;
  }

  function leadsThisWeek() {
    var cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return state.leads.filter(function (l) {
      var t = Date.parse(l.timestamp);
      return !isNaN(t) && t >= cutoff;
    }).length;
  }

  function wireLeads(root) {
    var search = $('#a-lead-search', root);
    if (search) {
      search.addEventListener('input', debounce(function () {
        state.leadQuery = search.value;
        var section = SCHEMA.sections.filter(function (s) { return s.id === 'leads'; })[0];
        renderCustomPanel(section);
        var again = $('#a-lead-search');
        if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); }
      }, 200));
    }

    root.addEventListener('click', function (e) {
      var sortBtn = e.target.closest('[data-lead-sort]');
      if (sortBtn) {
        var key = sortBtn.getAttribute('data-lead-sort');
        if (state.leadSort.key === key) {
          state.leadSort.dir = state.leadSort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.leadSort.key = key;
          state.leadSort.dir = 'asc';
        }
        renderCustomPanel(SCHEMA.sections.filter(function (s) { return s.id === 'leads'; })[0]);
        return;
      }

      var delBtn = e.target.closest('[data-lead-del]');
      if (delBtn) {
        var idx = Number(delBtn.getAttribute('data-lead-del'));
        confirmAction({
          title: 'Delete this lead?',
          body: 'This removes the record from this browser. If it was also sent to your Google Sheet, the sheet copy is unaffected.',
          confirmLabel: 'Delete Lead'
        }).then(function (ok) {
          if (!ok) return;
          state.leads.splice(idx, 1);
          jsonSet(K.LEADS, state.leads);
          renderCustomPanel(SCHEMA.sections.filter(function (s) { return s.id === 'leads'; })[0]);
          updateNavCounts();
          toast('Lead deleted.', 'success');
        });
        return;
      }

      var act = e.target.closest('[data-lead-act]');
      if (!act) return;
      var which = act.getAttribute('data-lead-act');

      if (which === 'csv') return exportLeadsCsv();
      if (which === 'json') return download('twinanalytic-leads.json', JSON.stringify(state.leads, null, 2), 'application/json');
      if (which === 'clear') {
        if (!state.leads.length) { toast('There are no leads to clear.', 'info'); return; }
        confirmAction({
          title: 'Clear the entire lead database?',
          body: 'All ' + state.leads.length + ' records stored in this browser will be deleted. Export them first if you need a copy.',
          confirmLabel: 'Delete All Leads'
        }).then(function (ok) {
          if (!ok) return;
          state.leads = [];
          lsDel(K.LEADS);
          renderCustomPanel(SCHEMA.sections.filter(function (s) { return s.id === 'leads'; })[0]);
          updateNavCounts();
          toast('Lead database cleared.', 'success');
        });
      }
    });
  }

  function exportLeadsCsv() {
    if (!state.leads.length) { toast('There are no leads to export.', 'info'); return; }
    var cols = ['name', 'email', 'phone', 'country', 'location', 'calcType', 'timestamp', 'geometry', 'reinforcement', 'status', 'concreteVol', 'steelWeight'];
    var rows = [cols.join(',')];

    state.leads.forEach(function (l) {
      rows.push(cols.map(function (c) {
        var v = l[c] === undefined || l[c] === null ? '' : String(l[c]);
        return '"' + v.replace(/"/g, '""') + '"';
      }).join(','));
    });

    // The BOM makes Excel read UTF-8 correctly on Windows.
    download('twinanalytic-leads.csv', '﻿' + rows.join('\r\n'), 'text/csv;charset=utf-8');
    toast('Exported ' + state.leads.length + ' leads.', 'success');
  }

  // ----------------------------------------------------------------- publish
  function publishHtml() {
    var gh = jsonGet(K.GH, {});
    var connected = !!gh.token;
    var dirty = isDirty();
    var diff = summariseChanges();

    return '' +
      (dirty
        ? '<div class="a-callout a-callout-warn"><i class="fa-solid fa-pen" aria-hidden="true"></i>' +
          '<div><strong>' + diff.length + ' area' + (diff.length === 1 ? '' : 's') + ' changed:</strong> ' + esc(diff.join(', ')) + '</div></div>'
        : '<div class="a-callout a-callout-info"><i class="fa-solid fa-circle-check" aria-hidden="true"></i>' +
          '<div>Nothing to publish — your draft matches the live site.</div></div>') +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-brands fa-github" aria-hidden="true"></i>Publish to the Live Site</h3>' +
        '<p class="a-card-desc">Commits your content to GitHub, which triggers a Vercel rebuild. The site usually updates within a minute.</p>' +
        (connected
          ? '<div class="a-field is-wide" style="margin-bottom: 1rem;">' +
              '<label for="a-commit-msg">Change Note</label>' +
              '<input type="text" id="a-commit-msg" class="a-input" placeholder="Describe what you changed…" value="' + esc(defaultCommitMessage(diff)) + '" autocomplete="off">' +
              '<p class="a-field-hint">Saved as the commit message so you can find this change later.</p>' +
            '</div>' +
            '<button type="button" class="a-btn a-btn-gold" id="a-do-publish"' + (dirty ? '' : ' disabled') + '>' +
              '<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Publish to ' + esc(gh.owner + '/' + gh.repo) +
            '</button>'
          : '<div class="a-callout a-callout-warn" style="margin-bottom: 0;">' +
              '<i class="fa-solid fa-plug-circle-exclamation" aria-hidden="true"></i>' +
              '<div>No GitHub connection yet. Set one up in <button type="button" class="a-btn a-btn-sm" data-go="settings">Settings</button> ' +
              'to publish in one click, or use the manual route below.</div></div>') +
      '</div>' +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-download" aria-hidden="true"></i>Manual Publish</h3>' +
        '<p class="a-card-desc">No token needed. Download the file, then drop it into GitHub to replace <code style="font-family: var(--a-mono);">data/content.json</code>.</p>' +
        '<div class="a-btn-row">' +
          '<button type="button" class="a-btn" id="a-download-json"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Download content.json</button>' +
          '<button type="button" class="a-btn" id="a-copy-json"><i class="fa-solid fa-clipboard" aria-hidden="true"></i> Copy to Clipboard</button>' +
          '<a class="a-btn" href="https://github.com/' + esc((gh.owner || 'ahsananik245') + '/' + (gh.repo || 'twinanalytic')) + '/upload/' + esc(gh.branch || 'main') + '/data" target="_blank" rel="noopener">' +
            '<i class="fa-brands fa-github" aria-hidden="true"></i> Open GitHub Uploader</a>' +
        '</div>' +
      '</div>' +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i>Discard Draft</h3>' +
        '<p class="a-card-desc">Throw away every unpublished change and go back to what is currently live.</p>' +
        '<button type="button" class="a-btn a-btn-danger" id="a-discard"' + (dirty ? '' : ' disabled') + '>' +
          '<i class="fa-solid fa-trash" aria-hidden="true"></i> Discard All Unpublished Changes</button>' +
      '</div>';
  }

  function summariseChanges() {
    if (!state.published || !state.draft) return [];
    var labels = {
      site: 'Site identity', theme: 'Theme', nav: 'Navigation', home: 'Home page',
      services: 'Services', tools: 'Tools', standards: 'Standards', capabilities: 'Capabilities',
      why: 'Why choose us', team: 'Team', projects: 'Projects', projectCategories: 'Project categories',
      projectsPage: 'Projects page', blog: 'Articles', testimonials: 'Testimonials',
      calculators: 'Calculators', leadGate: 'Lead gate', features: 'Features',
      contact: 'Contact', social: 'Social links', footer: 'Footer', pages: 'Page SEO',
      integrations: 'Integrations'
    };
    var changed = [];
    Object.keys(labels).forEach(function (key) {
      if (JSON.stringify(state.draft[key]) !== JSON.stringify(state.published[key])) {
        changed.push(labels[key]);
      }
    });
    return changed;
  }

  function defaultCommitMessage(diff) {
    if (!diff.length) return 'content: no changes';
    return 'content: update ' + diff.slice(0, 3).join(', ').toLowerCase() +
      (diff.length > 3 ? ' and more' : '');
  }

  function wirePublish(root) {
    root.addEventListener('click', function (e) {
      var go = e.target.closest('[data-go]');
      if (go) { showSection(go.getAttribute('data-go')); return; }

      if (e.target.closest('#a-download-json')) {
        download('content.json', serialiseDraft(), 'application/json');
        toast('Downloaded. Upload it to data/content.json in your repo.', 'success', 6000);
        return;
      }

      if (e.target.closest('#a-copy-json')) {
        navigator.clipboard.writeText(serialiseDraft()).then(function () {
          toast('content.json copied to your clipboard.', 'success');
        }, function () {
          toast('Your browser blocked clipboard access. Use Download instead.', 'error');
        });
        return;
      }

      if (e.target.closest('#a-discard')) {
        confirmAction({
          title: 'Discard all unpublished changes?',
          body: 'Your draft will be replaced with the version that is currently live. This cannot be undone.',
          confirmLabel: 'Discard Changes'
        }).then(function (ok) {
          if (!ok) return;
          state.draft = clone(state.published);
          lsDel(K.DRAFT);
          buildPanels();
          showSection('publish');
          updateDirty();
          updateNavCounts();
          toast('Draft discarded.', 'success');
        });
        return;
      }

      if (e.target.closest('#a-do-publish')) doPublish();
    });
  }

  function serialiseDraft() {
    var out = clone(state.draft);
    out._meta = out._meta || {};
    out._meta.updatedAt = new Date().toISOString();
    out._meta.schemaVersion = out._meta.schemaVersion || 1;
    return JSON.stringify(out, null, 2) + '\n';
  }

  function doPublish() {
    if (state.publishing) return;

    var gh = jsonGet(K.GH, {});
    if (!gh.token || !gh.owner || !gh.repo) {
      toast('Finish the GitHub setup in Settings first.', 'error');
      showSection('settings');
      return;
    }

    var btn = $('#a-do-publish');
    var msgInput = $('#a-commit-msg');
    var message = (msgInput && msgInput.value.trim()) || 'content: update site content';
    var body = serialiseDraft();
    var path = gh.path || 'data/content.json';
    var branch = gh.branch || 'main';
    var api = 'https://api.github.com/repos/' + encodeURIComponent(gh.owner) + '/' +
      encodeURIComponent(gh.repo) + '/contents/' + path;

    var headers = {
      'Authorization': 'Bearer ' + gh.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };

    state.publishing = true;
    // The button stays enabled until the request actually starts, then shows
    // a spinner rather than going dead.
    btn.disabled = true;
    btn.innerHTML = '<span class="a-spin" aria-hidden="true"></span> Publishing…';

    // The current blob SHA is required to replace an existing file.
    fetch(api + '?ref=' + encodeURIComponent(branch), { headers: headers })
      .then(function (res) {
        if (res.status === 404) return null;          // first publish, file absent
        if (res.status === 401) throw new Error('Your GitHub token was rejected. Check it in Settings — it may have expired.');
        if (res.status === 403) throw new Error('GitHub refused the request. The token likely lacks Contents write permission on this repo.');
        if (!res.ok) throw new Error('GitHub responded ' + res.status + ' when reading the current file.');
        return res.json();
      })
      .then(function (existing) {
        return fetch(api, {
          method: 'PUT',
          headers: Object.assign({ 'Content-Type': 'application/json' }, headers),
          body: JSON.stringify({
            message: message,
            content: toBase64(body),
            branch: branch,
            sha: existing ? existing.sha : undefined
          })
        });
      })
      .then(function (res) {
        return res.json().then(function (data) {
          if (!res.ok) {
            if (res.status === 409) {
              throw new Error('The file changed on GitHub since this page loaded. Reload the panel and publish again.');
            }
            throw new Error(data.message || ('GitHub responded ' + res.status + '.'));
          }
          return data;
        });
      })
      .then(function (data) {
        state.published = clone(state.draft);
        lsDel(K.DRAFT);
        pushBackup(message, data.commit && data.commit.sha);
        updateDirty();
        updateNavCounts();
        renderCustomPanel(SCHEMA.sections.filter(function (s) { return s.id === 'publish'; })[0]);
        toast('Published. Vercel is rebuilding — your site updates in about a minute.', 'success', 8000);
      })
      .catch(function (err) {
        toast(err.message || 'Publishing failed.', 'error', 9000);
      })
      .then(function () {
        state.publishing = false;
        var b = $('#a-do-publish');
        if (b) {
          b.disabled = !isDirty();
          b.innerHTML = '<i class="fa-solid fa-cloud-arrow-up" aria-hidden="true"></i> Publish to ' + esc(gh.owner + '/' + gh.repo);
        }
      });
  }

  // ----------------------------------------------------------------- history
  function pushBackup(message, sha) {
    var backups = jsonGet(K.BACKUPS, []);
    backups.unshift({
      at: new Date().toISOString(),
      message: message,
      sha: sha || null,
      content: state.published
    });
    jsonSet(K.BACKUPS, backups.slice(0, MAX_BACKUPS));
  }

  function historyHtml() {
    var backups = jsonGet(K.BACKUPS, []);

    return '' +
      '<div class="a-callout a-callout-info">' +
        '<i class="fa-solid fa-circle-info" aria-hidden="true"></i>' +
        '<div>The last ' + MAX_BACKUPS + ' publishes are snapshotted in this browser. Restoring loads that version ' +
        'as your draft — review it, then publish to make it live again.</div>' +
      '</div>' +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-clock-rotate-left" aria-hidden="true"></i>Publish History</h3>' +
        (backups.length
          ? '<div class="a-table-wrap"><table class="a-table"><thead><tr>' +
              '<th scope="col">When</th><th scope="col">Note</th><th scope="col">Commit</th><th scope="col"><span class="a-sr-only">Actions</span></th>' +
            '</tr></thead><tbody>' +
            backups.map(function (b, i) {
              return '<tr>' +
                '<td class="is-num">' + esc(formatDateTime(b.at)) + '</td>' +
                '<td style="color: var(--a-text); white-space: normal;">' + esc(b.message) + '</td>' +
                '<td class="is-num">' + (b.sha ? esc(b.sha.slice(0, 7)) : '—') + '</td>' +
                '<td>' +
                  '<button type="button" class="a-btn a-btn-sm" data-restore="' + i + '">Restore</button> ' +
                  '<button type="button" class="a-btn a-btn-sm" data-download-backup="' + i + '">Download</button>' +
                '</td>' +
              '</tr>';
            }).join('') +
            '</tbody></table></div>' +
            '<div class="a-btn-row" style="margin-top: 1rem;">' +
              '<button type="button" class="a-btn a-btn-sm a-btn-danger" data-clear-history><i class="fa-solid fa-trash" aria-hidden="true"></i> Clear History</button>' +
            '</div>'
          : '<p class="a-card-desc" style="margin: 0;">No publishes recorded yet. Your first publish will appear here.</p>') +
      '</div>';
  }

  function wireHistory(root) {
    root.addEventListener('click', function (e) {
      var backups = jsonGet(K.BACKUPS, []);

      var restore = e.target.closest('[data-restore]');
      if (restore) {
        var b = backups[Number(restore.getAttribute('data-restore'))];
        if (!b) return;
        confirmAction({
          title: 'Restore this version?',
          body: 'Your current draft will be replaced with the snapshot from ' + formatDateTime(b.at) +
            '. Nothing goes live until you publish.',
          confirmLabel: 'Restore Version',
          danger: false
        }).then(function (ok) {
          if (!ok) return;
          state.draft = clone(b.content);
          saveDraft();
          buildPanels();
          showSection('dashboard');
          updateDirty();
          updateNavCounts();
          toast('Version restored as your draft. Review it, then publish.', 'success', 7000);
        });
        return;
      }

      var dl = e.target.closest('[data-download-backup]');
      if (dl) {
        var backup = backups[Number(dl.getAttribute('data-download-backup'))];
        if (backup) {
          download('content-' + backup.at.slice(0, 10) + '.json', JSON.stringify(backup.content, null, 2), 'application/json');
        }
        return;
      }

      if (e.target.closest('[data-clear-history]')) {
        confirmAction({
          title: 'Clear publish history?',
          body: 'All local snapshots will be deleted. Your live site and its Git history are unaffected.',
          confirmLabel: 'Clear History'
        }).then(function (ok) {
          if (!ok) return;
          lsDel(K.BACKUPS);
          renderCustomPanel(SCHEMA.sections.filter(function (s) { return s.id === 'history'; })[0]);
          updateNavCounts();
          toast('History cleared.', 'success');
        });
      }
    });
  }

  // ---------------------------------------------------------------- settings
  function settingsHtml() {
    var gh = jsonGet(K.GH, {});

    return '' +
      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-brands fa-github" aria-hidden="true"></i>GitHub Connection</h3>' +
        '<p class="a-card-desc">Lets this panel write directly to your repository so publishing is one click.</p>' +

        '<div class="a-grid">' +
          '<div class="a-field"><label for="a-gh-owner">Repository Owner</label>' +
            '<input type="text" id="a-gh-owner" class="a-input is-mono" value="' + esc(gh.owner || 'ahsananik245') + '" autocomplete="off" spellcheck="false"></div>' +
          '<div class="a-field"><label for="a-gh-repo">Repository Name</label>' +
            '<input type="text" id="a-gh-repo" class="a-input is-mono" value="' + esc(gh.repo || 'twinanalytic') + '" autocomplete="off" spellcheck="false"></div>' +
          '<div class="a-field"><label for="a-gh-branch">Branch</label>' +
            '<input type="text" id="a-gh-branch" class="a-input is-mono" value="' + esc(gh.branch || 'main') + '" autocomplete="off" spellcheck="false"></div>' +
          '<div class="a-field"><label for="a-gh-path">File Path</label>' +
            '<input type="text" id="a-gh-path" class="a-input is-mono" value="' + esc(gh.path || 'data/content.json') + '" autocomplete="off" spellcheck="false"></div>' +
          '<div class="a-field is-wide"><label for="a-gh-token">Access Token</label>' +
            '<input type="password" id="a-gh-token" class="a-input is-mono" value="' + esc(gh.token || '') + '" autocomplete="off" spellcheck="false" placeholder="github_pat_…">' +
            '<p class="a-field-hint">Stored in this browser only. Never committed, never sent anywhere except api.github.com.</p></div>' +
        '</div>' +

        '<div class="a-btn-row" style="margin-top: 1rem;">' +
          '<button type="button" class="a-btn a-btn-gold" id="a-gh-save"><i class="fa-solid fa-floppy-disk" aria-hidden="true"></i> Save Connection</button>' +
          '<button type="button" class="a-btn" id="a-gh-test"><i class="fa-solid fa-plug" aria-hidden="true"></i> Test Connection</button>' +
          (gh.token ? '<button type="button" class="a-btn a-btn-danger" id="a-gh-forget"><i class="fa-solid fa-eraser" aria-hidden="true"></i> Forget Token</button>' : '') +
        '</div>' +
      '</div>' +

      '<div class="a-callout a-callout-warn">' +
        '<i class="fa-solid fa-shield-halved" aria-hidden="true"></i>' +
        '<div><strong>How to create the token safely.</strong> On GitHub go to ' +
        'Settings → Developer settings → Personal access tokens → <em>Fine-grained tokens</em>. ' +
        'Set <strong>Repository access</strong> to <em>Only select repositories</em> and pick just ' +
        '<code>' + esc((gh.owner || 'ahsananik245') + '/' + (gh.repo || 'twinanalytic')) + '</code>. ' +
        'Under <strong>Permissions → Repository permissions</strong> grant <em>Contents: Read and write</em> and nothing else. ' +
        'Give it a short expiry. A token scoped this narrowly can only edit this one repo — it cannot touch your account, ' +
        'your other repos, or anything else.</div>' +
      '</div>' +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-key" aria-hidden="true"></i>Panel Passcode</h3>' +
        '<p class="a-card-desc">Change the passcode that unlocks this control panel in this browser.</p>' +
        '<div class="a-grid">' +
          '<div class="a-field"><label for="a-pass-current">Current Passcode</label>' +
            '<input type="password" id="a-pass-current" class="a-input" autocomplete="current-password"></div>' +
          '<div class="a-field"><label for="a-pass-new">New Passcode</label>' +
            '<input type="password" id="a-pass-new" class="a-input" autocomplete="new-password"></div>' +
        '</div>' +
        '<div class="a-btn-row" style="margin-top: 1rem;">' +
          '<button type="button" class="a-btn" id="a-pass-save">Change Passcode</button>' +
          '<button type="button" class="a-btn" id="a-lock-now"><i class="fa-solid fa-lock" aria-hidden="true"></i> Lock Panel Now</button>' +
        '</div>' +
      '</div>' +

      '<div class="a-card">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-file-import" aria-hidden="true"></i>Import & Export</h3>' +
        '<p class="a-card-desc">Move your whole site configuration between browsers or machines.</p>' +
        '<div class="a-btn-row">' +
          '<button type="button" class="a-btn" id="a-export-all"><i class="fa-solid fa-file-arrow-down" aria-hidden="true"></i> Export Current Draft</button>' +
          '<label class="a-btn" for="a-import-file"><i class="fa-solid fa-file-arrow-up" aria-hidden="true"></i> Import content.json</label>' +
          '<input type="file" id="a-import-file" accept="application/json,.json" class="a-sr-only">' +
        '</div>' +
      '</div>' +

      '<div class="a-card" style="border-color: rgba(240,80,90,0.3);">' +
        '<h3 class="a-card-title"><i class="fa-solid fa-triangle-exclamation" aria-hidden="true"></i>Reset Panel</h3>' +
        '<p class="a-card-desc">Clears the draft, passcode, GitHub connection, and history from this browser. ' +
        'Your live site and its content are untouched.</p>' +
        '<button type="button" class="a-btn a-btn-danger" id="a-reset-all">Reset Everything in This Browser</button>' +
      '</div>';
  }

  function wireSettings(root) {
    root.addEventListener('click', function (e) {
      if (e.target.closest('#a-gh-save')) {
        var settings = readGhForm();
        if (!settings.owner || !settings.repo) {
          toast('Owner and repository name are both required.', 'error');
          return;
        }
        jsonSet(K.GH, settings);
        renderCustomPanel(SCHEMA.sections.filter(function (s) { return s.id === 'settings'; })[0]);
        toast('GitHub connection saved.', 'success');
        return;
      }

      if (e.target.closest('#a-gh-test')) {
        var s = readGhForm();
        var btn = e.target.closest('#a-gh-test');
        if (!s.token) { toast('Enter a token before testing.', 'error'); return; }
        btn.disabled = true;
        btn.innerHTML = '<span class="a-spin" aria-hidden="true"></span> Testing…';

        fetch('https://api.github.com/repos/' + encodeURIComponent(s.owner) + '/' + encodeURIComponent(s.repo), {
          headers: { 'Authorization': 'Bearer ' + s.token, 'Accept': 'application/vnd.github+json' }
        }).then(function (res) {
          if (res.status === 401) throw new Error('Token rejected. Check that you pasted it fully and it has not expired.');
          if (res.status === 404) throw new Error('Repository not found, or the token has no access to it.');
          if (!res.ok) throw new Error('GitHub responded ' + res.status + '.');
          return res.json();
        }).then(function (repo) {
          if (repo.permissions && !repo.permissions.push) {
            toast('Connected, but this token cannot write. Grant Contents: Read and write.', 'error', 9000);
          } else {
            toast('Connected to ' + repo.full_name + '. Publishing will work.', 'success', 6000);
          }
        }).catch(function (err) {
          toast(err.message, 'error', 9000);
        }).then(function () {
          btn.disabled = false;
          btn.innerHTML = '<i class="fa-solid fa-plug" aria-hidden="true"></i> Test Connection';
        });
        return;
      }

      if (e.target.closest('#a-gh-forget')) {
        confirmAction({
          title: 'Forget the GitHub token?',
          body: 'One-click publishing stops working until you paste a token again. The manual download route still works.',
          confirmLabel: 'Forget Token'
        }).then(function (ok) {
          if (!ok) return;
          var cur = jsonGet(K.GH, {});
          delete cur.token;
          jsonSet(K.GH, cur);
          renderCustomPanel(SCHEMA.sections.filter(function (x) { return x.id === 'settings'; })[0]);
          toast('Token removed from this browser.', 'success');
        });
        return;
      }

      if (e.target.closest('#a-pass-save')) {
        var current = $('#a-pass-current').value;
        var next = $('#a-pass-new').value;
        if (next.length < 6) { toast('Use at least 6 characters for the new passcode.', 'error'); return; }
        sha256Hex(current).then(function (hash) {
          if (hash !== lsGet(K.PASS)) {
            toast('The current passcode is not correct.', 'error');
            return;
          }
          return sha256Hex(next).then(function (nextHash) {
            lsSet(K.PASS, nextHash);
            $('#a-pass-current').value = '';
            $('#a-pass-new').value = '';
            toast('Passcode changed.', 'success');
          });
        });
        return;
      }

      if (e.target.closest('#a-lock-now')) {
        try { sessionStorage.removeItem(K.SESSION); } catch (err) { /* already gone */ }
        location.reload();
        return;
      }

      if (e.target.closest('#a-export-all')) {
        download('content.json', serialiseDraft(), 'application/json');
        return;
      }

      if (e.target.closest('#a-reset-all')) {
        confirmAction({
          title: 'Reset the panel in this browser?',
          body: 'Deletes your draft, passcode, GitHub token, and publish history from this browser. ' +
                'The live site is not affected. Export anything you need first.',
          confirmLabel: 'Reset Everything'
        }).then(function (ok) {
          if (!ok) return;
          [K.PASS, K.DRAFT, K.GH, K.BACKUPS, K.PREVIEW].forEach(lsDel);
          try { sessionStorage.removeItem(K.SESSION); } catch (err) { /* already gone */ }
          location.reload();
        });
      }
    });

    var fileInput = $('#a-import-file', root);
    if (fileInput) {
      fileInput.addEventListener('change', function () {
        var file = fileInput.files && fileInput.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          var parsed;
          try {
            parsed = JSON.parse(String(reader.result));
          } catch (err) {
            toast('That file is not valid JSON.', 'error');
            return;
          }
          if (!parsed || typeof parsed !== 'object' || !parsed.site) {
            toast('That does not look like a TwinAnalytic content file.', 'error');
            return;
          }
          confirmAction({
            title: 'Replace your draft with this file?',
            body: 'Your current unpublished changes will be overwritten. Nothing goes live until you publish.',
            confirmLabel: 'Import File',
            danger: false
          }).then(function (ok) {
            fileInput.value = '';
            if (!ok) return;
            state.draft = parsed;
            saveDraft();
            buildPanels();
            showSection('dashboard');
            updateDirty();
            updateNavCounts();
            toast('Content imported as your draft.', 'success');
          });
        };
        reader.readAsText(file);
      });
    }
  }

  function readGhForm() {
    return {
      owner: $('#a-gh-owner').value.trim(),
      repo: $('#a-gh-repo').value.trim(),
      branch: $('#a-gh-branch').value.trim() || 'main',
      path: $('#a-gh-path').value.trim() || 'data/content.json',
      token: $('#a-gh-token').value.trim()
    };
  }

  // ======================================================================
  // DOWNLOAD HELPER
  // ======================================================================
  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ======================================================================
  // DATALISTS for the image and icon pickers
  // ======================================================================
  function injectDatalists() {
    var assets = document.createElement('datalist');
    assets.id = 'a-assets';
    assets.innerHTML = SCHEMA.assetLibrary.map(function (a) {
      return '<option value="' + esc(a) + '"></option>';
    }).join('');

    var icons = document.createElement('datalist');
    icons.id = 'a-icons';
    icons.innerHTML = SCHEMA.iconSuggestions.map(function (i) {
      return '<option value="' + esc(i) + '"></option>';
    }).join('');

    document.body.appendChild(assets);
    document.body.appendChild(icons);
  }

  // ======================================================================
  // START
  // ======================================================================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }

  function start() {
    injectDatalists();
    initGate();
  }
})();
