  // =========================================================================
  // 7b. THREE.JS (WebGL) RACE RENDERER — draws the same cars[] / trackObjects[]
  //     the simulation owns. Falls back to the Canvas 2D renderer above when
  //     WebGL or the library is unavailable.
  // =========================================================================
  const R3D = { status: 'pending', overlayDirty: true };
  const R3D_XS = 4.1;   // metres per lane-space unit (road half-width = 1.0)
  const R3D_ZS = 0.36;  // metres per track-distance unit (kept low so the sense of speed matches the 2D view)

  function r3dFail(reason) {
    if (R3D.status === 'failed') return;
    R3D.status = 'failed';
    if (R3D.glCanvas) R3D.glCanvas.style.display = 'none';
    try { console.warn('[race3d] using 2D renderer:', reason); } catch (e) {}
  }

  async function r3dInit() {
    const T = window.THREE;
    const glCanvas = document.createElement('canvas');
    glCanvas.id = 'raceCanvas3D';
    glCanvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';
    canvas.parentNode.insertBefore(glCanvas, canvas);
    canvas.style.position = 'relative';
    R3D.glCanvas = glCanvas;

    const renderer = new T.WebGLRenderer({ canvas: glCanvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.NoToneMapping;
    glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); r3dFail('context lost'); });

    // ---------- assets (each one is optional: a built-in stand-in is used if it fails) ----------
    const ADD = window.__trThreeAddons || {};
    const ASSET_BASE = './assets/game3d/';
    const loadPill = document.createElement('div');
    loadPill.style.cssText = 'position:absolute;left:50%;bottom:14px;transform:translateX(-50%);z-index:11;padding:7px 12px;border-radius:999px;background:rgba(8,13,24,0.88);border:1px solid rgba(40,224,102,0.45);color:#d1fae5;font:800 11px/1 system-ui,sans-serif;letter-spacing:.06em;display:flex;align-items:center;gap:8px;pointer-events:none;';
    loadPill.innerHTML = 'LOADING 3D<span style="display:block;width:72px;height:5px;border-radius:3px;background:rgba(255,255,255,0.16);overflow:hidden"><i style="display:block;height:100%;width:8%;background:#28e066;border-radius:3px;transition:width .25s"></i></span>';
    canvas.parentNode.appendChild(loadPill);
    let loadedCount = 0;
    const tick = (v) => { loadedCount++; loadPill.querySelector('i').style.width = Math.min(100, 8 + loadedCount * 19) + '%'; return v; };
    const within = (pr, ms) => Promise.race([pr, new Promise((r) => setTimeout(() => r(null), ms))]).then(tick, () => tick(null));
    const loadTex = (file) => new Promise((res) => new T.TextureLoader().load(ASSET_BASE + file, res, undefined, () => res(null)));
    const loadCar = () => new Promise((res) => {
      if (!ADD.GLTFLoader) return res(null);
      const loader = new ADD.GLTFLoader();
      if (ADD.DRACOLoader) loader.setDRACOLoader(new ADD.DRACOLoader().setDecoderPath(ADD.dracoPath));
      loader.load(ASSET_BASE + 'car.glb', (g) => res(g.scene), undefined, () => res(null));
    });
    const [carModel, carAoTex, floraTex, skyEq, skyFront] = await Promise.all([within(loadCar(), 15000), within(loadTex('car_ao.png'), 15000), within(loadTex('flora.webp'), 15000), within(loadTex('sky.jpg'), 15000), within(loadTex('sky_front.jpg'), 15000)]);
    loadPill.remove();
    if (R3D.status !== 'pending') return;

    const scene = new T.Scene();
    const camera = new T.PerspectiveCamera(50, 1, 0.3, 1200);
    scene.fog = new T.Fog(0xcfe9fb, 110, 520);

    const hemi = new T.HemisphereLight(0xffffff, 0x6b8f5a, 1.15);
    const sun = new T.DirectionalLight(0xfff3d6, 1.9);
    sun.position.set(0.553, 0.743, 0.376); // matches the sun in sky.jpg (behind-right of the camera)
    scene.add(hemi, sun);

    // ---------- helpers ----------
    const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
    const col = (hex) => new T.Color(hex);
    const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
    const canvasTex = (c, opts = {}) => {
      const t = new T.CanvasTexture(c);
      t.colorSpace = T.SRGBColorSpace;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      Object.assign(t, opts);
      return t;
    };
    const rr = (g, x, y, w, h, r) => {
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
      g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
      g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
    };
    // Bake a colour + transform into a geometry so many parts can merge into one draw call.
    const part = (geo, hex, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const g = geo.index ? geo.toNonIndexed() : geo.clone();
      if (rx || ry || rz) g.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(rx, ry, rz)));
      g.translate(x, y, z);
      const c = col(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
      g.setAttribute('color', new T.BufferAttribute(arr, 3));
      return g;
    };
    const merge = (parts) => {
      let n = 0; for (const g of parts) n += g.attributes.position.count;
      const P = new Float32Array(n * 3), N = new Float32Array(n * 3), C = new Float32Array(n * 3);
      let o = 0;
      for (const g of parts) {
        P.set(g.attributes.position.array, o * 3); N.set(g.attributes.normal.array, o * 3); C.set(g.attributes.color.array, o * 3);
        o += g.attributes.position.count; g.dispose();
      }
      const out = new T.BufferGeometry();
      out.setAttribute('position', new T.BufferAttribute(P, 3));
      out.setAttribute('normal', new T.BufferAttribute(N, 3));
      out.setAttribute('color', new T.BufferAttribute(C, 3));
      return out;
    };
    const matVC = new T.MeshLambertMaterial({ vertexColors: true });
    const flatOnRoad = (w, d) => { const g = new T.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; };

    // ---------- sky ----------
    const SKY = {
      sunny:  { stops: [[0, '#0a5fd0'], [0.17, '#2f92ff'], [0.31, '#8fd0ff'], [0.37, '#d9f1ff'], [1, '#d9f1ff']], fog: '#cfe8f8', grass: '#39a542', grass2: '#33993c', hemi: ['#ffffff', '#6b8f5a', 1.15], sun: ['#fff3d6', 1.9], cloud: '#ffffff', city: '#ffffff', road: '#ffffff', leaf: '#ffffff', glow: 0.5 },
      rain:   { stops: [[0, '#0f172a'], [0.2, '#1e293b'], [0.36, '#56657a'], [1, '#56657a']], fog: '#57667a', grass: '#1c6b3a', grass2: '#18603a', hemi: ['#b8c7dc', '#3b4a45', 0.95], sun: ['#c9d6ea', 0.75], cloud: '#8693a8', city: '#7f8ea6', road: '#9aa3b2', leaf: '#b9c6c0', glow: 0 },
      snow:   { stops: [[0, '#1e3a8a'], [0.19, '#60a5fa'], [0.35, '#e2e8f0'], [1, '#e2e8f0']], fog: '#e3eaf3', grass: '#e6edf5', grass2: '#d8e1ec', hemi: ['#ffffff', '#c3cfdf', 1.2], sun: ['#ffffff', 1.5], cloud: '#ffffff', city: '#dbe7f5', road: '#e2e8f0', leaf: '#dfeee6', glow: 0.25 },
      sunset: { stops: [[0, '#311042'], [0.15, '#b91c1c'], [0.28, '#f97316'], [0.37, '#fde047'], [1, '#fde047']], fog: '#f2a35c', grass: '#557f17', grass2: '#4b7214', hemi: ['#ffd1a6', '#4c4a2a', 1.0], sun: ['#ffae66', 1.7], cloud: '#ffd3a8', city: '#e2703a', road: '#f0c7a8', leaf: '#e9c98a', glow: 0.9 }
    };
    const skyTexCache = {};
    const skyTex = (key) => {
      if (skyTexCache[key]) return skyTexCache[key];
      const c = makeCanvas(4, 512), g = c.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, 512);
      for (const [o, cl] of SKY[key].stops) gr.addColorStop(o, cl);
      g.fillStyle = gr; g.fillRect(0, 0, 4, 512);
      return (skyTexCache[key] = canvasTex(c));
    };

    let skyEnv = null;
    if (skyEq) {
      skyEq.mapping = T.EquirectangularReflectionMapping; skyEq.colorSpace = T.SRGBColorSpace;
      const pm = new T.PMREMGenerator(renderer); skyEnv = pm.fromEquirectangular(skyEq).texture; pm.dispose();
      scene.environment = skyEnv;
    }
    // Sharp photo sky for the part of the sky the fixed chase camera can see (150° wide, -4°..66° high).
    let skyDome = null;
    if (skyFront) {
      skyFront.colorSpace = T.SRGBColorSpace;
      const d2r = Math.PI / 180;
      const geo = new T.SphereGeometry(900, 40, 20, (90 - 75) * d2r, 150 * d2r, (90 - 66) * d2r, 70 * d2r);
      skyDome = new T.Mesh(geo, new T.MeshBasicMaterial({ map: skyFront, side: T.DoubleSide, fog: false, depthWrite: false }));
      skyDome.scale.z = -1; skyDome.renderOrder = -10; skyDome.frustumCulled = false;
      SKY.sunny.fog = '#bccbe2';
    }

    // Everything in backdrop follows the camera so it reads as "at the horizon".
    const backdrop = new T.Group();
    scene.add(backdrop);
    if (skyDome) backdrop.add(skyDome);

    const glowC = makeCanvas(128, 128);
    {
      const g = glowC.getContext('2d'), gr = g.createRadialGradient(64, 64, 2, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    const glowTex = canvasTex(glowC);
    const sunGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: T.AdditiveBlending }));
    sunGlow.scale.set(520, 520, 1); sunGlow.position.set(0, 190, -800); sunGlow.renderOrder = -9;
    backdrop.add(sunGlow);

    const cloudC = makeCanvas(256, 128);
    {
      const g = cloudC.getContext('2d');
      const puff = (dy, fill) => {
        g.fillStyle = fill; g.beginPath();
        for (const [x, y, r] of [[128, 62, 44], [84, 74, 32], [172, 70, 36], [208, 82, 24], [52, 86, 22]]) { g.moveTo(x + r, y + dy); g.arc(x, y + dy, r, 0, Math.PI * 2); }
        g.fill();
      };
      puff(10, 'rgba(176,214,246,0.85)'); puff(0, '#ffffff');
      g.globalCompositeOperation = 'destination-out'; g.fillRect(0, 106, 256, 22);
    }
    const cloudMat = new T.SpriteMaterial({ map: canvasTex(cloudC), transparent: true, depthWrite: false, fog: false });
    const cloudsGL = [];
    for (let i = 0; i < 7; i++) {
      const s = new T.Sprite(cloudMat);
      const sc = 150 + hash(i + 3) * 150;
      s.scale.set(sc, sc * 0.5, 1);
      s.userData = { x0: -640 + i * 205 + hash(i) * 60, y: 150 + hash(i + 11) * 190, spd: 2.2 + hash(i + 5) * 2.2 };
      s.position.set(s.userData.x0, s.userData.y, -820 - hash(i + 7) * 60);
      s.renderOrder = -8;
      backdrop.add(s); cloudsGL.push(s);
    }

    // ---------- skyline (one merged mesh, repeating window texture) ----------
    const winC = makeCanvas(128, 128);
    {
      const g = winC.getContext('2d');
      g.fillStyle = '#8fa3bd'; g.fillRect(0, 0, 128, 128);                      // mullions
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        const gr = g.createLinearGradient(0, r * 32, 0, r * 32 + 32);
        const lit = ((r * 3 + c * 5) % 7) / 7;
        gr.addColorStop(0, lit > 0.6 ? '#ffffff' : '#e3eefb'); gr.addColorStop(1, lit > 0.6 ? '#d7e6f8' : '#b9cde6');
        g.fillStyle = gr; g.fillRect(c * 32 + 2, r * 32 + 3, 28, 27);
      }
    }
    const winTex = canvasTex(winC, { wrapS: T.RepeatWrapping, wrapT: T.RepeatWrapping });
    const cityMat = new T.MeshStandardMaterial({ map: winTex, vertexColors: true, fog: false, metalness: 0.35, roughness: 0.25, envMapIntensity: 1.5 });
    {
      const P = [], N = [], U = [], C = [];
      const quad = (a, b, c, d, n, uw, uh, cl) => {
        const uv = [[0, 0], [uw, 0], [uw, uh], [0, uh]], v = [a, b, c, d];
        for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...v[i]); N.push(...n); U.push(...uv[i]); C.push(cl.r, cl.g, cl.b); }
      };
      const tower = (x, z, w, d, h, hex, cap) => {
        const cl = col(hex), dk = col(hex).multiplyScalar(0.72), x0 = x - w / 2, x1 = x + w / 2, z0 = z - d / 2, z1 = z + d / 2;
        const uw = Math.max(1, Math.round(w / 14)), uh = Math.max(1, Math.round(h / 14));
        quad([x0, 0, z1], [x1, 0, z1], [x1, h, z1], [x0, h, z1], [0, 0, 1], uw, uh, cl);
        quad([x1, 0, z1], [x1, 0, z0], [x1, h, z0], [x1, h, z1], [1, 0, 0], Math.max(1, Math.round(d / 14)), uh, dk);
        quad([x0, 0, z0], [x0, 0, z1], [x0, h, z1], [x0, h, z0], [-1, 0, 0], Math.max(1, Math.round(d / 14)), uh, dk);
        quad([x0, h, z1], [x1, h, z1], [x1, h, z0], [x0, h, z0], [0, 1, 0], 0.02, 0.02, dk);
        if (cap === 1) { // stepped crown
          const cw2 = w * 0.62, ch2 = h * 0.07;
          quad([x - cw2 / 2, h, z1 - 1], [x + cw2 / 2, h, z1 - 1], [x + cw2 / 2, h + ch2, z1 - 1], [x - cw2 / 2, h + ch2, z1 - 1], [0, 0, 1], 0.02, 0.02, dk);
        } else if (cap === 2) { // spire
          const lt = col('#dfe8f3'), sw = w * 0.05, sh = h * 0.3;
          for (const i of [0, 1, 2]) { P.push(...[[x - sw, h, z1 - 1], [x + sw, h, z1 - 1], [x, h + sh, z1 - 1]][i]); N.push(0, 0, 1); U.push(0.01, 0.01); C.push(lt.r, lt.g, lt.b); }
        }
      };
      const palette = ['#3f86d8', '#58a4ee', '#2f6fbe', '#4b93e0', '#6fb4f6', '#2c63aa'];
      const paletteFar = ['#9cc6f0', '#a9cff4', '#8fbbe8'];
      let x = -560, i = 0;
      while (x < 560) { // far row: pale, tall
        const w = 26 + hash(i * 3.1) * 22, h = 70 + hash(i * 5.3) * 95;
        tower(x + w / 2, -470, w, 24, h, paletteFar[i % 3], hash(i * 9.1) < 0.3 ? 2 : 0);
        x += w + 4 + hash(i * 2.2) * 16; i++;
      }
      x = -520; i = 40;
      while (x < 520) { // near row: saturated, taller toward the sides (frames the road)
        const w = 20 + hash(i * 3.7) * 20, edge = Math.min(1, Math.abs(x + w / 2) / 300);
        const h = 34 + edge * 62 + hash(i * 4.9) * 46;
        const capR = hash(i * 8.3);
        tower(x + w / 2, -400, w, 22, h, palette[i % palette.length], capR < 0.22 ? 2 : (capR < 0.5 ? 1 : 0));
        x += w + 2 + hash(i * 1.9) * 9; i++;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
      g.setAttribute('color', new T.Float32BufferAttribute(C, 3));
      backdrop.add(new T.Mesh(g, cityMat));
    }
    // Distant tree line hides where the towers meet the haze.
    const treeLineMat = new T.MeshBasicMaterial({ color: 0x2f8a3c, fog: false });
    {
      const parts = [];
      for (let i = 0; i < 46; i++) {
        const r = 9 + hash(i * 6.7) * 8;
        const g = new T.SphereGeometry(r, 8, 5); g.scale(1.5, 1, 0.4); g.translate(-560 + i * 25 + hash(i) * 10, r * 0.35, -385);
        parts.push(part(g, '#ffffff'));
      }
      backdrop.add(new T.Mesh(merge(parts), treeLineMat));
    }

    // ---------- ground + road ----------
    const grassC = makeCanvas(256, 256);
    const grassTex = canvasTex(grassC, { wrapS: T.RepeatWrapping, wrapT: T.RepeatWrapping });
    const GRASS_LEN = 2600, GRASS_PERIOD = 16;
    grassTex.repeat.set(GRASS_LEN / GRASS_PERIOD, GRASS_LEN / GRASS_PERIOD);
    const paintGrass = (a, b) => {
      const g = grassC.getContext('2d'), ca = col(a), cb = col(b);
      g.fillStyle = a; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 900; i++) {                                          // mottled turf, tiles seamlessly
        const x = hash(i * 1.37) * 256, y = hash(i * 2.11) * 256, r = 5 + hash(i * 3.3) * 16, k = hash(i * 4.7);
        g.fillStyle = k < 0.5 ? b : (k < 0.8 ? '#' + ca.clone().multiplyScalar(0.84).getHexString() : '#' + ca.clone().multiplyScalar(1.12).getHexString());
        g.globalAlpha = 0.16 + hash(i * 5.9) * 0.16;
        for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) { g.beginPath(); g.ellipse(x + ox, y + oy, r, r * 0.6, 0, 0, Math.PI * 2); g.fill(); }
      }
      g.globalAlpha = 1; grassTex.needsUpdate = true;
    };
    const grass = new T.Mesh(flatOnRoad(GRASS_LEN, GRASS_LEN), new T.MeshLambertMaterial({ map: grassTex }));
    grass.position.y = -0.03;
    scene.add(grass);

    const ROAD_W = 2.2 * R3D_XS; // asphalt + both shoulders
    const ROAD_LEN = 1400, ROAD_PERIOD = 14;
    const roadC = makeCanvas(1024, 256);
    {
      const g = roadC.getContext('2d'), W = 1024, Hh = 256, u = (x) => (x + 1.1) / 2.2 * W;
      g.fillStyle = '#7f8896'; g.fillRect(0, 0, W, Hh);                        // shoulders
      g.fillStyle = '#3a3e45'; g.fillRect(u(-1), 0, u(1) - u(-1), Hh);         // asphalt
      for (let i = 0; i < 5200; i++) {                                         // aggregate speckle
        const x = u(-1) + hash(i * 1.13) * (u(1) - u(-1)), y = hash(i * 2.71) * Hh, k = hash(i * 3.9);
        g.fillStyle = k < 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.16)'; g.fillRect(x, y, 2, 2);
      }
      for (const lc of LANE_CENTERS) {                                         // tyre-worn lane centres
        const gr = g.createLinearGradient(u(lc - 0.17), 0, u(lc + 0.17), 0);
        gr.addColorStop(0, 'rgba(14,16,20,0)'); gr.addColorStop(0.5, 'rgba(14,16,20,0.26)'); gr.addColorStop(1, 'rgba(14,16,20,0)');
        g.fillStyle = gr; g.fillRect(u(lc - 0.17), 0, u(lc + 0.17) - u(lc - 0.17), Hh);
      }
      g.fillStyle = '#f4f6f8';
      g.fillRect(u(-1) - 2, 0, 16, Hh); g.fillRect(u(1) - 14, 0, 16, Hh);       // solid edge lines
    }
    const roadTex = canvasTex(roadC, { wrapT: T.RepeatWrapping });
    roadTex.repeat.set(1, ROAD_LEN / ROAD_PERIOD);
    // slightly wet, glossy asphalt that picks up the sky
    const roadMat = new T.MeshStandardMaterial({ map: roadTex, roughness: 0.42, metalness: 0.0, envMapIntensity: 0.85 });
    const road = new T.Mesh(flatOnRoad(ROAD_W, ROAD_LEN), roadMat);
    scene.add(road);

    // Lane dashes: world-anchored instances re-used as the camera moves.
    const DASH_PERIOD = 19, DASH_ROWS = 46;
    const dashGeo = flatOnRoad(0.17, DASH_PERIOD * 0.42 * R3D_ZS);
    const dashes = new T.InstancedMesh(dashGeo, new T.MeshBasicMaterial({ color: 0xffffff }), DASH_ROWS * 3);
    dashes.frustumCulled = false; dashes.position.y = 0.012;
    {
      const cY = col('#ffd21f'), cW = col('#f8fafc');
      for (let r = 0; r < DASH_ROWS; r++) for (let l = 0; l < 3; l++) dashes.setColorAt(r * 3 + l, cW);
    }
    scene.add(dashes);

    // Guard rails
    const RAIL_X = 1.13 * R3D_XS;
    const railMat = new T.MeshStandardMaterial({ color: 0xc9d0d9, metalness: 0.85, roughness: 0.38 });
    const rails = new T.Group();
    {
      // W-beam profile extruded along the road
      const sh = new T.Shape([[0, 0], [0.05, 0.035], [0.05, 0.085], [0, 0.13], [0, 0.17], [0.05, 0.215], [0.05, 0.265], [0, 0.3], [-0.02, 0.3], [-0.02, 0]].map(([x, y]) => new T.Vector2(x, y)));
      const beamGeo = new T.ExtrudeGeometry(sh, { depth: ROAD_LEN, bevelEnabled: false });
      beamGeo.translate(0, 0.47, -ROAD_LEN / 2);
      for (const s of [-1, 1]) { const beam = new T.Mesh(beamGeo, railMat); beam.position.x = s * RAIL_X; beam.scale.x = -s; rails.add(beam); }
    }
    railMat.side = T.DoubleSide;
    scene.add(rails);
    const POST_GAP = 3.8, POST_ROWS = 120;
    const posts = new T.InstancedMesh(new T.BoxGeometry(0.09, 0.78, 0.13), new T.MeshStandardMaterial({ color: 0x8b95a3, metalness: 0.7, roughness: 0.5 }), POST_ROWS * 2);
    posts.frustumCulled = false;
    scene.add(posts);
    // blue marker lights along both rails
    const LIGHT_GAP = POST_GAP * 3, LIGHT_ROWS = 44;
    const railLightPos = new Float32Array(LIGHT_ROWS * 2 * 3);
    const railLightGeo = new T.BufferGeometry(); railLightGeo.setAttribute('position', new T.BufferAttribute(railLightPos, 3));
    const railLights = new T.Points(railLightGeo, new T.PointsMaterial({ color: 0x4fb4ff, size: 1.5, map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    railLights.frustumCulled = false;
    scene.add(railLights);

    // ---------- roadside flora (instanced, world-anchored by segment index) ----------
    const FLORA_SEG = 22, FLORA_ROWS = 40;
    const trunkGeo = new T.CylinderGeometry(0.15, 0.22, 1, 6); trunkGeo.translate(0, 0.5, 0);
    const trunks = new T.InstancedMesh(trunkGeo, new T.MeshLambertMaterial({ color: 0x7a4a26 }), FLORA_ROWS * 6);
    const leafMat = new T.MeshLambertMaterial({ color: 0xffffff });
    const blobs = new T.InstancedMesh(new T.SphereGeometry(1, 10, 7), leafMat, FLORA_ROWS * 16);
    const coneGeo = new T.ConeGeometry(1, 1, 7); coneGeo.translate(0, 0.5, 0);
    const cones = new T.InstancedMesh(coneGeo, leafMat, FLORA_ROWS * 12);
    const dots = new T.InstancedMesh(new T.SphereGeometry(1, 6, 4), new T.MeshBasicMaterial({ color: 0xffffff }), FLORA_ROWS * 10);
    for (const m of [trunks, blobs, cones, dots]) { m.frustumCulled = false; scene.add(m); }
    const LEAF = { a: col('#23a845'), b: col('#4fd066'), c: col('#1b8f3a'), pine: col('#1f7d3c'), pine2: col('#2a9448'), bush: col('#2c9c44') };
    const FLOWER = [col('#ffffff'), col('#ffd84a'), col('#ff6b6b'), col('#c59bff')];
    const m4 = new T.Matrix4(), q0 = new T.Quaternion(), v3a = new T.Vector3(), v3b = new T.Vector3();
    const put = (mesh, i, x, y, z, sx, sy, sz) => { mesh.setMatrixAt(i, m4.compose(v3a.set(x, y, z), q0, v3b.set(sx, sy, sz))); };
    let floraBase = null;
    const layoutFloraBuiltIn = (base) => {
      let ti = 0, bi = 0, ci = 0, di = 0;
      const round = (x, z, s, tint) => {
        put(trunks, ti++, x, 0, z, s, 1.7 * s, s);
        put(blobs, bi, x, 2.75 * s, z, 1.55 * s, 1.45 * s, 1.55 * s); blobs.setColorAt(bi++, tint ? LEAF.c : LEAF.a);
        put(blobs, bi, x - 0.35 * s, 3.2 * s, z + 0.55 * s, 0.95 * s, 0.85 * s, 0.95 * s); blobs.setColorAt(bi++, LEAF.b);
      };
      const pine = (x, z, s) => {
        put(trunks, ti++, x, 0, z, s, 1.3 * s, s);
        put(cones, ci, x, 1.0 * s, z, 1.7 * s, 2.5 * s, 1.7 * s); cones.setColorAt(ci++, LEAF.pine);
        put(cones, ci, x, 2.3 * s, z, 1.3 * s, 2.2 * s, 1.3 * s); cones.setColorAt(ci++, LEAF.pine2);
        put(cones, ci, x, 3.5 * s, z, 0.9 * s, 1.9 * s, 0.9 * s); cones.setColorAt(ci++, LEAF.pine);
      };
      for (let k = 0; k < FLORA_ROWS; k++) {
        const s = base + k - 3, z = -(s * FLORA_SEG) * R3D_ZS;
        for (const side of [-1, 1]) {
          const n = s * 2 + (side > 0 ? 1 : 0);
          round(side * (10.9 + hash(n) * 0.7), z, 0.92 + hash(n + 0.5) * 0.3, false);
          const bx = side * (15.5 + hash(n * 1.7) * 7), bz = z - 3 - hash(n * 2.3) * 5, bs = 1.15 + hash(n * 3.1) * 0.5;
          if (hash(n * 4.3) < 0.62) pine(bx, bz, bs); else round(bx, bz, bs, true);
          pine(side * (27 + hash(n * 5.9) * 16), z - hash(n * 6.1) * 9, 1.6 + hash(n * 7.7) * 0.9);
          // flowering bush between the rail and the trees
          const fx = side * 9.2, fz = z - 4.2, fs = 0.5 + hash(n * 9.3) * 0.22;
          put(blobs, bi, fx, fs * 0.55, fz, fs * 1.25, fs * 0.9, fs * 1.1); blobs.setColorAt(bi++, LEAF.bush);
          const fc = FLOWER[Math.floor(hash(n * 11.9) * FLOWER.length)];
          for (let f = 0; f < 3; f++) {
            put(dots, di, fx + (f - 1) * fs * 0.6, fs * (1.0 + (f % 2) * 0.22), fz + fs * 0.75 - Math.abs(f - 1) * 0.2, 0.13, 0.13, 0.13);
            dots.setColorAt(di++, fc);
          }
        }
      }
      trunks.count = ti; blobs.count = bi; cones.count = ci; dots.count = di;
      for (const m of [trunks, blobs, cones, dots]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    };

    // Photo-real trees and rocks: crossed cut-out planes from one atlas (renders of CC0 Poly Haven models).
    const FLORA_META = {"fir0":{"u0":0.00098,"u1":0.17041,"v0":0.00293,"v1":0.99219,"aspect":0.3425},"fir1":{"u0":0.17139,"u1":0.33203,"v0":0.00293,"v1":0.71875,"aspect":0.4488},"fir2":{"u0":0.33301,"u1":0.48828,"v0":0.00293,"v1":0.72852,"aspect":0.428},"pines":{"u0":0.48926,"u1":0.79688,"v0":0.40918,"v1":0.99414,"aspect":1.0518},"leafy0":{"u0":0.79785,"u1":0.99609,"v0":0.40918,"v1":0.99414,"aspect":0.6778},"leafy1":{"u0":0.48926,"u1":0.75195,"v0":0.00293,"v1":0.40039,"aspect":1.3219},"leafy2":{"u0":0.75293,"u1":0.93799,"v0":0.00293,"v1":0.40039,"aspect":0.9312},"rock0":{"u0":0.93896,"u1":0.99561,"v0":0.00293,"v1":0.10449,"aspect":1.1154},"rock1":{"u0":0.93896,"u1":0.99561,"v0":0.10742,"v1":0.19727,"aspect":1.2609},"rock2":{"u0":0.93896,"u1":0.99561,"v0":0.2002,"v1":0.28125,"aspect":1.3976}};
    const floraMat = new T.MeshBasicMaterial({ map: floraTex, alphaTest: 0.42, side: T.DoubleSide });
    const species = {};
    const treeShade = new T.InstancedMesh(new T.CircleGeometry(1, 14).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0x0b2410, transparent: true, opacity: 0.22, depthWrite: false }), FLORA_ROWS * 10);
    treeShade.frustumCulled = false; treeShade.position.y = 0.01; treeShade.count = 0;
    if (floraTex) {
      floraTex.colorSpace = T.SRGBColorSpace; floraTex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
      for (const name in FLORA_META) {
        const m = FLORA_META[name], a = m.aspect / 2, g = new T.BufferGeometry();
        const quad = (ax) => ax === 'x' ? [[-a, 0, 0], [a, 0, 0], [a, 1, 0], [-a, 1, 0]] : [[0, 0, -a], [0, 0, a], [0, 1, a], [0, 1, -a]];
        const P = [], U = [], uv = [[m.u0, m.v0], [m.u1, m.v0], [m.u1, m.v1], [m.u0, m.v1]];
        for (const ax of (name.startsWith('rock') ? ['x'] : ['x', 'z'])) { const q = quad(ax); for (const i of [0, 1, 2, 0, 2, 3]) { P.push(...q[i]); U.push(...uv[i]); } }
        g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(U, 2));
        const mesh = new T.InstancedMesh(g, floraMat, FLORA_ROWS * 10);
        mesh.frustumCulled = false; mesh.count = 0; scene.add(mesh);
        species[name] = { mesh, n: 0 };
      }
      scene.add(treeShade);
    }
    const layoutFloraPhoto = (base) => {
      let di = 0, si = 0;
      for (const k in species) species[k].n = 0;
      const plant = (name, x, z, h, flip, shade) => {
        const sp = species[name]; if (sp.n >= FLORA_ROWS * 10) return;
        put(sp.mesh, sp.n++, x, -0.05, z, flip ? -h : h, h, h);
        if (shade && si < FLORA_ROWS * 10) put(treeShade, si++, x + shade * 0.5, 0, z + shade * 0.2, shade * 1.5, 1, shade);
      };
      const FIRS = ['fir0', 'fir1', 'fir2'], LEAFY = ['leafy0', 'leafy2', 'leafy1'], ROCKS = ['rock0', 'rock1', 'rock2'];
      const segLen = FLORA_SEG * R3D_ZS, EDGE = RAIL_X + 1.6;
      for (let k = 0; k < FLORA_ROWS; k++) {
        const s = base + k - 2, z = -(s * FLORA_SEG) * R3D_ZS;
        for (const side of [-1, 1]) {
          const n = s * 2 + (side > 0 ? 1 : 0), r = (q) => hash(n * q);
          // stretches of dense planting alternate with open gaps
          const dens = hash(Math.floor(s / 4) * 7.13 + (side > 0 ? 3.1 : 0));
          const leafy = (x, zz, h) => plant(LEAFY[Math.floor(r(2.1 + x) * 3)], x, zz, h, r(5.3 + x) < 0.5, h * 0.36);
          if (dens > 0.28) {
            if (r(1.3) < 0.82) leafy(side * (EDGE + r(3.7) * 1.8), z, 4.6 + r(4.9) * 2.4);
            else plant(FIRS[Math.floor(r(2.1) * 3)], side * (EDGE + 0.6 + r(3.7) * 1.6), z, 7 + r(4.9) * 3, r(5.3) < 0.5, 1.6);
            if (dens > 0.6) leafy(side * (EDGE + 1.2 + r(7.9) * 3.4), z - segLen * 0.5, 4.2 + r(8.3) * 2.6);
          }
          if (dens > 0.15) leafy(side * (EDGE + 6 + r(10.3) * 6), z - segLen * r(10.9), 6 + r(11.3) * 3);
          if (r(12.1) < 0.7) plant(r(12.5) < 0.6 ? LEAFY[Math.floor(r(12.9) * 2)] : FIRS[Math.floor(r(12.9) * 3)], side * (EDGE + 15 + r(12.7) * 10), z - segLen * r(13.1), 8 + r(13.7) * 4, r(14.3) < 0.5, 0);
          plant(r(15.1) < 0.5 ? 'pines' : 'leafy0', side * (EDGE + 30 + r(15.7) * 28), z - segLen * r(16.3), 11 + r(16.9) * 6, r(17.3) < 0.5, 0);
          if (r(18.1) < 0.55) plant(ROCKS[Math.floor(r(18.7) * 3)], side * (RAIL_X + 0.9 + r(19.3) * 2.6), z - segLen * 0.3, 0.55 + r(19.9) * 0.75, r(20.3) < 0.5, 0);
          // grass tufts and wildflower specks on the verge
          const fc = FLOWER[Math.floor(r(21.1) * FLOWER.length)];
          for (let f = 0; f < 4; f++) {
            put(dots, di, side * (RAIL_X + 0.5 + hash(n * 22.3 + f) * 3.4), 0.07, z - segLen * hash(n * 23.9 + f), 0.07, 0.07, 0.07);
            dots.setColorAt(di++, f % 2 ? fc : FLOWER[0]);
          }
        }
      }
      for (const k in species) { species[k].mesh.count = species[k].n; species[k].mesh.instanceMatrix.needsUpdate = true; }
      treeShade.count = si; treeShade.instanceMatrix.needsUpdate = true;
      trunks.count = blobs.count = cones.count = 0; dots.count = di;
      dots.instanceMatrix.needsUpdate = true; if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
    };
    const layoutFlora = floraTex ? layoutFloraPhoto : layoutFloraBuiltIn;

    // ---------- start / finish ----------
    const chkC = makeCanvas(256, 32);
    {
      const g = chkC.getContext('2d');
      for (let r = 0; r < 2; r++) for (let c = 0; c < 16; c++) { g.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a'; g.fillRect(c * 16, r * 16, 16, 16); }
    }
    const chkTex = canvasTex(chkC, { magFilter: T.NearestFilter });
    const lineDepth = 1.5;
    const roadText = (text) => {
      const c = makeCanvas(1024, 256), g = c.getContext('2d');
      g.font = '900 210px "Segoe UI", "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(248,250,252,0.94)'; g.fillText(text, 512, 138, 980);
      const m = new T.Mesh(flatOnRoad(R3D_XS * 0.6, 1.9), new T.MeshBasicMaterial({ map: canvasTex(c), transparent: true, depthWrite: false }));
      m.position.y = 0.016; m.renderOrder = 2;
      return m;
    };
    const makeLine = (trackZ, text) => {
      const g = new T.Group();
      const strip = new T.Mesh(flatOnRoad(2 * R3D_XS, lineDepth), new T.MeshBasicMaterial({ map: chkTex }));
      strip.position.set(0, 0.014, -lineDepth / 2); strip.renderOrder = 1;
      const txt = roadText(text); txt.position.z = -lineDepth - 3.4;
      g.add(strip, txt);
      g.position.z = -trackZ * R3D_ZS;
      scene.add(g);
      return g;
    };
    const START_TRACK_Z = 8.6; // just ahead of the car noses on the grid
    makeLine(START_TRACK_Z, 'START');
    const finishGroup = makeLine(FINISH_LINE_Z, 'FINISH');
    {
      const banC = makeCanvas(1024, 128), g = banC.getContext('2d');
      g.fillStyle = '#0f172a'; g.fillRect(0, 0, 1024, 128);
      for (let c = 0; c < 64; c++) for (let r = 0; r < 2; r++) { g.fillStyle = (r + c) % 2 === 0 ? '#f8fafc' : '#0f172a'; g.fillRect(c * 16, r * 12, 16, 12); g.fillRect(c * 16, 104 + r * 12, 16, 12); }
      g.font = '900 italic 70px "Segoe UI", "Arial Black", Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = '#f8fafc'; g.fillText('FINISH', 512, 66);
      const span = RAIL_X * 2 + 1.2;
      const banner = new T.Mesh(new T.PlaneGeometry(span, span / 8), new T.MeshBasicMaterial({ map: canvasTex(banC) }));
      banner.position.set(0, 6.6, 0);
      const gantry = new T.Mesh(merge([
        part(new T.BoxGeometry(0.36, 7.6, 0.36), '#cbd5e1', -span / 2, 3.8, -0.1),
        part(new T.BoxGeometry(0.36, 7.6, 0.36), '#cbd5e1', span / 2, 3.8, -0.1),
        part(new T.BoxGeometry(span + 0.36, 0.3, 0.3), '#94a3b8', 0, 7.6, -0.1),
        part(new T.BoxGeometry(span + 0.36, 0.2, 0.3), '#94a3b8', 0, 5.6, -0.1)
      ]), matVC);
      finishGroup.add(banner, gantry);
    }

    // ---------- cars ----------
    const envRT = (() => { // small procedural sky so the paint has something to reflect
      const s = new T.Scene(), g = new T.SphereGeometry(10, 16, 12), n = g.attributes.position.count, c = new Float32Array(n * 3);
      const top = col('#5aa8ff'), hor = col('#ffffff'), gnd = col('#3a4048'), tmp = new T.Color();
      for (let i = 0; i < n; i++) {
        const y = g.attributes.position.getY(i) / 10;
        if (y >= 0) tmp.copy(hor).lerp(top, Math.min(1, y * 1.6)); else tmp.copy(hor).lerp(gnd, Math.min(1, -y * 5));
        c[i * 3] = tmp.r; c[i * 3 + 1] = tmp.g; c[i * 3 + 2] = tmp.b;
      }
      g.setAttribute('color', new T.BufferAttribute(c, 3));
      s.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
      const pm = new T.PMREMGenerator(renderer), rt = pm.fromScene(s, 0.04);
      pm.dispose(); g.dispose();
      return rt;
    })();
    const envMap = skyEnv || envRT.texture;

    const CAR_L = 4.5;
    const buildCarBody = () => {
      // station: [t (0 tail → 1 nose), half-width, floor y, widest-point y, shoulder y, cabin-base half-width, roof y, roof half-width]
      const S = [
        [0.000, 0.88, 0.38, 0.56, 0.78, 0.60, 0.80, 0.42],
        [0.030, 0.95, 0.25, 0.52, 0.84, 0.63, 0.86, 0.44],
        [0.100, 0.985, 0.19, 0.50, 0.87, 0.64, 0.90, 0.45],
        [0.200, 0.985, 0.18, 0.50, 0.86, 0.65, 0.955, 0.46],
        [0.300, 0.96, 0.18, 0.48, 0.81, 0.66, 1.01, 0.47],
        [0.400, 0.94, 0.18, 0.46, 0.77, 0.67, 1.06, 0.48],
        [0.480, 0.93, 0.18, 0.46, 0.75, 0.68, 1.08, 0.49],
        [0.570, 0.93, 0.18, 0.46, 0.73, 0.68, 1.05, 0.49],
        [0.660, 0.945, 0.18, 0.46, 0.71, 0.68, 0.88, 0.52],
        [0.735, 0.955, 0.18, 0.46, 0.70, 0.66, 0.725, 0.48],
        [0.820, 0.965, 0.18, 0.45, 0.67, 0.60, 0.68, 0.40],
        [0.900, 0.94, 0.19, 0.40, 0.57, 0.54, 0.58, 0.36],
        [0.960, 0.87, 0.21, 0.34, 0.45, 0.48, 0.46, 0.30],
        [1.000, 0.74, 0.26, 0.31, 0.36, 0.40, 0.37, 0.24]
      ];
      const RING = 15, pos = [];
      for (const [t, w, yb, ys, yh, wc, yr, wr] of S) {
        const z = (0.5 - t) * CAR_L, crown = 0.025;
        const half = [[0, yb], [w * 0.9, yb], [w, ys], [w * 0.96, yh], [wc, yh + (yr - yh) * 0.1 + 0.005], [wr, yr], [0.17, yr + crown], [0, yr + crown]];
        for (let k = 0; k < 8; k++) pos.push(half[k][0], half[k][1], z);
        for (let k = 6; k >= 0; k--) pos.push(-half[k][0], half[k][1], z);
      }
      const idx = [[], [], [], []]; // paint, glass, stripe, dark
      const matOf = (seg, e) => {
        const glassSeg = (seg >= 2 && seg <= 4) || seg === 7 || seg === 8; // fastback rear screen + windscreen
        if (e === 0) return 3;
        if (e === 4) return (seg >= 4 && seg <= 8) ? 1 : 0;
        if (e === 5) return glassSeg ? 1 : 0;
        if (e === 6) return glassSeg ? 1 : 2;
        return 0;
      };
      const P = (i) => [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
      const tri = (list, a, b, c, cx, cy, cz) => { // orient every triangle away from the body axis
        const A = P(a), B = P(b), Cc = P(c);
        const ux = B[0] - A[0], uy = B[1] - A[1], uz = B[2] - A[2], vx = Cc[0] - A[0], vy = Cc[1] - A[1], vz = Cc[2] - A[2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const mx = (A[0] + B[0] + Cc[0]) / 3 - cx, my = (A[1] + B[1] + Cc[1]) / 3 - cy, mz = (A[2] + B[2] + Cc[2]) / 3 - cz;
        if (nx * mx + ny * my + nz * mz >= 0) list.push(a, b, c); else list.push(a, c, b);
      };
      for (let s = 0; s < S.length - 1; s++) {
        const zc = (0.5 - (S[s][0] + S[s + 1][0]) / 2) * CAR_L;
        for (let m = 0; m < RING - 1; m++) {
          const e = m < 7 ? m : 13 - m, list = idx[matOf(s, e)];
          const a = s * RING + m, b = a + 1, c = a + RING, d = c + 1;
          tri(list, a, b, d, 0, 0.55, zc); tri(list, a, d, c, 0, 0.55, zc);
        }
      }
      for (const s of [0, S.length - 1]) { // flat end caps on their own vertices
        const base = pos.length / 3, z = pos[s * RING * 3 + 2];
        for (let m = 0; m < RING; m++) pos.push(pos[(s * RING + m) * 3], pos[(s * RING + m) * 3 + 1], z);
        pos.push(0, 0.55, z);
        for (let m = 0; m < RING - 1; m++) tri(idx[0], base + m, base + m + 1, base + RING, 0, 0.55, 0);
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
      let all = [], o = 0;
      idx.forEach((list, mi) => { g.addGroup(o, list.length, mi); all = all.concat(list); o += list.length; });
      g.setIndex(all);
      g.computeVertexNormals();
      return g;
    };
    const carBodyGeo = buildCarBody();
    const glassMat = new T.MeshStandardMaterial({ color: 0x0b1320, metalness: 0.5, roughness: 0.08, envMap, envMapIntensity: 1.5 });
    const darkMat = new T.MeshLambertMaterial({ color: 0x14171c });
    const wheelGeo = (() => {
      const cyl = (r, w, seg) => { const g = new T.CylinderGeometry(r, r, w, seg); g.rotateZ(Math.PI / 2); return g; };
      const parts = [part(cyl(0.345, 0.26, 18), '#17191d'), part(cyl(0.22, 0.27, 14), '#8a919b'), part(cyl(0.07, 0.285, 8), '#23262b')];
      for (let i = 0; i < 5; i++) parts.push(part(new T.BoxGeometry(0.275, 0.05, 0.4), '#7d848e', 0, 0, 0, i * Math.PI / 5, 0, 0));
      return merge(parts);
    })();
    const carTrimGeo = merge([
      part(new T.BoxGeometry(1.5, 0.24, 0.06), '#0d0f13', 0, 0.62, CAR_L / 2 + 0.005),      // tail fascia
      part(new T.BoxGeometry(1.36, 0.17, 0.2), '#0d0f13', 0, 0.3, CAR_L / 2 - 0.06),        // diffuser
      part(new T.BoxGeometry(0.46, 0.13, 0.03), '#e9edf2', 0, 0.44, CAR_L / 2 + 0.03),      // plate
      part(new T.CylinderGeometry(0.055, 0.055, 0.14, 10), '#b9c0c9', -0.2, 0.3, CAR_L / 2 + 0.05, Math.PI / 2, 0, 0),
      part(new T.CylinderGeometry(0.055, 0.055, 0.14, 10), '#b9c0c9', 0.2, 0.3, CAR_L / 2 + 0.05, Math.PI / 2, 0, 0),
      part(new T.BoxGeometry(0.05, 0.2, 0.5), '#0d0f13', -0.972, 0.52, 0.72), part(new T.BoxGeometry(0.05, 0.2, 0.5), '#0d0f13', 0.972, 0.52, 0.72), // side intakes
      part(new T.BoxGeometry(0.34, 0.035, 0.16), '#f2f6fb', -0.6, 0.6, -1.86, 0.3, 0.25, 0), part(new T.BoxGeometry(0.34, 0.035, 0.16), '#f2f6fb', 0.6, 0.6, -1.86, 0.3, -0.25, 0) // headlights
    ]);
    const tailLightGeo = (() => {
      const disc = (x) => { const g = new T.CylinderGeometry(0.088, 0.088, 0.05, 14); g.rotateX(Math.PI / 2); g.translate(x, 0.63, CAR_L / 2 + 0.035); return g; };
      return merge([-0.62, -0.42, 0.42, 0.62].map((x) => part(disc(x), '#ffffff')));
    })();
    const shadowC = makeCanvas(64, 128);
    {
      const g = shadowC.getContext('2d'), gr = g.createRadialGradient(32, 64, 6, 32, 64, 32);
      gr.addColorStop(0, 'rgba(0,0,0,0.62)'); gr.addColorStop(0.6, 'rgba(0,0,0,0.42)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.save(); g.translate(0, 64); g.scale(1, 2); g.translate(0, -64); g.fillStyle = gr; g.fillRect(0, 0, 64, 128); g.restore();
    }
    const shadowMat = new T.MeshBasicMaterial({ map: canvasTex(shadowC), transparent: true, depthWrite: false });
    const shadowGeo = flatOnRoad(2.9, 6.0);
    const flameGeo = new T.ConeGeometry(0.075, 1, 8); flameGeo.rotateX(Math.PI / 2); flameGeo.translate(0, 0, 0.5);

    const tagTexCache = {};
    const tagTex = (label, isYou, badge) => {
      const key = label + '|' + isYou + '|' + badge;
      if (tagTexCache[key]) return tagTexCache[key];
      const c = makeCanvas(384, 128), g = c.getContext('2d');
      g.fillStyle = isYou ? 'rgba(22,163,74,0.97)' : 'rgba(8,13,24,0.93)';
      g.strokeStyle = isYou ? '#bbf7d0' : badge; g.lineWidth = isYou ? 7 : 6;
      rr(g, 6, 6, 372, 92, 24); g.fill(); g.stroke();
      if (isYou) { g.fillStyle = '#4ade80'; g.beginPath(); g.moveTo(170, 100); g.lineTo(214, 100); g.lineTo(192, 126); g.closePath(); g.fill(); }
      g.fillStyle = badge; g.beginPath(); g.arc(58, 52, 25, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3; g.stroke();
      g.fillStyle = '#ffffff'; g.font = '900 italic 50px "Segoe UI", system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(label, 222, 55, 250);
      return (tagTexCache[key] = canvasTex(c));
    };

    const makeRig = () => {
      const rig = { group: new T.Group(), tilt: new T.Group(), wheels: [], themeKey: null, tagKey: null, yaw: 0 };
      rig.paint = new T.MeshStandardMaterial({ color: 0xff0000, metalness: 0.42, roughness: 0.3, envMap, envMapIntensity: 1.15 });
      rig.stripe = new T.MeshStandardMaterial({ color: 0xffffff, metalness: 0.3, roughness: 0.35, envMap, envMapIntensity: 0.9 });
      rig.body = new T.Mesh(carBodyGeo, [rig.paint, glassMat, rig.stripe, darkMat]);
      rig.tilt.add(rig.body, new T.Mesh(carTrimGeo, matVC));
      rig.tailMat = new T.MeshBasicMaterial({ color: 0xc81e1e });
      rig.tilt.add(new T.Mesh(tailLightGeo, rig.tailMat));
      const wing = new T.Mesh(new T.BoxGeometry(1.62, 0.045, 0.24), rig.paint); wing.position.set(0, 0.93, CAR_L / 2 - 0.1); wing.rotation.x = 0.22;
      rig.tilt.add(wing);
      for (const sx of [-1, 1]) {
        const mir = new T.Mesh(new T.BoxGeometry(0.2, 0.09, 0.13), rig.paint); mir.position.set(sx * 0.93, 0.86, -0.62); rig.tilt.add(mir);
        for (const [wz, sc] of [[1.36, 1.05], [-1.36, 1]]) {
          const w = new T.Mesh(wheelGeo, matVC); w.position.set(sx * 0.86, 0.345 * sc, wz); w.scale.setScalar(sc);
          rig.group.add(w); rig.wheels.push(w);
        }
      }
      rig.flameMat = new T.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
      rig.flames = [-0.2, 0.2].map((x) => { const f = new T.Mesh(flameGeo, rig.flameMat); f.position.set(x, 0.3, CAR_L / 2 + 0.1); f.visible = false; rig.tilt.add(f); return f; });
      rig.shadow = new T.Mesh(shadowGeo, shadowMat); rig.shadow.position.y = 0.02; rig.shadow.renderOrder = 3;
      rig.tag = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false }));
      rig.tag.center.set(0.5, 0); rig.tag.renderOrder = 20;
      rig.setBrake = (on) => { rig.tailMat.color.set(on ? 0xff3b30 : 0xa01818); };
      rig.group.add(rig.tilt, rig.shadow);
      scene.add(rig.group, rig.tag);
      return rig;
    };
    // Sports car GLB supplied by the owner (assets/game3d/car.glb). Its own textures are kept;
    // only the body paint colour changes per car. See assets/game3d/CREDITS.md.
    const carKit = carModel ? (() => {
      // Fit the template once: 4.9 m long, on the road, nose pointing down the road (-z).
      carModel.rotation.set(0, Math.PI, 0);
      carModel.updateMatrixWorld(true);
      const fb = new T.Box3().setFromObject(carModel), fs = fb.getSize(new T.Vector3());
      carModel.scale.setScalar(4.9 / Math.max(fs.x, fs.z));
      carModel.updateMatrixWorld(true);
      const fb2 = new T.Box3().setFromObject(carModel), fc = fb2.getCenter(new T.Vector3());
      carModel.position.set(-fc.x, -fb2.min.y, -fc.z);
      const src = {};
      carModel.traverse((o) => { if (o.isMesh && o.material) { src[o.material.name] = o.material; if (o.material.map) o.material.map.anisotropy = 4; } });
      const glass = new T.MeshStandardMaterial({ color: 0x05080c, metalness: 0.9, roughness: 0.06, envMapIntensity: 1.6, transparent: true, opacity: 0.86 });
      const glowMap = src['Material.009'] && src['Material.009'].map;
      const glow = (opacity) => new T.MeshBasicMaterial({ map: glowMap, transparent: true, opacity, blending: T.AdditiveBlending, depthWrite: false, fog: false });
      for (const k in src) { if ('envMapIntensity' in src[k]) src[k].envMapIntensity = 1.1; }
      return { src, glass, glow, paintMap: src['Material.001'] && src['Material.001'].map };
    })() : null;
    const aoGeo = flatOnRoad(2.9, 5.9);
    const aoMat = carAoTex ? new T.MeshBasicMaterial({ map: carAoTex, blending: T.MultiplyBlending, toneMapped: false, transparent: true, premultipliedAlpha: true, depthWrite: false }) : shadowMat;
    const makeRigGLB = () => {
      const rig = { group: new T.Group(), tilt: new T.Group(), wheels: [], themeKey: null, tagKey: null, yaw: 0 };
      // the paint texture is a white ambient-occlusion map, so the colour simply multiplies in
      rig.paint = new T.MeshPhysicalMaterial({ color: 0xff0000, map: carKit.paintMap || null, metalness: 0.25, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.25 });
      rig.stripe = { color: { set() {} } };
      rig.brakeGlow = carKit.glow(0.55);
      const lampGlow = carKit.glow(0.5);
      const model = carModel.clone(true);
      model.traverse((o) => {
        if (/^wheel(FL|FR|BL|BR)\d*$/.test(o.name)) rig.wheels.push(o);
        if (!o.isMesh) return;
        const mn = o.material && o.material.name, nodeName = (o.parent && o.parent.name || '') + o.name;
        if (mn === 'Material.001') o.material = rig.paint;
        else if (mn === 'Material.009') {
          if (/reverse/.test(nodeName)) o.visible = false;
          else o.material = /brakes/.test(nodeName) ? rig.brakeGlow : lampGlow;
          o.renderOrder = 4;
        } else if (/glass/.test(mn || '')) o.material = carKit.glass;
      });
      rig.tilt.add(model);
      rig.flameMat = new T.MeshBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.9, blending: T.AdditiveBlending, depthWrite: false });
      rig.flames = [-0.42, 0.42].map((x) => { const f = new T.Mesh(flameGeo, rig.flameMat); f.position.set(x, 0.3, 2.4); f.visible = false; rig.tilt.add(f); return f; });
      rig.shadow = new T.Mesh(aoGeo, aoMat); rig.shadow.position.y = 0.022; rig.shadow.renderOrder = 3;
      rig.tag = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false }));
      rig.tag.center.set(0.5, 0); rig.tag.renderOrder = 20;
      rig.setBrake = (on) => { rig.brakeGlow.opacity = on ? 1 : 0.4; };
      rig.group.add(rig.tilt, rig.shadow);
      scene.add(rig.group, rig.tag);
      return rig;
    };
    const newRig = carKit ? makeRigGLB : makeRig;
    const rigs = [newRig(), newRig(), newRig()];

    // ---------- track objects (pooled) ----------
    const boostC = makeCanvas(128, 512);
    {
      const g = boostC.getContext('2d');
      g.fillStyle = 'rgba(12,38,74,0.96)'; rr(g, 5, 5, 118, 502, 12); g.fill();
      g.strokeStyle = '#7dd3fc'; g.lineWidth = 7; g.stroke();
      g.fillStyle = 'rgba(20,70,130,0.95)'; rr(g, 14, 20, 100, 74, 8); g.fill();
      g.fillStyle = '#ffffff'; g.font = '900 italic 30px "Segoe UI", system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText('BOOST', 70, 59);
      g.fillStyle = '#fde047'; g.beginPath(); g.moveTo(26, 40); g.lineTo(16, 62); g.lineTo(24, 62); g.lineTo(19, 80); g.lineTo(33, 54); g.lineTo(25, 54); g.closePath(); g.fill();
    }
    const chevC = makeCanvas(128, 128);
    {
      const g = chevC.getContext('2d');
      g.strokeStyle = '#ffffff'; g.lineWidth = 16; g.lineJoin = 'miter'; g.lineCap = 'butt';
      g.beginPath(); g.moveTo(20, 96); g.lineTo(64, 46); g.lineTo(108, 96); g.stroke();
    }
    const chevTex = canvasTex(chevC, { wrapT: T.RepeatWrapping });
    chevTex.repeat.set(1, 3);
    const PAD_W = 0.46 * R3D_XS, PAD_L = 12 * R3D_ZS;
    const padMat = new T.MeshBasicMaterial({ map: canvasTex(boostC), transparent: true, depthWrite: false });
    const chevMat = new T.MeshBasicMaterial({ map: chevTex, transparent: true, depthWrite: false });
    const padGlowMat = new T.MeshBasicMaterial({ map: glowTex, color: 0x22d3ee, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending });
    const makePad = () => {
      const g = new T.Group();
      const glow = new T.Mesh(flatOnRoad(PAD_W * 2.1, PAD_L * 1.35), padGlowMat); glow.position.y = 0.017; glow.renderOrder = 4;
      const base = new T.Mesh(flatOnRoad(PAD_W, PAD_L), padMat); base.position.y = 0.02; base.renderOrder = 5;
      const chev = new T.Mesh(flatOnRoad(PAD_W * 0.8, PAD_L * 0.76), chevMat); chev.position.set(0, 0.024, PAD_L * 0.09); chev.renderOrder = 6;
      g.add(glow, base, chev);
      return g;
    };
    const stripeTex = (() => {
      const c = makeCanvas(128, 32), g = c.getContext('2d');
      g.fillStyle = '#facc15'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#111827';
      for (let i = -1; i < 9; i++) { g.beginPath(); g.moveTo(i * 32, 32); g.lineTo(i * 32 + 16, 32); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.closePath(); g.fill(); }
      return canvasTex(c);
    })();
    const coneOne = (x, z) => [
      part(new T.BoxGeometry(0.62, 0.06, 0.62), '#c2410c', x, 0.03, z),
      part(new T.CylinderGeometry(0.06, 0.27, 0.95, 12), '#ff5a00', x, 0.53, z),
      part(new T.CylinderGeometry(0.145, 0.195, 0.2, 12), '#f8fafc', x, 0.55, z)
    ];
    const barrelOne = (x, z) => [
      part(new T.CylinderGeometry(0.42, 0.42, 1.15, 14), '#f97316', x, 0.575, z),
      part(new T.CylinderGeometry(0.432, 0.432, 0.17, 14), '#f8fafc', x, 0.78, z),
      part(new T.CylinderGeometry(0.432, 0.432, 0.17, 14), '#f8fafc', x, 0.38, z),
      part(new T.CylinderGeometry(0.34, 0.34, 0.04, 14), '#9a3412', x, 1.16, z)
    ];
    const OBJ_GEO = {
      cone: merge([...coneOne(-0.75, 0.2), ...coneOne(0, -0.25), ...coneOne(0.75, 0.2)]),
      barrel: merge([...barrelOne(-0.5, 0), ...barrelOne(0.5, 0.1)]),
      barrierBase: merge([part(new T.BoxGeometry(2.7, 0.28, 0.7), '#9aa3af', 0, 0.14, 0), part(new T.BoxGeometry(0.16, 0.5, 0.16), '#ef4444', -1.15, 1.25, 0), part(new T.BoxGeometry(0.16, 0.5, 0.16), '#ef4444', 1.15, 1.25, 0)]),
      brokentruck: merge([
        part(new T.BoxGeometry(2.2, 1.9, 3.3), '#f1f5f9', 0, 1.55, 0.5), part(new T.BoxGeometry(2.22, 0.3, 3.32), '#f97316', 0, 1.2, 0.5),
        part(new T.BoxGeometry(2.05, 1.35, 1.25), '#38bdf8', 0, 1.15, -1.85), part(new T.BoxGeometry(1.8, 0.5, 0.06), '#0f172a', 0, 1.45, -2.49),
        part(new T.BoxGeometry(2.1, 0.25, 4.6), '#1f2937', 0, 0.5, -0.1),
        ...[[-1, 1.3], [1, 1.3], [-1, -1.7], [1, -1.7]].map(([sx, z]) => { const g = new T.CylinderGeometry(0.44, 0.44, 0.3, 12); g.rotateZ(Math.PI / 2); return part(g, '#111318', sx * 1.0, 0.44, z); })
      ])
    };
    const tyre = (x, y, z) => { const g = new T.TorusGeometry(0.3, 0.14, 8, 14); g.rotateX(Math.PI / 2); return part(g, '#15171a', x, y, z); };
    OBJ_GEO.tyres = merge([0, 1, 2].flatMap((i) => [tyre(-0.5, 0.14 + i * 0.27, 0), tyre(0.5, 0.14 + i * 0.27, 0.05)]).concat([tyre(0, 0.14, 0.5), tyre(0, 0.41, 0.5)]));
    OBJ_GEO.barricade = merge([
      part(new T.BoxGeometry(1.5, 0.22, 0.06), '#f97316', 0, 0.82, 0), part(new T.BoxGeometry(1.5, 0.22, 0.06), '#f8fafc', 0, 0.5, 0),
      ...[-0.62, 0.62].flatMap((x) => [part(new T.BoxGeometry(0.07, 1.0, 0.07), '#d1d5db', x, 0.5, 0.16, 0.3, 0, 0), part(new T.BoxGeometry(0.07, 1.0, 0.07), '#d1d5db', x, 0.5, -0.16, -0.3, 0, 0)]),
      part(new T.SphereGeometry(0.09, 8, 6), '#fbbf24', -0.62, 1.03, 0), part(new T.SphereGeometry(0.09, 8, 6), '#fbbf24', 0.62, 1.03, 0)
    ]);
    OBJ_GEO.roadblockBase = merge([part(new T.BoxGeometry(0.5, 0.16, 0.6), '#4b5563', -0.85, 0.08, 0), part(new T.BoxGeometry(0.5, 0.16, 0.6), '#4b5563', 0.85, 0.08, 0), part(new T.BoxGeometry(0.1, 0.9, 0.1), '#e5e7eb', -0.85, 0.55, 0), part(new T.BoxGeometry(0.1, 0.9, 0.1), '#e5e7eb', 0.85, 0.55, 0)]);
    const roadblockPlank = new T.BoxGeometry(2.1, 0.32, 0.07); roadblockPlank.translate(0, 0.86, 0);
    const redStripeTex = (() => {
      const c = makeCanvas(128, 32), g = c.getContext('2d');
      g.fillStyle = '#f8fafc'; g.fillRect(0, 0, 128, 32); g.fillStyle = '#dc2626';
      for (let i = -1; i < 9; i++) { g.beginPath(); g.moveTo(i * 32, 32); g.lineTo(i * 32 + 16, 32); g.lineTo(i * 32 + 32, 0); g.lineTo(i * 32 + 16, 0); g.closePath(); g.fill(); }
      return canvasTex(c);
    })();
    const roadblockMat = new T.MeshLambertMaterial({ map: redStripeTex });
    const oilC = makeCanvas(128, 128);
    {
      const g = oilC.getContext('2d'); g.fillStyle = 'rgba(6,7,10,0.92)';
      for (const [x, y, rx, ry] of [[64, 64, 44, 34], [40, 52, 22, 18], [88, 78, 26, 18], [70, 38, 20, 12]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.3, 0, Math.PI * 2); g.fill(); }
      const gr = g.createLinearGradient(30, 40, 100, 90); gr.addColorStop(0, 'rgba(120,90,200,0.35)'); gr.addColorStop(0.5, 'rgba(60,160,190,0.3)'); gr.addColorStop(1, 'rgba(200,170,80,0.25)');
      g.globalCompositeOperation = 'source-atop'; g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    }
    const oilMat = new T.MeshStandardMaterial({ map: canvasTex(oilC), transparent: true, roughness: 0.08, metalness: 0.4, depthWrite: false });
    const barrierTop = new T.BoxGeometry(2.5, 0.72, 0.42); barrierTop.translate(0, 0.64, 0);
    const barrierMat = new T.MeshLambertMaterial({ map: stripeTex });
    const wreckMats = [new T.MeshLambertMaterial({ color: 0x8792a2 }), new T.MeshLambertMaterial({ color: 0x1b2330 }), new T.MeshLambertMaterial({ color: 0x6f7a8a }), darkMat];
    const OBJ_MAKE = {
      boost: makePad,
      cone: () => new T.Mesh(OBJ_GEO.cone, matVC),
      tyres: () => new T.Mesh(OBJ_GEO.tyres, matVC),
      barricade: () => new T.Mesh(OBJ_GEO.barricade, matVC),
      roadblock: () => { const g = new T.Group(); g.add(new T.Mesh(OBJ_GEO.roadblockBase, matVC), new T.Mesh(roadblockPlank, roadblockMat)); return g; },
      oil: () => { const m = new T.Mesh(flatOnRoad(2.2, 2.2), oilMat); m.position.y = 0.02; m.renderOrder = 2; const g = new T.Group(); g.add(m); return g; },
      barrel: () => new T.Mesh(OBJ_GEO.barrel, matVC),
      barrier: () => { const g = new T.Group(); g.add(new T.Mesh(OBJ_GEO.barrierBase, matVC), new T.Mesh(barrierTop, barrierMat)); return g; },
      brokentruck: () => { const g = new T.Group(), m = new T.Mesh(OBJ_GEO.brokentruck, matVC); m.rotation.y = 0.5; m.scale.setScalar(0.82); g.add(m); return g; },
      brokencar: () => {
        const g = new T.Group(), body = new T.Mesh(carBodyGeo, wreckMats); body.rotation.set(0, 0.95, 0.07); body.position.y = -0.06;
        g.add(body);
        for (const [x, z] of [[-0.9, 1.0], [0.9, -1.0]]) { const w = new T.Mesh(wheelGeo, matVC); w.position.set(x, 0.3, z); w.rotation.y = 0.95; g.add(w); }
        return g;
      }
    };
    const pools = {};
    const acquire = (type, n) => {
      const pool = pools[type] || (pools[type] = []);
      if (!pool[n]) { const m = (OBJ_MAKE[type] || OBJ_MAKE.barrier)(); scene.add(m); pool[n] = m; }
      return pool[n];
    };

    // ---------- particles ----------
    const debris = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), new T.MeshBasicMaterial({ color: 0xffffff }), 48);
    debris.frustumCulled = false; debris.count = 0; scene.add(debris);
    const smokeC = makeCanvas(64, 64);
    {
      const g = smokeC.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      gr.addColorStop(0, 'rgba(226,232,240,0.95)'); gr.addColorStop(1, 'rgba(226,232,240,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    }
    const smokeTex = canvasTex(smokeC);
    const smokes = Array.from({ length: 25 }, () => { const s = new T.Sprite(new T.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false })); s.visible = false; scene.add(s); return s; });
    const streakMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false });
    const streaks = Array.from({ length: 6 }, () => { const m = new T.Mesh(flatOnRoad(0.07, 12), streakMat); m.position.y = 0.03; m.visible = false; scene.add(m); return m; });

    // rain / snow live in a box that travels with the camera
    const PRECIP_N = 260;
    const rainPos = new Float32Array(PRECIP_N * 6), snowPos = new Float32Array(PRECIP_N * 3);
    const seed = Array.from({ length: PRECIP_N }, (_, i) => ({ x: (hash(i) - 0.5) * 44, y: hash(i + 0.37) * 22, z: -hash(i + 0.71) * 70 + 6, v: 0.7 + hash(i + 0.13) * 0.6 }));
    const rainGeo = new T.BufferGeometry(); rainGeo.setAttribute('position', new T.BufferAttribute(rainPos, 3));
    const rain = new T.LineSegments(rainGeo, new T.LineBasicMaterial({ color: 0xbfe3fb, transparent: true, opacity: 0.55, fog: false }));
    const snowGeo = new T.BufferGeometry(); snowGeo.setAttribute('position', new T.BufferAttribute(snowPos, 3));
    const snow = new T.Points(snowGeo, new T.PointsMaterial({ color: 0xffffff, size: 0.4, map: glowTex, transparent: true, depthWrite: false, fog: false }));
    rain.frustumCulled = snow.frustumCulled = false; rain.visible = snow.visible = false;
    scene.add(rain, snow);

    // ---------- weather ----------
    let weatherApplied = null;
    const applyWeather = (key) => {
      const w = SKY[key] || SKY.sunny;
      weatherApplied = key;
      const photoSky = key === 'sunny' && !!skyDome;
      scene.background = skyTex(SKY[key] ? key : 'sunny');
      if (skyDome) skyDome.visible = photoSky;
      for (const c of cloudsGL) c.visible = !photoSky;
      floraMat.color.set(w.leaf);
      scene.environmentIntensity = key === 'rain' ? 0.55 : (key === 'sunset' ? 0.8 : 1);
      scene.fog.color.set(w.fog);
      paintGrass(w.grass, w.grass2);
      hemi.color.set(w.hemi[0]); hemi.groundColor.set(w.hemi[1]); hemi.intensity = w.hemi[2];
      sun.color.set(w.sun[0]); sun.intensity = w.sun[1];
      cloudMat.color.set(w.cloud); cityMat.color.set(w.city); roadMat.color.set(w.road); leafMat.color.set(w.leaf);
      treeLineMat.color.set(key === 'snow' ? '#b9d4c4' : (key === 'sunset' ? '#5a6a22' : (key === 'rain' ? '#1f5a3a' : '#2f8a3c')));
      sunGlow.material.opacity = w.glow; sunGlow.visible = w.glow > 0 && !photoSky;
      sunGlow.position.y = key === 'sunset' ? 60 : 190;
      sunGlow.material.color.set(key === 'sunset' ? '#ffd27a' : '#ffffff');
      rain.visible = key === 'rain'; snow.visible = key === 'snow';
    };

    // ---------- sizing ----------
    let pixelCap = Math.min(window.devicePixelRatio || 1, 1.75), viewW = 0, viewH = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(160, Math.round(rect.width)), h = Math.max(140, Math.round(rect.height));
      if (w === viewW && h === viewH && renderer.getPixelRatio() === pixelCap) return;
      viewW = w; viewH = h;
      renderer.setPixelRatio(pixelCap);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // hold the horizontal view steady so the road fills the width on any phone shape
      camera.fov = Math.max(36, Math.min(74, 2 * Math.atan(Math.tan(T.MathUtils.degToRad(26)) / camera.aspect) * 180 / Math.PI));
      camPitch = 0.30 * Math.tan(T.MathUtils.degToRad(camera.fov / 2));
      camera.updateProjectionMatrix();
    };
    window.addEventListener('resize', resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas);

    // ---------- per-frame ----------
    const CAM_H = 4.9, CAM_BACK = 10.2; // higher chase cam: far obstacles and the road ahead are visible
    let camPitch = 0.22; // tan(angle below level); set from the FOV so the horizon sits ~35% down the view
    let lastT = performance.now(), wheelSpin = 0, camX = 0, fovKick = 0, slowFrames = 0, frameCount = 0;
    const tmpColor = new T.Color();
    R3D.render = () => {
      const now = performance.now(), dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
      const tSec = now * 0.001;
      resize();
      if (weatherApplied !== currentWeather) applyWeather(currentWeather);

      // adaptive resolution: step down once if the phone cannot hold the frame rate
      frameCount++;
      if (frameCount > 60 && pixelCap > 1) {
        slowFrames = dt > 0.026 ? slowFrames + 1 : Math.max(0, slowFrames - 1);
        if (slowFrames > 45) { pixelCap = Math.max(1, pixelCap - 0.35); slowFrames = 0; }
      }

      const player = cars.find((c) => c.isPlayer) || cars[0];
      if (!player) return;
      const racing = gameState === 'RACING';
      const pz = -player.z * R3D_ZS;

      // camera: chase view behind the player's car
      camX += (player.x * R3D_XS * 0.12 - camX) * Math.min(1, dt * 6);
      const boosting = racing && player.boostTimer > 0;
      fovKick += ((boosting ? 1 : 0) - fovKick) * Math.min(1, dt * 4);
      const shake = (racing && cameraShake > 0) ? cameraShake * 0.012 : 0;
      camera.position.set(camX + (Math.random() - 0.5) * shake, CAM_H + (Math.random() - 0.5) * shake, pz + CAM_BACK + fovKick * 0.5);
      camera.lookAt(camX * 0.92, CAM_H - 20 * camPitch, pz + CAM_BACK - 20);
      camera.zoom = 1 - fovKick * 0.03; camera.updateProjectionMatrix();

      const cz = camera.position.z;
      backdrop.position.set(camX * 0.4, 0, cz);
      grass.position.z = cz - GRASS_LEN * 0.35; grass.position.x = 0;
      grassTex.offset.y = -(grass.position.z / GRASS_PERIOD) % 1;
      road.position.z = cz - ROAD_LEN * 0.4; rails.position.z = road.position.z;
      roadTex.offset.y = -(road.position.z / ROAD_PERIOD) % 1;
      for (const c of cloudsGL) c.position.x = ((c.userData.x0 + tSec * c.userData.spd + 720) % 1440) - 720;

      // lane dashes + rail posts (world-anchored, wrapped ahead of the camera)
      const camTrack = -cz / R3D_ZS;
      const dBase = Math.floor(camTrack / DASH_PERIOD);
      for (let r = 0; r < DASH_ROWS; r++) {
        const tz = (dBase + r - 2) * DASH_PERIOD + DASH_PERIOD * 0.23, z = -tz * R3D_ZS;
        put(dashes, r * 3, -R3D_XS / 3, 0, z, 1, 1, 1); put(dashes, r * 3 + 1, 0, -5, z, 0, 0, 0); put(dashes, r * 3 + 2, R3D_XS / 3, 0, z, 1, 1, 1);
      }
      dashes.instanceMatrix.needsUpdate = true;
      if (dashes.instanceColor && !R3D.dashColorSent) { dashes.instanceColor.needsUpdate = true; R3D.dashColorSent = true; }
      const pBase = Math.floor(-cz / POST_GAP);
      for (let r = 0; r < POST_ROWS; r++) {
        const z = -(pBase + r - 3) * POST_GAP;
        put(posts, r * 2, -RAIL_X - 0.07, 0.39, z, 1, 1, 1); put(posts, r * 2 + 1, RAIL_X + 0.07, 0.39, z, 1, 1, 1);
      }
      posts.instanceMatrix.needsUpdate = true;
      const lBase = Math.floor(-cz / LIGHT_GAP);
      for (let r = 0; r < LIGHT_ROWS; r++) {
        const z = -(lBase + r - 1) * LIGHT_GAP, o = r * 6;
        railLightPos[o] = -RAIL_X + 0.1; railLightPos[o + 1] = 0.5; railLightPos[o + 2] = z;
        railLightPos[o + 3] = RAIL_X - 0.1; railLightPos[o + 4] = 0.5; railLightPos[o + 5] = z;
      }
      railLightGeo.attributes.position.needsUpdate = true;
      const fBase = Math.floor(camTrack / FLORA_SEG);
      if (fBase !== floraBase) { floraBase = fBase; layoutFlora(fBase); }

      // cars
      // Track distance is compressed for the scenery, so cars nose-to-tail in the simulation would
      // overlap on screen. Spread neighbours out by up to one car length, walking outward from the player.
      const order = cars.slice().sort((a, b) => a.z - b.z), pIdx = order.indexOf(player);
      const SPREAD = Math.max(0, 5.2 - 5.35 * R3D_ZS);
      const gapM = (u) => u * R3D_ZS + Math.min(u, 5.35) / 5.35 * SPREAD;
      player._vz = 0;
      for (let i = pIdx + 1; i < order.length; i++) order[i]._vz = order[i - 1]._vz + gapM(order[i].z - order[i - 1].z);
      for (let i = pIdx - 1; i >= 0; i--) order[i]._vz = order[i + 1]._vz - gapM(order[i + 1].z - order[i].z);
      for (let i = 0; i < rigs.length; i++) {
        const rig = rigs[i], car = cars[i];
        if (!car) { rig.group.visible = false; rig.tag.visible = false; continue; }
        rig.group.visible = true; rig.tag.visible = true;
        if (rig.themeKey !== car.themeKey) {
          rig.themeKey = car.themeKey;
          rig.paint.color.set(car.primaryColor); rig.stripe.color.set(car.stripeColor);
        }
        const label = car.floatLabel || car.name || '', tagKey = label + '|' + !!car.isPlayer + '|' + car.badgeColor;
        if (rig.tagKey !== tagKey) { rig.tagKey = tagKey; rig.tag.material.map = tagTex(label, !!car.isPlayer, car.badgeColor); rig.tag.material.needsUpdate = true; }
        const x = car.x * R3D_XS, z = pz - (car._vz || 0), steer = (car.targetX - car.x);
        const moving = racing ? Math.min(1, car.speed / 258) : 0;
        rig.group.position.set(x, 0, z);
        const ease = Math.min(1, dt * 9);
        rig.yaw += ((racing ? Math.max(-0.14, Math.min(0.14, -steer * 0.5)) : 0) - rig.yaw) * ease;
        rig.group.rotation.y = rig.yaw;
        rig.tilt.rotation.z += ((Math.max(-0.05, Math.min(0.05, -steer * 0.1)) - (car.hitRoll || 0) * 0.7) - rig.tilt.rotation.z) * ease;
        rig.tilt.position.y = Math.sin(tSec * 31 + i * 2.1) * 0.006 * moving;
        const spin = -(car.speed || 0) * 0.11 * dt * (racing ? 1 : 0);
        for (const w of rig.wheels) w.rotation.x += spin;
        const hot = racing && (car.boostTimer > 0 || car.speed > 195);
        for (const f of rig.flames) { f.visible = hot; if (hot) f.scale.set(0.8, 0.8, (car.boostTimer > 0 ? 0.75 : 0.32) * (0.8 + Math.random() * 0.4)); }
        if (hot) rig.flameMat.color.set(car.boostTimer > 0 ? 0x22e5ff : 0xfb923c);
        const braking = !racing || car.hitSlowTimer > 0 || (car.isPlayer && keys.brake);
        rig.setBrake(braking);
        const dist = Math.max(1, camera.position.distanceTo(rig.group.position));
        const ts = Math.max(1, dist / 13.5) * 1.3;
        rig.tag.scale.set(ts, ts / 3, 1);
        rig.tag.position.set(x, 1.4, z);
      }

      // track objects
      const used = {};
      for (const obj of trackObjects) {
        if (obj.broken) continue;
        const dzTrack = obj.z - player.z;
        if (dzTrack < -30 || dzTrack > 560) continue;
        const n = used[obj.type] = (used[obj.type] || 0) + 1;
        const m = acquire(obj.type, n - 1);
        m.visible = true;
        if (obj.type === 'boost') {
          m.position.set(obj.x * R3D_XS, 0, -(obj.z + 5) * R3D_ZS);
        } else {
          const k = obj.hitAnimTimer > 0 ? 1 - obj.hitAnimTimer / 0.32 : 0, dir = obj.hitDir || 1;
          m.position.set(obj.x * R3D_XS + dir * k * 3.2, k * 1.5, -(obj.z + 0.9) * R3D_ZS - k * 2.5);
          m.rotation.set(-k * 0.9, 0, -dir * k * 1.6);
          m.scale.setScalar(1 - k * 0.35);
        }
      }
      for (const type in pools) { const pool = pools[type], n = used[type] || 0; for (let i = n; i < pool.length; i++) pool[i].visible = false; }
      chevTex.offset.y = -(tSec * 1.6) % 1;
      padGlowMat.opacity = 0.38 + Math.sin(tSec * 5) * 0.14;

      // particles
      let dn = 0;
      for (const p of debrisParticles) {
        if (dn >= 48) break;
        const s = p.size * 0.034;
        q0.setFromAxisAngle(v3a.set(0.5, 0.7, 0.3).normalize(), p.rot);
        debris.setMatrixAt(dn, m4.compose(v3a.set(p.x * R3D_XS, Math.max(0.05, p.yOffset * 0.045), -p.z * R3D_ZS), q0, v3b.set(s, s, s)));
        debris.setColorAt(dn, tmpColor.set(p.color)); dn++;
      }
      q0.identity();
      debris.count = dn;
      if (dn) { debris.instanceMatrix.needsUpdate = true; if (debris.instanceColor) debris.instanceColor.needsUpdate = true; }
      for (let i = 0; i < smokes.length; i++) {
        const s = smokes[i], p = tireSmokeParticles[i];
        if (!p) { s.visible = false; continue; }
        s.visible = true; s.material.opacity = Math.max(0, p.alpha);
        const r = p.r * 0.11; s.scale.set(r, r, 1);
        s.position.set(p.x * R3D_XS, 0.35 + r * 0.3, -p.z * R3D_ZS + 2.6);
      }
      const fast = racing && player.speed > 195;
      for (let i = 0; i < streaks.length; i++) {
        const s = streaks[i]; s.visible = fast;
        if (fast) s.position.set((-0.88 + i * 0.35) * R3D_XS, 0.03, pz - ((tSec * 95 + i * 23) % 85) * R3D_ZS);
      }
      if (fast) { streakMat.color.set(player.boostTimer > 0 ? 0x38bdf8 : 0xffffff); streakMat.opacity = player.boostTimer > 0 ? 0.3 : 0.12; }

      if (rain.visible) {
        for (let i = 0; i < PRECIP_N; i++) {
          const s = seed[i]; s.y -= 34 * s.v * dt; if (s.y < 0) s.y += 22;
          const o = i * 6, x = camX + s.x, z = cz + s.z;
          rainPos[o] = x; rainPos[o + 1] = s.y; rainPos[o + 2] = z; rainPos[o + 3] = x - 0.18; rainPos[o + 4] = s.y + 0.95; rainPos[o + 5] = z;
        }
        rainGeo.attributes.position.needsUpdate = true;
      } else if (snow.visible) {
        for (let i = 0; i < PRECIP_N; i++) {
          const s = seed[i]; s.y -= 3.2 * s.v * dt; if (s.y < 0) s.y += 22;
          const o = i * 3; snowPos[o] = camX + s.x + Math.sin(tSec * s.v + i) * 0.6; snowPos[o + 1] = s.y; snowPos[o + 2] = cz + s.z;
        }
        snowGeo.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);

      // The 2D canvas stays on top as a transparent layer for the position meter only.
      if (racing) { ctx.clearRect(0, 0, cw, ch); drawRightMiniMap(); R3D.overlayDirty = true; }
      else if (R3D.overlayDirty) { ctx.clearRect(0, 0, cw, ch); R3D.overlayDirty = false; }
    };

    R3D.renderer = renderer; R3D.scene = scene; R3D.camera = camera;
    if (R3D.status === 'pending') R3D.status = 'ready';
  }

  function r3dBoot() {
    if (R3D.status !== 'pending') return;
    if (!window.THREE || !window.THREE.WebGLRenderer) { r3dFail(window.__trThreeError || 'three.js not loaded'); return; }
    if (R3D.booting) return;
    R3D.booting = true;
    r3dInit().catch((err) => {
      if (R3D.glCanvas && R3D.glCanvas.parentNode) R3D.glCanvas.parentNode.removeChild(R3D.glCanvas);
      r3dFail(err && err.message);
    });
  }
  if (window.THREE || window.__trThreeError) r3dBoot();
  else {
    window.addEventListener('tr-three', r3dBoot, { once: true });
    setTimeout(() => { if (R3D.status === 'pending' && !R3D.booting) r3dFail('three.js load timed out'); }, 7000);
  }

  function renderScene() {
    if (R3D.status === 'ready') {
      try { R3D.render(); } catch (err) { r3dFail(err && err.message); }
      return;
    }
    if (R3D.status === 'failed') renderScene2D();
    // while the library is still loading nothing is drawn (dark viewport for a moment)
  }

