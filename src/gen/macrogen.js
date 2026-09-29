// ─────────────────────────────────────────────────────────────────────────────
//  Camada MACRO: células de 1,6 km. Aqui nasce a escala da Cidade.
//
//   galerias   túneis fechados de centenas de metros de seção, sem começo nem fim
//   poços      fossos verticais sem fundo nem boca
//   estratos   pisos infinitos, abertos, com buracos e florestas de colunas
//   treliças   estruturas espaciais de vigas que ocupam regiões inteiras
//   escadarias rampas-escada que sobem e descem para sempre
//   condutos   tubos colossais fechados (22–60 m de raio), com piso interno
//   camadas    lajes intransponíveis de 72 m; só as passagens as perfuram,
//              cada uma com uma torre de elevador colossal
//   feixes     luz caindo por passagens, buracos de estratos, clarabóias e poços
//   anomalias  monólitos e agulhas (raros)
//
//  Paredes e lajes são feitas de PLACAS (MEGA.tile). Uma placa é omitida quando:
//    • seu centro está dentro do vazio de OUTRA galeria/poço (volumes se fundem);
//    • uma passarela infinita a atravessa (a ponte passa por um vão);
//    • raramente, ao acaso (aberturas para fora).
//  Cada placa pertence à célula que contém seu centro → gerada uma única vez.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { MACRO, MEGA, RELIEF } from './field.js';
import { hash4, rngAt } from './hash.js';
import { place, cylinderBetween, slabBetween } from '../world/geometry.js';
import { ChunkBuilder } from './chunkgen.js';
import { SODIUM, FLUORO, COLD, WELD } from './colors.js';
import { beamGeometry } from './beams.js';
import { genCascades } from './cascades.js';
import { genFloods } from './floods.js';

const T = MEGA.tile;
const W = MEGA.wall;

export function generateMacro(F, mx, my, mz) {
  const B = new ChunkBuilder(mx * MACRO, my * MACRO, mz * MACRO);
  const box = {
    x0: mx * MACRO, y0: my * MACRO, z0: mz * MACRO,
    x1: (mx + 1) * MACRO, y1: (my + 1) * MACRO, z1: (mz + 1) * MACRO,
  };
  const owns = (x, y, z) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1 && z >= box.z0 && z < box.z1;

  genBarriers(F, B, box, owns);
  genBarrierRelief(F, B, box);
  genGalleries(F, B, box, owns);
  genShafts(F, B, box, owns);
  genStrata(F, B, box, owns);
  genFrames(F, B, box, owns);
  genStairways(F, B, box);
  genConduits(F, B, box);
  genAnomalies(F, B, box, mx, my, mz);
  genCascades(F, B, box, owns);
  genFloods(F, B, box);
  return B.finish();
}

/** Caixa com centro GLOBAL (cx,cy,cz) e tamanho (sx,sy,sz). */
function block(B, mat, cx, cy, cz, sx, sy, sz) {
  const L = B.L(cx, cy, cz);
  B.add(mat, place(new THREE.BoxGeometry(sx, sy, sz), { x: L.x, y: L.y, z: L.z }));
}

/** Uma passarela infinita atravessa esta placa de parede? (a parede abre um vão) */
function walkwayPierces(F, wallAxis, wallPos, tA0, tA1, y0, y1) {
  return F.walkwayCrossings(wallAxis, wallPos, tA0 - 8, tA1 + 8, y0 - 2, y1 - 8).length > 0;
}

// ─── camadas intransponíveis ────────────────────────────────────────────────

function genBarriers(F, B, box, owns) {
  const th = MEGA.barrierThick;
  const P = MEGA.passage;
  for (const b of F.barriersNear((box.y0 + box.y1) / 2)) {
    const yc = b.top - th / 2;
    if (yc < box.y0 || yc >= box.y1) continue;
    for (let k = Math.floor(box.z0 / T); k * T < box.z1; k++) {
      const zc = (k + 0.5) * T;
      let run = null;
      const flush = () => {
        if (!run) return;
        const len = (run.end - run.start + 1) * T;
        // laje cheia, ou mais fina onde uma trincheira de máquina a escava por baixo
        const t = th - run.depth;
        block(B, 'barrier', run.start * T + len / 2, b.top - t / 2, zc, len, t, T);
        run = null;
      };
      for (let i = Math.floor(box.x0 / T); i * T < box.x1; i++) {
        const xc = (i + 0.5) * T;
        const solid = F.barrierSolid(b, xc - 30, zc - 30) && F.barrierSolid(b, xc + 30, zc + 30) && F.barrierSolid(b, xc, zc);
        if (!solid) {
          flush();
          continue;
        }
        const depth = F.trenchAt(b, xc, zc);
        if (run && run.depth !== depth) flush();
        if (run) run.end = i;
        else run = { start: i, end: i, depth };
        // caixotões por baixo: vigas cruzadas que dão escala ao teto (no fundo da trincheira, se houver)
        const cy = b.bottom + depth - 5;
        block(B, 'barrier', xc, cy, zc - T / 2 + 3, T, 10, 6);
        block(B, 'barrier', xc - T / 2 + 3, cy, zc, 6, 10, T);
        if (depth) {
          // trilhos das máquinas colossais, presos ao teto da trincheira
          const lz = Math.round(zc / P) * P;
          const lx = Math.round(xc / P) * P;
          if (Math.abs(zc - lz) < T && F.ceilingLane(b.n, 'x', lz / P)) block(B, 'frame', xc, cy - 7, lz + Math.sign(zc - lz) * 45, T, 4, 5);
          if (Math.abs(xc - lx) < T && F.ceilingLane(b.n, 'z', lx / P)) block(B, 'frame', lx + Math.sign(xc - lx) * 45, cy - 7, zc, 5, 4, T);
          continue;
        }
        // luminárias penduradas do teto, raras e distantes umas das outras
        if (hash4(F.seed, i, b.n, k, 360) < 0.03) {
          block(B, 'frame', xc, b.bottom - 22, zc, 0.6, 24, 0.6);
          block(B, 'frame', xc, b.bottom - 34.5, zc, 8, 1.5, 3);
          B.light(xc, b.bottom - 37, zc, hash4(F.seed, i, b.n, k, 361) < 0.6 ? SODIUM : FLUORO, 1600, hash4(F.seed, i, b.n, k, 362) < 0.2 ? 'faulty' : 'steady');
        }
      }
      flush();
    }
    // passagens desta célula: torre de elevador colossal + luz caindo
    for (let pi = Math.floor(box.x0 / P); pi * P < box.x1; pi++) {
      for (let pk = Math.floor(box.z0 / P); pk * P < box.z1; pk++) {
        const p = F.passage(b.n, pi, pk);
        if (!p || !owns(p.x, yc, p.z)) continue;
        passageTower(F, B, b, p);
      }
    }
  }
}

// ─── relevo sobre as camadas (visível a quilômetros, como a laje) ───────────

function genBarrierRelief(F, B, box) {
  const C = RELIEF.cell;
  const th = MEGA.barrierThick;
  for (const b of F.barriersNear((box.y0 + box.y1) / 2)) {
    const yc = b.top - th / 2; // mesma posse da laje
    if (yc < box.y0 || yc >= box.y1) continue;
    const y = b.top;
    for (let ci = Math.floor(box.x0 / C); ci * C < box.x1; ci++) {
      for (let ck = Math.floor(box.z0 / C); ck * C < box.z1; ck++) {
        const p = F.barrierRelief(b, ci, ck);
        if (!p) continue;
        const w = p.x1 - p.x0;
        const d = p.z1 - p.z0;
        const cx = (p.x0 + p.x1) / 2;
        const cz = (p.z0 + p.z1) / 2;
        const r = rngAt(F.seed, ci, b.n, ck, 802);
        if (p.kind === 'plinth') {
          block(B, 'barrier', cx, y + p.h / 2, cz, w, p.h, d);
          if (p.step) block(B, 'barrier', cx + r.float(-0.1, 0.1) * w, y + p.h + p.step / 2, cz + r.float(-0.1, 0.1) * d, w * r.float(0.35, 0.6), p.step, d * r.float(0.35, 0.6));
        } else if (p.kind === 'ridge') {
          block(B, 'wall', cx, y + p.h / 2, cz, w, p.h, d);
          // dutos correndo por cima, com suportes
          const alongX = p.axis === 'x';
          const len = alongX ? w : d;
          const wid = alongX ? d : w;
          for (let q = 0; q < p.pipes; q++) {
            const off = ((q + 0.5) / p.pipes - 0.5) * wid * 0.7;
            const rad = r.float(1.2, 3);
            const a = new THREE.Vector3(alongX ? p.x0 : cx + off, y + p.h + rad + 1, alongX ? cz + off : p.z0);
            const e = new THREE.Vector3(alongX ? p.x1 : cx + off, a.y, alongX ? cz + off : p.z1);
            B.add('conduit', cylinderBetween(B.L(a.x, a.y, a.z), B.L(e.x, e.y, e.z), rad, rad, 8));
            for (let t = 8; t < len; t += 24) {
              const sx = alongX ? p.x0 + t : cx + off;
              const sz = alongX ? cz + off : p.z0 + t;
              block(B, 'frame', sx, y + p.h + 0.5, sz, 1.2, 1, 1.2);
            }
          }
        } else if (p.kind === 'hall') {
          block(B, 'floor', cx, y + p.h / 2, cz, w, p.h, d);
          // platibanda e casas de máquinas no telhado
          block(B, 'barrier', cx, y + p.h + 1, cz, w + 2, 2, d + 2);
          for (let q = r.int(0, 3); q > 0; q--) block(B, 'macro', cx + r.float(-0.35, 0.35) * w, y + p.h + 5, cz + r.float(-0.35, 0.35) * d, r.float(8, 18), 8, r.float(8, 18));
          if (r.chance(0.2)) B.light(cx + w / 2 + 3, y + 6, cz, FLUORO, r.float(200, 400), 'faulty');
        } else {
          block(B, 'barrier', cx, y + p.baseH / 2, cz, w, p.baseH, d);
          const L = B.L(cx, y + (p.baseH + p.h) / 2, cz);
          B.add('macro', place(new THREE.CylinderGeometry(p.stackR * 0.85, p.stackR, p.h - p.baseH, 10), { x: L.x, y: L.y, z: L.z }));
          block(B, 'frame', cx, y + p.h - 2, cz, p.stackR * 2.3, 1.2, p.stackR * 2.3);
          if (p.light) B.light(cx, y + p.h + 3, cz, SODIUM, r.float(300, 600), 'faulty');
        }
      }
    }
  }
}

function passageTower(F, B, b, p) {
  const y0 = Math.floor((b.bottom - 150) / 48) * 48 - 0.4; // plataforma de embarque de baixo
  const yTop = b.top + 70;
  const hw = 27; // meia largura do quadro (o carro tem 40 × 40)
  const V = (x, y, z) => B.L(p.x + x, y, p.z + z);
  // quatro pilares de canto e contraventamento em X
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    B.add('frame', place(new THREE.BoxGeometry(4, yTop - y0 + 30, 4), { ...toXYZ(V(sx * hw, (yTop + y0 - 30) / 2, sz * hw)) }));
  }
  for (let y = y0; y < yTop; y += 32) {
    for (const [ax, az, bx, bz] of [[-hw, -hw, hw, -hw], [hw, -hw, hw, hw], [hw, hw, -hw, hw], [-hw, hw, -hw, -hw]]) {
      B.add('frame', cylinderBetween(V(ax, y, az), V(bx, y + 32, bz), 0.7, 0.7, 4));
      B.add('frame', cylinderBetween(V(bx, y, bz), V(ax, y + 32, az), 0.7, 0.7, 4));
    }
  }
  // cabeçote com polias
  B.add('frame', place(new THREE.BoxGeometry(hw * 2 + 14, 8, 10), { ...toXYZ(V(0, yTop + 4, 0)) }));
  B.add('frame', place(new THREE.BoxGeometry(10, 8, hw * 2 + 14), { ...toXYZ(V(0, yTop + 4, 0)) }));
  for (const s of [-1, 1]) B.add('duct', place(new THREE.CylinderGeometry(5, 5, 3, 16), { ...toXYZ(V(s * 12, yTop + 11, 0)), rx: Math.PI / 2 }));
  // plataforma de embarque embaixo: um anel (o carro encaixa no vão do meio)
  for (const [cx, cz, sx, sz] of [[0, -34, 90, 24], [0, 34, 90, 24], [-34, 0, 24, 44], [34, 0, 24, 44]]) {
    B.add('floor', place(new THREE.BoxGeometry(sx, 3, sz), { ...toXYZ(V(cx, y0 - 1.5, cz)) }));
  }
  // em cima: quatro pontes ligando a borda da passagem ao carro
  const hole = p.size / 2;
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const len = hole - 20.5;
    const mid = 20.5 + len / 2;
    B.add('floor', place(new THREE.BoxGeometry(dx ? len : 10, 1.5, dz ? len : 10), { ...toXYZ(V(dx * mid, b.top - 0.75, dz * mid)) }));
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const len = 110;
    const c = V(dx * (35 + len / 2), y0 - 0.6, dz * (35 + len / 2));
    B.add('floor', place(new THREE.BoxGeometry(dx ? len : 10, 1.2, dz ? len : 10), { ...toXYZ(c) }));
  }
  B.light(p.x, yTop + 2, p.z, SODIUM, 2500, 'steady');
  B.light(p.x + 30, y0 + 8, p.z + 30, FLUORO, 400, 'faulty');
  // luz caindo pela passagem, do alto até a plataforma
  B.add('beam', beamGeometry(V(0, b.top + 200, 0), b.top + 200 - y0, 38, 44));
}

function toXYZ(v) {
  return { x: v.x, y: v.y, z: v.z };
}

// ─── galerias ───────────────────────────────────────────────────────────────

function genGalleries(F, B, box, owns) {
  const { galleryY, galleryH } = MEGA;
  const cands = [];
  for (let b = Math.floor((box.y0 - 1400) / galleryY); b <= Math.ceil((box.y1 + 600) / galleryY); b++) {
    for (let c = Math.floor((box.z0 - 1000) / galleryH); c <= Math.ceil((box.z1 + 1000) / galleryH); c++) {
      const g = F.gallery('x', b, c);
      if (g) cands.push(g);
    }
  }
  for (let a = Math.floor((box.x0 - galleryH / 2 - 1000) / galleryH); a <= Math.ceil((box.x1 - galleryH / 2 + 1000) / galleryH); a++) {
    for (let b = Math.floor((box.y0 - galleryY / 2 - 1400) / galleryY); b <= Math.ceil((box.y1 - galleryY / 2 + 600) / galleryY); b++) {
      const g = F.gallery('z', a, b);
      if (g) cands.push(g);
    }
  }
  for (const g of cands) buildGallery(F, B, box, owns, g);
}

function buildGallery(F, B, box, owns, g) {
  // coordenadas no referencial da galeria: t = ao longo do eixo, s = transversal
  const alongX = g.axis === 'x';
  const G = (t, y, s) => (alongX ? [t, y, s] : [s, y, t]);
  const t0 = alongX ? box.x0 : box.z0;
  const t1 = alongX ? box.x1 : box.z1;
  const sMin = g.c - g.w / 2 - W;
  const sMax = g.c + g.w / 2 + W;
  const yMin = g.floor - W;
  const yMax = g.top + (g.roof ? W : 0);
  const [bx0, by0, bz0] = G(t0, yMin, sMin);
  const [bx1, by1, bz1] = G(t1, yMax, sMax);
  // a galeria nem toca esta célula?
  if (Math.max(bx0, bx1) < box.x0 || Math.min(bx0, bx1) >= box.x1) return;
  if (by1 < box.y0 || by0 >= box.y1) return;
  if (Math.max(bz0, bz1) < box.z0 || Math.min(bz0, bz1) >= box.z1) return;

  const size = (t, y, s) => (alongX ? [t, y, s] : [s, y, t]);
  const nS = Math.max(1, Math.round((sMax - sMin) / T));
  const sStep = (sMax - sMin) / nS;
  const span = yMax - yMin;
  const nY = Math.max(1, Math.round(span / T));
  const yStep = span / nY;

  for (let i = Math.floor(t0 / T); i * T < t1; i++) {
    const tc = (i + 0.5) * T;
    // piso e teto
    for (let k = 0; k < nS; k++) {
      const sc = sMin + (k + 0.5) * sStep;
      for (const [yc, on] of [[g.floor - W / 2, true], [g.top + W / 2, g.roof]]) {
        if (!on) continue;
        const [x, y, z] = G(tc, yc, sc);
        if (!owns(x, y, z)) continue;
        if (F.insideVoid(x, y, z, g.id) || F.inBarrier(yc, W)) continue;
        // clarabóia: uma placa do teto falta e a luz desce até o piso
        if (yc > g.floor && k > 0 && k < nS - 1 && hash4(F.seed, i, k, Math.round(g.c), 305) < 0.025) {
          B.add('beam', beamGeometry(B.L(x, g.top + W + 40, z), g.h + W + 40, sStep * 0.42, sStep * 0.5));
          B.light(x, g.floor + 30, z, COLD, 900, 'steady');
          continue;
        }
        const [sx, sy, sz] = size(T, W, sStep);
        block(B, 'wall', x, y, z, sx, sy, sz);
      }
    }
    // paredes laterais
    for (const side of [-1, 1]) {
      const sc = g.c + side * (g.w / 2 + W / 2);
      for (let j = 0; j < nY; j++) {
        const yc = yMin + (j + 0.5) * yStep;
        const [x, y, z] = G(tc, yc, sc);
        if (!owns(x, y, z)) continue;
        if (F.insideVoid(x, y, z, g.id) || F.inBarrier(yc, yStep / 2)) continue;
        if (walkwayPierces(F, alongX ? 'z' : 'x', sc, tc - T / 2, tc + T / 2, yc - yStep / 2, yc + yStep / 2)) continue;
        if (hash4(F.seed, i, j, side, 300) < 0.012) continue; // vão aleatório
        const [sx, sy, sz] = size(T, yStep, W);
        block(B, 'wall', x, y, z, sx, sy, sz);
      }
    }
    // luminária colossal pendurada no eixo do teto, a cada ~480 m
    if (g.roof && i % 6 === 0) {
      const [lx, ly, lz] = G(tc, g.top - 30, g.c);
      if (owns(lx, ly, lz)) {
        const warm = hash4(F.seed, i, Math.round(g.c), 3, 304) < 0.4;
        B.light(lx, ly - 10, lz, warm ? SODIUM : FLUORO, 7000, hash4(F.seed, i, 5, 3, 305) < 0.25 ? 'faulty' : 'steady');
        const [sx, , sz] = size(40, 1, 12);
        block(B, 'wall', lx, ly, lz, sx, 6, sz); // a carcaça da luminária
        B.add('wall', cylinderBetween(B.L(lx, ly + 3, lz), B.L(lx, g.top, lz), 1.2, 1.2, 4)); // haste
      }
    }
    // luz de trabalho rara lá no alto: alguém ainda constrói aqui
    if (hash4(F.seed, i, Math.round(g.c), 7, 301) < 0.05) {
      const side = hash4(F.seed, i, 1, 7, 302) < 0.5 ? -1 : 1;
      const [x, y, z] = G(tc, g.floor + g.h * (0.3 + 0.6 * hash4(F.seed, i, 2, 7, 303)), g.c + side * (g.w / 2 - 3));
      if (owns(x, y, z)) B.light(x, y, z, WELD, 500, 'weld');
    }
  }
}

// ─── poços ──────────────────────────────────────────────────────────────────

function genShafts(F, B, box, owns) {
  const S = MEGA.shaft;
  for (let a = Math.floor((box.x0 - S / 2 - 900) / S); a <= Math.ceil((box.x1 - S / 2 + 900) / S); a++) {
    for (let c = Math.floor((box.z0 - S / 2 - 900) / S); c <= Math.ceil((box.z1 - S / 2 + 900) / S); c++) {
      const s = F.shaft(a, c);
      if (s) buildShaft(F, B, box, owns, s);
    }
  }
}

function buildShaft(F, B, box, owns, s) {
  const hx = s.wx / 2;
  const hz = s.wz / 2;
  if (s.x + hx + W < box.x0 || s.x - hx - W >= box.x1 || s.z + hz + W < box.z0 || s.z - hz - W >= box.z1) return;
  for (let j = Math.floor(box.y0 / T); j * T < box.y1; j++) {
    const yc = (j + 0.5) * T;
    if (F.inBarrier(yc, T / 2)) continue; // o poço termina na camada
    // uma coluna de luz caindo pelo meio do poço, de vez em quando
    if (j % 10 === 0 && hash4(F.seed, j, Math.round(s.x), Math.round(s.z), 313) < 0.2 && owns(s.x, yc, s.z)) {
      B.add('beam', beamGeometry(B.L(s.x, yc + 400, s.z), 800, Math.min(s.wx, s.wz) * 0.18, Math.min(s.wx, s.wz) * 0.26));
    }
    // faces em x = const (atravessam z inteiro, incluindo quinas)
    const nZ = Math.max(1, Math.round((s.wz + 2 * W) / T));
    const zStep = (s.wz + 2 * W) / nZ;
    for (const side of [-1, 1]) {
      const xc = s.x + side * (hx + W / 2);
      for (let k = 0; k < nZ; k++) {
        const zc = s.z - hz - W + (k + 0.5) * zStep;
        if (!owns(xc, yc, zc)) continue;
        if (F.insideVoid(xc, yc, zc, s.id)) continue;
        if (walkwayPierces(F, 'x', xc, zc - zStep / 2, zc + zStep / 2, yc - T / 2, yc + T / 2)) continue;
        block(B, 'wall', xc, yc, zc, W, T, zStep);
      }
    }
    // faces em z = const
    const nX = Math.max(1, Math.round(s.wx / T));
    const xStep = s.wx / nX;
    for (const side of [-1, 1]) {
      const zc = s.z + side * (hz + W / 2);
      for (let k = 0; k < nX; k++) {
        const xc = s.x - hx + (k + 0.5) * xStep;
        if (!owns(xc, yc, zc)) continue;
        if (F.insideVoid(xc, yc, zc, s.id)) continue;
        if (walkwayPierces(F, 'z', zc, xc - xStep / 2, xc + xStep / 2, yc - T / 2, yc + T / 2)) continue;
        block(B, 'wall', xc, yc, zc, xStep, T, W);
      }
    }
    // luzes de sinalização descendo pelo poço, a perder de vista
    if (hash4(F.seed, j, Math.round(s.x), Math.round(s.z), 310) < 0.18) {
      const lx = s.x + (hash4(F.seed, j, 1, 0, 311) - 0.5) * s.wx * 0.8;
      const lz = s.z - hz + 3;
      if (owns(lx, yc, lz)) B.light(lx, yc, lz, j % 3 === 0 ? FLUORO : SODIUM, 1200, hash4(F.seed, j, 2, 0, 312) < 0.3 ? 'faulty' : 'steady');
    }
  }
}

// ─── estratos ───────────────────────────────────────────────────────────────

function genStrata(F, B, box, owns) {
  for (const st of F.strataNear((box.y0 + box.y1) / 2)) {
    const yc = st.top - MEGA.strataThick / 2;
    if (yc < box.y0 || yc >= box.y1) continue;
    const th = MEGA.strataThick;
    // placas em fileiras ao longo de x (trechos contínuos viram uma caixa só)
    for (let k = Math.floor(box.z0 / T); k * T < box.z1; k++) {
      const zc = (k + 0.5) * T;
      let run = null;
      const flush = () => {
        if (!run) return;
        const len = (run.end - run.start + 1) * T;
        block(B, 'floor', run.start * T + len / 2, yc, zc, len, th, T);
        run = null;
      };
      for (let i = Math.floor(box.x0 / T); i * T < box.x1; i++) {
        const xc = (i + 0.5) * T;
        if (F.strataSolid(st, xc, zc)) {
          if (run) run.end = i;
          else run = { start: i, end: i };
        } else {
          flush();
          // a luz desce pelo buraco
          if (hash4(F.seed, i, st.s, k, 325) < 0.05 && !F.insideVoid(xc, st.top - 5, zc)) {
            B.add('beam', beamGeometry(B.L(xc, st.top + 60, zc), 520, 30, 40));
          }
        }
      }
      flush();
    }
    // floresta de colunas (sala hipostila sem paredes)
    const C = 240;
    for (let ci = Math.floor(box.x0 / C); ci * C < box.x1; ci++) {
      for (let ck = Math.floor(box.z0 / C); ck * C < box.z1; ck++) {
        const r = rngAt(F.seed, ci, st.s, ck, 320);
        if (!r.chance(st.colProb)) continue;
        const x = (ci + r.float(0.3, 0.7)) * C;
        const z = (ck + r.float(0.3, 0.7)) * C;
        if (!F.strataSolid(st, x, z) || F.insideVoid(x, st.top + 50, z)) continue;
        const side = r.float(20, 52);
        const h = r.float(260, 1100);
        block(B, 'wall', x, st.top + h / 2, z, side, h, side);
        block(B, 'wall', x, st.top + h + 6, z, side * 1.6, 12, side * 1.6); // capitel
        block(B, 'floor', x, st.top + 3, z, side * 1.4, 6, side * 1.4); // base
        if (r.chance(0.3)) B.light(x + side * 0.8, st.top + 30, z, SODIUM, 1500, 'steady');
      }
    }
  }
}

// ─── treliça espacial ───────────────────────────────────────────────────────

function genFrames(F, B, box, owns) {
  const S = MEGA.frame;
  // amostra rápida: se nada da célula está na zona, pula
  if (!F.frameCell(Math.round(box.x0 / MACRO), Math.round(box.y0 / MACRO), Math.round(box.z0 / MACRO))) return;

  const i0 = Math.ceil(box.x0 / S);
  const i1 = Math.ceil(box.x1 / S) - 1;
  const j0 = Math.ceil(box.y0 / S);
  const j1 = Math.ceil(box.y1 / S) - 1;
  const k0 = Math.ceil(box.z0 / S);
  const k1 = Math.ceil(box.z1 / S) - 1;
  const inZone = (x, y, z) => F.frameZone(x, y, z) && F.isOpenBiome(x, y, z) && !F.insideVoid(x, y, z) && !F.inBarrier(y, 20);
  // vigas não podem atravessar passarelas (o caminho continua livre)
  const clearOf = (x, y, z, hy, R) => !F.walkwayNear(x, y - hy - 6, y + hy + 3, z, R);

  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (let k = k0; k <= k1; k++) {
        const x = i * S;
        const y = j * S;
        const z = k * S;
        if (!inZone(x, y, z)) continue;
        let joints = 0;
        // vigas saindo deste nó nos sentidos +x, +y, +z
        const tx = F.frameBeam('x', j, k, i);
        if (tx && inZone(x + S / 2, y, z) && clearOf(x + S / 2, y, z, tx / 2, S / 2 + 8)) {
          block(B, 'frame', x + S / 2, y, z, S, tx, tx);
          joints++;
        }
        const ty = F.frameBeam('y', i, k, j);
        if (ty && inZone(x, y + S / 2, z) && clearOf(x, y + S / 2, z, S / 2, ty / 2 + 8)) {
          block(B, 'frame', x, y + S / 2, z, ty, S, ty);
          joints++;
        }
        const tz = F.frameBeam('z', i, j, k);
        if (tz && inZone(x, y, z + S / 2) && clearOf(x, y, z + S / 2, tz / 2, tz / 2 + 8)) {
          block(B, 'frame', x, y, z + S / 2, tz, tz, S);
          joints++;
        }
        if (joints && clearOf(x, y, z, 15, 20)) {
          const n = 16 + hash4(F.seed, i, j, k, 330) * 14;
          block(B, 'wall', x, y, z, n, n, n);
          if (hash4(F.seed, i, j, k, 331) < 0.06) B.light(x, y + n, z, hash4(F.seed, i, j, k, 332) < 0.5 ? SODIUM : COLD, 1200, 'faulty');
        }
      }
    }
  }
}

// ─── escadarias infinitas (a rampa estrutural; os degraus vêm no chunk) ─────

function genStairways(F, B, box) {
  for (const e of F.stairwaysIn(box.x0, box.y0, box.z0, box.x1, box.y1, box.z1)) {
    const alongX = e.axis === 'x';
    const ta = alongX ? box.x0 : box.z0;
    const tb = alongX ? box.x1 : box.z1;
    // intervalo de t em que a escada está dentro da faixa de altura da célula
    const k = e.dir * MEGA.stairSlope;
    let lo = (box.y0 - e.y0) / k;
    let hi = (box.y1 - e.y0) / k;
    if (lo > hi) [lo, hi] = [hi, lo];
    const s0 = Math.max(ta, lo);
    const s1 = Math.min(tb, hi);
    if (s1 - s0 < 1) continue;
    const lat = e.lat;
    if (lat < (alongX ? box.z0 : box.x0) || lat >= (alongX ? box.z1 : box.x1)) continue; // dono: célula que contém a linha
    const P = (t, dy = 0, dl = 0) => B.L(...(alongX ? [t, F.stairY(e, t) + dy, lat + dl] : [lat + dl, F.stairY(e, t) + dy, t]));
    // trechos fora das camadas (a escada é interrompida pelo concreto)
    const pieces = [];
    let pa = null;
    const step = 8;
    for (let t = s0; t <= s1; t += step) {
      const ok = !F.inBarrier(F.stairY(e, t), 6);
      if (ok && pa === null) pa = t;
      if ((!ok || t + step > s1) && pa !== null) {
        pieces.push([pa, ok ? s1 : t]);
        pa = null;
      }
    }
    for (const [a, b] of pieces) {
      if (b - a < 2) continue;
      // corpo da rampa (topo 0,3 m abaixo da linha dos degraus)
      B.add('stairway', slabBetween(P(a, -0.3), P(b, -0.3), e.width, 10));
      // parapeitos
      for (const sgn of [-1, 1]) {
        const dl = sgn * (e.width / 2 + 1);
        B.add('stairway', slabBetween(P(a, 3.2, dl), P(b, 3.2, dl), 2, 4.5));
      }
    }
    // pilares que descem para o nada
    for (let t = Math.ceil(s0 / 160) * 160; t < s1; t += 160) {
      const h = 120 + hash4(F.seed, Math.round(t), 0, Math.round(lat), 340) * 380;
      const top = P(t, -10);
      B.add('wall', place(new THREE.BoxGeometry(10, h, 10), { x: top.x, y: top.y - h / 2, z: top.z }));
    }
  }
}

// ─── condutos ───────────────────────────────────────────────────────────────

function genConduits(F, B, box) {
  const seen = new Set();
  const cands = [];
  for (const x of [box.x0, (box.x0 + box.x1) / 2, box.x1]) {
    for (const y of [box.y0, (box.y0 + box.y1) / 2, box.y1]) {
      for (const z of [box.z0, (box.z0 + box.z1) / 2, box.z1]) {
        for (const c of F.conduitsNear(x, y, z)) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            cands.push(c);
          }
        }
      }
    }
  }
  for (const c of cands) {
    const alongX = c.axis === 'x';
    // dono: a célula que contém a linha central (y, lateral)
    if (c.y < box.y0 || c.y >= box.y1) continue;
    const [l0, l1] = alongX ? [box.z0, box.z1] : [box.x0, box.x1];
    if (c.lat < l0 || c.lat >= l1) continue;
    const [t0, t1] = alongX ? [box.x0, box.x1] : [box.z0, box.z1];
    const G = (t, dy = 0, dl = 0) => (alongX ? [t, c.y + dy, c.lat + dl] : [c.lat + dl, c.y + dy, t]);
    const P = (t, dy, dl) => B.L(...G(t, dy, dl));
    const halfFloor = Math.sqrt(Math.max(0, c.R * c.R - (c.floor - c.y) ** 2)) - 0.5;
    for (let t = Math.floor(t0 / T) * T; t < t1; t += T) {
      const mid = G(t + T / 2);
      if (F.insideVoid(mid[0], mid[1], mid[2], c.id)) continue; // funde-se com galerias/poços
      if (F.inBarrier(c.y, c.R)) continue;
      // casca
      B.add('conduit', cylinderBetween(P(t), P(t + T), c.R, c.R, 28, { open: true, heightSegments: 4 }));
      // anel estrutural
      const ring = new THREE.TorusGeometry(c.R + 0.8, 2.2, 6, 32);
      if (alongX) ring.rotateY(Math.PI / 2);
      const q = P(t);
      ring.translate(q.x, q.y, q.z);
      B.add('frame', ring);
      // piso interno (andável, alinhado aos níveis da rede)
      const f = B.L(...G(t + T / 2, c.floor - c.y - 1.5));
      B.add('conduit', place(new THREE.BoxGeometry(alongX ? T + 0.05 : halfFloor * 2, 3, alongX ? halfFloor * 2 : T + 0.05), { x: f.x, y: f.y, z: f.z }));
      // tiras de luz a cada 160 m
      if (Math.round(t / T) % 2 === 0) {
        const [lx, ly, lz] = G(t + T / 2, c.R * 0.75);
        B.light(lx, ly, lz, hash4(F.seed, Math.round(t), 0, 0, 350) < 0.5 ? FLUORO : COLD, 1000, hash4(F.seed, Math.round(t), 1, 0, 351) < 0.2 ? 'faulty' : 'steady');
      }
    }
  }
}

// ─── anomalias (raras) ──────────────────────────────────────────────────────

function genAnomalies(F, B, box, mx, my, mz) {
  const r = rngAt(F.seed, mx, my, mz, 70);
  if (!r.chance(0.22)) return;
  const g = [box.x0 + r.float(200, MACRO - 200), box.y0 + r.float(200, MACRO - 200), box.z0 + r.float(200, MACRO - 200)];
  if (F.insideVoid(g[0], g[1], g[2]) || !F.isOpenBiome(g[0], g[1], g[2]) || F.touchesBarrier(g[1] - 1600, g[1] + 1600)) return;
  const kind = r.pick(['monolith', 'needle']);
  const ext = 1600;
  if (F.reservedHit(g[0] - ext, g[1] - ext, g[2] - ext, g[0] + ext, g[1] + ext, g[2] + ext)) return;
  ANOMALIES[kind](B, B.L(...g), r, g);
}

const ANOMALIES = {
  /** Monólito: laje de quilômetros, perfeitamente plana. */
  monolith(B, o, r, g) {
    const w = r.float(60, 170);
    const h = r.float(1200, 3000);
    const d = r.float(18, 40);
    B.add('macro', place(new THREE.BoxGeometry(w, h, d, 6, 50, 2), {
      x: o.x, y: o.y, z: o.z, rx: r.float(-0.2, 0.2), ry: r.float(0, Math.PI), rz: r.float(-0.2, 0.2),
    }));
  },

  /** Agulha: uma torre que atravessa a célula inteira. */
  needle(B, o, r, g) {
    const R = r.float(40, 90);
    const h = 3200;
    const a = o.clone().add(new THREE.Vector3(r.float(-80, 80), -h / 2, r.float(-80, 80)));
    const b = o.clone().add(new THREE.Vector3(r.float(-80, 80), h / 2, r.float(-80, 80)));
    B.add('macro', cylinderBetween(a, b, R * r.float(0.6, 1), R * r.float(0.2, 0.6), 4, { heightSegments: 60 }));
    for (let i = 0; i < 6; i++) {
      const p = a.clone().lerp(b, r.float(0.1, 0.9));
      const s = R * r.float(1.6, 2.6);
      B.add('wall', place(new THREE.BoxGeometry(s, r.float(8, 20), s), { x: p.x, y: p.y, z: p.z }));
    }
    B.light(g[0], g[1], g[2], SODIUM, r.float(500, 1000), 'faulty');
  },
};
