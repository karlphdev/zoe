// Buste en marbre (Poly Haven « Marble Bust 01 », CC0) pour la section contact.
// Mis à l'échelle du bâtiment (hauteur 30 unités) pour que les paramètres de vagues restent valables.
//   node scripts/build-bust.mjs  ->  public/models/bust.glb
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { clearNodeTransform, draco, prune, textureCompress, transformPrimitive, weld } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { tessellatePrimitive } from './tessellate.mjs';

const SRC = 'public/models/source/marble-bust/marble_bust_01_1k.gltf';
const OUT = 'public/models/bust.glb';
const HEIGHT = 30;

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'draco3d.encoder': await draco3d.createEncoderModule(),
  'draco3d.decoder': await draco3d.createDecoderModule(),
});
const doc = await io.read(SRC);
const root = doc.getRoot();
for (const node of root.listNodes()) clearNodeTransform(node);

let minY = Infinity, maxY = -Infinity;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  const pos = prim.getAttribute('POSITION');
  const v = [];
  for (let i = 0; i < pos.getCount(); i++) { pos.getElement(i, v); minY = Math.min(minY, v[1]); maxY = Math.max(maxY, v[1]); }
}
const k = HEIGHT / (maxY - minY);
const scale = [k, 0, 0, 0, 0, k, 0, 0, 0, 0, k, 0, 0, 0, 0, 1];

await doc.transform(weld());
let tris = 0;
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  transformPrimitive(prim, scale);
  tessellatePrimitive(doc, prim, 0.9);
  tris += prim.getIndices().getCount() / 3;
}
await doc.transform(
  prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 82 }),
  draco({ method: 'edgebreaker', quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12 }),
);
await io.write(OUT, doc);
console.log(`buste : hauteur ${(maxY - minY).toFixed(2)} -> ${HEIGHT}, ${tris} triangles, ${OUT} ${(statSync(OUT).size / 1024).toFixed(0)} Ko`);
