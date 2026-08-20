# TwinAnalytic — Structural Engineering Consultant & BIM Services

TwinAnalytic is a professional web platform for a structural engineering and BIM (Building Information Modeling) services consultancy. The website showcases professional engineering services, provides an interactive 3D BIM showcase, and features complex engineering calculators (reinforced concrete beam, column, and slab design) compliant with codes like ACI 318 and BNBC 2020.

---

## 🚀 How to Run Locally

Since this is a frontend-focused web application, all dependencies (Three.js, Tailwind CSS, Font Awesome, jsPDF) are loaded via high-performance CDNs. 

No `npm install` or compilation step is required! You only need a local web server to run it.

### Option 1: Using the Custom Dev Server (Recommended)
We have provided a custom Python development server (`dev-server.py`) that matches the clean routing config of the production server (supporting extensionless URLs like `/calculators` instead of `/calculators.html`).

1. Open your terminal or command prompt in the project folder.
2. Run the server:
   ```bash
   python dev-server.py
   ```
3. Your default browser will open automatically to `http://localhost:8000`.

### Option 2: Using standard Python Server
If you just want a quick server without clean URL redirection:
```bash
python -m http.server 8000
```
Then navigate to `http://localhost:8000/index.html` in your browser.

---

## 🎛️ Admin Control Panel

The whole public site is editable from a browser, without touching code. Open
`/admin.html` (locally: `http://localhost:8000/admin.html`).

### What it controls

| Area | What you can change |
| --- | --- |
| **Site Identity** | Brand name, logo, favicon, tagline, footer text, copyright |
| **Theme & Colours** | Full palette, font stacks, five one-click presets. Border, glow, and shadow tints derive from the accent colour automatically |
| **Menus & Footer** | Header menu items, header button, every footer column and link |
| **Home Page** | Hero copy and buttons, About block, and the headings of all seven sections — each with an on/off switch |
| **Content** | Services, Tools, Standards, Capabilities, Why-Choose-Us, Team, Projects, Articles, Testimonials — all add / reorder / duplicate / delete / hide |
| **Pages** | Contact details, enquiry form copy, project-type dropdown, social links |
| **SEO** | Per-page tab title, search description, social sharing image, and banner headings, with length counters |
| **Calculators** | The hub page's 5 groups and all 28 calculators — headings, code badges, descriptions, order, and per-group / per-calculator visibility. Plus the lead-gate wording and an unlock reset for testing |
| **Features** | Lead gate on/off, announcement bar, maintenance mode, section visibility |
| **Integrations** | Google Apps Script lead endpoint, Google Analytics / Tag Manager IDs |
| **Leads** | Search, sort, delete, and export submissions as CSV or JSON |
| **History** | The last 15 publishes, restorable |

### How content reaches the live site

```
admin.html  →  draft in your browser  →  Publish  →  data/content.json on GitHub  →  Vercel rebuild
```

`js/site-content.js` loads on every page and applies `data/content.json` to the
markup through `data-tw*` attributes. **The hardcoded HTML is always the
fallback** — if the JSON fails to load, every page still renders exactly as it
did before the content layer existed.

### First-time setup — secure mode (recommended)

The GitHub token stays on the server and never enters a browser. This also
makes the admin passcode **real, server-enforced authentication** rather than
a client-side lock.

1. Open `/admin.html` and create a passcode.
2. Go to **Settings → Secure Publishing** and press **Generate Hash**, entering
   that same passcode. Copy the hash.
3. In the Vercel dashboard → your project → **Settings → Environment
   Variables**, add:

   | Name | Value |
   | --- | --- |
   | `GITHUB_TOKEN` | a fine-grained PAT, Contents: Read and write, this repo only |
   | `ADMIN_PASSCODE_HASH` | the hash from step 2 |

   Optional overrides: `GITHUB_OWNER`, `GITHUB_REPO`, `GITHUB_BRANCH`,
   `CONTENT_PATH`.

4. **Redeploy** so the variables take effect, then press **Re-check Server** in
   the panel. It should report *Secure Publishing is Active*.

`api/publish.js` verifies the passcode with a timing-safe comparison, rejects
anything that is not a valid content file, and only then commits to GitHub.

> If you change your panel passcode later, update `ADMIN_PASSCODE_HASH` in
> Vercel to match or publishing will be rejected. The panel warns you when
> this happens.

### Alternative — browser token

Simpler, but the token sits in `localStorage`, where any script on the origin
can read it (the public pages load Tailwind, jsPDF, and Three.js from CDNs).
Prefer secure mode; use this only as a fallback.

1. Open `/admin.html` and create a passcode.
2. Go to **Settings → GitHub Connection** and paste a token.

   Create the token at **GitHub → Settings → Developer settings → Personal
   access tokens → Fine-grained tokens** with:
   - **Repository access:** *Only select repositories* → this repo only
   - **Permissions → Repository permissions → Contents:** *Read and write*
   - Nothing else, and a short expiry.

   Scoped that narrowly, the token can edit this one repository and nothing
   else. It is stored only in your browser and is sent only to `api.github.com`.
3. Press **Test Connection**, then edit and **Publish**.

No token? **Publish → Manual Publish** downloads `content.json` for you to
upload through the GitHub web interface instead.

### Security boundary

**In secure mode** the passcode is checked by `api/publish.js` on the server
before anything is written, and the GitHub token never leaves Vercel. The
passcode is genuine authentication.

**In browser-token mode** the passcode is only a client-side lock — it hides
the console from casual visitors, but anyone can read past it in the page
source. There the real protection is the token itself.

Either way `admin.html` is excluded in `robots.txt` and carries
`noindex, nofollow`.

### Handy URLs

| URL | Effect |
| --- | --- |
| `index.html?preview=1` | Preview your unpublished draft |
| `index.html?preview=0` | Leave preview mode |
| `index.html?nomaint=1` | Bypass maintenance mode |
| `calculators.html?lock=1` | Reset the calculator lead gate |

---

## 📂 Project Structure

```
TwinAnalytic/
├── index.html                   # Main Landing Page (Hero section, Services, Stats)
├── about.html                   # Corporate profile and team details
├── services.html                # Comprehensive services overview page
├── projects.html                # Portfolio with interactive category filter
├── contact.html                 # Contact info and consultation request forms
├── calculators.html             # Engineering calculators hub
├── beam-design.html             # RC Beam design calculator (singly, doubly, T-beam)
├── column-design.html           # RC Column design calculator with interaction diagram
├── slab-design.html             # RC Slab design & thickness checker
├── bim-viewer.html              # Mock interactive 3D BIM Viewer page
├── 3d-visualization.html        # Interactive 3D visualization showcase page
├── admin.html                   # Admin control panel (see above)
├── digital-twin.html            # Detailed service page: Digital Twin
├── structural-design.html       # Detailed service page: Structural Design
├── bim-modeling.html            # Detailed service page: BIM Modeling
├── mep-engineering.html         # Detailed service page: MEP Engineering
├── feasibility-cost.html        # Detailed service page: Feasibility & Cost Estimating
├── construction-supervision.html # Detailed service page: Construction Supervision
├── project-management.html      # Detailed service page: Project Management
├── privacy.html                 # Privacy policy
├── robots.txt                   # Search engine crawler instructions
├── sitemap.xml                  # XML Sitemap for search engines
├── sitemap.html                 # HTML Sitemap for user navigation
├── vercel.json                  # Production clean routing configurations
├── dev-server.py                # Python local server with clean URL support
├── update_logos.py              # Script to update text logos to image logos
├── api/
│   └── publish.js               # Serverless publish endpoint (secure mode)
├── data/
│   └── content.json             # Single source of truth for all editable content
├── css/
│   ├── style.css                # Global stylesheet containing core design system
│   └── admin.css                # Control panel stylesheet (standalone)
├── js/
│   ├── site-content.js          # Content engine — hydrates pages from content.json
│   ├── admin.js                 # Control panel application
│   ├── admin-schema.js          # Declarative field definitions for the panel
│   ├── main.js                  # Global UI interactions (navbars, menus, stats)
│   ├── calculators.js           # Structural math and calculations engine
│   └── three-scene.js           # Three.js 3D Wireframe building and BIM mockup
└── assets/                      # Static assets, images, team photos, and logos
```

---

## 🏗️ Technical Highlights

### 1. 🧮 Structural Calculators (`js/calculators.js`)
* **Beam Design:** Singly, doubly, and T-beams flexural checking according to ACI 318 / BNBC 2020 limit state design. Renders live cross-sectional SVG diagrams with correct reinforcement bars dynamically.
* **Column Design:** Biaxial and uniaxial bending capacity checks, showing a dynamic interaction diagram (P-M) plot drawn on an HTML5 canvas.
* **Slab Design:** Minimum thickness check (ACI 318 coefficients) and flexural reinforcement distribution for both one-way and two-way slabs.
* **PDF Export:** Generates professional engineering calculation reports directly from the browser using `jsPDF` and `html2pdf.js`.

### 2. 🌐 3D Digital Twin & BIM Showcase (`js/three-scene.js`)
* **Hero 3D Canvas:** Renders a floating, twisted wireframe tower (constructed mathematically using a spiral helix formulation) along with a blueprint grid layout to emphasize the digital twin concept.
* **BIM Viewer:** An interactive 3D scene mock showing parametric concrete structural frames, pillars, beams, and slabs with OrbitControls camera navigation.

### 3. 🛡️ Lead Tracking & Admin Panel (`admin.html`)
* Includes a lead collection system integrated with Google Sheets Apps Script Web App API (`GOOGLE_SCRIPT_URL`), which logs calculator usages and consultation queries, accessible securely through the Admin panel.
