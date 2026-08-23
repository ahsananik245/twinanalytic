# TwinAnalytic — Structural Engineering Consultant & BIM Services

TwinAnalytic is a professional web platform for a structural engineering and BIM (Building Information Modeling) services consultancy. The website showcases professional engineering services, provides an interactive 3D BIM showcase, and features a suite of 28 engineering calculators compliant with BNBC 2020 and ACI 318. Every part of the public site is editable from a browser-based control panel — see below.

---

## 🚀 How to Run Locally

Since this is a frontend-focused web application, its few dependencies (Three.js, Font Awesome, jsPDF) are loaded from CDNs. Tailwind's CDN build was removed — it compiled CSS in the browser on every page load; the seventeen utilities that were actually used now live in `css/style.css`.

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
| **Theme & Colours** | Full palette including the steel used for technical labels, font stacks, five one-click presets. Border, glow, and shadow tints derive from the accent colour automatically |
| **Menus & Footer** | Header menu items, header button, every footer column and link |
| **Home Page** | Hero copy and buttons, About block, and the headings of all seven sections — each with an on/off switch |
| **Content** | Services, Tools, Standards, Capabilities, Why-Choose-Us, How We Work, Team, Projects, Articles, Testimonials — all add / reorder / duplicate / delete / hide |
| **Pages** | Contact details, enquiry form copy, project-type dropdown, social links |
| **SEO** | Per-page tab title, search description, social sharing image, and banner headings, with length counters |
| **Calculators** | The hub page's 5 groups and all 28 calculators — headings, code badges, descriptions, order, and per-group / per-calculator visibility. Plus the lead-gate wording and an unlock reset for testing |
| **Features** | Lead gate on/off, announcement bar, maintenance mode, section visibility, and the two background layers (concrete texture and blueprint grid) independently |
| **Integrations** | Google Apps Script lead endpoint, Google Analytics / Tag Manager IDs |
| **Leads** | The real inbox read from your Google Sheet, plus the local copy. Search, sort, export as CSV or JSON |
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

### Caching

`vercel.json` sets `Cache-Control: public, max-age=0, must-revalidate` on
`/js/` and `/css/`, so an updated control panel or content engine is picked up
on the next load rather than hours later. These files carry ETags, so
revalidating costs a 304 with no body. `/admin.html` and `/api/` are
`no-store`. `data/content.json` already revalidates, so published content goes
live immediately.

> The domain is proxied through **Cloudflare**, which overrides the origin's
> `Cache-Control` unless told not to. Its default Browser Cache TTL of 4 hours
> was replacing the rules above, so a deploy took up to 4 hours to reach anyone
> who had already visited.
>
> **Resolved** — Browser Cache TTL is set to *Respect Existing Headers*, and
> the live response now carries `max-age=0, must-revalidate` with
> `cf-cache-status: REVALIDATED`. If deploys ever start going stale again,
> check that setting first: **Caching → Configuration → Browser Cache TTL**.

### Page background

The background is two fixed layers on a single `body::before` pseudo-element:
a photographic concrete surface (`assets/texture-concrete.jpg`) with the faint
blueprint grid over it. Both are switchable under **Features** in the control
panel.

The texture is derived from the brand artwork and pre-processed rather than
used raw, which is what keeps it usable as a site-wide background:

* **High-passed** — the source's vignette and soft blotches are subtracted, so
  only grain and cracks remain. Large-scale luminance drift reads as a
  rendering artefact when stretched across a page.
* **Pinned to `--bg-primary`** — its mean is set to exactly `#131313`, so it
  adds depth without lifting or tinting the page. `<html>` keeps that same
  colour, so a failed image load is invisible.
* **Highlight-capped** — shadows are linear (darkening can only help contrast)
  but highlights are soft-capped, holding the brightest pixel at `#3B`. Every
  palette colour clears WCAG AA against that worst case: body text 10.3:1,
  secondary 5.7:1, steel 5.5:1, gold 4.9:1.

It sits at `z-index: -1`, under in-flow content. This matters: at `z-index: 0`
a `body::before` layer paints *above* every non-positioned section background,
which is harmless for near-transparent gridlines but would bury the page under
an opaque photograph. `body` is therefore transparent so it does not paint over
the layer beneath it.

Positioning the element `fixed` — rather than using
`background-attachment: fixed` — keeps it viewport-locked as one composited
layer that never repaints on scroll. Measured after the change: 60fps with zero
frames over 33ms on both desktop and mobile viewports.

To regenerate it from a different source image, the pipeline is
`scripts/build-texture.py`.

### Where leads actually go

Two things about lead capture are easy to misread.

**The Leads panel is local to one browser.** Submissions are written to
`localStorage` under `tools_leads`, which is per-browser and per-device. A
visitor filling the form writes to *their* machine; the panel reads *yours*. It
can therefore only ever show what was submitted on the computer you are looking
at. **Your Google Sheet is the record of who enquired — the panel is not.** A
count of zero there means nothing was submitted on this machine, not that nobody
enquired.

**A failed send is invisible.** The POST to the Apps Script uses
`mode: 'no-cors'`, so the response is opaque: `.then()` runs whether the script
saved the row, errored, or refused the request, and `.catch()` only fires on a
network-level failure. That is deliberate — it stops an adblocker or firewall
from blocking the visitor's unlock — but it means the site cannot tell you when
capture breaks. If the deployment expires or its access changes, leads stop
arriving silently. Check the sheet periodically rather than trusting the absence
of errors.

**Reading the sheet back into the panel.** Once set up, the Leads section grows
a *Load from sheet* button and shows the real inbox instead of the local copy.
It says at the top which of the two you are looking at.

1. Open the spreadsheet → **Extensions → Apps Script** and paste
   [`docs/apps-script-leads.gs`](docs/apps-script-leads.gs), replacing `TOKEN`
   with a long random string (`openssl rand -hex 24`). Do not reuse the panel
   passcode.
2. **Deploy → New deployment → Web app**, *Execute as* **Me**, *Who has access*
   **Anyone**. "Anyone" is required — the public form posts without a Google
   session and the Vercel function reads without one. The token is what guards
   the data, which is why `doGet` returns nothing without it.
3. In Vercel → **Settings → Environment Variables** add `LEADS_SCRIPT_URL` (the
   deployment URL) and `LEADS_TOKEN` (the same string), then redeploy.

`api/leads.js` proxies the read. It has to: Apps Script answers with a 302 to
`script.googleusercontent.com` and sets no CORS headers, so a browser fetch
would fail or be forced into `no-cors` and get an opaque response. Proxying also
keeps the token on the server — in the panel, anyone reading the page source
could pull the whole lead list.

Sheet rows are read-only in the panel. Delete and Clear act on the local copy
only and are hidden while sheet data is showing, because removing a row there
would not touch the sheet and would look like it had.

> After editing the Apps Script you must **deploy again** — *Manage deployments
> → edit → Version: New version*. Saving alone changes nothing at the live URL,
> and this is the most common reason an edit appears to have no effect.

Endpoint health can be checked from a terminal. A working deployment answers a
POST with a 302 to `script.googleusercontent.com/macros/echo`:

```bash
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" -X POST \
  -H "Content-Type: text/plain" -d '{"name":"test"}' "$GOOGLE_SCRIPT_URL"
```

Do not follow the redirect with `-L`: curl re-POSTs without a body and you get a
spurious 411 or 405 that looks like a failure when the script ran fine.

### Units across the calculator suite

The 28 calculators do not all use the same unit system, and that is worth
knowing before editing any of them.

| Group | Units |
| --- | --- |
| 23 calculators built on the `bnbc-*` engine | Metric, with a working metric/imperial toggle |
| `beam-design` | Metric only, no toggle |
| `column-design` | **Metric or imperial**, switchable — see below |
| `slab-design` | US customary only — ft, psi, psf, in |
| `footing-design`, `footing-rect-design` | US customary, **except** rebar diameter in mm |

The split is defensible on its own terms: BNBC is a metric code, and ACI 318
publishes an imperial edition. The mixed footing pages are not a bug either —
`js/footing-design.js` divides the entered diameter by 25.4, so the mm label is
truthful, and mm bar sizes are ordinary practice in Bangladesh.

The hazard is carrying a number from a metric calculator into an imperial one,
so all five non-toggle pages now open with a `.unit-notice` stating the system
in force. Metric pages use the gold accent, imperial the neutral steel, so the
two differ at a glance rather than only on reading.

**`column-design` is switchable.** `js/column-units.js` converts at the two
boundaries — metric values are written back as imperial before
`calculateColumn()` reads them, and the named output fields are rewritten
afterwards — so the verified engine is untouched and both systems produce the
same answer. Metric bar sizes live in the shared `ACI_BAR_DATA` lookup with
their diameter and area expressed in inches, so a metric bar needs no
conversion at all: the engine reads a diameter and an area and does not care
what the key means. Areas are the true circle area of the nominal diameter, not
the nearest imperial bar — a 25 mm bar is 491 mm², where #8 is 510 mm².

Run `python scripts/verify-column-units.py` against a local server to prove it.
It checks equivalence (the same column entered both ways), regression (imperial
results unchanged from before the switch), round-trip stability (toggling eight
times must not drift the inputs), and the bar areas. Non-zero exit on failure,
so it can gate a deploy.

The PDF report is still generated in US customary units throughout. Converting
it is a separate job; until then it prints a line saying so whenever the page is
in metric, rather than handing a metric user an imperial report with nothing to
indicate it.

**Why the remaining imperial pages have not simply been converted.** It looks like a unit
conversion and is not. `column-design` selects reinforcement from the US bar
designation catalogue — #5 to #18 mains, #3 to #5 ties. Going metric means
replacing that catalogue with 10/12/16/20/25/32 mm bars, which changes bar
areas (#8 is 510 mm², a 25 mm bar is 491 mm²), the bar-count selection, tie
sizing, and the hook extensions and development lengths keyed to bar diameter.
That is an engineering change needing re-verification against a known-good
calculation, not a wrapper around the existing engine.

The safe route, if it is done, is the one `js/bnbc-project.js` already
implements for the other 23: convert at the UI boundary via `tagUnits`,
`repaintUnits` and `v()`, so the verified engine never sees a converted number
— plus a metric bar catalogue and a fresh verification pass per page.

### Lead capture

`features.leadGateMode` decides when a visitor is asked for their details:

| Mode | Behaviour |
| --- | --- |
| `pdf` *(default)* | Calculators run freely. Details are asked for when downloading the PDF report. |
| `results` | The original behaviour — results stay blurred until details are given. |
| `off` | Nothing is gated. Equivalent to `features.leadGate: false`, which remains the master switch. |

`pdf` is the default deliberately. The calculators are the reason anyone arrives,
and blocking the result on a site with no brand recognition costs more in reach
than it gains in addresses. Asking at the download instead delivers the value
first, captures the email at the point of highest intent, and puts a branded
calculation report inside the visitor's organisation.

The gate exists in **three separate implementations**, which is a trap worth
knowing about: `js/calculators.js` for the beam/column/slab pages,
`js/bnbc-ui.js` for the shared engine behind most of the 28 calculators, and an
inline copy in `beam-design.html`, which does not load `calculators.js`. All
three take the same `checkAuthAndRun(callback, label, purpose)` shape, where
`purpose` is `'calc'` or `'pdf'`.

**`purpose` defaults to `'pdf'`** — the gated value — so a call site added later
without thinking about it errs towards asking rather than silently giving the
report away.

### Search indexing

Canonical tags, `og:url`, JSON-LD and `sitemap.xml` all use **clean URLs**
(`/about`, not `/about.html`). This is load-bearing, not cosmetic: `cleanUrls`
in `vercel.json` makes `/about.html` 308-redirect to `/about`, so declaring the
`.html` form as canonical points search engines at a URL that redirects away
from itself. Search Console reports that as *"Page with redirect — not
indexed."* If you add a page, give it a clean self-referential canonical and a
clean sitemap entry.

`scripts/indexnow.py` pushes the sitemap's URLs to IndexNow, which covers Bing,
Yandex, Seznam and Naver in one call. Google does not participate — for Google,
submit the sitemap in Search Console.

```bash
python scripts/indexnow.py --dry-run   # check what would be sent
python scripts/indexnow.py             # submit every sitemap URL
python scripts/indexnow.py <url> ...   # submit specific pages after an edit
```

It verifies the key file is live and that every URL returns 200 before sending,
without following redirects — submitting redirects or 404s is what gets a key
throttled.

Ownership is proved by `<key>.txt` at the site root. That file and
`.indexnow-key` are committed on purpose: the key is not a secret. It only shows
that whoever submits can also write to the site root, and the worst a leak
allows is a request to re-crawl pages that are already public. To rotate it,
generate a new hex string, write it to both files, deploy, then resubmit.

### Analytics

Vercel Web Analytics and Speed Insights are wired up and on by default, under
**Integrations** in the control panel. They were chosen over Google Analytics
deliberately: they are **cookieless and first-party**, so the site needs no
consent banner — which matters because the privacy policy claims GDPR
compliance. GA4 would set cookies and oblige us to add one. The GA field is
still there if it is ever wanted; it is empty and therefore inert.

> **One manual step:** the scripts only resolve once analytics is switched on
> for the project. In the Vercel dashboard go to **Analytics** in the sidebar,
> select the project, and press **Enable** — then do the same under **Speed
> Insights**. Until then the two script requests 404 harmlessly and nothing
> is recorded.

If the dashboard shows a project-specific script path rather than the standard
`/_vercel/insights/script.js`, paste it into **Analytics Script Path** in the
same panel.

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
│   ├── hero-scene.js            # Home hero: self-assembling structural frame
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
