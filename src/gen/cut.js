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

/**
 * A distância do ponto ao EIXO do corte, só dentro do trecho do cilindro (pontas retas, como o
 * pincel do CSG); fora das pontas, Infinity. (Uma cápsula — pontas redondas — tirava o chão
 * em volta de quem atira: a ponta perto da arma tem o raio inteiro.)
 */
export function cutDist(x, y, z, c) {
  const [ax, ay, az] = c.a;
  const dx = c.b[0] - ax;
  const dy = c.b[1] - ay;
  const dz = c.b[2] - az;
  const L2 = dx * dx + dy * dy + dz * dz || 1;
  const t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / L2;
  if (t < 0 || t > 1) return Infinity;
  return Math.hypot(ax + dx * t - x, ay + dy * t - y, az + dz * t - z);
}

/**
 * Dentro da coluna protegida do corte? (`keep`: [x, y0, z, raio, y1] — o chão debaixo de quem
 * atirou: nenhum tiro o destrói, a não ser o que mira nele — app/beam.js keepUnder)
 */
export function inKeep(x, y, z, c) {
  const k = c.keep;
  return !!k && y > k[1] && y < k[4] && Math.hypot(x - k[0], z - k[2]) < k[3];
}

/** O ponto está dentro do corte c (mais `margin`)? — o cilindro de pontas retas, fora a coluna protegida. */
export function inCut(x, y, z, c, margin = 0) {
  return cutDist(x, y, z, c) < c.r + margin && !inKeep(x, y, z, c);
}

/** O ponto está dentro de algum corte? */
export function insideCuts(x, y, z, cuts) {
  for (const c of cuts) if (inCut(x, y, z, c)) return true;
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

/**
 * Os cortes em grupos que não se encostam (cilindros disjuntos): cada grupo vira UM pincel —
 * várias partes separadas — e uma subtração só. O CSG decide dentro/fora por paridade, e
 * sólidos disjuntos não a confundem; cilindros que se cruzam vão para grupos diferentes.
 * (50 cortes numa peça eram 50 subtrações seguidas, cada uma sobre um resultado maior:
 * segundos por peça.)
 */
function groupCuts(cuts) {
  /** @type {any[][]} */
  const groups = [];
  for (const c of cuts) {
    const g = groups.find((gr) => gr.every((d) => segSegDist(c, d) > c.r + d.r + 0.1));
    if (g) g.push(c);
    else groups.push([c]);
  }
  return groups;
}

/** A menor distância entre os segmentos (eixos) de dois cortes. */
function segSegDist(c, d) {
  const p1 = c.a;
  const q1 = c.b;
  const p2 = d.a;
  const q2 = d.b;
  const d1 = [q1[0] - p1[0], q1[1] - p1[1], q1[2] - p1[2]];
  const d2 = [q2[0] - p2[0], q2[1] - p2[1], q2[2] - p2[2]];
  const r = [p1[0] - p2[0], p1[1] - p2[1], p1[2] - p2[2]];
  const dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  let s;
  let t;
  if (a < 1e-9 && e < 1e-9) {
    s = t = 0;
  } else if (a < 1e-9) {
    s = 0;
    t = Math.max(0, Math.min(1, f / e));
  } else {
    const cc = dot(d1, r);
    if (e < 1e-9) {
      t = 0;
      s = Math.max(0, Math.min(1, -cc / a));
    } else {
      const b = dot(d1, d2);
      const den = a * e - b * b;
      s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - cc * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = Math.max(0, Math.min(1, -cc / a));
      } else if (t > 1) {
        t = 1;
        s = Math.max(0, Math.min(1, (b - cc) / a));
      }
    }
  }
  const x = r[0] + d1[0] * s - d2[0] * t;
  const y = r[1] + d1[1] * s - d2[1] * t;
  const z = r[2] + d1[2] * s - d2[2] * t;
  return Math.hypot(x, y, z);
}

/** Vários cortes disjuntos num pincel só (as geometrias juntas, sem índice). */
function groupBrush(group, sphere, material) {
  if (group.length === 1) return cylinderBrush(group[0], sphere, material);
  const parts = group.map((c) => cylinderGeom(c, sphere).toNonIndexed());
  const n = parts.reduce((q, g) => q + g.attributes.position.count, 0);
  const p = new Float32Array(n * 3);
  const nn = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    p.set(g.attributes.position.array, o * 3);
    nn.set(g.attributes.normal.array, o * 3);
    o += g.attributes.position.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3));
  const brush = new CSG.Brush(geo, material);
  brush.updateMatrixWorld();
  return brush;
}

/** O cilindro de um corte como pincel, só no trecho que passa perto da peça (esfera). */
function cylinderBrush(c, sphere, material) {
  const brush = new CSG.Brush(cylinderGeom(c, sphere), material);
  brush.updateMatrixWorld();
  return brush;
}

/** A geometria do cilindro de um corte, só no trecho perto da peça (esfera). */
function cylinderGeom(c, sphere) {
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
  // a coluna protegida (o chão debaixo de quem atirou): sai do pincel, se a peça chega perto dela
  const k = c.keep;
  if (k && Math.hypot(sphere.center.x - k[0], sphere.center.z - k[2]) < k[3] + sphere.radius && sphere.center.y - sphere.radius < k[4] && sphere.center.y + sphere.radius > k[1]) {
    const col = new THREE.CylinderGeometry(k[3], k[3], k[4] - k[1], SEGMENTS, 1, false);
    col.deleteAttribute('uv');
    col.translate(k[0], (k[1] + k[4]) / 2, k[2]);
    const ev = new CSG.Evaluator();
    ev.attributes = ['position', 'normal'];
    ev.useGroups = false;
    const A = new CSG.Brush(g.toNonIndexed());
    A.updateMatrixWorld();
    const B = new CSG.Brush(col.toNonIndexed());
    B.updateMatrixWorld();
    const out = ev.evaluate(A, B, CSG.SUBTRACTION).geometry;
    out.clearGroups();
    return out;
  }
  return g;
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

/** Acima disto (triângulos), a peça é separada em partes antes do CSG (cutPiece). */
const SPLIT_TRIS = 200;

/** Os triângulos dados (índices) de uma geometria sem índice de verdade, como geometria nova sem índice. */
function triSubset(g, tris) {
  const P = g.attributes.position.array;
  const N = g.attributes.normal.array;
  const p = new Float32Array(tris.length * 9);
  const n = new Float32Array(tris.length * 9);
  tris.forEach((t, i) => {
    p.set(P.subarray(t * 9, t * 9 + 9), i * 9);
    n.set(N.subarray(t * 9, t * 9 + 9), i * 9);
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return out;
}

/** Junta duas geometrias (posição e normal; a primeira pode ser null), com índice trivial. */
function concat(a, b) {
  if (!a) {
    b.setIndex([...Array(b.attributes.position.count).keys()]);
    return b;
  }
  const flat = (g, k) => (g.index ? g.toNonIndexed() : g).attributes[k].array;
  const pa = flat(a, 'position');
  const pb = flat(b, 'position');
  const na = flat(a, 'normal');
  const nb = flat(b, 'normal');
  const p = new Float32Array(pa.length + pb.length);
  p.set(pa);
  p.set(pb, pa.length);
  const n = new Float32Array(na.length + nb.length);
  n.set(na);
  n.set(nb, na.length);
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(p, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  out.setIndex([...Array(p.length / 3).keys()]);
  return out;
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
export function cutPiece(geom, cuts, { maxEdge = 0.5, memo = null, key = '' } = {}) {
  if (!geom.boundingSphere) geom.computeBoundingSphere();
  const mine = cutsNear(geom.boundingSphere.center, geom.boundingSphere.radius, cuts);
  if (!mine.length) return { kept: geom, caps: null, mode: 'none' };
  if (!isClosed(geom)) {
    const kept = clipOpen(geom, mine, maxEdge);
    // (o pré-filtro é pela esfera da peça: o cilindro pode passar ao lado — nada muda, nada conta)
    if (kept && !clipRemoved) return { kept: geom, caps: null, mode: 'none' };
    return { kept, caps: null, mode: 'clip' };
  }
  // a memória da peça (no worker — chunkgen.js pieceMemo): os cortes chegam um de cada vez;
  // com o resultado de antes, só os cortes NOVOS passam pelo CSG (50 cortes de uma vez numa
  // peça grande eram segundos; um a mais sobre o resultado guardado, milissegundos)
  const ids = mine.map((c) => c.id ?? '');
  const prev = memo && key ? memo.get(key) : null;
  const usable = prev && prev.ids.every((id) => ids.includes(id));
  let todo = mine;
  let start = null;
  if (usable) {
    todo = mine.filter((c) => !prev.ids.includes(c.id ?? ''));
    if (!todo.length) return prev.none ? { kept: geom, caps: null, mode: 'none' } : { kept: prev.kept?.clone() ?? null, caps: prev.caps?.clone() ?? null, mode: 'memo' };
    if (!prev.none) start = partsBrush(prev.kept, prev.caps);
  }
  const remember = (r) => {
    if (memo && key) memo.set(key, r.mode === 'none' ? { ids, none: true } : { ids, kept: r.kept?.clone() ?? null, caps: r.caps?.clone() ?? null });
    return r;
  };
  // uma peça grande feita de partes soltas (barras de uma treliça fundidas numa malha): o CSG
  // custa pelos triângulos todos — só as partes que o corte alcança passam por ele; as outras
  // ficam como estão (partes desconexas são sólidos separados: o resultado é o mesmo)
  let src = start ? null : plain(geom);
  let far = null;
  const nt = src ? src.attributes.position.count / 3 : 0;
  if (src && nt > SPLIT_TRIS) {
    src.setIndex([...Array(nt * 3).keys()]);
    const comps = components(src);
    if (comps.length > 1) {
      const near = [];
      const away = [];
      for (const c of comps) (todo.some((cut) => cutHitsBoxes(cut, [...c.min, ...c.max])) ? near : away).push(...c.tris);
      if (!near.length) return remember({ kept: geom, caps: null, mode: 'none' });
      if (away.length) {
        far = triSubset(src, away);
        src = triSubset(src, near);
      }
    }
    if (!far) src.setIndex(null);
  }
  try {
    const ev = new CSG.Evaluator();
    ev.attributes = ['position', 'normal'];
    ev.useGroups = true;
    let res = start ?? new CSG.Brush(src, MAT_PIECE);
    res.updateMatrixWorld();
    const groups = groupCuts(todo);
    for (const group of groups) {
      const next = ev.evaluate(res, groupBrush(group, geom.boundingSphere, MAT_CUT), CSG.SUBTRACTION);
      next.updateMatrixWorld();
      res = next;
    }
    const { kept, caps } = splitGroups(res);
    // nenhuma face do corte: ou o cilindro passou ao lado (o pré-filtro é pela esfera) — nada
    // mudou —, ou a peça é mais fina que ele (uma nervura de 7 cm atravessada: o pedaço de dentro
    // sai, mas a parede do furo fica toda fora da peça). Decide pelos vértices: algum dentro?
    if (!caps && !anyInside(start ? null : geom, todo)) return remember(start ? { kept: prev.kept?.clone() ?? null, caps: null, mode: 'memo' } : { kept: geom, caps: null, mode: 'none' });
    // peças feitas de várias caixas que se atravessam parecem fechadas, mas o CSG classifica
    // parte dos triângulos errado: o que sobrou dentro do furo sai (só de dentro — nada de fora)
    const clean = kept ? dropInside(kept, mine) : null;
    return remember({ kept: far ? concat(clean, far) : clean, caps, mode: (start ? 'memo+' : '') + (clean !== kept ? 'csg+limpeza' : 'csg') + (far ? '+partes' : '') });
  } catch {
    return { kept: clipOpen(geom, mine, maxEdge), caps: null, mode: 'csg-failed→clip' };
  }
}

/** Alguma aresta da peça passa dentro de um dos cortes? (sem peça — o resultado guardado —: sim)
 *  Pelas arestas, não pelos vértices: uma barra longa cruzada no meio não tem vértice ali. */
function anyInside(geom, cuts) {
  if (!geom) return true;
  const p = geom.attributes.position;
  const ix = geom.index;
  const n = ix ? ix.count : p.count;
  const v = (i) => {
    const k = ix ? ix.getX(i) : i;
    return [p.getX(k), p.getY(k), p.getZ(k)];
  };
  for (let t = 0; t < n; t += 3) {
    const A = v(t);
    const B = v(t + 1);
    const C = v(t + 2);
    for (const [a, b] of [[A, B], [B, C], [C, A]]) for (const c of cuts) if (segSegDist({ a, b }, c) < c.r) return true;
  }
  return false;
}

/** O resultado guardado de uma peça (o que ficou + as faces do corte) como pincel: as faces
 *  do corte continuam no material do corte. */
function partsBrush(kept, caps) {
  const flat = (g, k) => (g ? (g.index ? g.toNonIndexed() : g).attributes[k].array : new Float32Array(0));
  const pk = flat(kept, 'position');
  const pc = flat(caps, 'position');
  const p = new Float32Array(pk.length + pc.length);
  p.set(pk);
  p.set(pc, pk.length);
  const n = new Float32Array(p.length);
  n.set(flat(kept, 'normal'));
  n.set(flat(caps, 'normal'), pk.length);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  g.addGroup(0, pk.length / 3, 0);
  g.addGroup(pk.length / 3, pc.length / 3, 1);
  const brush = new CSG.Brush(g, [MAT_PIECE, MAT_CUT]);
  brush.updateMatrixWorld();
  return brush;
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

/**
 * O corte (GLOBAL, { a, b, r }) encosta em alguma das caixas (Float32Array, 6 por caixa)?
 * O segmento contra cada caixa engordada pelo raio (o teste do raio contra a caixa).
 */
export function cutHitsBoxes(c, boxes) {
  if (!boxes) return true;
  const o = c.a;
  const d = [c.b[0] - o[0], c.b[1] - o[1], c.b[2] - o[2]];
  const r = c.r + 0.1;
  for (let i = 0; i < boxes.length; i += 6) {
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const mn = boxes[i + k] - r;
      const mx = boxes[i + 3 + k] + r;
      if (Math.abs(d[k]) < 1e-9) {
        if (o[k] < mn || o[k] > mx) ok = false;
        continue;
      }
      let ta = (mn - o[k]) / d[k];
      let tb = (mx - o[k]) / d[k];
      if (ta > tb) [ta, tb] = [tb, ta];
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) ok = false;
    }
    if (ok) return true;
  }
  return false;
}
