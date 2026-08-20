// --- THREE.JS SCENES AND 3D LOGIC ---

(function bootstrapScenes() {
  // Wait for the content engine so the hero reads the published theme colours
  // rather than the stylesheet defaults. Falls back cleanly if it is absent.
  const start = () => {
    const ready = window.TWContent && window.TWContent.ready;
    const run = () => { initHeroScene(); initBimViewerScene(); };
    if (ready && typeof ready.then === 'function') ready.then(run, run);
    else run();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();

// ==========================================
// 1. HERO CANVASES - WIREFRAME BUILDING & BLUEPRINT GRID
// ==========================================
// The hero scene now lives in js/hero-scene.js. It was rewritten as a
// self-assembling moment frame with theme-aware colours, reduced-motion
// support, and off-screen pausing.

// ==========================================
// 2. BIM SKELETON PORTAL VIEW - RAYCASTING METADATA
// ==========================================
function initBimViewerScene() {
  const canvas = document.getElementById('bim-canvas');
  if (!canvas) return;

  const container = canvas.parentElement;
  let width = container.clientWidth;
  let height = container.clientHeight;

  // Scene, Camera, Renderer
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0c);

  const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
  camera.position.set(5, 5, 8);

  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  // Controls
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.maxPolarAngle = Math.PI / 2 + 0.1; // Don't orbit below ground
  controls.minDistance = 3;
  controls.maxDistance = 15;
  controls.target.set(0, 1.5, 0);

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);

  const dirLight1 = new THREE.DirectionalLight(0xffffff, 0.7);
  dirLight1.position.set(5, 8, 5);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0x2A6496, 0.4); // Cool steel fill light
  dirLight2.position.set(-5, 3, -5);
  scene.add(dirLight2);

  // Ground grid
  const grid = new THREE.GridHelper(10, 10, 0x2A6496, 0x1A1A2E);
  grid.position.y = 0;
  grid.material.transparent = true;
  grid.material.opacity = 0.4;
  scene.add(grid);

  // BIM Component Data Base
  const bimData = {
    'footing_1': { title: 'Footing Foundation F-1', tag: 'BIM-FTG-00F01', material: 'M25 Concrete / 16mm mesh', dimensions: '1.60m x 1.60m x 0.50m', load: '650.00 kN', shear: '10mm spacing @ 150mm', status: 'Completed ✓', statusClass: 'status-check' },
    'footing_2': { title: 'Footing Foundation F-2', tag: 'BIM-FTG-00F02', material: 'M25 Concrete / 16mm mesh', dimensions: '1.60m x 1.60m x 0.50m', load: '650.00 kN', shear: '10mm spacing @ 150mm', status: 'Completed ✓', statusClass: 'status-check' },
    'footing_3': { title: 'Footing Foundation F-3', tag: 'BIM-FTG-00F03', material: 'M25 Concrete / 16mm mesh', dimensions: '1.60m x 1.60m x 0.50m', load: '820.00 kN', shear: '12mm spacing @ 120mm', status: 'Completed ✓', statusClass: 'status-check' },
    'footing_4': { title: 'Footing Foundation F-4', tag: 'BIM-FTG-00F04', material: 'M25 Concrete / 16mm mesh', dimensions: '1.60m x 1.60m x 0.50m', load: '820.00 kN', shear: '12mm spacing @ 120mm', status: 'Completed ✓', statusClass: 'status-check' },
    'footing_5': { title: 'Footing Foundation F-5', tag: 'BIM-FTG-00F05', material: 'M25 Concrete / 16mm mesh', dimensions: '1.60m x 1.60m x 0.50m', load: '650.00 kN', shear: '10mm spacing @ 150mm', status: 'Completed ✓', statusClass: 'status-check' },
    'footing_f01': { title: 'Footing Foundation F-01', tag: 'BIM-FTG-0F01', material: 'M30 Concrete / 18mm mesh', dimensions: '1.80m x 1.80m x 0.60m', load: '900.00 kN', shear: '12mm spacing @ 100mm', status: 'Completed ✓', statusClass: 'status-check' },
    
    'column_1': { title: 'Structural Column C-10', tag: 'BIM-COL-00C10', material: 'Grade 60 Rebar / M25 Concrete', dimensions: '0.40m x 0.40m x 3.20m', load: '400.00 kN', shear: '10mm links @ 200mm c/c', status: 'Completed ✓', statusClass: 'status-check' },
    'column_2': { title: 'Structural Column C-11', tag: 'BIM-COL-00C11', material: 'Grade 60 Rebar / M25 Concrete', dimensions: '0.40m x 0.40m x 3.20m', load: '400.00 kN', shear: '10mm links @ 200mm c/c', status: 'Completed ✓', statusClass: 'status-check' },
    'column_3': { title: 'Structural Column C-12', tag: 'BIM-COL-00C12', material: 'Grade 60 Rebar / M25 Concrete', dimensions: '0.45m x 0.45m x 3.20m', load: '450.00 kN', shear: '10mm links @ 150mm c/c', status: 'Completed ✓', statusClass: 'status-check' },
    'column_4': { title: 'Structural Column C-13', tag: 'BIM-COL-00C13', material: 'Grade 60 Rebar / M25 Concrete', dimensions: '0.45m x 0.45m x 3.20m', load: '450.00 kN', shear: '10mm links @ 150mm c/c', status: 'Completed ✓', statusClass: 'status-check' },
    'column_5': { title: 'Structural Column C-14', tag: 'BIM-COL-00C14', material: 'Grade 60 Rebar / M25 Concrete', dimensions: '0.40m x 0.40m x 3.20m', load: '400.00 kN', shear: '10mm links @ 200mm c/c', status: 'Completed ✓', statusClass: 'status-check' },
    'column_c05': { title: 'Structural Column C-05', tag: 'BIM-COL-00C05', material: 'Grade 60 Rebar / M30 Concrete', dimensions: '0.50m x 0.50m x 3.20m', load: '550.00 kN', shear: '12mm links @ 120mm c/c', status: 'Completed ✓', statusClass: 'status-check' },
    
    'beam_1': { title: 'Structural Tie Beam TB-01', tag: 'BIM-BEAM-0TB01', material: 'Fe500 Rebar / M30 Concrete', dimensions: '0.30m x 0.50m x 4.00m', load: '120.00 kN/m', shear: '10mm rings @ 150mm', status: 'Completed ✓', statusClass: 'status-check' },
    'beam_2': { title: 'Structural Tie Beam TB-02', tag: 'BIM-BEAM-0TB02', material: 'Fe500 Rebar / M30 Concrete', dimensions: '0.30m x 0.50m x 4.00m', load: '120.00 kN/m', shear: '10mm rings @ 150mm', status: 'Completed ✓', statusClass: 'status-check' },
    'beam_3': { title: 'Structural Tie Beam TB-03', tag: 'BIM-BEAM-0TB03', material: 'Fe500 Rebar / M30 Concrete', dimensions: '0.30m x 0.50m x 4.00m', load: '150.00 kN/m', shear: '12mm rings @ 120mm', status: 'Completed ✓', statusClass: 'status-check' },
    'beam_4': { title: 'Structural Tie Beam TB-04', tag: 'BIM-BEAM-0TB04', material: 'Fe500 Rebar / M30 Concrete', dimensions: '0.30m x 0.50m x 4.00m', load: '150.00 kN/m', shear: '12mm rings @ 120mm', status: 'Completed ✓', statusClass: 'status-check' },
    'beam_5': { title: 'Structural Tie Beam TB-05', tag: 'BIM-BEAM-0TB05', material: 'Fe500 Rebar / M30 Concrete', dimensions: '0.30m x 0.50m x 4.00m', load: '120.00 kN/m', shear: '10mm rings @ 150mm', status: 'Completed ✓', statusClass: 'status-check' },
    'beam_b07': { title: 'Structural Beam B-07', tag: 'BIM-BEAM-0B07', material: 'Fe500 Rebar / M30 Concrete', dimensions: '0.35m x 0.60m x 4.00m', load: '180.00 kN/m', shear: '12mm rings @ 100mm', status: 'In Progress ⚠', statusClass: 'status-warning' },
    'beam_6': { title: 'Structural Tie Beam TB-06', tag: 'BIM-BEAM-0TB06', material: 'Fe500 Rebar / M30 Concrete', dimensions: '0.30m x 0.50m x 4.00m', load: '120.00 kN/m', shear: '10mm rings @ 150mm', status: 'Completed ✓', statusClass: 'status-check' },
    
    'slab_1': { title: 'Roof Slab Slab-S1', tag: 'BIM-SLB-000S1', material: 'Fe500 Mesh / M20 Concrete', dimensions: '4.30m x 4.30m x 0.15m', load: '5.50 kN/m²', shear: 'None (Bending Governed)', status: 'In Progress ⚠', statusClass: 'status-warning' },
    'slab_s03': { title: 'Roof Slab Slab-S3', tag: 'BIM-SLB-000S3', material: 'Fe500 Mesh / M25 Concrete', dimensions: '4.30m x 4.30m x 0.16m', load: '6.00 kN/m²', shear: 'None (Bending Governed)', status: 'Pending ◔', statusClass: 'status-warning' }
  };

  // Build the 3D Skeleton Model group
  const bimGroup = new THREE.Group();
  scene.add(bimGroup);

  const selectableObjects = [];

  // Theme Materials
  const concreteMaterial = new THREE.MeshStandardMaterial({
    color: 0x2A3b4C, // Dark slate blue
    roughness: 0.7,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85
  });

  const wireframeGoldMat = new THREE.LineBasicMaterial({
    color: 0x555555,
    transparent: true,
    opacity: 0.25
  });

  const selectMaterial = new THREE.MeshStandardMaterial({
    color: 0xC9A84C, // Metallic Gold
    roughness: 0.3,
    metalness: 0.8,
    emissive: 0xC9A84C,
    emissiveIntensity: 0.25
  });

  const hoverMaterial = new THREE.MeshStandardMaterial({
    color: 0x3E8EDE, // Glowing blue
    roughness: 0.5,
    metalness: 0.3,
    emissive: 0x2A6496,
    emissiveIntensity: 0.15
  });

  // Helper function to build component with outline
  function addBimComponent(id, geometry, x, y, z) {
    const mesh = new THREE.Mesh(geometry, concreteMaterial.clone());
    mesh.position.set(x, y, z);
    mesh.userData = { id: id, selected: false, baseMaterial: mesh.material };
    
    // Add thin wireframe wrapper overlay
    const wireGeom = new THREE.WireframeGeometry(geometry);
    const wireline = new THREE.LineSegments(wireGeom, wireframeGoldMat.clone());
    mesh.add(wireline);
    
    bimGroup.add(mesh);
    selectableObjects.push(mesh);
  }

  // A. Create Footings (Foundation base)
  const footingGeom = new THREE.BoxGeometry(1.6, 0.5, 1.6);
  addBimComponent('footing_1', footingGeom, -2, 0.25, -2);
  addBimComponent('footing_2', footingGeom, 2, 0.25, -2);
  addBimComponent('footing_3', footingGeom, -2, 0.25, 2);
  addBimComponent('footing_4', footingGeom, 2, 0.25, 2);
  // Second bay footing elements
  addBimComponent('footing_5', footingGeom, 6, 0.25, -2);
  addBimComponent('footing_f01', footingGeom, 6, 0.25, 2);

  // B. Create Columns
  const colGeom1 = new THREE.BoxGeometry(0.4, 3.2, 0.4);
  const colGeom2 = new THREE.BoxGeometry(0.45, 3.2, 0.45);
  addBimComponent('column_1', colGeom1, -2, 2.1, -2);
  addBimComponent('column_2', colGeom1, 2, 2.1, -2);
  addBimComponent('column_3', colGeom2, -2, 2.1, 2);
  addBimComponent('column_4', colGeom2, 2, 2.1, 2);
  // Second bay column elements
  addBimComponent('column_5', colGeom1, 6, 2.1, -2);
  addBimComponent('column_c05', colGeom2, 6, 2.1, 2);

  // C. Create Tie Beams
  const beamXGeom = new THREE.BoxGeometry(3.6, 0.5, 0.3);
  const beamZGeom = new THREE.BoxGeometry(0.3, 0.5, 3.6);
  // Beams connecting tops of columns (y = 3.45)
  addBimComponent('beam_1', beamXGeom, 0, 3.45, -2);
  addBimComponent('beam_2', beamXGeom, 0, 3.45, 2);
  addBimComponent('beam_3', beamZGeom, -2, 3.45, 0);
  addBimComponent('beam_4', beamZGeom, 2, 3.45, 0);
  // Second bay beam elements
  addBimComponent('beam_5', beamXGeom, 4, 3.45, -2);
  addBimComponent('beam_b07', beamXGeom, 4, 3.45, 2);
  addBimComponent('beam_6', beamZGeom, 6, 3.45, 0);

  // D. Create Slab
  const slabGeom = new THREE.BoxGeometry(4.3, 0.15, 4.3);
  addBimComponent('slab_1', slabGeom, 0, 3.775, 0);
  addBimComponent('slab_s03', slabGeom, 4, 3.775, 0);

  // Adjust model vertical alignment and offset X to center the expanded layout
  bimGroup.position.set(-2, -0.5, 0);

  // RAYCASTING INTERACTIONS
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  let hoveredObject = null;
  let selectedObject = null;

  // Sidebar updates DOM helper
  const sidebarTitle = document.getElementById('bim-element-title');
  const sidebarTag = document.getElementById('bim-element-tag');
  const sidebarMaterial = document.getElementById('bim-material');
  const sidebarDims = document.getElementById('bim-dimensions');
  const sidebarLoad = document.getElementById('bim-load');
  const sidebarShear = document.getElementById('bim-shear');
  const sidebarStatus = document.getElementById('bim-status');

  function updateSidebar(elementId) {
    const data = bimData[elementId];
    if (!data) return;

    sidebarTitle.textContent = data.title;
    sidebarTag.textContent = `TAG: ${data.tag}`;
    sidebarMaterial.textContent = data.material;
    sidebarDims.textContent = data.dimensions;
    sidebarLoad.textContent = data.load;
    sidebarShear.textContent = data.shear;
    
    // Set status
    sidebarStatus.textContent = data.status;
    sidebarStatus.className = 'bim-val';
    sidebarStatus.classList.add(data.statusClass);
  }

  // Initialize display with Column C-12 (column_3)
  updateSidebar('column_3');
  setTimeout(() => {
    // Select column_3 in 3D by default
    const defaultCol = selectableObjects.find(obj => obj.userData.id === 'column_3');
    if (defaultCol) {
      defaultCol.material = selectMaterial;
      defaultCol.userData.selected = true;
      selectedObject = defaultCol;
    }
  }, 100);

  // Interaction Handlers
  function onMouseMove(event) {
    // Calculate mouse position in normalized device coordinates
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function onClick(event) {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(selectableObjects);

    if (intersects.length > 0) {
      const clicked = intersects[0].object;

      // Reset previous selected
      if (selectedObject) {
        selectedObject.material = concreteMaterial.clone();
        selectedObject.userData.selected = false;
      }

      // Select new
      selectedObject = clicked;
      selectedObject.material = selectMaterial;
      selectedObject.userData.selected = true;

      // Update UI Panel
      updateSidebar(selectedObject.userData.id);
    }
  }

  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('click', onClick);

  // CONTROLS INTERACTIVE TOGGLES
  const btn3D = document.getElementById('btn-view-3d');
  const btnPlan = document.getElementById('btn-view-plan');
  const btnSection = document.getElementById('btn-view-section');
  const btnData = document.getElementById('btn-view-data');

  function resetControlButtons() {
    [btn3D, btnPlan, btnSection, btnData].forEach(btn => {
      if (btn) btn.classList.remove('active');
    });
  }

  if (btn3D) {
    btn3D.addEventListener('click', () => {
      resetControlButtons();
      btn3D.classList.add('active');
      
      // Smooth camera transition to Isometric View
      animateCamera(5, 5, 8, 0, 1.5, 0);
    });
  }

  if (btnPlan) {
    btnPlan.addEventListener('click', () => {
      resetControlButtons();
      btnPlan.classList.add('active');
      
      // Top-down camera view (Floor Plan)
      animateCamera(0, 10, 0.01, 0, 1.5, 0);
    });
  }

  if (btnSection) {
    btnSection.addEventListener('click', () => {
      resetControlButtons();
      btnSection.classList.add('active');
      
      // Cut-out front/section view
      animateCamera(9, 1.5, 0, 0, 1.5, 0);
    });
  }

  if (btnData) {
    btnData.addEventListener('click', () => {
      resetControlButtons();
      if (btn3D) btn3D.classList.add('active');
      
      // Deselect model highlights & reset camera angle
      if (selectedObject) {
        selectedObject.material = concreteMaterial.clone();
        selectedObject.userData.selected = false;
        selectedObject = null;
      }
      // Select column_3 as default
      const defaultCol = selectableObjects.find(obj => obj.userData.id === 'column_3');
      if (defaultCol) {
        defaultCol.material = selectMaterial;
        defaultCol.userData.selected = true;
        selectedObject = defaultCol;
      }
      updateSidebar('column_3');
      animateCamera(5, 5, 8, 0, 1.5, 0);
    });
  }

  // Camera animation helper
  function animateCamera(px, py, pz, tx, ty, tz) {
    const duration = 1000; // 1 second
    const startTime = performance.now();
    const startPos = camera.position.clone();
    const startTarget = controls.target.clone();

    function transition(time) {
      const now = performance.now();
      const progress = Math.min((now - startTime) / duration, 1);
      // Easing curve (easeOutCubic)
      const ease = 1 - Math.pow(1 - progress, 3);

      camera.position.x = startPos.x + (px - startPos.x) * ease;
      camera.position.y = startPos.y + (py - startPos.y) * ease;
      camera.position.z = startPos.z + (pz - startPos.z) * ease;

      controls.target.x = startTarget.x + (tx - startTarget.x) * ease;
      controls.target.y = startTarget.y + (ty - startTarget.y) * ease;
      controls.target.z = startTarget.z + (tz - startTarget.z) * ease;

      controls.update();

      if (progress < 1) {
        requestAnimationFrame(transition);
      }
    }
    requestAnimationFrame(transition);
  }

  // Animation render loop
  function animate() {
    requestAnimationFrame(animate);

    // Raycaster hover check
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(selectableObjects);

    if (intersects.length > 0) {
      const obj = intersects[0].object;
      if (obj !== selectedObject) {
        if (hoveredObject && hoveredObject !== selectedObject) {
          hoveredObject.material = concreteMaterial.clone();
        }
        hoveredObject = obj;
        hoveredObject.material = hoverMaterial;
      }
    } else {
      if (hoveredObject && hoveredObject !== selectedObject) {
        hoveredObject.material = concreteMaterial.clone();
      }
      hoveredObject = null;
    }

    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  // Resize Handler
  window.addEventListener('resize', () => {
    width = container.clientWidth;
    height = container.clientHeight;

    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    renderer.setSize(width, height);
  });
}
