// ─────────────────────────────────────────────────────────────────────────────
//  Rondas dos Safeguards (fase 6.1) — puro: só o Field e o grafo de navegação.
//
//  TERRITÓRIO = setor (Field.sectorAt, a lei pura) × fatia de 480 m de altura
//  (a mesma fatia das subestações). Um setor inteiro tem 900 × 900 m e 2880 m
//  de altura; um Safeguard só num volume desses quase nunca cruzaria ninguém.
//
//  Cada território com rede andável tem UM Safeguard de ronda. O circuito sai
//  do grafo (gen/nav.js): de uma plataforma perto do meio do território, as
//  plataformas alcançáveis SEM SAIR dele; 3–4 paradas bem espalhadas; o caminho
//  de parada em parada, fechando a volta. Onde não há grafo (galerias,
//  colmeia, maciço, chão das camadas), não há ronda.
//
//  A posição na ronda é função do RELÓGIO DO MUNDO (como vagões e máquinas):
//  ninguém é simulado longe — ele está onde "deveria" quando alguém chega.
// ─────────────────────────────────────────────────────────────────────────────
import { hash4, rngAt } from './hash.js';

export const PATROL = {
  slab: 480, // m de altura de um território
  speed: 1.6, // m/s andando a ronda
  expand: 500, // vértices explorados dentro do território
  minLength: 60, // m: uma volta menor que isso não é ronda
};

/** O território de um ponto GLOBAL: { id, sector, slab }. */
export function territoryAt(F, x, y, z) {
  const sector = F.sectorAt(x, y, z, true);
  const slab = Math.floor(y / PATROL.slab);
  return { id: `T${sector.id}:${slab}`, sector, slab };
}

const inside = (F, t, v) => Math.floor(v.y / PATROL.slab) === t.slab && F.sectorAt(v.x, v.y, v.z, true).id === t.sector.id;

/**
 * O circuito de ronda de um território (memorizado), ou null.
 * { id, pts: [{x,y,z}], cum: [m acumulados], L, phase }
 */
export function patrolCircuit(F, nav, t, salt = 0) {
  nav._patrols ??= new Map();
  const key = `${t.id}#${salt}`;
  if (nav._patrols.has(key)) return nav._patrols.get(key);
  const c = buildCircuit(F, nav, t, salt);
  if (nav._patrols.size > 400) nav._patrols.clear();
  nav._patrols.set(key, c);
  return c;
}

/** salt ≠ 0: outro circuito no mesmo território (os andarilhos da fase 7 — outras paradas, outro começo). */
function buildCircuit(F, nav, t, salt = 0) {
  const S = t.sector;
  const r = rngAt(F.seed, S.i * 7 + t.slab, S.band + salt * 131, S.k, 1601);
  const ymid = (t.slab + 0.5) * PATROL.slab;
  // a plataforma de partida: perto do meio do território (tenta alguns pontos em volta)
  let start = null;
  for (let q = 0; q < 9 && !start; q++) {
    const a = q * 2.4 + salt * 1.7;
    const rr = q || salt ? 120 + q * 40 : 0;
    const n = F.nearestNode(S.px + Math.cos(a) * rr, ymid, S.pz + Math.sin(a) * rr, { below: 5, above: 4, reach: 3 });
    if (n && F.nodeLinked(n) && inside(F, t, n)) start = nav.nodeVertex(n);
  }
  if (!start) return null;
  // as plataformas alcançáveis sem sair do território
  const seen = new Map([[start.id, start]]);
  const queue = [start];
  while (queue.length && seen.size < PATROL.expand) {
    const v = queue.shift();
    for (const nb of nav.neighbors(v)) {
      if (seen.has(nb.v.id) || !inside(F, t, nb.v)) continue;
      seen.set(nb.v.id, nb.v);
      queue.push(nb.v);
    }
  }
  const nodes = [...seen.values()].filter((v) => v.kind === 'node');
  if (nodes.length < 2) return null;
  // paradas bem espalhadas: cada nova é a mais longe das já escolhidas (com um pouco de sorte)
  const stops = [start];
  const want = Math.min(nodes.length, 3 + (r.next() < 0.5 ? 1 : 0));
  while (stops.length < want) {
    let best = null;
    let bestD = -1;
    for (const v of nodes) {
      if (stops.includes(v)) continue;
      const d = Math.min(...stops.map((s) => Math.hypot(v.x - s.x, (v.y - s.y) * 2, v.z - s.z))) * (0.8 + r.next() * 0.4);
      if (d > bestD) {
        bestD = d;
        best = v;
      }
    }
    if (!best) break;
    stops.push(best);
  }
  // a volta: de parada em parada, e de volta à primeira
  const pts = [];
  for (let i = 0; i < stops.length; i++) {
    const a = stops[i];
    const b = stops[(i + 1) % stops.length];
    const p = nav.findPath(a, b, { maxExpand: 1500 });
    if (!p) return null;
    for (const q of i ? p.pts.slice(1) : p.pts) pts.push(q);
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y, pts[i].z - pts[i - 1].z));
  const L = cum[cum.length - 1];
  if (L < PATROL.minLength) return null;
  return { id: salt ? `${t.id}#${salt}` : t.id, territory: t, pts, cum, L, phase: hash4(F.seed, S.i, t.slab + salt * 17, S.k, 1602) * L };
}

/** Ponto do circuito no comprimento de arco s (dá a volta): { x, y, z, yaw, i } — i: o próximo ponto. */
export function circuitAt(c, s) {
  const L = c.L;
  s = ((s % L) + L) % L;
  let lo = 0;
  let hi = c.cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (c.cum[m] <= s) lo = m;
    else hi = m;
  }
  const a = c.pts[lo];
  const b = c.pts[hi];
  const seg = c.cum[hi] - c.cum[lo] || 1;
  const u = (s - c.cum[lo]) / seg;
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, yaw: Math.atan2(-(b.x - a.x), -(b.z - a.z)), i: hi };
}

/** O comprimento de arco do ponto do circuito mais perto de (x,y,z). */
export function circuitNearest(c, x, y, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 1; i < c.pts.length; i++) {
    const a = c.pts[i - 1];
    const b = c.pts[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dz = b.z - a.z;
    const l2 = dx * dx + dy * dy + dz * dz || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * dx + (y - a.y) * dy + (z - a.z) * dz) / l2));
    const d = Math.hypot(a.x + dx * u - x, a.y + dy * u - y, a.z + dz * u - z);
    if (d < bestD) {
      bestD = d;
      best = c.cum[i - 1] + u * Math.sqrt(l2);
    }
  }
  return { s: best, d: bestD };
}
