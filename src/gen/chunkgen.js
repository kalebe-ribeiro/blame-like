// ─────────────────────────────────────────────────────────────────────────────
//  Geração de um chunk (cubo de CHUNK metros). Roda dentro de um Web Worker.
//
//  Toda geometria é construída em coordenadas LOCAIS ao canto do chunk
//  (B.L(xGlobal, yGlobal, zGlobal) faz a conversão) — assim não há perda de
//  precisão de float32 mesmo a milhões de metros da origem.
//
//  Camadas (na ordem):
//    pilares → passarelas → dutos → cabos → objetos flutuantes → rede andável
//    → vestimenta das megaestruturas (sacadas, escadas, prédios; ver dressing.js)
//
//  Para adicionar algo novo: escreva gen<Algo>(F, B, box) e chame em
//  generateChunk(). Use sempre rngAt(seed, coordenadas, SAL_ÚNICO) para que o
//  resultado seja determinístico e independente dos outros sistemas.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { CHUNK, PILLAR_CELL, SEG_H, WALK, DUCT } from './field.js';
import { genTransit, stationNear } from './transit.js';
import { rngAt } from './hash.js';
import { mergeAll, place, cylinderBetween } from '../world/geometry.js';
import { catenaryCable, buildTendril, plumbLine } from '../world/cables.js';

import { FLUORO, SODIUM, COLD, WARN } from './colors.js';
import { genNetwork } from './network.js';
import { genDressing, habitation } from './dressing.js';
import { genHive, genMassif } from './closed.js';
import { genHuman } from './human.js';

export { FLUORO, SODIUM, COLD };
const COLORS = [FLUORO, SODIUM, COLD];

const lerp = (a, b, t) => a + (b - a) * t;

/** Acumula geometrias por material + luzes, e empacota para transferência. */
export class ChunkBuilder {
  constructor(x0, y0, z0, lod = 0) {
    this.x0 = x0;
    this.y0 = y0;
    this.z0 = z0;
    this.lod = lod; // 0 = detalhe total; 1, 2 = cada vez mais simplificado
    this.parts = {};
    this.lights = [];
    this.emitters = []; // gotas / vapor (animados na thread principal)
  }

  /** Emissor de partículas em coordenadas GLOBAIS: { type: 'drip'|'steam', x, y, z, ... } */
  emit(e) {
    if (!this.lod) this.emitters.push(e);
  }

  /** Global → local (Vector3). */
  L(x, y, z) {
    return new THREE.Vector3(x - this.x0, y - this.y0, z - this.z0);
  }

  add(mat, geom) {
    if (!geom) return;
    (this.parts[mat] ??= []).push(geom);
  }

  /** Luz em coordenadas GLOBAIS. */
  light(x, y, z, color, intensity, mode = 'steady') {
    if (this.lod) return; // chunks distantes não contribuem luzes
    this.lights.push({ x, y, z, color, intensity, mode, phase: Math.abs((x * 0.013 + y * 0.029 + z * 0.071) % 100) });
  }

  finish() {
    const meshes = [];
    for (const [mat, list] of Object.entries(this.parts)) {
      const g = mergeAll(list);
      if (!g) continue;
      g.computeBoundingSphere();
      const bs = g.boundingSphere;
      meshes.push({
        mat,
        position: g.attributes.position.array,
        normal: packNormals(g.attributes.normal.array),
        index: g.index.array,
        sphere: [bs.center.x, bs.center.y, bs.center.z, bs.radius],
      });
    }
    return { meshes, lights: this.lights, emitters: this.emitters };
  }
}

/**
 * Normais em 8 bits com sinal, 4 componentes (a 4ª é enchimento: o formato
 * RGBA8_SNORM é nativo na GPU). 4 bytes por vértice em vez de 12 — menos
 * memória e menos banda ao enviar chunks novos para a GPU.
 */
function packNormals(src) {
  const n = src.length / 3;
  const out = new Int8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(Math.max(-1, Math.min(1, src[i * 3])) * 127);
    out[i * 4 + 1] = Math.round(Math.max(-1, Math.min(1, src[i * 3 + 1])) * 127);
    out[i * 4 + 2] = Math.round(Math.max(-1, Math.min(1, src[i * 3 + 2])) * 127);
  }
  return out;
}

/** Índices n tais que n·step + off ∈ [lo, hi). */
function* lattice(lo, hi, step, off = 0) {
  for (let n = Math.ceil((lo - off) / step); n * step + off < hi; n++) yield n;
}

/**
 * Gera um chunk. level 0 = cubo de 192 m com detalhe total. level 1/2 = cubo
 * de 384/768 m (LOD) — percorre os chunks finos contidos nele e chama os mesmos
 * geradores em modo simplificado (B.lod): só as massas grandes, sem cabos,
 * corrimãos, degraus, luzes nem detalhes.
 */
export function generateChunk(F, cx, cy, cz, level = 0) {
  const n = 1 << level;
  const size = CHUNK * n;
  const B = new ChunkBuilder(cx * size, cy * size, cz * size, level);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        const fx = cx * n + a;
        const fy = cy * n + b;
        const fz = cz * n + c;
        const box = {
          x0: fx * CHUNK, y0: fy * CHUNK, z0: fz * CHUNK,
          x1: (fx + 1) * CHUNK, y1: (fy + 1) * CHUNK, z1: (fz + 1) * CHUNK,
        };
        const anchors = [];
        genPillars(F, B, box, anchors);
        genHive(F, B, box);
        genMassif(F, B, box);
        genNetwork(F, B, box);
        if (level <= 1) {
          genWalkways(F, B, box, anchors);
          genTransit(F, B, box);
          genDucts(F, B, box);
          genFloaters(F, B, box, fx, fy, fz);
        }
        if (level === 0) {
          genCables(F, B, anchors);
          genDressing(F, B, box);
          genHuman(F, B, box);
        }
      }
    }
  }
  return B.finish();
}

// ─── pilares ────────────────────────────────────────────────────────────────

function genPillars(F, B, box, anchors) {
  const i0 = Math.floor(box.x0 / PILLAR_CELL);
  const k0 = Math.floor(box.z0 / PILLAR_CELL);
  const j0 = Math.floor(box.y0 / SEG_H);
  const n = CHUNK / PILLAR_CELL;
  const segs = CHUNK / SEG_H;
  for (let i = i0; i < i0 + n; i++) {
    for (let k = k0; k < k0 + n; k++) {
      const p = F.pillar(i, k);
      if (!p) continue;
      for (let j = j0; j < j0 + segs; j++) {
        if (F.segmentPresent(p, j)) buildSegment(F, B, p, j, anchors);
      }
    }
  }
}

function buildSegment(F, B, p, j, anchors) {
  if (B.lod) {
    // LOD: um único tronco por segmento, 4 lados
    const ya = j * SEG_H;
    const ca = F.pillarCenter(p, ya);
    const cb = F.pillarCenter(p, ya + SEG_H);
    B.add('tower', cylinderBetween(B.L(ca.x, ya, ca.z), B.L(cb.x, ya + SEG_H, cb.z), F.pillarRadius(p, j), F.pillarRadius(p, j + 1), 4, { spin: p.spin, heightSegments: 1 }));
    return;
  }
  const r = rngAt(F.seed, p.i, j, p.k, 5);
  const ya = j * SEG_H;
  const yb = ya + SEG_H;
  const ra = F.pillarRadius(p, j);
  const rb = F.pillarRadius(p, j + 1);
  const cA = { x: 0, z: 0 };
  const cB = { x: 0, z: 0 };
  const opts = { spin: p.spin };

  // o segmento é dividido em 1–3 peças; bordas contínuas, meio livre para "saltos de escala"
  const pieces = r.int(1, 3);
  for (let m = 0; m < pieces; m++) {
    const t0 = m / pieces;
    const t1 = (m + 1) / pieces;
    const y0 = ya + t0 * SEG_H;
    const y1 = ya + t1 * SEG_H;
    F.pillarCenter(p, y0, cA);
    F.pillarCenter(p, y1, cB);
    const r0 = lerp(ra, rb, t0);
    const r1 = lerp(ra, rb, t1);
    const A = B.L(cA.x, y0, cA.z);
    const Bp = B.L(cB.x, y1, cB.z);
    const roll = r.next();

    if (roll < 0.1) {
      // tendão: afina até quase nada no meio da peça
      const mid = A.clone().lerp(Bp, 0.5);
      const thin = Math.max(0.5, p.baseR * r.float(0.1, 0.25));
      B.add('tower', cylinderBetween(A, mid, r0, thin, p.sides, opts));
      B.add('tower', cylinderBetween(mid, Bp, thin, r1, p.sides, opts));
    } else {
      B.add('tower', cylinderBetween(A, Bp, r0, r1, p.sides, opts));
      if (roll < 0.22) {
        // bulbo: a escala triplica sem aviso
        const big = Math.max(r0, r1) * r.float(2.0, 3.4);
        const h = (y1 - y0) * r.float(0.4, 0.8);
        const mid = A.clone().lerp(Bp, 0.5);
        B.add('tower', place(new THREE.CylinderGeometry(big * 0.85, big, h, p.sides, 3, true), { x: mid.x, y: mid.y, z: mid.z, ry: p.spin }));
        const capH = h * 0.35;
        B.add('tower', place(new THREE.ConeGeometry(big * 0.85, capH, p.sides, 2, true), { x: mid.x, y: mid.y + h / 2 + capH / 2, z: mid.z, ry: p.spin }));
        B.add('tower', place(new THREE.ConeGeometry(big, capH, p.sides, 2, true), { x: mid.x, y: mid.y - h / 2 - capH / 2, z: mid.z, rx: Math.PI, ry: p.spin }));
      }
    }
  }

  const c = { x: 0, z: 0 };
  // colares: lajes que abraçam o pilar (andares técnicos, plataformas de serviço)
  if (r.chance(0.3)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const rr = Math.max(ra, rb) * r.float(1.3, 2.0);
    const L = B.L(c.x, y, c.z);
    const h = r.float(1.5, 6);
    B.add('rib', place(new THREE.CylinderGeometry(rr, rr, h, p.sides, 1, false), { x: L.x, y: L.y, z: L.z, ry: p.spin }));
  }
  // aletas / antenas
  if (r.chance(0.2)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const len = r.float(8, 40);
    const ang = r.float(0, Math.PI * 2);
    const r0 = Math.max(ra, rb) + len / 2 - 1;
    const L = B.L(c.x + Math.cos(ang) * r0, y, c.z + Math.sin(ang) * r0);
    const fin = new THREE.BoxGeometry(len, r.float(0.3, 1.2), r.float(0.5, 3), Math.max(1, Math.round(len / 4)), 1, 1);
    B.add('tower', place(fin, { x: L.x, y: L.y, z: L.z, ry: -ang }));
  }
  // âncoras (cabos) — guardam o pilar para o cabo sair da face certa
  const na = r.int(0, 2);
  for (let q = 0; q < na; q++) {
    const y = ya + r.float(0.1, 0.9) * SEG_H;
    anchors.push({ kind: 'pillar', p, y, r: lerp(ra, rb, (y - ya) / SEG_H) * 0.9 });
  }
  // tentáculos e fios de prumo saindo do pilar
  if (r.chance(0.12)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const ang = r.float(0, Math.PI * 2);
    const rr = lerp(ra, rb, (y - ya) / SEG_H);
    const o = B.L(c.x + Math.cos(ang) * rr, y, c.z + Math.sin(ang) * rr);
    B.add('cable', r.chance(0.12)
      ? buildTendril(o, { rng: r, dir: 'down', iterations: 4, scale: r.float(1, 2.2) })
      : plumbLine(o, r.float(80, 260), { rng: r, radius: r.float(0.06, 0.25) }));
  }
  // luz na superfície
  if (r.chance(0.07)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const ang = r.float(0, Math.PI * 2);
    const rr = lerp(ra, rb, (y - ya) / SEG_H) + 3;
    B.light(c.x + Math.cos(ang) * rr, y, c.z + Math.sin(ang) * rr, r.pick(COLORS), r.float(40, 120), r.chance(0.5) ? 'faulty' : 'steady');
  }

  // extremidades: o pilar termina aqui (em cima e/ou embaixo)
  if (!F.segmentPresent(p, j + 1)) buildCrown(F, B, p, yb, rb, r);
  if (!F.segmentPresent(p, j - 1)) buildRoot(F, B, p, ya, ra, r);
}

function buildCrown(F, B, p, y, radius, r) {
  const c = F.pillarCenter(p, y);
  const L = B.L(c.x, y, c.z);
  // laje de cobertura
  B.add('tower', place(new THREE.CylinderGeometry(radius * 1.1, radius, 3, p.sides, 1, false), { x: L.x, y: L.y + 1.5, z: L.z, ry: p.spin }));
  if (r.chance(0.5)) {
    // casa de máquinas
    const s = radius * r.float(0.6, 1.1);
    const h = r.float(8, 30);
    B.add('block', place(new THREE.BoxGeometry(s, h, s * r.float(0.6, 1)), { x: L.x, y: L.y + 3 + h / 2, z: L.z, ry: p.spin }));
  }
  // mastros e antenas
  const n = r.int(1, 5);
  for (let i = 0; i < n; i++) {
    const len = r.float(10, 60);
    const ox = r.float(-0.7, 0.7) * radius;
    const oz = r.float(-0.7, 0.7) * radius;
    B.add('duct', cylinderBetween(L.clone().add(new THREE.Vector3(ox, 3, oz)), L.clone().add(new THREE.Vector3(ox, 3 + len, oz)), r.float(0.2, 0.7), 0.1, 5));
  }
  if (r.chance(0.3)) B.light(c.x, y + 8, c.z, WARN, r.float(40, 90), 'faulty'); // luz de obstáculo
  if (r.chance(0.25)) B.light(c.x, y + 12, c.z, r.pick(COLORS), r.float(60, 160), 'steady');
}

function buildRoot(F, B, p, y, radius, r) {
  const c = F.pillarCenter(p, y);
  const L = B.L(c.x, y, c.z);
  if (r.chance(0.8)) {
    // ponta invertida pendendo no vazio
    const len = r.float(25, 130);
    B.add('tower', place(new THREE.ConeGeometry(radius, len, p.sides, 8, true), { x: L.x, y: L.y - len / 2, z: L.z, rx: Math.PI, ry: p.spin }));
  } else {
    // corte seco com feixes de cabos pendendo (raramente, algo orgânico)
    B.add('tower', place(new THREE.CylinderGeometry(radius, radius * 0.5, 3, p.sides, 1, false), { x: L.x, y: L.y - 1.5, z: L.z, ry: p.spin }));
    const n = r.int(3, 7);
    const organic = r.chance(0.15);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + r.float(0, 0.5);
      const o = L.clone().add(new THREE.Vector3(Math.cos(ang) * radius * 0.6, -2, Math.sin(ang) * radius * 0.6));
      B.add('cable', organic
        ? buildTendril(o, { rng: r, dir: 'down', iterations: 4, scale: r.float(1.5, 3) })
        : plumbLine(o, r.float(30, 180), { rng: r, radius: r.float(0.15, 0.5) }));
    }
  }
}

// ─── passarelas ─────────────────────────────────────────────────────────────

function genWalkways(F, B, box, anchors) {
  const { spacing, ySpacing } = WALK;
  // ao longo de Z (inclui a ponte inicial)
  for (const a of lattice(box.x0, box.x1, spacing)) {
    for (const b of lattice(box.y0, box.y1, ySpacing)) {
      const w = F.walkZ(a, b);
      if (w) buildWalk(F, B, 'z', a * spacing, b * ySpacing, box.z0, box.z1, w, a * 7919 + b * 104729, anchors);
    }
  }
  // ao longo de X
  for (const b of lattice(box.y0, box.y1, ySpacing, ySpacing / 2)) {
    for (const c of lattice(box.z0, box.z1, spacing, spacing / 2)) {
      const w = F.walkX(b, c);
      if (w) buildWalk(F, B, 'x', c * spacing + spacing / 2, b * ySpacing + ySpacing / 2, box.x0, box.x1, w, b * 15485863 + c * 7919 + 17, anchors);
    }
  }
}

function buildWalk(F, B, axis, u, y, t0, t1, w, salt, anchors) {
  const mod = WALK.module;
  // P(t, dy, du): ponto na linha (t ao longo do eixo, du lateral)
  const G = (t, dy = 0, du = 0) => (axis === 'z' ? [u + du, y + dy, t] : [t, y + dy, u + du]);
  const P = (t, dy, du) => B.L(...G(t, dy, du));
  const rotY = axis === 'z' ? 0 : Math.PI / 2;
  const hw = w.width / 2;

  if (B.lod) {
    let run = null;
    const flush = () => {
      if (!run) return;
      const c = P((run.a + run.b) / 2, -0.4);
      B.add('bridge', place(new THREE.BoxGeometry(w.width, 0.8, run.b - run.a), { x: c.x, y: c.y, z: c.z, ry: rotY }));
      run = null;
    };
    for (const m of lattice(t0, t1, mod)) {
      const ts = m * mod;
      if (F.walkGap(salt, ts + mod / 2, w.main, y)) flush();
      else if (run) run.b = ts + mod;
      else run = { a: ts, b: ts + mod };
    }
    flush();
    return;
  }

  for (const m of lattice(t0, t1, mod)) {
    const ts = m * mod;
    if (F.walkGap(salt, ts + mod / 2, w.main, y)) continue;
    const [gx0, gy0, gz0] = G(ts, -4, -hw - 1);
    const [gx1, gy1, gz1] = G(ts + mod, 12, hw + 1);
    const res = F.reservedHit(Math.min(gx0, gx1), gy0, Math.min(gz0, gz1), Math.max(gx0, gx1), gy1, Math.max(gz0, gz1));
    if (res && !res.keepWalkways) continue;

    const r = rngAt(F.seed, m, salt, axis === 'z' ? 1 : 2, 40);
    const len = mod - 0.35;
    // a passarela acaba no vazio: ponta quebrada, lajes penduradas, ferragem exposta
    for (const [edge, gapT] of [[ts + mod, ts + mod + mod / 2], [ts, ts - mod / 2]]) {
      if (!F.walkGap(salt, gapT, w.main, y)) continue;
      const dir = edge > ts ? 1 : -1;
      for (let q = 0; q < 4; q++) {
        const du = r.float(-hw, hw);
        const a = P(edge, -0.4, du);
        const b = P(edge + dir * r.float(0.5, 3), -r.float(0.5, 4), du + r.float(-1, 1));
        B.add('rib', cylinderBetween(a, b, 0.05, 0.03, 4)); // vergalhões
      }
      const slabLen = r.float(3, 7);
      const g = new THREE.BoxGeometry(w.width * r.float(0.4, 0.9), 0.6, slabLen);
      g.translate(0, 0, (dir * slabLen) / 2);
      g.rotateX(dir * r.float(0.6, 1.2));
      g.rotateY(rotY);
      const p = P(edge, -0.5, r.float(-hw / 2, hw / 2));
      g.translate(p.x, p.y, p.z);
      B.add('bridge', g);
    }
    const c = P(ts + len / 2, -0.4);
    // tabuleiro
    B.add('bridge', place(new THREE.BoxGeometry(w.width, 0.8, len, Math.ceil(w.width / 3), 1, 3), { x: c.x, y: c.y, z: c.z, ry: rotY }));
    // quilha
    B.add('bridge', cylinderBetween(P(ts + 0.3, -2.2), P(ts + len - 0.3, -2.2), 1.4, 0.6, 6));
    // corrimãos (abertos do lado do trilho onde há uma estação de transportador)
    for (const s of [-1, 1]) {
      if (w.track && s === w.track.side && stationNear(ts, ts + mod)) continue;
      B.add('bridge', cylinderBetween(P(ts, 1.1, s * (hw - 0.2)), P(ts + mod, 1.1, s * (hw - 0.2)), 0.12, 0.12, 5, { heightSegments: 3, open: true }));
    }
    if (res) continue; // dentro de zona reservada: só o tabuleiro

    // costelas em "regiões costeladas"
    const ribbed = F.noise3(ts * 0.01, salt * 0.001, 9.1) > -0.1;
    if (ribbed && r.chance(0.55)) {
      const arc = r.chance(0.25) ? Math.PI * r.float(0.45, 0.8) : Math.PI;
      const rad = hw + (w.track ? r.float(1.8, 2.4) : r.float(3, 5.5)); // com trilho: longe do vagão
      const rib = new THREE.TorusGeometry(rad, r.float(0.2, 0.45), 6, 30, arc);
      rib.rotateZ(r.float(-0.12, 0.12) + (arc < Math.PI ? r.float(0, Math.PI - arc) : 0));
      rib.scale(1, r.float(1.0, 1.6), 1);
      rib.rotateY(rotY);
      const q = P(ts + len / 2, -1);
      rib.translate(q.x, q.y, q.z);
      B.add('rib', rib);
    }
    if (r.chance(0.1)) {
      const [lx, ly, lz] = G(ts + len / 2, 5, r.sign() * 2);
      B.light(lx, ly, lz, (m & 1) ? SODIUM : FLUORO, r.float(30, 50), r.chance(0.5) ? 'faulty' : 'steady');
    }
    if (r.chance(0.12)) {
      const [ax, ay, az] = G(ts + len / 2, -1.2, (w.track ? -w.track.side : r.sign()) * hw);
      anchors.push({ kind: 'point', gx: ax, gy: ay, gz: az });
    }
    if (r.chance(0.015)) B.add('cable', buildTendril(P(ts + len / 2, -2.8, r.float(-1, 1)), { rng: r, dir: 'down', iterations: 4 }));
    if (r.chance(0.05)) B.add('cable', plumbLine(P(ts + len / 2, -2, r.sign() * hw * 0.8), r.float(100, 300), { rng: r, radius: r.float(0.06, 0.18) }));
  }
}

// ─── dutos ──────────────────────────────────────────────────────────────────

function genDucts(F, B, box) {
  const { spacing, ySpacing } = DUCT;
  for (const b of lattice(box.y0, box.y1, ySpacing, 40)) {
    for (const c of lattice(box.z0, box.z1, spacing, 70)) {
      const d = F.duct('x', b, c);
      if (d) buildDuct(F, B, 'x', b * ySpacing + 40, c * spacing + 70, box.x0, box.x1, d);
    }
  }
  for (const a of lattice(box.x0, box.x1, spacing, 150)) {
    for (const b of lattice(box.y0, box.y1, ySpacing, 140)) {
      const d = F.duct('z', a, b);
      if (d) buildDuct(F, B, 'z', a * spacing + 150, b * ySpacing + 140, box.z0, box.z1, d);
    }
  }
  for (const a of lattice(box.x0, box.x1, spacing, 230)) {
    for (const c of lattice(box.z0, box.z1, spacing, 10)) {
      const d = F.duct('y', a, c);
      if (d) buildDuct(F, B, 'y', a * spacing + 230, c * spacing + 10, box.y0, box.y1, d);
    }
  }
}

function buildDuct(F, B, axis, fa, fb, t0, t1, d) {
  // eixo x: (t, fa=y, fb=z) · eixo z: (fa=x, fb=y, t) · eixo y: (fa=x, t, fb=z)
  const G = (t, da = 0, db = 0) =>
    axis === 'x' ? [t, fa + da, fb + db] : axis === 'z' ? [fa + da, fb + db, t] : [fa + da, t, fb + db];
  const P = (t, da, db) => B.L(...G(t, da, db));
  const piece = DUCT.piece;
  const R = d.radius;
  for (const n of lattice(t0, t1, piece)) {
    const ts = n * piece;
    if (F.ductGap(d.salt, ts + piece / 2)) continue;
    if (F.inBarrier(G(ts + piece / 2)[1], R + 4)) continue;
    const [ax, ay, az] = G(ts, -R - 2, -R - 2);
    const [bx, by, bz] = G(ts + piece, R + 2, R + 2);
    if (F.reservedHit(Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz), Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz))) continue;

    if (B.lod) {
      B.add('duct', cylinderBetween(P(ts), P(ts + piece), R, R, 6, { heightSegments: 1 }));
      continue;
    }
    B.add('duct', cylinderBetween(P(ts), P(ts + piece), R, R, 10, { heightSegments: 4 }));
    if (Math.abs(Math.sin(ts * 3.17 + d.salt * 1.13) * 43758.5453) % 1 < 0.03) {
      const [ex, ey, ez] = G(ts + piece / 2, axis === 'y' ? 0 : R, 0);
      B.emit({ type: 'steam', x: ex, y: ey, z: ez, h: 10 + R * 4, rate: 0.18 });
    }
    if (n % d.ringEvery === 0) {
      const ring = new THREE.TorusGeometry(R * 1.3, R * 0.2, 6, 20);
      if (axis === 'x') ring.rotateY(Math.PI / 2);
      if (axis === 'y') ring.rotateX(Math.PI / 2);
      const q = P(ts + 2);
      ring.translate(q.x, q.y, q.z);
      B.add('rib', ring);
    }
    for (let k = 0; k < d.bundle; k++) {
      const ang = k * 2.1 + d.salt;
      const off = R * 1.55;
      const da = Math.cos(ang) * off;
      const db = Math.sin(ang) * off;
      const rs = R * 0.22;
      B.add('duct', cylinderBetween(P(ts, da, db), P(ts + piece, da, db), rs, rs, 6, { heightSegments: 2, open: true }));
    }
    const h = Math.abs(Math.sin(ts * 12.9898 + d.salt * 78.233) * 43758.5453) % 1;
    if (h < 0.03) {
      const [lx, ly, lz] = G(ts + piece / 2, R + 1.5, 0);
      B.light(lx, ly, lz, FLUORO, 50, 'faulty');
    }
  }
}

// ─── cabos ──────────────────────────────────────────────────────────────────

function genCables(F, B, anchors) {
  const c = { x: 0, z: 0 };
  for (const a of anchors) {
    // posição global de partida (para pilares: calculada depois, na face certa)
    let gx, gy, gz;
    if (a.kind === 'pillar') {
      F.pillarCenter(a.p, a.y, c);
      gx = c.x;
      gy = a.y;
      gz = c.z;
    } else {
      gx = a.gx;
      gy = a.gy;
      gz = a.gz;
    }
    const r = rngAt(F.seed, Math.round(gx * 10), Math.round(gy * 10), Math.round(gz * 10), 50);
    if (!r.chance(a.kind === 'point' ? 0.9 : 0.45)) continue;

    const ci = Math.floor(gx / PILLAR_CELL);
    const ck = Math.floor(gz / PILLAR_CELL);
    for (let tries = 0; tries < 5; tries++) {
      const di = r.int(-2, 2);
      const dk = r.int(-2, 2);
      if (!di && !dk) continue;
      const q = F.pillar(ci + di, ck + dk);
      if (!q || q === a.p) continue;
      const ty = gy + r.float(-35, 35);
      const j = Math.floor(ty / SEG_H);
      if (!F.segmentPresent(q, j)) continue;
      const tc = F.pillarCenter(q, ty);
      const tr = F.pillarRadius(q, j) * 0.9;
      // pontos nas faces que se olham
      let dx = gx - tc.x;
      let dz = gz - tc.z;
      let dl = Math.hypot(dx, dz) || 1;
      const ex = tc.x + (dx / dl) * tr;
      const ez = tc.z + (dz / dl) * tr;
      let sx = gx;
      let sz = gz;
      if (a.kind === 'pillar') {
        dx = ex - gx;
        dz = ez - gz;
        dl = Math.hypot(dx, dz) || 1;
        sx = gx + (dx / dl) * a.r;
        sz = gz + (dz / dl) * a.r;
      }
      const span = Math.hypot(ex - sx, ty - gy, ez - sz);
      if (span < 20 || span > 240) continue;
      B.add('cable', catenaryCable(B.L(sx, gy, sz), B.L(ex, ty, ez), {
        rng: r,
        noise3: F.noise3,
        radius: r.float(0.25, 1.6),
        sag: r.float(0.08, 0.35),
      }));
      break;
    }
  }
}

// ─── objetos flutuantes ─────────────────────────────────────────────────────

function genFloaters(F, B, box, cx, cy, cz) {
  const r = rngAt(F.seed, cx, cy, cz, 60);
  let n = r.chance(0.55) ? 1 : 0;
  if (r.chance(0.18)) n++;
  for (let q = 0; q < n; q++) {
    const gx = box.x0 + r.float(30, CHUNK - 30);
    const gy = box.y0 + r.float(30, CHUNK - 30);
    const gz = box.z0 + r.float(30, CHUNK - 30);
    if (F.reservedHit(gx - 70, gy - 70, gz - 70, gx + 70, gy + 70, gz + 70)) continue;
    if (F.walkwayNear(gx, gy - 50, gy + 50, gz, 50)) continue;
    if (!F.isOpenBiome(gx, gy, gz) || F.insideVoid(gx, gy, gz) || F.touchesBarrier(gy - 80, gy + 80)) continue;
    // brutalismo em maioria; carcaças e neurônios são anomalias raras
    const kind = r.pick(['block', 'block', 'block', 'slab', 'slab', 'cage', 'cage', 'ring', 'ribcage', 'neuron']);
    const o = B.L(gx, gy, gz);
    if (B.lod) {
      if (kind === 'block' || kind === 'slab') B.add('block', place(new THREE.BoxGeometry(r.float(15, 40), r.float(20, 80), r.float(15, 40)), { x: o.x, y: o.y, z: o.z }));
      continue;
    }
    FLOATERS[kind](B, o, r, [gx, gy, gz]);
  }
}

const Z = new THREE.Vector3(0, 0, 1);

const FLOATERS = {
  /** Bloco habitacional sem chão: prédios inteiros suspensos, presos a nada. */
  block(B, o, r, g) {
    habitation(B, r, g[0], g[1], g[2], true);
    // a laje de onde ele foi arrancado
    const w = r.float(30, 60);
    B.add('dress', place(new THREE.BoxGeometry(w, 3, w * r.float(0.6, 1)), { x: o.x, y: o.y - 1.5, z: o.z, ry: r.float(0, 1) }));
    if (r.chance(0.5)) B.add('cable', plumbLine(o.clone().add(new THREE.Vector3(r.float(-8, 8), -3, r.float(-8, 8))), r.float(40, 160), { rng: r, radius: 0.2 }));
  },

  /** Carcaça: espinha com costelas arqueadas — um organismo imenso, morto ou dormindo. */
  ribcage(B, o, r) {
    const axis = new THREE.Vector3(r.float(-1, 1), r.float(-0.25, 0.25), r.float(-1, 1)).normalize();
    const len = r.float(40, 100);
    const count = Math.floor(len / 5);
    const ribR = r.float(6, 14);
    const flip = r.chance(0.3);
    const quat = new THREE.Quaternion().setFromUnitVectors(Z, axis);
    const side = new THREE.Vector3(0, 1, 0).cross(axis).normalize();
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const p = o.clone().addScaledVector(axis, (t - 0.5) * len).addScaledVector(side, Math.sin(t * Math.PI * 2) * 3);
      B.add('organic', place(new THREE.IcosahedronGeometry(r.float(1.2, 2.4), 1), { x: p.x, y: p.y, z: p.z }));
      if (i === 0 || i === count) continue;
      const R = 2 + ribR * Math.sin(Math.PI * t);
      const arc = Math.PI * r.float(0.9, 1.25);
      const rib = new THREE.TorusGeometry(R, r.float(0.3, 0.7), 5, 24, arc);
      rib.rotateZ(Math.PI / 2 - arc / 2 + (flip ? Math.PI : 0));
      rib.applyQuaternion(quat);
      rib.translate(p.x, p.y, p.z);
      B.add('organic', rib);
    }
  },

  /** Neurônio: núcleo com dendritos em todas as direções. */
  neuron(B, o, r, g) {
    const R = r.float(5, 12);
    B.add('organic', place(new THREE.IcosahedronGeometry(R, 2), { x: o.x, y: o.y, z: o.z }));
    const n = r.int(5, 8);
    for (let i = 0; i < n; i++) {
      const dir = new THREE.Vector3(r.float(-1, 1), r.float(-1, 1), r.float(-1, 1)).normalize();
      B.add('cable', buildTendril(o.clone().addScaledVector(dir, R * 0.9), {
        rng: r,
        grammar: 'dendrite',
        iterations: 4,
        scale: r.float(1.2, 2.2),
        heading: dir,
        tropism: dir.clone().multiplyScalar(0.3),
      }));
    }
    B.light(g[0], g[1] + R + 5, g[2], SODIUM, r.float(60, 150), 'steady');
  },

  /** Laje: um pequeno monólito à deriva. */
  slab(B, o, r) {
    const w = r.float(10, 30);
    const h = r.float(60, 220);
    const d = r.float(3, 6);
    const g = new THREE.BoxGeometry(w, h, d, 3, Math.ceil(h / 10), 1);
    B.add('monolith', place(g, { x: o.x, y: o.y, z: o.z, rx: r.float(-0.3, 0.3), ry: r.float(0, Math.PI), rz: r.float(-0.4, 0.4) }));
  },

  /** Anel: halo menor, às vezes duplo. */
  ring(B, o, r) {
    const R = r.float(12, 45);
    const rot = { x: o.x, y: o.y, z: o.z, rx: r.float(0, Math.PI), ry: r.float(0, Math.PI) };
    B.add('dress', place(new THREE.TorusGeometry(R, r.float(1.5, 5), 4, 32, Math.PI * r.float(1.3, 2)), rot));
    if (r.chance(0.5)) {
      B.add('dress', place(new THREE.TorusGeometry(R * 0.7, r.float(0.8, 2.5), 4, 24, Math.PI * r.float(1, 2)), { ...rot, rz: r.float(0, 3) }));
    }
  },

  /** Gaiola: dois cubos de arestas, um girado dentro do outro. */
  cage(B, o, r, g) {
    const S = r.float(16, 50);
    const thick = r.float(0.4, 1.2);
    const cube = (size, quat) => {
      const h = size / 2;
      const corners = [];
      for (const x of [-h, h]) for (const y of [-h, h]) for (const z of [-h, h]) corners.push(new THREE.Vector3(x, y, z).applyQuaternion(quat).add(o));
      for (let a = 0; a < 8; a++) {
        for (let b = a + 1; b < 8; b++) {
          const diff = (a ^ b);
          if (diff === 1 || diff === 2 || diff === 4) B.add('duct', cylinderBetween(corners[a], corners[b], thick, thick, 4));
        }
      }
    };
    const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(r.float(0, 1), r.float(0, 3), r.float(0, 1)));
    const q2 = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 4, Math.PI / 4, 0)).premultiply(q1);
    cube(S, q1);
    cube(S * 0.6, q2);
    B.light(g[0], g[1], g[2], COLD, r.float(60, 120), 'faulty');
  },
};
