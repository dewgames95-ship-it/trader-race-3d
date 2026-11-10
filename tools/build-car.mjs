// Prepares assets/game3d/car.glb from the supplied ferrari_f8_tributo.glb:
// JPEG textures, a blank number plate, Draco geometry. Shape and UVs are untouched.
//   node tools/build-car.mjs <source.glb> <plate.jpg> assets/game3d/car.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import fs from 'fs';
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'draco3d.decoder': await draco3d.createDecoderModule(), 'draco3d.encoder': await draco3d.createEncoderModule() });
const doc = await io.read(process.argv[2]);
const dir = process.argv[5];
for (const m of doc.getRoot().listMaterials()) {
  const t = m.getBaseColorTexture(); if (!t) continue;
  const jpg = m.getName() === 'Material.004' ? process.argv[3] : `${dir}/base_${m.getName()}.jpg`;
  t.setImage(fs.readFileSync(jpg)).setMimeType('image/jpeg');
}
for (const m of doc.getRoot().listMaterials()) { const n = m.getNormalTexture(); if (n) n.setImage(fs.readFileSync(`${dir}/nrm_${m.getName()}.jpg`)).setMimeType('image/jpeg'); }
await doc.transform(dedup(), prune(), draco({ method: 'edgebreaker' }));
await io.write(process.argv[4], doc);
