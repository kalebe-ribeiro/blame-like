// ─────────────────────────────────────────────────────────────────────────────
//  O corte do emissor de feixe (a arma de Killy — ver o cofre, Arma-do-Killy):
//  uma peça da geração menos os cilindros dos tiros que a cruzam.
//
//    peça FECHADA (caixa, cilindro fechado — cada aresta em exatamente 2
//      triângulos): CSG de verdade (three-bvh-csg); as faces novas, do lado de
//      dentro do furo, saem à parte (`caps` — o material do corte, que fica em brasa)
//    peça ABERTA (duto aberto, plano, fita): sem CSG — os triângulos perto do
//      furo são subdivididos até `maxEdge` e só os de dentro saem; nada de fora
//      some (a borda fica serrilhada no tamanho de `maxEdge`)
//
//  Puro: roda no worker de geração e no node (tools/csg-spike.mjs). A biblioteca
//  de CSG vem de fora (setCSG): no worker a cópia gerada (src/lib/three-bvh-csg.js),
//  no node o pacote.
//
//  Um corte: { a: [x,y,z], b: [x,y,z], r } — em coordenadas LOCAIS da peça.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';

/** @type {{ Brush: any, Evaluator: any, SUBTRACTION: any } | null} */
let CSG = null;
export function setCSG(lib) {
  CSG = lib;
}

const SEGMENTS = 24; // lados do cilindro do corte
let clipRemoved = false; // o último clipOpen tirou algum triângulo?

/** Distância do ponto (x,y,z) ao segmento do corte c (e o t ao longo dele, 0..1). */
export function segDist(x, y, z, c) {
  const [ax, ay, az] = c.a;
  const dx = c.b[0] - ax;
  const dy = c.b[1] - ay;
  const dz = c.b[2] - az;
  const L2 = dx * dx + dy * dy + dz * dz || 1;
  let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t - x;
  const qy = ay + dy * t - y;
  const qz = az + dz * t - z;
  return Math.sqrt(qx * qx + qy * qy + qz * qz);
}

/** O ponto está dentro de algum corte? */
export function insideCuts(x, y, z, cuts) {
  for (const c of cuts) if (segDist(x, y, z, c) < c.r) return true;
  return false;
}

/** Os cortes que tocam uma esfera (centro, raio) — o pré-filtro barato. */
export function cutsNear(center, radius, cuts) {
  return cuts.filter((c) => segDist(center.x, center.y, center.z, c) < c.r + radius);
}

/** Fechada? (posições soldadas; cada aresta em exatamente 2 triângulos) */
export function isClosed(geom) {
  const pos = geom.attributes.position;
  const idx = geom.index;
  const n = idx ? idx.count : pos.count;
  const key = (i) => {
    const v = idx ? idx.getX(i) : i;
    return `${Math.round(pos.getX(v) * 1e3)},${Math.round(pos.getY(v) * 1e3)},${Math.round(pos.getZ(v) * 1e3)}`;
  };
  const ids = new Map();
  const id = (i) => {
    const k = key(i);
    let v = ids.get(k);
    if (v === undefined) ids.set(k, (v = ids.size));
    return v;
  };
  const edges = new Map();
  for (let t = 0; t < n; t += 3) {
    const a = id(t);
    const b = id(t + 1);
    const c = id(t + 2);
    if (a === b || b === c || a === c) continue; // degenerado
    for (const [p, q] of [[a, b], [b, c], [c, a]]) {
      const k = p < q ? `${p}_${q}` : `${q}_${p}`;
      edges.set(k, (edges.get(k) ?? 0) + 1);
    }
  }
  for (const v of edges.values()) if (v !== 2) return false;
  return edges.size > 0;
}

/** O cilindro de um corte como pincel, só no trecho que passa perto da peça (esfera). */
function cylinderBrush(c, sphere, material) {
  const a = new THREE.Vector3(...c.a);
  const b = new THREE.Vector3(...c.b);
  const ab = b.clone().sub(a);
  const L = ab.length();
  const dir = ab.clone().divideScalar(L);
  const tc = sphere.center.clone().sub(a).dot(dir);
  const t0 = Math.max(0, tc - sphere.radius - c.r - 1);
  const t1 = Math.min(L, tc + sphere.radius + c.r + 1);
  const p0 = a.clone().addScaledVector(dir, t0);
  const p1 = a.clone().addScaledVector(dir, t1);
  const len = Math.max(0.01, t1 - t0);
  const g = new THREE.CylinderGeometry(c.r, c.r, len, SEGMENTS, 1, false);
  g.deleteAttribute('uv');
  // o eixo do cilindro (y) alinhado ao corte
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
  g.translate((p0.x + p1.x) / 2, (p0.y + p1.y) / 2, (p0.z + p1.z) / 2);
  const brush = new CSG.Brush(g, material);
  brush.updateMatrixWorld();
  return brush;
}

const MAT_PIECE = new THREE.MeshBasicMaterial();
const MAT_CUT = new THREE.MeshBasicMaterial();

/** Separa a geometria do resultado pelos grupos: o que veio da peça × as faces do corte. */
function splitGroups(result) {
  const g = result.geometry;
  const mats = Array.isArray(result.material) ? result.material : [result.material];
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const idx = g.index;
  const parts = { kept: [], caps: [] };
  const groups = g.groups.length ? g.groups : [{ start: 0, count: idx ? idx.count : pos.count, materialIndex: 0 }];
  for (const gr of groups) {
    const into = mats[gr.materialIndex] === MAT_CUT ? parts.caps : parts.kept;
    for (let i = gr.start; i < gr.start + gr.count; i++) into.push(idx ? idx.getX(i) : i);
  }
  const build = (list) => {
    if (!list.length) return null;
    const p = new Float32Array(list.length * 3);
    const nn = new Float32Array(list.length * 3);
    list.forEach((v, i) => {
      p[i * 3] = pos.getX(v);
      p[i * 3 + 1] = pos.getY(v);
      p[i * 3 + 2] = pos.getZ(v);
      nn[i * 3] = nor.getX(v);
      nn[i * 3 + 1] = nor.getY(v);
      nn[i * 3 + 2] = nor.getZ(v);
    });
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(p, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
    out.setIndex([...Array(list.length).keys()]);
    return out;
  };
  return { kept: build(parts.kept), caps: build(parts.caps) };
}

/** Sem índice, só posição e normal (o que o CSG e o recorte usam). */
function plain(geom) {
  const g = geom.index ? geom.toNonIndexed() : geom.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  g.clearGroups();
  return g;
}

/**
 * Peça aberta: subdivide os triângulos perto dos cortes até `maxEdge` e tira os de dentro.
 * Devolve a geometria (indexada trivialmente) ou null se nada sobrou.
 */
export function clipOpen(geom, cuts, maxEdge) {
  const g = plain(geom);
  let P = Array.from(g.attributes.position.array);
  let N = Array.from(g.attributes.normal.array);
  const near = (i) => {
    // o triângulo i está perto de algum corte (pelo centro e o maior lado)?
    const cx = (P[i * 9] + P[i * 9 + 3] + P[i * 9 + 6]) / 3;
    const cy = (P[i * 9 + 1] + P[i * 9 + 4] + P[i * 9 + 7]) / 3;
    const cz = (P[i * 9 + 2] + P[i * 9 + 5] + P[i * 9 + 8]) / 3;
    let R = 0;
    for (let k = 0; k < 3; k++) R = Math.max(R, Math.hypot(P[i * 9 + k * 3] - cx, P[i * 9 + k * 3 + 1] - cy, P[i * 9 + k * 3 + 2] - cz));
    for (const c of cuts) if (segDist(cx, cy, cz, c) < c.r + R) return true;
    return false;
  };
  // subdivide pelo maior lado, até todos os triângulos perto de um corte terem lados ≤ maxEdge
  for (let pass = 0; pass < 24; pass++) {
    const nP = [];
    const nN = [];
    let split = 0;
    const T = P.length / 9;
    for (let i = 0; i < T; i++) {
      const v = (k) => [P[i * 9 + k * 3], P[i * 9 + k * 3 + 1], P[i * 9 + k * 3 + 2]];
      const n = (k) => [N[i * 9 + k * 3], N[i * 9 + k * 3 + 1], N[i * 9 + k * 3 + 2]];
      const vs = [v(0), v(1), v(2)];
      const ns = [n(0), n(1), n(2)];
      const len = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
      const L = [len(vs[0], vs[1]), len(vs[1], vs[2]), len(vs[2], vs[0])];
      const e = L.indexOf(Math.max(...L));
      if (L[e] <= maxEdge || !near(i)) {
        nP.push(...vs[0], ...vs[1], ...vs[2]);
        nN.push(...ns[0], ...ns[1], ...ns[2]);
        continue;
      }
      split++;
      const a = e;
      const b = (e + 1) % 3;
      const c = (e + 2) % 3;
      const m = vs[a].map((x, j) => (x + vs[b][j]) / 2);
      const mn = ns[a].map((x, j) => (x + ns[b][j]) / 2);
      nP.push(...vs[a], ...m, ...vs[c], ...m, ...vs[b], ...vs[c]);
      nN.push(...ns[a], ...mn, ...ns[c], ...mn, ...ns[b], ...ns[c]);
    }
    P = nP;
    N = nN;
    if (!split) break;
  }
  // tira os de dentro
  const kP = [];
  const kN = [];
  for (let i = 0; i < P.length / 9; i++) {
    const cx = (P[i * 9] + P[i * 9 + 3] + P[i * 9 + 6]) / 3;
    const cy = (P[i * 9 + 1] + P[i * 9 + 4] + P[i * 9 + 7]) / 3;
    const cz = (P[i * 9 + 2] + P[i * 9 + 5] + P[i * 9 + 8]) / 3;
    if (insideCuts(cx, cy, cz, cuts)) continue;
    for (let j = 0; j < 9; j++) {
      kP.push(P[i * 9 + j]);
      kN.push(N[i * 9 + j]);
    }
  }
  clipRemoved = kP.length < P.length;
  if (!kP.length) return null;
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(new Float32Array(kP), 3));
  out.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(kN), 3));
  out.setIndex([...Array(kP.length / 3).keys()]);
  return out;
}

/** Tira os triângulos com o centro dentro de algum corte (o polígono de 24 lados). Devolve a mesma geometria se nada sai. */
function dropInside(g, cuts) {
  const inner = cuts.map((c) => ({ ...c, r: c.r * Math.cos(Math.PI / SEGMENTS) - 0.02 }));
  const p = g.attributes.position;
  const ix = g.index;
  const keep = [];
  for (let i = 0; i < ix.count; i += 3) {
    const a = ix.getX(i);
    const b = ix.getX(i + 1);
    const c = ix.getX(i + 2);
    const x = (p.getX(a) + p.getX(b) + p.getX(c)) / 3;
    const y = (p.getY(a) + p.getY(b) + p.getY(c)) / 3;
    const z = (p.getZ(a) + p.getZ(b) + p.getZ(c)) / 3;
    if (!insideCuts(x, y, z, inner)) keep.push(a, b, c);
  }
  if (keep.length === ix.count) return g;
  if (!keep.length) return null;
  g.setIndex(keep);
  return g;
}

/**
 * Corta uma peça pelos cortes que a cruzam.
 * → { kept: geometria da peça que ficou (ou null), caps: as faces do corte (ou null), mode }
 *   mode: 'none' (nenhum corte a toca) · 'csg' · 'clip' (aberta) · 'csg-failed→clip'
 */
export function cutPiece(geom, cuts, { maxEdge = 0.5 } = {}) {
  if (!geom.boundingSphere) geom.computeBoundingSphere();
  const mine = cutsNear(geom.boundingSphere.center, geom.boundingSphere.radius, cuts);
  if (!mine.length) return { kept: geom, caps: null, mode: 'none' };
  if (!isClosed(geom)) {
    const kept = clipOpen(geom, mine, maxEdge);
    // (o pré-filtro é pela esfera da peça: o cilindro pode passar ao lado — nada muda, nada conta)
    if (kept && !clipRemoved) return { kept: geom, caps: null, mode: 'none' };
    return { kept, caps: null, mode: 'clip' };
  }
  try {
    const ev = new CSG.Evaluator();
    ev.attributes = ['position', 'normal'];
    ev.useGroups = true;
    let res = new CSG.Brush(plain(geom), MAT_PIECE);
    res.updateMatrixWorld();
    for (const c of mine) {
      const next = ev.evaluate(res, cylinderBrush(c, geom.boundingSphere, MAT_CUT), CSG.SUBTRACTION);
      next.updateMatrixWorld();
      res = next;
    }
    const { kept, caps } = splitGroups(res);
    // o cilindro passou ao lado (o pré-filtro é pela esfera): nenhuma face do corte — nada mudou
    if (!caps) return { kept: geom, caps: null, mode: 'none' };
    // peças feitas de várias caixas que se atravessam parecem fechadas, mas o CSG classifica
    // parte dos triângulos errado: o que sobrou dentro do furo sai (só de dentro — nada de fora)
    const clean = kept ? dropInside(kept, mine) : null;
    return { kept: clean, caps, mode: clean !== kept ? 'csg+limpeza' : 'csg' };
  } catch {
    return { kept: clipOpen(geom, mine, maxEdge), caps: null, mode: 'csg-failed→clip' };
  }
}

/**
 * A área da superfície FORA dos cortes (subdividindo até `step` perto deles) — para a
 * conferência: a peça cortada tem de manter a área de fora da original.
 */
export function areaOutside(geom, cuts, step = 0.25) {
  const g = clipOpen(geom, cuts, step) ?? null;
  if (!g) return 0;
  const p = g.attributes.position.array;
  let A = 0;
  const u = new THREE.Vector3();
  const v = new THREE.Vector3();
  for (let i = 0; i < p.length; i += 9) {
    u.set(p[i + 3] - p[i], p[i + 4] - p[i + 1], p[i + 5] - p[i + 2]);
    v.set(p[i + 6] - p[i], p[i + 7] - p[i + 1], p[i + 8] - p[i + 2]);
    A += u.cross(v).length() / 2;
  }
  return A;
}

/**
 * As partes conexas de uma geometria indexada (triângulos ligados por vértices na mesma
 * posição): [{ tris: [índices dos triângulos], min: [x,y,z], max: [x,y,z] }].
 */
export function components(g) {
  const pos = g.attributes.position;
  const ix = g.index;
  const n = ix.count / 3;
  // vértices soldados pela posição
  const vid = new Map();
  const weld = (v) => {
    const k = `${Math.round(pos.getX(v) * 1e3)},${Math.round(pos.getY(v) * 1e3)},${Math.round(pos.getZ(v) * 1e3)}`;
    let id = vid.get(k);
    if (id === undefined) vid.set(k, (id = vid.size));
    return id;
  };
  const tv = new Int32Array(ix.count);
  for (let i = 0; i < ix.count; i++) tv[i] = weld(ix.getX(i));
  const parent = new Int32Array(vid.size).map((_, i) => i);
  const find = (x) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  for (let t = 0; t < n; t++) {
    const a = find(tv[t * 3]);
    parent[find(tv[t * 3 + 1])] = a;
    parent[find(tv[t * 3 + 2])] = a;
  }
  const comps = new Map();
  for (let t = 0; t < n; t++) {
    const root = find(tv[t * 3]);
    let c = comps.get(root);
    if (!c) comps.set(root, (c = { tris: [], min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] }));
    c.tris.push(t);
    for (let j = 0; j < 3; j++) {
      const v = ix.getX(t * 3 + j);
      const p = [pos.getX(v), pos.getY(v), pos.getZ(v)];
      for (let k = 0; k < 3; k++) {
        if (p[k] < c.min[k]) c.min[k] = p[k];
        if (p[k] > c.max[k]) c.max[k] = p[k];
      }
    }
  }
  return [...comps.values()];
}

/** Só os triângulos dados (índices) de uma geometria indexada — ou null se nenhum. */
export function keepTris(g, tris) {
  if (!tris.length) return null;
  const ix = g.index;
  const out = [];
  for (const t of tris) out.push(ix.getX(t * 3), ix.getX(t * 3 + 1), ix.getX(t * 3 + 2));
  g.setIndex(out);
  return g;
}
