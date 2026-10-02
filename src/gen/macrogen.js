// ─────────────────────────────────────────────────────────────────────────────
//  Camada MACRO: células de 1,6 km. Aqui nasce a escala da Cidade.
//
//   galerias   túneis fechados de centenas de metros de seção, sem começo nem fim
//   poços      fossos verticais sem fundo nem boca
//   estratos   pisos infinitos, abertos, com buracos e florestas de colunas
//   treliças   estruturas espaciais de vigas que ocupam regiões inteiras
//   escadarias rampas-escada que sobem e descem para sempre
//   condutos   tubos colossais fechados (22–60 m de raio), com piso interno
//   camadas    lajes intransponíveis de 72 m; só as passagens as perfuram,
//              cada uma com uma torre de elevador colossal
//   feixes     luz caindo por passagens, buracos de estratos, clarabóias e poços
//   anomalias  monólitos e agulhas (raros)
//
//  Paredes e lajes são feitas de PLACAS (MEGA.tile). Uma placa é omitida quando:
//    • seu centro está dentro do vazio de OUTRA galeria/poço (volumes se fundem);
//    • uma passarela infinita a atravessa (a ponte passa por um vão);
//    • raramente, ao acaso (aberturas para fora).
//  Cada placa pertence à célula que contém seu centro → gerada uma única vez.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { MACRO, MEGA, RELIEF, UNIQUE, COLOSSUS } from './field.js';
import { hash4, rngAt } from './hash.js';
import { place, cylinderBetween, slabBetween } from '../world/geometry.js';
import { ChunkBuilder, pieceMemo } from './chunkgen.js';
import { SODIUM, FLUORO, COLD, WELD } from './colors.js';
import { beamGeometry } from './beams.js';
import { villageLayout } from './villages.js';
import { genCascades } from './cascades.js';
import { genFloods } from './floods.js';

const T = MEGA.tile;
const W = MEGA.wall;

export function generateMacro(F, mx, my, mz) {
  const B = new ChunkBuilder(mx * MACRO, my * MACRO, mz * MACRO);
  B.setCuts(F.cutsInBox((mx - 1) * MACRO, (my - 1) * MACRO, (mz - 1) * MACRO, (mx + 2) * MACRO, (my + 2) * MACRO, (mz + 2) * MACRO));
  if (B.cutsL.length) B.memo = pieceMemo(`m:${mx},${my},${mz}`);
  B.size = MACRO;
  const box = {
    x0: mx * MACRO, y0: my * MACRO, z0: mz * MACRO,
    x1: (mx + 1) * MACRO, y1: (my + 1) * MACRO, z1: (mz + 1) * MACRO,
  };
  const owns = (x, y, z) => x >= box.x0 && x < box.x1 && y >= box.y0 && y < box.y1 && z >= box.z0 && z < box.z1;

  genBarriers(F, B, box, owns);
  genBarrierRelief(F, B, box);
  genUniques(F, B, box);
  genHatches(F, B, box);
  genGalleries(F, B, box, owns);
  genShafts(F, B, box, owns);
  genStrata(F, B, box, owns);
  genFrames(F, B, box, owns);
  genStairways(F, B, box);
  genConduits(F, B, box);
  genAnomalies(F, B, box, mx, my, mz);
  genCascades(F, B, box, owns);
  genFloods(F, B, box);
  return B.finish();
}

/** Caixa com centro GLOBAL (cx,cy,cz) e tamanho (sx,sy,sz). */
function block(B, mat, cx, cy, cz, sx, sy, sz) {
  const L = B.L(cx, cy, cz);
  B.add(mat, place(new THREE.BoxGeometry(sx, sy, sz), { x: L.x, y: L.y, z: L.z }));
}

/** Uma passarela infinita atravessa esta placa de parede? (a parede abre um vão) */
function walkwayPierces(F, wallAxis, wallPos, tA0, tA1, y0, y1) {
  return F.walkwayCrossings(wallAxis, wallPos, tA0 - 8, tA1 + 8, y0 - 2, y1 - 8).length > 0;
}

// ─── camadas intransponíveis ────────────────────────────────────────────────

function genBarriers(F, B, box, owns) {
  const th = MEGA.barrierThick;
  const P = MEGA.passage;
  for (const b of F.barriersNear((box.y0 + box.y1) / 2)) {
    const yc = b.top - th / 2;
    if (yc < box.y0 || yc >= box.y1) continue;
    for (let k = Math.floor(box.z0 / T); k * T < box.z1; k++) {
      const zc = (k + 0.5) * T;
      let run = null;
      const flush = () => {
        if (!run) return;
        const len = (run.end - run.start + 1) * T;
        // laje cheia, ou mais fina onde uma trincheira de máquina a escava por baixo
        const t = th - run.depth;
        block(B, 'barrier', run.start * T + len / 2, b.top - t / 2, zc, len, t, T);
        run = null;
      };
      for (let i = Math.floor(box.x0 / T); i * T < box.x1; i++) {
        const xc = (i + 0.5) * T;
        const solid = F.barrierSolid(b, xc - 30, zc - 30) && F.barrierSolid(b, xc + 30, zc + 30) && F.barrierSolid(b, xc, zc);
        if (!solid) {
          flush();
          continue;
        }
        const depth = F.trenchAt(b, xc, zc);
        if (run && run.depth !== depth) flush();
        if (run) run.end = i;
        else run = { start: i, end: i, depth };
        // caixotões por baixo: vigas cruzadas que dão escala ao teto (no fundo da trincheira, se houver)
        const cy = b.bottom + depth - 5;
        block(B, 'barrier', xc, cy, zc - T / 2 + 3, T, 10, 6);
        block(B, 'barrier', xc - T / 2 + 3, cy, zc, 6, 10, T);
        if (depth) {
          // trilhos das máquinas colossais, presos ao teto da trincheira
          const lz = Math.round(zc / P) * P;
          const lx = Math.round(xc / P) * P;
          if (Math.abs(zc - lz) < T && F.ceilingLane(b.n, 'x', lz / P)) block(B, 'frame', xc, cy - 7, lz + Math.sign(zc - lz) * 45, T, 4, 5);
          if (Math.abs(xc - lx) < T && F.ceilingLane(b.n, 'z', lx / P)) block(B, 'frame', lx + Math.sign(xc - lx) * 45, cy - 7, zc, 5, 4, T);
          continue;
        }
        // luminárias penduradas do teto, raras e distantes umas das outras
        if (hash4(F.seed, i, b.n, k, 360) < 0.03) {
          block(B, 'frame', xc, b.bottom - 17, zc, 0.6, 34, 0.6); // da laje (b.bottom) até a luminária
          block(B, 'frame', xc, b.bottom - 34.5, zc, 8, 1.5, 3);
          B.lamp(xc, b.bottom - 36.4, zc, hash4(F.seed, i, b.n, k, 361) < 0.6 ? SODIUM : FLUORO, 1600, hash4(F.seed, i, b.n, k, 362) < 0.2 ? 'faulty' : 'steady', { size: 3, far: true });
        }
      }
      flush();
    }
    // passagens desta célula: torre de elevador colossal + luz caindo
    for (let pi = Math.floor(box.x0 / P); pi * P < box.x1; pi++) {
      for (let pk = Math.floor(box.z0 / P); pk * P < box.z1; pk++) {
        const p = F.passage(b.n, pi, pk);
        if (!p || !owns(p.x, yc, p.z)) continue;
        passageTower(F, B, b, p);
      }
    }
  }
}

// ─── relevo sobre as camadas (visível a quilômetros, como a laje) ───────────

function genBarrierRelief(F, B, box) {
  const C = RELIEF.cell;
  const th = MEGA.barrierThick;
  for (const b of F.barriersNear((box.y0 + box.y1) / 2)) {
    const yc = b.top - th / 2; // mesma posse da laje
    if (yc < box.y0 || yc >= box.y1) continue;
    const y = b.top;
    for (let ci = Math.floor(box.x0 / C); ci * C < box.x1; ci++) {
      for (let ck = Math.floor(box.z0 / C); ck * C < box.z1; ck++) {
        const p = F.barrierRelief(b, ci, ck);
        if (!p) continue;
        const w = p.x1 - p.x0;
        const d = p.z1 - p.z0;
        const cx = (p.x0 + p.x1) / 2;
        const cz = (p.z0 + p.z1) / 2;
        const r = rngAt(F.seed, ci, b.n, ck, 802);
        if (p.kind === 'plinth') {
          block(B, 'barrier', cx, y + p.h / 2, cz, w, p.h, d);
          if (p.step) block(B, 'barrier', cx + r.float(-0.1, 0.1) * w, y + p.h + p.step / 2, cz + r.float(-0.1, 0.1) * d, w * r.float(0.35, 0.6), p.step, d * r.float(0.35, 0.6));
        } else if (p.kind === 'ridge') {
          block(B, 'wall', cx, y + p.h / 2, cz, w, p.h, d);
          // dutos correndo por cima, com suportes
          const alongX = p.axis === 'x';
          const len = alongX ? w : d;
          const wid = alongX ? d : w;
          for (let q = 0; q < p.pipes; q++) {
            const off = ((q + 0.5) / p.pipes - 0.5) * wid * 0.7;
            const rad = r.float(1.2, 3);
            const a = new THREE.Vector3(alongX ? p.x0 : cx + off, y + p.h + rad + 1, alongX ? cz + off : p.z0);
            const e = new THREE.Vector3(alongX ? p.x1 : cx + off, a.y, alongX ? cz + off : p.z1);
            B.add('conduit', cylinderBetween(B.L(a.x, a.y, a.z), B.L(e.x, e.y, e.z), rad, rad, 8));
            for (let t = 8; t < len; t += 24) {
              const sx = alongX ? p.x0 + t : cx + off;
              const sz = alongX ? cz + off : p.z0 + t;
              block(B, 'frame', sx, y + p.h + 0.5, sz, 1.2, 1, 1.2);
            }
          }
        } else if (p.kind === 'hall') {
          block(B, 'floor', cx, y + p.h / 2, cz, w, p.h, d);
          // platibanda e casas de máquinas no telhado
          block(B, 'barrier', cx, y + p.h + 1, cz, w + 2, 2, d + 2);
          for (let q = r.int(0, 3); q > 0; q--) block(B, 'macro', cx + r.float(-0.35, 0.35) * w, y + p.h + 5, cz + r.float(-0.35, 0.35) * d, r.float(8, 18), 8, r.float(8, 18));
          if (r.chance(0.2)) B.lamp(cx + w / 2 + 2, y + 6, cz, FLUORO, r.float(200, 400), 'faulty', { to: [cx + w / 2, y + 6.8, cz], size: 2, far: true });
        } else {
          block(B, 'barrier', cx, y + p.baseH / 2, cz, w, p.baseH, d);
          const L = B.L(cx, y + (p.baseH + p.h) / 2, cz);
          B.add('macro', place(new THREE.CylinderGeometry(p.stackR * 0.85, p.stackR, p.h - p.baseH, 10), { x: L.x, y: L.y, z: L.z }));
          block(B, 'frame', cx, y + p.h - 2, cz, p.stackR * 2.3, 1.2, p.stackR * 2.3);
          if (p.light) B.lamp(cx, y + p.h + 3, cz, SODIUM, r.float(300, 600), 'faulty', { to: [cx + 1, y + p.h, cz], size: 2, far: true });
        }
      }
    }
  }
}

// ─── escotilhas de manutenção (subir nas máquinas colossais) ─────────────────
//  Uma placa da laje falta (Field.hatchAt). Do chão da camada, uma passarela
//  vai da borda até o meio do vão; dali uma escada desce até uma plataforma na
//  altura das longarinas da máquina, logo ao lado de onde ela passa.

function genHatches(F, B, box) {
  const th = MEGA.barrierThick;
  const T = MEGA.tile;
  for (const b of F.barriersNear((box.y0 + box.y1) / 2)) {
    const yc = b.top - th / 2;
    if (yc < box.y0 || yc >= box.y1) continue;
    const cx = (box.x0 + box.x1) / 2;
    const cz = (box.z0 + box.z1) / 2;
    for (const h of F.hatchesNear(b, cx, cz, MACRO)) {
      if (h.x < box.x0 || h.x >= box.x1 || h.z < box.z0 || h.z >= box.z1) continue;
      buildHatch(F, B, b, h, T);
    }
  }
}

function buildHatch(F, B, b, h, T) {
  // (u de lado — a partir da linha da trincheira, no sentido de h.side —, t ao longo)
  const P = (u, t) => (h.axis === 'x' ? [t, h.lat + h.side * u] : [h.lat + h.side * u, t]);
  const box = (mat, u, y, t, du, dy, dt) => {
    const [x, z] = P(u, t);
    const [sx, sz] = h.axis === 'x' ? [dt, du] : [du, dt];
    block(B, mat, x, y, z, sx, dy, sz);
  };
  const top = b.top;
  const deck = b.bottom + COLOSSUS.deck; // topo das longarinas da máquina
  const t = h.t;
  const LAD = 55.3; // a escada (fora do que a máquina varre: ela vai até ±51)
  // passarela: da borda de fora da placa até a escada, com guarda-corpo baixo
  box('grate', (LAD + T) / 2, top - 0.15, t, T - LAD + 0.6, 0.3, 2.2);
  for (const s of [-1, 1]) box('frame', (LAD + T) / 2, top + 0.55, t + s * 1.1, T - LAD, 0.08, 0.08);
  // vigas que seguram a passarela nas bordas do vão (ao longo)
  box('frame', (LAD + T) / 2, top - 0.7, t, T - LAD, 0.8, 0.5);
  // a escada: mastro de trás e a face de degraus (virada para a passarela)
  const H = top + 1.1 - deck;
  box('frame', LAD - 0.35, deck + H / 2, t, 0.35, H, 0.35);
  box('rungs', LAD, deck + H / 2, t, 0.05, H, 0.56);
  for (const s of [-1, 1]) box('rib', LAD, deck + H / 2, t + s * 0.3, 0.07, H, 0.07);
  for (let y = Math.ceil(deck / 6) * 6; y < top; y += 6) box('rib', LAD - 0.2, y, t, 0.36, 0.08, 0.7); // fixações
  // a plataforma lá embaixo, rente às longarinas (a máquina passa a 0,4 m)
  box('grate', 55.7, deck - 0.1, t, 8.6, 0.2, 4);
  for (const s of [-1, 1]) box('frame', 58, deck + 0.5, t + s * 2, 4, 0.08, 0.08);
  // tirantes: a plataforma pendurada do teto da trincheira
  const ceil = b.bottom + COLOSSUS.depth;
  for (const s of [-1, 1]) box('frame', 59.6, (deck + ceil) / 2, t + s * 1.9, 0.18, ceil - deck, 0.18);
  // luzes com energia própria (a manutenção das máquinas não depende do setor)
  const [lx, lz] = P(59, t + 1.8);
  B.lamp(lx, deck + 2.6, lz, [1.0, 0.62, 0.3], 60, 'steady', { to: [lx, ceil, lz], size: 1.2, grid: false }); // pendurada do teto da trincheira
  const [tx, tz] = P(T + 1.5, t + 1.6); // já na laje cheia, depois da borda do vão
  B.lamp(tx, top + 2.4, tz, [1.0, 0.62, 0.3], 40, 'faulty', { to: [tx, top, tz], size: 1.2, grid: false });
}

// ─── estruturas únicas ──────────────────────────────────────────────────────
//  No alto das camadas, no fim das cadeias de pistas. Cada uma tem uma porta
//  (u.door) e, lá dentro, um console que ainda tem energia própria
//  (world/terminals.js, tipo 'unique'). Nada simétrico: peças fora de esquadro.

function genUniques(F, B, box) {
  const th = MEGA.barrierThick;
  const C = UNIQUE.cell;
  for (const b of F.barriersNear((box.y0 + box.y1) / 2)) {
    const yc = b.top - th / 2;
    if (yc < box.y0 || yc >= box.y1) continue;
    for (let i = Math.floor(box.x0 / C) - 1; i <= Math.floor(box.x1 / C); i++) {
      for (let k = Math.floor(box.z0 / C) - 1; k <= Math.floor(box.z1 / C); k++) {
        const u = F.uniqueSite(b.n, i, k);
        if (!u || u.x < box.x0 || u.x >= box.x1 || u.z < box.z0 || u.z >= box.z1) continue;
        buildUnique(F, B, u);
      }
    }
  }
}

/** Frame local de uma única: a porta sempre no lado +a (a,c) → global. */
function uniqueFrame(u) {
  const d = u.door;
  // eixo a aponta para a porta; c é o outro
  const ax = d === 0 ? [1, 0] : d === 1 ? [-1, 0] : d === 2 ? [0, 1] : [0, -1];
  const cx = [-ax[1], ax[0]];
  const ha = d < 2 ? u.hx : u.hz;
  const hc = d < 2 ? u.hz : u.hx;
  const P = (a, c) => [u.x + ax[0] * a + cx[0] * c, u.z + ax[1] * a + cx[1] * c];
  // caixa em coordenadas do frame (centro a,c; meias larguras da, dc)
  const box = (B, mat, a, y, c, da, h, dc) => {
    const [x, z] = P(a, c);
    const sx = Math.abs(ax[0]) * da * 2 + Math.abs(cx[0]) * dc * 2;
    const sz = Math.abs(ax[1]) * da * 2 + Math.abs(cx[1]) * dc * 2;
    block(B, mat, x, y + h / 2, z, sx, h, sz);
  };
  return { u, ha, hc, P, box };
}

/** Parede com porta no lado +a; as outras três inteiras (com alguns desvios). */
function shell(B, f, y, h, T, doorW, doorH, r) {
  const { ha, hc, box } = f;
  box(B, 'wall', -ha + T / 2, y, 0, T / 2, h, hc);
  box(B, 'wall', 0, y, hc - T / 2, ha, h + r.float(-2, 3), T / 2);
  box(B, 'wall', 0, y, -hc + T / 2, ha, h + r.float(-2, 3), T / 2);
  // a frente, com a porta um pouco fora do centro
  const off = f.u.doorOff * hc;
  const l0 = -hc;
  const l1 = off - doorW / 2;
  const r0 = off + doorW / 2;
  box(B, 'wall', ha - T / 2, y, (l0 + l1) / 2, T / 2, h, (l1 - l0) / 2);
  box(B, 'wall', ha - T / 2, y, (r0 + hc) / 2, T / 2, h, (hc - r0) / 2);
  box(B, 'wall', ha - T / 2, y + doorH, off, T / 2, h - doorH, doorW / 2);
  // umbral saliente e um degrau gasto
  box(B, 'frame', ha + 0.6, y + doorH, off, 0.8, 1.4, doorW / 2 + 1.2);
  box(B, 'floor', ha + 2, y, off, 2, 0.35, doorW / 2 + 0.5);
  // uma luminária sobre a porta, presa ao umbral
  const [lx, lz] = f.P(ha + 1.6, off);
  const [mx, mz] = f.P(ha, off); // a face da parede, acima do umbral
  B.lamp(lx, y + doorH + 1.6, lz, FLUORO, 40, 'steady', { to: [mx, y + doorH + 2.2, mz], size: 1.3, grid: false });
  return off;
}

/** As estruturas únicas (casca e conteúdo) não se cortam — o emissor mata, mas não fura (decisão C3). */
function buildUnique(F, B, u) {
  B.protect++;
  try {
    return buildUniqueInner(F, B, u);
  } finally {
    B.protect--;
  }
}

function buildUniqueInner(F, B, u) {
  const r = rngAt(F.seed, Math.round(u.x), u.n, Math.round(u.z), 982);
  const f = uniqueFrame(u);
  const { ha, hc, box, P } = f;
  const y = u.y;
  const T = 3;
  // base: uma laje baixa, um pouco maior que o prédio e torta em relação a ele
  box(B, 'barrier', r.float(-3, 3), y, r.float(-3, 3), ha + r.float(6, 12), 1.2, hc + r.float(6, 12));
  const y0 = y + 1.2;
  let off;
  if (u.kind === 'plant') {
    // a usina: um bloco-núcleo alto, chaminés, dutos; a porta dá num salão baixo
    const hallA = ha * UNIQUE.plantHall;
    const fh = { ...f, ha: hallA, box: (B2, m, a, yy, c, da, h, dc) => box(B2, m, a + ha - hallA, yy, c, da, h, dc) };
    off = shell(B, fh, y0, 12, T, 7, 7, r);
    box(B, 'macro', ha - hallA, y0 + 12, 0, hallA, 1.5, hc);
    const c0 = (T - 2 * hallA) / 2; // o núcleo ocupa o resto, até a parede do fundo do salão
    const cA = (2 * ha - 2 * hallA + T) / 2;
    box(B, 'macro', c0, y0, 0, cA, u.h, hc * 0.85);
    box(B, 'barrier', c0, y0 + u.h, 0, cA + 2, 2, hc * 0.9);
    for (let q = 0; q < 3; q++) {
      const [x, z] = P(c0 + r.float(-0.6, 0.6) * cA, r.float(-0.6, 0.6) * hc);
      const rad = r.float(3.5, 6);
      const hh = r.float(30, 70);
      const L = B.L(x, y0 + u.h + hh / 2, z);
      B.add('macro', place(new THREE.CylinderGeometry(rad * 0.8, rad, hh, 12), { x: L.x, y: L.y, z: L.z }));
      block(B, 'frame', x, y0 + u.h + hh - 3, z, rad * 2.4, 1, rad * 2.4);
    }
    for (let q = 0; q < 3; q++) {
      const c = r.float(-0.7, 0.7) * hc;
      const [ax, az] = P(ha - hallA, c);
      const [bx, bz] = P(-ha * 0.9, c + r.float(-6, 6));
      const hy = y0 + r.float(14, u.h - 4);
      B.add('conduit', cylinderBetween(B.L(ax, hy, az), B.L(bx, hy, bz), 1.6, 1.6, 8));
    }
    // dentro: o salão de controle, painéis contra o núcleo
    box(B, 'machine', ha - 2 * hallA + T + 0.8, y0, 0, 0.8, 4, hc * 0.7);
    const [lx, lz] = P(ha * 0.55, 0);
    B.lamp(lx, y0 + 10, lz, FLUORO, 170, 'steady', { to: [lx, y0 + 12, lz], size: 1.6, grid: false });
  } else if (u.kind === 'archive') {
    // o arquivo: salão comprido, fileiras de estantes altas até perder de vista
    off = shell(B, f, y0, u.h, T, 6, 8, r);
    box(B, 'macro', 0, y0 + u.h, 0, ha + 1, 1.6, hc + 1);
    const rows = Math.floor((hc * 2 - 12) / 7);
    for (let q = 0; q < rows; q++) {
      const c = -hc + 6 + q * 7 + r.float(-0.6, 0.6);
      if (Math.abs(c - off) < 5) continue; // corredor da porta
      const len = ha - 12 - r.float(0, 10);
      const h = r.float(9, u.h - 4);
      box(B, 'frame', r.float(-6, 0), y0, c, len, h, 1.1);
      // prateleiras: tampas horizontais a cada 1,8 m
      for (let yy = 1.4; yy < h; yy += 1.8) box(B, 'machine', r.float(-6, 0), y0 + yy, c, len - r.float(0, 8), 0.12, 1.25);
    }
    for (let q = 0; q < 4; q++) {
      const [x, z] = P(ha * (0.7 - q * 0.45), (u.doorOff + r.float(-0.08, 0.08)) * hc);
      B.lamp(x, y0 + u.h - 6, z, FLUORO, 120, q === 2 ? 'faulty' : 'steady', { to: [x, y0 + u.h, z], size: 1.6, grid: false });
    }
  } else if (u.kind === 'builders') {
    // a sala de controle dos Construtores: um salão baixo, a mesa dos canteiros no meio,
    // monitores mortos em volta (uma mesa só acende: a que ainda fala com eles)
    off = shell(B, f, y0, u.h, T, 7, 6, r);
    box(B, 'macro', 0, y0 + u.h, 0, ha + 1, 1.4, hc + 1);
    box(B, 'machine', -4, y0, 0, 5, 1.1, 8); // a mesa
    box(B, 'frame', -4, y0 + 1.1, 0, 4.6, 0.08, 7.6); // a grade da mesa (o mapa)
    for (let q = 0; q < 7; q++) {
      const a = -4 + Math.cos((q / 7) * Math.PI * 2 + 0.4) * 11;
      const c = Math.sin((q / 7) * Math.PI * 2 + 0.4) * 13;
      box(B, 'machine', a, y0, c, 0.6, 1.6 + r.float(0, 0.8), 1.4);
    }
    for (let q = 0; q < 3; q++) box(B, 'frame', r.float(-0.7, 0.7) * ha, y0, r.float(-0.8, 0.8) * hc, 0.7, u.h, 0.7);
    const [lx, lz] = P(-4, 0);
    B.lamp(lx, y0 + u.h - 4, lz, FLUORO, 90, 'steady', { to: [lx, y0 + u.h, lz], size: 1.6, grid: false });
  } else if (u.kind === 'antenna') {
    // o terminal de transmissão: uma casinha e, atrás dela, um mastro treliçado de 110 m
    off = shell(B, f, y0, u.h, T, 3, 3.2, r);
    box(B, 'macro', 0, y0 + u.h, 0, ha + 1, 1, hc + 1);
    const H = 110 + r.float(-10, 20);
    const mA = -ha - 9; // atrás da casinha
    const legs = [[-5, -5], [5, -5], [5, 5], [-5, 5]];
    for (const [da, dc] of legs) box(B, 'frame', mA + da, y0, dc, 1.3, H, 1.3);
    for (let y = 6; y < H; y += 8) {
      for (let q = 0; q < 4; q++) {
        const [a0, c0] = legs[q];
        const [a1, c1] = legs[(q + 1) % 4];
        const [x0, z0] = P(mA + a0, c0);
        const [x1, z1] = P(mA + a1, c1);
        B.add('frame', cylinderBetween(B.L(x0, y0 + y, z0), B.L(x1, y0 + y + 8, z1), 0.3, 0.3, 4));
      }
    }
    box(B, 'grate', mA, y0 + H, 0, 7, 0.5, 7); // plataforma no topo
    // pratos e antenas (quadros, não curvas: tudo de chapa e cantoneira)
    for (let q = 0; q < 3; q++) box(B, 'machine', mA + r.float(-3, 3), y0 + H - 12 - q * 14, r.float(-3, 3), 5, 5, 0.4);
    box(B, 'frame', mA, y0 + H + 0.2, 0, 0.3, 14, 0.3);
    // a luz de alerta no topo (vermelha, falhando) e a da casinha
    const [tx, tz] = P(mA, 0);
    B.lamp(tx, y0 + H + 15, tz, [0.85, 0.12, 0.05], 700, 'faulty', { to: [tx, y0 + H + 14, tz], size: 1.4, far: true, grid: false });
    const [lx, lz] = P(-2, 0);
    B.lamp(lx, y0 + u.h - 1.4, lz, FLUORO, 30, 'steady', { to: [lx, y0 + u.h, lz], size: 1.1, grid: false });
  } else if (u.kind === 'village') {
    // a vila (fases 5 e 7): escondida dentro de um galpão fechado (existem Safeguards),
    // barracos de chapa encostados, alguns de dois andares, panos sobre os tetos. Metade
    // é habitada: um braseiro aceso no corredor. A disposição é de gen/villages.js (os
    // moradores — world/npcs.js — usam a mesma).
    off = shell(B, f, y0, u.h, T, 4, 4.5, r);
    box(B, 'macro', 0, y0 + u.h, 0, ha + 1, 1.4, hc + 1);
    const L0 = villageLayout(F, u);
    for (const s of L0.shacks) {
      box(B, 'shack', s.a, y0, s.c, s.w, s.h, s.d);
      box(B, 'dress', s.a, y0 + s.h, s.c, s.w + 0.25, 0.12, s.d + 0.25); // o teto de chapa, apoiado nas paredes
      // a porta: uma placa escura na face voltada para o corredor
      const face = Math.sign(off - s.c) || 1;
      box(B, 'door', s.a, y0, s.c + face * (s.d + 0.02), 0.45, 1.9, 0.02);
      // um segundo andar, menor, em pé sobre o teto do de baixo; ou um pano largado no teto
      if (s.upper) box(B, 'shack', s.a + s.ua * s.w, y0 + s.h + 0.12, s.c, s.w * 0.75, 2.4, s.d * 0.75);
      else if (s.cloth) box(B, 'cloth', s.a + s.ca * s.w, y0 + s.h + 0.12, s.c, s.w * 0.7, 0.04, s.d * 0.8);
    }
    // um tanque de água (em pé no chão)
    if (L0.tank) {
      const [tx, tz] = P(L0.tank.a, L0.tank.c);
      const L = B.L(tx, y0 + 1.6, tz);
      B.add('machine', place(new THREE.CylinderGeometry(1.6, 1.7, 3.2, 10), { x: L.x, y: L.y, z: L.z }));
    }
    // habitada: o braseiro — um tambor de chapa no chão, brasa acesa dentro, fumaça
    if (L0.brazier) {
      const [bx, bz] = P(L0.brazier.a, L0.brazier.c);
      const L = B.L(bx, y0 + 0.45, bz);
      B.add('machine', place(new THREE.CylinderGeometry(0.42, 0.36, 0.9, 10, 1, true), { x: L.x, y: L.y, z: L.z }));
      B.light(bx, y0 + 1.1, bz, SODIUM, 9, 'ember', false);
      B.emit({ type: 'steam', x: bx, y: y0 + 1, z: bz, h: 10, rate: 0.1 });
    }
    const [lx, lz] = P(ha * 0.3, off);
    B.lamp(lx, y0 + u.h - 3.5, lz, SODIUM, 45, 'faulty', { to: [lx, y0 + u.h, lz], size: 1, grid: false });
  } else if (u.kind === 'graveyard') {
    // o cemitério de vítimas (fase 5): um pátio murado, sem teto, onde os Safeguards largam
    // os corpos que descartam. Formas embrulhadas, deitadas no chão, em fileiras tortas.
    off = shell(B, f, y0, u.h, T, 5, 4.5, r);
    const [cA, cC] = [ha - 5, off - 3]; // o console (Field.uniqueConsole)
    for (let q = 0; q < 110; q++) {
      const a = r.float(-ha + T + 1.4, ha - T - 1.4);
      const c = r.float(-hc + T + 1.4, hc - T - 1.4);
      if (a > ha - 14 && Math.abs(c - off) < 5) continue; // a entrada
      if (Math.hypot(a - cA, c - cC) < 3) continue;
      const [x, z] = P(a, c);
      const L = B.L(x, y0, z);
      const ry = r.float(0, Math.PI);
      const len = r.float(1.5, 1.85);
      // um corpo embrulhado: um volume só, mais largo nos ombros, deitado (a base no chão)
      const g = new THREE.CylinderGeometry(0.2, 0.26, len, 6);
      g.rotateZ(Math.PI / 2);
      g.scale(1, 0.62, 1);
      g.translate(0, 0.26 * 0.62, 0);
      g.rotateY(ry);
      g.translate(L.x, L.y, L.z);
      B.add('cloth', g);
    }
    // um poste com a única luz, junto da entrada (o pé no chão do pátio)
    const [px, pz] = P(ha - 8, off + 5);
    block(B, 'frame', px, y0 + 3.2, pz, 0.3, 6.4, 0.3);
    B.lamp(px + 0.6, y0 + 5.8, pz, FLUORO, 35, 'faulty', { to: [px, y0 + 6.2, pz], size: 1, grid: false });
  } else if (u.kind === 'cradle') {
    // o berço de Safeguards, lacrado (fase 5; eles saem daqui na fase 6): um bloco alto sem
    // janelas; no lugar da porta, um portão enorme fechado, travado por barras presas aos batentes
    off = u.doorOff * hc;
    box(B, 'macro', 0, y0, 0, ha, u.h, hc);
    box(B, 'barrier', 0, y0 + u.h, 0, ha + 0.5, 1.2, hc + 0.5);
    box(B, 'frame', ha + 0.5, y0, off - 7, 0.5, 19, 0.8); // batentes
    box(B, 'frame', ha + 0.5, y0, off + 7, 0.5, 19, 0.8);
    box(B, 'frame', ha + 0.5, y0 + 19, off, 0.5, 1.4, 7.8); // verga
    box(B, 'door', ha + 0.15, y0, off - 3.1, 0.15, 19, 3.05); // as duas folhas, fechadas
    box(B, 'door', ha + 0.15, y0, off + 3.1, 0.15, 19, 3.05);
    for (const yy of [4, 9.5, 15]) box(B, 'machine', ha + 0.6, y0 + yy, off, 0.3, 0.7, 7.2); // as travas
    // frestas verticais nas outras faces (placas escuras rentes à parede)
    for (let q = 0; q < 6; q++) {
      const a = r.float(-0.8, 0.8) * ha;
      const s = q % 2 ? 1 : -1;
      box(B, 'door', a, y0 + 6, s * (hc + 0.03), 0.35, u.h - 12, 0.03);
    }
    // a luz de alerta sobre o portão: vermelha e fixa, presa à verga
    const [lx, lz] = P(ha + 1.4, off);
    const [mx, mz] = P(ha + 1, off);
    B.lamp(lx, y0 + 21.2, lz, [0.85, 0.12, 0.05], 140, 'steady', { to: [mx, y0 + 20.4, mz], size: 1.2, grid: false });
  } else {
    // o console: um salão quadrado com um pedestal no meio; o teto tem um rasgo
    off = shell(B, f, y0, u.h, T, 6, 7, r);
    const gap = r.float(3, 6);
    box(B, 'macro', gap / 2 + (ha + 1 - gap / 2) / 2 - 0.5, y0 + u.h, 0, (ha + 1 - gap / 2) / 2 + 0.5, 1.6, hc + 1);
    box(B, 'macro', -gap / 2 - (ha + 1 - gap / 2) / 2 + 0.5, y0 + u.h, 0, (ha + 1 - gap / 2) / 2 + 0.5, 1.6, hc + 1);
    box(B, 'floor', 0, y0, 0, 6, 0.6, 6);
    // colunas desalinhadas
    for (let q = 0; q < 4; q++) box(B, 'frame', r.float(-0.7, 0.7) * ha, y0, r.float(-0.7, 0.7) * hc, 0.8, u.h, 0.8);
    const [lx, lz] = P(-(gap / 2 + 1.5), 2.5); // sob o teto, não sob o rasgo
    B.lamp(lx, y0 + 7, lz, FLUORO, 70, 'steady', { to: [lx, y0 + u.h, lz], size: 1.6, grid: false });
  }
  // luz de sinal no telhado, vista de longe (a Cidade ainda sabe que isto existe) —
  // a haste desce até o topo do telhado de cada tipo (o cemitério não tem teto: um mastro)
  const [sx, sz] = P(ha - 4, hc - 4);
  const ROOF = { plant: 13.5 - u.h, antenna: 1, builders: 1.4, village: 1.4, cradle: 1.2, graveyard: 0 };
  const top = y0 + u.h + (ROOF[u.kind] ?? 1.6);
  if (u.kind === 'graveyard') block(B, 'frame', sx, y0 + (u.h + 8) / 2, sz, 0.4, u.h + 8, 0.4);
  B.lamp(sx, top + 2, sz, SODIUM, r.float(500, 900), 'steady', { to: [sx, top, sz], size: 2.5, far: true, grid: false });
  return off;
}

/**
 * As pontes da passagem até a rede (Field.passageLinks): embaixo, um tabuleiro plano do anel
 * de embarque até uma plataforma; em cima, uma rampa da ponte +x (sobre a laje) até uma
 * plataforma 48 m acima — com guarda-corpo, e a rampa apoiada na laje.
 */
function passageLinkBridges(F, B, b, p) {
  const L = F.passageLinks(b, p);
  if (!L.bottom || !L.top) return;
  for (const link of [L.bottom, L.top]) {
    const a = B.L(link.a.x, link.a.y, link.a.z);
    const e = B.L(link.e.x, link.e.y, link.e.z);
    const W = 4;
    B.add('bridge', slabBetween(a, e, W, 0.6));
    // guarda-corpo dos dois lados (montantes a cada ~6 m)
    const v = e.clone().sub(a);
    const len = v.length();
    const side = new THREE.Vector3(-v.z, 0, v.x).normalize().multiplyScalar(W / 2 - 0.15);
    for (const s of [-1, 1]) {
      const o = side.clone().multiplyScalar(s);
      B.add('bridge', cylinderBetween(a.clone().add(o).setY(a.y + 1.0), e.clone().add(o).setY(e.y + 1.0), 0.06, 0.06, 5, { open: true }));
      for (let t = 0; t <= len; t += 6) {
        const q = a.clone().addScaledVector(v, t / len).add(o);
        B.add('frame', cylinderBetween(q, q.clone().setY(q.y + 1.0), 0.05, 0.05, 4));
      }
    }
    // a rampa de cima: pernas até a laje, a cada ~24 m
    if (link === L.top) {
      for (let t = 24; t < len - 6; t += 24) {
        const q = a.clone().addScaledVector(v, t / len);
        const top = q.y - 0.6;
        const floor = b.top - B.y0;
        if (top - floor > 1) B.add('frame', place(new THREE.BoxGeometry(0.6, top - floor, 0.6), { x: q.x, y: floor + (top - floor) / 2, z: q.z }));
      }
    }
  }
}

/** A torre do elevador grande não se corta (sem ela, a travessia entre camadas morre); as pontes até a rede, sim. */
function passageTower(F, B, b, p) {
  passageLinkBridges(F, B, b, p);
  B.protect++;
  try {
    passageTowerInner(F, B, b, p);
  } finally {
    B.protect--;
  }
}

function passageTowerInner(F, B, b, p) {
  const y0 = Math.floor((b.bottom - 150) / 48) * 48 - 0.4; // plataforma de embarque de baixo
  const yTop = b.top + 70;
  const hw = 27; // meia largura do quadro (o carro tem 40 × 40)
  const V = (x, y, z) => B.L(p.x + x, y, p.z + z);
  // quatro pilares de canto e contraventamento em X
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    B.add('frame', place(new THREE.BoxGeometry(4, yTop - y0 + 30, 4), { ...toXYZ(V(sx * hw, (yTop + y0 - 30) / 2, sz * hw)) }));
  }
  for (let y = y0; y < yTop; y += 32) {
    for (const [ax, az, bx, bz] of [[-hw, -hw, hw, -hw], [hw, -hw, hw, hw], [hw, hw, -hw, hw], [-hw, hw, -hw, -hw]]) {
      B.add('frame', cylinderBetween(V(ax, y, az), V(bx, y + 32, bz), 0.7, 0.7, 4));
      B.add('frame', cylinderBetween(V(bx, y, bz), V(ax, y + 32, az), 0.7, 0.7, 4));
    }
  }
  // cabeçote com polias
  B.add('frame', place(new THREE.BoxGeometry(hw * 2 + 14, 8, 10), { ...toXYZ(V(0, yTop + 4, 0)) }));
  B.add('frame', place(new THREE.BoxGeometry(10, 8, hw * 2 + 14), { ...toXYZ(V(0, yTop + 4, 0)) }));
  for (const s of [-1, 1]) B.add('duct', place(new THREE.CylinderGeometry(5, 5, 3, 16), { ...toXYZ(V(s * 12, yTop + 11, 0)), rx: Math.PI / 2 }));
  // plataforma de embarque embaixo: um anel (o carro encaixa no vão do meio)
  for (const [cx, cz, sx, sz] of [[0, -34, 90, 24], [0, 34, 90, 24], [-34, 0, 24, 44], [34, 0, 24, 44]]) {
    B.add('floor', place(new THREE.BoxGeometry(sx, 3, sz), { ...toXYZ(V(cx, y0 - 1.5, cz)) }));
  }
  // em cima: quatro pontes ligando a borda da passagem ao carro
  // (até a primeira placa de laje montada: o vão de verdade em volta do buraco é maior que ele)
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const len = F.passageBridgeEnd(b, p, dx, dz) - 20.5;
    const mid = 20.5 + len / 2;
    B.add('floor', place(new THREE.BoxGeometry(dx ? len : 10, 1.5, dz ? len : 10), { ...toXYZ(V(dx * mid, b.top - 0.75, dz * mid)) }));
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const len = 110;
    const c = V(dx * (35 + len / 2), y0 - 0.6, dz * (35 + len / 2));
    B.add('floor', place(new THREE.BoxGeometry(dx ? len : 10, 1.2, dz ? len : 10), { ...toXYZ(c) }));
  }
  // escada de manutenção (fase 4.6 — travessias difíceis): quando o setor está apagado o
  // elevador para, e a camada só se atravessa subindo ~220 m num mastro ao lado da ponte +z,
  // da plataforma de embarque de baixo até a ponte de cima (um patamar liga os dois)
  {
    const mx = 8.2; // o mastro, logo depois da borda da ponte (que vai até x = 5)
    const mz = 34;
    const yb = y0;
    const yt = b.top + 1.2;
    const h = yt - yb;
    B.add('frame', place(new THREE.BoxGeometry(0.6, h, 0.6), { ...toXYZ(V(mx + 0.4, yb + h / 2, mz)) }));
    B.add('rungs', place(new THREE.BoxGeometry(0.05, h, 0.56), { ...toXYZ(V(mx, yb + h / 2, mz)) }));
    for (const s of [-1, 1]) B.add('rib', place(new THREE.BoxGeometry(0.07, h, 0.07), { ...toXYZ(V(mx, yb + h / 2, mz + s * 0.3)) }));
    for (let y = Math.ceil(yb / 12) * 12; y < yt; y += 12) B.add('rib', place(new THREE.BoxGeometry(0.7, 0.1, 0.4), { ...toXYZ(V(mx + 0.3, y, mz)) }));
    // o patamar de cima: da ponte até a escada, com uma abertura onde o corpo sobe (rente aos
    // degraus) e piso dos dois lados dela — de cima da escada se sai para o lado
    B.add('grate', place(new THREE.BoxGeometry(2.2, 0.3, 4.6), { ...toXYZ(V(5.8, b.top - 0.15, mz)) }));
    for (const s of [-1, 1]) B.add('grate', place(new THREE.BoxGeometry(1.4, 0.3, 1.5), { ...toXYZ(V(7.6, b.top - 0.15, mz + s * 1.55)) }));
    // luzes pequenas ao longo da subida (a manutenção tem energia própria)
    for (let y = yb + 30; y < yt; y += 60) B.lamp(p.x + mx + 0.9, y, p.z + mz + 0.9, SODIUM, 25, 'faulty', { to: [p.x + mx + 0.4, y + 1, p.z + mz], size: 0.9, grid: false }); // presa ao mastro
  }
  B.lamp(p.x + hw - 4, yTop + 2, p.z + hw, SODIUM, 2500, 'steady', { to: [p.x + hw, yTop, p.z + hw], size: 4, far: true }); // no topo do pilar do canto
  B.lamp(p.x + 60, y0 + 8, p.z + 3, FLUORO, 400, 'faulty', { to: [p.x + 60, y0, p.z + 4.5], size: 2, far: true });
  // luz caindo pela passagem, do alto até a plataforma
  B.add('beam', beamGeometry(V(0, b.top + 200, 0), b.top + 200 - y0, 38, 44));
}

function toXYZ(v) {
  return { x: v.x, y: v.y, z: v.z };
}

// ─── galerias ───────────────────────────────────────────────────────────────

function genGalleries(F, B, box, owns) {
  const { galleryY, galleryH } = MEGA;
  const cands = [];
  for (let b = Math.floor((box.y0 - 1400) / galleryY); b <= Math.ceil((box.y1 + 600) / galleryY); b++) {
    for (let c = Math.floor((box.z0 - 1000) / galleryH); c <= Math.ceil((box.z1 + 1000) / galleryH); c++) {
      const g = F.gallery('x', b, c);
      if (g) cands.push(g);
    }
  }
  for (let a = Math.floor((box.x0 - galleryH / 2 - 1000) / galleryH); a <= Math.ceil((box.x1 - galleryH / 2 + 1000) / galleryH); a++) {
    for (let b = Math.floor((box.y0 - galleryY / 2 - 1400) / galleryY); b <= Math.ceil((box.y1 - galleryY / 2 + 600) / galleryY); b++) {
      const g = F.gallery('z', a, b);
      if (g) cands.push(g);
    }
  }
  for (const g of cands) buildGallery(F, B, box, owns, g);
}

function buildGallery(F, B, box, owns, g) {
  // coordenadas no referencial da galeria: t = ao longo do eixo, s = transversal
  const alongX = g.axis === 'x';
  const G = (t, y, s) => (alongX ? [t, y, s] : [s, y, t]);
  const t0 = alongX ? box.x0 : box.z0;
  const t1 = alongX ? box.x1 : box.z1;
  const sMin = g.c - g.w / 2 - W;
  const sMax = g.c + g.w / 2 + W;
  const yMin = g.floor - W;
  const yMax = g.top + (g.roof ? W : 0);
  const [bx0, by0, bz0] = G(t0, yMin, sMin);
  const [bx1, by1, bz1] = G(t1, yMax, sMax);
  // a galeria nem toca esta célula?
  if (Math.max(bx0, bx1) < box.x0 || Math.min(bx0, bx1) >= box.x1) return;
  if (by1 < box.y0 || by0 >= box.y1) return;
  if (Math.max(bz0, bz1) < box.z0 || Math.min(bz0, bz1) >= box.z1) return;

  const size = (t, y, s) => (alongX ? [t, y, s] : [s, y, t]);
  const nS = Math.max(1, Math.round((sMax - sMin) / T));
  const sStep = (sMax - sMin) / nS;
  const span = yMax - yMin;
  const nY = Math.max(1, Math.round(span / T));
  const yStep = span / nY;

  for (let i = Math.floor(t0 / T); i * T < t1; i++) {
    const tc = (i + 0.5) * T;
    // piso e teto
    for (let k = 0; k < nS; k++) {
      const sc = sMin + (k + 0.5) * sStep;
      for (const [yc, on] of [[g.floor - W / 2, true], [g.top + W / 2, g.roof]]) {
        if (!on) continue;
        const [x, y, z] = G(tc, yc, sc);
        if (!owns(x, y, z)) continue;
        if (F.insideVoid(x, y, z, g.id) || F.inBarrier(yc, W)) continue;
        // clarabóia: uma placa do teto falta e a luz desce até o piso
        if (yc > g.floor && k > 0 && k < nS - 1 && hash4(F.seed, i, k, Math.round(g.c), 305) < 0.025) {
          B.add('beam', beamGeometry(B.L(x, g.top + W + 40, z), g.h + W + 40, sStep * 0.42, sStep * 0.5));
          B.light(x, g.top + W / 2, z, COLD, 900, 'steady'); // a própria abertura é a fonte
          continue;
        }
        const [sx, sy, sz] = size(T, W, sStep);
        block(B, 'wall', x, y, z, sx, sy, sz);
      }
    }
    // paredes laterais
    for (const side of [-1, 1]) {
      const sc = g.c + side * (g.w / 2 + W / 2);
      for (let j = 0; j < nY; j++) {
        const yc = yMin + (j + 0.5) * yStep;
        const [x, y, z] = G(tc, yc, sc);
        if (!owns(x, y, z)) continue;
        if (F.insideVoid(x, y, z, g.id) || F.inBarrier(yc, yStep / 2)) continue;
        if (walkwayPierces(F, alongX ? 'z' : 'x', sc, tc - T / 2, tc + T / 2, yc - yStep / 2, yc + yStep / 2)) continue;
        if (hash4(F.seed, i, j, side, 300) < 0.012) continue; // vão aleatório
        const [sx, sy, sz] = size(T, yStep, W);
        block(B, 'wall', x, y, z, sx, sy, sz);
      }
    }
    // luminária colossal pendurada no eixo do teto, a cada ~480 m
    if (g.roof && i % 6 === 0) {
      const [lx, ly, lz] = G(tc, g.top - 30, g.c);
      if (owns(lx, ly, lz)) {
        const warm = hash4(F.seed, i, Math.round(g.c), 3, 304) < 0.4;
        B.lamp(lx, ly - 3.8, lz, warm ? SODIUM : FLUORO, 7000, hash4(F.seed, i, 5, 3, 305) < 0.25 ? 'faulty' : 'steady', { size: 6, far: true });
        const [sx, , sz] = size(40, 1, 12);
        block(B, 'wall', lx, ly, lz, sx, 6, sz); // a carcaça da luminária
        B.add('wall', cylinderBetween(B.L(lx, ly + 3, lz), B.L(lx, g.top, lz), 1.2, 1.2, 4)); // haste
      }
    }
    // luz de trabalho rara lá no alto: alguém ainda constrói aqui
    if (hash4(F.seed, i, Math.round(g.c), 7, 301) < 0.05) {
      const side = hash4(F.seed, i, 1, 7, 302) < 0.5 ? -1 : 1;
      const [x, y, z] = G(tc, g.floor + g.h * (0.3 + 0.6 * hash4(F.seed, i, 2, 7, 303)), g.c + side * (g.w / 2 - 0.8));
      if (owns(x, y, z)) B.light(x, y, z, WELD, 500, 'weld');
    }
  }
}

// ─── poços ──────────────────────────────────────────────────────────────────

function genShafts(F, B, box, owns) {
  const S = MEGA.shaft;
  for (let a = Math.floor((box.x0 - S / 2 - 900) / S); a <= Math.ceil((box.x1 - S / 2 + 900) / S); a++) {
    for (let c = Math.floor((box.z0 - S / 2 - 900) / S); c <= Math.ceil((box.z1 - S / 2 + 900) / S); c++) {
      const s = F.shaft(a, c);
      if (s) buildShaft(F, B, box, owns, s);
    }
  }
}

function buildShaft(F, B, box, owns, s) {
  const hx = s.wx / 2;
  const hz = s.wz / 2;
  if (s.x + hx + W < box.x0 || s.x - hx - W >= box.x1 || s.z + hz + W < box.z0 || s.z - hz - W >= box.z1) return;
  for (let j = Math.floor(box.y0 / T); j * T < box.y1; j++) {
    const yc = (j + 0.5) * T;
    if (F.inBarrier(yc, T / 2)) continue; // o poço termina na camada
    // uma coluna de luz caindo pelo meio do poço, de vez em quando
    if (j % 10 === 0 && hash4(F.seed, j, Math.round(s.x), Math.round(s.z), 313) < 0.2 && owns(s.x, yc, s.z)) {
      B.add('beam', beamGeometry(B.L(s.x, yc + 400, s.z), 800, Math.min(s.wx, s.wz) * 0.18, Math.min(s.wx, s.wz) * 0.26));
    }
    // faces em x = const (atravessam z inteiro, incluindo quinas)
    const nZ = Math.max(1, Math.round((s.wz + 2 * W) / T));
    const zStep = (s.wz + 2 * W) / nZ;
    for (const side of [-1, 1]) {
      const xc = s.x + side * (hx + W / 2);
      for (let k = 0; k < nZ; k++) {
        const zc = s.z - hz - W + (k + 0.5) * zStep;
        if (!owns(xc, yc, zc)) continue;
        if (F.insideVoid(xc, yc, zc, s.id)) continue;
        if (walkwayPierces(F, 'x', xc, zc - zStep / 2, zc + zStep / 2, yc - T / 2, yc + T / 2)) continue;
        block(B, 'wall', xc, yc, zc, W, T, zStep);
      }
    }
    // faces em z = const
    const nX = Math.max(1, Math.round(s.wx / T));
    const xStep = s.wx / nX;
    for (const side of [-1, 1]) {
      const zc = s.z + side * (hz + W / 2);
      for (let k = 0; k < nX; k++) {
        const xc = s.x - hx + (k + 0.5) * xStep;
        if (!owns(xc, yc, zc)) continue;
        if (F.insideVoid(xc, yc, zc, s.id)) continue;
        if (walkwayPierces(F, 'z', zc, xc - xStep / 2, xc + xStep / 2, yc - T / 2, yc + T / 2)) continue;
        block(B, 'wall', xc, yc, zc, xStep, T, W);
      }
    }
    // luzes de sinalização descendo pelo poço, a perder de vista
    if (hash4(F.seed, j, Math.round(s.x), Math.round(s.z), 310) < 0.18) {
      const lx = s.x + (hash4(F.seed, j, 1, 0, 311) - 0.5) * s.wx * 0.8;
      const lz = s.z - hz + 2;
      if (owns(lx, yc, lz)) B.lamp(lx, yc, lz, j % 3 === 0 ? FLUORO : SODIUM, 1200, hash4(F.seed, j, 2, 0, 312) < 0.3 ? 'faulty' : 'steady', { to: [lx, yc + 0.8, s.z - hz], size: 2, far: true });
    }
  }
}

// ─── estratos ───────────────────────────────────────────────────────────────

function genStrata(F, B, box, owns) {
  for (const st of F.strataNear((box.y0 + box.y1) / 2)) {
    const yc = st.top - MEGA.strataThick / 2;
    if (yc < box.y0 || yc >= box.y1) continue;
    const th = MEGA.strataThick;
    // placas em fileiras ao longo de x (trechos contínuos viram uma caixa só)
    for (let k = Math.floor(box.z0 / T); k * T < box.z1; k++) {
      const zc = (k + 0.5) * T;
      let run = null;
      const flush = () => {
        if (!run) return;
        const len = (run.end - run.start + 1) * T;
        block(B, 'floor', run.start * T + len / 2, yc, zc, len, th, T);
        run = null;
      };
      for (let i = Math.floor(box.x0 / T); i * T < box.x1; i++) {
        const xc = (i + 0.5) * T;
        if (F.strataSolid(st, xc, zc)) {
          if (run) run.end = i;
          else run = { start: i, end: i };
        } else {
          flush();
          // a luz desce pelo buraco
          if (hash4(F.seed, i, st.s, k, 325) < 0.05 && !F.insideVoid(xc, st.top - 5, zc)) {
            B.add('beam', beamGeometry(B.L(xc, st.top + 60, zc), 520, 30, 40));
          }
        }
      }
      flush();
    }
    // floresta de colunas (sala hipostila sem paredes)
    const C = 240;
    for (let ci = Math.floor(box.x0 / C); ci * C < box.x1; ci++) {
      for (let ck = Math.floor(box.z0 / C); ck * C < box.z1; ck++) {
        const r = rngAt(F.seed, ci, st.s, ck, 320);
        if (!r.chance(st.colProb)) continue;
        const x = (ci + r.float(0.3, 0.7)) * C;
        const z = (ck + r.float(0.3, 0.7)) * C;
        if (!F.strataSolid(st, x, z) || F.insideVoid(x, st.top + 50, z)) continue;
        const side = r.float(20, 52);
        const h = r.float(260, 1100);
        block(B, 'wall', x, st.top + h / 2, z, side, h, side);
        block(B, 'wall', x, st.top + h + 6, z, side * 1.6, 12, side * 1.6); // capitel
        block(B, 'floor', x, st.top + 3, z, side * 1.4, 6, side * 1.4); // base
        if (r.chance(0.3)) B.lamp(x + side / 2 + 2.5, st.top + 30, z, SODIUM, 1500, 'steady', { to: [x + side / 2, st.top + 31, z], size: 2, far: true });
      }
    }
  }
}

// ─── treliça espacial ───────────────────────────────────────────────────────

function genFrames(F, B, box, owns) {
  const S = MEGA.frame;
  // amostra rápida: se nada da célula está na zona, pula
  if (!F.frameCell(Math.round(box.x0 / MACRO), Math.round(box.y0 / MACRO), Math.round(box.z0 / MACRO))) return;

  const i0 = Math.ceil(box.x0 / S);
  const i1 = Math.ceil(box.x1 / S) - 1;
  const j0 = Math.ceil(box.y0 / S);
  const j1 = Math.ceil(box.y1 / S) - 1;
  const k0 = Math.ceil(box.z0 / S);
  const k1 = Math.ceil(box.z1 / S) - 1;
  const inZone = (x, y, z) => F.frameZone(x, y, z) && F.isOpenBiome(x, y, z) && !F.insideVoid(x, y, z) && !F.inBarrier(y, 20);
  // vigas não podem atravessar passarelas (o caminho continua livre)
  const clearOf = (x, y, z, hy, R) => !F.walkwayNear(x, y - hy - 6, y + hy + 3, z, R);

  for (let i = i0; i <= i1; i++) {
    for (let j = j0; j <= j1; j++) {
      for (let k = k0; k <= k1; k++) {
        const x = i * S;
        const y = j * S;
        const z = k * S;
        if (!inZone(x, y, z)) continue;
        let joints = 0;
        // vigas saindo deste nó nos sentidos +x, +y, +z
        const tx = F.frameBeam('x', j, k, i);
        if (tx && inZone(x + S / 2, y, z) && clearOf(x + S / 2, y, z, tx / 2, S / 2 + 8)) {
          block(B, 'frame', x + S / 2, y, z, S, tx, tx);
          joints++;
        }
        const ty = F.frameBeam('y', i, k, j);
        // as colunas podem entrar na laje de uma camada: é onde a treliça se prende
        const colZone = F.frameZone(x, y + S / 2, z) && F.isOpenBiome(x, y + S / 2, z) && !F.insideVoid(x, y + S / 2, z);
        if (ty && colZone && clearOf(x, y + S / 2, z, S / 2, ty / 2 + 8)) {
          block(B, 'frame', x, y + S / 2, z, ty, S, ty);
          joints++;
        }
        const tz = F.frameBeam('z', i, j, k);
        if (tz && inZone(x, y, z + S / 2) && clearOf(x, y, z + S / 2, tz / 2, tz / 2 + 8)) {
          block(B, 'frame', x, y, z + S / 2, tz, tz, S);
          joints++;
        }
        if (joints && clearOf(x, y, z, 15, 20)) {
          const n = 16 + hash4(F.seed, i, j, k, 330) * 14;
          block(B, 'wall', x, y, z, n, n, n);
          if (hash4(F.seed, i, j, k, 331) < 0.06) B.lamp(x, y + n / 2 + 3, z, hash4(F.seed, i, j, k, 332) < 0.5 ? SODIUM : COLD, 1200, 'faulty', { to: [x + 1, y + n / 2, z], size: 2, far: true });
        }
      }
    }
  }
}

// ─── escadarias infinitas (a rampa estrutural; os degraus vêm no chunk) ─────

function genStairways(F, B, box) {
  for (const e of F.stairwaysIn(box.x0, box.y0, box.z0, box.x1, box.y1, box.z1)) {
    const alongX = e.axis === 'x';
    const ta = alongX ? box.x0 : box.z0;
    const tb = alongX ? box.x1 : box.z1;
    // intervalo de t em que a escada está dentro da faixa de altura da célula
    const k = e.dir * MEGA.stairSlope;
    let lo = (box.y0 - e.y0) / k;
    let hi = (box.y1 - e.y0) / k;
    if (lo > hi) [lo, hi] = [hi, lo];
    const s0 = Math.max(ta, lo);
    const s1 = Math.min(tb, hi);
    if (s1 - s0 < 1) continue;
    const lat = e.lat;
    if (lat < (alongX ? box.z0 : box.x0) || lat >= (alongX ? box.z1 : box.x1)) continue; // dono: célula que contém a linha
    const P = (t, dy = 0, dl = 0) => B.L(...(alongX ? [t, F.stairY(e, t) + dy, lat + dl] : [lat + dl, F.stairY(e, t) + dy, t]));
    // trechos fora das camadas (a escada é interrompida pelo concreto)
    const pieces = [];
    let pa = null;
    const step = 8;
    for (let t = s0; t <= s1; t += step) {
      const ok = !F.inBarrier(F.stairY(e, t), 6);
      if (ok && pa === null) pa = t;
      if ((!ok || t + step > s1) && pa !== null) {
        pieces.push([pa, ok ? s1 : t]);
        pa = null;
      }
    }
    for (const [a, b] of pieces) {
      if (b - a < 2) continue;
      // em trechos de até 48 m, cada um uma peça: o corte do emissor (gen/cut.js) só passa
      // pelo trecho que atinge (uma rampa inteira, ~20 mil triângulos, custava ~180 ms de CSG)
      const n = Math.ceil((b - a) / 48);
      for (let q = 0; q < n; q++) {
        const ta = a + ((b - a) * q) / n;
        const tb = a + ((b - a) * (q + 1)) / n;
        // corpo da rampa (topo 0,3 m abaixo da linha dos degraus)
        B.add('stairway', slabBetween(P(ta, -0.3), P(tb, -0.3), e.width, 10));
        // parapeitos
        for (const sgn of [-1, 1]) {
          const dl = sgn * (e.width / 2 + 1);
          B.add('stairway', slabBetween(P(ta, 3.2, dl), P(tb, 3.2, dl), 2, 4.5));
        }
      }
    }
    // pilares que descem para o nada
    for (let t = Math.ceil(s0 / 160) * 160; t < s1; t += 160) {
      const h = 120 + hash4(F.seed, Math.round(t), 0, Math.round(lat), 340) * 380;
      const top = P(t, -10);
      B.add('wall', place(new THREE.BoxGeometry(10, h, 10), { x: top.x, y: top.y - h / 2, z: top.z }));
    }
  }
}

// ─── condutos ───────────────────────────────────────────────────────────────

function genConduits(F, B, box) {
  const seen = new Set();
  const cands = [];
  for (const x of [box.x0, (box.x0 + box.x1) / 2, box.x1]) {
    for (const y of [box.y0, (box.y0 + box.y1) / 2, box.y1]) {
      for (const z of [box.z0, (box.z0 + box.z1) / 2, box.z1]) {
        for (const c of F.conduitsNear(x, y, z)) {
          if (!seen.has(c.id)) {
            seen.add(c.id);
            cands.push(c);
          }
        }
      }
    }
  }
  for (const c of cands) {
    const alongX = c.axis === 'x';
    // dono: a célula que contém a linha central (y, lateral)
    if (c.y < box.y0 || c.y >= box.y1) continue;
    const [l0, l1] = alongX ? [box.z0, box.z1] : [box.x0, box.x1];
    if (c.lat < l0 || c.lat >= l1) continue;
    const [t0, t1] = alongX ? [box.x0, box.x1] : [box.z0, box.z1];
    const G = (t, dy = 0, dl = 0) => (alongX ? [t, c.y + dy, c.lat + dl] : [c.lat + dl, c.y + dy, t]);
    const P = (t, dy, dl) => B.L(...G(t, dy, dl));
    const halfFloor = Math.sqrt(Math.max(0, c.R * c.R - (c.floor - c.y) ** 2)) - 0.5;
    for (let t = Math.floor(t0 / T) * T; t < t1; t += T) {
      const mid = G(t + T / 2);
      if (F.insideVoid(mid[0], mid[1], mid[2], c.id)) continue; // funde-se com galerias/poços
      if (F.inBarrier(c.y, c.R)) continue;
      // casca
      B.add('conduit', cylinderBetween(P(t), P(t + T), c.R, c.R, 28, { open: true, heightSegments: 4 }));
      // anel estrutural
      const ring = new THREE.TorusGeometry(c.R + 0.8, 2.2, 6, 32);
      if (alongX) ring.rotateY(Math.PI / 2);
      const q = P(t);
      ring.translate(q.x, q.y, q.z);
      B.add('frame', ring);
      // piso interno (andável, alinhado aos níveis da rede)
      const f = B.L(...G(t + T / 2, c.floor - c.y - 1.5));
      B.add('conduit', place(new THREE.BoxGeometry(alongX ? T + 0.05 : halfFloor * 2, 3, alongX ? halfFloor * 2 : T + 0.05), { x: f.x, y: f.y, z: f.z }));
      // tiras de luz a cada 160 m
      if (Math.round(t / T) % 2 === 0) {
        const [lx, ly, lz] = G(t + T / 2, c.R * 0.75);
        const [tx, ty, tz] = G(t + T / 2, c.R);
        B.lamp(lx, ly, lz, hash4(F.seed, Math.round(t), 0, 0, 350) < 0.5 ? FLUORO : COLD, 1000, hash4(F.seed, Math.round(t), 1, 0, 351) < 0.2 ? 'faulty' : 'steady', { to: [tx, ty, tz], size: 1.5, far: true });
      }
    }
  }
}

// ─── anomalias (raras) ──────────────────────────────────────────────────────

function genAnomalies(F, B, box, mx, my, mz) {
  const r = rngAt(F.seed, mx, my, mz, 70);
  if (!r.chance(0.22)) return;
  const g = [box.x0 + r.float(200, MACRO - 200), box.y0 + r.float(200, MACRO - 200), box.z0 + r.float(200, MACRO - 200)];
  if (F.insideVoid(g[0], g[1], g[2]) || !F.isOpenBiome(g[0], g[1], g[2])) return;
  // de pé entre duas camadas: da laje de baixo até o teto da de cima (nada solto no ar)
  const bs = F.barriersNear(g[1]);
  const below = bs.filter((b) => b.top <= g[1]).sort((a, b) => b.top - a.top)[0];
  const above = bs.filter((b) => b.bottom > g[1]).sort((a, b) => a.bottom - b.bottom)[0];
  if (!below || !above) return;
  const y0 = below.top;
  const y1 = above.bottom;
  // só nascem na célula macro que contém o meio (uma vez só)
  const ym = (y0 + y1) / 2;
  if (ym < box.y0 || ym >= box.y1) return;
  if (!F.barrierSolid(below, g[0], g[2]) || !F.barrierSolid(above, g[0], g[2])) return;
  const kind = r.pick(['monolith', 'needle']);
  const ext = 200;
  if (F.reservedHit(g[0] - ext, y0, g[2] - ext, g[0] + ext, y1, g[2] + ext)) return;
  ANOMALIES[kind](B, B.L(g[0], ym, g[2]), r, [g[0], ym, g[2]], y1 - y0);
}

const ANOMALIES = {
  /** Monólito: laje de quilômetros, de pé da camada de baixo ao teto da de cima. */
  monolith(B, o, r, g, H) {
    const w = r.float(60, 170);
    const d = r.float(18, 40);
    B.add('macro', place(new THREE.BoxGeometry(w, H + 4, d, 6, 50, 2), { x: o.x, y: o.y, z: o.z, ry: r.float(0, Math.PI) }));
  },

  /** Agulha: uma torre da laje de uma camada ao teto da outra. */
  needle(B, o, r, g, H) {
    const R = r.float(40, 90);
    const h = H + 4;
    const a = o.clone().add(new THREE.Vector3(r.float(-40, 40), -h / 2, r.float(-40, 40)));
    const b = o.clone().add(new THREE.Vector3(r.float(-40, 40), h / 2, r.float(-40, 40)));
    B.add('macro', cylinderBetween(a, b, R * r.float(0.6, 1), R * r.float(0.2, 0.6), 4, { heightSegments: 60 }));
    for (let i = 0; i < 6; i++) {
      const p = a.clone().lerp(b, r.float(0.1, 0.9));
      const s = R * r.float(1.6, 2.6);
      B.add('wall', place(new THREE.BoxGeometry(s, r.float(8, 20), s), { x: p.x, y: p.y, z: p.z }));
    }
    const mid = a.clone().lerp(b, 0.5);
    const gx = mid.x + B.x0;
    const gy = mid.y + B.y0;
    const gz = mid.z + B.z0;
    B.lamp(gx + R + 4, gy, gz, SODIUM, r.float(500, 1000), 'faulty', { to: [gx, gy + 1, gz], size: 4, far: true });
  },
};
