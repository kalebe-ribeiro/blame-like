// ─────────────────────────────────────────────────────────────────────────────
//  Até onde vai o feixe do emissor (a arma de Killy): ele acaba ao entrar numa
//  camada intransponível (onde há placa de laje montada — Field.barrierTileSolid —, fora das
//  trincheiras das máquinas colossais)
//  ou numa estrutura única (de fora, na caixa dela; de dentro, na face de dentro
//  das paredes). Puro: só o Field.
// ─────────────────────────────────────────────────────────────────────────────

import { MEGA } from './field.js';

const TILE = MEGA.tile; // a placa da laje (gen/macrogen.js: a trincheira é medida no meio de cada placa)
const UNIQUE_MARGIN = 1; // m em volta de uma estrutura única (as paredes dela)
const UNIQUE_WALL = 3.2; // a espessura das paredes de uma única (gen/macrogen.js shell, T = 3) e uma folga

/**
 * O trecho do feixe de a (GLOBAL) na direção dir, até `range` — cortado onde ele
 * encontra uma camada intransponível ou uma estrutura única. Puro (só o Field).
 * Devolve { t (m percorridos), stop: null | 'layer' | 'unique' }.
 */
export function beamReach(F, a, dir, range) {
  let t = range;
  let stop = null;
  // as camadas: o concreto de verdade — a faixa [fundo, topo], menos as passagens e escotilhas
  // (Field.barrierTileSolid) e menos as TRINCHEIRAS das máquinas colossais, escavadas por baixo até
  // `depth` m (Field.trenchAt, por placa — como gen/macrogen.js monta a laje). O feixe acaba ao
  // entrar no concreto: pela face de baixo, pela de cima, ou pela parede de uma trincheira.
  const y0 = a.y;
  const y1 = a.y + dir.y * range;
  const seen = new Set();
  for (const b of [...F.barriersNear(y0), ...F.barriersNear((y0 + y1) / 2), ...F.barriersNear(y1)]) {
    if (seen.has(b.n)) continue;
    seen.add(b.n);
    // o trecho do raio dentro da faixa
    let tin = 0;
    let tout = t;
    if (Math.abs(dir.y) < 1e-6) {
      if (a.y < b.bottom || a.y > b.top) continue;
    } else {
      const ta = (b.bottom - a.y) / dir.y;
      const tb = (b.top - a.y) / dir.y;
      tin = Math.max(0, Math.min(ta, tb));
      tout = Math.min(t, Math.max(ta, tb));
    }
    if (tin >= tout) continue;
    const solid = (s) => {
      const y = a.y + dir.y * s;
      const x = a.x + dir.x * s;
      const z = a.z + dir.z * s;
      if (!F.barrierTileSolid(b, x, z)) return false;
      const T = TILE;
      return y >= b.bottom + F.trenchAt(b, (Math.floor(x / T) + 0.5) * T, (Math.floor(z / T) + 0.5) * T) && y <= b.top;
    };
    // começou dentro do concreto (encostado nele)
    if (tin === 0 && solid(0)) return { t: 0, stop: 'layer' };
    // anda pelo trecho; no primeiro ponto sólido, aperta entre ele e o anterior
    const STEP = 2;
    let prev = tin;
    for (let s = tin + 1e-3; s <= tout + STEP; s += STEP) {
      const at = Math.min(s, tout);
      if (solid(at)) {
        let lo = prev;
        let hi = at;
        for (let k = 0; k < 12; k++) {
          const m = (lo + hi) / 2;
          if (solid(m)) hi = m;
          else lo = m;
        }
        if (hi < t) {
          t = hi;
          stop = 'layer';
        }
        break;
      }
      prev = at;
      if (at >= tout) break;
    }
  }
  // as estruturas únicas: a caixa do prédio (interseção raio × caixa). De fora, o feixe
  // acaba na parede de fora; de dentro (dá para entrar nelas), atira-se, mas ele acaba
  // nas paredes — não sai por elas.
  for (const u of F.uniquesNear(a.x + dir.x * range * 0.5, a.y + dir.y * range * 0.5, a.z + dir.z * range * 0.5, range)) {
    const top = u.y + u.h + (u.kind === 'antenna' ? 130 : 6); // (o mastro da antena é alto)
    const o = [a.x, a.y, a.z];
    const d = [dir.x, dir.y, dir.z];
    const slab = (mn, mx) => {
      let tin = -Infinity;
      let tout = Infinity;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-8) {
          if (o[k] < mn[k] || o[k] > mx[k]) return null;
          continue;
        }
        let ta = (mn[k] - o[k]) / d[k];
        let tb = (mx[k] - o[k]) / d[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        tin = Math.max(tin, ta);
        tout = Math.min(tout, tb);
      }
      return tin > tout || tout <= 0 ? null : { tin, tout };
    };
    const outer = slab([u.x - u.hx - UNIQUE_MARGIN, u.y - 2, u.z - u.hz - UNIQUE_MARGIN], [u.x + u.hx + UNIQUE_MARGIN, top, u.z + u.hz + UNIQUE_MARGIN]);
    if (!outer) continue; // não cruza a caixa
    let hit = outer.tin;
    if (outer.tin <= 0) {
      // de dentro: até a face de dentro das paredes (e do teto)
      const W = UNIQUE_WALL;
      const inner = slab([u.x - u.hx + W, u.y - 2, u.z - u.hz + W], [u.x + u.hx - W, u.y + u.h - 1, u.z + u.hz - W]);
      hit = inner && inner.tin <= 0 ? inner.tout : 0; // (dentro da própria parede: nada)
    }
    if (hit < t) {
      t = hit;
      stop = 'unique';
    }
  }
  return { t: Math.max(0, t), stop };
}
