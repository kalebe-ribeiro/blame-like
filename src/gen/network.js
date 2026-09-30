// ─────────────────────────────────────────────────────────────────────────────
//  Geometria da REDE ANDÁVEL (roda no worker, chamada por chunkgen.js).
//
//  Nós   → plataformas (disco poligonal com "raiz" por baixo e às vezes algo
//          em cima: poste de luz, arco, monólito, árvore de tentáculos, anéis)
//  Arestas (o tipo é sorteado por aresta, ver Field.edge):
//    deck       ponte reta com corrimão
//    suspended  ponte de pranchas pendurada, com cordas-cabo
//    tube       corredor tubular fechado (às vezes o acaso faz um corredor)
//    ramp       rampa inclinada entre níveis, com escoras
//    stairs     escadaria entre níveis
//    spiral     torre com rampa helicoidal ligando um nível ao de cima
//  Conectores ligam plataformas às passarelas infinitas (inclusive a ponte).
//
//  Regra de ouro para a física: superfícies andáveis ficam com o TOPO
//  exatamente na altura do caminho, e inclinação ≤ ~36°.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { NODE, WALK, EDGE_DIRS } from './field.js';
import { place, cylinderBetween, buildTaperedTube, slabBetween } from '../world/geometry.js';
import { catenaryCable } from '../world/cables.js';
import { FLUORO, SODIUM, COLD } from './colors.js';
import { rngAt } from './hash.js';

const COLORS = [FLUORO, SODIUM, COLD];
const TH = 0.6; // espessura dos tabuleiros

export function genNetwork(F, B, box) {
  const i0 = Math.floor(box.x0 / NODE.h);
  const k0 = Math.floor(box.z0 / NODE.h);
  const l0 = Math.floor(box.y0 / NODE.v);
  const nh = Math.round((box.x1 - box.x0) / NODE.h);
  const nv = Math.round((box.y1 - box.y0) / NODE.v);
  for (let i = i0; i < i0 + nh; i++) {
    for (let k = k0; k < k0 + nh; k++) {
      for (let l = l0; l < l0 + nv; l++) {
        const n = F.node(i, l, k);
        if (!n || !F.nodeLinked(n)) continue; // plataforma sem ligação nenhuma: não existe
        if (B.lod) {
          lodNode(F, B, n);
          continue;
        }
        buildPlatform(F, B, n);
        for (const d of EDGE_DIRS) {
          const e = F.edge(n, d);
          if (e) EDGES[e.kind](F, B, e);
        }
        connectToWalkways(F, B, n);
      }
    }
  }
}

// ─── utilidades ─────────────────────────────────────────────────────────────

/** Deslocamento lateral (perpendicular horizontal) de um caminho a→b. */
function side(a, b) {
  const s = new THREE.Vector3(b.z - a.z, 0, -(b.x - a.x));
  return s.lengthSq() > 0 ? s.normalize() : new THREE.Vector3(1, 0, 0);
}

/** Pontos de saída na borda de cada plataforma, em direção à outra. */
function endpoints(B, e) {
  const { a, b } = e;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const hd = Math.hypot(dx, dz) || 1;
  const ux = dx / hd;
  const uz = dz / hd;
  const s = B.L(a.x + ux * (a.r - 0.8), a.y, a.z + uz * (a.r - 0.8));
  const t = B.L(b.x - ux * (b.r - 0.8), b.y, b.z - uz * (b.r - 0.8));
  return [s, t];
}

function rails(B, a, b, w, h = 1.0) {
  const sd = side(a, b).multiplyScalar(w / 2 - 0.15);
  const up = new THREE.Vector3(0, h, 0);
  for (const sgn of [-1, 1]) {
    const o = sd.clone().multiplyScalar(sgn).add(up);
    B.add('bridge', cylinderBetween(a.clone().add(o), b.clone().add(o), 0.09, 0.09, 5, { open: true }));
  }
}

/** LOD: disco simples; em LOD 1 as ligações viram uma laje reta cada. */
function lodNode(F, B, n) {
  const c = B.L(n.x, n.y, n.z);
  B.add('plaza', place(new THREE.CylinderGeometry(n.r, n.r * 0.9, 1.6, Math.min(n.sides, 6), 1, false), { x: c.x, y: c.y - 0.8, z: c.z, ry: n.spin }));
  if (B.lod > 1) return;
  for (const d of EDGE_DIRS) {
    const e = F.edge(n, d);
    if (!e || e.kind === 'spiral') continue;
    const [s, t] = endpoints(B, e);
    B.add('bridge', slabBetween(s, t, e.width, 0.8));
  }
}

// ─── nós (plataformas) ──────────────────────────────────────────────────────

function buildPlatform(F, B, n) {
  const c = B.L(n.x, n.y, n.z);
  const r = n.r;
  // disco (o topo fica exatamente em y)
  B.add('plaza', place(new THREE.CylinderGeometry(r, r * 0.92, 1.6, n.sides, 1, false), { x: c.x, y: c.y - 0.8, z: c.z, ry: n.spin }));
  // borda em relevo, baixa o suficiente para passar por cima — nos mesmos cantos do piso
  // (CylinderGeometry: canto q em x = sin θ, z = cos θ, θ = q/n·2π, girado por n.spin)
  const corner = (q) => {
    const th = (q / n.sides) * Math.PI * 2 + n.spin;
    return new THREE.Vector3(c.x + Math.sin(th) * (r - 0.4), c.y + 0.02, c.z + Math.cos(th) * (r - 0.4));
  };
  for (let q = 0; q < n.sides; q++) B.add('rib', cylinderBetween(corner(q), corner(q + 1), 0.18, 0.18, 4));
  // por baixo: um cubo de ligação e vigas radiais até a borda (a plataforma é um nó
  // de aço onde as pontes chegam — não uma ilha com raiz)
  B.add('tower', place(new THREE.BoxGeometry(r * 0.5, 2.4, r * 0.5), { x: c.x, y: c.y - 2.8, z: c.z, ry: n.spin }));
  for (let q = 0; q < n.sides; q++) {
    const a = n.spin + (q / n.sides) * Math.PI * 2;
    const e = new THREE.Vector3(c.x + Math.cos(a) * (r - 0.6), c.y - 1.7, c.z + Math.sin(a) * (r - 0.6));
    B.add('rib', cylinderBetween(new THREE.Vector3(c.x, c.y - 2.6, c.z), e, 0.28, 0.2, 4));
  }

  const h = Math.abs(Math.sin(n.i * 12.99 + n.l * 78.23 + n.k * 37.71) * 43758.54) % 1;
  if (h < 0.35) {
    // luz: plataformas são as "clareiras" do mundo
    const col = COLORS[Math.floor(h * 100) % 3];
    B.lamp(n.x + r * 0.3, n.y + 5, n.z - r * 0.3, col, 25 + h * 80, h < 0.12 ? 'faulty' : 'steady', { to: [n.x + r * 0.3 + 0.7, n.y, n.z - r * 0.3] });
    B.socket(n.x + r * 0.3 + 0.7, n.y + 1.1, n.z - r * 0.3 + 0.12);
  }
  switch (n.feature) {
    case 'lamp': {
      const p = c.clone().add(new THREE.Vector3(r * 0.5, 0, 0));
      B.add('duct', cylinderBetween(p, p.clone().add(new THREE.Vector3(0, 6, 0)), 0.25, 0.12, 6));
      B.add('rib', place(new THREE.TorusGeometry(0.6, 0.12, 4, 12), { x: p.x, y: p.y + 6.2, z: p.z }));
      B.lamp(n.x + r * 0.5, n.y + 5.7, n.z, FLUORO, 40, 'faulty'); // pendurada no topo do poste
      break;
    }
    case 'arch': {
      const arch = new THREE.TorusGeometry(r * 0.55, 0.35, 6, 30, Math.PI);
      arch.scale(1, 1.5, 1);
      arch.rotateY(n.spin);
      arch.translate(c.x, c.y, c.z);
      B.add('rib', arch);
      break;
    }
    case 'monolith': {
      B.add('slab', place(new THREE.BoxGeometry(2.4, 9, 0.5, 1, 4, 1), { x: c.x, y: c.y + 4.5, z: c.z, ry: n.spin }));
      break;
    }
    case 'tree': { // (o nome ficou das seeds antigas) mastro de aço morto, com uma travessa
      const rr = rngAt(F.seed, n.i, n.l, n.k, 85);
      const h = rr.float(10, 22);
      const mx = c.x - r * 0.4;
      const mz = c.z + r * 0.2;
      B.add('duct', place(new THREE.CylinderGeometry(0.18, 0.3, h, 5), { x: mx, y: c.y + h / 2, z: mz }));
      B.add('duct', place(new THREE.BoxGeometry(rr.float(2, 5), 0.2, 0.2), { x: mx, y: c.y + h * rr.float(0.7, 0.95), z: mz, ry: n.spin }));
      break;
    }
    case 'booth': {
      // guarita de concreto: uma porta escura, ninguém dentro
      const b = c.clone().add(new THREE.Vector3(-r * 0.45, 0, r * 0.2));
      B.add('block', place(new THREE.BoxGeometry(4, 3.2, 3), { x: b.x, y: b.y + 1.6, z: b.z, ry: n.spin }));
      B.add('dress', place(new THREE.BoxGeometry(5, 0.4, 4), { x: b.x, y: b.y + 3.4, z: b.z, ry: n.spin }));
      break;
    }
    case 'rings': {
      for (let q = 1; q <= 3; q++) {
        B.add('rib', place(new THREE.TorusGeometry(r * 0.2 * q, 0.1, 4, 24), { x: c.x, y: c.y + 0.05, z: c.z, rx: Math.PI / 2 }));
      }
      break;
    }
    default:
      break;
  }
}

// ─── arestas ────────────────────────────────────────────────────────────────

const EDGES = {
  deck(F, B, e) {
    const [s, t] = endpoints(B, e);
    const w = e.width;
    B.add('bridge', slabBetween(s, t, w));
    rails(B, s, t, w);
    // quilha
    const down = new THREE.Vector3(0, -1.6, 0);
    B.add('bridge', cylinderBetween(s.clone().add(down), t.clone().add(down), 0.7, 0.7, 6));
    // costelas ocasionais
    const len = s.distanceTo(t);
    const dir = new THREE.Vector3().subVectors(t, s).normalize();
    for (let d = 6; d < len - 4; d += e.r.float(8, 16)) {
      if (!e.r.chance(0.5)) continue;
      const p = s.clone().addScaledVector(dir, d);
      const rib = new THREE.TorusGeometry(w / 2 + 2.5, 0.25, 5, 24, Math.PI);
      rib.scale(1, e.r.float(1, 1.5), 1);
      rib.rotateY(Math.atan2(dir.x, dir.z));
      rib.translate(p.x, p.y - 0.3, p.z);
      B.add('rib', rib);
    }
  },

  suspended(F, B, e) {
    const [s, t] = endpoints(B, e);
    const len = s.distanceTo(t);
    const sag = Math.min(len * 0.06, 6) * e.r.float(0.5, 1);
    const n = Math.max(4, Math.round(len / 1.7));
    const w = Math.min(e.width, 4);
    const pt = (u) => s.clone().lerp(t, u).add(new THREE.Vector3(0, -sag * 4 * u * (1 - u), 0));
    for (let i = 0; i < n; i++) {
      const a = pt(i / n);
      const b = pt((i + 1) / n);
      B.add('bridge', slabBetween(a, b, w, 0.25));
    }
    // cordas laterais, mais altas nas pontas
    const sd = side(s, t).multiplyScalar(w / 2);
    for (const sgn of [-1, 1]) {
      const o = sd.clone().multiplyScalar(sgn);
      B.add('cable', catenaryCable(s.clone().add(o).add(new THREE.Vector3(0, 1.3, 0)), t.clone().add(o).add(new THREE.Vector3(0, 1.3, 0)), {
        rng: e.r, noise3: F.noise3, radius: 0.12, sag: (sag + 0.5) / Math.max(len, 1), points: 14,
      }));
    }
    // postes nas pontas
    for (const p of [s, t]) {
      for (const sgn of [-1, 1]) {
        const q = p.clone().addScaledVector(sd, sgn);
        B.add('duct', cylinderBetween(q, q.clone().add(new THREE.Vector3(0, 2.2, 0)), 0.2, 0.15, 5));
      }
    }
  },

  tube(F, B, e) {
    const [s, t] = endpoints(B, e);
    const w = Math.max(e.width, 3.6);
    B.add('bridge', slabBetween(s, t, w));
    const R = w / 2 + 1.2;
    const up = new THREE.Vector3(0, R - 1.0, 0);
    B.add('tube', cylinderBetween(s.clone().add(up), t.clone().add(up), R, R, 12, { open: true, heightSegments: Math.max(2, Math.round(s.distanceTo(t) / 4)) }));
    const dir = new THREE.Vector3().subVectors(t, s).normalize();
    const len = s.distanceTo(t);
    for (let d = 3; d < len; d += 6) {
      const p = s.clone().addScaledVector(dir, d).add(up);
      const hoop = new THREE.TorusGeometry(R + 0.1, 0.22, 5, 20);
      hoop.rotateY(Math.atan2(dir.x, dir.z));
      hoop.translate(p.x, p.y, p.z);
      B.add('rib', hoop);
    }
    if (e.r.chance(0.6)) {
      const m = s.clone().lerp(t, 0.5);
      // pendurada do alto dos arcos do túnel
      B.lamp(m.x + B.x0, m.y + B.y0 + R * 1.2, m.z + B.z0, e.r.chance(0.5) ? FLUORO : SODIUM, 30, 'faulty', { to: [m.x + B.x0, m.y + B.y0 + 2 * R - 1.1, m.z + B.z0] });
    }
  },

  ramp(F, B, e) {
    const [s, t] = endpoints(B, e);
    const w = e.width;
    B.add('bridge', slabBetween(s, t, w));
    // meios-fios
    const sd = side(s, t).multiplyScalar(w / 2 - 0.2);
    for (const sgn of [-1, 1]) {
      const o = sd.clone().multiplyScalar(sgn).add(new THREE.Vector3(0, 0.3, 0));
      B.add('bridge', slabBetween(s.clone().add(o), t.clone().add(o), 0.35, 0.6));
    }
    rails(B, s, t, w, 1.1);
    // escoras caindo no vazio
    for (const u of [0.3, 0.7]) {
      const p = s.clone().lerp(t, u).add(new THREE.Vector3(0, -TH, 0));
      B.add('tower', cylinderBetween(p, p.clone().add(new THREE.Vector3(0, -e.r.float(15, 50), 0)), 0.8, 0.1, 6));
    }
  },

  stairs(F, B, e) {
    const [s, t] = endpoints(B, e);
    const w = e.width;
    const dy = t.y - s.y;
    const n = Math.max(2, Math.ceil(Math.abs(dy) / 0.3));
    const flat = new THREE.Vector3(t.x - s.x, 0, t.z - s.z);
    const run = flat.length() / n;
    const dir = flat.normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    for (let i = 0; i < n; i++) {
      const top = s.y + dy * (dy > 0 ? (i + 1) / n : i / n);
      const hStep = Math.abs(dy) / n + 0.5;
      const p = s.clone().addScaledVector(dir, (i + 0.5) * run);
      B.add('bridge', place(new THREE.BoxGeometry(w, hStep, run + 0.03), { x: p.x, y: top - hStep / 2, z: p.z, ry: yaw }));
    }
    // vigas laterais (longarinas)
    const sd = side(s, t).multiplyScalar(w / 2 + 0.2);
    for (const sgn of [-1, 1]) {
      const o = sd.clone().multiplyScalar(sgn).add(new THREE.Vector3(0, 0.4, 0));
      B.add('bridge', slabBetween(s.clone().add(o), t.clone().add(o), 0.4, 1.4));
    }
    rails(B, s, t, w + 0.4, 1.2);
  },

  /** Torre com rampa helicoidal: sobe um nível inteiro girando em volta de uma coluna. */
  spiral(F, B, e) {
    const { a, b, r } = e;
    const w = e.width;
    const Rh = r.float(6.5, 9);
    const Rm = Rh - w / 2;
    const ang = r.float(0, Math.PI * 2);
    const C = { x: a.x + Math.cos(ang) * (a.r + Rh + 1), z: a.z + Math.sin(ang) * (a.r + Rh + 1) };
    const dy = b.y - a.y;
    // coluna central
    const colR = Math.max(1.5, Rh - w - 0.3);
    B.add('tower', cylinderBetween(B.L(C.x, a.y - 30, C.z), B.L(C.x, b.y + 10, C.z), colR, colR * 0.7, 8));
    B.lamp(C.x, b.y + 12, C.z, r.pick(COLORS), 90, 'steady', { to: [C.x + 0.5, b.y + 10, C.z] }); // no topo da coluna

    // ângulos: começa virado para A, termina virado para B, ≥ 1,5 volta
    const thA = Math.atan2(a.z - C.z, a.x - C.x);
    const thB = Math.atan2(b.z - C.z, b.x - C.x);
    const minArc = dy / Math.tan((27 * Math.PI) / 180);
    let delta = (((thB - thA) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    while (Rm * delta < minArc) delta += 2 * Math.PI;
    const steps = Math.ceil(delta / 0.14);
    const at = (th, y) => B.L(C.x + Math.cos(th) * Rm, y, C.z + Math.sin(th) * Rm);
    const railPts = [];
    const railR = [];
    for (let i = 0; i < steps; i++) {
      const t0 = i / steps;
      const t1 = (i + 1) / steps;
      const p0 = at(thA + delta * t0, a.y + dy * t0);
      const p1 = at(thA + delta * t1, a.y + dy * t1);
      B.add('bridge', slabBetween(p0, p1, w, 0.5));
      const outer = B.L(C.x + Math.cos(thA + delta * t0) * (Rh + 0.1), a.y + dy * t0 + 1.1, C.z + Math.sin(thA + delta * t0) * (Rh + 0.1));
      railPts.push(outer);
      railR.push(0.09);
    }
    B.add('bridge', buildTaperedTube(railPts, railR, { radialSegments: 4, smooth: 1 }));

    // conectores: plataforma A → início da hélice; fim da hélice → plataforma B
    const S = at(thA, a.y);
    const dAC = Math.hypot(C.x - a.x, C.z - a.z);
    const ea = B.L(a.x + ((C.x - a.x) / dAC) * (a.r - 0.8), a.y, a.z + ((C.z - a.z) / dAC) * (a.r - 0.8));
    B.add('bridge', slabBetween(ea, S, w));
    const E = at(thA + delta, b.y);
    const toB = Math.hypot(b.x - (E.x + B.x0), b.z - (E.z + B.z0));
    if (toB > b.r) {
      const ux = (b.x - (E.x + B.x0)) / toB;
      const uz = (b.z - (E.z + B.z0)) / toB;
      const eb = B.L(b.x - ux * (b.r - 0.8), b.y, b.z - uz * (b.r - 0.8));
      B.add('bridge', slabBetween(E, eb, w));
      rails(B, E, eb, w);
    }
  },
};

/** Liga a plataforma a uma passarela infinita que passe perto, no mesmo nível. */
function connectToWalkways(F, B, n) {
  const { spacing, ySpacing, module } = WALK;
  const tMid = (t) => Math.floor(t / module) * module + module / 2;
  // passarela ao longo de Z
  if (n.y % ySpacing === 0) {
    const b = n.y / ySpacing;
    const a = Math.round(n.x / spacing);
    const w = F.walkZ(a, b);
    const lx = a * spacing;
    if (w && Math.abs(n.x - lx) < NODE.h * 1.5 && !F.walkGap(a * 7919 + b * 104729, tMid(n.z), w.main, n.y)) {
      const sgn = Math.sign(lx - n.x) || 1;
      if (w.track && -sgn === w.track.side) return; // a ligação cruzaria o trilho do transportador
      const s = B.L(n.x + sgn * (n.r - 0.8), n.y, n.z);
      const t = B.L(lx - sgn * (w.width / 2 - 0.3), n.y, n.z);
      if (Math.abs(t.x - s.x) > 1) {
        B.add('bridge', slabBetween(s, t, 3.5));
        rails(B, s, t, 3.5);
      }
    }
  }
  // passarela ao longo de X
  if ((n.y - ySpacing / 2) % ySpacing === 0) {
    const b = (n.y - ySpacing / 2) / ySpacing;
    const c = Math.round((n.z - spacing / 2) / spacing);
    const w = F.walkX(b, c);
    const lz = c * spacing + spacing / 2;
    if (w && Math.abs(n.z - lz) < NODE.h * 1.5 && !F.walkGap(b * 15485863 + c * 7919 + 17, tMid(n.x), false, n.y)) {
      const sgn = Math.sign(lz - n.z) || 1;
      if (w.track && -sgn === w.track.side) return;
      const s = B.L(n.x, n.y, n.z + sgn * (n.r - 0.8));
      const t = B.L(n.x, n.y, lz - sgn * (w.width / 2 - 0.3));
      if (Math.abs(t.z - s.z) > 1) {
        B.add('bridge', slabBetween(s, t, 3.5));
        rails(B, s, t, 3.5);
      }
    }
  }
}
