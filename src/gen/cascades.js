// ─────────────────────────────────────────────────────────────────────────────
//  Cascatas: canos rompidos nas paredes de poços e galerias, jorrando água que
//  cai centenas de metros. As posições vêm do Field (shaftCascade /
//  galleryCascade); aqui só a geometria:
//
//    cano    um toco de conduto atravessando a zona das sacadas, boca aberta
//    jato    tubo que segue a parábola da água (≈2,4 s) e depois cai a prumo,
//            alargando conforme a queda (a água se abre em spray)
//    base    poça no chão + vapor/névoa subindo; ou nada — a água que cai no
//            abismo se desfaz em névoa antes de chegar a qualquer lugar
//
//  Como nos feixes de luz, a coordenada "ao longo da queda" vai em normal.y
//  (o shader usa para o degradê). Nas cascatas que terminam numa poça ela vai
//  só até 0,55 — abaixo do ponto em que o shader começa a desfazer a água.
//  O rework gráfico (segunda rodada): a coluna em três camadas — o miolo, a
//  cortina e o spray, cada vez mais largas (a camada no comprimento de
//  normal.xz) —; no pé, a espuma (um anel baixo de água revolta) e a poça com
//  as ondas (a posição em relação ao centro em normal.xz, o raio em normal.y —
//  shaders/materials.js); mais vapor subindo da base.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { MEGA } from './field.js';
import { cylinderBetween, place } from '../world/geometry.js';

const SIDES = 14; // (de perto, com 8 as camadas de fora mostravam as faces)
const G = 9.8;

export function genCascades(F, B, box, owns) {
  const list = [];
  // poços que tocam a célula
  const S = MEGA.shaft;
  for (let a = Math.floor((box.x0 - S / 2 - 900) / S); a <= Math.ceil((box.x1 - S / 2 + 900) / S); a++) {
    for (let c = Math.floor((box.z0 - S / 2 - 900) / S); c <= Math.ceil((box.z1 - S / 2 + 900) / S); c++) {
      const s = F.shaft(a, c);
      if (!s) continue;
      for (let k = Math.floor(box.y0 / 480) - 1; k <= Math.ceil(box.y1 / 480); k++) {
        const w = F.shaftCascade(s, k);
        if (w) list.push(w);
      }
    }
  }
  // galerias que tocam a célula (a vizinhança do centro cobre a célula de 1,6 km)
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  const seen = new Set();
  for (const dy of [-800, 0, 800]) {
    for (const g of F.galleriesNear(cx, cy + dy, cz)) {
      if (seen.has(g.id)) continue;
      seen.add(g.id);
      const [t0, t1] = g.axis === 'x' ? [box.x0, box.x1] : [box.z0, box.z1];
      for (let n = Math.floor(t0 / 900) - 1; n <= Math.ceil(t1 / 900); n++) {
        const w = F.galleryCascade(g, n);
        if (w) list.push(w);
      }
    }
  }
  // cada cascata pertence à célula que contém a boca do cano
  for (const w of list) if (owns(w.out.x, w.out.y, w.out.z)) buildCascade(F, B, w);
}

function buildCascade(F, B, w) {
  const V = (p) => B.L(p.x, p.y, p.z);
  const nx = w.nx;
  const nz = w.nz;
  const r0 = w.width / 2;

  // ── o cano: atravessa a parede e as sacadas, boca rasgada ──
  const pr = r0 + 1.2;
  const inWall = { x: w.wall.x - nx * 4, y: w.wall.y, z: w.wall.z - nz * 4 };
  B.add('conduit', cylinderBetween(V(inWall), V(w.out), pr, pr, 12, { open: true }));
  const flange = new THREE.TorusGeometry(pr + 0.4, 0.6, 6, 16);
  if (nx !== 0) flange.rotateY(Math.PI / 2);
  const mid = V({ x: (w.wall.x + w.out.x) / 2, y: w.wall.y, z: (w.wall.z + w.out.z) / 2 });
  flange.translate(mid.x, mid.y, mid.z);
  B.add('frame', flange);
  // suportes descendo até a parede
  const sup = V({ x: w.out.x - nx * 2, y: w.out.y - pr, z: w.out.z - nz * 2 });
  const supW = V({ x: w.wall.x, y: w.out.y - pr - 9, z: w.wall.z });
  B.add('frame', cylinderBetween(sup, supW, 0.35, 0.35, 4));

  // ── o caminho da água: parábola, depois a prumo ──
  const col = F.cascadeColumn(w);
  const path = [];
  const N_ARC = 12;
  for (let i = 0; i <= N_ARC; i++) {
    const t = (i / N_ARC) * col.ta;
    path.push({ x: w.out.x + nx * w.v * t, y: w.out.y - 0.5 * G * t * t, z: w.out.z + nz * w.v * t });
  }
  const yStart = path[path.length - 1].y;
  const drop = yStart - w.bottom;
  const steps = Math.max(2, Math.ceil(drop / 40));
  for (let i = 1; i <= steps; i++) path.push({ x: col.x, y: yStart - (drop * i) / steps, z: col.z });

  // comprimento acumulado (para o degradê e para o alargamento)
  const acc = [0];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    acc.push(acc[i - 1] + Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z));
  }
  const total = acc[acc.length - 1];
  const alongMax = w.ends === 'pool' ? 0.55 : 1;

  // as três camadas: o miolo, a cortina (mais larga) e o spray (o mais largo, mais rasgado)
  const LAYERS = [
    { k: 1, w: 1.0 },
    { k: 2, w: 1.35 },
    { k: 3, w: 1.9 },
  ];
  const pos = [];
  const nor = [];
  const idx = [];
  for (const Ly of LAYERS) {
    const base = pos.length / 3;
    for (let i = 0; i < path.length; i++) {
      const s = acc[i] / total;
      const r = r0 * Ly.w * (0.55 + 0.45 * Math.min(1, acc[i] / 30)) * (1 + 1.6 * s); // sai do cano fino, abre na queda
      const p = V(path[i]);
      for (let j = 0; j < SIDES; j++) {
        const a = (j / SIDES) * Math.PI * 2 + Ly.k * 0.4;
        const cx = Math.cos(a);
        const cz = Math.sin(a);
        pos.push(p.x + cx * r, p.y, p.z + cz * r);
        nor.push(cx * Ly.k, s * alongMax, cz * Ly.k);
      }
    }
    for (let i = 0; i < path.length - 1; i++) {
      for (let j = 0; j < SIDES; j++) {
        const a = base + i * SIDES + j;
        const b = base + i * SIDES + ((j + 1) % SIDES);
        const c = a + SIDES;
        const d = b + SIDES;
        idx.push(a, c, b, b, c, d);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  B.add('cascade', g);

  // ── a base ──
  const rb = r0 * (1 + 1.6 * alongMax);
  if (w.ends === 'mist') {
    // a que cai no abismo: no fim, a água desfeita em borrifo (a nuvem que fica onde a coluna some)
    const yEnd = w.bottom + 0.38 * (yStart - w.bottom);
    for (let q = 0; q < 8; q++) {
      const a = (q / 8) * Math.PI * 2;
      B.emit({ type: 'steam', x: col.x + Math.cos(a) * rb, y: yEnd, z: col.z + Math.sin(a) * rb, rate: 0.14, h: 30 + (q % 3) * 10 });
    }
  }
  if (w.ends === 'pool') {
    // a poça: um disco (o centro e o anel), a posição em relação ao centro em normal.xz e o raio em normal.y
    const R = rb * 3 + 5;
    const pb = V({ x: col.x, y: w.bottom + 0.06, z: col.z });
    const pp = [pb.x, pb.y, pb.z];
    const pn = [0, 1 + R / 100, 0];
    const pi = [];
    const NR = 48;
    for (let j = 0; j < NR; j++) {
      const a = (j / NR) * Math.PI * 2;
      pp.push(pb.x + Math.cos(a) * R, pb.y, pb.z + Math.sin(a) * R);
      pn.push(Math.cos(a), 1 + R / 100, Math.sin(a));
      pi.push(0, 1 + ((j + 1) % NR), 1 + j);
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.setAttribute('normal', new THREE.Float32BufferAttribute(pn, 3));
    pg.setIndex(pi);
    B.add('pool', pg);
    // a espuma: anéis baixos de água revolta em volta de onde a água bate (a altura em normal.y)
    const fp = [];
    const fn = [];
    const fi = [];
    const FH = 5 + rb * 1.6;
    const FS = 24;
    for (const [k, rr] of [[1, 1.1], [2, 1.7], [3, 2.5]]) {
      const base = fp.length / 3;
      for (let i = 0; i <= 4; i++) {
        const h = i / 4;
        const r = rb * rr * (1 + 0.35 * h);
        for (let j = 0; j < FS; j++) {
          const a = (j / FS) * Math.PI * 2 + k;
          fp.push(pb.x + Math.cos(a) * r, pb.y + h * FH * (1.2 - 0.25 * k), pb.z + Math.sin(a) * r);
          fn.push(Math.cos(a) * k, h, Math.sin(a) * k);
        }
      }
      for (let i = 0; i < 4; i++) {
        for (let j = 0; j < FS; j++) {
          const a = base + i * FS + j;
          const b = base + i * FS + ((j + 1) % FS);
          fi.push(a, a + FS, b, b, a + FS, b + FS);
        }
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(fp, 3));
    fg.setAttribute('normal', new THREE.Float32BufferAttribute(fn, 3));
    fg.setIndex(fi);
    B.add('cascadeFoam', fg);
    // o vapor: a nuvem de borrifo subindo da base
    for (let q = 0; q < 10; q++) {
      const a = (q / 10) * Math.PI * 2;
      const rr = rb * (0.8 + (q % 3) * 0.6);
      B.emit({ type: 'steam', x: col.x + Math.cos(a) * rr, y: w.bottom + 0.5, z: col.z + Math.sin(a) * rr, rate: 0.16, h: 18 + (q % 4) * 6 });
    }
  }
}
