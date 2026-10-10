// Pipeline des modèles : lit les copies brutes de public/models/source,
// écrit les versions web dans public/models. Les zips d'origine ne sont jamais touchés.
//   node scripts/optimize-models.mjs            -> build complet
//   node scripts/optimize-models.mjs --report   -> stats seulement
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  clearNodeTransform, dedup, draco, prune, simplifyPrimitive, textureCompress, weld,
} from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';
import { statSync } from 'node:fs';
import { tessellatePrimitive } from './tessellate.mjs';

const SRC = 'public/models/source/tricorner/source/Building_Brutalist_TriCorner.glb';
const OUT = 'public/models/tricorner.glb';
const OUT_LITE = 'public/models/tricorner-lite.glb';

// Ratio de triangles conservés par mesh (1 = intact). Les détails très denses sont allégés,
// les grandes surfaces sont subdivisées pour porter les vagues.
const SIMPLIFY = { Pipes: 0.15, Aircon_Units: 0.2, Cables: 0.3, Antennas: 0.3, Ducts: 0.35, Windows: 0.5 };
const TESSELLATE = { Walls: 2.2, Balconies: 2.0, Roofing: 2.4, Decals: 2.6, Pipes: 2.5, Windows: 2.5, Cables: 2.5, Antennas: 2.5, Clothing_Lines: 2.5 };
const LITE_KEEP = new Set(['Walls', 'Balconies', 'Windows', 'Roofing']);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'draco3d.encoder': await draco3d.createEncoderModule(),
    'draco3d.decoder': await draco3d.createDecoderModule(),
  });

const mb = (p) => (statSync(p).size / 1048576).toFixed(1) + ' Mo';

function stats(doc, label) {
  let total = 0;
  const rows = [];
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    let tris = 0, maxEdge = 0, longTris = 0;
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION');
      const idx = prim.getIndices();
      const n = idx ? idx.getCount() : pos.getCount();
      const a = [], b = [], c = [];
      for (let i = 0; i < n; i += 3) {
        const ia = idx ? idx.getScalar(i) : i, ib = idx ? idx.getScalar(i + 1) : i + 1, ic = idx ? idx.getScalar(i + 2) : i + 2;
        pos.getElement(ia, a); pos.getElement(ib, b); pos.getElement(ic, c);
        const e = Math.max(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]), Math.hypot(b[0] - c[0], b[1] - c[1], b[2] - c[2]), Math.hypot(c[0] - a[0], c[1] - a[1], c[2] - a[2]));
        if (e > maxEdge) maxEdge = e;
        if (e > 1.5) longTris++;
        tris++;
      }
    }
    total += tris;
    rows.push({ mesh: node.getName(), tris, maxEdge: +maxEdge.toFixed(2), 'tris arête>1.5': longTris });
  }
  console.log(`\n== ${label} : ${total.toLocaleString('fr')} triangles`);
  console.table(rows);
}

async function build({ lite }) {
  const doc = await io.read(SRC);
  const root = doc.getRoot();

  // Transforms des nodes appliquées aux sommets : tout le modèle partage le même espace Y-up,
  // le shader de vagues travaille directement dans cet espace.
  for (const node of root.listNodes()) clearNodeTransform(node);

  if (lite) {
    for (const node of root.listNodes()) {
      if (!LITE_KEEP.has(node.getName())) { node.getMesh()?.dispose(); node.dispose(); }
    }
  }

  await doc.transform(prune(), dedup(), weld());
  await MeshoptSimplifier.ready;

  for (const node of root.listNodes()) {
    const name = node.getName();
    const mesh = node.getMesh();
    if (!mesh) continue;
    for (const prim of mesh.listPrimitives()) {
      const ratio = SIMPLIFY[name] * (lite ? 0.6 : 1);
      if (ratio && ratio < 1) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio, error: 0.004 });
      const maxEdge = TESSELLATE[name];
      if (maxEdge) tessellatePrimitive(doc, prim, maxEdge * (lite ? 1.6 : 1));
    }
  }

  // Pas d'image générée par IA ni de texture inutilisée ; tout en WebP.
  await doc.transform(
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: lite ? [512, 512] : [1024, 1024], quality: 82 }),
    // Draco se décode en Float32 dans l'espace d'origine (contrairement à la quantification meshopt),
    // ce qui garde les distances du shader de vagues en unités réelles.
    draco({ method: 'edgebreaker', quantizePosition: 16, quantizeNormal: 10, quantizeTexcoord: 12 }),
  );

  stats(doc, lite ? 'tricorner-lite' : 'tricorner');
  const out = lite ? OUT_LITE : OUT;
  await io.write(out, doc);
  console.log(`-> ${out} : ${mb(out)}`);
}

if (process.argv.includes('--report')) {
  const doc = await io.read(SRC);
  for (const node of doc.getRoot().listNodes()) clearNodeTransform(node);
  stats(doc, `source (${mb(SRC)})`);
} else {
  await build({ lite: false });
  await build({ lite: true });
}
