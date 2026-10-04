// ─────────────────────────────────────────────────────────────────────────────
//  Utilitários de geometria procedural.
//  Roda tanto na thread principal quanto nos workers de geração — por isso
//  importa o three via src/lib/three.js e não usa addons.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';

/**
 * Tubo com raio variável ao longo do caminho (TubeGeometry do three só tem
 * raio constante). Base de cabos, tentáculos e galhos do L-system.
 *
 * @param {THREE.Vector3[]} points  pontos de controle (suavizados por Catmull-Rom)
 * @param {number[]} radii          raio em cada ponto de controle
 * @param {object} [opts]
 * @param {number} [opts.radialSegments]  lados do tubo
 * @param {number} [opts.smooth]          subdivisões por trecho entre pontos
 */
export function buildTaperedTube(points, radii, { radialSegments = 6, smooth = 3 } = {}) {
  if (points.length < 2) return null;
  // evita pontos duplicados (quebram as frames de Frenet)
  const pts = [points[0]];
  const rds = [radii[0]];
  for (let i = 1; i < points.length; i++) {
    if (points[i].distanceToSquared(pts[pts.length - 1]) > 1e-6) {
      pts.push(points[i]);
      rds.push(radii[i]);
    }
  }
  if (pts.length < 2) return null;

  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const segs = Math.max(2, (pts.length - 1) * smooth);
  const frames = curve.computeFrenetFrames(segs, false);

  const vCount = (segs + 1) * (radialSegments + 1);
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const uvs = new Float32Array(vCount * 2);
  const idx = [];

  const P = new THREE.Vector3();
  const n = new THREE.Vector3();
  let v = 0;
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    // interpola o raio nos pontos de controle
    const f = u * (rds.length - 1);
    const i0 = Math.min(Math.floor(f), rds.length - 2);
    const r = THREE.MathUtils.lerp(rds[i0], rds[i0 + 1], f - i0);
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const a = (j / radialSegments) * Math.PI * 2;
      const s = Math.sin(a);
      const c = -Math.cos(a);
      n.set(c * N.x + s * B.x, c * N.y + s * B.y, c * N.z + s * B.z).normalize();
      pos[v * 3] = P.x + r * n.x;
      pos[v * 3 + 1] = P.y + r * n.y;
      pos[v * 3 + 2] = P.z + r * n.z;
      nor[v * 3] = n.x;
      nor[v * 3 + 1] = n.y;
      nor[v * 3 + 2] = n.z;
      uvs[v * 2] = u;
      uvs[v * 2 + 1] = j / radialSegments;
      v++;
    }
  }
  const row = radialSegments + 1;
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  g.setIndex(idx);
  return g;
}

/**
 * Junta várias geometrias em uma (um draw call). Mantém só position e normal
 * (os shaders não usam uv) e sempre produz índice Uint32. Guarda onde cada peça começa no índice
 * (userData.parts: o primeiro vértice de cada uma, e o fim — por vértice: a BVH da colisão reordena o índice): o emissor nas estruturas ativas corta peça a peça (world/dynamic.js).
 */
export function mergeAll(geoms) {
  const list = geoms.filter(Boolean);
  if (!list.length) return null;
  let vCount = 0;
  let iCount = 0;
  for (const g of list) {
    vCount += g.attributes.position.count;
    iCount += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  const parts = [];
  for (const g of list) {
    parts.push(vo);
    const p = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(p.array.subarray(0, p.count * 3), vo * 3);
    nor.set(g.attributes.normal.array.subarray(0, p.count * 3), vo * 3);
    if (g.index) {
      const src = g.index.array;
      for (let i = 0; i < src.length; i++) idx[io + i] = src[i] + vo;
      io += src.length;
    } else {
      for (let i = 0; i < p.count; i++) idx[io + i] = vo + i;
      io += p.count;
    }
    vo += p.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  parts.push(vo);
  out.userData.parts = parts;
  return out;
}

const _up = new THREE.Vector3(0, 1, 0);
const _dir = new THREE.Vector3();
const _q = new THREE.Quaternion();

/**
 * Cilindro (ou tronco de cone) ligando os pontos a → b.
 * @param {THREE.Vector3} a
 * @param {THREE.Vector3} b
 * @param {number} ra raio em a
 * @param {number} rb raio em b
 * @param {number} [sides]
 * @param {{ spin?: number, open?: boolean, heightSegments?: number }} [opts]
 */
export function cylinderBetween(a, b, ra, rb, sides = 8, { spin = 0, open = false, heightSegments } = {}) {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-4) return null;
  const hs = heightSegments ?? Math.max(1, Math.round(len / 6));
  const g = new THREE.CylinderGeometry(rb, ra, len, sides, hs, open);
  if (spin) g.rotateY(spin);
  g.translate(0, len / 2, 0);
  _q.setFromUnitVectors(_up, _dir.normalize());
  g.applyQuaternion(_q);
  g.translate(a.x, a.y, a.z);
  return g;
}

/** Caixa de largura w cujo TOPO vai de a até b (pode ser inclinada). */
export function slabBetween(a, b, w, th = 0.6) {
  const v = new THREE.Vector3().subVectors(b, a);
  const len = v.length();
  if (len < 0.05) return null;
  const hd = Math.hypot(v.x, v.z);
  const g = new THREE.BoxGeometry(w, th, len + 0.02, Math.max(1, Math.round(w / 3)), 1, Math.max(1, Math.round(len / 4)));
  g.translate(0, -th / 2, 0);
  g.rotateX(-Math.atan2(v.y, hd));
  g.rotateY(Math.atan2(v.x, v.z));
  const mid = a.clone().add(b).multiplyScalar(0.5);
  g.translate(mid.x, mid.y, mid.z);
  return g;
}

/** Aplica posição/rotação/escala a uma geometria (antes do merge). */
export function place(geom, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );
  geom.applyMatrix4(m);
  return geom;
}

/** Caixa já posicionada — atalho usado em corredores e plataformas. */
export function box(w, h, d, x, y, z, seg = 1) {
  return place(
    new THREE.BoxGeometry(w, h, d, Math.max(1, Math.round(w / 4) * seg), Math.max(1, Math.round(h / 4) * seg), Math.max(1, Math.round(d / 4) * seg)),
    { x, y, z },
  );
}

/**
 * Parede com um buraco retangular (para fachadas e transições de escala):
 * retângulo externo W×H com abertura w×h, ambos com a base em y0, centrados em x.
 * A parede fica no plano XY, com espessura `t` em z. Retorna geometrias.
 */
export function wallWithHole(W, H, w, h, t, y0 = 0) {
  const parts = [];
  const side = (W - w) / 2;
  if (side > 0.01) {
    parts.push(box(side, H, t, -(w / 2 + side / 2), y0 + H / 2, 0));
    parts.push(box(side, H, t, w / 2 + side / 2, y0 + H / 2, 0));
  }
  if (H - h > 0.01) parts.push(box(w, H - h, t, 0, y0 + h + (H - h) / 2, 0));
  return parts;
}
