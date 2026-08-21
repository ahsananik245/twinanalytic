/* ==========================================================================
   TwinAnalytic — Site Content Engine
   --------------------------------------------------------------------------
   Loads data/content.json and applies it to the page at runtime so that the
   admin panel can change site content without anyone touching HTML.

   Design rules:
   - Every page keeps its hardcoded markup as the fallback. If the JSON fails
     to load, nothing is removed and the site renders exactly as before.
   - Bindings are declarative, via data attributes:
       data-tw="path.to.value"          -> textContent
       data-tw-html="path.to.value"     -> innerHTML (trusted, admin-authored)
       data-tw-attr="src:a.b; alt:c.d"  -> element attributes
       data-tw-show="path.to.flag"      -> hides the element when falsy
       data-tw-hide="path.to.flag"      -> hides the element when truthy
       data-tw-list="services"          -> replaces children with rendered list
   - Everything resolves against the merged content object. A path that does
     not exist leaves the existing markup untouched.
   ========================================================================== */

(function () {
  'use strict';

  var CONTENT_URL = 'data/content.json';
  var CACHE_KEY = 'tw_content_cache';
  var DRAFT_KEY = 'tw_content_draft';
  var PREVIEW_KEY = 'tw_preview_enabled';

  var params = new URLSearchParams(window.location.search);
  var pageFile = (window.location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
  var isAdminPage = /admin/.test(pageFile);

  // Preview mode shows the unpublished admin draft instead of the live JSON.
  var previewMode = params.get('preview') === '1' ||
    (safeGet(PREVIEW_KEY) === 'true' && params.get('preview') !== '0');

  var content = null;
  var resolveReady;
  var readyPromise = new Promise(function (r) { resolveReady = r; });

  // ---------------------------------------------------------------- storage
  // Private browsing and hardened profiles can throw on localStorage access,
  // so every touch is wrapped. Matches the defensive style already used by
  // the calculator unlock flow.
  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function safeParse(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  // ------------------------------------------------------------------ utils
  function get(obj, path) {
    if (!obj || !path) return undefined;
    var parts = String(path).split('.');
    var cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur === null || cur === undefined) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }

  function esc(text) {
    if (text === null || text === undefined) return '';
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Only external links get target/rel; internal ones stay in the tab.
  function linkAttrs(url) {
    return /^https?:\/\//i.test(url || '') ? ' target="_blank" rel="noopener"' : '';
  }

  function enabledOnly(list) {
    if (!Array.isArray(list)) return [];
    return list.filter(function (item) { return item && item.enabled !== false; });
  }

  function hide(el) {
    if (el) el.style.display = 'none';
  }

  // --------------------------------------------------------------- defaults
  // A missing key must never blank out a section, so merge the fetched JSON
  // over an empty object rather than replacing wholesale.
  function deepMerge(base, override) {
    if (!override || typeof override !== 'object' || Array.isArray(override)) {
      return override === undefined ? base : override;
    }
    var out = {};
    var key;
    for (key in base) {
      if (Object.prototype.hasOwnProperty.call(base, key)) out[key] = base[key];
    }
    for (key in override) {
      if (!Object.prototype.hasOwnProperty.call(override, key)) continue;
      var b = out[key];
      var o = override[key];
      if (b && o && typeof b === 'object' && typeof o === 'object' &&
          !Array.isArray(b) && !Array.isArray(o)) {
        out[key] = deepMerge(b, o);
      } else {
        out[key] = o;
      }
    }
    return out;
  }

  // =========================================================================
  // THEME
  // =========================================================================
  var THEME_VARS = {
    bgPrimary: '--bg-primary',
    bgSecondary: '--bg-secondary',
    textPrimary: '--text-primary',
    textSecondary: '--text-secondary',
    colorGold: '--color-gold',
    colorGoldLight: '--color-gold-light',
    colorSteel: '--color-steel',
    colorSteelDim: '--color-steel-dim',
    colorSteelBlue: '--color-steel-blue',
    colorAccentBlue: '--color-accent-blue',
    fontSerif: '--font-serif',
    fontSans: '--font-sans',
    fontMono: '--font-mono'
  };

  function applyTheme(theme) {
    if (!theme) return;
    var root = document.documentElement;
    Object.keys(THEME_VARS).forEach(function (key) {
      var value = theme[key];
      if (value) root.style.setProperty(THEME_VARS[key], value);
    });

    // The gold border tints are derived from the gold accent so a single
    // colour change in the admin panel stays visually consistent.
    var rgb = hexToRgb(theme.colorGold);
    if (rgb) {
      root.style.setProperty('--border-gold', 'rgba(' + rgb + ', 0.2)');
      root.style.setProperty('--border-gold-hover', 'rgba(' + rgb + ', 0.55)');
      root.style.setProperty('--shadow-gold', '0 8px 32px 0 rgba(' + rgb + ', 0.1)');
      root.style.setProperty('--shadow-gold-hover', '0 12px 40px 0 rgba(' + rgb + ', 0.25)');
    }
    if (theme.baseFontSize) root.style.fontSize = theme.baseFontSize;
  }

  // The faint drafting grid behind the page, matching the brand artwork.
  function applyBlueprint(c) {
    var on = get(c, 'features.blueprintTexture');
    document.documentElement.classList.toggle('no-blueprint', on === false);
  }

  function hexToRgb(hex) {
    if (!hex) return null;
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex).trim());
    if (!m) return null;
    return parseInt(m[1], 16) + ', ' + parseInt(m[2], 16) + ', ' + parseInt(m[3], 16);
  }

  // Apply the cached theme before first paint to avoid a colour flash while
  // the real JSON is still in flight.
  (function applyCachedThemeEarly() {
    var cached = safeParse(safeGet(CACHE_KEY), null);
    if (cached && cached.theme) applyTheme(cached.theme);
  })();

  // =========================================================================
  // LIST TEMPLATES
  // Each template returns the innerHTML for its container. Markup mirrors the
  // existing hardcoded HTML so the site CSS keeps working untouched.
  // =========================================================================
  var TEMPLATES = {

    // The navbar wordmark. Rendered as a template rather than a data-tw pair
    // because `.logo span` carries the gold underline — only the second half
    // may ever be wrapped in a span.
    brandLogo: function (c) {
      var s = c.site || {};
      var h = s.logoHeight || 38;
      // The mark is a transparent PNG, so it needs no rounded box behind it.
      var img = s.logo
        ? '<img src="' + esc(s.logo) + '" alt="' + esc((s.brandFirst || '') + (s.brandSecond || '') + ' logo') + '"' +
          ' height="' + h + '" style="height: ' + h + 'px; width: auto; margin-right: 10px; vertical-align: middle;">'
        : '';
      return img + esc(s.brandFirst) + '<span>' + esc(s.brandSecond) + '</span>';
    },

    brandFooter: function (c) {
      var s = c.site || {};
      return esc(s.brandFirst) + '<span>' + esc(s.brandSecond) + '</span>';
    },

    // `.section-header h2 span` is the gold eyebrow and `.hero h1 span` is the
    // italic second line. Both are styled by position, so the heading text
    // itself must stay an unwrapped text node — hence these templates.
    sectionHeading: function (c, path) {
      var s = get(c, path) || {};
      return '<span>' + esc(s.eyebrow) + '</span>' + esc(s.heading);
    },

    heroTitle: function (c) {
      var h = get(c, 'home.hero') || {};
      return esc(h.titleLine1) + '<br><span>' + esc(h.titleLine2) + '</span>';
    },

    navLinks: function (c) {
      return enabledOnly(get(c, 'nav.links')).map(function (l) {
        return '<li><a href="' + esc(l.href) + '">' + esc(l.label) + '</a></li>';
      }).join('');
    },

    navCta: function (c) {
      var cta = get(c, 'nav.cta');
      if (!cta || cta.enabled === false || !cta.label) return '';
      return '<a href="' + esc(cta.href) + '" class="btn btn-gold btn-sm">' + esc(cta.label) + '</a>';
    },

    services: function (c) {
      return enabledOnly(c.services).map(function (s) {
        var items = (s.items || []).map(function (i) {
          return '<li>' + esc(i) + '</li>';
        }).join('');
        var listHtml = items
          ? '<ul style="color: var(--text-secondary); margin-top: 1rem; font-size: 0.9rem; line-height: 1.8; list-style-type: square; margin-left: 1.2rem;">' + items + '</ul>'
          : '';
        var title = s.href
          ? '<h3><a href="' + esc(s.href) + '" style="color: inherit;">' + esc(s.title) + '</a></h3>'
          : '<h3>' + esc(s.title) + '</h3>';
        return '' +
          '<div class="service-card glass-card fade-up-init">' +
            '<div class="service-icon"><i class="' + esc(s.icon) + '"></i></div>' +
            title +
            listHtml +
          '</div>';
      }).join('');
    },

    toolTags: function (c) {
      return (c.tools || []).map(function (t) {
        return '<span style="font-family: var(--font-mono); font-size: 0.85rem; padding: 0.5rem 1rem; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 4px; color: #fff;">' + esc(t) + '</span>';
      }).join('');
    },

    standardTags: function (c) {
      return (c.standards || []).map(function (t) {
        return '<span style="font-family: var(--font-mono); font-size: 0.85rem; padding: 0.5rem 1rem; background: rgba(201, 168, 76, 0.05); border: 1px solid var(--border-gold); border-radius: 4px; color: var(--color-gold);">' + esc(t) + '</span>';
      }).join('');
    },

    capabilities: function (c) {
      return enabledOnly(c.capabilities).map(function (item) {
        return '' +
          '<div class="why-card glass-card fade-up-init" style="text-align: center; padding: 2.5rem 2rem; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%;">' +
            '<div class="why-icon" style="margin: 0 auto 1.5rem auto; float: none;"><i class="' + esc(item.icon) + '"></i></div>' +
            '<h3 style="margin-bottom: 0.8rem; font-family: var(--font-serif); font-size: 1.25rem;">' + esc(item.title) + '</h3>' +
            '<p style="font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">' + esc(item.desc) + '</p>' +
          '</div>';
      }).join('');
    },

    why: function (c) {
      return enabledOnly(c.why).map(function (item) {
        return '' +
          '<div class="why-card fade-up-init">' +
            '<div class="why-icon"><i class="' + esc(item.icon) + '"></i></div>' +
            '<h3>' + esc(item.title) + '</h3>' +
            '<p>' + esc(item.desc) + '</p>' +
          '</div>';
      }).join('');
    },

    team: function (c) {
      return enabledOnly(c.team).map(function (m) {
        var rows = '';
        if (m.qualification) rows += '<div><strong style="color: #fff;">Qualification:</strong> ' + esc(m.qualification) + '</div>';
        if (m.experience) rows += '<div><strong style="color: #fff;">Experience:</strong> ' + esc(m.experience) + '</div>';
        if (m.expertise) rows += '<div><strong style="color: #fff;">Expertise:</strong> ' + esc(m.expertise) + '</div>';

        var socials = '';
        if (m.linkedin) socials += '<a href="' + esc(m.linkedin) + '" target="_blank" rel="noopener" style="color: var(--text-secondary); font-size: 1.1rem; transition: var(--transition-quick);"><i class="fa-brands fa-linkedin-in"></i></a>';
        if (m.twitter) socials += '<a href="' + esc(m.twitter) + '" target="_blank" rel="noopener" style="color: var(--text-secondary); font-size: 1.1rem; transition: var(--transition-quick);"><i class="fa-brands fa-x-twitter"></i></a>';
        if (m.email) socials += '<a href="mailto:' + esc(m.email) + '" style="color: var(--text-secondary); font-size: 1.1rem; transition: var(--transition-quick);"><i class="fa-solid fa-envelope"></i></a>';

        var photo = m.photo
          ? '<div class="team-photo-wrap" style="width: 100%; height: 300px; overflow: hidden; border-radius: 8px; margin-bottom: 1.5rem; border: 1px solid rgba(255,255,255,0.05);">' +
              '<img src="' + esc(m.photo) + '" alt="' + esc(m.name + ' - ' + (m.role || '')) + '" class="team-photo" style="width: 100%; height: 100%; object-fit: cover;">' +
            '</div>'
          : '';

        return '' +
          '<div class="team-card fade-up-init" style="max-width: 420px; text-align: left; padding: 2rem; background: var(--bg-card); border: 1px solid var(--border-gold); border-radius: 12px; transition: var(--transition-smooth);">' +
            photo +
            '<h3 style="font-family: var(--font-serif); font-size: 1.6rem; color: #fff; margin-bottom: 0.3rem;">' + esc(m.name) + '</h3>' +
            '<span class="team-role" style="color: var(--color-gold); font-family: var(--font-mono); font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.1em; display: block; margin-bottom: 1.2rem;">' + esc(m.role) + '</span>' +
            (rows ? '<div style="font-size: 0.9rem; color: var(--text-secondary); display: flex; flex-direction: column; gap: 0.6rem; margin-bottom: 1.5rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem;">' + rows + '</div>' : '') +
            (socials ? '<div class="team-social" style="display: flex; gap: 1rem; border-top: 1px solid rgba(255,255,255,0.05); padding-top: 1rem;">' + socials + '</div>' : '') +
          '</div>';
      }).join('');
    },

    // Renders the portfolio grid, or the editable "coming soon" placeholder
    // while the project list is still empty.
    projects: function (c) {
      var list = enabledOnly(c.projects);
      var page = c.projectsPage || {};

      // No published case studies yet. Rather than an apologetic placeholder,
      // say plainly why and point at the work that genuinely is public.
      if (!list.length) {
        return '' +
          '<div class="projects-empty fade-up-init">' +
            (page.emptyHeading ? '<h2>' + esc(page.emptyHeading) + '</h2>' : '') +
            '<p>' + esc(page.emptyMessage) + '</p>' +
            '<div class="projects-empty-actions">' +
              (page.emptyCtaLabel
                ? '<a href="' + esc(page.emptyCtaHref || 'calculators.html') + '" class="btn btn-gold">' + esc(page.emptyCtaLabel) + '</a>' : '') +
              (page.emptySecondaryLabel
                ? '<a href="' + esc(page.emptySecondaryHref || 'contact.html') + '" class="btn btn-ghost">' + esc(page.emptySecondaryLabel) + '</a>' : '') +
            '</div>' +
            (page.emptyNote ? '<p class="projects-empty-note">' + esc(page.emptyNote) + '</p>' : '') +
          '</div>';
      }

      var filters = '';
      if (page.showFilters !== false) {
        var cats = c.projectCategories || [];
        filters = '<div class="project-filters" style="display: flex; justify-content: center; flex-wrap: wrap; gap: 0.8rem; margin-bottom: 3rem;">' +
          cats.map(function (cat, i) {
            return '<button class="filter-btn' + (i === 0 ? ' active' : '') + '" data-filter="' + esc(cat.value) + '">' + esc(cat.label) + '</button>';
          }).join('') +
          '</div>';
      }

      var cards = list.map(function (p) {
        var img = p.image
          ? '<div style="height: 220px; overflow: hidden; border-radius: 8px 8px 0 0;"><img src="' + esc(p.image) + '" alt="' + esc(p.title) + '" style="width: 100%; height: 100%; object-fit: cover;"></div>'
          : '';
        var tags = (p.tags || []).map(function (t) {
          return '<span style="font-family: var(--font-mono); font-size: 0.7rem; padding: 0.25rem 0.6rem; background: rgba(201, 168, 76, 0.08); border: 1px solid var(--border-gold); border-radius: 4px; color: var(--color-gold);">' + esc(t) + '</span>';
        }).join('');
        return '' +
          '<div class="project-card glass-card fade-up-init" data-category="' + esc(p.category) + '" style="border: 1px solid var(--border-gold); border-radius: 8px; overflow: hidden;">' +
            img +
            '<div style="padding: 1.8rem;">' +
              '<h3 style="font-family: var(--font-serif); font-size: 1.35rem; color: #fff; margin-bottom: 0.6rem;">' + esc(p.title) + '</h3>' +
              (p.location ? '<p style="font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-gold); margin-bottom: 0.8rem;">' + esc(p.location) + '</p>' : '') +
              '<p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">' + esc(p.desc) + '</p>' +
              (tags ? '<div style="display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1.2rem;">' + tags + '</div>' : '') +
            '</div>' +
          '</div>';
      }).join('');

      return filters +
        '<div class="projects-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 2rem;">' + cards + '</div>';
    },

    // The calculator hub: categorised groups of cards. Hiding a group hides
    // it and everything inside it; hiding a single calculator removes only
    // that card. Either way the calculator's own page stays reachable by
    // direct link, so an existing bookmark never 404s.
    calculatorGroups: function (c) {
      return (c.calculatorGroups || []).filter(function (g) {
        return g && g.enabled !== false && enabledOnly(g.items).length;
      }).map(function (g) {
        var cards = enabledOnly(g.items).map(function (t) {
          return '' +
            '<a class="calc-card" href="' + esc(t.href) + '">' +
              '<i class="' + esc(t.icon) + '" aria-hidden="true"></i>' +
              '<h3>' + esc(t.name) + '</h3>' +
              '<p>' + esc(t.desc) + '</p>' +
              (t.code ? '<div class="calc-code">' + esc(t.code) + '</div>' : '') +
            '</a>';
        }).join('');

        return '' +
          '<div class="calc-group">' +
            '<div class="calc-group-head">' +
              '<h2>' + esc(g.title) + '</h2>' +
              (g.eyebrow ? '<span>' + esc(g.eyebrow) + '</span>' : '') +
              (g.desc ? '<p>' + esc(g.desc) + '</p>' : '') +
            '</div>' +
            '<div class="calc-card-grid">' + cards + '</div>' +
          '</div>';
      }).join('');
    },

    // A summary of the calculator suite for the home page. Deliberately not a
    // second copy of the hub's 28-card grid — it reports the shape of the
    // suite and sends people to the hub, so the two pages do not compete.
    calculatorShowcase: function (c) {
      var groups = (c.calculatorGroups || []).filter(function (g) {
        return g && g.enabled !== false && enabledOnly(g.items).length;
      });
      if (!groups.length) return '';

      var total = groups.reduce(function (n, g) { return n + enabledOnly(g.items).length; }, 0);
      var s = get(c, 'home.calculatorsSection') || {};

      // The biggest group is given a double-width tile. With five groups that
      // fills a three-column grid exactly, and it makes the section read as a
      // map of the suite rather than another row of identical cards.
      var largest = groups.reduce(function (best, g) {
        return enabledOnly(g.items).length > enabledOnly(best.items).length ? g : best;
      }, groups[0]);

      var tiles = s.showGroupTiles === false ? '' :
        '<div class="calc-showcase-grid">' +
          groups.map(function (g) {
            var items = enabledOnly(g.items);
            // Name a few so the tile shows what is actually inside.
            var sample = items.slice(0, 3).map(function (i) { return esc(i.name); }).join(' · ');
            var more = items.length > 3 ? ' · +' + (items.length - 3) + ' more' : '';
            var featured = (g === largest && groups.length > 2) ? ' is-featured' : '';
            return '' +
              '<a class="calc-showcase-tile' + featured + '" href="calculators.html">' +
                '<span class="calc-showcase-count">' + items.length + '</span>' +
                '<h3>' + esc(g.title) + '</h3>' +
                (g.eyebrow ? '<p class="calc-showcase-code">' + esc(g.eyebrow) + '</p>' : '') +
                '<p class="calc-showcase-sample">' + sample + more + '</p>' +
              '</a>';
          }).join('') +
        '</div>';

      var cta = s.ctaLabel
        ? '<div class="calc-showcase-cta">' +
            '<a href="' + esc(s.ctaHref || 'calculators.html') + '" class="btn btn-gold">' + esc(s.ctaLabel) + '</a>' +
            '<span class="calc-showcase-meta">' + total + ' calculators &middot; ' + groups.length + ' categories &middot; free to use</span>' +
          '</div>'
        : '';

      return tiles + cta;
    },

    // The engagement sequence. Rendered as a numbered rail rather than another
    // card grid, both because a process is inherently ordered and to break the
    // centred-header-plus-grid rhythm the rest of the page settles into.
    process: function (c) {
      return enabledOnly(c.process).map(function (s, i) {
        return '' +
          '<li class="process-step fade-up-init" style="transition-delay: ' + (i * 60) + 'ms;">' +
            '<span class="process-step-num">' + esc(s.step || String(i + 1).padStart(2, '0')) + '</span>' +
            '<div class="process-step-body">' +
              '<h3>' + (s.icon ? '<i class="' + esc(s.icon) + '" aria-hidden="true"></i>' : '') + esc(s.title) + '</h3>' +
              '<p>' + esc(s.desc) + '</p>' +
            '</div>' +
          '</li>';
      }).join('');
    },

    blog: function (c) {
      var posts = enabledOnly(c.blog);
      if (!posts.length) {
        return '<div style="text-align: center; padding: 3rem 2rem; border: 1px dashed rgba(255,255,255,0.1); background: rgba(255,255,255,0.01); border-radius: 8px; max-width: 500px; margin: 3rem auto 0 auto;" class="fade-up-init">' +
          '<p style="color: var(--text-secondary); font-size: 1rem;">' + esc(get(c, 'home.blogSection.emptyMessage')) + '</p>' +
          '</div>';
      }
      return '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 2rem; margin-top: 3rem;">' +
        posts.map(function (p) {
          var img = p.image
            ? '<div style="height: 190px; overflow: hidden;"><img src="' + esc(p.image) + '" alt="' + esc(p.title) + '" style="width: 100%; height: 100%; object-fit: cover;"></div>'
            : '';
          return '<article class="glass-card fade-up-init" style="border: 1px solid var(--border-gold); border-radius: 8px; overflow: hidden;">' +
              img +
              '<div style="padding: 1.8rem;">' +
                (p.date ? '<p style="font-family: var(--font-mono); font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.1em; color: var(--color-gold); margin-bottom: 0.7rem;">' + esc(p.date) + '</p>' : '') +
                '<h3 style="font-family: var(--font-serif); font-size: 1.3rem; color: #fff; margin-bottom: 0.7rem;">' + esc(p.title) + '</h3>' +
                '<p style="color: var(--text-secondary); font-size: 0.9rem; line-height: 1.6;">' + esc(p.excerpt) + '</p>' +
                (p.url ? '<a href="' + esc(p.url) + '"' + linkAttrs(p.url) + ' style="display: inline-block; margin-top: 1.2rem; color: var(--color-gold); font-size: 0.85rem; text-decoration: underline;">Read article</a>' : '') +
              '</div>' +
            '</article>';
        }).join('') +
        '</div>';
    },

    testimonials: function (c) {
      return enabledOnly(c.testimonials).map(function (t) {
        return '' +
          '<div class="testimonial-slide">' +
            '<p class="testimonial-quote">' + esc(t.quote) + '</p>' +
            '<div class="testimonial-author">' +
              '<h4>' + esc(t.author) + '</h4>' +
              '<span>' + esc([t.role, t.company].filter(Boolean).join(', ')) + '</span>' +
            '</div>' +
          '</div>';
      }).join('');
    },

    contactProjectTypes: function (c) {
      return (get(c, 'contact.projectTypes') || []).map(function (t) {
        return '<option value="' + esc(t.value) + '">' + esc(t.label) + '</option>';
      }).join('');
    },

    footerColumns: function (c) {
      return (get(c, 'footer.columns') || []).map(function (col) {
        var links = (col.links || []).map(function (l) {
          return '<li><a href="' + esc(l.href) + '"' + linkAttrs(l.href) + '>' + esc(l.label) + '</a></li>';
        }).join('');
        return '' +
          '<div class="footer-col">' +
            '<h3>' + esc(col.title) + '</h3>' +
            '<ul class="footer-links">' + links + '</ul>' +
          '</div>';
      }).join('');
    },

    footerSocials: function (c) {
      return (c.social || []).filter(function (s) {
        return s && s.enabled !== false && s.url;
      }).map(function (s) {
        return '<a href="' + esc(s.url) + '" target="_blank" rel="noopener"><i class="' + esc(s.icon) + '"></i></a>';
      }).join('');
    },

    footerBottomLinks: function (c) {
      return (get(c, 'footer.bottomLinks') || []).map(function (l) {
        return '<a href="' + esc(l.href) + '">' + esc(l.label) + '</a>';
      }).join('');
    }
  };

  // =========================================================================
  // BINDING PASSES
  // =========================================================================
  function applyBindings(c) {
    // Text
    document.querySelectorAll('[data-tw]').forEach(function (el) {
      var value = get(c, el.getAttribute('data-tw'));
      if (value !== undefined && value !== null) el.textContent = value;
    });

    // HTML (admin-authored rich text)
    document.querySelectorAll('[data-tw-html]').forEach(function (el) {
      var value = get(c, el.getAttribute('data-tw-html'));
      if (value !== undefined && value !== null) el.innerHTML = value;
    });

    // Attributes: "src:home.about.image; alt:home.about.imageAlt"
    document.querySelectorAll('[data-tw-attr]').forEach(function (el) {
      el.getAttribute('data-tw-attr').split(';').forEach(function (pair) {
        var bits = pair.split(':');
        if (bits.length < 2) return;
        var attr = bits[0].trim();
        var value = get(c, bits.slice(1).join(':').trim());
        if (attr && value !== undefined && value !== null && value !== '') {
          el.setAttribute(attr, value);
        }
      });
    });

    // Visibility flags
    document.querySelectorAll('[data-tw-show]').forEach(function (el) {
      var value = get(c, el.getAttribute('data-tw-show'));
      if (value === false) el.remove();
    });
    document.querySelectorAll('[data-tw-hide]').forEach(function (el) {
      var value = get(c, el.getAttribute('data-tw-hide'));
      if (value === true) el.remove();
    });

    // Lists. The value is a template name, optionally followed by ":" and a
    // content path the template resolves itself (e.g. "sectionHeading:home.whySection").
    document.querySelectorAll('[data-tw-list]').forEach(function (el) {
      var spec = el.getAttribute('data-tw-list');
      var sep = spec.indexOf(':');
      var name = sep === -1 ? spec : spec.slice(0, sep);
      var arg = sep === -1 ? null : spec.slice(sep + 1);

      var tpl = TEMPLATES[name];
      if (!tpl) return;
      var html = tpl(c, arg);
      // An empty render usually means "no data yet" — keep the fallback markup
      // rather than leaving a blank hole in the page.
      if (html && html.trim()) el.innerHTML = html;
    });
  }

  // =========================================================================
  // SEO / HEAD
  // =========================================================================
  function applyMeta(c) {
    var page = get(c, 'pages.' + pageFile);
    var site = c.site || {};

    if (page) {
      if (page.title) document.title = page.title;
      setMeta('name', 'description', page.description);
      setMeta('property', 'og:title', page.title);
      setMeta('property', 'og:description', page.description);
      if (page.ogImage) {
        setMeta('property', 'og:image', absoluteUrl(site.domain, page.ogImage));
      }
      setMeta('property', 'og:url', absoluteUrl(site.domain, pageFile + '.html'));
    }

    if (site.favicon) {
      var icon = document.querySelector('link[rel="icon"]');
      if (icon) icon.setAttribute('href', site.favicon);
    }
  }

  function absoluteUrl(domain, path) {
    if (/^https?:\/\//i.test(path)) return path;
    if (!domain) return path;
    return domain.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }

  function setMeta(attr, key, value) {
    if (!value) return;
    var el = document.querySelector('meta[' + attr + '="' + key + '"]');
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, key);
      document.head.appendChild(el);
    }
    el.setAttribute('content', value);
  }

  // =========================================================================
  // ANALYTICS
  // =========================================================================
  function loadScript(src) {
    var s = document.createElement('script');
    s.defer = true;
    s.src = src;
    document.head.appendChild(s);
    return s;
  }

  function applyAnalytics(c) {
    // --- Vercel Web Analytics ---------------------------------------------
    // Cookieless and first-party: the request goes to this domain, not to a
    // third party, so it needs no consent banner. That matters here because
    // the privacy page claims GDPR compliance — Google Analytics would oblige
    // us to add one.
    if (get(c, 'integrations.vercelAnalytics') && !window.__twVaLoaded) {
      window.__twVaLoaded = true;
      // Queue shim, so events fired before the script lands are not lost.
      window.va = window.va || function () {
        (window.vaq = window.vaq || []).push(arguments);
      };
      loadScript(get(c, 'integrations.vercelAnalyticsPath') || '/_vercel/insights/script.js');
    }

    // --- Vercel Speed Insights --------------------------------------------
    // Core Web Vitals measured on real visitors' devices, rather than the
    // synthetic numbers a lab test produces.
    if (get(c, 'integrations.vercelSpeedInsights') && !window.__twSiLoaded) {
      window.__twSiLoaded = true;
      window.si = window.si || function () {
        (window.siq = window.siq || []).push(arguments);
      };
      loadScript('/_vercel/speed-insights/script.js');
    }

    // --- Google Analytics 4 ------------------------------------------------
    // Off unless an ID is set. Note that enabling this sets cookies and puts
    // the site into consent-banner territory in the EU.
    var ga = get(c, 'integrations.gaMeasurementId');
    if (ga && !window.__twGaLoaded) {
      window.__twGaLoaded = true;
      var s = document.createElement('script');
      s.async = true;
      s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(ga);
      document.head.appendChild(s);
      window.dataLayer = window.dataLayer || [];
      window.gtag = function () { window.dataLayer.push(arguments); };
      window.gtag('js', new Date());
      window.gtag('config', ga);
    }
  }

  // =========================================================================
  // ANNOUNCEMENT BAR
  // =========================================================================
  var DISMISS_KEY = 'tw_announcement_dismissed';

  function applyAnnouncement(c) {
    var a = get(c, 'features.announcement');
    if (!a || !a.enabled || !a.text) return;

    // Re-showing an edited announcement matters more than remembering a
    // dismissal, so the dismissal is keyed to the message text itself.
    var signature = a.text + '|' + (a.linkHref || '');
    if (a.dismissible !== false && safeGet(DISMISS_KEY) === signature) return;

    var bar = document.createElement('div');
    bar.className = 'tw-announcement';
    bar.innerHTML =
      '<span>' + esc(a.text) + '</span>' +
      (a.linkLabel && a.linkHref ? ' <a href="' + esc(a.linkHref) + '">' + esc(a.linkLabel) + '</a>' : '') +
      (a.dismissible !== false ? '<button type="button" class="tw-announcement-close" aria-label="Dismiss announcement">&times;</button>' : '');

    document.body.insertBefore(bar, document.body.firstChild);
    document.body.classList.add('has-announcement');

    var close = bar.querySelector('.tw-announcement-close');
    if (close) {
      close.addEventListener('click', function () {
        bar.remove();
        document.body.classList.remove('has-announcement');
        safeSet(DISMISS_KEY, signature);
      });
    }
  }

  // =========================================================================
  // MAINTENANCE MODE
  // The admin panel and an explicit ?nomaint=1 escape hatch always bypass it,
  // so it is impossible to lock yourself out of your own site.
  // =========================================================================
  function applyMaintenance(c) {
    if (!get(c, 'features.maintenanceMode')) return false;
    if (isAdminPage || params.get('nomaint') === '1' || previewMode) return false;

    var site = c.site || {};
    document.body.innerHTML =
      '<div class="tw-maintenance">' +
        '<div class="tw-maintenance-inner">' +
          (site.logo ? '<img src="' + esc(site.logo) + '" alt="' + esc(site.brandFirst + site.brandSecond) + '">' : '') +
          '<h1>' + esc(site.brandFirst || '') + '<span>' + esc(site.brandSecond || '') + '</span></h1>' +
          '<p>' + esc(get(c, 'features.maintenanceMessage')) + '</p>' +
          (get(c, 'contact.email') ? '<a href="mailto:' + esc(get(c, 'contact.email')) + '">' + esc(get(c, 'contact.email')) + '</a>' : '') +
        '</div>' +
      '</div>';
    return true;
  }

  // =========================================================================
  // LEAD GATE FLAG
  // calculators.js reads this to decide whether to show the unlock modal.
  // =========================================================================
  function applyLeadGate(c) {
    var gateOn = get(c, 'features.leadGate');
    window.TW_LEAD_GATE_ENABLED = gateOn !== false;
    if (gateOn === false) {
      // Treat every visitor as already unlocked so calculators run freely.
      window.isUnlockedSession = true;
    }
    var url = get(c, 'integrations.googleScriptUrl');
    if (url) window.TW_GOOGLE_SCRIPT_URL = url;
  }

  // =========================================================================
  // PREVIEW BADGE
  // =========================================================================
  function showPreviewBadge() {
    if (isAdminPage) return;
    var badge = document.createElement('div');
    badge.className = 'tw-preview-badge';
    badge.innerHTML = '<i class="fa-solid fa-eye"></i> Draft preview &mdash; not published ' +
      '<a href="?preview=0">exit</a>';
    document.body.appendChild(badge);
  }

  // =========================================================================
  // MAIN
  // =========================================================================
  function apply(c) {
    content = c;
    window.TWContent = window.TWContent || {};
    window.TWContent.data = c;

    applyTheme(c.theme);
    applyBlueprint(c);
    applyLeadGate(c);
    if (applyMaintenance(c)) return;

    applyMeta(c);
    applyBindings(c);
    applyAnnouncement(c);
    applyAnalytics(c);
    if (previewMode) showPreviewBadge();

    document.dispatchEvent(new CustomEvent('tw:hydrated', { detail: c }));
  }

  function whenDomReady(fn) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fn, { once: true });
    } else {
      fn();
    }
  }

  function load() {
    var draft = previewMode ? safeParse(safeGet(DRAFT_KEY), null) : null;

    // A draft alone is enough to render a preview without hitting the network.
    return fetch(CONTENT_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (live) {
        safeSet(CACHE_KEY, JSON.stringify(live));
        return draft ? deepMerge(live, draft) : live;
      })
      .catch(function () {
        // Offline or file:// — fall back to the last good copy, then the draft.
        var cached = safeParse(safeGet(CACHE_KEY), null);
        if (cached && draft) return deepMerge(cached, draft);
        return cached || draft;
      });
  }

  var loadPromise = load();

  whenDomReady(function () {
    loadPromise
      .then(function (c) {
        if (c) apply(c);
        else document.dispatchEvent(new CustomEvent('tw:hydrated', { detail: null }));
      })
      .catch(function (err) {
        // Never let a content error take the page down — the hardcoded HTML
        // is already on screen and remains a valid rendering of the site.
        if (window.console) console.warn('[TwinAnalytic] content hydration skipped:', err);
        document.dispatchEvent(new CustomEvent('tw:hydrated', { detail: null }));
      })
      .then(function () { resolveReady(content); });
  });

  // Public surface used by main.js and the admin panel.
  window.TWContent = window.TWContent || {};
  window.TWContent.ready = readyPromise;
  window.TWContent.get = function (path) { return get(content, path); };
  window.TWContent.raw = function () { return content; };
  window.TWContent.applyTheme = applyTheme;
  window.TWContent.templates = TEMPLATES;
  window.TWContent.deepMerge = deepMerge;
  window.TWContent.keys = { CACHE: CACHE_KEY, DRAFT: DRAFT_KEY, PREVIEW: PREVIEW_KEY };
})();
