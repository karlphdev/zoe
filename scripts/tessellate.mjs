// Subdivision conforme (« red-green ») d'une primitive glTF indexée : on coupe en deux toute arête
// plus longue que maxEdge, dans TOUS les triangles qui la partagent, jusqu'à ce qu'aucune ne dépasse.
// Les arêtes sont identifiées par position (et non par index), donc les coutures UV restent étanches :
// les deux côtés reçoivent un milieu à la même position, sans T-jonction ni fissure sous les vagues.

export function tessellatePrimitive(doc, prim, maxEdge, maxPasses = 10) {
  const semantics = prim.listSemantics();
  const accessors = semantics.map((s) => prim.getAttribute(s));
  const sizes = accessors.map((a) => a.getElementSize());
  const data = accessors.map((a) => Array.from(a.getArray()));
  const posI = semantics.indexOf('POSITION');
  let tris = prim.getIndices() ? Array.from(prim.getIndices().getArray()) : [...Array(accessors[posI].getCount()).keys()];

  const pos = data[posI];
  const q = (v) => Math.round(v * 1e4);
  const posKeyOf = (v) => `${q(pos[v * 3])},${q(pos[v * 3 + 1])},${q(pos[v * 3 + 2])}`;
  const posId = new Map();
  const vid = []; // index de sommet -> identifiant de position
  const idOf = (v) => {
    if (vid[v] === undefined) {
      const k = posKeyOf(v);
      if (!posId.has(k)) posId.set(k, posId.size);
      vid[v] = posId.get(k);
    }
    return vid[v];
  };
  const edgeKey = (a, b) => { const x = idOf(a), y = idOf(b); return x < y ? `${x}_${y}` : `${y}_${x}`; };
  const len = (a, b) => Math.hypot(pos[a * 3] - pos[b * 3], pos[a * 3 + 1] - pos[b * 3 + 1], pos[a * 3 + 2] - pos[b * 3 + 2]);

  const mid = new Map(); // "va_vb" -> nouveau sommet
  const midpoint = (a, b) => {
    const k = a < b ? `${a}_${b}` : `${b}_${a}`;
    if (mid.has(k)) return mid.get(k);
    const v = data[posI].length / 3;
    semantics.forEach((s, i) => {
      const n = sizes[i], arr = data[i];
      const out = [];
      for (let j = 0; j < n; j++) out.push((arr[a * n + j] + arr[b * n + j]) / 2);
      if (s === 'NORMAL' || s === 'TANGENT') {
        const l = Math.hypot(out[0], out[1], out[2]) || 1;
        out[0] /= l; out[1] /= l; out[2] /= l;
      }
      arr.push(...out);
    });
    mid.set(k, v);
    return v;
  };

  for (let pass = 0; pass < maxPasses; pass++) {
    // Arêtes à couper : l'arête la plus longue de chaque triangle trop grand.
    const marked = new Set();
    for (let t = 0; t < tris.length; t += 3) {
      const [a, b, c] = [tris[t], tris[t + 1], tris[t + 2]];
      const e = [[a, b], [b, c], [c, a]].map(([x, y]) => [x, y, len(x, y)]).sort((m, n) => n[2] - m[2])[0];
      if (e[2] > maxEdge) marked.add(edgeKey(e[0], e[1]));
    }
    if (!marked.size) break;

    const next = [];
    for (let t = 0; t < tris.length; t += 3) {
      let v = [tris[t], tris[t + 1], tris[t + 2]];
      let m = [0, 1, 2].map((i) => marked.has(edgeKey(v[i], v[(i + 1) % 3])));
      const k = m.filter(Boolean).length;
      if (k === 0) { next.push(...v); continue; }
      if (k === 3) {
        const [a, b, c] = v, ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
        next.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
        continue;
      }
      // Rotation (ordre de winding conservé) pour normaliser les cas 1 et 2.
      const rot = (r) => { v = [v[r], v[(r + 1) % 3], v[(r + 2) % 3]]; m = [m[r], m[(r + 1) % 3], m[(r + 2) % 3]]; };
      if (k === 1) {
        rot(m.indexOf(true)); // arête marquée = (a,b)
        const [a, b, c] = v, ab = midpoint(a, b);
        next.push(a, ab, c, ab, b, c);
      } else {
        rot((m.indexOf(false) + 1) % 3); // arête non marquée = (c,a)
        const [a, b, c] = v, ab = midpoint(a, b), bc = midpoint(b, c);
        next.push(ab, b, bc, a, ab, bc, a, bc, c);
      }
    }
    tris = next;
  }

  semantics.forEach((s, i) => {
    const Ctor = accessors[i].getArray().constructor;
    accessors[i].setArray(new Ctor(data[i]));
  });
  const vcount = data[posI].length / 3;
  const IndexCtor = vcount > 65535 ? Uint32Array : Uint16Array;
  let indices = prim.getIndices();
  if (!indices) { indices = doc.createAccessor().setType('SCALAR').setBuffer(accessors[posI].getBuffer()); prim.setIndices(indices); }
  indices.setArray(new IndexCtor(tris));
}
