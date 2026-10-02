// ─────────────────────────────────────────────────────────────────────────────
//  Navegação dos seres (fase 5): um grafo grosso tirado da mesma lei do mundo.
//
//  Não há malha de navegação pré-calculada — o mundo é infinito. O grafo é
//  consultado sob demanda a partir do Field, com as MESMAS regras que constroem
//  a geometria (gen/network.js, gen/chunkgen.js):
//
//    vértices   plataformas da rede andável ('n<i>,<l>,<k>') e pontos sobre as
//               passarelas infinitas ('w<passarela>:<t>') — onde um conector chega
//    arestas    pontes, rampas, escadas, tubos, pontes suspensas e torres em
//               espiral (Field.edge); conectores plataforma → passarela; e o
//               tabuleiro da passarela entre dois conectores, se não houver vão
//               no meio (Field.walkGap, zonas reservadas); e o VAGÃO: nas
//               passarelas com trilho, de uma estação a outra mais adiante no
//               sentido da linha ('ride' — o corpo espera, embarca, desce:
//               world/entities.js)
//
//  Cada aresta leva a sua polilinha (pontos GLOBAIS, sobre o piso) — por onde um
//  corpo anda de fato. Atravessar uma plataforma desvia do que há em cima dela
//  (monólito, guarita, pés de arco, postes). O resto (algo solto no caminho) é
//  com o desvio local do corpo (world/entities.js).
//
//  Tudo aqui é puro (só o Field): roda no jogo, num worker ou no node.
// ─────────────────────────────────────────────────────────────────────────────
import { NODE, WALK, EDGE_DIRS, TRANSIT } from './field.js';

const MOD = WALK.module;
const RUN_MAX = 250; // módulos para cada lado (3 km) ao procurar o fim de um trecho sem vão
const tMid = (t) => Math.floor(t / MOD) * MOD + MOD / 2;
const r2 = (v) => Math.round(v * 100) / 100;
const ST = TRANSIT.station;
const stationT = (i) => i * ST + ST / 2; // (como gen/transit.js)
const RIDE_COST = 260; // "metros" de uma viagem de vagão entre duas estações (~95 s; a pé seriam 1440 m)
const RIDE_MAX = 3; // estações de uma vez sem descer

/** Distância do centro de uma plataforma à borda do piso na direção (ux, uz) — como em network.js. */
export function edgeDist(n, ux, uz) {
  const k = n.sides;
  const seg = (Math.PI * 2) / k;
  let a = Math.atan2(ux, uz) - n.spin;
  a = ((a % seg) + seg) % seg;
  return (n.r * Math.cos(Math.PI / k)) / Math.cos(a - Math.PI / k);
}

/** O que há em pé sobre a plataforma (círculos { x, z, rad }) — as medidas de buildPlatform. */
export function platformObstacles(n) {
  const out = [];
  const r = n.r;
  const h = Math.abs(Math.sin(n.i * 12.99 + n.l * 78.23 + n.k * 37.71) * 43758.54) % 1;
  if (h < 0.35) out.push({ x: n.x + r * 0.3 + 0.7, z: n.z - r * 0.3, rad: 0.5 }); // o poste da luminária
  switch (n.feature) {
    case 'lamp':
      out.push({ x: n.x + r * 0.5, z: n.z, rad: 0.6 });
      break;
    case 'arch': {
      const L = r * 0.55;
      const cx = Math.cos(n.spin) * L;
      const cz = -Math.sin(n.spin) * L;
      out.push({ x: n.x + cx, z: n.z + cz, rad: 0.7 }, { x: n.x - cx, z: n.z - cz, rad: 0.7 });
      break;
    }
    case 'monolith':
      out.push({ x: n.x, z: n.z, rad: 1.5 });
      break;
    case 'tree':
      out.push({ x: n.x - r * 0.4, z: n.z + r * 0.2, rad: 0.6 });
      break;
    case 'booth':
      out.push({ x: n.x - r * 0.45, z: n.z + r * 0.2, rad: 3.3 });
      break;
    default:
      break;
  }
  return out;
}

/** Um ponto livre sobre a plataforma n (o centro, se não houver nada nele) — onde um corpo fica de pé. */
export function standPoint(n) {
  const obs = platformObstacles(n);
  const free = (x, z) => obs.every((o) => Math.hypot(x - o.x, z - o.z) > o.rad + 0.8);
  if (free(n.x, n.z)) return { x: n.x, y: n.y, z: n.z };
  for (let q = 0; q < 8; q++) {
    const a = n.spin + (q / 8) * Math.PI * 2;
    const x = n.x + Math.sin(a) * n.r * 0.45;
    const z = n.z + Math.cos(a) * n.r * 0.45;
    if (free(x, z)) return { x, y: n.y, z };
  }
  return { x: n.x + Math.sin(n.spin) * n.r * 0.6, y: n.y, z: n.z + Math.cos(n.spin) * n.r * 0.6 };
}

/** A polilinha p→q sobre a plataforma n, desviando dos obstáculos (pontos no piso). */
export function crossPlatform(n, p, q) {
  const obs = platformObstacles(n);
  const pts = [p];
  const dx = q.x - p.x;
  const dz = q.z - p.z;
  const len2 = dx * dx + dz * dz || 1;
  const hits = [];
  for (const o of obs) {
    const u = Math.max(0, Math.min(1, ((o.x - p.x) * dx + (o.z - p.z) * dz) / len2));
    const cx = p.x + dx * u;
    const cz = p.z + dz * u;
    const d = Math.hypot(o.x - cx, o.z - cz);
    if (d < o.rad + 0.9) hits.push({ o, u, cx, cz, d });
  }
  hits.sort((a, b) => a.u - b.u);
  for (const { o, cx, cz, d } of hits) {
    // sai pelo lado em que o caminho já passa (ou por um lado qualquer, se passa no centro)
    let px = cx - o.x;
    let pz = cz - o.z;
    if (d < 1e-3) {
      const L = Math.sqrt(len2);
      px = -dz / L;
      pz = dx / L;
    } else {
      px /= d;
      pz /= d;
    }
    const off = o.rad + 1.4;
    let x = o.x + px * off;
    let z = o.z + pz * off;
    // fora do piso? o outro lado
    if (Math.hypot(x - n.x, z - n.z) > edgeDist(n, (x - n.x) || 1e-6, (z - n.z) || 1e-6) - 1.2) {
      x = o.x - px * off;
      z = o.z - pz * off;
    }
    pts.push({ x, y: n.y, z });
  }
  pts.push(q);
  return pts;
}

/** Heap binária mínima por .f (para o A*). */
class Heap {
  constructor() {
    this.a = [];
  }
  get size() {
    return this.a.length;
  }
  push(x) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a;
    const top = a[0];
    const last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top;
  }
}

export class NavGraph {
  constructor(F) {
    /** @type {Map<string, any>|undefined} circuitos de ronda já feitos (gen/patrols.js) */
    this._patrols = undefined;
    this.F = F;
    this._runs = new Map(); // passarela → [[m0, m1], …] trechos sem vão já achados
  }

  // ── passarelas ─────────────────────────────────────────────────────────────

  /** A passarela ao longo de Z (a, b) ou de X (b, c) como descritor, ou null. */
  walkZ(a, b) {
    const w = this.F.walkZ(a, b);
    if (!w) return null;
    return { key: `z${a},${b}`, axis: 'z', u: a * WALK.spacing, y: b * WALK.ySpacing, salt: a * 7919 + b * 104729, w };
  }

  walkX(b, c) {
    const w = this.F.walkX(b, c);
    if (!w) return null;
    return { key: `x${b},${c}`, axis: 'x', u: c * WALK.spacing + WALK.spacing / 2, y: b * WALK.ySpacing + WALK.ySpacing / 2, salt: b * 15485863 + c * 7919 + 17, w };
  }

  /** O módulo m da passarela tem tabuleiro? (a mesma regra de buildWalk) */
  _open(wk, m) {
    const F = this.F;
    const ts = m * MOD;
    if (F.walkGap(wk.salt, ts + MOD / 2, wk.w.main, wk.y)) return false;
    const hw = wk.w.width / 2;
    const [x0, z0, x1, z1] = wk.axis === 'z' ? [wk.u - hw - 1, ts, wk.u + hw + 1, ts + MOD] : [ts, wk.u - hw - 1, ts + MOD, wk.u + hw + 1];
    const res = F.reservedHit(x0, wk.y - 4, z0, x1, wk.y + 12, z1);
    return !res || !!res.keepWalkways;
  }

  /** O trecho sem vão que contém t: [tMin, tMax] (ou null se t cai num vão). */
  run(wk, t) {
    const m = Math.floor(t / MOD);
    let list = this._runs.get(wk.key);
    if (!list) this._runs.set(wk.key, (list = []));
    for (const [a, b] of list) if (m >= a && m <= b) return [a * MOD, (b + 1) * MOD];
    if (!this._open(wk, m)) return null;
    let a = m;
    let b = m;
    while (a > m - RUN_MAX && this._open(wk, a - 1)) a--;
    while (b < m + RUN_MAX && this._open(wk, b + 1)) b++;
    list.push([a, b]);
    if (this._runs.size > 4000) this._runs.clear();
    return [a * MOD, (b + 1) * MOD];
  }

  /** Ponto GLOBAL no eixo da passarela, na posição t ao longo dela. */
  walkPoint(wk, t) {
    return wk.axis === 'z' ? { x: wk.u, y: wk.y, z: t } : { x: t, y: wk.y, z: wk.u };
  }

  /**
   * O conector da plataforma n até uma passarela (a mesma regra de connectToWalkways):
   * { wk, t, pts } — pts vai da borda da plataforma ao eixo da passarela.
   */
  connector(n) {
    const F = this.F;
    const { spacing, ySpacing } = WALK;
    if (n.y % ySpacing === 0) {
      const b = n.y / ySpacing;
      const a = Math.round(n.x / spacing);
      const wk = this.walkZ(a, b);
      if (wk && Math.abs(n.x - wk.u) < NODE.h * 1.5 && !F.walkGap(wk.salt, tMid(n.z), wk.w.main, n.y)) {
        const sgn = Math.sign(wk.u - n.x) || 1;
        if (!(wk.w.track && -sgn === wk.w.track.side)) {
          const sx = n.x + sgn * (edgeDist(n, sgn, 0) - 0.8);
          const tx = wk.u - sgn * (wk.w.width / 2 - 0.3);
          if (Math.abs(tx - sx) > 1) {
            return { wk, t: r2(n.z), pts: [{ x: sx, y: n.y, z: n.z }, { x: tx, y: n.y, z: n.z }, { x: wk.u, y: n.y, z: n.z }] };
          }
        }
      }
    }
    if ((n.y - ySpacing / 2) % ySpacing === 0) {
      const b = (n.y - ySpacing / 2) / ySpacing;
      const c = Math.round((n.z - spacing / 2) / spacing);
      const wk = this.walkX(b, c);
      if (wk && Math.abs(n.z - wk.u) < NODE.h * 1.5 && !F.walkGap(wk.salt, tMid(n.x), false, n.y)) {
        const sgn = Math.sign(wk.u - n.z) || 1;
        if (!(wk.w.track && -sgn === wk.w.track.side)) {
          const sz = n.z + sgn * (edgeDist(n, 0, sgn) - 0.8);
          const tz = wk.u - sgn * (wk.w.width / 2 - 0.3);
          if (Math.abs(tz - sz) > 1) {
            return { wk, t: r2(n.x), pts: [{ x: n.x, y: n.y, z: sz }, { x: n.x, y: n.y, z: tz }, { x: n.x, y: n.y, z: wk.u }] };
          }
        }
      }
    }
    return null;
  }

  /** As estações do trilho ao longo da passarela, entre t0 e t1 (posições t). */
  _stations(wk, t0, t1) {
    const out = [];
    if (!wk.w.track) return out;
    for (let i = Math.ceil((t0 - ST / 2) / ST); stationT(i) <= t1; i++) out.push(stationT(i));
    return out;
  }

  /** O ponto GLOBAL do centro do vagão parado na estação ts (o piso dele fica no nível da passarela). */
  carPoint(wk, ts) {
    const lat = wk.u + wk.w.track.off;
    return wk.axis === 'z' ? { x: lat, y: wk.y, z: ts } : { x: ts, y: wk.y, z: lat };
  }

  /** Conexões (plataformas) ao longo da passarela, entre t0 e t1: [{ t, n }]. */
  _connections(wk, t0, t1) {
    const F = this.F;
    const out = [];
    const l = wk.y / NODE.v;
    if (!Number.isInteger(l)) return out;
    const c0 = Math.floor((wk.u - NODE.h * 1.5) / NODE.h) - 1;
    const c1 = Math.floor((wk.u + NODE.h * 1.5) / NODE.h) + 1;
    const a0 = Math.floor(t0 / NODE.h) - 1;
    const a1 = Math.floor(t1 / NODE.h) + 1;
    for (let c = c0; c <= c1; c++) {
      for (let a = a0; a <= a1; a++) {
        const n = wk.axis === 'z' ? F.node(c, l, a) : F.node(a, l, c);
        if (!n || !F.nodeLinked(n)) continue;
        const cn = this.connector(n);
        if (cn && cn.wk.key === wk.key && cn.t >= t0 && cn.t <= t1) out.push({ t: cn.t, n });
      }
    }
    return out.sort((p, q) => p.t - q.t);
  }

  // ── vértices ───────────────────────────────────────────────────────────────

  nodeVertex(n) {
    return { id: `n${n.i},${n.l},${n.k}`, kind: 'node', n, x: n.x, y: n.y, z: n.z };
  }

  walkVertex(wk, t) {
    const p = this.walkPoint(wk, r2(t));
    return { id: `w${wk.key}:${r2(t)}`, kind: 'walk', wk, t: r2(t), ...p };
  }

  /** O vértice onde um corpo em (x,y,z) está: uma plataforma, ou um ponto de passarela. */
  vertexAt(x, y, z) {
    const F = this.F;
    const { spacing, ySpacing } = WALK;
    // numa passarela?
    const b = Math.round(y / ySpacing);
    if (Math.abs(y - b * ySpacing) < 2.5) {
      const wk = this.walkZ(Math.round(x / spacing), b);
      if (wk && Math.abs(x - wk.u) < wk.w.width / 2 + 0.5 && this.run(wk, z)) return this.walkVertex(wk, z);
    }
    const bx = Math.round((y - ySpacing / 2) / ySpacing);
    if (Math.abs(y - (bx * ySpacing + ySpacing / 2)) < 2.5) {
      const wk = this.walkX(bx, Math.round((z - spacing / 2) / spacing));
      if (wk && Math.abs(z - wk.u) < wk.w.width / 2 + 0.5 && this.run(wk, x)) return this.walkVertex(wk, x);
    }
    // numa plataforma?
    const n = F.node(Math.floor(x / NODE.h), Math.round(y / NODE.v), Math.floor(z / NODE.h));
    if (n && F.nodeLinked(n) && Math.abs(y - n.y) < 2.5 && Math.hypot(x - n.x, z - n.z) < n.r) return this.nodeVertex(n);
    // perto de uma (a célula vizinha)
    const near = F.nearestNode(x, y, z, { below: 0, above: 0, reach: 1 });
    if (near && Math.abs(y - near.y) < 2.5 && Math.hypot(x - near.x, z - near.z) < near.r) return this.nodeVertex(near);
    return null;
  }

  // ── arestas ────────────────────────────────────────────────────────────────

  /** A polilinha de uma aresta da rede, de `from` para o outro lado (pontos no piso). */
  edgePath(e, from) {
    const { a, b } = e;
    let pts;
    if (e.kind === 'spiral') pts = this._spiralPath(e);
    else {
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const hd = Math.hypot(dx, dz) || 1;
      const ux = dx / hd;
      const uz = dz / hd;
      const da = edgeDist(a, ux, uz) - 0.8;
      const db = edgeDist(b, -ux, -uz) - 0.8;
      const s = { x: a.x + ux * da, y: a.y, z: a.z + uz * da };
      const t = { x: b.x - ux * db, y: b.y, z: b.z - uz * db };
      pts = [s];
      // a ponte suspensa cede no meio — a mesma curva de EDGES.suspended (network.js:
      // o primeiro sorteio do RNG da aresta é o quanto ela cede)
      const len = Math.hypot(t.x - s.x, t.y - s.y, t.z - s.z);
      const sag = e.kind === 'suspended' ? Math.min(len * 0.06, 6) * e.r.float(0.5, 1) : 0;
      if (e.kind === 'suspended' || e.kind === 'ramp' || e.kind === 'stairs') {
        const N = Math.max(2, Math.round(hd / 8));
        for (let i = 1; i < N; i++) {
          const u = i / N;
          pts.push({ x: s.x + (t.x - s.x) * u, y: s.y + (t.y - s.y) * u - sag * 4 * u * (1 - u), z: s.z + (t.z - s.z) * u });
        }
      }
      pts.push(t);
    }
    return from === a ? pts : pts.slice().reverse();
  }

  /** A hélice da torre em espiral — o mesmo sorteio de EDGES.spiral (network.js). */
  _spiralPath(e) {
    const { a, b } = e;
    const r = this.F.edge(a, [0, 1, 0]).r; // um RNG novo, no mesmo ponto em que a construção o recebe
    const w = e.width;
    const Rh = r.float(6.5, 9);
    const Rm = Rh - w / 2;
    const ang = r.float(0, Math.PI * 2);
    const C = { x: a.x + Math.cos(ang) * (a.r + Rh + 1), z: a.z + Math.sin(ang) * (a.r + Rh + 1) };
    const dy = b.y - a.y;
    const thA = Math.atan2(a.z - C.z, a.x - C.x);
    const thB = Math.atan2(b.z - C.z, b.x - C.x);
    const minArc = dy / Math.tan((27 * Math.PI) / 180);
    let delta = (((thB - thA) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    while (Rm * delta < minArc) delta += 2 * Math.PI;
    const at = (th, y) => ({ x: C.x + Math.cos(th) * Rm, y, z: C.z + Math.sin(th) * Rm });
    const dAC = Math.hypot(C.x - a.x, C.z - a.z);
    const eA = edgeDist(a, (C.x - a.x) / dAC, (C.z - a.z) / dAC) - 0.8;
    const pts = [{ x: a.x + ((C.x - a.x) / dAC) * eA, y: a.y, z: a.z + ((C.z - a.z) / dAC) * eA }];
    const steps = Math.ceil(delta / 0.35);
    for (let i = 0; i <= steps; i++) pts.push(at(thA + (delta * i) / steps, a.y + (dy * i) / steps));
    const E = pts[pts.length - 1];
    const toB = Math.hypot(b.x - E.x, b.z - E.z);
    if (toB > b.r) {
      const ux = (b.x - E.x) / toB;
      const uz = (b.z - E.z) / toB;
      const eB = edgeDist(b, -ux, -uz) - 0.8;
      pts.push({ x: b.x - ux * eB, y: b.y, z: b.z - uz * eB });
    }
    return pts;
  }

  /**
   * Vizinhos de um vértice: [{ v, cost, pts }] — pts é o caminho da aresta
   * (sem a travessia das plataformas, que depende de por onde se chega e se sai).
   * `goal` (opcional): um vértice de passarela entra como vizinho direto se estiver no mesmo trecho.
   */
  neighbors(v, goal = null, ride = true) {
    const F = this.F;
    const out = [];
    const len = (pts) => {
      let s = 0;
      for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
      return s;
    };
    if (v.kind === 'node') {
      const n = v.n;
      const seen = new Set();
      for (const d of EDGE_DIRS) {
        const fwd = F.edge(n, d);
        if (fwd) {
          const pts = this.edgePath(fwd, n);
          out.push({ v: this.nodeVertex(fwd.b), cost: len(pts), pts, kind: fwd.kind });
          seen.add(`${fwd.b.i},${fwd.b.l},${fwd.b.k}`);
        }
        const m = F.node(n.i - d[0], n.l - d[1], n.k - d[2]);
        if (m && !seen.has(`${m.i},${m.l},${m.k}`)) {
          const back = F.edge(m, d);
          if (back) {
            const pts = this.edgePath(back, n);
            out.push({ v: this.nodeVertex(m), cost: len(pts), pts, kind: back.kind });
          }
        }
      }
      const cn = this.connector(n);
      if (cn && this.run(cn.wk, cn.t)) out.push({ v: this.walkVertex(cn.wk, cn.t), cost: len(cn.pts), pts: cn.pts, kind: 'connector' });
      return out;
    }
    // ponto de passarela: as conexões mais próximas para cada lado no mesmo trecho
    // (as de mais longe se alcançam passando por estas — o custo soma igual)
    const run = this.run(v.wk, v.t);
    if (!run) return out;
    const conns = this._connections(v.wk, run[0], run[1]);
    // paradas: as conexões e as estações do trilho (as de mais longe, passando por estas)
    const stops = [...conns.map((c) => c.t), ...this._stations(v.wk, run[0], run[1])].sort((p, q) => p - q);
    const before = stops.filter((t) => t < v.t - 0.01).pop();
    const after = stops.find((t) => t > v.t + 0.01);
    for (const t of [before, after]) {
      if (t === undefined) continue;
      const w = this.walkVertex(v.wk, t);
      out.push({ v: w, cost: Math.abs(t - v.t), pts: [{ x: v.x, y: v.y, z: v.z }, { x: w.x, y: w.y, z: w.z }], kind: 'walk' });
    }
    // numa estação: o vagão, até 1–3 estações adiante no sentido da linha
    const tr = v.wk.w.track;
    if (ride && tr && Math.abs(stationT(Math.round((v.t - ST / 2) / ST)) - v.t) < 0.01) {
      for (let k = 1; k <= RIDE_MAX; k++) {
        const td = v.t + tr.dir * k * ST;
        if (!this.run(v.wk, td)) continue;
        const w = this.walkVertex(v.wk, td);
        out.push({ v: w, cost: RIDE_COST * k, pts: [{ x: v.x, y: v.y, z: v.z }, this.carPoint(v.wk, v.t), this.carPoint(v.wk, td), { x: w.x, y: w.y, z: w.z }], kind: 'ride', ride: { line: 't' + v.wk.key, from: v.t, to: td } });
      }
    }
    // no próprio ponto de conexão: a plataforma
    for (const c of conns) {
      if (Math.abs(c.t - v.t) > 0.01) continue;
      const cn = this.connector(c.n);
      const pts = cn.pts.slice().reverse();
      out.push({ v: this.nodeVertex(c.n), cost: len(pts), pts, kind: 'connector' });
    }
    if (goal && goal.kind === 'walk' && goal.wk.key === v.wk.key && goal.t >= run[0] && goal.t <= run[1] && goal.id !== v.id) {
      out.push({ v: goal, cost: Math.abs(goal.t - v.t), pts: [{ x: v.x, y: v.y, z: v.z }, { x: goal.x, y: goal.y, z: goal.z }], kind: 'walk' });
    }
    return out;
  }

  /**
   * A* de `start` até `goal` (vértices). Devolve { verts, pts, length, expanded }
   * — pts é a polilinha inteira no piso, já com a travessia das plataformas — ou null.
   * `avoid`: Set de ids de arestas 'idA>idB' a evitar (um corpo que empacou pede outro caminho).
   */
  findPath(start, goal, { maxExpand = 6000, avoid = null, ride = true } = {}) {
    const h = (v) => Math.hypot(v.x - goal.x, v.y - goal.y, v.z - goal.z);
    const open = new Heap();
    const best = new Map([[start.id, 0]]);
    const came = new Map();
    open.push({ v: start, g: 0, f: h(start) });
    let expanded = 0;
    while (open.size) {
      const cur = open.pop();
      if (cur.g > (best.get(cur.v.id) ?? Infinity)) continue;
      if (cur.v.id === goal.id) return this._assemble(start, cur.v, came, expanded);
      if (++expanded > maxExpand) return null;
      for (const nb of this.neighbors(cur.v, goal, ride)) {
        if (avoid && avoid.has(`${cur.v.id}>${nb.v.id}`)) continue;
        const g = cur.g + nb.cost;
        if (g >= (best.get(nb.v.id) ?? Infinity)) continue;
        best.set(nb.v.id, g);
        came.set(nb.v.id, { prev: cur.v, pts: nb.pts, kind: nb.kind, ride: nb.ride });
        open.push({ v: nb.v, g, f: g + h(nb.v) });
      }
    }
    return null;
  }

  _assemble(start, end, came, expanded) {
    const legs = [];
    let v = end;
    while (v.id !== start.id) {
      const c = came.get(v.id);
      legs.push({ from: c.prev, to: v, pts: c.pts, kind: c.kind, ride: c.ride });
      v = c.prev;
    }
    legs.reverse();
    const pts = [{ x: start.x, y: start.y, z: start.z }];
    const ptLeg = [0]; // a perna a que cada ponto pertence (quem empaca sabe qual aresta evitar)
    const push = (p, li) => {
      const q = pts[pts.length - 1];
      if (Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z) > 0.05) {
        pts.push({ x: p.x, y: p.y, z: p.z });
        ptLeg.push(li);
      }
    };
    legs.forEach((leg, li) => {
      // atravessa a plataforma de onde a aresta sai: do último ponto até o começo da aresta
      if (leg.from.kind === 'node') for (const p of crossPlatform(leg.from.n, pts[pts.length - 1], leg.pts[0]).slice(1)) push(p, li);
      for (const p of leg.pts) push(p, li);
    });
    // termina no centro (ou no ponto) do vértice final
    const last = Math.max(0, legs.length - 1);
    if (end.kind === 'node') for (const p of crossPlatform(end.n, pts[pts.length - 1], standPoint(end.n)).slice(1)) push(p, last);
    else push({ x: end.x, y: end.y, z: end.z }, last);
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z);
    return { verts: [start, ...legs.map((l) => l.to)], legs, pts, ptLeg, length, expanded };
  }

  /**
   * Um destino alcançável a até `dist` m ANDANDO a partir de v (Dijkstra pelo custo
   * do caminho): entre as plataformas a essa distância, uma das mais afastadas em linha reta.
   */
  wander(v, dist, rng, maxExpand = 4000) {
    const open = new Heap();
    const best = new Map([[v.id, 0]]);
    open.push({ v, f: 0 });
    const cands = [];
    let expanded = 0;
    while (open.size && expanded++ < maxExpand) {
      const cur = open.pop();
      if (cur.f > (best.get(cur.v.id) ?? Infinity)) continue;
      if (cur.v.kind === 'node' && cur.v.id !== v.id) cands.push({ v: cur.v, d: Math.hypot(cur.v.x - v.x, cur.v.z - v.z) });
      for (const nb of this.neighbors(cur.v)) {
        const g = cur.f + nb.cost;
        if (g > dist || g >= (best.get(nb.v.id) ?? Infinity)) continue;
        best.set(nb.v.id, g);
        open.push({ v: nb.v, f: g });
      }
    }
    if (!cands.length) return null;
    cands.sort((a, b) => b.d - a.d);
    // um dos três mais afastados (varia com a semente)
    return cands[Math.min(cands.length - 1, Math.floor(rng() * 3))].v;
  }
}
