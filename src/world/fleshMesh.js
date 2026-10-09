// ─────────────────────────────────────────────────────────────────────────────
//  O miolo da malha contínua (world/flesh.js): o campo de distância das formas e o "surface nets".
//  Sem dependências — roda no worker (world/fleshWorker.js) ou, sem ele, na hora.
// ─────────────────────────────────────────────────────────────────────────────
// ── as distâncias (iq) ──────────────────────────────────────────────────────

/** Cápsula de raios diferentes (round cone), sem o caso degenerado. */
function sdCone(px, py, pz, P) {
  const [ax, ay, az] = P.a;
  const bax = P.b[0] - ax, bay = P.b[1] - ay, baz = P.b[2] - az;
  const l2 = bax * bax + bay * bay + baz * baz;
  const pax = px - ax, pay = py - ay, paz = pz - az;
  // aproximação boa para raios próximos: projeta no segmento e interpola o raio
  let h = (pax * bax + pay * bay + paz * baz) / (l2 || 1);
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - (P.ra + (P.rb - P.ra) * h);
}
function sdEllipsoid(px, py, pz, P) {
  const [cx, cy, cz] = P.a;
  const [rx, ry, rz] = P.r;
  const x = px - cx, y = py - cy, z = pz - cz;
  const k0 = Math.sqrt((x / rx) ** 2 + (y / ry) ** 2 + (z / rz) ** 2);
  const k1 = Math.sqrt((x / (rx * rx)) ** 2 + (y / (ry * ry)) ** 2 + (z / (rz * rz)) ** 2);
  return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
}
function sdPrim(px, py, pz, P) {
  if (P.t === 0) return sdCone(px, py, pz, P);
  if (P.t === 1) return sdEllipsoid(px, py, pz, P);
  return (px - P.a[0]) * P.n[0] + (py - P.a[1]) * P.n[1] + (pz - P.a[2]) * P.n[2]; // o plano (positivo: o lado que some)
}
const smin = (a, b, k) => {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
};
const smaxSub = (d, c, k) => {
  // d menos c (c: a distância do que se tira) — max(d, −c) suave
  const a = -c;
  const h = Math.max(k - Math.abs(d - a), 0) / k;
  return Math.max(d, a) + h * h * k * 0.25;
};

const JOIN = 0.022; // a fusão entre cadeias (o tronco e um membro, na junta)
const _chainD = new Float64Array(32);
function field(prims, x, y, z) {
  _chainD.fill(1e9);
  let used = 0;
  for (const P of prims) {
    if (P.sub) continue;
    const c = P.ch;
    const e = sdPrim(x, y, z, P);
    _chainD[c] = _chainD[c] > 1e8 ? e : smin(_chainD[c], e, P.k);
    used |= 1 << c;
  }
  let d = 1e9;
  for (let c = 0; c < 32; c++) if (used & (1 << c)) d = d > 1e8 ? _chainD[c] : smin(d, _chainD[c], JOIN);
  for (const P of prims) if (P.sub) d = smaxSub(d, P.t === 2 ? -sdPrim(x, y, z, P) : sdPrim(x, y, z, P), P.k);
  return d;
}

/**
 * A malha de uma camada: surface nets na grade de lado `cell` (m), das formas `prims` (FleshLayer),
 * com `nb` ossos. → { pos, nrm, sIdx, sW, idx } (até 4 ossos por vértice). Puro: roda num worker.
 */
export function meshArrays(prims, nb, cell = 0.02) {
  // a caixa: a das formas que somam, com folga
  const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9];
  for (const P of prims) {
    if (P.sub) continue;
    const pts = P.t === 0 ? [[P.a, P.ra], [P.b, P.rb]] : [[P.a, Math.max(...P.r)]];
    for (const [p, r] of pts) for (let i = 0; i < 3; i++) {
      lo[i] = Math.min(lo[i], p[i] - r - P.k);
      hi[i] = Math.max(hi[i], p[i] + r + P.k);
    }
  }
  for (let i = 0; i < 3; i++) {
    lo[i] -= cell * 2;
    hi[i] += cell * 2;
  }
  // (nenhuma forma que some: a camada é vazia — o andarilho de dois braços de máquina não tem luvas)
  if (!(hi[0] > lo[0])) return { pos: new Float32Array(0), nrm: new Float32Array(0), sIdx: new Uint16Array(0), sW: new Float32Array(0), idx: new Uint32Array(0) };
  const nx = Math.ceil((hi[0] - lo[0]) / cell) + 1;
  const ny = Math.ceil((hi[1] - lo[1]) / cell) + 1;
  const nz = Math.ceil((hi[2] - lo[2]) / cell) + 1;
  const F = new Float32Array(nx * ny * nz);
  const at = (i, j, k) => i + nx * (j + ny * k);
  // cada forma só conta perto da caixa dela (a folga: a suavidade e duas células) — longe de todas,
  // o ponto está "fora" (um valor positivo qualquer: surface nets só lê os cantos perto da superfície)
  const margin = cell * 2.5;
  for (const P of prims) {
    if (P.t === 2) {
      P.lo = [-1e9, -1e9, -1e9];
      P.hi = [1e9, 1e9, 1e9];
      continue;
    }
    const pts = P.t === 0 ? [[P.a, P.ra], [P.b, P.rb]] : [[P.a, Math.max(...P.r)]];
    P.lo = [1e9, 1e9, 1e9];
    P.hi = [-1e9, -1e9, -1e9];
    for (const [p, r] of pts) for (let i = 0; i < 3; i++) {
      P.lo[i] = Math.min(P.lo[i], p[i] - r - P.k - margin);
      P.hi[i] = Math.max(P.hi[i], p[i] + r + P.k + margin);
    }
  }
  const OUT = margin;
  const row = [];
  for (let k = 0; k < nz; k++) {
    const z = lo[2] + k * cell;
    const zs = prims.filter((P) => z >= P.lo[2] && z <= P.hi[2]);
    for (let j = 0; j < ny; j++) {
      const y = lo[1] + j * cell;
      const ys = zs.filter((P) => y >= P.lo[1] && y <= P.hi[1]);
      if (!ys.some((P) => !P.sub)) {
        for (let i = 0; i < nx; i++) F[at(i, j, k)] = OUT;
        continue;
      }
      for (let i = 0; i < nx; i++) {
        const x = lo[0] + i * cell;
        row.length = 0;
        let add = false;
        for (const P of ys) if (x >= P.lo[0] && x <= P.hi[0]) {
          row.push(P);
          if (!P.sub) add = true;
        }
        F[at(i, j, k)] = add ? field(row, x, y, z) : OUT;
      }
    }
  }
  // um vértice por célula cruzada pela superfície: a média dos pontos onde as arestas a cruzam
  const vIndex = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cIdx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const pos = [];
  const EDGES = [
    [0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = F[at(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          cv[c] = v;
          if (v < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, n = 0;
        for (const [a, b] of EDGES) {
          if ((cv[a] < 0) === (cv[b] < 0)) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          n++;
        }
        vIndex[cIdx(i, j, k)] = pos.length / 3;
        pos.push(lo[0] + (i + sx / n) * cell, lo[1] + (j + sy / n) * cell, lo[2] + (k + sz / n) * cell);
      }
  // as faces: cada aresta da grade que cruza a superfície liga as 4 células em volta dela
  const idx = [];
  const quad = (a, b, c, d, flip) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const s0 = F[at(i, j, k)] < 0, s1 = F[at(i + 1, j, k)] < 0;
        if (s0 === s1) continue;
        quad(vIndex[cIdx(i, j - 1, k - 1)], vIndex[cIdx(i, j, k - 1)], vIndex[cIdx(i, j, k)], vIndex[cIdx(i, j - 1, k)], s0);
      }
  for (let k = 1; k < nz - 1; k++)
    for (let j = 0; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = F[at(i, j, k)] < 0, s1 = F[at(i, j + 1, k)] < 0;
        if (s0 === s1) continue;
        quad(vIndex[cIdx(i - 1, j, k - 1)], vIndex[cIdx(i - 1, j, k)], vIndex[cIdx(i, j, k)], vIndex[cIdx(i, j, k - 1)], s0);
      }
  for (let k = 0; k < nz - 1; k++)
    for (let j = 1; j < ny - 1; j++)
      for (let i = 1; i < nx - 1; i++) {
        const s0 = F[at(i, j, k)] < 0, s1 = F[at(i, j, k + 1)] < 0;
        if (s0 === s1) continue;
        quad(vIndex[cIdx(i - 1, j - 1, k)], vIndex[cIdx(i, j - 1, k)], vIndex[cIdx(i, j, k)], vIndex[cIdx(i - 1, j, k)], s0);
      }
  // as normais pelo gradiente do campo; os pesos pelos ossos das formas mais perto
  const nv = pos.length / 3;
  const nrm = new Float32Array(nv * 3);
  const sIdx = new Uint16Array(nv * 4);
  const sW = new Float32Array(nv * 4);
  const e = cell * 0.5;
  const acc = new Float32Array(nb);
  for (let v = 0; v < nv; v++) {
    const x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    // só as formas perto deste vértice (as caixas de cima)
    const near = prims.filter((P) => x >= P.lo[0] && x <= P.hi[0] && y >= P.lo[1] && y <= P.hi[1] && z >= P.lo[2] && z <= P.hi[2]);
    let gx = field(near, x + e, y, z) - field(near, x - e, y, z);
    let gy = field(near, x, y + e, z) - field(near, x, y - e, z);
    let gz = field(near, x, y, z + e) - field(near, x, y, z - e);
    const gl = Math.hypot(gx, gy, gz) || 1;
    nrm[v * 3] = gx / gl;
    nrm[v * 3 + 1] = gy / gl;
    nrm[v * 3 + 2] = gz / gl;
    acc.fill(0);
    let dmin = 1e9;
    let cmin = 0;
    const ds = [];
    for (const P of near) {
      if (P.sub) continue;
      const d = sdPrim(x, y, z, P);
      ds.push(d);
      if (d < dmin) {
        dmin = d;
        cmin = P.ch;
      }
    }
    // os ossos da cadeia mais perto; de outra cadeia, só na junta (onde as duas se fundem)
    let q = 0;
    for (const P of near) {
      if (P.sub) continue;
      const dd = ds[q++] - dmin;
      if (P.ch !== cmin && dd > JOIN * 0.7) continue;
      acc[P.bi] += Math.exp(-dd / 0.014);
    }
    // os 4 maiores
    for (let s = 0; s < 4; s++) {
      let best = -1, bw = 0;
      for (let b = 0; b < nb; b++) if (acc[b] > bw) {
        bw = acc[b];
        best = b;
      }
      if (best < 0) break;
      sIdx[v * 4 + s] = best;
      sW[v * 4 + s] = bw;
      acc[best] = 0;
    }
    const tw = sW[v * 4] + sW[v * 4 + 1] + sW[v * 4 + 2] + sW[v * 4 + 3] || 1;
    for (let s = 0; s < 4; s++) sW[v * 4 + s] /= tw;
  }
  return { pos: new Float32Array(pos), nrm, sIdx, sW, idx: new Uint32Array(idx) };
}

