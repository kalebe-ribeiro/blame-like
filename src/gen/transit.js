// ─────────────────────────────────────────────────────────────────────────────
//  Transportadores (geometria fixa): o trilho ao lado de algumas passarelas
//  infinitas e as estações a cada TRANSIT.station metros. Os vagões se movem e
//  são desenhados na thread principal (world/transitCars.js).
//
//  Seção transversal (a partir do centro da passarela, do lado do trilho):
//    passarela ── hw ── plataforma da estação ── vagão (carW) sobre o trilho
//  O piso do vagão fica no nível do tabuleiro da passarela (y), então se entra
//  andando: passarela → plataforma → vagão.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { WALK, TRANSIT } from './field.js';
import { place, cylinderBetween } from '../world/geometry.js';
import { FLUORO } from './colors.js';

const S = TRANSIT.station;

/** Posição (ao longo da linha) da estação de índice s. */
export const stationT = (s) => s * S + S / 2;

/** Há uma estação cuja plataforma toca o trecho [t0, t1]? */
export function stationNear(t0, t1) {
  const s = Math.round(((t0 + t1) / 2 - S / 2) / S);
  const ts = stationT(s);
  return ts > t0 - TRANSIT.carLen / 2 - 3 && ts < t1 + TRANSIT.carLen / 2 + 3;
}

export function genTransit(F, B, box) {
  const { spacing, ySpacing } = WALK;
  // linhas ao longo de Z: passarela em x = a·spacing, y = b·ySpacing
  for (let a = Math.floor((box.x0 - 40) / spacing); a <= Math.ceil((box.x1 + 40) / spacing); a++) {
    for (let b = Math.ceil(box.y0 / ySpacing); b * ySpacing < box.y1; b++) {
      const w = F.walkZ(a, b);
      if (!w?.track) continue;
      const lat = a * spacing + w.track.off;
      if (lat < box.x0 || lat >= box.x1) continue; // o trilho pertence ao chunk que o contém
      buildLine(F, B, 'z', a * spacing, b * ySpacing, box.z0, box.z1, w, a * 7919 + b * 104729);
    }
  }
  // linhas ao longo de X: passarela em z = c·spacing + meio, y = b·ySpacing + meio
  for (let b = Math.ceil((box.y0 - ySpacing / 2) / ySpacing); b * ySpacing + ySpacing / 2 < box.y1; b++) {
    for (let c = Math.floor((box.z0 - 40 - spacing / 2) / spacing); c <= Math.ceil((box.z1 + 40 - spacing / 2) / spacing); c++) {
      const w = F.walkX(b, c);
      if (!w?.track) continue;
      const u = c * spacing + spacing / 2;
      const lat = u + w.track.off;
      if (lat < box.z0 || lat >= box.z1) continue;
      buildLine(F, B, 'x', u, b * ySpacing + ySpacing / 2, box.x0, box.x1, w, b * 15485863 + c * 7919 + 17);
    }
  }
}

function buildLine(F, B, axis, u, y, t0, t1, w, salt) {
  const side = w.track.side;
  const hw = w.width / 2;
  // ponto GLOBAL: t ao longo da linha, du lateral a partir do CENTRO DA PASSARELA
  const G = (t, dy, du) => (axis === 'z' ? B.L(u + du, y + dy, t) : B.L(t, y + dy, u + du));
  const off = w.track.off;
  const len = t1 - t0;
  const mid = (t0 + t1) / 2;
  const sized = (along, across, h) => (axis === 'z' ? [across, h, along] : [along, h, across]);
  const box = (mat, t, dy, du, along, across, h) => {
    const c = G(t, dy, du);
    const [sx, sy, sz] = sized(along, across, h);
    B.add(mat, place(new THREE.BoxGeometry(sx, sy, sz), { x: c.x, y: c.y, z: c.z }));
  };

  // ── o trilho: viga-caixão contínua + chapa de rolamento ──
  box('duct', mid, -1.5, off, len + 0.05, 2.2, 1.2);
  if (B.lod) return;
  box('rib', mid, -0.84, off, len + 0.05, 0.9, 0.12);

  // ── mãos-francesas até a borda da passarela (onde ela existe) ──
  for (let t = Math.ceil(t0 / 24) * 24; t < t1; t += 24) {
    if (F.walkGap(salt, t, w.main, y)) continue;
    B.add('rib', cylinderBetween(G(t, -1.9, off - side * 1.1), G(t, -1.2, side * (hw - 0.4)), 0.28, 0.28, 5));
    B.add('rib', cylinderBetween(G(t, -2.1, off), G(t, -2.6, side * 0.6), 0.22, 0.22, 5));
  }

  // ── estações ──
  for (let s = Math.ceil((t0 - S / 2) / S); stationT(s) < t1; s++) {
    const ts = stationT(s);
    if (ts < t0) continue;
    const L = TRANSIT.carLen + 4;
    const inner = hw - 0.3; // por baixo do corrimão (que ali não existe)
    const outer = Math.abs(off) - TRANSIT.carW / 2 - 0.15; // até a borda do vagão
    const pw = outer - inner;
    const pc = side * (inner + pw / 2);
    // plataforma
    box('plaza', ts, -0.4, pc, L, pw, 0.8);
    // abrigo: quatro postes e uma laje (só sobre a plataforma — o vagão passa ao lado)
    for (const dt of [-L / 2 + 0.6, L / 2 - 0.6]) {
      for (const d of [inner + 0.4, outer - 0.4]) box('rib', ts + dt, 2.1, side * d, 0.3, 0.3, 4.2);
    }
    box('slab', ts, 4.35, pc, L, pw + 0.6, 0.35);
    // placa numa ponta e a luz
    box('sign', ts + L / 2 - 1.2, 3.2, pc, 0.15, pw * 0.7, 0.9);
    // pendurada da laje do abrigo
    const lp = G(ts, 3.6, pc);
    B.lamp(lp.x + B.x0, lp.y + B.y0, lp.z + B.z0, FLUORO, 45, (s & 3) === 0 ? 'faulty' : 'steady', { to: [lp.x + B.x0, lp.y + B.y0 + 0.6, lp.z + B.z0] });
  }
}
