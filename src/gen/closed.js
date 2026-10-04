// ─────────────────────────────────────────────────────────────────────────────
//  Regiões FECHADAS (roda no worker, chamado por chunkgen.js).
//
//  COLMEIA — um labirinto 3D de salas de 48 m. Cada face entre duas células é
//  gerada uma única vez (pela célula de índice menor):
//    sala | vazio   → fachada grossa (às vezes com um janelão para o vazio)
//    sala | sala    → divisória com porta (ou aberta, ou cega); laje entre andares
//  Algumas salas têm escada em dois lances subindo por um vão no teto; outras,
//  colunas, uma lâmpada, entulho.
//
//  MAÇIÇO — blocos do tamanho de montanhas, um por célula de 192 m, separados
//  por vielas estreitas (cânions). As passarelas infinitas atravessam os blocos
//  por túneis. Sacadas nas fachadas e pontes cruzando as vielas.
//
//  B.lod > 0 (chunks distantes): só as cascas externas, sem detalhes.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { HIVE } from './field.js';
import { hash4 } from './hash.js';
import { place, cylinderBetween, slabBetween } from '../world/geometry.js';
import { beamGeometry } from './beams.js';
import { rngAt } from './hash.js';
import { stairFlight } from './dressing.js';
import { SODIUM, FLUORO, WARN } from './colors.js';

/** Caixa por limites GLOBAIS. */
function boxG(B, mat, x0, y0, z0, x1, y1, z1) {
  if (x1 - x0 < 0.01 || y1 - y0 < 0.01 || z1 - z0 < 0.01) return;
  const L = B.L((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  B.add(mat, place(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), { x: L.x, y: L.y, z: L.z }));
}

/**
 * Painel de parede vertical com (no máximo) um vão retangular.
 * normal 'x': plano x = pos, extensão horizontal em z · normal 'z': plano z = pos, extensão em x.
 * hole = { a0, a1, y0, y1 } nas mesmas coordenadas (ou null).
 */
function wallPanel(B, mat, normal, pos, t, a0, a1, y0, y1, hole) {
  const put = (b0, b1, c0, c1) => {
    if (normal === 'x') boxG(B, mat, pos - t / 2, c0, b0, pos + t / 2, c1, b1);
    else boxG(B, mat, b0, c0, pos - t / 2, b1, c1, pos + t / 2);
  };
  if (!hole) return put(a0, a1, y0, y1);
  const h = { a0: Math.max(a0, hole.a0), a1: Math.min(a1, hole.a1), y0: Math.max(y0, hole.y0), y1: Math.min(y1, hole.y1) };
  put(a0, h.a0, y0, y1);
  put(h.a1, a1, y0, y1);
  put(h.a0, h.a1, y0, h.y0);
  put(h.a0, h.a1, h.y1, y1);
}

// ─── colmeia ────────────────────────────────────────────────────────────────

/** A sala (i,j,k) tem escada subindo para a sala de cima? */
function hiveStairs(F, i, j, k) {
  return hash4(F.seed, i, j, k, 501) < 0.22 && F.hiveRoom(i, j, k) && F.hiveRoom(i, j + 1, k);
}

export function genHive(F, B, box) {
  // teste rápido: se nenhum canto do chunk está na colmeia, nada a fazer
  let any = false;
  for (let q = 0; q < 9 && !any; q++) {
    const x = q === 8 ? (box.x0 + box.x1) / 2 : q & 1 ? box.x1 : box.x0;
    const y = q === 8 ? (box.y0 + box.y1) / 2 : q & 2 ? box.y1 : box.y0;
    const z = q === 8 ? (box.z0 + box.z1) / 2 : q & 4 ? box.z1 : box.z0;
    any = F.biome(x, y, z) === 'colmeia';
  }
  if (!any) return;

  const C = HIVE;
  const lod = B.lod || 0;
  const n = Math.round((box.x1 - box.x0) / C);
  const i0 = Math.round(box.x0 / C);
  const j0 = Math.round(box.y0 / C);
  const k0 = Math.round(box.z0 / C);
  for (let i = i0; i < i0 + n; i++) {
    for (let j = j0; j < j0 + n; j++) {
      for (let k = k0; k < k0 + n; k++) {
        const A = F.hiveRoom(i, j, k);
        const x0 = i * C;
        const y0 = j * C;
        const z0 = k * C;
        const floorY = y0 - 0.3; // topo do piso desta célula
        // três faces positivas (+x, +y, +z) pertencem a esta célula
        for (const d of [0, 1, 2]) {
          const Bn = F.hiveRoom(i + +(d === 0), j + +(d === 1), k + +(d === 2));
          if (!A && !Bn) continue;
          const exterior = A !== Bn;
          if (lod && !exterior) continue;
          const h = hash4(F.seed, i * 3 + d, j, k, 502);
          if (d === 1) {
            // laje horizontal em y = (j+1)·C
            const top = y0 + C - 0.3;
            if (!exterior && hiveStairs(F, i, j, k) && !lod) {
              // vão da escada: x [x0+2, x0+20], z [z0+10, z0+18]
              boxG(B, 'hive', x0, top - 2, z0, x0 + 2, top, z0 + C);
              boxG(B, 'hive', x0 + 20, top - 2, z0, x0 + C, top, z0 + C);
              boxG(B, 'hive', x0 + 2, top - 2, z0, x0 + 20, top, z0 + 10);
              boxG(B, 'hive', x0 + 2, top - 2, z0 + 18, x0 + 20, top, z0 + C);
            } else {
              boxG(B, 'hive', x0, top - (exterior ? 3 : 2), z0, x0 + C, top, z0 + C);
            }
            continue;
          }
          // parede vertical
          const normal = d === 0 ? 'x' : 'z';
          const pos = d === 0 ? x0 + C : z0 + C;
          const a0 = d === 0 ? z0 : x0;
          const a1 = a0 + C;
          const wy0 = floorY;
          const wy1 = y0 + C - 2.3;
          let hole = null;
          if (!lod) {
            if (exterior) {
              if (h < 0.35) hole = { a0: a0 + 12, a1: a1 - 12, y0: floorY + 14, y1: floorY + 32 }; // janelão
            } else if (h < 0.7) {
              const c = a0 + C / 2 + (hash4(F.seed, i, j, k * 3 + d, 503) - 0.5) * 20;
              hole = { a0: c - 3, a1: c + 3, y0: floorY - 1, y1: floorY + 8 }; // porta
            } else if (h < 0.85) {
              continue; // sem parede: salas fundidas
            }
            // passarelas infinitas atravessam a colmeia por um vão
            const cr = F.walkwayCrossings(normal === 'x' ? 'x' : 'z', pos, a0, a1, wy0 - 2, wy1);
            if (cr.length) hole = { a0: cr[0].t - cr[0].width / 2 - 3, a1: cr[0].t + cr[0].width / 2 + 3, y0: cr[0].y - 2, y1: cr[0].y + 10 };
          }
          wallPanel(B, 'hive', normal, pos, exterior ? 3 : 1.6, a0, a1, wy0, wy1, hole);
        }
        if (A && !lod) furnishRoom(F, B, i, j, k, x0, y0, z0, floorY);
      }
    }
  }
}

function furnishRoom(F, B, i, j, k, x0, y0, z0, floorY) {
  const C = HIVE;
  const stairs = hiveStairs(F, i, j, k);
  if (stairs) {
    // dois lances com patamar: sobe 24 m indo em +x, mais 24 m voltando
    stairFlight(B, new THREE.Vector3(x0 + 4, floorY, z0 + 6), new THREE.Vector3(x0 + 40, floorY + 24, z0 + 6), 6, 'hive');
    boxG(B, 'hive', x0 + 40, floorY + 23, z0 + 3, x0 + 46, floorY + 24, z0 + 17);
    stairFlight(B, new THREE.Vector3(x0 + 40, floorY + 24, z0 + 14), new THREE.Vector3(x0 + 4, floorY + 48, z0 + 14), 6, 'hive');
  } else if (hash4(F.seed, i, j, k, 504) < 0.3) {
    // colunas
    for (const [u, v] of [[0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
      boxG(B, 'hive', x0 + u * C - 1.5, floorY, z0 + v * C - 1.5, x0 + u * C + 1.5, y0 + C - 2.3, z0 + v * C + 1.5);
    }
  }
  const h = hash4(F.seed, i, j, k, 505);
  if (h < 0.3) {
    const lx = x0 + C / 2;
    const lz = z0 + C / 2 + 6;
    boxG(B, 'duct', lx - 3, y0 + C - 3.3, lz - 0.4, lx + 3, y0 + C - 2.3, lz + 0.4);
    B.lamp(lx, y0 + C - 5, lz, h < 0.2 ? FLUORO : h < 0.28 ? SODIUM : WARN, 150, h < 0.12 ? 'faulty' : 'steady', { to: [lx, y0 + C - 3.3, lz] });
  }
  if (h > 0.8) {
    // entulho: blocos caídos
    const n = 1 + Math.floor((h - 0.8) * 20);
    for (let q = 0; q < n; q++) {
      const s = 1 + hash4(F.seed, i, j, k * 7 + q, 506) * 4;
      const x = x0 + 8 + hash4(F.seed, i, j, k * 7 + q, 507) * (C - 16);
      const z = z0 + 20 + hash4(F.seed, i, j, k * 7 + q, 508) * (C - 28);
      boxG(B, 'dress', x, floorY, z, x + s, floorY + s * 0.7, z + s * 1.3);
    }
  }
}

// ─── maciço ─────────────────────────────────────────────────────────────────

/** Subtrai um túnel (infinito ao longo de `axis`) de uma lista de caixas. */
function subtractTunnel(boxes, axis, u0, u1, v0, v1) {
  // eixo 'z': u = x, v = y · eixo 'x': u = z, v = y
  const out = [];
  for (const b of boxes) {
    const bu0 = axis === 'z' ? b.x0 : b.z0;
    const bu1 = axis === 'z' ? b.x1 : b.z1;
    if (u1 <= bu0 || u0 >= bu1 || v1 <= b.y0 || v0 >= b.y1) {
      out.push(b);
      continue;
    }
    const mk = (a0, a1, y0, y1) => (axis === 'z' ? { ...b, x0: a0, x1: a1, y0, y1 } : { ...b, z0: a0, z1: a1, y0, y1 });
    if (u0 > bu0) out.push(mk(bu0, u0, b.y0, b.y1));
    if (u1 < bu1) out.push(mk(u1, bu1, b.y0, b.y1));
    const m0 = Math.max(u0, bu0);
    const m1 = Math.min(u1, bu1);
    if (v0 > b.y0) out.push(mk(m0, m1, b.y0, v0));
    if (v1 < b.y1) out.push(mk(m0, m1, v1, b.y1));
  }
  return out;
}

export function genMassif(F, B, box) {
  const S = 192;
  const i = Math.round(box.x0 / S);
  const j = Math.round(box.y0 / S);
  const k = Math.round(box.z0 / S);
  const blk = F.massifBlock(i, j, k);
  if (!blk) return;
  const lod = B.lod || 0;

  // corpo, com túneis por onde as passarelas atravessam
  let parts = [{ ...blk }];
  if (!lod) {
    for (const c of F.walkwayCrossings('z', blk.z0, blk.x0, blk.x1, blk.y0, blk.y1)) {
      parts = subtractTunnel(parts, 'z', c.t - c.width / 2 - 4, c.t + c.width / 2 + 4, c.y - 1.5, c.y + 11);
      B.lamp(c.t, c.y + 9, (blk.z0 + blk.z1) / 2, SODIUM, 60, 'faulty', { to: [c.t, c.y + 11, (blk.z0 + blk.z1) / 2] });
    }
    for (const c of F.walkwayCrossings('x', blk.x0, blk.z0, blk.z1, blk.y0, blk.y1)) {
      parts = subtractTunnel(parts, 'x', c.t - c.width / 2 - 4, c.t + c.width / 2 + 4, c.y - 1.5, c.y + 11);
      B.lamp((blk.x0 + blk.x1) / 2, c.y + 9, c.t, SODIUM, 60, 'faulty', { to: [(blk.x0 + blk.x1) / 2, c.y + 11, c.t] });
    }
  }
  const hollow = lod ? null : F.massifHollow(i, j, k);
  if (hollow) buildHollow(F, B, hollow, i, j, k);
  else for (const p of parts) boxG(B, 'massif', p.x0, p.y0, p.z0, p.x1, p.y1, p.z1);
  if (lod) return;

  // terraço de recuo: se o bloco de cima é mais estreito, o topo deste vira chão
  // (a própria caixa já tem a face de cima — aqui só um parapeito na borda)
  const above = F.massifBlock(i, j + 1, k);
  if (!above || above.inset > blk.inset) {
    const y = blk.y1;
    boxG(B, 'dress', blk.x0, y, blk.z0, blk.x1, y + 1.2, blk.z0 + 0.6);
    boxG(B, 'dress', blk.x0, y, blk.z1 - 0.6, blk.x1, y + 1.2, blk.z1);
  }

  // sacadas nas fachadas (níveis de 48 m)
  for (let lv = Math.ceil(blk.y0 / 48); lv * 48 < blk.y1; lv++) {
    const y = lv * 48 - 0.4;
    for (const side of [0, 1, 2, 3]) {
      if (hash4(F.seed, i * 4 + side, lv, k, 514) > 0.1) continue;
      const dp = 4;
      if (side === 0) boxG(B, 'bridge', blk.x0 - dp, y - 1, blk.z0, blk.x0, y, blk.z1);
      if (side === 1) boxG(B, 'bridge', blk.x1, y - 1, blk.z0, blk.x1 + dp, y, blk.z1);
      if (side === 2) boxG(B, 'bridge', blk.x0, y - 1, blk.z0 - dp, blk.x1, y, blk.z0);
      if (side === 3) boxG(B, 'bridge', blk.x0, y - 1, blk.z1, blk.x1, y, blk.z1 + dp);
      if (hash4(F.seed, i * 4 + side, lv, k, 515) < 0.4) {
        const lx = side === 0 ? blk.x0 - 1 : side === 1 ? blk.x1 + 1 : (blk.x0 + blk.x1) / 2;
        const lz = side === 2 ? blk.z0 - 1 : side === 3 ? blk.z1 + 1 : (blk.z0 + blk.z1) / 2;
        const wx = side === 0 ? blk.x0 : side === 1 ? blk.x1 : lx;
        const wz = side === 2 ? blk.z0 : side === 3 ? blk.z1 : lz;
        B.lamp(lx, y + 4, lz, hash4(F.seed, i, lv, k * 4 + side, 516) < 0.6 ? SODIUM : FLUORO, 70, 'steady', { to: [wx, y + 4.4, wz] });
      }
    }
  }

  // elevador de carga: trilhos na fachada e patamares nas paradas
  const lift = F.massifLift(i, j, k);
  if (lift) {
    const alongZ = lift.side < 2; // fachada em x = const → o carro corre ao longo de z
    const face = lift.side === 0 ? blk.x0 : lift.side === 1 ? blk.x1 : lift.side === 2 ? blk.z0 : blk.z1;
    const out = lift.side % 2 === 0 ? -1 : 1;
    const t = alongZ ? lift.z : lift.x;
    const yA = lift.y0 - 2;
    const yB = lift.y1 + 8;
    for (const s of [-1, 1]) {
      // trilhos (entre a fachada e o carro)
      if (alongZ) boxG(B, 'rib', face + out * 0.3 - 0.3, yA, t + s * 3.4 - 0.2, face + out * 0.3 + 0.3, yB, t + s * 3.4 + 0.2);
      else boxG(B, 'rib', t + s * 3.4 - 0.2, yA, face + out * 0.3 - 0.3, t + s * 3.4 + 0.2, yB, face + out * 0.3 + 0.3);
    }
    for (const yl of [lift.y0, lift.y1]) {
      // patamares dos dois lados do carro, colados na fachada
      for (const s of [-1, 1]) {
        const a0 = t + s * 3.2;
        const a1 = t + s * 12;
        const [lo, hi] = a0 < a1 ? [a0, a1] : [a1, a0];
        const d0 = Math.min(face, face + out * 8);
        const d1 = Math.max(face, face + out * 8);
        if (alongZ) boxG(B, 'grate', d0, yl - 0.4, lo, d1, yl, hi);
        else boxG(B, 'grate', lo, yl - 0.4, d0, hi, yl, d1);
      }
      const dc = t + 7.5;
      if (alongZ) boxG(B, 'door', face + out * 0.02 - 0.05, yl, dc - 0.7, face + out * 0.02 + 0.05, yl + 2.4, dc + 0.7);
      else boxG(B, 'door', dc - 0.7, yl, face + out * 0.02 - 0.05, dc + 0.7, yl + 2.4, face + out * 0.02 + 0.05);
      B.lamp(alongZ ? face + out * 1.2 : dc, yl + 3.2, alongZ ? dc : face + out * 1.2, SODIUM, 14, 'steady', { to: [alongZ ? face : dc, yl + 3.6, alongZ ? dc : face], size: 0.7 });
    }
  }

  // pontes cruzando as vielas (+x e +z pertencem a este bloco)
  for (const dir of ['x', 'z']) {
    const nb = dir === 'x' ? F.massifBlock(i + 1, j, k) : F.massifBlock(i, j, k + 1);
    if (!nb) continue;
    for (let lv = Math.ceil(blk.y0 / 48); lv * 48 < blk.y1; lv++) {
      const r = hash4(F.seed, i, lv, k, dir === 'x' ? 517 : 518);
      if (r > 0.14) continue;
      const y = lv * 48 - 0.4;
      if (dir === 'x') {
        const z0 = Math.max(blk.z0, nb.z0) + 4;
        const z1 = Math.min(blk.z1, nb.z1) - 10;
        if (z1 <= z0) continue;
        const z = z0 + hash4(F.seed, i, lv, k, 519) * (z1 - z0);
        boxG(B, 'bridge', blk.x1 - 1, y - 0.8, z, nb.x0 + 1, y, z + 6);
        boxG(B, 'rib', blk.x1, y + 1, z, nb.x0, y + 1.2, z + 0.2);
        boxG(B, 'rib', blk.x1, y + 1, z + 5.8, nb.x0, y + 1.2, z + 6);
      } else {
        const x0 = Math.max(blk.x0, nb.x0) + 4;
        const x1 = Math.min(blk.x1, nb.x1) - 10;
        if (x1 <= x0) continue;
        const x = x0 + hash4(F.seed, i, lv, k, 519) * (x1 - x0);
        boxG(B, 'bridge', x, y - 0.8, blk.z1 - 1, x + 6, y, nb.z0 + 1);
        boxG(B, 'rib', x, y + 1, blk.z1, x + 0.2, y + 1.2, nb.z0);
        boxG(B, 'rib', x + 5.8, y + 1, blk.z1, x + 6, y + 1.2, nb.z0);
      }
    }
  }
}

// ─── interiores do maciço (blocos ocos) ─────────────────────────────────────

export const HW = 6; // espessura da casca
export const RING = 12; // largura dos mezaninos

/** Casca, mezaninos, portas e o conteúdo de um bloco oco. */
function buildHollow(F, B, h, i, j, k) {
  const { x0, x1, y0, y1, z0, z1, levels, type } = h;
  const r = rngAt(F.seed, i, j, k, 532);
  const floorTop = y0 + 6;
  const ix0 = x0 + HW;
  const ix1 = x1 - HW;
  const iz0 = z0 + HW;
  const iz1 = z1 - HW;
  const xc = (x0 + x1) / 2;
  const zc = (z0 + z1) / 2;
  // piso e teto maciços
  boxG(B, 'massif', x0, y0, z0, x1, floorTop, z1);
  boxG(B, 'massif', x0, y1 - 6, z0, x1, y1, z1);
  // paredes em faixas de 48 m, com uma porta no meio de cada face em cada nível
  const doorSides = type === 'silo' ? [0] : [0, 1, 2, 3];
  const bands = [floorTop, ...levels, y1 - 6];
  for (let b = 0; b < bands.length - 1; b++) {
    const ya = bands[b];
    const yb = bands[b + 1];
    const isLevel = b > 0;
    for (const side of [0, 1, 2, 3]) {
      const normal = side < 2 ? 'x' : 'z';
      const pos = side === 0 ? x0 + HW / 2 : side === 1 ? x1 - HW / 2 : side === 2 ? z0 + HW / 2 : z1 - HW / 2;
      const [a0, a1] = side < 2 ? [z0, z1] : [x0, x1];
      const c = side < 2 ? zc : xc;
      const hole = isLevel && doorSides.includes(side) ? { a0: c - 3.5, a1: c + 3.5, y0: ya, y1: ya + 5.5 } : null;
      wallPanel(B, 'massif', normal, pos, HW, a0, a1, ya, yb, hole);
    }
  }
  // luz de serviço junto às portas
  for (const y of levels) B.lamp(ix0 + 1.5, y + 4.5, zc + 6, FLUORO, 30, 'faulty', { to: [ix0, y + 4.9, zc + 6], size: 0.8 });

  if (type === 'silo') return buildSilo(B, r, { ix0, ix1, iz0, iz1, floorTop, levels, y1, zc, xc });

  // mezaninos anelares (piso de chapa, guarda-corpo na borda de dentro)
  for (const y of levels) {
    boxG(B, 'bridge', ix0, y - 1.2, iz0, ix1, y, iz0 + RING);
    boxG(B, 'bridge', ix0, y - 1.2, iz1 - RING, ix1, y, iz1);
    boxG(B, 'bridge', ix0, y - 1.2, iz0 + RING, ix0 + RING, y, iz1 - RING);
    boxG(B, 'bridge', ix1 - RING, y - 1.2, iz0 + RING, ix1, y, iz1 - RING);
    boxG(B, 'rib', ix0 + RING, y + 1, iz0 + RING - 0.15, ix1 - RING, y + 1.12, iz0 + RING);
    boxG(B, 'rib', ix0 + RING, y + 1, iz1 - RING, ix1 - RING, y + 1.12, iz1 - RING + 0.15);
    boxG(B, 'rib', ix0 + RING - 0.15, y + 1, iz0 + RING, ix0 + RING, y + 1.12, iz1 - RING);
    boxG(B, 'rib', ix1 - RING, y + 1, iz0 + RING, ix1 - RING + 0.15, y + 1.12, iz1 - RING);
    if (r.chance(0.7)) B.lamp(xc, y + 5, iz0 + RING / 2, SODIUM, 50, r.chance(0.4) ? 'faulty' : 'steady', { to: [xc + 0.6, y, iz0 + RING / 2] });
  }

  if (type === 'maquinas') {
    // passarelas cruzando o átrio (de leste a oeste) nos dois primeiros níveis
    for (const y of levels.slice(0, 2)) {
      boxG(B, 'grate', ix0 + RING - 0.5, y - 0.6, zc - 2.5, ix1 - RING + 0.5, y, zc + 2.5);
      boxG(B, 'rib', ix0 + RING, y + 1, zc - 2.5, ix1 - RING, y + 1.1, zc - 2.4);
      boxG(B, 'rib', ix0 + RING, y + 1, zc + 2.4, ix1 - RING, y + 1.1, zc + 2.5);
    }
    // turbinas colossais deitadas no fundo, sobre berços, com dutos subindo
    const rad = r.float(13, 19);
    const len = ix1 - ix0 - 34;
    for (let z = iz0 + rad + 8; z <= iz1 - rad - 8; z += rad * 2 + 14) {
      const cy = floorTop + rad + 5;
      const A = B.L(ix0 + 17, cy, z);
      const Bp = B.L(ix0 + 17 + len, cy, z);
      B.add('machine', cylinderBetween(A, Bp, rad, rad, 20, { heightSegments: 3 }));
      // anéis de reforço e a tampa cônica da ponta
      for (let t = 0.1; t < 1; t += 0.2) {
        const q = A.clone().lerp(Bp, t);
        B.add('rib', cylinderBetween(q.clone().add(new THREE.Vector3(-0.8, 0, 0)), q.clone().add(new THREE.Vector3(0.8, 0, 0)), rad + 1, rad + 1, 20));
      }
      B.add('duct', cylinderBetween(Bp, Bp.clone().add(new THREE.Vector3(10, 0, 0)), rad * 0.7, 3, 16));
      for (const t of [0.25, 0.75]) boxG(B, 'massif', ix0 + 17 + len * t - 5, floorTop, z - rad * 0.8, ix0 + 17 + len * t + 5, cy - rad * 0.6, z + rad * 0.8);
      for (const t of [0.3, 0.7]) {
        const top = A.clone().lerp(Bp, t).add(new THREE.Vector3(0, rad - 1, 0));
        B.add('duct', cylinderBetween(top, B.L(ix0 + 17 + len * t, y1 - 6, z), 2.6, 2.6, 10));
      }
      B.lamp(ix0 + 12, floorTop + 4, z, WARN, 22, 'faulty', { to: [ix0 + 12.6, floorTop, z] });
    }
  } else {
    // depósito: pilhas de blocos em estantes, com corredores
    const cell = 15;
    for (let x = ix0 + RING + 4; x + cell <= ix1 - RING - 4; x += cell) {
      const col = Math.round((x - ix0) / cell);
      if (col % 4 === 0) continue; // corredor
      for (let z = iz0 + RING + 4; z + cell <= iz1 - RING - 4; z += cell) {
        const row = Math.round((z - iz0) / cell);
        if (row % 5 === 0) continue;
        const n = r.int(0, 7);
        for (let q = 0; q < n; q++) boxG(B, 'block', x + 1.5, floorTop + q * 8.2, z + 1.5, x + cell - 1.5, floorTop + q * 8.2 + 8, z + cell - 1.5);
        if (n > 0) for (const [px, pz] of [[x + 0.6, z + 0.6], [x + cell - 0.6, z + cell - 0.6]]) boxG(B, 'rib', px - 0.25, floorTop, pz - 0.25, px + 0.25, floorTop + n * 8.2 + 2, pz + 0.25);
      }
    }
    // luminárias penduradas do teto em cabos longos
    for (let x = ix0 + 30; x < ix1 - 20; x += 45) B.lamp(x, floorTop + 40, zc, SODIUM, 80, r.chance(0.3) ? 'faulty' : 'steady', { to: [x, y1 - 6, zc], size: 1.4 });
  }
}

/** Silo: rampa em espiral quadrada colada às paredes (48 m por volta, passa pela porta de cada nível). */
function buildSilo(B, r, { ix0, ix1, iz0, iz1, floorTop, levels, y1, zc, xc }) {
  const W = 8;
  const d = W / 2;
  // o caminho: começa na porta do oeste (x = ix0), segue para +z, dá a volta
  const P = [
    [ix0 + d, zc], [ix0 + d, iz1 - d], [ix1 - d, iz1 - d], [ix1 - d, iz0 + d], [ix0 + d, iz0 + d], [ix0 + d, zc],
  ];
  const segLen = [];
  let perim = 0;
  for (let q = 0; q < P.length - 1; q++) {
    const L = Math.hypot(P[q + 1][0] - P[q][0], P[q + 1][1] - P[q][1]);
    segLen.push(L);
    perim += L;
  }
  const top = levels[levels.length - 1];
  const at = (s) => {
    // ponto do caminho no comprimento s (dá voltas)
    let u = s % perim;
    for (let q = 0; q < segLen.length; q++) {
      if (u <= segLen[q]) {
        const t = u / segLen[q];
        return [P[q][0] + (P[q + 1][0] - P[q][0]) * t, P[q][1] + (P[q + 1][1] - P[q][1]) * t];
      }
      u -= segLen[q];
    }
    return P[0];
  };
  const drop = top - floorTop;
  const total = (drop / 48) * perim;
  const step = 6;
  for (let s = 0; s < total; s += step) {
    const s2 = Math.min(total, s + step);
    const [ax, az] = at(s);
    const [bx, bz] = at(s2);
    if (Math.hypot(bx - ax, bz - az) < 0.5) continue; // quina
    const ya = top - (48 * s) / perim;
    const yb = top - (48 * s2) / perim;
    B.add('bridge', slabBetween(B.L(ax, ya, az), B.L(bx, yb, bz), W, 0.8));
  }
  // patamares planos em cada porta (a rampa passa por ali exatamente no nível)
  for (const y of levels) boxG(B, 'bridge', ix0, y - 0.8, zc - 6, ix0 + W, y, zc + 6);
  // o fundo: sedimento amontoado, correntes penduradas, luz vazando do teto
  const R = Math.min(ix1 - ix0, iz1 - iz0) / 2 - W - 6;
  B.add('slab', place(new THREE.ConeGeometry(R, r.float(18, 34), 12, 2), { ...B.L(xc, floorTop + 12, zc) }));
  for (let q = 0; q < 7; q++) {
    const a = r.float(0, Math.PI * 2);
    const rr = r.float(8, R * 0.8);
    const cx = xc + Math.cos(a) * rr;
    const cz = zc + Math.sin(a) * rr;
    B.add('cable', cylinderBetween(B.L(cx, y1 - 6, cz), B.L(cx, y1 - 6 - r.float(40, 130), cz), 0.25, 0.25, 4));
  }
  B.add('beam', beamGeometry(B.L(xc, y1 - 6, zc), y1 - 6 - floorTop, 10, 16));
  B.lamp(xc, floorTop + 30, zc, SODIUM, 120, 'steady', { to: [xc, y1 - 6, zc], size: 1.6 }); // pendurada do teto, no eixo do silo
}
