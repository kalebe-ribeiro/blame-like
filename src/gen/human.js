// ─────────────────────────────────────────────────────────────────────────────
//  ESCALA HUMANA, ACRÉSCIMO E VESTÍGIOS (roda no worker, só no LOD 0).
//
//  O espanto do Blame! vem do contraste: uma escada de marinheiro, uma porta de
//  serviço, um corrimão colados numa parede de dois quilômetros. Este módulo
//  espalha essas coisas por todas as faces das megaestruturas (galerias, poços,
//  blocos do maciço) e pelas superfícies grandes (pisos de galeria, estratos,
//  camadas).
//
//   escadas     de marinheiro, contínuas, com patamar a cada 48 m (escaláveis)
//   passadiços  de grade vazada, estreitos, com guarda-corpo e mãos-francesas
//   portas      de serviço (sem nada atrás), placas, caixas elétricas, tubos
//   acréscimos  módulos "parasitas" crescendo das paredes, fora do esquadro
//   cabos       rios de dezenas de cabos pendurados ao longo das paredes
//   desabamento entulho, lajes caídas escoradas nas paredes
//   vestígios   assentamentos abandonados: barracos, varais, fogueira apagada,
//               terminal quebrado, pichações, barris
//   emissores   gotas caindo e vapor subindo (animados na thread principal)
//
//  Tudo é determinístico e contínuo entre chunks: cada elemento pertence ao
//  chunk que contém sua âncora.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { MEGA } from './field.js';
import { hash4, rngAt } from './hash.js';
import { place, cylinderBetween, buildTaperedTube } from '../world/geometry.js';
import { SODIUM, FLUORO, WARN } from './colors.js';

const W = MEGA.wall;
const LEVEL = 48;
const INF = 1e12;

export function genHuman(F, B, box) {
  const faces = megaFaces(F, box);
  for (const face of faces) dressFace(F, B, box, face);
  genSurfaces(F, B, box);
}

// ─── faces das megaestruturas ───────────────────────────────────────────────

/**
 * Faces verticais de paredes colossais cujo plano cai neste chunk.
 * face = { id, along: 'x'|'z', pos, out: ±1, t0, t1, y0, y1, owner, density }
 *   along: direção do comprimento da parede · pos: coordenada do plano
 *   out: sentido para o lado aberto (onde ficam os detalhes)
 */
function megaFaces(F, box) {
  const faces = [];
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  for (const g of F.galleriesNear(cx, cy, cz)) {
    for (const side of [-1, 1]) {
      faces.push({ id: `${g.id}i${side}`, along: g.axis, pos: g.c + (side * g.w) / 2, out: -side, t0: -INF, t1: INF, y0: g.floor, y1: g.top, owner: g.id, density: 1 });
      faces.push({ id: `${g.id}o${side}`, along: g.axis, pos: g.c + side * (g.w / 2 + W), out: side, t0: -INF, t1: INF, y0: g.floor - W, y1: g.top + (g.roof ? W : 0), owner: g.id, density: 0.55 });
    }
  }
  for (const s of F.shaftsNear(cx, cz)) {
    const hx = s.wx / 2;
    const hz = s.wz / 2;
    for (const side of [-1, 1]) {
      faces.push({ id: `${s.id}zi${side}`, along: 'x', pos: s.z + side * hz, out: -side, t0: s.x - hx, t1: s.x + hx, y0: -INF, y1: INF, owner: s.id, density: 1 });
      faces.push({ id: `${s.id}xi${side}`, along: 'z', pos: s.x + side * hx, out: -side, t0: s.z - hz, t1: s.z + hz, y0: -INF, y1: INF, owner: s.id, density: 1 });
      faces.push({ id: `${s.id}zo${side}`, along: 'x', pos: s.z + side * (hz + W), out: side, t0: s.x - hx - W, t1: s.x + hx + W, y0: -INF, y1: INF, owner: s.id, density: 0.5 });
      faces.push({ id: `${s.id}xo${side}`, along: 'z', pos: s.x + side * (hx + W), out: side, t0: s.z - hz - W, t1: s.z + hz + W, y0: -INF, y1: INF, owner: s.id, density: 0.5 });
    }
  }
  const blk = F.massifBlock(Math.round(box.x0 / 192), Math.round(box.y0 / 192), Math.round(box.z0 / 192));
  if (blk) {
    const m = { owner: 'M', y0: blk.y0, y1: blk.y1, density: 0.8 };
    faces.push({ ...m, id: `M${blk.x0}x0`, along: 'z', pos: blk.x0, out: -1, t0: blk.z0, t1: blk.z1 });
    faces.push({ ...m, id: `M${blk.x1}x1`, along: 'z', pos: blk.x1, out: 1, t0: blk.z0, t1: blk.z1 });
    faces.push({ ...m, id: `M${blk.z0}z0`, along: 'x', pos: blk.z0, out: -1, t0: blk.x0, t1: blk.x1 });
    faces.push({ ...m, id: `M${blk.z1}z1`, along: 'x', pos: blk.z1, out: 1, t0: blk.x0, t1: blk.x1 });
  }
  // só as faces cujo plano está neste chunk (dono único)
  return faces.filter((f) => {
    const [l0, l1] = f.along === 'x' ? [box.z0, box.z1] : [box.x0, box.x1];
    return f.pos >= l0 && f.pos < l1 && f.y1 > box.y0 && f.y0 < box.y1;
  });
}

/** Hash estável de uma string curta (id de face). */
function sh(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h | 0;
}

function dressFace(F, B, box, face) {
  const fid = sh(face.id);
  const [ct0, ct1] = face.along === 'x' ? [box.x0, box.x1] : [box.z0, box.z1];
  const t0 = Math.max(face.t0 + 2, ct0);
  const t1 = Math.min(face.t1 - 2, ct1);
  const y0 = Math.max(face.y0, box.y0);
  const y1 = Math.min(face.y1, box.y1);
  if (t1 <= t0 || y1 <= y0) return;

  // G(t, y, d): ponto global a distância d da face, no lado aberto
  const G = (t, y, d) => (face.along === 'x' ? [t, y, face.pos + face.out * d] : [face.pos + face.out * d, y, t]);
  const L = (t, y, d) => B.L(...G(t, y, d));
  // caixa alinhada à face: centro (t, y, d) e tamanhos (ao longo, altura, profundidade)
  const box3 = (mat, t, y, d, st, sy, sd, ry = 0) => {
    const c = L(t, y, d);
    const g = new THREE.BoxGeometry(face.along === 'x' ? st : sd, sy, face.along === 'x' ? sd : st);
    if (ry) g.rotateY(ry);
    g.translate(c.x, c.y, c.z);
    B.add(mat, g);
  };
  // a parede existe atrás deste ponto? (some onde outro volume a atravessa)
  const wallAt = (t, y) => {
    if (F.inBarrier(y, 4)) return false;
    if (face.owner === 'M') return true;
    return !F.insideVoid(...G(t, y, -W / 2), face.owner);
  };
  const crossings = F.walkwayCrossings(face.along === 'x' ? 'z' : 'x', face.pos, t0 - 30, t1 + 30, y0 - 10, y1 + 10);
  const nearWalkway = (t, y, r = 10) => crossings.some((c) => Math.abs(c.t - t) < c.width / 2 + r && y > c.y - 6 && y < c.y + 14);

  const dens = face.density;

  // ── escadas de marinheiro (colunas contínuas) com patamares ──
  const LS = 90;
  for (let n = Math.floor(t0 / LS); n * LS < t1; n++) {
    if (hash4(F.seed, n, fid, 0, 700) > 0.32 * dens) continue;
    const t = n * LS + 20 + hash4(F.seed, n, fid, 1, 701) * 50;
    if (t < t0 || t >= t1) continue;
    // segmento vertical desta coluna dentro do chunk, interrompido onde a parede falta
    let segStart = null;
    const flush = (ya, yb) => {
      if (yb - ya < 1) return;
      const h = yb - ya;
      box3('rungs', t, ya + h / 2, 0.35, 0.56, h, 0.05);
      box3('rib', t - 0.3, ya + h / 2, 0.35, 0.07, h, 0.07);
      box3('rib', t + 0.3, ya + h / 2, 0.35, 0.07, h, 0.07);
      box3('duct', t + 0.95, ya + h / 2, 0.22, 0.18, h, 0.18); // conduíte ao lado
      for (let yb2 = Math.ceil(ya / 6) * 6; yb2 < yb; yb2 += 6) box3('rib', t, yb2, 0.18, 0.7, 0.08, 0.36); // fixações
    };
    for (let y = Math.floor(y0 / 8) * 8; y < y1; y += 8) {
      const ok = wallAt(t, y + 4) && !nearWalkway(t, y + 4, 4);
      const ya = Math.max(y, y0);
      const yb = Math.min(y + 8, y1);
      if (ok && segStart === null) segStart = ya;
      if (!ok && segStart !== null) {
        flush(segStart, ya);
        segStart = null;
      }
      if (ok && yb >= y1) flush(segStart, yb);
    }
    // patamares em todo nível (a escada sempre leva a algum lugar)
    for (let k = Math.ceil(y0 / LEVEL); k * LEVEL < y1; k++) {
      const y = k * LEVEL - 0.4;
      if (!wallAt(t, y + 2) || nearWalkway(t, y, 6)) continue;
      catwalk(B, box3, t - 4, t - 0.55, y, face, fid, k, true);
      catwalk(B, box3, t + 0.55, t + 4, y, face, fid, k, true);
      // porta ao lado da escada
      if (hash4(F.seed, n, k, fid, 702) < 0.45) door(F, B, box3, L, t - 2.4, y, fid, n * 131 + k);
    }
  }

  // ── passadiços longos em níveis sorteados ──
  for (let k = Math.ceil(y0 / LEVEL); k * LEVEL < y1; k++) {
    if (hash4(F.seed, k, fid, 3, 703) > 0.22 * dens) continue;
    const y = k * LEVEL - 0.4;
    for (let p = Math.floor(t0 / 24); p * 24 < t1; p++) {
      const ta = p * 24;
      if (F.noise3(ta * 0.006, k * 0.9, fid * 0.001) < -0.35) continue; // trechos caídos
      if (!wallAt(ta + 12, y + 2) || nearWalkway(ta + 12, y, 8)) continue;
      // abre vão onde passa uma escada (colunas a cada LS)
      const n = Math.floor((ta + 12) / LS);
      const tl = n * LS + 20 + hash4(F.seed, n, fid, 1, 701) * 50;
      const hasLadder = hash4(F.seed, n, fid, 0, 700) <= 0.32 * dens && tl >= ta && tl < ta + 24;
      if (hasLadder) {
        catwalk(B, box3, ta, tl - 0.55, y, face, fid, k, false);
        catwalk(B, box3, tl + 0.55, ta + 24, y, face, fid, k, false);
      } else {
        catwalk(B, box3, ta, ta + 24, y, face, fid, k, false);
      }
      const h = hash4(F.seed, p, k, fid, 704);
      if (h < 0.18) door(F, B, box3, L, ta + 6 + h * 60, y, fid, p * 97 + k);
      // tubos correndo acima do passadiço
      if (hash4(F.seed, k, fid, 5, 705) < 0.6) {
        const np = 1 + Math.floor(hash4(F.seed, k, fid, 6, 706) * 3);
        for (let q = 0; q < np; q++) {
          const r = 0.07 + q * 0.05;
          B.add('duct', cylinderBetween(L(ta, y + 2.4 + q * 0.35, 0.25 + q * 0.12), L(ta + 24, y + 2.4 + q * 0.35, 0.25 + q * 0.12), r, r, 6, { open: true, heightSegments: 1 }));
        }
      }
      // gotas pingando do passadiço
      if (hash4(F.seed, p, k, fid, 707) < 0.08) {
        const [x, yy, z] = G(ta + 12, y - 0.3, 1.6);
        B.emit({ type: 'drip', x, y: yy, z, len: LEVEL - 1, rate: 0.35 + hash4(F.seed, p, k, fid, 708) * 0.8 });
      }
    }
  }

  // ── acréscimos: módulos parasitas crescendo da parede ──
  const AT = 120;
  const AY = 96;
  for (let a = Math.floor(t0 / AT); a * AT < t1; a++) {
    for (let b = Math.floor(y0 / AY); b * AY < y1; b++) {
      if (hash4(F.seed, a, b, fid, 710) > 0.16 * dens) continue;
      const r = rngAt(F.seed, a, b, fid, 711);
      const t = a * AT + r.float(10, AT - 10);
      const y = b * AY + r.float(14, AY - 30);
      if (t < t0 || t >= t1 || y < y0 || y >= y1 || !wallAt(t, y) || nearWalkway(t, y, 30)) continue;
      accretion(B, box3, t, y, r);
    }
  }

  // ── rios de cabos ao longo da parede ──
  for (let k = Math.floor(y0 / 96); k * 96 < y1; k++) {
    if (hash4(F.seed, k, fid, 9, 720) > 0.1 * dens) continue;
    const yr = k * 96 + 30 + hash4(F.seed, k, fid, 10, 721) * 30;
    if (yr < y0 || yr >= y1) continue;
    const span = 50;
    for (let n = Math.floor(t0 / span); n * span < t1; n++) {
      const ta = n * span + hash4(F.seed, n, k, fid, 722) * 10;
      const tb = (n + 1) * span + hash4(F.seed, n + 1, k, fid, 722) * 10;
      if (!wallAt(ta, yr) || !wallAt(tb, yr)) continue;
      cableRiver(B, L, ta, tb, yr, rngAt(F.seed, n, k, fid, 723));
    }
  }

  // ── lajes caídas escoradas na parede (só nas faces internas das galerias) ──
  if (face.id.includes('i') && face.y0 > -INF && face.y0 >= box.y0 && face.y0 < box.y1) {
    for (let n = Math.floor(t0 / 200); n * 200 < t1; n++) {
      if (hash4(F.seed, n, fid, 11, 730) > 0.25) continue;
      const r = rngAt(F.seed, n, fid, 12, 731);
      const t = n * 200 + r.float(20, 180);
      if (t < t0 || t >= t1 || !wallAt(t, face.y0 + 10)) continue;
      const h = r.float(25, 60);
      const lean = r.float(0.2, 0.45);
      const g = new THREE.BoxGeometry(r.float(10, 24), h, r.float(2, 4));
      g.translate(0, h / 2, 0);
      g.rotateX(face.along === 'x' ? -lean * face.out : 0);
      g.rotateZ(face.along === 'z' ? lean * face.out : 0);
      const p = L(t, face.y0, h * Math.sin(lean) + 1.5);
      g.translate(p.x, p.y, p.z);
      B.add('dress', g);
      rubble(B, G(t, face.y0, h * Math.sin(lean) + 6), r, 10);
    }
  }
}

/** Passadiço de grade entre t = ta..tb, na altura y, com guarda-corpo. */
function catwalk(B, box3, ta, tb, y, face, fid, k, landing) {
  const len = tb - ta;
  if (len < 0.3) return;
  const depth = landing ? 2.0 : 1.6;
  const d0 = 0.8;
  const tc = (ta + tb) / 2;
  box3('grate', tc, y - 0.06, d0 + depth / 2, len, 0.12, depth);
  // guarda-corpo (duas barras nas alturas dos "raios" do corpo: não se cai sem querer)
  box3('rib', tc, y + 0.6, d0 + depth - 0.05, len, 0.08, 0.06);
  box3('rib', tc, y + 0.95, d0 + depth - 0.05, len, 0.08, 0.06);
  for (let t = Math.ceil(ta / 3) * 3; t < tb; t += 3) {
    box3('rib', t, y + 0.5, d0 + depth - 0.05, 0.06, 1.0, 0.06);
    box3('rib', t, y - 0.5, d0 + depth / 2, 0.08, 0.08, depth); // mão-francesa (simplificada)
  }
}

/** Porta de serviço na parede, com moldura, placa e às vezes uma lâmpada. */
function door(F, B, box3, L, t, y, fid, salt) {
  box3('door', t, y + 1.2, 0.05, 1.3, 2.4, 0.1);
  box3('rib', t - 0.72, y + 1.25, 0.08, 0.12, 2.5, 0.16);
  box3('rib', t + 0.72, y + 1.25, 0.08, 0.12, 2.5, 0.16);
  box3('rib', t, y + 2.52, 0.08, 1.56, 0.12, 0.16);
  const h = hash4(F.seed, salt, fid, 1, 740);
  if (h < 0.6) box3('sign', t, y + 2.95, 0.06, 0.9, 0.32, 0.04);
  if (h < 0.35) box3('duct', t + 1.2, y + 1.3, 0.14, 0.45, 0.7, 0.24); // caixa elétrica
  if (h < 0.3) {
    box3('duct', t, y + 3.3, 0.25, 0.4, 0.15, 0.5);
    const p = L(t, y + 3.1, 0.5);
    B.light(p.x + B.x0, p.y + B.y0, p.z + B.z0, h < 0.08 ? WARN : h < 0.2 ? SODIUM : FLUORO, 10, h < 0.15 ? 'faulty' : 'steady');
  }
}

/** Módulos parasitas: um crescimento de caixas grudadas umas nas outras. */
function accretion(B, box3, t, y, r) {
  const boxes = [];
  const n = r.int(3, 11);
  // tamanho em escala log: de cabine a prédio
  const logSize = () => Math.exp(r.float(Math.log(2.5), Math.log(26)));
  let b = { t, y, d: 0, st: logSize(), sy: logSize(), sd: logSize() * 0.8 };
  b.d = b.sd / 2;
  boxes.push(b);
  for (let i = 1; i < n; i++) {
    const p = boxes[r.int(0, boxes.length - 1)];
    const s = r.float(0.35, 1.2);
    const nb = { st: Math.max(1.5, p.st * s * r.float(0.6, 1.4)), sy: Math.max(1.5, p.sy * s * r.float(0.6, 1.4)), sd: Math.max(1.5, p.sd * s * r.float(0.6, 1.4)) };
    const dir = r.pick(['out', 'out', 'up', 'down', 'side', 'side']);
    nb.t = p.t + (dir === 'side' ? r.sign() * (p.st + nb.st) / 2 : r.float(-0.3, 0.3) * p.st);
    nb.y = p.y + (dir === 'up' ? (p.sy + nb.sy) / 2 : dir === 'down' ? -(p.sy + nb.sy) / 2 : r.float(-0.3, 0.3) * p.sy);
    nb.d = dir === 'out' ? p.d + (p.sd + nb.sd) / 2 : Math.max(nb.sd / 2, p.d + r.float(-0.3, 0.3) * p.sd);
    boxes.push(nb);
  }
  for (const q of boxes) {
    const tilt = r.chance(0.35) ? r.float(-0.14, 0.14) : 0; // fora do esquadro
    box3(r.chance(0.7) ? 'block' : 'dress', q.t, q.y, q.d, q.st, q.sy, q.sd, tilt);
  }
  // uma plataforma ou um tubo saindo do conjunto, às vezes
  if (r.chance(0.4)) {
    const q = boxes[boxes.length - 1];
    box3('grate', q.t, q.y - q.sy / 2 - 0.06, q.d + q.sd / 2 + 1.2, q.st * 0.8, 0.12, 2.4);
  }
}

/** Rio de cabos: um feixe de 8–24 cabos pendurados entre dois pontos da parede. */
function cableRiver(B, L, ta, tb, y, r) {
  const n = r.int(8, 24);
  const sag = r.float(4, 12);
  for (let i = 0; i < n; i++) {
    const dy = r.float(-1.5, 1.5);
    const dd = r.float(0.4, 2.4);
    const rad = r.float(0.06, 0.28);
    const s = sag * r.float(0.8, 1.25);
    const pts = [];
    const rs = [];
    for (let q = 0; q <= 8; q++) {
      const u = q / 8;
      pts.push(L(ta + (tb - ta) * u, y + dy - s * 4 * u * (1 - u), dd + Math.sin(u * Math.PI) * r.float(0, 1.2)));
      rs.push(rad);
    }
    B.add('cable', buildTaperedTube(pts, rs, { radialSegments: 4, smooth: 2 }));
  }
}

/** Monte de entulho (caixas tombadas) centrado num ponto GLOBAL. */
function rubble(B, [x, y, z], r, radius = 6) {
  const n = r.int(6, 18);
  for (let i = 0; i < n; i++) {
    const a = r.float(0, Math.PI * 2);
    const d = Math.sqrt(r.next()) * radius;
    const s = r.float(0.4, 4.5) * (1 - d / (radius * 1.4));
    const c = B.L(x + Math.cos(a) * d, y + s * 0.3, z + Math.sin(a) * d);
    const g = new THREE.BoxGeometry(s * r.float(0.6, 1.8), s * r.float(0.3, 0.8), s * r.float(0.6, 1.6));
    g.rotateX(r.float(-0.5, 0.5));
    g.rotateY(r.float(0, 3));
    g.rotateZ(r.float(-0.5, 0.5));
    g.translate(c.x, c.y, c.z);
    B.add('dress', g);
  }
}

// ─── superfícies horizontais grandes: entulho, vestígios, gotas ─────────────

function genSurfaces(F, B, box) {
  const surfaces = [];
  const cx = (box.x0 + box.x1) / 2;
  const cy = (box.y0 + box.y1) / 2;
  const cz = (box.z0 + box.z1) / 2;
  for (const g of F.galleriesNear(cx, cy, cz)) {
    surfaces.push({
      y: g.floor,
      kind: 'gallery',
      ok: (x, z) => Math.abs((g.axis === 'x' ? z : x) - g.c) < g.w / 2 - 12 && !F.insideVoid(x, g.floor - 3, z, g.id),
      ceiling: g.roof ? g.top : null,
      prob: 0.16,
    });
  }
  for (const st of F.strataNear(cy)) surfaces.push({ y: st.top, kind: 'stratum', ok: (x, z) => F.strataSolid(st, x - 25, z - 25) && F.strataSolid(st, x + 25, z + 25), prob: 0.08, under: st.bottom });
  for (const b of F.barriersNear(cy)) surfaces.push({ y: b.top, kind: 'barrier', ok: (x, z) => F.barrierSolid(b, x - 40, z - 40) && F.barrierSolid(b, x + 40, z + 40), prob: 0.07, under: b.bottom });

  for (const s of surfaces) {
    // topo da superfície dentro do chunk
    if (s.y >= box.y0 && s.y < box.y1) {
      const C = 96;
      for (let i = Math.floor(box.x0 / C); i * C < box.x1; i++) {
        for (let k = Math.floor(box.z0 / C); k * C < box.z1; k++) {
          const r = rngAt(F.seed, i, Math.round(s.y), k, 750);
          const x = (i + r.float(0.2, 0.8)) * C;
          const z = (k + r.float(0.2, 0.8)) * C;
          if (!s.ok(x, z) || F.walkwayNear(x, s.y - 5, s.y + 10, z, 25)) continue;
          const roll = r.next();
          if (roll < s.prob) settlement(F, B, x, s.y, z, r);
          else if (roll < s.prob + 0.1) rubble(B, [x, s.y, z], r, r.float(4, 12));
        }
      }
      // gotas caindo do teto das galerias até o piso, com poça embaixo
      if (s.ceiling !== null && s.ceiling !== undefined) {
        const C2 = 64;
        for (let i = Math.floor(box.x0 / C2); i * C2 < box.x1; i++) {
          for (let k = Math.floor(box.z0 / C2); k * C2 < box.z1; k++) {
            const r = rngAt(F.seed, i, Math.round(s.y), k, 751);
            if (!r.chance(0.05)) continue;
            const x = (i + r.next()) * C2;
            const z = (k + r.next()) * C2;
            if (!s.ok(x, z)) continue;
            B.emit({ type: 'drip', x, y: s.ceiling - 0.5, z, len: s.ceiling - s.y - 0.6, rate: r.float(0.05, 0.15) });
            puddle(B, x, s.y, z, r);
          }
        }
      }
    }
    // gotas escorrendo por baixo de estratos e camadas
    if (s.under !== undefined && s.under >= box.y0 && s.under < box.y1) {
      const C3 = 96;
      for (let i = Math.floor(box.x0 / C3); i * C3 < box.x1; i++) {
        for (let k = Math.floor(box.z0 / C3); k * C3 < box.z1; k++) {
          const r = rngAt(F.seed, i, Math.round(s.under), k, 752);
          if (!r.chance(0.04)) continue;
          const x = (i + r.next()) * C3;
          const z = (k + r.next()) * C3;
          if (!s.ok(x, z)) continue;
          B.emit({ type: 'drip', x, y: s.under - 0.2, z, len: r.float(150, 400), rate: r.float(0.03, 0.08) });
        }
      }
    }
  }
}

function puddle(B, x, y, z, r) {
  const c = B.L(x, y + 0.03, z);
  const g = new THREE.CylinderGeometry(r.float(1.2, 4.5), r.float(1.2, 4.5), 0.06, 14, 1, false);
  g.scale(1, 1, r.float(0.5, 1));
  g.rotateY(r.float(0, 3));
  g.translate(c.x, c.y, c.z);
  B.add('water', g);
}

/** Assentamento abandonado: ninguém, só o que ficou. */
export function settlement(F, B, x, y, z, r) {
  const G = (dx, dy, dz) => B.L(x + dx, y + dy, z + dz);
  const boxAt = (mat, dx, dy, dz, sx, sy, sz, ry = 0, rx = 0) => {
    const c = G(dx, dy, dz);
    const g = new THREE.BoxGeometry(sx, sy, sz);
    if (rx) g.rotateX(rx);
    if (ry) g.rotateY(ry);
    g.translate(c.x, c.y, c.z);
    B.add(mat, g);
  };
  // barracos de chapa
  const shacks = [];
  const n = r.int(3, 7);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r.float(-0.3, 0.3);
    const d = r.float(6, 14);
    const sx = r.float(2.4, 4.5);
    const sy = r.float(2.1, 3.0);
    const sz = r.float(2.4, 4.0);
    const ry = a + Math.PI / 2 + r.float(-0.3, 0.3);
    const dx = Math.cos(a) * d;
    const dz = Math.sin(a) * d;
    boxAt('shack', dx, sy / 2, dz, sx, sy, sz, ry);
    boxAt('shack', dx, sy + 0.18, dz, sx + 0.6, 0.12, sz + 0.6, ry, r.float(-0.14, 0.14)); // telhado torto
    // porta escura voltada para o centro
    boxAt('door', dx - Math.cos(a) * (sz / 2 + 0.02), 0.95, dz - Math.sin(a) * (sz / 2 + 0.02), 0.8, 1.8, 0.04, ry);
    if (r.chance(0.4)) boxAt('graffiti', dx + Math.cos(ry) * 0.05, sy * 0.55, dz - Math.sin(ry) * 0.05, sx * 0.9, sy * 0.6, 0.02, ry);
    shacks.push([dx, dz, sy]);
  }
  // varais entre barracos, com panos pendurados
  for (let i = 0; i + 1 < shacks.length; i += 2) {
    if (!r.chance(0.7)) continue;
    const [ax, az, ah] = shacks[i];
    const [bx, bz, bh] = shacks[i + 1];
    const h = Math.min(ah, bh) - 0.2;
    B.add('cable', cylinderBetween(G(ax, h, az), G(bx, h, bz), 0.015, 0.015, 3, { open: true }));
    const m = r.int(2, 6);
    for (let q = 1; q <= m; q++) {
      const u = q / (m + 1);
      const px = ax + (bx - ax) * u;
      const pz = az + (bz - az) * u;
      const ch = r.float(0.6, 1.2);
      boxAt('cloth', px, h - ch / 2 - 0.05 - Math.sin(u * Math.PI) * 0.3, pz, r.float(0.5, 0.9), ch, 0.02, Math.atan2(bx - ax, bz - az) + Math.PI / 2);
    }
  }
  // fogueira apagada (brasa quase morta) e sua fumaça
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    boxAt('dress', Math.cos(a) * 0.9, 0.15, Math.sin(a) * 0.9, 0.35, 0.3, 0.35, a);
  }
  boxAt('door', 0, 0.03, 0, 1.3, 0.06, 1.3);
  if (r.chance(0.5)) {
    B.light(x, y + 0.6, z, SODIUM, 3, 'ember');
    B.emit({ type: 'steam', x, y: y + 0.4, z, h: r.float(8, 20), rate: 0.12 });
  }
  // terminal quebrado
  const ta = r.float(0, Math.PI * 2);
  const tx = Math.cos(ta) * 3.5;
  const tz = Math.sin(ta) * 3.5;
  boxAt('duct', tx, 0.65, tz, 0.7, 1.3, 0.5, ta);
  boxAt('screen', tx - Math.cos(ta) * 0.26, 1.05, tz - Math.sin(ta) * 0.26, 0.5, 0.36, 0.02, ta + Math.PI / 2);
  if (r.chance(0.6)) B.light(x + tx, y + 1.4, z + tz, FLUORO, 2.5, 'faulty');
  // barris e caixotes
  const nb = r.int(3, 9);
  for (let i = 0; i < nb; i++) {
    const a = r.float(0, Math.PI * 2);
    const d = r.float(3, 16);
    const c = G(Math.cos(a) * d, 0.45, Math.sin(a) * d);
    if (r.chance(0.6)) {
      const g = new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8, 1, false);
      if (r.chance(0.25)) g.rotateZ(Math.PI / 2); // tombado
      g.translate(c.x, c.y, c.z);
      B.add('shack', g);
    } else {
      boxAt('dress', Math.cos(a) * d, 0.4, Math.sin(a) * d, 0.8, 0.8, 0.8, r.float(0, 3));
    }
  }
}
