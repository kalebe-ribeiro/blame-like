// ─────────────────────────────────────────────────────────────────────────────
//  Setores inundados (geometria): a lâmina d'água sobre as placas alagadas e
//  os diques que a contêm — nas bordas da região e em volta dos buracos e
//  passagens. A regra do que alaga está no Field (floodedTile).
//
//  A água é uma caixa fina e não colide (anda-se pelo fundo, com água pela
//  canela); os diques colidem e têm altura de um pulo.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { MEGA, FLOOD } from './field.js';
import { place } from '../world/geometry.js';

const T = MEGA.tile;

export function genFloods(F, B, box) {
  const y0 = box.y0;
  const y1 = box.y1;
  for (const surf of F.floodSurfaces((y0 + y1) / 2)) {
    if (surf.top < y0 || surf.top >= y1) continue; // cada superfície pertence à célula que contém seu topo
    const lvl = surf.top + FLOOD.depth;
    const damMat = surf.kind === 'b' ? 'barrier' : 'floor';
    const flooded = (i, k) => F.floodedTile(surf, i, k);
    for (let k = Math.floor(box.z0 / T); k * T < box.z1; k++) {
      let run = null;
      const flush = () => {
        if (!run) return;
        const len = (run.end - run.start + 1) * T;
        const c = B.L(run.start * T + len / 2, lvl - 0.03, (k + 0.5) * T);
        B.add('flood', place(new THREE.BoxGeometry(len, 0.06, T, Math.ceil(len / 40), 1, 2), { x: c.x, y: c.y, z: c.z }));
        run = null;
      };
      for (let i = Math.floor(box.x0 / T); i * T < box.x1; i++) {
        if (!flooded(i, k)) {
          flush();
          continue;
        }
        if (run) run.end = i;
        else run = { start: i, end: i };
        // diques nas bordas que dão para placa seca (ou para o vazio)
        const h = FLOOD.dam;
        const edges = [
          [!flooded(i - 1, k), i * T, (k + 0.5) * T, FLOOD.damW, T],
          [!flooded(i + 1, k), (i + 1) * T, (k + 0.5) * T, FLOOD.damW, T],
          [!flooded(i, k - 1), (i + 0.5) * T, k * T, T, FLOOD.damW],
          [!flooded(i, k + 1), (i + 0.5) * T, (k + 1) * T, T, FLOOD.damW],
        ];
        for (const [open, x, z, sx, sz] of /** @type {[boolean, number, number, number, number][]} */ (edges)) {
          if (!open) continue;
          const c = B.L(x, surf.top + h / 2, z);
          B.add(damMat, place(new THREE.BoxGeometry(sx, h, sz), { x: c.x, y: c.y, z: c.z }));
        }
      }
      flush();
    }
  }
}
