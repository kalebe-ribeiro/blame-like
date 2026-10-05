// ─────────────────────────────────────────────────────────────────────────────
//  "Vestimenta" das megaestruturas — o detalhe na escala do corpo humano,
//  gerado por chunk (só perto do observador).
//
//  galerias   contrafortes, sacadas contínuas ao longo das paredes (andáveis),
//             escadas entre sacadas, feixes de tubos, luminárias, prédios no piso
//  poços      sacadas em volta + escadaria em zigue-zague numa das faces:
//             dá para descer (ou subir) para sempre
//  estratos   blocos habitacionais, muretas, postes, cabos pendendo por baixo
//  escadarias os degraus propriamente ditos + luminárias nos parapeitos
//
//  Tudo contínuo entre chunks: cada elemento depende só de coordenadas globais.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { hash4, rngAt } from './hash.js';
import { place, cylinderBetween } from '../world/geometry.js';
import { plumbLine, cableMat } from '../world/cables.js';
import { SODIUM, FLUORO, COLD, WARN } from './colors.js';

const LEVEL = 48;
const STAIR_RUN = 70; // extensão horizontal de um lance de 48 m (≈ 34°)

export function genDressing(F, B, box) {
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  for (const g of F.galleriesNear(cx, cy, cz)) dressGallery(F, B, box, g);
  for (const s of F.shaftsNear(cx, cz)) dressShaft(F, B, box, s);
  for (const st of F.strataNear(cy)) dressStratum(F, B, box, st);
  for (const e of F.stairwaysIn(box.x0, box.y0 - 2, box.z0, box.x1, box.y1 + 2, box.z1)) dressStairway(F, B, box, e);
}

// ─── utilidades ─────────────────────────────────────────────────────────────

/** Caixa com centro GLOBAL. */
function blockG(B, mat, x, y, z, sx, sy, sz) {
  const L = B.L(x, y, z);
  B.add(mat, place(new THREE.BoxGeometry(sx, sy, sz), { x: L.x, y: L.y, z: L.z }));
}

/**
 * Lance de escada entre dois pontos GLOBAIS (a embaixo ou em cima, tanto faz),
 * degraus de ~0,3 m. Largura w, perpendicular ao sentido horizontal do lance.
 */
export function stairFlight(B, a, b, w, mat = 'bridge') {
  const dy = b.y - a.y;
  const n = Math.max(2, Math.ceil(Math.abs(dy) / 0.3));
  const flat = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
  const run = flat.length() / n;
  const dir = flat.normalize();
  const yaw = Math.atan2(dir.x, dir.z);
  for (let i = 0; i < n; i++) {
    const top = a.y + dy * (dy > 0 ? (i + 1) / n : i / n);
    const h = Math.abs(dy) / n + 0.6;
    const L = B.L(a.x + dir.x * (i + 0.5) * run, top - h / 2, a.z + dir.z * (i + 0.5) * run);
    B.add(mat, place(new THREE.BoxGeometry(w, h, run + 0.03), { x: L.x, y: L.y, z: L.z, ry: yaw }));
  }
}

/** Intervalo [lo, hi) ∩ [a, b) ou null. */
function clip(lo, hi, a, b) {
  const l = Math.max(lo, a);
  const h = Math.min(hi, b);
  return h > l ? [l, h] : null;
}

/**
 * Faixa horizontal ao longo de uma parede (sacada, tubo...). A parede é descrita
 * por: eixo do comprimento ('x'|'z'), posição da face interna `face`, sentido
 * para dentro `inward` (±1), e o intervalo [t0,t1) a cobrir.
 */
function wallFrame(axis, face, inward) {
  // devolve G(t, y, d): ponto global a distância d da face, para dentro
  return (t, y, d) => (axis === 'x' ? new THREE.Vector3(t, y, face + inward * d) : new THREE.Vector3(face + inward * d, y, t));
}

// ─── galerias ───────────────────────────────────────────────────────────────

function dressGallery(F, B, box, g) {
  const along = g.axis; // 'x' ou 'z'
  const [t0, t1] = along === 'x' ? [box.x0, box.x1] : [box.z0, box.z1];
  const [s0, s1] = along === 'x' ? [box.z0, box.z1] : [box.x0, box.x1];
  const yr = clip(g.floor, g.top, box.y0, box.y1);

  // ── paredes internas ──
  for (const side of [-1, 1]) {
    const face = g.c + side * (g.w / 2);
    if (face < s0 - 20 || face >= s1 + 20 || !yr) continue;
    const inward = -side;
    const G = wallFrame(along, face, inward);
    const ownsFace = face >= s0 && face < s1;
    const gid = Math.round(g.c) * 7 + side;
    // passarelas que cruzam esta parede neste trecho: deixar o caminho livre
    const crossings = F.walkwayCrossings(along === 'x' ? 'z' : 'x', face, t0 - 60, t1 + 60, g.floor - 10, g.top + 10);
    const blocked = (t, y, rt, ry) => crossings.some((c) => Math.abs(c.t - t) < c.width / 2 + rt && y > c.y - ry && y < c.y + 6 + ry);

    if (ownsFace) {
      // contrafortes a cada 40 m (a parede lida como arquitetura, não como plano)
      for (let n = Math.ceil(t0 / 40); n * 40 < t1; n++) {
        const t = n * 40;
        const mid = G(t, (yr[0] + yr[1]) / 2, 2.5);
        if (F.insideVoid(mid.x, mid.y, mid.z, g.id)) continue;
        if (crossings.some((c) => Math.abs(c.t - t) < c.width / 2 + 4)) continue;
        const h = yr[1] - yr[0];
        const sx = along === 'x' ? 3 : 5;
        const sz = along === 'x' ? 5 : 3;
        blockG(B, 'dress', mid.x, mid.y, mid.z, sx, h, sz);
      }
      // feixes de tubos em algumas alturas
      for (let k = Math.ceil(yr[0] / 24); k * 24 < yr[1]; k++) {
        if (hash4(F.seed, k, gid, 0, 400) > 0.12) continue;
        const r = rngAt(F.seed, k, gid, 0, 401);
        const n = r.int(1, 4);
        for (let q = 0; q < n; q++) {
          const rad = r.float(0.6, 2.4);
          const d = 7 + q * (rad * 2 + 1);
          const y = k * 24 + r.float(-3, 3);
          if (crossings.some((cr) => y > cr.y - 3 && y < cr.y + 8)) continue;
          B.add('duct', cylinderBetween(B.L(...G(t0, y, d).toArray()), B.L(...G(t1, y, d).toArray()), rad, rad, 8, { open: true, heightSegments: 8 }));
        }
      }
    }

    // sacadas contínuas em níveis sorteados (andáveis)
    for (let k = Math.ceil((g.floor + LEVEL) / LEVEL); k * LEVEL < g.top - 20; k++) {
      const y = k * LEVEL - 0.4;
      if (y < box.y0 - 2 || y >= box.y1) continue;
      if (hash4(F.seed, k, gid, 1, 410) > 0.3 || F.inBarrier(y, 4)) continue;
      const depth = 8 + hash4(F.seed, k, gid, 2, 411) * 8;
      if (!ownsFace) continue; // o chunk que contém a face gera a sacada inteira
      for (let n = Math.floor(t0 / 24); n * 24 < t1; n++) {
        const ta = n * 24;
        if (F.noise3(ta * 0.004, k * 0.7, gid * 0.13) < -0.45) continue; // trechos desabados
        const c = G(ta + 12, y - 0.6, depth / 2);
        if (F.insideVoid(...G(ta + 12, y, -5).toArray(), g.id)) continue; // a parede some aqui
        if (!F.galleryWallAt(g, side, ta + 2, y + 2) || !F.galleryWallAt(g, side, ta + 22, y + 2)) continue; // sem placa de parede atrás: nada para segurar a sacada
        if (blocked(ta + 12, y, 14, 5)) continue; // uma passarela atravessa aqui
        const sx = along === 'x' ? 24 : depth;
        const sz = along === 'x' ? depth : 24;
        blockG(B, 'bridge', c.x, c.y, c.z, sx, 1.2, sz);
        // mureta na borda
        const e = G(ta + 12, y + 0.5, depth - 0.3);
        blockG(B, 'dress', e.x, e.y, e.z, along === 'x' ? 24 : 0.5, 1.0, along === 'x' ? 0.5 : 24);
        // luminária de parede
        if (hash4(F.seed, n, k, gid, 412) < 0.12) {
          const l = G(ta + 12, y + 6, 1);
          B.light(l.x, l.y, l.z, hash4(F.seed, n, k, gid, 413) < 0.45 ? SODIUM : FLUORO, 140, hash4(F.seed, n, k, gid, 414) < 0.3 ? 'faulty' : 'steady');
          const f = G(ta + 12, y + 6, 0.5);
          blockG(B, 'duct', f.x, f.y, f.z, along === 'x' ? 2 : 1, 0.8, along === 'x' ? 1 : 2);
        }
        // escada descendo até a sacada (ou piso) de baixo
        if (hash4(F.seed, n, k, gid, 415) < 0.08) {
          const below = k - 1;
          const belowY = below * LEVEL - 0.4;
          const hasBelow = belowY <= g.floor + 0.5 || hash4(F.seed, below, gid, 1, 410) <= 0.3;
          if (hasBelow) {
            const a = G(ta + 24, y, depth / 2);
            const b = G(ta + 24 + STAIR_RUN, Math.max(belowY, g.floor), depth / 2);
            stairFlight(B, a, b, Math.min(depth - 1, 6));
          }
        }
      }
    }
  }

  // ── o piso: prédios baixos, entulho, postes ──
  if (g.floor >= box.y0 && g.floor < box.y1) {
    const C = 48;
    for (let i = Math.floor(box.x0 / C); i * C < box.x1; i++) {
      for (let k = Math.floor(box.z0 / C); k * C < box.z1; k++) {
        const x = (i + 0.5) * C;
        const z = (k + 0.5) * C;
        const s = along === 'x' ? z : x;
        if (Math.abs(s - g.c) > g.w / 2 - 20) continue;
        if (F.insideVoid(x, g.floor - 9, z, g.id)) continue; // o piso some aqui (outro volume)
        const r = rngAt(F.seed, i, Math.round(g.floor), k, 420);
        const roll = r.next();
        if (roll < 0.1) habitation(B, r, x, g.floor, z, false);
        else if (roll < 0.16) blockG(B, 'dress', x, g.floor + 1.5, z, r.float(4, 14), 3, r.float(4, 14)); // entulho
        else if (roll < 0.2) lampPost(B, x, g.floor, z, r);
      }
    }
  }

  // ── cabos pendendo do teto ──
  if (g.roof && g.top >= box.y0 && g.top < box.y1) {
    const C = 64;
    for (let i = Math.floor(box.x0 / C); i * C < box.x1; i++) {
      for (let k = Math.floor(box.z0 / C); k * C < box.z1; k++) {
        const r = rngAt(F.seed, i, Math.round(g.top), k, 430);
        if (!r.chance(0.08)) continue;
        const x = (i + r.next()) * C;
        const z = (k + r.next()) * C;
        const s = along === 'x' ? z : x;
        if (Math.abs(s - g.c) > g.w / 2 - 5) continue;
        const len = r.float(60, g.h * 0.7);
        const rad = r.float(0.1, 0.35);
        B.add(cableMat(rad), plumbLine(B.L(x, g.top, z), len, { rng: r, radius: rad }));
      }
    }
  }
}

// ─── poços ──────────────────────────────────────────────────────────────────

function dressShaft(F, B, box, s) {
  const hx = s.wx / 2;
  const hz = s.wz / 2;
  if (s.x + hx < box.x0 - 20 || s.x - hx >= box.x1 + 20 || s.z + hz < box.z0 - 20 || s.z - hz >= box.z1 + 20) return;
  // 4 faces internas: [eixo do comprimento, posição da face, sentido para dentro, meio-comprimento, centro]
  const faces = [
    ['x', s.z - hz, 1, hx, s.x],
    ['x', s.z + hz, -1, hx, s.x],
    ['z', s.x - hx, 1, hz, s.z],
    ['z', s.x + hx, -1, hz, s.z],
  ];
  const sid = Math.round(s.x) * 3 + Math.round(s.z);
  faces.forEach(([axis, face, inward, half, center], fi) => {
    const G = wallFrame(axis, face, inward);
    const [t0, t1] = axis === 'x' ? [box.x0, box.x1] : [box.z0, box.z1];
    const tr = clip(center - half + 1, center + half - 1, t0, t1);
    if (!tr) return;
    const isStairFace = fi === s.stairFace;
    const depth = isStairFace ? 9 : 6;
    // dono: o chunk que contém a faixa (face + meia profundidade)
    const own = G(0, 0, depth / 2);
    const ownLat = axis === 'x' ? own.z : own.x;
    const [l0, l1] = axis === 'x' ? [box.z0, box.z1] : [box.x0, box.x1];
    if (ownLat < l0 || ownLat >= l1) return;

    for (let k = Math.ceil(box.y0 / LEVEL); k * LEVEL < box.y1; k++) {
      const y = k * LEVEL - 0.4;
      if (F.inBarrier(y, LEVEL + 4)) continue;
      if (!isStairFace && hash4(F.seed, k, sid, fi, 440) > 0.35) continue;
      if (F.insideVoid(...G((tr[0] + tr[1]) / 2, y + 5, -5).toArray(), s.id)) continue;
      // onde uma passarela fura a parede do poço, a placa inteira (80 m) some: sem sacada nessa altura
      if (F.walkwayCrossings(axis === 'x' ? 'z' : 'x', face, tr[0] - 90, tr[1] + 90, y - 90, y + 90).length) continue;
      // sacada ao longo da face (no trecho deste chunk)
      const mid = (tr[0] + tr[1]) / 2;
      const c = G(mid, y - 0.6, depth / 2);
      const len = tr[1] - tr[0];
      blockG(B, 'bridge', c.x, c.y, c.z, axis === 'x' ? len : depth, 1.2, axis === 'x' ? depth : len);
      const e = G(mid, y + 0.5, depth - 0.3);
      blockG(B, 'dress', e.x, e.y, e.z, axis === 'x' ? len : 0.5, 1.0, axis === 'x' ? 0.5 : len);

      if (isStairFace) {
        // lance em zigue-zague: sobe da sacada k até k+1, alternando o sentido
        const dirSign = k % 2 === 0 ? 1 : -1;
        const start = dirSign > 0 ? center - half + 12 : center + half - 12;
        const end = start + dirSign * Math.min(STAIR_RUN, half * 2 - 30);
        const lo = Math.min(start, end);
        const hi = Math.max(start, end);
        // o lance pertence ao chunk que contém o seu ponto médio
        const tm = (lo + hi) / 2;
        if (tm >= t0 && tm < t1) {
          stairFlight(B, G(start, y, depth - 3.5), G(end, y + LEVEL, depth - 3.5), 5);
        }
      }
      if (hash4(F.seed, k, sid, fi, 441) < 0.1) {
        const l = G(mid, y + 5, 1.2);
        const w = G(mid, y + 5.4, 0);
        B.lamp(l.x, l.y, l.z, hash4(F.seed, k, sid, fi, 442) < 0.15 ? WARN : SODIUM, 160, 'faulty', { to: [w.x, w.y, w.z] });
      }
    }
  });
}

// ─── estratos ───────────────────────────────────────────────────────────────

function dressStratum(F, B, box, st) {
  const C = 48;
  // superfície de cima
  if (st.top >= box.y0 && st.top < box.y1) {
    for (let i = Math.floor(box.x0 / C); i * C < box.x1; i++) {
      for (let k = Math.floor(box.z0 / C); k * C < box.z1; k++) {
        const r = rngAt(F.seed, i, st.s, k, 450);
        const x = (i + r.float(0.3, 0.7)) * C;
        const z = (k + r.float(0.3, 0.7)) * C;
        if (!F.strataSolid(st, x - 20, z - 20) || !F.strataSolid(st, x + 20, z + 20)) continue;
        const roll = r.next();
        if (roll < 0.09) habitation(B, r, x, st.top, z, true);
        else if (roll < 0.15) {
          // mureta longa
          const len = r.float(20, 46);
          const alongX = r.chance(0.5);
          blockG(B, 'dress', x, st.top + 1, z, alongX ? len : 1, 2, alongX ? 1 : len);
        } else if (roll < 0.19) lampPost(B, x, st.top, z, r);
      }
    }
  }
  // por baixo: cabos e tubos pendurados
  if (st.bottom >= box.y0 && st.bottom < box.y1) {
    for (let i = Math.floor(box.x0 / C); i * C < box.x1; i++) {
      for (let k = Math.floor(box.z0 / C); k * C < box.z1; k++) {
        const r = rngAt(F.seed, i, st.s, k, 451);
        if (!r.chance(0.06)) continue;
        const x = (i + r.next()) * C;
        const z = (k + r.next()) * C;
        if (!F.strataSolid(st, x, z)) continue;
        const len = r.float(40, 220);
        const rad = r.float(0.1, 0.4);
        B.add(cableMat(rad), plumbLine(B.L(x, st.bottom, z), len, { rng: r, radius: rad }));
      }
    }
  }
}

// ─── escadarias infinitas: os degraus ───────────────────────────────────────

function dressStairway(F, B, box, e) {
  const alongX = e.axis === 'x';
  const lat = e.lat;
  const [l0, l1] = alongX ? [box.z0, box.z1] : [box.x0, box.x1];
  if (lat < l0 || lat >= l1) return; // dono: chunk que contém a linha central
  const [t0, t1] = alongX ? [box.x0, box.x1] : [box.z0, box.z1];
  const run = 0.8;
  for (let n = Math.floor(t0 / run); n * run < t1; n++) {
    const ta = n * run;
    const ya = F.stairY(e, ta);
    const yb = F.stairY(e, ta + run);
    const top = Math.max(ya, yb);
    if (top < box.y0 || top >= box.y1) continue;
    if (F.inBarrier(top, 6)) continue;
    const L = B.L(...(alongX ? [ta + run / 2, top - 0.35, lat] : [lat, top - 0.35, ta + run / 2]));
    B.add('bridge', place(new THREE.BoxGeometry(alongX ? run + 0.02 : e.width, 0.7, alongX ? e.width : run + 0.02), { x: L.x, y: L.y, z: L.z }));
    // luminárias nos parapeitos, a cada 96 m
    if (n % 120 === 0) {
      const side = hash4(F.seed, n, Math.round(lat), 0, 460) < 0.5 ? -1 : 1;
      const p = alongX ? [ta, top + 5, lat + side * (e.width / 2 + 1)] : [lat + side * (e.width / 2 + 1), top + 5, ta];
      const foot = alongX ? [ta, top, lat + side * (e.width / 2 - 0.4)] : [lat + side * (e.width / 2 - 0.4), top, ta];
      B.lamp(p[0], p[1], p[2], hash4(F.seed, n, 1, 0, 461) < 0.8 ? SODIUM : COLD, 90, 'steady', { to: foot });
    }
  }
}

// ─── peças reutilizáveis ────────────────────────────────────────────────────

/** Bloco habitacional brutalista: volume principal + recuos + balanços + caixa d'água. */
export function habitation(B, r, x, y, z, tall) {
  const w = r.float(10, 30);
  const d = r.float(10, 30);
  const h = r.float(8, tall ? 70 : 40);
  blockG(B, 'block', x, y + h / 2, z, w, h, d);
  let top = y + h;
  // recuos empilhados
  for (let q = r.int(0, 2); q > 0; q--) {
    const w2 = w * r.float(0.5, 0.85);
    const d2 = d * r.float(0.5, 0.85);
    const h2 = r.float(6, 24);
    blockG(B, 'block', x + r.float(-2, 2), top + h2 / 2, z + r.float(-2, 2), w2, h2, d2);
    top += h2;
  }
  // balanço (cantilever)
  if (r.chance(0.5)) {
    const ch = r.float(4, 8);
    const cy = y + r.float(0.3, 0.8) * h;
    blockG(B, 'block', x + w / 2 + 4, cy, z, 10, ch, d * 0.6);
  }
  // caixa d'água / casa de máquinas no topo
  if (r.chance(0.6)) blockG(B, 'dress', x + r.float(-w / 4, w / 4), top + 2.5, z + r.float(-d / 4, d / 4), 4, 5, 4);
  if (r.chance(0.35)) B.lamp(x, top + 3, z, r.chance(0.8) ? SODIUM : FLUORO, 40, 'faulty', { to: [x + 0.6, top, z] });
}

function lampPost(B, x, y, z, r) {
  const h = r.float(6, 12);
  B.add('duct', cylinderBetween(B.L(x, y, z), B.L(x, y + h, z), 0.25, 0.18, 6));
  B.socket(x, y + 1.1, z + 0.3);
  blockG(B, 'duct', x + 0.8, y + h, z, 2, 0.4, 0.8);
  B.lamp(x + 1.2, y + h - 0.6, z, r.chance(0.8) ? SODIUM : FLUORO, r.float(30, 60), r.chance(0.3) ? 'faulty' : 'steady');
}

