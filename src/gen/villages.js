// ─────────────────────────────────────────────────────────────────────────────
//  As vilas (fases 5 e 7) — puro: a disposição de uma vila (estrutura única
//  'village'), a mesma para a geometria (gen/macrogen.js) e para os moradores
//  (world/npcs.js).
//
//  Um galpão fechado no alto de uma camada, porta num dos lados; dentro,
//  barracos de chapa (alguns de dois andares), um tanque d'água e — nas vilas
//  HABITADAS (metade) — um braseiro aceso no meio do corredor.
//  Coordenadas do quadro da única: a aponta para a porta, c é o outro eixo.
// ─────────────────────────────────────────────────────────────────────────────
import { hash4, rngAt } from './hash.js';

const T = 3; // espessura das paredes do galpão (a mesma de buildUnique)

/** A vila tem gente? (metade delas — fase 7) */
export function villageInhabited(F, u) {
  return u.kind === 'village' && hash4(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1701) < 0.5;
}

/** O quadro da única: P(a, c) → [x, z] GLOBAL, e as meias medidas. */
export function villageFrame(u) {
  const d = u.door;
  const ax = d === 0 ? [1, 0] : d === 1 ? [-1, 0] : d === 2 ? [0, 1] : [0, -1];
  const cx = [-ax[1], ax[0]];
  const ha = d < 2 ? u.hx : u.hz;
  const hc = d < 2 ? u.hz : u.hx;
  const P = (a, c) => [u.x + ax[0] * a + cx[0] * c, u.z + ax[1] * a + cx[1] * c];
  return { ha, hc, P, ax, off: u.doorOff * hc };
}

/**
 * A disposição (memorizada): { shacks: [{a,c,w,d,h,upper,cloth}], tank, brazier, spots, off, inhabited, y0 }
 * spots: pontos livres do chão (quadro a,c) onde um morador pode ficar de pé.
 */
export function villageLayout(F, u) {
  return F._memo(`VL${u.id}`, () => {
    const r = rngAt(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1702);
    const { ha, hc, off } = villageFrame(u);
    const shacks = [];
    for (let q = 0; q < 40 && shacks.length < 16; q++) {
      const w = r.float(1.1, 1.8);
      const d = r.float(1.1, 1.8);
      const h = r.float(2.4, 3.2);
      const sa = r.float(-ha + T + w + 0.5, ha - T - w - 2);
      const sc = r.float(-hc + T + d + 0.5, hc - T - d - 0.5);
      const upper = r.chance(0.35) && h + 2.7 < u.h - 1;
      const cloth = !upper && r.chance(0.4);
      const ua = r.float(-0.2, 0.2);
      const ca = r.float(-0.3, 0.3);
      if (Math.abs(sc - off) < d + 2.4) continue; // o corredor da porta (e o console)
      if (shacks.some((s) => Math.abs(s.a - sa) < s.w + w + 0.7 && Math.abs(s.c - sc) < s.d + d + 0.7)) continue;
      shacks.push({ a: sa, c: sc, w, d, h, upper, cloth, ua, ca });
    }
    const tc = off + (off > 0 ? -1 : 1) * r.float(6, 10);
    const tank = shacks.some((s) => Math.abs(s.a) < s.w + 2.5 && Math.abs(s.c - tc) < s.d + 2.5) ? null : { a: 0, c: tc, r: 1.7 };
    const inhabited = villageInhabited(F, u);
    // o braseiro: no corredor, entre a porta e o fundo
    const brazier = inhabited ? { a: -ha * 0.25, c: off + (off > 0 ? -1.6 : 1.6) } : null;
    const console = { a: ha - 6, c: off + 3 };
    const blocked = (a, c, m) =>
      shacks.some((s) => Math.abs(s.a - a) < s.w + m && Math.abs(s.c - c) < s.d + m) ||
      (tank && Math.hypot(tank.a - a, tank.c - c) < tank.r + m) ||
      (brazier && Math.hypot(brazier.a - a, brazier.c - c) < 0.8 + m) ||
      Math.hypot(console.a - a, console.c - c) < 1.5 + m;
    const spots = [];
    for (let a = -ha + T + 2; a <= ha - T - 2; a += 3) {
      for (let c = -hc + T + 2; c <= hc - T - 2; c += 3) if (!blocked(a, c, 0.9)) spots.push({ a, c });
    }
    return { shacks, tank, brazier, console, spots, off, inhabited, y0: u.y + 1.2 };
  });
}
