// Trader Race 3D - real-time Three.js race scene.
// Draws the 3D world (road, cars, trees, towers, obstacles) on a transparent
// WebGL canvas that sits above the 2D sky/cloud canvas of index.html.
// The game logic stays in index.html; it calls window.TR3D.render(state) each frame.
import * as THREE from './lib/three.module.min.js';
import { GLTFLoader } from './lib/GLTFLoader.js';
import { MeshoptDecoder } from './lib/meshopt_decoder.module.js';

const TR3D = (window.TR3D = window.TR3D || {});
TR3D.ready = false;
TR3D.failed = false;
TR3D.progress = 0;

const BASE = new URL('./assets/', import.meta.url).href;
const XS = 6.8;            // game x unit (road half width) -> metres
const ZS = 0.7;            // game z unit -> metres (30% calmer visual speed)
const LANE_W = 0.5 * XS;
const ROAD_HALF = 1.10 * XS;
const DASH_PERIOD = 19 * ZS;
const TILE_LEN = 180;
const CAR_SCALE = 1.25;
const START_Z = 3.6;       // checkered strip, metres ahead of the grid
const SKY_HORIZON = 0xd4f0ff;

let renderer, scene, camera, sun, envTex;
let canvasEl, lastW = 0, lastH = 0, pixelRatio = 1;
let road, ground, cityGroup, finishGroup;
const tiles = [];
const carRigs = new Map();
let carProto = null;
const obstaclePools = {};
let debrisMesh;
const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
const camState = { x: 0, fov: 50 };
let lastT = 0, slowFrames = 0, fastChecked = 0;

function rng(seed) {
  let h = seed >>> 0;
  return () => {
    h += 0x6D2B79F5;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw, opts = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = opts.aniso || 1;
  if (opts.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  return t;
}

// ---------------------------------------------------------------- world
function buildEnvironment() {
  const eq = canvasTex(512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#1f6fd6');
    gr.addColorStop(0.42, '#8fcbff');
    gr.addColorStop(0.5, '#eef8ff');
    gr.addColorStop(0.52, '#5f8f55');
    gr.addColorStop(1, '#3a4048');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const s = g.createRadialGradient(w * 0.3, h * 0.2, 2, w * 0.3, h * 0.2, 60);
    s.addColorStop(0, 'rgba(255,255,255,1)'); s.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = s; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.85)';
    for (let i = 0; i < 9; i++) g.fillRect((i * 61) % w, h * 0.22 + (i % 3) * 14, 46, 9);
  });
  eq.mapping = THREE.EquirectangularReflectionMapping;
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromEquirectangular(eq).texture;
  scene.environment = envTex;
  eq.dispose(); pm.dispose();
}

function buildRoad(aniso) {
  const W = 1024, H = 1024;
  const tex = canvasTex(W, H, (g) => {
    const u = (x) => ((x + 1.10) / 2.20) * W;      // game x -> px
    g.fillStyle = '#7b8696'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#434a56'; g.fillRect(u(-1), 0, u(1) - u(-1), H);
    const r = rng(7);
    for (let i = 0; i < 9000; i++) {
      const x = u(-1) + r() * (u(1) - u(-1)), y = r() * H, a = r();
      g.fillStyle = a < 0.5 ? 'rgba(20,24,30,0.16)' : 'rgba(190,200,215,0.10)';
      g.fillRect(x, y, 1 + r() * 2, 1 + r() * 3);
    }
    for (const lc of [-0.75, -0.25, 0.25, 0.75]) {   // tyre-worn lane centres
      const gr = g.createLinearGradient(u(lc - 0.16), 0, u(lc + 0.16), 0);
      gr.addColorStop(0, 'rgba(20,24,32,0)'); gr.addColorStop(0.5, 'rgba(20,24,32,0.16)'); gr.addColorStop(1, 'rgba(20,24,32,0)');
      g.fillStyle = gr; g.fillRect(u(lc - 0.16), 0, u(lc + 0.16) - u(lc - 0.16), H);
    }
    g.fillStyle = '#f4f6f8';
    g.fillRect(u(-1.0), 0, u(-0.972) - u(-1.0), H);
    g.fillRect(u(0.972), 0, u(1.0) - u(0.972), H);
    const dash = H * 0.30;
    for (const sp of [-0.5, 0.5]) g.fillRect(u(sp - 0.016), 0, u(sp + 0.016) - u(sp - 0.016), dash);
    g.fillStyle = '#f6c915';
    g.fillRect(u(-0.02), 0, u(0.02) - u(-0.02), dash);
  }, { aniso, repeat: true });
  const LEN = 420;
  tex.repeat.set(1, LEN / DASH_PERIOD);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(ROAD_HALF * 2, LEN),
    new THREE.MeshStandardMaterial({ map: tex, roughness: 0.86, metalness: 0, envMapIntensity: 0.35 })
  );
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  m.userData.len = LEN;
  scene.add(m);
  road = m;

  const gtex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#35a53a'; g.fillRect(0, 0, w, h);
    const r = rng(11);
    for (let i = 0; i < 2600; i++) {
      const v = r();
      g.fillStyle = v < 0.4 ? 'rgba(28,110,36,0.35)' : (v < 0.8 ? 'rgba(96,190,74,0.30)' : 'rgba(190,220,90,0.18)');
      g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 5);
    }
  }, { aniso: 4, repeat: true });
  gtex.repeat.set(900 / 14, 700 / 14);
  ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 700),
    new THREE.MeshStandardMaterial({ map: gtex, roughness: 1, metalness: 0, envMapIntensity: 0.2 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.04;
  ground.receiveShadow = true;
  scene.add(ground);
}

function flatDecal(tex, w, d, y) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, metalness: 0, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, envMapIntensity: 0.3 })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}

function buildLineMarking(text, aniso) {
  const g = new THREE.Group();
  const chk = canvasTex(512, 64, (c, w, h) => {
    const n = 16, s = w / n;
    for (let r = 0; r < 2; r++) for (let i = 0; i < n; i++) {
      c.fillStyle = (r + i) % 2 === 0 ? '#f8fafc' : '#10151f';
      c.fillRect(i * s, r * h / 2, s + 1, h / 2 + 1);
    }
  }, { aniso });
  const strip = flatDecal(chk, 2 * XS, 2.6, 0.012);
  g.add(strip);
  const tt = canvasTex(1024, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.font = '900 italic 205px "Arial Black", "Segoe UI", Arial, sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(248,250,252,0.95)';
    c.fillText(text, w / 2, h / 2 + 8, w * 0.94);
  }, { aniso });
  const label = flatDecal(tt, 1.3 * XS, 6.6, 0.014);
  label.position.z = -12.5;
  g.add(label);
  return g;
}

function towerTexture(base, line, lit, cols, rows) {
  return canvasTex(128, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(cols * 31 + rows);
    const cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      if (r() < 0.22) { g.fillStyle = lit; g.fillRect(x * cw + 1, y * rh + 1, cw - 2, rh - 2); }
    }
    g.strokeStyle = line; g.lineWidth = 1.5;
    for (let x = 0; x <= cols; x++) { g.beginPath(); g.moveTo(x * cw, 0); g.lineTo(x * cw, h); g.stroke(); }
    for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * rh); g.lineTo(w, y * rh); g.stroke(); }
  });
}

function buildCity() {
  cityGroup = new THREE.Group();
  const skins = [
    towerTexture(['#5aa6ea', '#2f6fb8'], 'rgba(210,235,255,0.55)', 'rgba(225,244,255,0.55)', 6, 18),
    towerTexture(['#4b93d8', '#27598f'], 'rgba(20,45,80,0.55)', 'rgba(200,230,255,0.50)', 4, 22),
    towerTexture(['#7fbdf0', '#3f82c6'], 'rgba(235,246,255,0.60)', 'rgba(255,255,255,0.45)', 8, 14),
    towerTexture(['#3f7fc4', '#1f4d82'], 'rgba(170,210,250,0.45)', 'rgba(215,238,255,0.55)', 5, 26)
  ];
  const mats = skins.map((t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.35, metalness: 0.25, envMapIntensity: 0.9, fog: false }));
  const capMat = new THREE.MeshStandardMaterial({ color: 0xcfe3f5, roughness: 0.6, fog: false });
  const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const cone = new THREE.ConeGeometry(0.5, 1, 4); cone.translate(0, 0.5, 0);
  const r = rng(2024);
  const add = (geo, mat, x, y, z, sx, sy, sz, ry = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry;
    cityGroup.add(m);
  };
  const N = 26;
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    let x = -330 + t * 660 + (r() - 0.5) * 14;
    if (Math.abs(x) < 34) x = (x < 0 ? -1 : 1) * (34 + r() * 20);
    const z = -(r() * 110);
    const kind = i % 4, mat = mats[(i * 3 + 1) % mats.length];
    const h = 34 + r() * 56, w = 15 + r() * 13;
    if (kind === 0) {                         // glass slab
      add(box, mat, x, 0, z, w, h, w * 0.8, r() * 0.5);
      add(box, capMat, x, h, z, w * 0.5, 3, w * 0.4);
    } else if (kind === 1) {                  // stepped
      add(box, mat, x, 0, z, w * 1.15, h * 0.5, w * 1.1);
      add(box, mat, x, h * 0.5, z, w * 0.82, h * 0.3, w * 0.8);
      add(box, mat, x, h * 0.8, z, w * 0.5, h * 0.2, w * 0.5);
      add(cone, capMat, x, h, z, 2.2, 14, 2.2);
    } else if (kind === 2) {                  // slim spire
      add(box, mat, x, 0, z, w * 0.62, h * 1.25, w * 0.62, 0.4);
      add(cone, capMat, x, h * 1.25, z, w * 0.62, 20, w * 0.62, 0.4 + Math.PI / 4);
    } else {                                  // wide block
      add(box, mat, x, 0, z, w * 1.7, h * 0.62, w * 1.0, r() * 0.3);
      add(box, capMat, x - w * 0.3, h * 0.62, z, w * 0.5, 5, w * 0.5);
    }
  }
  scene.add(cityGroup);
}

// ---------------------------------------------------------------- roadside tiles
function floatGeometry(src, matrix) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const n = a.itemSize, out = new Float32Array(a.count * n);
    for (let i = 0; i < a.count; i++) {
      out[i * n] = a.getX(i); out[i * n + 1] = a.getY(i);
      if (n > 2) out[i * n + 2] = a.getZ(i);
    }
    g.setAttribute(name, new THREE.BufferAttribute(out, n));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index.array), 1));
  g.applyMatrix4(matrix);
  return g;
}

function extractTrees(gltf, kind) {
  gltf.scene.updateMatrixWorld(true);
  const byName = {};
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    const key = o.name.replace(/_LOD1.*$/, '');
    const isBark = /Bark/i.test(o.name);
    const geo = floatGeometry(o.geometry, o.matrixWorld);
    const mat = o.material;
    mat.envMapIntensity = 0.25;
    mat.metalness = 0;
    if (!isBark) {
      mat.transparent = false; mat.alphaTest = 0.32; mat.side = THREE.DoubleSide; mat.depthWrite = true;
      mat.roughness = 0.9;
      mat.color.multiplyScalar(1.12);
    }
    (byName[key] = byName[key] || { kind })[isBark ? 'bark' : 'leaf'] = { geo, mat };
  });
  const out = [];
  for (const k of Object.keys(byName)) {
    const t = byName[k];
    if (!t.bark || !t.leaf) continue;
    // recentre on the trunk base
    const p = t.bark.geo.getAttribute('position');
    t.bark.geo.computeBoundingBox();
    const minY = t.bark.geo.boundingBox.min.y;
    let sx = 0, sz = 0, n = 0;
    for (let i = 0; i < p.count; i++) if (p.getY(i) < minY + 0.35) { sx += p.getX(i); sz += p.getZ(i); n++; }
    const ox = n ? sx / n : 0, oz = n ? sz / n : 0;
    t.bark.geo.translate(-ox, -minY - 0.05, -oz);
    t.leaf.geo.translate(-ox, -minY - 0.05, -oz);
    t.leaf.geo.computeBoundingBox();
    t.height = t.leaf.geo.boundingBox.max.y;
    t.tris = ((t.leaf.geo.index ? t.leaf.geo.index.count : 0) + (t.bark.geo.index ? t.bark.geo.index.count : 0)) / 3;
    t.spread = Math.max(t.leaf.geo.boundingBox.max.x - t.leaf.geo.boundingBox.min.x, t.leaf.geo.boundingBox.max.z - t.leaf.geo.boundingBox.min.z);
    out.push(t);
  }
  return out;
}

function buildTiles(trees) {
  const r = rng(90210);
  const perTree = trees.map(() => []);
  const blobs = [];
  const broad = trees.map((t, i) => (t.kind === 'maple' ? i : -1)).filter((i) => i >= 0);
  const pines = trees.map((t, i) => (t.kind === 'pine' ? i : -1)).filter((i) => i >= 0);
  // uneven density: dense stretches and gaps along the tile
  const dens = (z) => {
    const a = Math.sin((z / TILE_LEN) * Math.PI * 2 * 2 + 0.6), b = Math.sin((z / TILE_LEN) * Math.PI * 2 * 5 + 2.1);
    return THREE.MathUtils.clamp(0.48 + 0.42 * a + 0.16 * b, 0.05, 1);
  };
  for (const side of [-1, 1]) {
    for (let z = 2; z < TILE_LEN - 2; z += 3.0) {
      const d = dens(z + (side > 0 ? 37 : 0));
      const rows = d > 0.7 ? 2 : 1;
      for (let k = 0; k < rows; k++) {
        if (r() > d * 0.56) continue;
        const pool = (r() < 0.3 && pines.length) ? pines : (broad.length ? broad : pines);
        let ti = pool[Math.floor(r() * pool.length)];
        if (trees[ti].tris > 3000) ti = pool[Math.floor(r() * pool.length)];   // prefer lighter variants
        const t = trees[ti];
        const wantH = (t.kind === 'pine' ? 13 : 11) + r() * 6;
        const s = wantH / t.height;
        const x = side * (ROAD_HALF + 2.4 + Math.pow(r(), 1.7) * 26 + k * 4);
        tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * Math.PI * 2);
        tmpM.compose(tmpV.set(x, 0, -(z + r() * 2)), tmpQ, tmpS.set(s, s * (0.92 + r() * 0.2), s));
        perTree[ti].push(tmpM.clone());
        const br = t.spread * s * 0.62;
        blobs.push(new THREE.Matrix4().compose(new THREE.Vector3(x + br * 0.25, 0.03, -(z + 1) - br * 0.1), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), new THREE.Vector3(br * 2, br * 2, 1)));
      }
    }
  }
  const instanced = (geo, mat, mats, shadow) => {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = false; im.receiveShadow = !!shadow;
    im.computeBoundingSphere();
    return im;
  };

  // shared small props
  const blobTex = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(8,30,12,0.62)'); gr.addColorStop(0.6, 'rgba(8,30,12,0.34)'); gr.addColorStop(1, 'rgba(8,30,12,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
  const blobGeo = new THREE.PlaneGeometry(1, 1);

  const tuftGeo = new THREE.ConeGeometry(0.11, 0.34, 4); tuftGeo.translate(0, 0.17, 0);
  const tuftMat = new THREE.MeshStandardMaterial({ roughness: 1, envMapIntensity: 0.2 });
  const tufts = [], tuftCols = [];
  const flowerGeo = new THREE.SphereGeometry(0.11, 6, 5);
  const flowerMat = new THREE.MeshStandardMaterial({ roughness: 0.7, envMapIntensity: 0.3 });
  const flowers = [], flowerCols = [];
  const fcols = [0xffffff, 0xffe14d, 0xff6fae, 0xffffff, 0xff8a3d];
  for (const side of [-1, 1]) {
    for (let i = 0; i < 420; i++) {
      const x = side * (ROAD_HALF + 0.9 + Math.pow(r(), 1.6) * 16), z = -r() * TILE_LEN, s = 0.7 + r() * 1.5;
      tmpQ.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, r() * 6.28);
      tufts.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), tmpQ.clone(), new THREE.Vector3(s, s * (0.8 + r() * 0.9), s)));
      tuftCols.push(new THREE.Color().setHSL(0.31 + r() * 0.04, 0.6, 0.2 + r() * 0.1));
    }
    for (let i = 0; i < 70; i++) {
      const x = side * (ROAD_HALF + 1.0 + r() * 9), z = -r() * TILE_LEN;
      flowers.push(new THREE.Matrix4().compose(new THREE.Vector3(x, 0.22 + r() * 0.18, z), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)));
      flowerCols.push(new THREE.Color(fcols[Math.floor(r() * fcols.length)]));
    }
  }
  const rockGeo = new THREE.DodecahedronGeometry(0.6, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x8a8f96, roughness: 0.95, flatShading: true, envMapIntensity: 0.3 });
  const rocks = [];
  for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1, s = 0.7 + r() * 1.5;
    tmpQ.setFromEuler(new THREE.Euler(r() * 3, r() * 6, r() * 3));
    rocks.push(new THREE.Matrix4().compose(new THREE.Vector3(side * (ROAD_HALF + 1.8 + r() * 9), s * 0.18, -r() * TILE_LEN), tmpQ.clone(), new THREE.Vector3(s * 1.3, s * 0.7, s)));
  }

  // guard rails
  const railX = 1.13 * XS + 0.25;
  const postGeo = new THREE.BoxGeometry(0.12, 0.8, 0.12); postGeo.translate(0, 0.4, 0);
  const metal = new THREE.MeshStandardMaterial({ color: 0xb9c2cc, roughness: 0.42, metalness: 0.85, envMapIntensity: 1.0 });
  const posts = [], refl = [];
  for (const side of [-1, 1]) for (let z = 0, i = 0; z < TILE_LEN; z += 4, i++) {
    posts.push(new THREE.Matrix4().makeTranslation(side * railX, 0, -z));
    if (i % 3 === 0) refl.push(new THREE.Matrix4().makeTranslation(side * (railX - 0.1), 0.86, -z));
  }
  const beamGeo = new THREE.BoxGeometry(0.07, 0.3, TILE_LEN);
  const reflGeo = new THREE.SphereGeometry(0.11, 8, 6);
  const reflMat = new THREE.MeshBasicMaterial({ color: 0x4dffb0 });

  for (let k = 0; k < 3; k++) {
    const g = new THREE.Group();
    trees.forEach((t, i) => {
      if (!perTree[i].length) return;
      g.add(instanced(t.bark.geo, t.bark.mat, perTree[i]));
      g.add(instanced(t.leaf.geo, t.leaf.mat, perTree[i]));
    });
    const bl = instanced(blobGeo, blobMat, blobs); bl.renderOrder = 1; g.add(bl);
    const tf = instanced(tuftGeo, tuftMat, tufts, true); tuftCols.forEach((c, i) => tf.setColorAt(i, c)); g.add(tf);
    const fl = instanced(flowerGeo, flowerMat, flowers); flowerCols.forEach((c, i) => fl.setColorAt(i, c)); g.add(fl);
    g.add(instanced(rockGeo, rockMat, rocks, true));
    g.add(instanced(postGeo, metal, posts));
    g.add(instanced(reflGeo, reflMat, refl));
    for (const side of [-1, 1]) for (const y of [0.62]) {
      const b = new THREE.Mesh(beamGeo, metal);
      b.position.set(side * (railX - 0.08), y, -TILE_LEN / 2);
      g.add(b);
    }
    scene.add(g);
    tiles.push(g);
  }
}

// ---------------------------------------------------------------- cars
function makePaint(hex) {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex), metalness: 0.45, roughness: 0.3,
    clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.35
  });
}

function prepareCar(gltf) {
  const root = gltf.scene;
  root.traverse((o) => {
    if (!o.isMesh) return;
    const nm = o.name || '';
    if (/glows/i.test(nm)) { o.visible = /brakes|position_back/i.test(nm); o.castShadow = false; return; }
    o.castShadow = /carpaint|chassis_bottom|tyres/i.test(nm);   // few shadow casters = cheap shadow pass
    if (o.material && o.material.name === 'Material.001') o.userData.paint = true;
  });
  const holder = new THREE.Group();
  holder.add(root);
  root.scale.setScalar(CAR_SCALE);
  root.rotation.y = Math.PI;               // model nose (+Z) -> race direction (-Z)
  carProto = holder;
}

function cloneCar(hex) {
  const c = carProto.clone(true);
  const paint = makePaint(hex);
  const wheels = [];
  c.traverse((o) => {
    if (o.isMesh && o.userData.paint) o.material = paint;
    if (/bone_wheel_.*_rotation/i.test(o.name)) wheels.push(o);
  });
  c.userData.paint = paint;
  c.userData.wheels = wheels;
  return c;
}

function drawTag(rig, label, isYou, badge) {
  const key = label + '|' + isYou + '|' + badge;
  if (rig.tagKey === key) return;
  rig.tagKey = key;
  const c = rig.tagCanvas, g = c.getContext('2d'), w = c.width, h = c.height;
  g.clearRect(0, 0, w, h);
  const bh = 78, by = 6, rr = 22;
  g.beginPath();
  g.moveTo(6 + rr, by); g.arcTo(w - 6, by, w - 6, by + bh, rr); g.arcTo(w - 6, by + bh, 6, by + bh, rr);
  g.arcTo(6, by + bh, 6, by, rr); g.arcTo(6, by, w - 6, by, rr); g.closePath();
  g.fillStyle = isYou ? 'rgba(22,163,74,0.96)' : 'rgba(8,13,24,0.92)';
  g.fill();
  g.lineWidth = isYou ? 6 : 5;
  g.strokeStyle = isYou ? '#bbf7d0' : badge;
  g.stroke();
  if (isYou) {
    g.fillStyle = '#4ade80';
    g.beginPath(); g.moveTo(w / 2 - 20, by + bh); g.lineTo(w / 2 + 20, by + bh); g.lineTo(w / 2, by + bh + 26); g.closePath(); g.fill();
  }
  g.fillStyle = badge;
  g.beginPath(); g.arc(52, by + bh / 2, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#ffffff';
  g.font = '900 italic 44px "Segoe UI", Arial, sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, w / 2 + 28, by + bh / 2 + 2, w - 120);
  rig.tagTex.needsUpdate = true;
}

function getRig(car) {
  let rig = carRigs.get(car.id);
  if (rig && rig.color === car.primaryColor) return rig;
  if (rig) scene.remove(rig.group);
  const group = new THREE.Group();
  const body = cloneCar(car.primaryColor || '#e61e25');
  group.add(body);
  const tagCanvas = document.createElement('canvas'); tagCanvas.width = 384; tagCanvas.height = 116;
  const tagTex = new THREE.CanvasTexture(tagCanvas); tagTex.colorSpace = THREE.SRGBColorSpace;
  const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tagTex, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  tag.scale.set(2.7, 2.7 * 116 / 384, 1);
  tag.position.y = 2.25;
  tag.renderOrder = 20;
  group.add(tag);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.6), new THREE.MeshBasicMaterial({ color: 0x00d4ff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.rotation.x = -Math.PI / 2; glow.position.y = 0.03; glow.visible = false;
  group.add(glow);
  const flameGeo = new THREE.ConeGeometry(0.13, 1, 8); flameGeo.rotateX(Math.PI / 2); flameGeo.translate(0, 0, 0.5);
  const flameMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
  const flames = [-0.42, 0.42].map((x) => { const f = new THREE.Mesh(flameGeo, flameMat); f.position.set(x, 0.42, 2.85); f.visible = false; group.add(f); return f; });
  scene.add(group);
  rig = { group, body, tag, tagCanvas, tagTex, tagKey: '', glow, flames, flameMat, color: car.primaryColor };
  carRigs.set(car.id, rig);
  return rig;
}

// ---------------------------------------------------------------- obstacles
const OB = {};
function obMats() {
  if (OB.ready) return;
  OB.ready = true;
  OB.orange = new THREE.MeshStandardMaterial({ color: 0xff5a0a, roughness: 0.55 });
  OB.white = new THREE.MeshStandardMaterial({ color: 0xf5f7fa, roughness: 0.5 });
  OB.dark = new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.8 });
  OB.yellow = new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.55 });
  OB.concrete = new THREE.MeshStandardMaterial({ color: 0xc9ced6, roughness: 0.9 });
  OB.red = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
  OB.blue = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.5 });
  OB.glass = new THREE.MeshStandardMaterial({ color: 0x0f1c2e, roughness: 0.15, metalness: 0.6 });
  OB.boostTex = canvasTex(256, 384, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#38d4ff'); gr.addColorStop(1, '#0a6fe0');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,0.28)';
    for (let y = 14; y < h; y += 26) for (let x = 14 + ((y / 26) % 2) * 13; x < w; x += 26) { g.beginPath(); g.arc(x, y, 4.5, 0, 6.3); g.fill(); }
    g.strokeStyle = '#ffffff'; g.lineWidth = 22; g.lineJoin = 'miter';
    for (const y0 of [300, 200, 100]) { g.beginPath(); g.moveTo(50, y0 + 40); g.lineTo(w / 2, y0 - 40); g.lineTo(w - 50, y0 + 40); g.stroke(); }
    g.strokeStyle = '#e8fbff'; g.lineWidth = 12; g.strokeRect(6, 6, w - 12, h - 12);
  }, { aniso: 8 });
}
const part = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; return m; };

const OB_BUILD = {
  boost() {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W * 0.86, 4.6), new THREE.MeshBasicMaterial({ map: OB.boostTex, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.02;
    const g = new THREE.Group(); g.add(m); g.userData.flat = m; return g;
  },
  cone() {
    const g = new THREE.Group();
    for (const [x, z] of [[-0.75, 0.2], [0, -0.25], [0.75, 0.2]]) {
      g.add(part(new THREE.BoxGeometry(0.62, 0.07, 0.62), OB.dark, x, 0.035, z));
      g.add(part(new THREE.ConeGeometry(0.24, 0.95, 14), OB.orange, x, 0.52, z));
      g.add(part(new THREE.CylinderGeometry(0.115, 0.165, 0.2, 14), OB.white, x, 0.56, z));
    }
    return g;
  },
  barrel() {
    const g = new THREE.Group();
    for (const x of [-0.55, 0.55]) {
      g.add(part(new THREE.CylinderGeometry(0.42, 0.42, 1.15, 18), OB.orange, x, 0.575, 0));
      g.add(part(new THREE.CylinderGeometry(0.43, 0.43, 0.16, 18), OB.white, x, 0.82, 0));
      g.add(part(new THREE.CylinderGeometry(0.43, 0.43, 0.16, 18), OB.white, x, 0.38, 0));
    }
    return g;
  },
  barrier() {
    const g = new THREE.Group();
    const s = new THREE.Shape();
    s.moveTo(-0.34, 0); s.lineTo(0.34, 0); s.lineTo(0.34, 0.14); s.lineTo(0.13, 0.42); s.lineTo(0.09, 0.98); s.lineTo(-0.09, 0.98); s.lineTo(-0.13, 0.42); s.lineTo(-0.34, 0.14); s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, { depth: 2.7, bevelEnabled: false });
    geo.rotateY(Math.PI / 2); geo.translate(-1.35, 0, 0);
    g.add(part(geo, OB.concrete, 0, 0, 0));
    for (let i = 0; i < 6; i++) g.add(part(new THREE.BoxGeometry(0.4, 0.2, 0.21), i % 2 ? OB.dark : OB.yellow, -1.125 + i * 0.45, 0.82, 0));
    return g;
  },
  brokentruck() {
    const g = new THREE.Group();
    g.add(part(new THREE.BoxGeometry(2.1, 2.0, 3.6), OB.white, 0, 1.55, -0.6));
    g.add(part(new THREE.BoxGeometry(2.12, 0.42, 3.62), OB.orange, 0, 1.2, -0.6));
    g.add(part(new THREE.BoxGeometry(2.0, 1.45, 1.5), OB.blue, 0, 1.2, 2.0));
    g.add(part(new THREE.BoxGeometry(1.8, 0.6, 0.06), OB.glass, 0, 1.5, 2.76));
    const wg = new THREE.CylinderGeometry(0.46, 0.46, 0.32, 16); wg.rotateZ(Math.PI / 2);
    for (const [x, z] of [[-1, 1.9], [1, 1.9], [-1, -1.4], [1, -1.4]]) g.add(part(wg, OB.dark, x, 0.46, z));
    g.add(part(new THREE.BoxGeometry(0.3, 0.3, 0.1), OB.yellow, -0.75, 0.75, -2.42));
    g.add(part(new THREE.BoxGeometry(0.3, 0.3, 0.1), OB.yellow, 0.75, 0.75, -2.42));
    g.rotation.y = 0.16; g.scale.setScalar(0.92);
    const w = new THREE.Group(); w.add(g); return w;
  },
  brokencar() {
    const w = new THREE.Group();
    if (carProto) {
      const c = cloneCar('#7a1418');
      c.userData.paint.roughness = 0.75; c.userData.paint.clearcoat = 0.2;
      c.rotation.y = 0.55; c.rotation.z = 0.05; c.scale.setScalar(0.94);
      w.add(c);
    }
    const tri = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.6, 3), OB.red); tri.position.set(-1.1, 0.3, 3.0); tri.castShadow = true;
    w.add(tri);
    return w;
  }
};

function placeObstacles(st, camDist, time) {
  obMats();
  for (const k in obstaclePools) obstaclePools[k].used = 0;
  const list = st.trackObjects || [];
  for (let i = 0; i < list.length; i++) {
    const o = list[i];
    if (o.broken) continue;
    const d = o.z * ZS;
    if (d < camDist - 8 || d > camDist + 270) continue;
    const type = OB_BUILD[o.type] ? o.type : 'cone';
    const pool = obstaclePools[type] || (obstaclePools[type] = { items: [], used: 0 });
    let m = pool.items[pool.used];
    if (!m) { m = OB_BUILD[type](); scene.add(m); pool.items.push(m); }
    pool.used++;
    m.visible = true;
    m.position.set(o.x * XS, 0, -d);
    m.rotation.set(0, 0, 0); m.scale.setScalar(1);
    if (type === 'boost') {
      m.userData.flat.material.opacity = 0.82 + 0.16 * Math.sin(time * 6 + o.id);
    } else if (o.hitAnimTimer > 0) {
      const t = 1 - Math.max(0, Math.min(1, o.hitAnimTimer / 0.32)), dir = o.hitDir || 1;
      m.position.x += dir * t * 2.2; m.position.y += Math.sin(t * Math.PI) * 1.4 + t * 0.3; m.position.z -= t * 5;
      m.rotation.set(t * 1.6, dir * t * 1.1, dir * t * 1.9);
      m.scale.setScalar(1 - t * 0.35);
    }
  }
  for (const k in obstaclePools) { const p = obstaclePools[k]; for (let i = p.used; i < p.items.length; i++) p.items[i].visible = false; }
}

// ---------------------------------------------------------------- setup
function setProgress(p) {
  TR3D.progress = p;
  if (typeof TR3D.onProgress === 'function') { try { TR3D.onProgress(p); } catch (e) {} }
}

async function init() {
  canvasEl = document.getElementById('raceCanvas3d');
  if (!canvasEl) throw new Error('no 3d canvas');
  renderer = new THREE.WebGLRenderer({ canvas: canvasEl, antialias: true, alpha: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvasEl.addEventListener('webglcontextlost', (e) => { e.preventDefault(); TR3D.ready = false; TR3D.lost = true; });
  canvasEl.addEventListener('webglcontextrestored', () => { TR3D.lost = false; TR3D.ready = true; });

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe6ff, 95, 285);
  camera = new THREE.PerspectiveCamera(50, 1, 0.5, 900);

  scene.add(new THREE.HemisphereLight(0xdcefff, 0x5a8a48, 1.25));
  sun = new THREE.DirectionalLight(0xfff1d6, 2.7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -15; sc.right = 15; sc.top = 20; sc.bottom = -14; sc.near = 1; sc.far = 120;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03;
  scene.add(sun); scene.add(sun.target);

  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  buildEnvironment();
  buildRoad(aniso);
  const start = buildLineMarking('START', aniso); start.position.z = -START_Z; scene.add(start);
  finishGroup = buildLineMarking('FINISH', aniso); scene.add(finishGroup);
  buildCity();

  debrisMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6 }), 96);
  debrisMesh.count = 0; debrisMesh.frustumCulled = false;
  debrisMesh.setColorAt(0, tmpC.set(0xffffff));
  scene.add(debrisMesh);
  setProgress(0.1);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  let done = 0;
  const load = (u) => loader.loadAsync(BASE + u).then((g) => { done++; setProgress(0.1 + 0.8 * done / 3); return g; });
  const [car, maple, pine] = await Promise.all([
    load('cars/ferrari_f8_tributo.glb'),
    load('trees/maple_trees.glb').catch(() => null),
    load('trees/pine_trees.glb').catch(() => null)
  ]);
  prepareCar(car);
  const trees = [];
  if (maple) trees.push(...extractTrees(maple, 'maple'));
  if (pine) trees.push(...extractTrees(pine, 'pine'));
  buildTiles(trees);
  setProgress(1);
  TR3D.ready = true;
}

function resize(w, h) {
  if (w === lastW && h === lastH) return;
  lastW = w; lastH = h;
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
}

// ---------------------------------------------------------------- per frame
TR3D.render = function (st) {
  if (!TR3D.ready || !renderer) return false;
  const now = performance.now();
  const dt = Math.min(0.1, lastT ? (now - lastT) / 1000 : 0.016);
  lastT = now;
  const time = now * 0.001;

  const w = canvasEl.clientWidth | 0, h = canvasEl.clientHeight | 0;
  if (w < 2 || h < 2) return false;
  resize(w, h);

  const cars = st.cars || [];
  const player = st.player || cars[0];
  if (!player) return false;
  const racing = st.gameState === 'RACING';
  const pDist = player.z * ZS;

  // cars
  const seen = new Set();
  for (const car of cars) {
    const rig = getRig(car);
    seen.add(car.id);
    rig.group.visible = true;
    const steer = THREE.MathUtils.clamp((car.targetX - car.x) * 1.5, -0.22, 0.22);
    rig.group.position.set(car.x * XS, 0, -car.z * ZS);
    rig.body.rotation.y = -steer;
    rig.body.rotation.z = (car.hitRoll || 0) * 0.7 - steer * 0.12;
    rig.body.position.y = racing ? Math.sin(time * 31 + car.z * 0.05) * 0.008 * Math.min(1, car.speed / 120) : 0;
    const spin = (car.z * ZS) / (0.36 * CAR_SCALE);
    for (const wn of rig.body.userData.wheels) wn.rotation.x = spin;
    const boosting = car.boostTimer > 0 && racing;
    rig.glow.visible = boosting;
    for (const f of rig.flames) { f.visible = boosting; f.scale.set(1, 1, 0.9 + Math.random() * 0.9); }
    drawTag(rig, car.floatLabel || car.name || '', !!car.isPlayer, car.badgeColor || '#2563eb');
  }
  for (const [id, rig] of carRigs) if (!seen.has(id)) rig.group.visible = false;

  // camera: low chase view behind the player
  const aspect = w / h;
  const targetX = player.x * XS * 0.42;
  camState.x += (targetX - camState.x) * Math.min(1, dt * 5);
  const speedK = racing ? Math.min(1, (player.speed || 0) / 300) : 0;
  const hfov = 57 + speedK * 6 + (player.boostTimer > 0 && racing ? 4 : 0);
  let vfov = 2 * Math.atan(Math.tan((hfov * Math.PI / 180) / 2) / aspect) * 180 / Math.PI;
  vfov = THREE.MathUtils.clamp(vfov, 38, 78);
  camState.fov += (vfov - camState.fov) * Math.min(1, dt * 4);
  camera.fov = camState.fov;
  camera.updateProjectionMatrix();
  const sh = racing && st.shake > 0 ? st.shake * 0.012 : 0;
  const camDist = pDist - 12.2;
  camera.position.set(camState.x + (Math.random() - 0.5) * sh, 4.7 + (Math.random() - 0.5) * sh, -camDist);
  camera.lookAt(camState.x * 0.9, 1.0, -(pDist + 22));

  // sun + shadow frustum follow the player
  sun.target.position.set(player.x * XS, 0, -pDist - 4);
  sun.position.set(player.x * XS - 22, 46, -pDist + 14);

  // endless road / ground / roadside tiles
  const snap = Math.floor(camDist / DASH_PERIOD) * DASH_PERIOD;
  road.position.z = -(snap + road.userData.len / 2 - 2 * DASH_PERIOD);
  ground.position.z = -(Math.floor(camDist / 14) * 14 + 250);
  const base = Math.floor(camDist / TILE_LEN);
  for (let k = 0; k < tiles.length; k++) tiles[k].position.z = -(base + k) * TILE_LEN;
  tiles[2].visible = camDist - base * TILE_LEN > 2 * TILE_LEN - 290;   // 3rd tile only once it is inside the fog range
  cityGroup.position.set(camState.x * 0.6, 0, -(camDist + 330));
  finishGroup.position.z = -(st.finishZ || 4850) * ZS;

  placeObstacles(st, camDist, time);

  // debris
  const deb = st.debris || [];
  let n = 0;
  for (let i = 0; i < deb.length && n < 96; i++) {
    const p = deb[i];
    const s = Math.max(0.08, (p.size || 5) * 0.03);
    tmpQ.setFromEuler(new THREE.Euler(p.rot || 0, (p.rot || 0) * 1.7, (p.rot || 0) * 0.6));
    tmpM.compose(tmpV.set(p.x * XS, Math.max(0.05, (p.yOffset || 0) * 0.025 * XS), -p.z * ZS), tmpQ, tmpS.set(s, s, s));
    debrisMesh.setMatrixAt(n, tmpM);
    debrisMesh.setColorAt(n, tmpC.set(p.color || '#ffffff'));
    n++;
  }
  debrisMesh.count = n;
  if (n) { debrisMesh.instanceMatrix.needsUpdate = true; if (debrisMesh.instanceColor) debrisMesh.instanceColor.needsUpdate = true; }

  renderer.render(scene, camera);
  TR3D.info = renderer.info.render;

  // adaptive quality for weaker phones
  if (dt > 0.03) slowFrames++; else slowFrames = Math.max(0, slowFrames - 1);
  if (slowFrames > 90 && now - fastChecked > 4000) {
    fastChecked = now; slowFrames = 0;
    if (pixelRatio > 1) { pixelRatio = Math.max(1, pixelRatio - 0.5); lastW = 0; }
    else if (renderer.shadowMap.enabled) { renderer.shadowMap.enabled = false; sun.castShadow = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
  }
  return true;
};

init().catch((e) => {
  TR3D.failed = true;
  TR3D.ready = false;
  TR3D.error = String(e && e.message || e);
  console.warn('[TR3D] 3D scene unavailable, using 2D renderer:', e);
});
