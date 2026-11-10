// Prepares the game car from the three.js example model: strips badges, simplifies for phones, Draco-compresses.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, weld, simplifyPrimitive, draco, dedup, normals } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(process.argv[2]);
const DROP = new Set(['blue', 'yellow_trim', 'nuts', 'steering_centre', 'steering_red_lights', 'steering_trim', 'steering_metal']);
for (const n of doc.getRoot().listNodes()) if (DROP.has(n.getName())) n.dispose();
for (const m of doc.getRoot().listMeshes()) for (const pr of m.listPrimitives()) { pr.setAttribute('NORMAL', null); pr.setAttribute('TEXCOORD_0', null); pr.setAttribute('TANGENT', null); }
await doc.transform(dedup(), weld());

// Badge / lettering pieces, matched by where they sit on the car (model space, metres; tail is +z).
const BADGES = {
  chrome: [
    (c, s) => Math.abs(c[0]) < 0.1 && c[1] > 0.74 && c[1] < 0.93 && c[2] > 2.1,                 // tail emblem
    (c, s) => Math.abs(c[0]) < 0.1 && c[1] > 0.18 && c[1] < 0.42 && c[2] < -2.1,                // nose emblem
    (c, s) => Math.abs(c[0]) > 0.88 && c[1] > 0.28 && c[1] < 0.47 && c[2] > 0.75 && c[2] < 1.1, // side script
    (c, s) => Math.abs(c[0]) < 0.2 && c[1] > 0.92 && c[1] < 0.99 && c[2] > 1.82 && c[2] < 2.02  // engine-cover lettering
  ],
  body: [(c, s) => Math.abs(c[0]) > 0.88 && c[1] > 0.7 && c[1] < 0.82 && c[2] > 0.33 && c[2] < 0.53 && s[2] < 0.2],  // fender shields
  metal: [(c, s) => Math.abs(c[0]) > 0.9 && c[1] > 0.6 && c[1] < 0.75 && c[2] > 0.3 && c[2] < 0.52 && s[2] < 0.1]
};
let removed = 0;
for (const node of doc.getRoot().listNodes()) {
  const tests = BADGES[node.getName()], mesh = node.getMesh(); if (!tests || !mesh) continue;
  const M = node.getWorldMatrix();
  for (const pr of mesh.listPrimitives()) {
    const pos = pr.getAttribute('POSITION'), idx = pr.getIndices(), ia = idx.getArray(), n = pos.getCount(), par = new Int32Array(n).map((_, i) => i);
    const find = (a) => { while (par[a] !== a) { par[a] = par[par[a]]; a = par[a]; } return a; };
    for (let i = 0; i < ia.length; i += 3) { const a = find(ia[i]); par[find(ia[i + 1])] = a; par[find(ia[i + 2])] = a; }
    const box = new Map(), v = [0, 0, 0];
    for (let i = 0; i < n; i++) {
      pos.getElement(i, v); const w = [M[0] * v[0] + M[4] * v[1] + M[8] * v[2] + M[12], M[1] * v[0] + M[5] * v[1] + M[9] * v[2] + M[13], M[2] * v[0] + M[6] * v[1] + M[10] * v[2] + M[14]];
      const r = find(i); let b = box.get(r); if (!b) box.set(r, b = { min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });
      for (let d = 0; d < 3; d++) { b.min[d] = Math.min(b.min[d], w[d]); b.max[d] = Math.max(b.max[d], w[d]); }
    }
    const kill = new Set();
    for (const [r, b] of box) { const c = b.min.map((m, d) => (m + b.max[d]) / 2), s = b.min.map((m, d) => b.max[d] - m); if (tests.some((t) => t(c, s))) kill.add(r); }
    const keep = []; for (let i = 0; i < ia.length; i += 3) { if (kill.has(find(ia[i]))) removed++; else keep.push(ia[i], ia[i + 1], ia[i + 2]); }
    idx.setArray(new Uint32Array(keep));
  }
}
console.log('badge triangles removed:', removed);

await MeshoptSimplifier.ready;
const INTERIOR = /^(leather|interior_light|interior_dark|carpet|trim|carbon fibre|carbon_fibre_trim|steering_)/;
for (const node of doc.getRoot().listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const name = node.getName();
  const ratio = name === 'glass' ? 1 : (name === 'interior_light' ? 0.25 : (INTERIOR.test(name) ? 0.1 : (name === 'body' ? 0.36 : 0.28)));
  if (ratio < 1) for (const pr of mesh.listPrimitives()) simplifyPrimitive(pr, { simplifier: MeshoptSimplifier, ratio, error: (INTERIOR.test(name) && name !== 'interior_light') ? 0.02 : 0.003 });
}
await doc.transform(normals({ overwrite: true }), prune(), draco({ method: 'edgebreaker' }));
await io.write(process.argv[3], doc);
