/* ==========================================================================
   TwinAnalytic — Admin Panel Schema
   --------------------------------------------------------------------------
   Declarative description of every editable part of the site. js/admin.js
   turns this into forms, so adding a new editable field anywhere on the site
   is a matter of adding one entry here plus a data-tw attribute in the HTML.

   Card shapes
     { title, icon, desc, path, fields[] }          -> object editor
     { title, icon, desc, path, type:'list', ... }  -> repeatable list editor
     { title, icon, desc, path, type:'tags' }       -> string-array editor

   Field types
     text | textarea | html | number | color | toggle | select
     image | icon | url | email | tags
   ========================================================================== */

window.ADMIN_SCHEMA = {

  // Font Awesome classes used by the icon picker suggestions.
  iconSuggestions: [
    'fa-solid fa-ruler-combined', 'fa-solid fa-cube', 'fa-solid fa-cubes',
    'fa-solid fa-helmet-safety', 'fa-solid fa-lightbulb', 'fa-solid fa-chart-area',
    'fa-solid fa-chart-line', 'fa-solid fa-compass-drafting', 'fa-solid fa-file-invoice',
    'fa-solid fa-shield-halved', 'fa-solid fa-comments', 'fa-solid fa-layer-group',
    'fa-solid fa-table-cells', 'fa-solid fa-square', 'fa-solid fa-building',
    'fa-solid fa-diagram-project', 'fa-solid fa-gears', 'fa-solid fa-bolt',
    'fa-solid fa-drafting-compass', 'fa-solid fa-city', 'fa-solid fa-road',
    'fa-solid fa-industry', 'fa-solid fa-house', 'fa-solid fa-tower-observation'
  ],

  // Images that ship with the repo, offered in every image field.
  assetLibrary: [
    'assets/logo.png',
    'assets/logo-lockup.png',
    'assets/favicon.png',
    'assets/brand-banner.jpg',
    'assets/about_render.jpg',
    'assets/team_ceo.jpg',
    'assets/team_cto.jpg',
    'assets/team_cso.jpg',
    'assets/project_commercial.jpg',
    'assets/project_residential.jpg',
    'assets/project_industrial.jpg',
    'assets/project_infra.jpg',
    'assets/blog_bim.jpg',
    'assets/blog_fem.jpg',
    'assets/blog_twin.jpg'
  ],

  sections: [

    /* ================================================================== */
    { id: 'dashboard', label: 'Dashboard', icon: 'fa-solid fa-gauge-high', group: 'Overview', custom: 'dashboard',
      title: 'Dashboard',
      desc: 'A snapshot of your site content, pending changes, and recent leads.' },

    /* ============================= BRANDING ============================ */
    {
      id: 'identity', label: 'Site Identity', icon: 'fa-solid fa-fingerprint', group: 'Branding',
      title: 'Site Identity',
      desc: 'Your brand name, logo, and the boilerplate that appears in the header and footer of every page.',
      cards: [
        {
          title: 'Brand', icon: 'fa-solid fa-signature', path: 'site',
          desc: 'The brand name is split in two so the second half can be highlighted in your accent colour.',
          fields: [
            { key: 'brandFirst', label: 'Brand Name — First Part', type: 'text', placeholder: 'Twin…' },
            { key: 'brandSecond', label: 'Brand Name — Highlighted Part', type: 'text', placeholder: 'Analytic…' },
            { key: 'tagline', label: 'Tagline', type: 'text', wide: true, hint: 'Shown under the brand name in the footer.' },
            { key: 'slogan', label: 'Slogan', type: 'text', wide: true, hint: 'Shown in the footer under the description.' },
            { key: 'domain', label: 'Live Domain', type: 'url', hint: 'Used to build absolute URLs for social sharing previews.' }
          ]
        },
        {
          title: 'Logo & Favicon', icon: 'fa-solid fa-image', path: 'site',
          fields: [
            { key: 'logo', label: 'Logo Mark', type: 'image' },
            { key: 'logoLockup', label: 'Full Lockup', type: 'image',
              hint: 'Mark plus wordmark. Used on the control panel sign-in screen.' },
            { key: 'favicon', label: 'Favicon', type: 'image' },
            { key: 'logoHeight', label: 'Logo Height (px)', type: 'number', min: 16, max: 120 }
          ]
        },
        {
          title: 'Footer Boilerplate', icon: 'fa-solid fa-align-left', path: 'site',
          fields: [
            { key: 'footerBlurb', label: 'Footer Description', type: 'textarea', wide: true },
            { key: 'copyright', label: 'Copyright Line', type: 'text', wide: true }
          ]
        }
      ]
    },

    {
      id: 'theme', label: 'Theme & Colours', icon: 'fa-solid fa-palette', group: 'Branding',
      title: 'Theme & Colours',
      desc: 'Change the palette and typography of the entire public site. Border, glow, and shadow tints are derived automatically from your accent colour.',
      custom: 'themeExtras',
      cards: [
        {
          title: 'Palette', icon: 'fa-solid fa-droplet', path: 'theme',
          desc: 'These map directly to the CSS custom properties the site is built on.',
          fields: [
            { key: 'colorGold', label: 'Accent (Gold)', type: 'color' },
            { key: 'colorGoldLight', label: 'Accent — Light', type: 'color' },
            { key: 'colorSteel', label: 'Steel (technical labels)', type: 'color',
              hint: 'Used for code references and monospace metadata, so gold stays reserved for actions.' },
            { key: 'colorSteelDim', label: 'Steel — Dim', type: 'color' },
            { key: 'bgPrimary', label: 'Background — Primary', type: 'color' },
            { key: 'bgSecondary', label: 'Background — Secondary', type: 'color' },
            { key: 'textPrimary', label: 'Text — Primary', type: 'color' },
            { key: 'textSecondary', label: 'Text — Secondary', type: 'color' },
            { key: 'colorSteelBlue', label: 'Steel Blue', type: 'color' },
            { key: 'colorAccentBlue', label: 'Accent Blue', type: 'color' }
          ]
        },
        {
          title: 'Typography', icon: 'fa-solid fa-font', path: 'theme',
          desc: 'Full CSS font-family stacks. Any font you name must already be loaded — the site currently loads Playfair Display, Sora, and JetBrains Mono from Google Fonts.',
          fields: [
            { key: 'fontSerif', label: 'Heading Font Stack', type: 'text', wide: true, mono: true },
            { key: 'fontSans', label: 'Body Font Stack', type: 'text', wide: true, mono: true },
            { key: 'fontMono', label: 'Monospace Font Stack', type: 'text', wide: true, mono: true },
            { key: 'baseFontSize', label: 'Base Font Size', type: 'text', placeholder: '16px' }
          ]
        }
      ]
    },

    /* ============================ NAVIGATION =========================== */
    {
      id: 'navigation', label: 'Menus & Footer', icon: 'fa-solid fa-bars', group: 'Structure',
      title: 'Menus & Footer',
      desc: 'Control the header menu, the header button, every footer column, and the small print links.',
      cards: [
        {
          title: 'Header Menu', icon: 'fa-solid fa-list', path: 'nav.links', type: 'list',
          itemLabel: 'label', addLabel: 'Add Menu Item',
          emptyText: 'No menu items. Your header navigation will be empty.',
          fields: [
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'href', label: 'Link', type: 'text', placeholder: 'about.html' },
            { key: 'enabled', label: 'Show in menu', type: 'toggle' }
          ]
        },
        {
          title: 'Header Button', icon: 'fa-solid fa-square-arrow-up-right', path: 'nav.cta',
          fields: [
            { key: 'enabled', label: 'Show the header button', type: 'toggle', wide: true },
            { key: 'label', label: 'Button Label', type: 'text' },
            { key: 'href', label: 'Button Link', type: 'text' }
          ]
        },
        {
          title: 'Footer Columns', icon: 'fa-solid fa-table-columns', path: 'footer.columns', type: 'list',
          itemLabel: 'title', addLabel: 'Add Footer Column',
          emptyText: 'No footer columns yet.',
          fields: [
            { key: 'title', label: 'Column Heading', type: 'text' },
            { key: 'links', label: 'Links', type: 'list', itemLabel: 'label', addLabel: 'Add Link',
              fields: [
                { key: 'label', label: 'Label', type: 'text' },
                { key: 'href', label: 'Link', type: 'text' }
              ]
            }
          ]
        },
        {
          title: 'Small Print Links', icon: 'fa-solid fa-scroll', path: 'footer.bottomLinks', type: 'list',
          itemLabel: 'label', addLabel: 'Add Link',
          emptyText: 'No small print links.',
          fields: [
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'href', label: 'Link', type: 'text' }
          ]
        }
      ]
    },

    /* ============================== HOME =============================== */
    {
      id: 'home-hero', label: 'Home — Hero', icon: 'fa-solid fa-star', group: 'Home Page',
      title: 'Home Page — Hero',
      desc: 'The first thing visitors see: the headline over the animated 3D tower.',
      cards: [
        {
          title: 'Hero Content', icon: 'fa-solid fa-heading', path: 'home.hero',
          fields: [
            { key: 'tagline', label: 'Small Tagline (above headline)', type: 'text', wide: true },
            { key: 'titleLine1', label: 'Headline — Line 1', type: 'text' },
            { key: 'titleLine2', label: 'Headline — Line 2 (accent colour)', type: 'text' },
            { key: 'desc', label: 'Supporting Paragraph', type: 'textarea', wide: true }
          ]
        },
        {
          title: 'Primary Button', icon: 'fa-solid fa-circle-play', path: 'home.hero.primaryCta',
          fields: [
            { key: 'enabled', label: 'Show this button', type: 'toggle', wide: true },
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'href', label: 'Link', type: 'text' }
          ]
        },
        {
          title: 'Secondary Button', icon: 'fa-regular fa-circle-play', path: 'home.hero.secondaryCta',
          fields: [
            { key: 'enabled', label: 'Show this button', type: 'toggle', wide: true },
            { key: 'label', label: 'Label', type: 'text' },
            { key: 'href', label: 'Link', type: 'text' }
          ]
        }
      ]
    },

    {
      id: 'home-about', label: 'Home — About', icon: 'fa-solid fa-circle-info', group: 'Home Page',
      title: 'Home Page — About Block',
      desc: 'The image-and-text introduction directly below the hero.',
      cards: [
        {
          title: 'About Block', icon: 'fa-solid fa-align-left', path: 'home.about',
          fields: [
            { key: 'eyebrow', label: 'Small Label Above Heading', type: 'text' },
            { key: 'heading', label: 'Heading', type: 'text' },
            { key: 'body', label: 'Body Paragraph', type: 'textarea', wide: true },
            { key: 'image', label: 'Image', type: 'image', wide: true },
            { key: 'imageAlt', label: 'Image Alt Text', type: 'text', wide: true,
              hint: 'Describes the image for screen readers and search engines. Required for accessibility.' },
            { key: 'visionTitle', label: 'Vision Heading', type: 'text' },
            { key: 'visionBody', label: 'Vision Paragraph', type: 'textarea', wide: true }
          ]
        }
      ]
    },

    {
      id: 'home-sections', label: 'Home — Section Headings', icon: 'fa-solid fa-heading', group: 'Home Page',
      title: 'Home Page — Section Headings',
      desc: 'Every band on the home page. Turn a whole section off to remove it from the page entirely.',
      cards: [
        { title: 'Services Section', icon: 'fa-solid fa-briefcase', path: 'home.servicesSection', fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true }
        ]},
        { title: 'Free Calculators Section', icon: 'fa-solid fa-calculator', path: 'home.calculatorsSection',
          desc: 'The band promoting your calculator suite. Group tiles and counts are generated from the Calculators section, so they stay accurate on their own.',
          fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true },
          { key: 'showGroupTiles', label: 'Show the category tiles', type: 'toggle', wide: true,
            hint: 'Turn off for just a heading and a button.' },
          { key: 'ctaLabel', label: 'Button Label', type: 'text' },
          { key: 'ctaHref', label: 'Button Link', type: 'text' }
        ]},
        { title: 'Technology & Standards Section', icon: 'fa-solid fa-microchip', path: 'home.technologySection', fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true },
          { key: 'toolsTitle', label: 'Left Card Heading', type: 'text' },
          { key: 'toolsBody', label: 'Left Card Paragraph', type: 'textarea', wide: true },
          { key: 'standardsTitle', label: 'Right Card Heading', type: 'text' },
          { key: 'standardsBody', label: 'Right Card Paragraph', type: 'textarea', wide: true }
        ]},
        { title: 'BIM Viewer Section', icon: 'fa-solid fa-vr-cardboard', path: 'home.bimSection', fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true }
        ]},
        { title: 'Capabilities Section', icon: 'fa-solid fa-diagram-project', path: 'home.capabilitiesSection', fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true }
        ]},
        { title: 'Why Choose Us Section', icon: 'fa-solid fa-award', path: 'home.whySection', fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true }
        ]},
        { title: 'How We Work Section', icon: 'fa-solid fa-list-ol', path: 'home.processSection',
          desc: 'The engagement sequence shown between Why Choose Us and the team.',
          fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true }
        ]},
        { title: 'Team Section', icon: 'fa-solid fa-users', path: 'home.teamSection', fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true },
          { key: 'hiringNote', label: 'Hiring Note', type: 'text', wide: true },
          { key: 'hiringLinkLabel', label: 'Hiring Link Label', type: 'text' },
          { key: 'hiringLinkHref', label: 'Hiring Link', type: 'text' }
        ]},
        { title: 'Insights / Blog Section', icon: 'fa-solid fa-newspaper', path: 'home.blogSection', fields: [
          { key: 'enabled', label: 'Show this section', type: 'toggle', wide: true },
          { key: 'eyebrow', label: 'Small Label', type: 'text' },
          { key: 'heading', label: 'Heading', type: 'text' },
          { key: 'desc', label: 'Description', type: 'textarea', wide: true },
          { key: 'emptyMessage', label: 'Message When No Articles Exist', type: 'text', wide: true }
        ]}
      ]
    },

    /* ============================= CONTENT ============================= */
    {
      id: 'services', label: 'Services', icon: 'fa-solid fa-briefcase', group: 'Content',
      title: 'Services',
      desc: 'The service pillars shown on the home page. Each card can link to its own detail page.',
      cards: [
        {
          title: 'Service Cards', icon: 'fa-solid fa-grip', path: 'services', type: 'list',
          itemLabel: 'title', addLabel: 'Add Service',
          emptyText: 'No services yet. Add one to populate the services grid.',
          fields: [
            { key: 'title', label: 'Service Name', type: 'text' },
            { key: 'icon', label: 'Icon', type: 'icon' },
            { key: 'href', label: 'Detail Page Link', type: 'text', hint: 'Leave blank for a non-clickable card.' },
            { key: 'items', label: 'Bullet Points', type: 'tags', wide: true, hint: 'One per line.', multiline: true },
            { key: 'enabled', label: 'Show this service', type: 'toggle' }
          ]
        }
      ]
    },

    {
      id: 'tools', label: 'Tools & Standards', icon: 'fa-solid fa-toolbox', group: 'Content',
      title: 'Tools & Design Standards',
      desc: 'The software and design-code chips in the Technology band on the home page.',
      cards: [
        { title: 'Software Tools', icon: 'fa-solid fa-laptop-code', path: 'tools', type: 'tags',
          hint: 'One tool per line. Order is preserved.' },
        { title: 'Design Standards', icon: 'fa-solid fa-book', path: 'standards', type: 'tags',
          hint: 'One code or standard per line.' }
      ]
    },

    {
      id: 'capabilities', label: 'Capabilities', icon: 'fa-solid fa-diagram-project', group: 'Content',
      title: 'Engineering Capabilities',
      desc: 'The four-up capability cards on the home page.',
      cards: [
        {
          title: 'Capability Cards', icon: 'fa-solid fa-grip', path: 'capabilities', type: 'list',
          itemLabel: 'title', addLabel: 'Add Capability',
          emptyText: 'No capabilities yet.',
          fields: [
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'icon', label: 'Icon', type: 'icon' },
            { key: 'desc', label: 'Description', type: 'textarea', wide: true },
            { key: 'enabled', label: 'Show this card', type: 'toggle' }
          ]
        }
      ]
    },

    {
      id: 'why', label: 'Why Choose Us', icon: 'fa-solid fa-award', group: 'Content',
      title: 'Why Choose Us',
      desc: 'Your differentiators, shown as icon cards on the home page.',
      cards: [
        {
          title: 'Benchmark Cards', icon: 'fa-solid fa-grip', path: 'why', type: 'list',
          itemLabel: 'title', addLabel: 'Add Benchmark',
          emptyText: 'No benchmarks yet.',
          fields: [
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'icon', label: 'Icon', type: 'icon' },
            { key: 'desc', label: 'Description', type: 'textarea', wide: true },
            { key: 'enabled', label: 'Show this card', type: 'toggle' }
          ]
        }
      ]
    },

    {
      id: 'process', label: 'How We Work', icon: 'fa-solid fa-list-ol', group: 'Content',
      title: 'Engagement Process',
      desc: 'The ordered steps a client goes through with you, shown on the home page.',
      cards: [
        {
          title: 'Process Steps', icon: 'fa-solid fa-list-ol', path: 'process', type: 'list',
          itemLabel: 'title', addLabel: 'Add Step',
          emptyText: 'No steps yet. The How We Work section will fall back to its built-in copy.',
          fields: [
            { key: 'step', label: 'Step Number', type: 'text', placeholder: '01' },
            { key: 'title', label: 'Step Title', type: 'text' },
            { key: 'icon', label: 'Icon', type: 'icon' },
            { key: 'desc', label: 'Description', type: 'textarea', wide: true },
            { key: 'enabled', label: 'Show this step', type: 'toggle' }
          ]
        }
      ]
    },

    {
      id: 'team', label: 'Team', icon: 'fa-solid fa-users', group: 'Content',
      title: 'Team Members',
      desc: 'Leadership profiles shown on the home page and the About page.',
      cards: [
        {
          title: 'Team Profiles', icon: 'fa-solid fa-id-badge', path: 'team', type: 'list',
          itemLabel: 'name', addLabel: 'Add Team Member',
          emptyText: 'No team members yet.',
          fields: [
            { key: 'name', label: 'Full Name', type: 'text' },
            { key: 'role', label: 'Role / Job Title', type: 'text' },
            { key: 'photo', label: 'Photo', type: 'image', wide: true },
            { key: 'qualification', label: 'Qualification', type: 'text', wide: true },
            { key: 'experience', label: 'Experience', type: 'textarea', wide: true },
            { key: 'expertise', label: 'Areas of Expertise', type: 'text', wide: true },
            { key: 'linkedin', label: 'LinkedIn URL', type: 'url' },
            { key: 'twitter', label: 'X / Twitter URL', type: 'url' },
            { key: 'email', label: 'Public Email', type: 'email' },
            { key: 'enabled', label: 'Show this profile', type: 'toggle' }
          ]
        }
      ]
    },

    {
      id: 'projects', label: 'Projects', icon: 'fa-solid fa-building', group: 'Content',
      title: 'Project Portfolio',
      desc: 'Case studies for the Projects page. While the list is empty the page shows the placeholder message below.',
      cards: [
        {
          title: 'Projects', icon: 'fa-solid fa-city', path: 'projects', type: 'list',
          itemLabel: 'title', addLabel: 'Add Project',
          emptyText: 'No projects published yet. The Projects page is showing the placeholder below.',
          fields: [
            { key: 'title', label: 'Project Title', type: 'text' },
            { key: 'category', label: 'Category', type: 'select', optionsFrom: 'projectCategories', skipFirst: true },
            { key: 'location', label: 'Location', type: 'text' },
            { key: 'image', label: 'Cover Image', type: 'image', wide: true },
            { key: 'desc', label: 'Description', type: 'textarea', wide: true },
            { key: 'tags', label: 'Tags', type: 'tags', wide: true, hint: 'One per line.', multiline: true },
            { key: 'enabled', label: 'Show this project', type: 'toggle' }
          ]
        },
        {
          title: 'Categories', icon: 'fa-solid fa-filter', path: 'projectCategories', type: 'list',
          itemLabel: 'label', addLabel: 'Add Category',
          emptyText: 'No categories.',
          desc: 'Filter buttons on the Projects page. Keep "All Projects" first.',
          fields: [
            { key: 'label', label: 'Button Label', type: 'text' },
            { key: 'value', label: 'Category Key', type: 'text', hint: 'Lowercase, no spaces. Must match the category set on each project.' }
          ]
        },
        {
          title: 'Empty State', icon: 'fa-solid fa-inbox', path: 'projectsPage',
          desc: 'Shown on the Projects page while you have no published projects. Add a project above and this is replaced by the gallery automatically.',
          fields: [
            { key: 'emptyHeading', label: 'Heading', type: 'text', wide: true },
            { key: 'emptyMessage', label: 'Message', type: 'textarea', wide: true },
            { key: 'emptyCtaLabel', label: 'Primary Button Label', type: 'text' },
            { key: 'emptyCtaHref', label: 'Primary Button Link', type: 'text' },
            { key: 'emptySecondaryLabel', label: 'Secondary Button Label', type: 'text' },
            { key: 'emptySecondaryHref', label: 'Secondary Button Link', type: 'text' },
            { key: 'emptyNote', label: 'Small Print Under the Buttons', type: 'textarea', wide: true },
            { key: 'showFilters', label: 'Show category filter buttons', type: 'toggle', wide: true }
          ]
        }
      ]
    },

    {
      id: 'blog', label: 'Insights / Blog', icon: 'fa-solid fa-newspaper', group: 'Content',
      title: 'Insights & Articles',
      desc: 'Article cards for the Insights band on the home page. Links can point anywhere, including external publications.',
      cards: [
        {
          title: 'Articles', icon: 'fa-solid fa-file-lines', path: 'blog', type: 'list',
          itemLabel: 'title', addLabel: 'Add Article',
          emptyText: 'No articles yet. The Insights section is showing its placeholder message.',
          fields: [
            { key: 'title', label: 'Title', type: 'text' },
            { key: 'date', label: 'Date Label', type: 'text', placeholder: 'March 2026' },
            { key: 'image', label: 'Cover Image', type: 'image', wide: true },
            { key: 'excerpt', label: 'Excerpt', type: 'textarea', wide: true },
            { key: 'url', label: 'Article Link', type: 'text', wide: true },
            { key: 'enabled', label: 'Publish this article', type: 'toggle' }
          ]
        }
      ]
    },

    {
      id: 'testimonials', label: 'Testimonials', icon: 'fa-solid fa-quote-left', group: 'Content',
      title: 'Client Testimonials',
      desc: 'Quotes for the testimonial carousel. Enable the carousel under Features once you have at least one.',
      cards: [
        {
          title: 'Testimonials', icon: 'fa-solid fa-comment-dots', path: 'testimonials', type: 'list',
          itemLabel: 'author', addLabel: 'Add Testimonial',
          emptyText: 'No testimonials yet.',
          fields: [
            { key: 'quote', label: 'Quote', type: 'textarea', wide: true },
            { key: 'author', label: 'Author Name', type: 'text' },
            { key: 'role', label: 'Role', type: 'text' },
            { key: 'company', label: 'Company', type: 'text' },
            { key: 'enabled', label: 'Show this testimonial', type: 'toggle' }
          ]
        }
      ]
    },

    /* ============================== PAGES ============================== */
    {
      id: 'contact', label: 'Contact Details', icon: 'fa-solid fa-address-book', group: 'Pages',
      title: 'Contact Details',
      desc: 'Your contact information, the enquiry form copy, and the project types visitors can choose from.',
      cards: [
        {
          title: 'Contact Information', icon: 'fa-solid fa-envelope', path: 'contact',
          fields: [
            { key: 'email', label: 'Public Email', type: 'email' },
            { key: 'phone', label: 'Public Phone', type: 'text' },
            { key: 'emailLabel', label: 'Email Row Heading', type: 'text' },
            { key: 'phoneLabel', label: 'Phone Row Heading', type: 'text' },
            { key: 'address', label: 'Office Address', type: 'textarea', wide: true, hint: 'Leave blank to hide.' }
          ]
        },
        {
          title: 'Enquiry Form Copy', icon: 'fa-solid fa-pen-to-square', path: 'contact',
          fields: [
            { key: 'heading', label: 'Section Heading', type: 'text', wide: true },
            { key: 'intro', label: 'Intro Paragraph', type: 'textarea', wide: true },
            { key: 'formButtonLabel', label: 'Submit Button Label', type: 'text', wide: true },
            { key: 'successHeading', label: 'Success Heading', type: 'text' },
            { key: 'successBody', label: 'Success Message', type: 'textarea', wide: true }
          ]
        },
        {
          title: 'Project Type Options', icon: 'fa-solid fa-list-check', path: 'contact.projectTypes', type: 'list',
          itemLabel: 'label', addLabel: 'Add Project Type',
          emptyText: 'No project types — the dropdown will be empty.',
          fields: [
            { key: 'label', label: 'Option Label', type: 'text' },
            { key: 'value', label: 'Option Value', type: 'text', hint: 'Lowercase key stored with the lead.' }
          ]
        }
      ]
    },

    {
      id: 'social', label: 'Social Links', icon: 'fa-solid fa-share-nodes', group: 'Pages',
      title: 'Social Links',
      desc: 'Icons in the footer. A link with an empty URL is hidden automatically.',
      cards: [
        {
          title: 'Social Profiles', icon: 'fa-brands fa-linkedin', path: 'social', type: 'list',
          itemLabel: 'id', addLabel: 'Add Social Link',
          emptyText: 'No social links.',
          fields: [
            { key: 'id', label: 'Name', type: 'text', placeholder: 'linkedin' },
            { key: 'icon', label: 'Icon', type: 'icon' },
            { key: 'url', label: 'Profile URL', type: 'url', wide: true },
            { key: 'enabled', label: 'Show this link', type: 'toggle' }
          ]
        }
      ]
    },

    {
      id: 'page-banners', label: 'Page Titles & SEO', icon: 'fa-solid fa-magnifying-glass', group: 'Pages',
      title: 'Page Titles & SEO',
      desc: 'Browser tab titles, search engine descriptions, social sharing images, and the banner headings on each inner page.',
      custom: 'seoPreview',
      cards: [
        { title: 'Home', icon: 'fa-solid fa-house', path: 'pages.index', fields: [
          { key: 'title', label: 'Browser Tab Title', type: 'text', wide: true, counter: 60 },
          { key: 'description', label: 'Search Description', type: 'textarea', wide: true, counter: 160 },
          { key: 'ogImage', label: 'Social Sharing Image', type: 'image', wide: true }
        ]},
        { title: 'About', icon: 'fa-solid fa-circle-info', path: 'pages.about', fields: [
          { key: 'title', label: 'Browser Tab Title', type: 'text', wide: true, counter: 60 },
          { key: 'description', label: 'Search Description', type: 'textarea', wide: true, counter: 160 },
          { key: 'bannerEyebrow', label: 'Banner Small Label', type: 'text' },
          { key: 'bannerHeading', label: 'Banner Heading', type: 'text' },
          { key: 'ogImage', label: 'Social Sharing Image', type: 'image', wide: true }
        ]},
        { title: 'Services', icon: 'fa-solid fa-briefcase', path: 'pages.services', fields: [
          { key: 'title', label: 'Browser Tab Title', type: 'text', wide: true, counter: 60 },
          { key: 'description', label: 'Search Description', type: 'textarea', wide: true, counter: 160 },
          { key: 'bannerEyebrow', label: 'Banner Small Label', type: 'text' },
          { key: 'bannerHeading', label: 'Banner Heading', type: 'text' },
          { key: 'ogImage', label: 'Social Sharing Image', type: 'image', wide: true }
        ]},
        { title: 'Projects', icon: 'fa-solid fa-building', path: 'pages.projects', fields: [
          { key: 'title', label: 'Browser Tab Title', type: 'text', wide: true, counter: 60 },
          { key: 'description', label: 'Search Description', type: 'textarea', wide: true, counter: 160 },
          { key: 'bannerEyebrow', label: 'Banner Small Label', type: 'text' },
          { key: 'bannerHeading', label: 'Banner Heading', type: 'text' },
          { key: 'ogImage', label: 'Social Sharing Image', type: 'image', wide: true }
        ]},
        { title: 'Contact', icon: 'fa-solid fa-envelope', path: 'pages.contact', fields: [
          { key: 'title', label: 'Browser Tab Title', type: 'text', wide: true, counter: 60 },
          { key: 'description', label: 'Search Description', type: 'textarea', wide: true, counter: 160 },
          { key: 'bannerEyebrow', label: 'Banner Small Label', type: 'text' },
          { key: 'bannerHeading', label: 'Banner Heading', type: 'text' },
          { key: 'ogImage', label: 'Social Sharing Image', type: 'image', wide: true }
        ]},
        { title: 'Calculators', icon: 'fa-solid fa-calculator', path: 'pages.calculators', fields: [
          { key: 'title', label: 'Browser Tab Title', type: 'text', wide: true, counter: 60 },
          { key: 'description', label: 'Search Description', type: 'textarea', wide: true, counter: 160 },
          { key: 'bannerEyebrow', label: 'Banner Small Label', type: 'text' },
          { key: 'bannerHeading', label: 'Banner Heading', type: 'text' },
          { key: 'ogImage', label: 'Social Sharing Image', type: 'image', wide: true }
        ]}
      ]
    },

    /* ============================== TOOLS ============================== */
    {
      id: 'calculators', label: 'Calculators', icon: 'fa-solid fa-calculator', group: 'Tools',
      title: 'Engineering Calculators',
      desc: 'Show or hide each calculator on the hub page and control the copy of the lead-capture gate.',
      custom: 'calcTools',
      cards: [
        {
          title: 'Calculator Groups', icon: 'fa-solid fa-square-root-variable', path: 'calculatorGroups', type: 'list',
          itemLabel: 'title', addLabel: 'Add Group',
          emptyText: 'No groups. The calculator hub page will be empty.',
          desc: 'The hub page is organised into groups. Hiding a group hides everything in it; ' +
                'hiding a single calculator removes just that card. Either way the calculator\'s own ' +
                'page stays reachable by direct link, so existing bookmarks keep working.',
          fields: [
            { key: 'title', label: 'Group Heading', type: 'text' },
            { key: 'eyebrow', label: 'Group Sub-label', type: 'text', hint: 'e.g. the governing code section.' },
            { key: 'desc', label: 'Group Description', type: 'textarea', wide: true },
            { key: 'enabled', label: 'Show this group', type: 'toggle' },
            {
              key: 'items', label: 'Calculators in This Group', type: 'list',
              itemLabel: 'name', addLabel: 'Add Calculator',
              fields: [
                { key: 'name', label: 'Display Name', type: 'text' },
                { key: 'icon', label: 'Icon', type: 'icon' },
                { key: 'href', label: 'Page Link', type: 'text' },
                { key: 'desc', label: 'Description', type: 'textarea', wide: true },
                { key: 'code', label: 'Code Reference Badge', type: 'text', hint: 'e.g. BNBC 2020 Sec 2.5.7' },
                { key: 'enabled', label: 'Show this calculator', type: 'toggle' }
              ]
            }
          ]
        },
        {
          title: 'Lead Gate Copy', icon: 'fa-solid fa-lock', path: 'leadGate',
          desc: 'Shown when a visitor runs a calculation before submitting their details.',
          fields: [
            { key: 'heading', label: 'Overlay Heading', type: 'text' },
            { key: 'body', label: 'Overlay Message', type: 'textarea', wide: true },
            { key: 'buttonLabel', label: 'Overlay Button Label', type: 'text' },
            { key: 'modalTitle', label: 'Modal Title', type: 'text' },
            { key: 'modalBody', label: 'Modal Message', type: 'textarea', wide: true }
          ]
        }
      ]
    },

    {
      id: 'features', label: 'Features & Toggles', icon: 'fa-solid fa-toggle-on', group: 'Tools',
      title: 'Features & Toggles',
      desc: 'Site-wide switches. Changes take effect the moment you publish.',
      cards: [
        {
          title: 'Site Switches', icon: 'fa-solid fa-sliders', path: 'features',
          fields: [
            { key: 'leadGate', label: 'Require visitor details before calculators run', type: 'toggle', wide: true,
              hint: 'Turn off to make every calculator completely open. You will stop collecting leads from them.' },
            { key: 'showBimViewer', label: 'Show the 3D BIM viewer on the home page', type: 'toggle', wide: true },
            { key: 'showTeamSection', label: 'Show the team section', type: 'toggle', wide: true },
            { key: 'showBlogSection', label: 'Show the Insights section', type: 'toggle', wide: true },
            { key: 'showTestimonials', label: 'Show the testimonial carousel', type: 'toggle', wide: true,
              hint: 'Only has an effect once you have added at least one testimonial.' }
          ]
        },
        {
          title: 'Announcement Bar', icon: 'fa-solid fa-bullhorn', path: 'features.announcement',
          desc: 'A strip pinned above the header on every page. Editing the text makes it reappear for visitors who dismissed the previous message.',
          fields: [
            { key: 'enabled', label: 'Show the announcement bar', type: 'toggle', wide: true },
            { key: 'text', label: 'Message', type: 'text', wide: true },
            { key: 'linkLabel', label: 'Link Label', type: 'text' },
            { key: 'linkHref', label: 'Link', type: 'text' },
            { key: 'dismissible', label: 'Let visitors dismiss it', type: 'toggle', wide: true }
          ]
        },
        {
          title: 'Maintenance Mode', icon: 'fa-solid fa-triangle-exclamation', path: 'features',
          desc: 'Replaces every public page with a holding notice. The control panel always stays reachable, and you can bypass it anywhere by adding ?nomaint=1 to a URL.',
          danger: true,
          fields: [
            { key: 'maintenanceMode', label: 'Take the public site offline', type: 'toggle', wide: true },
            { key: 'maintenanceMessage', label: 'Holding Message', type: 'textarea', wide: true }
          ]
        }
      ]
    },

    {
      id: 'integrations', label: 'Integrations', icon: 'fa-solid fa-plug', group: 'Tools',
      title: 'Integrations',
      desc: 'External services the site talks to.',
      cards: [
        {
          title: 'Lead Logging & Analytics', icon: 'fa-solid fa-chart-simple', path: 'integrations',
          fields: [
            { key: 'googleScriptUrl', label: 'Google Apps Script Endpoint', type: 'url', wide: true, mono: true,
              hint: 'Calculator and contact leads are POSTed here in addition to being stored in the visitor\'s browser.' },
            { key: 'gaMeasurementId', label: 'Google Analytics Measurement ID', type: 'text', mono: true, placeholder: 'G-XXXXXXXXXX',
              hint: 'Leave blank to load no analytics at all.' },
            { key: 'gtmContainerId', label: 'Google Tag Manager Container ID', type: 'text', mono: true, placeholder: 'GTM-XXXXXXX' }
          ]
        }
      ]
    },

    /* ============================== DATA =============================== */
    { id: 'leads', label: 'Leads', icon: 'fa-solid fa-inbox', group: 'Data', custom: 'leads',
      title: 'Lead Inbox',
      desc: 'Form submissions and calculator unlocks captured in this browser.' },

    { id: 'publish', label: 'Publish', icon: 'fa-solid fa-cloud-arrow-up', group: 'Data', custom: 'publish',
      title: 'Publish Changes',
      desc: 'Push your edits to the live site, or export them as a file.' },

    { id: 'history', label: 'History & Backups', icon: 'fa-solid fa-clock-rotate-left', group: 'Data', custom: 'history',
      title: 'History & Backups',
      desc: 'Every publish is snapshotted here so you can roll back a mistake.' },

    { id: 'settings', label: 'Settings', icon: 'fa-solid fa-gear', group: 'Data', custom: 'settings',
      title: 'Settings',
      desc: 'Connection details, passcode, and advanced data tools.' }
  ]
};
