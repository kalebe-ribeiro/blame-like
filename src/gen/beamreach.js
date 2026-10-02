// ─────────────────────────────────────────────────────────────────────────────
//  Até onde vai o feixe do emissor (a arma de Killy): ele acaba ao entrar numa
//  camada intransponível (onde há placa de laje montada — Field.barrierTileSolid)
//  ou numa estrutura única (de fora, na caixa dela; de dentro, na face de dentro
//  das paredes). Puro: só o Field.
// ─────────────────────────────────────────────────────────────────────────────

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
  // as camadas: uma faixa horizontal infinita [bottom, top]; o feixe acaba ao entrar nela
  // (onde a laje existe — uma passagem aberta deixa passar)
  const y0 = a.y;
  const y1 = a.y + dir.y * range;
  for (const b of F.barriersNear((y0 + y1) / 2)) {
    for (const y of [b.top, b.bottom]) {
      if (Math.abs(dir.y) < 1e-5) continue;
      const tt = (y - a.y) / dir.y;
      if (tt <= 0 || tt >= t) continue;
      const x = a.x + dir.x * tt;
      const z = a.z + dir.z * tt;
      if (F.barrierTileSolid(b, x, z)) {
        t = tt;
        stop = 'layer';
      }
    }
    // começou dentro da laje (encostado nela)
    if (a.y > b.bottom && a.y < b.top && F.barrierTileSolid(b, a.x, a.z)) return { t: 0, stop: 'layer' };
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
