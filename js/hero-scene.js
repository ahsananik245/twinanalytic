/* ==========================================================================
   TwinAnalytic — Hero scene
   --------------------------------------------------------------------------
   A structural drawing that becomes the building it describes.

   The sequence runs in four phases:

     1. PLAN   The camera looks straight down and the frame lies flat, so what
               you see is a column grid with its setting-out lines — an actual
               structural plan. It plots on in order, the way a drawing gets
               drawn, rather than fading in as a lump.
     2. LIFT   The camera arcs down to a three-quarter view while the storeys
               inflate and stack upward, bottom first.
     3. SCAN   An analysis wavefront sweeps the finished frame from footing to
               roof. Members light along their length as it crosses them and
               the joints ignite — the model being solved, not decoration.
     4. REST   Still, with pointer parallax. The scan re-runs on a long cycle
               rather than shimmering continuously: motion should perform,
               then stop, not breathe.

   Care taken:
   - Colours come from the live CSS custom properties, so the control panel's
     palette drives the hero too.
   - prefers-reduced-motion skips to the finished frame and renders once.
   - Rendering stops while the hero is scrolled out of view, and the sequence
     does not begin until the hero is actually on screen.
   - Composition follows the viewport aspect so the frame never sits under the
     headline on a narrow screen.
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

  // ---- palette from the live theme ---------------------------------------
  function cssColor(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    if (!v) return new THREE.Color(fallback);
    try { return new THREE.Color(v); } catch (e) { return new THREE.Color(fallback); }
  }

  var GOLD = cssColor('--color-gold', '#C9A84C');
  var GOLD_LIGHT = cssColor('--color-gold-light', '#E8C97E');
  var STEEL = cssColor('--color-steel', '#B7B6B6');
  var BG = cssColor('--bg-primary', '#131313');

  // ---- scene -------------------------------------------------------------
  var scene = new THREE.Scene();
  scene.background = BG.clone();
  scene.fog = new THREE.FogExp2(BG.getHex(), 0.030);

  var camera = new THREE.PerspectiveCamera(52, width / height, 0.1, 160);
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
  var COLS_X = 4;
  var COLS_Z = 3;

  var halfX = (COLS_X - 1) * BAY_X / 2;
  var halfZ = (COLS_Z - 1) * BAY_Z / 2;

  var storeys = [];

  // Lines use a shader rather than LineBasicMaterial so the analysis scan can
  // be evaluated per fragment: a member lights along its length as the
  // wavefront crosses it, instead of a whole storey switching at once.
  var SCAN_VERT = `
    varying vec3 vWorld;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorld = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `;

  var SCAN_FRAG = `
    uniform vec3 uColor;
    uniform vec3 uHot;
    uniform float uOpacity;
    uniform float uScanY;
    uniform float uScanOn;
    varying vec3 vWorld;
    void main() {
      float d = vWorld.y - uScanY;
      // A bright band riding the wavefront, with a short trail behind it.
      float rim = exp(-pow(d / 0.45, 2.0));
      float trail = smoothstep(0.0, -2.6, d);
      float lit = mix(1.0, trail + rim, uScanOn);
      vec3 col = mix(uColor, uHot, clamp(rim * 1.5 * uScanOn, 0.0, 1.0));
      float a = uOpacity * clamp(lit + rim * 1.8 * uScanOn, 0.0, 1.6);
      if (a < 0.004) discard;
      gl_FragColor = vec4(col, a);
    }
  `;

  var scanMaterials = [];

  // A material records the opacity it should settle at. Materials are shared
  // between many lines, so the build must scale from this stored value —
  // reading the live value back would compound once per line and fade the
  // whole frame to nothing within a second.
  function lineMat(color, opacity) {
    var m = new THREE.ShaderMaterial({
      vertexShader: SCAN_VERT,
      fragmentShader: SCAN_FRAG,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uColor: { value: color.clone() },
        uHot: { value: new THREE.Color('#FFF3D0') },
        uOpacity: { value: opacity },
        uScanY: { value: -999 },
        uScanOn: { value: 0 }
      }
    });
    m.userData.baseOpacity = opacity;
    scanMaterials.push(m);
    return m;
  }

  function setScan(y, on) {
    for (var i = 0; i < scanMaterials.length; i++) {
      scanMaterials[i].uniforms.uScanY.value = y;
      scanMaterials[i].uniforms.uScanOn.value = on;
    }
  }

  function segment(a, b, material, group) {
    var g = new THREE.BufferGeometry().setFromPoints([a, b]);
    group.add(new THREE.Line(g, material));
  }

  for (var s = 0; s < STOREYS; s++) {
    var g = new THREE.Group();
    var y0 = s * STOREY_H;
    var y1 = y0 + STOREY_H;

    // Columns — the vertical load path — in steel.
    var colMat = lineMat(STEEL, 0.50 - s * 0.028);
    for (var ix = 0; ix < COLS_X; ix++) {
      for (var iz = 0; iz < COLS_Z; iz++) {
        var x = -halfX + ix * BAY_X;
        var z = -halfZ + iz * BAY_Z;
        segment(new THREE.Vector3(x, y0, z), new THREE.Vector3(x, y1, z), colMat, g);
      }
    }

    // Beams at each storey head, in the accent.
    var beamMat = lineMat(s === STOREYS - 1 ? GOLD_LIGHT : GOLD, 0.60 - s * 0.032);
    for (var iz2 = 0; iz2 < COLS_Z; iz2++) {
      var zz = -halfZ + iz2 * BAY_Z;
      segment(new THREE.Vector3(-halfX, y1, zz), new THREE.Vector3(halfX, y1, zz), beamMat, g);
    }
    for (var ix2 = 0; ix2 < COLS_X; ix2++) {
      var xx = -halfX + ix2 * BAY_X;
      segment(new THREE.Vector3(xx, y1, -halfZ), new THREE.Vector3(xx, y1, halfZ), beamMat, g);
    }

    // A braced bay every third storey, the way a real frame takes lateral load.
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

  // Foundation outline — drawn early, and the one thing that never moves.
  var padMat = lineMat(STEEL, 0.26);
  var pad = new THREE.Group();
  for (var k = -1; k <= 1; k += 2) {
    segment(new THREE.Vector3(-halfX - 0.6, 0, k * (halfZ + 0.6)),
            new THREE.Vector3(halfX + 0.6, 0, k * (halfZ + 0.6)), padMat, pad);
    segment(new THREE.Vector3(k * (halfX + 0.6), 0, -halfZ - 0.6),
            new THREE.Vector3(k * (halfX + 0.6), 0, halfZ + 0.6), padMat, pad);
  }
  frame.add(pad);

  // Setting-out grid: the drawing's own gridlines, running past the structure
  // the way they do on a real plan.
  var gridMat = lineMat(STEEL, 0.16);
  var setout = new THREE.Group();
  for (var gx = 0; gx < COLS_X; gx++) {
    var px = -halfX + gx * BAY_X;
    segment(new THREE.Vector3(px, 0, -halfZ - 1.8), new THREE.Vector3(px, 0, halfZ + 1.8), gridMat, setout);
  }
  for (var gz = 0; gz < COLS_Z; gz++) {
    var pz = -halfZ + gz * BAY_Z;
    segment(new THREE.Vector3(-halfX - 1.8, 0, pz), new THREE.Vector3(halfX + 1.8, 0, pz), gridMat, setout);
  }
  frame.add(setout);

  // ---- joints ------------------------------------------------------------
  // A point at every beam-column intersection. They ignite as the analysis
  // wavefront passes, which is what makes the frame read as a model being
  // solved rather than a picture of a building. Drawn as one additive Points
  // object, so 96 glowing nodes cost a single draw call.
  var NODE_VERT = `
    uniform float uScanY;
    uniform float uScanOn;
    uniform float uSize;
    uniform float uOpacity;
    varying float vGlow;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      float d = wp.y - uScanY;
      float rim = exp(-pow(d / 0.5, 2.0));
      float settled = smoothstep(0.0, -1.8, d);
      vGlow = (settled * 0.35 + rim * 1.0) * uScanOn * uOpacity;
      vec4 mv = viewMatrix * wp;
      gl_PointSize = uSize * (1.0 + rim * 2.2) * (14.0 / -mv.z);
      gl_Position = projectionMatrix * mv;
    }
  `;

  var NODE_FRAG = `
    uniform vec3 uColor;
    varying float vGlow;
    void main() {
      // Round, soft-edged sprite. Square points read as pixels, not nodes.
      float r = length(gl_PointCoord - vec2(0.5));
      if (r > 0.5) discard;
      float falloff = pow(1.0 - r * 2.0, 2.0);
      gl_FragColor = vec4(uColor, falloff * vGlow);
    }
  `;

  var nodePositions = [];
  for (var ns = 0; ns < STOREYS; ns++) {
    for (var nx = 0; nx < COLS_X; nx++) {
      for (var nz = 0; nz < COLS_Z; nz++) {
        nodePositions.push(-halfX + nx * BAY_X, (ns + 1) * STOREY_H, -halfZ + nz * BAY_Z);
      }
    }
  }
  var nodeGeom = new THREE.BufferGeometry();
  nodeGeom.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
  var nodeMat = new THREE.ShaderMaterial({
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uColor: { value: new THREE.Color('#FFE9B0') },
      uScanY: { value: -999 },
      uScanOn: { value: 0 },
      uSize: { value: 2.6 },
      uOpacity: { value: 1 }
    }
  });
  var nodes = new THREE.Points(nodeGeom, nodeMat);
  frame.add(nodes);

  // Collect each group's distinct materials once, so the animation touches
  // every material exactly once per frame.
  function collect(group) {
    var mats = [];
    group.traverse(function (o) {
      if (o.material && mats.indexOf(o.material) === -1) mats.push(o.material);
    });
    group.userData.materials = mats;
  }
  storeys.forEach(collect);
  collect(pad);
  collect(setout);

  // ---- composition -------------------------------------------------------
  var lookX = 0, restY = 4.2, restZ = 17, opacityScale = 1;

  function layout() {
    var aspect = width / height;
    var wide = aspect > 1.35;
    var mid = aspect > 0.95;
    var offsetX = wide ? 5.7 : (mid ? 2.6 : 0.9);
    var scale = wide ? 1 : (mid ? 0.8 : 0.72);
    var baseY = wide ? -4.0 : (mid ? -4.4 : -5.6);
    // On a phone the frame sits behind the copy, so it stays lighter.
    opacityScale = wide ? 1 : (mid ? 0.8 : 0.85);
    lookX = wide ? 1.6 : offsetX * 0.5;
    restZ = wide ? 17 : 19;
    frame.position.set(offsetX, baseY, 0);
    frame.scale.setScalar(scale);
  }
  layout();

  // ---- timeline ----------------------------------------------------------
  var T_PLAN = 1.5;     // the drawing plots on, seen from overhead
  var T_LIFT = 2.3;     // camera arcs down while the storeys rise
  var T_SCAN = 2.4;     // an analysis wavefront sweeps the finished frame
  var T_TOTAL = T_PLAN + T_LIFT + T_SCAN;

  // The frame spans y = 0 to STOREYS * STOREY_H in local space; the scan runs
  // from just below the pad to just past the roof so nothing is missed.
  var SCAN_FROM = -1.2;
  var SCAN_TO = STOREYS * STOREY_H + 1.2;

  // After the intro the analysis re-runs on a long cycle. Motion has to
  // perform rather than idle, so this is a deliberate periodic beat with a
  // long quiet gap, not a permanent shimmer.
  var RESCAN_EVERY = 16;   // seconds between passes
  var RESCAN_LEN = 2.4;    // how long a pass takes

  function easeOutCubic(p) { return 1 - Math.pow(1 - p, 3); }
  function easeInOutCubic(p) {
    return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
  }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstepLocal(a, b, v) {
    var t = clamp01((v - a) / (b - a));
    return t * t * (3 - 2 * t);
  }

  function setGroupOpacity(group, factor) {
    var mats = group.userData.materials;
    for (var i = 0; i < mats.length; i++) {
      mats[i].uniforms.uOpacity.value =
        mats[i].userData.baseOpacity * factor * opacityScale;
    }
  }

  // Phase 1 — the drawing plots on: setting-out grid, then the foundation,
  // then the ground-floor column grid, all still flat on the ground plane.
  function applyPlan(t) {
    var p = clamp01(t / T_PLAN);
    setGroupOpacity(setout, clamp01(p / 0.30));
    setGroupOpacity(pad, clamp01((p - 0.20) / 0.30));

    for (var i = 0; i < storeys.length; i++) {
      var vis = i === 0 ? clamp01((p - 0.45) / 0.45) : 0;
      storeys[i].visible = vis > 0;
      storeys[i].position.y = 0;
      storeys[i].scale.y = 0.0001;        // flattened onto the plane
      setGroupOpacity(storeys[i], vis);
    }
  }

  // Phase 2 — the storeys inflate to full height and stack upward, bottom
  // first, while the camera arcs from overhead to the resting view.
  function applyLift(t) {
    var p = clamp01((t - T_PLAN) / T_LIFT);
    setGroupOpacity(setout, 1);
    setGroupOpacity(pad, 1);

    for (var i = 0; i < storeys.length; i++) {
      var e = easeOutCubic(clamp01((p - i * 0.072) / 0.40));
      storeys[i].visible = e > 0;
      storeys[i].scale.y = Math.max(0.0001, e);
      // Slides up onto the storey below as it inflates.
      storeys[i].position.y = (1 - e) * -(i * STOREY_H) * 0.5;
      setGroupOpacity(storeys[i], e);
    }
  }

  function settle() {
    setGroupOpacity(setout, 1);
    setGroupOpacity(pad, 1);
    for (var i = 0; i < storeys.length; i++) {
      storeys[i].visible = true;
      storeys[i].scale.y = 1;
      storeys[i].position.y = 0;
      setGroupOpacity(storeys[i], 1);
    }
  }

  // Camera path. Both the eye and the look-at target are interpolated, so the
  // move reads as one continuous arc from directly over the drawing to the
  // resting three-quarter view — not a pan that happens to end up there.
  //
  // The plan view sits directly above the frame rather than above the origin;
  // otherwise the drawing is seen obliquely and off to one side, which is
  // exactly what it must not look like.
  var PLAN_FOV = 28, REST_FOV = 52;
  var eye = new THREE.Vector3();
  var aim = new THREE.Vector3();

  // The view axis sits left of the frame so the drawing reads to the right of
  // the headline rather than underneath it, exactly as the finished frame does.
  var PLAN_SHIFT = 3.6;

  function planEye(out) {
    return out.set(frame.position.x - PLAN_SHIFT, frame.position.y + 22, 0.4);
  }
  function planAim(out) {
    return out.set(frame.position.x - PLAN_SHIFT, frame.position.y, 0);
  }
  function restEye(out) {
    return out.set(0, restY, restZ);
  }
  // The resting aim is deliberately left of the frame, which pushes the
  // structure to the right of the headline. Verified clear of the text at
  // 1280, 1440 and 1600.
  function restAim(out) {
    return out.set(lookX, 1.0, 0);
  }

  var _a = new THREE.Vector3();
  var _b = new THREE.Vector3();

  function placeCamera(t, px, py) {
    var arc = t <= T_PLAN ? 0 : easeInOutCubic(clamp01((t - T_PLAN) / T_LIFT));

    planEye(_a); restEye(_b);
    eye.lerpVectors(_a, _b, arc);
    planAim(_a); restAim(_b);
    aim.lerpVectors(_a, _b, arc);

    // 28mm-equivalent over the plan flattens the perspective so it reads as a
    // drawing; it opens to the normal 52 as the camera comes down.
    var fov = PLAN_FOV + (REST_FOV - PLAN_FOV) * arc;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    // Parallax only once the camera has left the plan, so the drawing phase
    // stays square to the viewer.
    camera.position.set(eye.x + px * 0.9 * arc, eye.y - py * 0.5 * arc, eye.z);
    camera.lookAt(aim);
  }

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
  var elapsed = 0;

  function tick() {
    rafId = requestAnimationFrame(tick);
    elapsed += clock.getDelta();
    var t = elapsed;

    var liftEnd = T_PLAN + T_LIFT;

    if (t < T_PLAN) {
      applyPlan(t);
      frame.rotation.y = 0;
      setScan(frame.position.y + SCAN_FROM * frame.scale.y, 0);
      nodeMat.uniforms.uScanOn.value = 0;
    } else if (t < liftEnd) {
      applyLift(t);
      frame.rotation.y = 0.35 * easeInOutCubic((t - T_PLAN) / T_LIFT);
      setScan(frame.position.y + SCAN_FROM * frame.scale.y, 0);
      nodeMat.uniforms.uScanOn.value = 0;
    } else {
      settle();
      frame.rotation.y = 0.35 + (t - liftEnd) * 0.045;

      // The intro scan, then a periodic re-run.
      var since = t - liftEnd;
      var sp = -1;
      if (since < T_SCAN) {
        sp = since / T_SCAN;
      } else {
        // The repeat sits at the END of each cycle. Putting it at the start
        // meant it fired the instant the intro scan finished — two sweeps
        // back to back, then a long silence, which reads as a stutter rather
        // than a periodic analysis pass.
        var cycle = (since - T_SCAN) % RESCAN_EVERY;
        var quiet = RESCAN_EVERY - RESCAN_LEN;
        if (cycle >= quiet) sp = (cycle - quiet) / RESCAN_LEN;
      }

      if (sp >= 0) {
        // Travels linearly. An eased sweep covers most of the height in the
        // first third and then crawls, which reads as a glitch rather than a
        // scan — a survey pass should move at a constant rate.
        //
        // SCAN_FROM/TO are in the frame's local space, but the shader measures
        // world position, and the frame is offset and scaled. Converting here
        // rather than in the shader keeps it to one multiply per pass instead
        // of one per fragment.
        var localY = SCAN_FROM + (SCAN_TO - SCAN_FROM) * sp;
        var y = frame.position.y + localY * frame.scale.y;
        // Fade the effect in and out so a pass never starts or stops abruptly.
        var strength = Math.min(1, sp / 0.08) * (1 - smoothstepLocal(0.82, 1, sp));
        setScan(y, strength);
        nodeMat.uniforms.uScanY.value = y;
        nodeMat.uniforms.uScanOn.value = strength;
      } else {
        // Genuinely at rest between passes: no idle wobble.
        setScan(frame.position.y + (SCAN_TO + 99) * frame.scale.y, 0);
        nodeMat.uniforms.uScanOn.value = 0;
      }
      nodeMat.uniforms.uOpacity.value = opacityScale;
    }

    pointer.x += (target.x - pointer.x) * 0.04;
    pointer.y += (target.y - pointer.y) * 0.04;
    placeCamera(t, pointer.x, pointer.y);

    renderer.render(scene, camera);
  }

  function start() {
    if (running || reduceMotion) return;
    running = true;
    clock.getDelta();          // discard time spent paused
    tick();
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  if (reduceMotion) {
    // Finished frame, analysed, completely static.
    settle();
    frame.rotation.y = 0.35;
    var parked = frame.position.y + (SCAN_TO + 99) * frame.scale.y;
    setScan(parked, 0);
    nodeMat.uniforms.uScanOn.value = 0.5;
    nodeMat.uniforms.uScanY.value = parked;
    nodeMat.uniforms.uOpacity.value = opacityScale;
    placeCamera(T_TOTAL, 0, 0);
    renderer.render(scene, camera);
  } else {
    // Hold on the first frame of the drawing until the hero is actually seen,
    // so the sequence is not already over by the time anyone looks at it.
    applyPlan(0);
    placeCamera(0, 0, 0);
    renderer.render(scene, camera);

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
      if (!running) {
        settle();
        placeCamera(T_TOTAL, pointer.x, pointer.y);
        renderer.render(scene, camera);
      }
    }, 150);
  });
}
