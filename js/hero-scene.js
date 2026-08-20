/* ==========================================================================
   TwinAnalytic — Hero scene
   --------------------------------------------------------------------------
   A reinforced-concrete moment frame that assembles itself storey by storey,
   then settles into a slow orbit with a little pointer parallax.

   Why a rectangular frame rather than the twisted helix this replaces: the
   helix read as generic sci-fi. A column-and-beam grid is what this practice
   actually designs, and it echoes the tower inside the TA mark.

   Behaviour it is careful about:
   - Colours are read from the live CSS custom properties, so changing the
     palette in the control panel restyles the hero too.
   - Honours prefers-reduced-motion by drawing one static frame and stopping.
   - Stops rendering entirely while scrolled out of view, so it is not burning
     a GPU loop for the whole visit.
   - Positions itself from the viewport aspect so it never sits under the
     headline on narrow screens.
   ========================================================================== */

function initHeroScene() {
  var canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;

  var container = canvas.parentElement;
  var width = container.clientWidth;
  var height = container.clientHeight;
  if (!width || !height) return;

  var reduceMotion = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- palette, taken from the live theme --------------------------------
  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return new THREE.Color(fallback);
    try { return new THREE.Color(v); } catch (e) { return new THREE.Color(fallback); }
  }

  var GOLD = cssColor('--color-gold', '#C9A84C');
  var GOLD_LIGHT = cssColor('--color-gold-light', '#E8C97E');
  var STEEL = cssColor('--color-steel', '#B7B6B6');
  var BG = cssColor('--bg-primary', '#0A0A0A');

  // ---- scene -------------------------------------------------------------
  var scene = new THREE.Scene();
  scene.background = BG.clone();
  scene.fog = new THREE.FogExp2(BG.getHex(), 0.035);

  var camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 120);
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  var frame = new THREE.Group();
  scene.add(frame);

  // ---- geometry: a 3-bay by 2-bay moment frame ---------------------------
  var STOREYS = 8;
  var STOREY_H = 1.0;
  var BAY_X = 1.5;
  var BAY_Z = 1.5;
  var COLS_X = 4;   // grid lines, so 3 bays
  var COLS_Z = 3;   // 2 bays

  var halfX = (COLS_X - 1) * BAY_X / 2;
  var halfZ = (COLS_Z - 1) * BAY_Z / 2;

  // One group per storey so the build sequence can reveal them in order.
  var storeys = [];

  // Every material records the opacity it should settle at. A material is
  // shared by many lines, so the build sequence must scale from this stored
  // value — reading back the live opacity would compound once per line and
  // fade the whole frame to nothing.
  function lineMat(color, opacity) {
    var m = new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: opacity });
    m.userData.baseOpacity = opacity;
    return m;
  }

  function segment(a, b, material, group) {
    var g = new THREE.BufferGeometry().setFromPoints([a, b]);
    group.add(new THREE.Line(g, material));
  }

  for (var s = 0; s < STOREYS; s++) {
    var g = new THREE.Group();
    var y0 = s * STOREY_H;
    var y1 = y0 + STOREY_H;

    // Columns rise steel-coloured; they are the vertical load path.
    var colMat = lineMat(STEEL, 0.50 - s * 0.028);
    for (var ix = 0; ix < COLS_X; ix++) {
      for (var iz = 0; iz < COLS_Z; iz++) {
        var x = -halfX + ix * BAY_X;
        var z = -halfZ + iz * BAY_Z;
        segment(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z), colMat, g);
      }
    }

    // Beams at the top of each storey, in the accent colour.
    var beamMat = lineMat(s === STOREYS - 1 ? GOLD_LIGHT : GOLD, 0.60 - s * 0.032);
    for (var iz2 = 0; iz2 < COLS_Z; iz2++) {
      var zz = -halfZ + iz2 * BAY_Z;
      segment(new THREE.Vector3(-halfX, y1, zz), new THREE.Vector3(halfX, y1, zz), beamMat, g);
    }
    for (var ix2 = 0; ix2 < COLS_X; ix2++) {
      var xx = -halfX + ix2 * BAY_X;
      segment(new THREE.Vector3(xx, y1, -halfZ), new THREE.Vector3(xx, y1, halfZ), beamMat, g);
    }

    // A single braced bay, the way a real frame resists lateral load.
    if (s % 3 === 1) {
      var braceMat = lineMat(GOLD_LIGHT, 0.34);
      segment(new THREE.Vector3(-halfX, y0, -halfZ),
              new THREE.Vector3(-halfX + BAY_X, y1, -halfZ), braceMat, g);
      segment(new THREE.Vector3(halfX, y0, halfZ),
              new THREE.Vector3(halfX - BAY_X, y1, halfZ), braceMat, g);
    }

    frame.add(g);
    storeys.push(g);
  }

  // Foundation pad, reading as the raft the frame sits on.
  var padMat = lineMat(STEEL, 0.26);
  var pad = new THREE.Group();
  for (var k = -1; k <= 1; k += 2) {
    segment(new THREE.Vector3(-halfX - 0.6, 0, k * (halfZ + 0.6)),
            new THREE.Vector3(halfX + 0.6, 0, k * (halfZ + 0.6)), padMat, pad);
    segment(new THREE.Vector3(k * (halfX + 0.6), 0, -halfZ - 0.6),
            new THREE.Vector3(k * (halfX + 0.6), 0, halfZ + 0.6), padMat, pad);
  }
  frame.add(pad);

  // Blueprint ground grid.
  var grid = new THREE.GridHelper(40, 40, GOLD.getHex(), 0x161A22);
  grid.material.transparent = true;
  grid.material.opacity = 0.14;
  frame.add(grid);

  // ---- composition -------------------------------------------------------
  // On a wide screen the frame sits right of the headline. As the viewport
  // narrows it slides back to centre and shrinks, so it never sits under text.
  var lookX = 0;
  // On a phone the frame has nowhere to go but behind the copy, so it drops
  // below the fold of the text and dims to stay clearly secondary.
  var opacityScale = 1;

  function layout() {
    var aspect = width / height;
    var wide = aspect > 1.35;
    var mid = aspect > 0.95;
    var offsetX = wide ? 5.7 : (mid ? 2.6 : 0);
    var scale = wide ? 1 : (mid ? 0.8 : 0.5);
    var baseY = wide ? -4.0 : (mid ? -4.4 : -6.4);
    opacityScale = wide ? 1 : (mid ? 0.8 : 0.45);
    lookX = wide ? 1.6 : offsetX * 0.5;
    frame.position.set(offsetX, baseY, 0);
    frame.scale.setScalar(scale);
    camera.position.set(0, 4.2, 17);
    camera.lookAt(lookX, 1.0, 0);
  }
  layout();

  // ---- build sequence ----------------------------------------------------
  // Each storey rises into place slightly after the one below it.
  var BUILD_PER_STOREY = 0.13;
  var BUILD_DURATION = 0.55;

  // Collect each storey's distinct materials once, so the build loop touches
  // every material exactly one time per frame.
  storeys.forEach(function (g) {
    var mats = [];
    g.traverse(function (o) {
      if (o.material && mats.indexOf(o.material) === -1) mats.push(o.material);
    });
    g.userData.materials = mats;
  });

  function applyBuild(t) {
    for (var i = 0; i < storeys.length; i++) {
      var local = (t - i * BUILD_PER_STOREY) / BUILD_DURATION;
      var p = Math.max(0, Math.min(1, local));
      var eased = 1 - Math.pow(1 - p, 3);          // easeOutCubic
      storeys[i].position.y = (1 - eased) * -1.4;
      storeys[i].visible = p > 0;
      var mats = storeys[i].userData.materials;
      for (var m = 0; m < mats.length; m++) {
        mats[m].opacity = mats[m].userData.baseOpacity * eased * opacityScale;
      }
    }
  }

  var buildTotal = STOREYS * BUILD_PER_STOREY + BUILD_DURATION;

  // ---- pointer parallax --------------------------------------------------
  var pointer = { x: 0, y: 0 };
  var target = { x: 0, y: 0 };
  if (!reduceMotion) {
    window.addEventListener('pointermove', function (e) {
      target.x = (e.clientX / window.innerWidth - 0.5) * 2;
      target.y = (e.clientY / window.innerHeight - 0.5) * 2;
    }, { passive: true });
  }

  // ---- loop --------------------------------------------------------------
  var clock = new THREE.Clock();
  var running = false;
  var rafId = null;

  function render() {
    renderer.render(scene, camera);
  }

  function tick() {
    rafId = requestAnimationFrame(tick);
    var t = clock.getElapsedTime();

    applyBuild(Math.min(t, buildTotal));

    // A slow orbit — fast enough to read as three-dimensional, slow enough
    // not to pull attention away from the headline.
    frame.rotation.y = 0.35 + t * 0.045;

    // Ease toward the pointer rather than tracking it exactly.
    pointer.x += (target.x - pointer.x) * 0.04;
    pointer.y += (target.y - pointer.y) * 0.04;
    camera.position.x = pointer.x * 0.9;
    camera.position.y = 4.2 - pointer.y * 0.5;
    camera.lookAt(lookX, 1.0, 0);

    render();
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    clock.start();
    tick();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (reduceMotion) {
    // Show the finished structure, no motion at all.
    applyBuild(buildTotal);
    frame.rotation.y = 0.35;
    render();
  } else {
    // Only run while the hero is actually on screen.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.01 }).observe(container);
    } else {
      start();
    }
  }

  // ---- resize ------------------------------------------------------------
  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      width = container.clientWidth;
      height = container.clientHeight;
      if (!width || !height) return;
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      layout();
      if (!running) render();
    }, 150);
  });
}
