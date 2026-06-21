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
├── admin.html                   # Admin Dashboard for lead and log tracking
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
├── css/
│   └── style.css                # Global stylesheet containing core design system
├── js/
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
