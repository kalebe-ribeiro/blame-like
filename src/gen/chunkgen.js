// ─────────────────────────────────────────────────────────────────────────────
//  Geração de um chunk (cubo de CHUNK metros). Roda dentro de um Web Worker.
//
//  Toda geometria é construída em coordenadas LOCAIS ao canto do chunk
//  (B.L(xGlobal, yGlobal, zGlobal) faz a conversão) — assim não há perda de
//  precisão de float32 mesmo a milhões de metros da origem.
//
//  Camadas (na ordem):
//    pilares → passarelas → dutos → cabos → rede andável
//    → vestimenta das megaestruturas (sacadas, escadas, prédios; ver dressing.js)
//
//  Para adicionar algo novo: escreva gen<Algo>(F, B, box) e chame em
//  generateChunk(). Use sempre rngAt(seed, coordenadas, SAL_ÚNICO) para que o
//  resultado seja determinístico e independente dos outros sistemas.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from '../lib/three.js';
import { CHUNK, PILLAR_CELL, SEG_H, WALK, DUCT } from './field.js';
import { genTransit, stationNear } from './transit.js';
import { rngAt } from './hash.js';
import { mergeAll, place, cylinderBetween } from '../world/geometry.js';
import { catenaryCable, plumbLine, cableMat } from '../world/cables.js';
import { cutPiece, inCut, components, keepTris } from './cut.js';

import { FLUORO, SODIUM, COLD, WARN } from './colors.js';
import { genNetwork } from './network.js';
import { genDressing, habitation } from './dressing.js';
import { genHive, genMassif } from './closed.js';
import { genHuman } from './human.js';

export { FLUORO, SODIUM, COLD };
const COLORS = [FLUORO, SODIUM, COLD];

const lerp = (a, b, t) => a + (b - a) * t;

/** Acumula geometrias por material + luzes, e empacota para transferência. */
// o que o emissor não corta: os feixes de luz (volumes de luz, não matéria)
const NO_CUT = new Set(['beam', 'colossusBeam', 'barrier']); // (+ a laje das camadas — intransponível)

export class ChunkBuilder {
  constructor(x0, y0, z0, lod = 0) {
    this.x0 = x0;
    this.y0 = y0;
    this.z0 = z0;
    this.lod = lod; // 0 = detalhe total; 1, 2 = cada vez mais simplificado
    this.parts = {};
    this.lights = [];
    this.emitters = []; // gotas / vapor (animados na thread principal)
    // os cortes do emissor que tocam este chunk (GLOBAIS e locais) — ver setCuts
    this.cutsG = [];
    this.cutsL = [];
    /** @type {Map<string, any>|null} a memória das peças cortadas deste chunk (pieceMemo — só no worker, com cortes) */
    this.memo = null;
    /** @type {number|undefined} a aresta do chunk (m) — as partes que encostam na borda ficam (seguras pelo vizinho) */
    this.size = undefined;
    this.protect = 0; // > 0: as peças adicionadas agora não se cortam (camadas, únicas, a torre da passagem)
    this.cutStats = { cut: 0, ms: 0, slow: [], memo: 0 }; // (memo: peças que vieram da memória — gen/cut.js)
    this.cutPieces = []; // as peças recortadas (os fragmentos soltos são procurados no fim)
    /** @type {number[]} as caixas (GLOBAIS, 6 números cada) das peças que podem ser cortadas */
    this.boxes = [];
    this.debris = []; // fragmentos soltos que saíram da malha (GLOBAIS): { x, y, z, sx, sy, sz, mat }
  }

  /**
   * As caixas de uma peça (GLOBAIS) para o teste "este tiro encosta neste chunk?". Uma peça longa
   * (um cabo de 1 km, uma viga) vira várias caixas ao longo do comprimento (~24 m cada, até 32):
   * cada triângulo entra em todas as fatias que atravessa, com a caixa dele (conservador — nunca
   * deixa de cortar onde devia).
   */
  _pieceBoxes(geom) {
    if (!geom.boundingBox) geom.computeBoundingBox();
    const b = geom.boundingBox;
    const ext = [b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z];
    const ax = ext.indexOf(Math.max(...ext));
    const K = Math.min(32, Math.max(1, Math.ceil(ext[ax] / 24)));
    const push = (mn, mx) => this.boxes.push(mn[0] + this.x0, mn[1] + this.y0, mn[2] + this.z0, mx[0] + this.x0, mx[1] + this.y0, mx[2] + this.z0);
    if (K === 1) return push([b.min.x, b.min.y, b.min.z], [b.max.x, b.max.y, b.max.z]);
    const lo = [b.min.x, b.min.y, b.min.z][ax];
    const step = ext[ax] / K;
    const mins = Array.from({ length: K }, () => [Infinity, Infinity, Infinity]);
    const maxs = Array.from({ length: K }, () => [-Infinity, -Infinity, -Infinity]);
    const pos = geom.attributes.position;
    const ix = geom.index;
    const n = ix ? ix.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const tmn = [Infinity, Infinity, Infinity];
      const tmx = [-Infinity, -Infinity, -Infinity];
      for (let j = 0; j < 3; j++) {
        const v = ix ? ix.getX(t + j) : t + j;
        const p = [pos.getX(v), pos.getY(v), pos.getZ(v)];
        for (let k = 0; k < 3; k++) {
          if (p[k] < tmn[k]) tmn[k] = p[k];
          if (p[k] > tmx[k]) tmx[k] = p[k];
        }
      }
      const i0 = Math.max(0, Math.min(K - 1, Math.floor((tmn[ax] - lo) / step)));
      const i1 = Math.max(0, Math.min(K - 1, Math.floor((tmx[ax] - lo) / step)));
      for (let i = i0; i <= i1; i++) {
        const a0 = lo + i * step;
        for (let k = 0; k < 3; k++) {
          const mn = k === ax ? Math.max(tmn[k], a0) : tmn[k];
          const mx = k === ax ? Math.min(tmx[k], a0 + step) : tmx[k];
          if (mn < mins[i][k]) mins[i][k] = mn;
          if (mx > maxs[i][k]) maxs[i][k] = mx;
        }
      }
    }
    for (let i = 0; i < K; i++) if (mins[i][0] <= maxs[i][0]) push(mins[i], maxs[i]);
  }

  /** Os cortes (GLOBAIS) que tocam este chunk: as peças passam a ser recortadas por eles. */
  setCuts(list) {
    this.cutsG = list ?? [];
    this.cutsL = this.cutsG.map((c) => ({
      id: c.id,
      a: [c.a[0] - this.x0, c.a[1] - this.y0, c.a[2] - this.z0],
      b: [c.b[0] - this.x0, c.b[1] - this.y0, c.b[2] - this.z0],
      r: c.r,
      keep: c.keep ? [c.keep[0] - this.x0, c.keep[1] - this.y0, c.keep[2] - this.z0, c.keep[3], c.keep[4] - this.y0] : undefined,
    }));
  }

  /** O ponto GLOBAL está num corte? (o que nasceria ali — uma luminária, uma gota — não nasce) */
  cutAt(x, y, z, margin = 0.3) {
    for (const c of this.cutsG) if (inCut(x, y, z, c, margin)) return true;
    return false;
  }

  /** Emissor de partículas em coordenadas GLOBAIS: { type: 'drip'|'steam', x, y, z, ... } */
  emit(e) {
    if (this.cutAt(e.x, e.y, e.z)) return;
    if (!this.lod) this.emitters.push(e);
  }

  /** Global → local (Vector3). */
  L(x, y, z) {
    return new THREE.Vector3(x - this.x0, y - this.y0, z - this.z0);
  }

  add(mat, geom) {
    if (!geom) return;
    // a caixa de cada peça que PODE ser cortada (GLOBAL) — o jogo decide por elas que chunks
    // um tiro refaz e que cortes mandar (finish → pieceBoxes)
    if (!this.protect && !NO_CUT.has(mat)) this._pieceBoxes(geom);
    // os cortes do emissor: a peça sai recortada (as faces do corte no material 'cut')
    if (this.cutsL.length && !this.protect && !NO_CUT.has(mat)) {
      const t0 = performance.now();
      const r = cutPiece(geom, this.cutsL, { maxEdge: this.lod ? 1.5 : 0.5, memo: this.memo, key: this.memo ? pieceKey(mat, geom) : '' });
      if (r.mode !== 'none') {
        const ms = performance.now() - t0;
        this.cutStats.cut++;
        this.cutStats.ms += ms;
        if (r.mode.startsWith('memo')) this.cutStats.memo++;
        // (as peças lentas, para medir: material, triângulos, ms, modo)
        if (ms > 8) this.cutStats.slow.push(`${mat}:${(geom.index ? geom.index.count : geom.attributes.position.count) / 3}t:${ms.toFixed(0)}ms:${r.mode}`);
        if (r.kept) (this.parts[mat] ??= []).push(r.kept);
        if (r.caps) (this.parts.cut ??= []).push(r.caps);
        this.cutPieces.push({ mat, kept: r.kept, caps: r.caps });
        return;
      }
    }
    (this.parts[mat] ??= []).push(geom);
  }

  /**
   * Luz em coordenadas GLOBAIS — só a luz. Use direto apenas quando a luz já
   * nasce de algo que existe (uma tela, um braseiro, uma carcaça); senão, lamp().
   */
  light(x, y, z, color, intensity, mode = 'steady', grid = true) {
    if (this.cutAt(x, y, z)) return; // (a fonte foi cortada)
    if (this.lod) return; // chunks distantes não contribuem luzes
    const l = { x, y, z, color, intensity, mode, phase: Math.abs((x * 0.013 + y * 0.029 + z * 0.071) % 100) };
    if (!grid) l.grid = false; // energia própria: não apaga com a rede do setor
    this.lights.push(l);
  }

  /**
   * Uma luminária: a luz E o objeto que a produz. Na Cidade nenhuma luz fica
   * no ar sem fonte (ver o cofre, 02-Direcao-de-Arte): há sempre uma carcaça
   * escura com a lente acesa pela própria luz, logo acima dela, e — se a
   * luminária não encosta em nada — uma haste até onde ela se prende.
   *   to    ponto GLOBAL onde ela se prende. Abaixo da lâmpada: um poste até
   *         a altura dela e um braço curto até a carcaça; acima ou ao lado:
   *         uma haste direta. null = já encosta em algo.
   *   size  escala (as luminárias das megaestruturas são enormes)
   *   far   vista de longe (camada macro): materiais que não somem cedo
   */
  /**
   * Tomada de recarga (modo Peregrinação — app/carried.js): uma caixa num
   * poste ou parede, com uma plaquinha clara. Só dá energia se o setor tiver.
   * (x,y,z) GLOBAL = o centro da caixa; yaw vira a caixa.
   */
  socket(x, y, z, yaw = 0) {
    if (this.lod || this.cutAt(x, y, z)) return;
    const L = this.L(x, y, z);
    this.add('machine', place(new THREE.BoxGeometry(0.24, 0.32, 0.14), { x: L.x, y: L.y, z: L.z, ry: yaw }));
    const f = new THREE.Vector3(0, 0.06, 0.075).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.add('lamp', place(new THREE.BoxGeometry(0.1, 0.05, 0.02), { x: L.x + f.x, y: L.y + f.y, z: L.z + f.z, ry: yaw }));
    this.emitters.push({ type: 'socket', x, y, z });
  }

  lamp(x, y, z, color, intensity, mode = 'steady', { to = null, size = 1, far = false, grid = true } = {}) {
    // a luminária (ou a haste dela) cortada: nem a peça nem a luz
    if (this.cutAt(x, y, z, 0.6) || (to && this.cutAt(to[0], to[1], to[2], 0.3))) return;
    this.light(x, y, z, color, intensity, mode, grid);
    if (this.lod) return;
    const s = size;
    const L = this.L(x, y, z);
    this.add('machine', place(new THREE.BoxGeometry(0.7 * s, 0.3 * s, 0.7 * s), { x: L.x, y: L.y + 0.27 * s, z: L.z }));
    this.add(far ? 'lampFar' : 'lamp', place(new THREE.BoxGeometry(0.5 * s, 0.1 * s, 0.5 * s), { x: L.x, y: L.y + 0.08 * s, z: L.z }));
    if (!to) return;
    const rod = (a, b) => this.add(far ? 'frame' : 'duct', cylinderBetween(a, b, 0.06 * s + 0.03, 0.06 * s + 0.03, 5));
    const top = new THREE.Vector3(L.x, L.y + 0.42 * s, L.z);
    const T = this.L(to[0], to[1], to[2]);
    if (T.y < L.y - 0.5) {
      // poste do chão até a altura da lâmpada, e um braço curto até ela
      const P = new THREE.Vector3(T.x, top.y + 0.25 * s, T.z);
      rod(T, P);
      if (Math.hypot(P.x - top.x, P.z - top.z) > 0.05) rod(P, top);
    } else {
      rod(top, T);
    }
  }

  /**
   * Fragmentos soltos (decisão C1 — a Cidade é ancorada; nada flutua): uma parte de uma peça
   * recortada que ficou pequena (< 8 m³ de caixa), não encosta em nenhuma outra peça nem na
   * borda do chunk, sai da malha e vira detrito (this.debris — cai no jogo).
   */
  _dropLoose() {
    if (!this.cutPieces.length) return;
    const own = new Set(this.cutPieces.flatMap((p) => [p.kept, p.caps]).filter(Boolean));
    // as caixas de todas as outras peças do chunk
    const boxes = [];
    for (const list of Object.values(this.parts)) {
      for (const g of list) {
        if (own.has(g)) continue;
        if (!g.boundingBox) g.computeBoundingBox();
        boxes.push(g.boundingBox);
      }
    }
    const size = this.size ?? Infinity;
    const E = 0.05;
    for (const p of this.cutPieces) {
      // o que ficou da peça e as faces do corte formam UM sólido (encontram-se na emenda):
      // as partes conexas são procuradas nos dois juntos
      const geoms = [p.kept, p.caps].filter(Boolean);
      if (!geoms.length) continue;
      const joint = mergeAll(geoms.map((g) => g.clone()));
      const split = geoms[0].index.count / 3; // triângulos [0, split) são do primeiro
      const comps = components(joint);
      if (comps.length < 2) continue;
      const keep = geoms.map(() => []);
      for (const c of comps) {
        const vol = (c.max[0] - c.min[0]) * (c.max[1] - c.min[1]) * (c.max[2] - c.min[2]);
        const atEdge = c.min.some((v) => v <= E) || c.max.some((v) => v >= size - E);
        const touches = atEdge || boxes.some((b) => b.min.x <= c.max[0] + E && b.max.x >= c.min[0] - E && b.min.y <= c.max[1] + E && b.max.y >= c.min[1] - E && b.min.z <= c.max[2] + E && b.max.z >= c.min[2] - E);
        if (vol < 8 && !touches) {
          this.debris.push({ x: (c.min[0] + c.max[0]) / 2 + this.x0, y: (c.min[1] + c.max[1]) / 2 + this.y0, z: (c.min[2] + c.max[2]) / 2 + this.z0, sx: c.max[0] - c.min[0], sy: c.max[1] - c.min[1], sz: c.max[2] - c.min[2], mat: p.mat });
          continue;
        }
        for (const t of c.tris) {
          if (t < split) keep[0].push(t);
          else keep[1].push(t - split);
        }
      }
      geoms.forEach((g, i) => {
        if (keep[i].length === g.index.count / 3) return;
        if (!keepTris(g, keep[i])) {
          for (const list of Object.values(this.parts)) {
            const j = list.indexOf(g);
            if (j >= 0) list.splice(j, 1);
          }
        }
      });
    }
  }

  finish() {
    this._dropLoose();
    const meshes = [];
    for (const [mat, list] of Object.entries(this.parts)) {
      const g = mergeAll(list);
      if (!g) continue;
      g.computeBoundingSphere();
      const bs = g.boundingSphere;
      meshes.push({
        mat,
        position: g.attributes.position.array,
        normal: packNormals(g.attributes.normal.array),
        index: g.index.array,
        sphere: [bs.center.x, bs.center.y, bs.center.z, bs.radius],
      });
    }
    // os limites REAIS da geometria (GLOBAIS) — o jogo decide por eles que cortes mandar e que chunks refazer
    // (a caixa exata dos vértices — a esfera de uma malha que ocupa o chunk vira um cubo 1,7× maior)
    let bounds = null;
    for (const m of meshes) {
      const p = m.position;
      for (let i = 0; i < p.length; i += 3) {
        const x = p[i] + this.x0;
        const y = p[i + 1] + this.y0;
        const z = p[i + 2] + this.z0;
        if (!bounds) bounds = [x, y, z, x, y, z];
        else {
          if (x < bounds[0]) bounds[0] = x;
          if (y < bounds[1]) bounds[1] = y;
          if (z < bounds[2]) bounds[2] = z;
          if (x > bounds[3]) bounds[3] = x;
          if (y > bounds[4]) bounds[4] = y;
          if (z > bounds[5]) bounds[5] = z;
        }
      }
    }
    return { meshes, lights: this.lights, emitters: this.emitters, debris: this.debris, cutStats: this.cutStats, bounds, pieceBoxes: new Float32Array(this.boxes) };
  }
}

/**
 * Normais em 8 bits com sinal, 4 componentes (a 4ª é enchimento: o formato
 * RGBA8_SNORM é nativo na GPU). 4 bytes por vértice em vez de 12 — menos
 * memória e menos banda ao enviar chunks novos para a GPU.
 */
function packNormals(src) {
  const n = src.length / 3;
  const out = new Int8Array(n * 4);
  for (let i = 0; i < n; i++) {
    out[i * 4] = Math.round(Math.max(-1, Math.min(1, src[i * 3])) * 127);
    out[i * 4 + 1] = Math.round(Math.max(-1, Math.min(1, src[i * 3 + 1])) * 127);
    out[i * 4 + 2] = Math.round(Math.max(-1, Math.min(1, src[i * 3 + 2])) * 127);
  }
  return out;
}

/** Índices n tais que n·step + off ∈ [lo, hi). */
function* lattice(lo, hi, step, off = 0) {
  for (let n = Math.ceil((lo - off) / step); n * step + off < hi; n++) yield n;
}

/**
 * Gera um chunk. level 0 = cubo de 192 m com detalhe total. level 1/2 = cubo
 * de 384/768 m (LOD) — percorre os chunks finos contidos nele e chama os mesmos
 * geradores em modo simplificado (B.lod): só as massas grandes, sem cabos,
 * corrimãos, degraus, luzes nem detalhes.
 */
// ── a memória das peças cortadas (no worker): os últimos chunks refeitos guardam o resultado
//    de cada peça e os cortes que ele já tem (gen/cut.js cutPiece — só os cortes novos passam
//    pelo CSG). A chave da peça é a forma dela (a ordem muda quando um corte apaga uma luminária).
const MEMO = new Map();
const MEMO_CHUNKS = 48;
export function pieceMemo(key) {
  let m = MEMO.get(key);
  if (m) MEMO.delete(key); // (o mais recente vai para o fim)
  else m = new Map();
  MEMO.set(key, m);
  while (MEMO.size > MEMO_CHUNKS) MEMO.delete(MEMO.keys().next().value);
  return m;
}
/** (ferramentas) esquece tudo */
export function clearPieceMemo() {
  MEMO.clear();
}
/** A memória já tem este chunk? */
export function hasPieceMemo(key) {
  return MEMO.has(key);
}
/** A memória de um chunk em arrays (para o disco — world/pieceStore.js); null se vazia. */
export function exportPieceMemo(key) {
  const m = MEMO.get(key);
  if (!m || !m.size) return null;
  const flat = (g, k) => (g ? new Float32Array((g.index ? g.toNonIndexed() : g).attributes[k].array) : null);
  const out = [];
  for (const [pk, v] of m) out.push([pk, v.none ? { ids: v.ids, none: true } : { ids: v.ids, kp: flat(v.kept, 'position'), kn: flat(v.kept, 'normal'), cp: flat(v.caps, 'position'), cn: flat(v.caps, 'normal') }]);
  return out;
}
/** Põe de volta a memória de um chunk lida do disco. */
export function importPieceMemo(key, data) {
  const geo = (p, n) => {
    if (!p) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    const ix = new Uint32Array(p.length / 3);
    for (let i = 0; i < ix.length; i++) ix[i] = i;
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    return g;
  };
  const m = pieceMemo(key);
  for (const [pk, v] of data) m.set(pk, v.none ? { ids: v.ids, none: true } : { ids: v.ids, kept: geo(v.kp, v.kn), caps: geo(v.cp, v.cn) });
}
/** A chave da memória de um chunk (a mesma de generateChunk / generateMacro). */
export function pieceMemoKey(layer, level, cx, cy, cz) {
  return layer === 'macro' ? `m:${cx},${cy},${cz}` : `c${level}:${cx},${cy},${cz}`;
}
function pieceKey(mat, geom) {
  if (!geom.boundingBox) geom.computeBoundingBox();
  const b = geom.boundingBox;
  const r = (v) => Math.round(v * 100);
  return `${mat}|${geom.attributes.position.count}|${r(b.min.x)},${r(b.min.y)},${r(b.min.z)},${r(b.max.x)},${r(b.max.y)},${r(b.max.z)}`;
}

export function generateChunk(F, cx, cy, cz, level = 0) {
  const n = 1 << level;
  const size = CHUNK * n;
  const B = new ChunkBuilder(cx * size, cy * size, cz * size, level);
  // (as peças de um chunk podem passar da caixa dele — pontes entre plataformas vizinhas, cabos:
  // os cortes vêm de uma caixa com um chunk de margem; o pré-filtro de cada peça descarta o resto)
  B.setCuts(F.cutsInBox((cx - 1) * size, (cy - 1) * size, (cz - 1) * size, (cx + 2) * size, (cy + 2) * size, (cz + 2) * size));
  B.size = size;
  if (B.cutsL.length) B.memo = pieceMemo(`c${level}:${cx},${cy},${cz}`);
  for (let a = 0; a < n; a++) {
    for (let b = 0; b < n; b++) {
      for (let c = 0; c < n; c++) {
        const fx = cx * n + a;
        const fy = cy * n + b;
        const fz = cz * n + c;
        const box = {
          x0: fx * CHUNK, y0: fy * CHUNK, z0: fz * CHUNK,
          x1: (fx + 1) * CHUNK, y1: (fy + 1) * CHUNK, z1: (fz + 1) * CHUNK,
        };
        const anchors = [];
        genPillars(F, B, box, anchors);
        genHive(F, B, box);
        genMassif(F, B, box);
        genNetwork(F, B, box);
        if (level <= 1) {
          genWalkways(F, B, box, anchors);
          genTransit(F, B, box);
          genDucts(F, B, box);
        }
        if (level === 0) {
          genCables(F, B, anchors);
          genDressing(F, B, box);
          genHuman(F, B, box);
        }
      }
    }
  }
  return B.finish();
}

// ─── pilares ────────────────────────────────────────────────────────────────

function genPillars(F, B, box, anchors) {
  const i0 = Math.floor(box.x0 / PILLAR_CELL);
  const k0 = Math.floor(box.z0 / PILLAR_CELL);
  const j0 = Math.floor(box.y0 / SEG_H);
  const n = CHUNK / PILLAR_CELL;
  const segs = CHUNK / SEG_H;
  for (let i = i0; i < i0 + n; i++) {
    for (let k = k0; k < k0 + n; k++) {
      const p = F.pillar(i, k);
      if (!p) continue;
      for (let j = j0; j < j0 + segs; j++) {
        if (F.segmentPresent(p, j)) buildSegment(F, B, p, j, anchors);
      }
    }
  }
}

function buildSegment(F, B, p, j, anchors) {
  if (B.lod) {
    // LOD: um único tronco por segmento, 4 lados
    const ya = j * SEG_H;
    const ca = F.pillarCenter(p, ya);
    const cb = F.pillarCenter(p, ya + SEG_H);
    B.add('tower', cylinderBetween(B.L(ca.x, ya, ca.z), B.L(cb.x, ya + SEG_H, cb.z), F.pillarRadius(p, j), F.pillarRadius(p, j + 1), 4, { spin: p.spin, heightSegments: 1 }));
    return;
  }
  const r = rngAt(F.seed, p.i, j, p.k, 5);
  const ya = j * SEG_H;
  const yb = ya + SEG_H;
  const ra = F.pillarRadius(p, j);
  const rb = F.pillarRadius(p, j + 1);
  const cA = { x: 0, z: 0 };
  const cB = { x: 0, z: 0 };
  const opts = { spin: p.spin };

  // o segmento é dividido em 1–3 peças; bordas contínuas, meio livre para "saltos de escala"
  const pieces = r.int(1, 3);
  for (let m = 0; m < pieces; m++) {
    const t0 = m / pieces;
    const t1 = (m + 1) / pieces;
    const y0 = ya + t0 * SEG_H;
    const y1 = ya + t1 * SEG_H;
    F.pillarCenter(p, y0, cA);
    F.pillarCenter(p, y1, cB);
    const r0 = lerp(ra, rb, t0);
    const r1 = lerp(ra, rb, t1);
    const A = B.L(cA.x, y0, cA.z);
    const Bp = B.L(cB.x, y1, cB.z);
    const roll = r.next();

    if (roll < 0.1) {
      // tendão: afina até quase nada no meio da peça
      const mid = A.clone().lerp(Bp, 0.5);
      const thin = Math.max(0.5, p.baseR * r.float(0.1, 0.25));
      B.add('tower', cylinderBetween(A, mid, r0, thin, p.sides, opts));
      B.add('tower', cylinderBetween(mid, Bp, thin, r1, p.sides, opts));
    } else {
      B.add('tower', cylinderBetween(A, Bp, r0, r1, p.sides, opts));
      if (roll < 0.22) {
        // bulbo: a escala triplica sem aviso
        const big = Math.max(r0, r1) * r.float(2.0, 3.4);
        const h = (y1 - y0) * r.float(0.4, 0.8);
        const mid = A.clone().lerp(Bp, 0.5);
        B.add('tower', place(new THREE.CylinderGeometry(big * 0.85, big, h, p.sides, 3, true), { x: mid.x, y: mid.y, z: mid.z, ry: p.spin }));
        const capH = h * 0.35;
        B.add('tower', place(new THREE.ConeGeometry(big * 0.85, capH, p.sides, 2, true), { x: mid.x, y: mid.y + h / 2 + capH / 2, z: mid.z, ry: p.spin }));
        // (virado com rx = π, o giro em y se espelha: -spin para os cantos baterem com os do bulbo — com
        //  +spin, a base saía torta e o bulbo ficava aberto embaixo, o oco à vista)
        B.add('tower', place(new THREE.ConeGeometry(big, capH, p.sides, 2, true), { x: mid.x, y: mid.y - h / 2 - capH / 2, z: mid.z, rx: Math.PI, ry: -p.spin }));
      }
    }
  }

  const c = { x: 0, z: 0 };
  // colares: lajes que abraçam o pilar (andares técnicos, plataformas de serviço)
  if (r.chance(0.3)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const rr = Math.max(ra, rb) * r.float(1.3, 2.0);
    const L = B.L(c.x, y, c.z);
    const h = r.float(1.5, 6);
    B.add('rib', place(new THREE.CylinderGeometry(rr, rr, h, p.sides, 1, false), { x: L.x, y: L.y, z: L.z, ry: p.spin }));
  }
  // aletas / antenas
  if (r.chance(0.2)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const len = r.float(8, 40);
    const ang = r.float(0, Math.PI * 2);
    const r0 = Math.max(ra, rb) + len / 2 - 1;
    const L = B.L(c.x + Math.cos(ang) * r0, y, c.z + Math.sin(ang) * r0);
    const fin = new THREE.BoxGeometry(len, r.float(0.3, 1.2), r.float(0.5, 3), Math.max(1, Math.round(len / 4)), 1, 1);
    B.add('tower', place(fin, { x: L.x, y: L.y, z: L.z, ry: -ang }));
  }
  // âncoras (cabos) — guardam o pilar para o cabo sair da face certa
  const na = r.int(0, 2);
  for (let q = 0; q < na; q++) {
    const y = ya + r.float(0.1, 0.9) * SEG_H;
    anchors.push({ kind: 'pillar', p, y, r: lerp(ra, rb, (y - ya) / SEG_H) * 0.9 });
  }
  // fios de prumo saindo do pilar
  if (r.chance(0.12)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const ang = r.float(0, Math.PI * 2);
    const rr = lerp(ra, rb, (y - ya) / SEG_H);
    const o = B.L(c.x + Math.cos(ang) * rr, y, c.z + Math.sin(ang) * rr);
    const len = r.float(80, 260);
    const rad = r.float(0.06, 0.25);
    B.add(cableMat(rad), plumbLine(o, len, { rng: r, radius: rad }));
  }
  // luz na superfície
  if (r.chance(0.07)) {
    const y = ya + r.float(0, SEG_H);
    F.pillarCenter(p, y, c);
    const ang = r.float(0, Math.PI * 2);
    const r0 = lerp(ra, rb, (y - ya) / SEG_H);
    const rr = r0 + 2.2;
    B.lamp(c.x + Math.cos(ang) * rr, y, c.z + Math.sin(ang) * rr, r.pick(COLORS), r.float(40, 120), r.chance(0.5) ? 'faulty' : 'steady', {
      to: [c.x + Math.cos(ang) * (r0 - 0.3), y + 0.4, c.z + Math.sin(ang) * (r0 - 0.3)],
    });
  }

  // extremidades: o pilar termina aqui (em cima e/ou embaixo)
  if (!F.segmentPresent(p, j + 1)) buildCrown(F, B, p, yb, rb, r);
  if (!F.segmentPresent(p, j - 1)) buildRoot(F, B, p, ya, ra, r);
}

function buildCrown(F, B, p, y, radius, r) {
  const c = F.pillarCenter(p, y);
  const L = B.L(c.x, y, c.z);
  // laje de cobertura
  B.add('tower', place(new THREE.CylinderGeometry(radius * 1.1, radius, 3, p.sides, 1, false), { x: L.x, y: L.y + 1.5, z: L.z, ry: p.spin }));
  if (r.chance(0.5)) {
    // casa de máquinas
    const s = radius * r.float(0.6, 1.1);
    const h = r.float(8, 30);
    B.add('block', place(new THREE.BoxGeometry(s, h, s * r.float(0.6, 1)), { x: L.x, y: L.y + 3 + h / 2, z: L.z, ry: p.spin }));
  }
  // mastros e antenas
  const n = r.int(1, 5);
  for (let i = 0; i < n; i++) {
    const len = r.float(10, 60);
    const ox = r.float(-0.7, 0.7) * radius;
    const oz = r.float(-0.7, 0.7) * radius;
    B.add('duct', cylinderBetween(L.clone().add(new THREE.Vector3(ox, 3, oz)), L.clone().add(new THREE.Vector3(ox, 3 + len, oz)), r.float(0.2, 0.7), 0.1, 5));
  }
  // luzes em postes na borda da laje (a casa de máquinas pode ocupar o centro)
  const edge = (a, h) => {
    const px = c.x + Math.cos(a) * radius * 0.85;
    const pz = c.z + Math.sin(a) * radius * 0.85;
    return [px, y + h, pz, [px + Math.cos(a) * 0.6, y + 3, pz + Math.sin(a) * 0.6]];
  };
  if (r.chance(0.3)) {
    const [lx, ly, lz, to] = edge(r.float(0, Math.PI * 2), 8);
    B.lamp(lx, ly, lz, WARN, r.float(40, 90), 'faulty', { to }); // luz de obstáculo
  }
  if (r.chance(0.25)) {
    const [lx, ly, lz, to] = edge(r.float(0, Math.PI * 2), 12);
    B.lamp(lx, ly, lz, r.pick(COLORS), r.float(60, 160), 'steady', { to });
  }
}

function buildRoot(F, B, p, y, radius, r) {
  const c = F.pillarCenter(p, y);
  const L = B.L(c.x, y, c.z);
  if (r.chance(0.8)) {
    // ponta invertida pendendo no vazio
    const len = r.float(25, 130);
    // (-spin: virada, o giro se espelha — ver o bulbo em buildSegment)
    B.add('tower', place(new THREE.ConeGeometry(radius, len, p.sides, 8, true), { x: L.x, y: L.y - len / 2, z: L.z, rx: Math.PI, ry: -p.spin }));
  } else {
    // corte seco com feixes de cabos pendendo
    B.add('tower', place(new THREE.CylinderGeometry(radius, radius * 0.5, 3, p.sides, 1, false), { x: L.x, y: L.y - 1.5, z: L.z, ry: p.spin }));
    const n = r.int(3, 7);
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + r.float(0, 0.5);
      const o = L.clone().add(new THREE.Vector3(Math.cos(ang) * radius * 0.6, -2, Math.sin(ang) * radius * 0.6));
      const len = r.float(30, 180);
      const rad = r.float(0.15, 0.5);
      B.add(cableMat(rad), plumbLine(o, len, { rng: r, radius: rad }));
    }
  }
}

// ─── passarelas ─────────────────────────────────────────────────────────────

function genWalkways(F, B, box, anchors) {
  const { spacing, ySpacing } = WALK;
  // ao longo de Z (inclui a ponte inicial)
  for (const a of lattice(box.x0, box.x1, spacing)) {
    for (const b of lattice(box.y0, box.y1, ySpacing)) {
      const w = F.walkZ(a, b);
      if (w) buildWalk(F, B, 'z', a * spacing, b * ySpacing, box.z0, box.z1, w, a * 7919 + b * 104729, anchors);
    }
  }
  // ao longo de X
  for (const b of lattice(box.y0, box.y1, ySpacing, ySpacing / 2)) {
    for (const c of lattice(box.z0, box.z1, spacing, spacing / 2)) {
      const w = F.walkX(b, c);
      if (w) buildWalk(F, B, 'x', c * spacing + spacing / 2, b * ySpacing + ySpacing / 2, box.x0, box.x1, w, b * 15485863 + c * 7919 + 17, anchors);
    }
  }
}

function buildWalk(F, B, axis, u, y, t0, t1, w, salt, anchors) {
  const mod = WALK.module;
  // P(t, dy, du): ponto na linha (t ao longo do eixo, du lateral)
  const G = (t, dy = 0, du = 0) => (axis === 'z' ? [u + du, y + dy, t] : [t, y + dy, u + du]);
  const P = (t, dy, du) => B.L(...G(t, dy, du));
  const rotY = axis === 'z' ? 0 : Math.PI / 2;
  const hw = w.width / 2;

  if (B.lod) {
    let run = null;
    const flush = () => {
      if (!run) return;
      const c = P((run.a + run.b) / 2, -0.4);
      B.add('bridge', place(new THREE.BoxGeometry(w.width, 0.8, run.b - run.a), { x: c.x, y: c.y, z: c.z, ry: rotY }));
      run = null;
    };
    for (const m of lattice(t0, t1, mod)) {
      const ts = m * mod;
      if (F.walkGap(salt, ts + mod / 2, w.main, y)) flush();
      else if (run) run.b = ts + mod;
      else run = { a: ts, b: ts + mod };
    }
    flush();
    return;
  }

  for (const m of lattice(t0, t1, mod)) {
    const ts = m * mod;
    if (F.walkGap(salt, ts + mod / 2, w.main, y)) continue;
    const [gx0, gy0, gz0] = G(ts, -4, -hw - 1);
    const [gx1, gy1, gz1] = G(ts + mod, 12, hw + 1);
    const res = F.reservedHit(Math.min(gx0, gx1), gy0, Math.min(gz0, gz1), Math.max(gx0, gx1), gy1, Math.max(gz0, gz1));
    if (res && !res.keepWalkways) continue;

    const r = rngAt(F.seed, m, salt, axis === 'z' ? 1 : 2, 40);
    const len = mod - 0.35;
    // a passarela acaba no vazio: ponta quebrada, lajes penduradas, ferragem exposta
    for (const [edge, gapT] of [[ts + mod, ts + mod + mod / 2], [ts, ts - mod / 2]]) {
      if (!F.walkGap(salt, gapT, w.main, y)) continue;
      const dir = edge > ts ? 1 : -1;
      for (let q = 0; q < 4; q++) {
        const du = r.float(-hw, hw);
        const a = P(edge, -0.4, du);
        const b = P(edge + dir * r.float(0.5, 3), -r.float(0.5, 4), du + r.float(-1, 1));
        B.add('rib', cylinderBetween(a, b, 0.05, 0.03, 4)); // vergalhões
      }
      const slabLen = r.float(3, 7);
      const g = new THREE.BoxGeometry(w.width * r.float(0.4, 0.9), 0.6, slabLen);
      g.translate(0, 0, (dir * slabLen) / 2);
      g.rotateX(dir * r.float(0.6, 1.2));
      g.rotateY(rotY);
      const p = P(edge, -0.5, r.float(-hw / 2, hw / 2));
      g.translate(p.x, p.y, p.z);
      B.add('bridge', g);
    }
    const c = P(ts + len / 2, -0.4);
    // tabuleiro
    B.add('bridge', place(new THREE.BoxGeometry(w.width, 0.8, len, Math.ceil(w.width / 3), 1, 3), { x: c.x, y: c.y, z: c.z, ry: rotY }));
    // quilha
    B.add('bridge', cylinderBetween(P(ts + 0.3, -2.2), P(ts + len - 0.3, -2.2), 1.4, 0.6, 6));
    // corrimãos (abertos do lado do trilho onde há uma estação de transportador)
    for (const s of [-1, 1]) {
      if (w.track && s === w.track.side && stationNear(ts, ts + mod)) continue;
      B.add('bridge', cylinderBetween(P(ts, 1.1, s * (hw - 0.2)), P(ts + mod, 1.1, s * (hw - 0.2)), 0.12, 0.12, 5, { heightSegments: 3, open: true }));
    }
    if (res) continue; // dentro de zona reservada: só o tabuleiro

    // costelas em "regiões costeladas": pórticos — um arco inteiro de pé sobre uma
    // travessa que passa por baixo do tabuleiro (a travessa segura a passarela; nada solto)
    const ribbed = F.noise3(ts * 0.01, salt * 0.001, 9.1) > -0.1;
    if (ribbed && r.chance(0.55)) {
      const rad = hw + (w.track ? r.float(1.8, 2.4) : r.float(3, 5.5)); // com trilho: longe do vagão
      const tube = r.float(0.2, 0.45);
      const rib = new THREE.TorusGeometry(rad, tube, 6, 30, Math.PI);
      rib.scale(1, r.float(1.0, 1.6), 1);
      rib.rotateY(rotY);
      const q = P(ts + len / 2, -1);
      rib.translate(q.x, q.y, q.z);
      B.add('rib', rib);
      // a travessa: de pé a pé do arco, rente à face de baixo do tabuleiro
      const t2 = ts + len / 2;
      B.add('rib', cylinderBetween(P(t2, -1.05, -rad - tube), P(t2, -1.05, rad + tube), tube + 0.12, tube + 0.12, 6));
    }
    if (r.chance(0.1)) {
      // o poste fica em cima do tabuleiro, rente à borda (longe do trilho, se houver)
      const side = w.track ? -w.track.side : r.sign();
      const [lx, ly, lz] = G(ts + len / 2, 5, side * Math.max(0.6, hw - 1.3));
      // o pé do poste encosta no tabuleiro (o topo do tabuleiro é a altura da passarela)
      const post = G(ts + len / 2, -0.05, side * Math.max(1.2, hw - 0.45));
      B.lamp(lx, ly, lz, (m & 1) ? SODIUM : FLUORO, r.float(30, 50), r.chance(0.5) ? 'faulty' : 'steady', { to: post });
      B.socket(post[0], post[1] + 1.15, post[2], rotY + (side > 0 ? Math.PI : 0));
    }
    if (r.chance(0.12)) {
      const [ax, ay, az] = G(ts + len / 2, -1.2, (w.track ? -w.track.side : r.sign()) * hw);
      anchors.push({ kind: 'point', gx: ax, gy: ay, gz: az });
    }
    if (r.chance(0.05)) B.add('cable', plumbLine(P(ts + len / 2, -2, r.sign() * hw * 0.8), r.float(100, 300), { rng: r, radius: r.float(0.06, 0.18) }));
  }
}

// ─── dutos ──────────────────────────────────────────────────────────────────

function genDucts(F, B, box) {
  const { spacing, ySpacing } = DUCT;
  for (const b of lattice(box.y0, box.y1, ySpacing, 40)) {
    for (const c of lattice(box.z0, box.z1, spacing, 70)) {
      const d = F.duct('x', b, c);
      if (d) buildDuct(F, B, 'x', b * ySpacing + 40, c * spacing + 70, box.x0, box.x1, d);
    }
  }
  for (const a of lattice(box.x0, box.x1, spacing, 150)) {
    for (const b of lattice(box.y0, box.y1, ySpacing, 140)) {
      const d = F.duct('z', a, b);
      if (d) buildDuct(F, B, 'z', a * spacing + 150, b * ySpacing + 140, box.z0, box.z1, d);
    }
  }
  for (const a of lattice(box.x0, box.x1, spacing, 230)) {
    for (const c of lattice(box.z0, box.z1, spacing, 10)) {
      const d = F.duct('y', a, c);
      if (d) buildDuct(F, B, 'y', a * spacing + 230, c * spacing + 10, box.y0, box.y1, d);
    }
  }
}

function buildDuct(F, B, axis, fa, fb, t0, t1, d) {
  // eixo x: (t, fa=y, fb=z) · eixo z: (fa=x, fb=y, t) · eixo y: (fa=x, t, fb=z)
  const G = (t, da = 0, db = 0) =>
    axis === 'x' ? [t, fa + da, fb + db] : axis === 'z' ? [fa + da, fb + db, t] : [fa + da, t, fb + db];
  const P = (t, da, db) => B.L(...G(t, da, db));
  const piece = DUCT.piece;
  const R = d.radius;
  for (const n of lattice(t0, t1, piece)) {
    const ts = n * piece;
    if (F.ductGap(d.salt, ts + piece / 2)) continue;
    if (F.inBarrier(G(ts + piece / 2)[1], R + 4)) continue;
    const [ax, ay, az] = G(ts, -R - 2, -R - 2);
    const [bx, by, bz] = G(ts + piece, R + 2, R + 2);
    if (F.reservedHit(Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz), Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz))) continue;
    // nem através da torre de um elevador grande (fechava a escada de manutenção)
    if (F.passageColumnHit(Math.min(ax, bx), Math.min(ay, by), Math.min(az, bz), Math.max(ax, bx), Math.max(ay, by), Math.max(az, bz))) continue;

    if (B.lod) {
      B.add('duct', cylinderBetween(P(ts), P(ts + piece), R, R, 6, { heightSegments: 1 }));
      continue;
    }
    B.add('duct', cylinderBetween(P(ts), P(ts + piece), R, R, 10, { heightSegments: 4 }));
    if (Math.abs(Math.sin(ts * 3.17 + d.salt * 1.13) * 43758.5453) % 1 < 0.03) {
      const [ex, ey, ez] = G(ts + piece / 2, axis === 'y' ? 0 : R, 0);
      B.emit({ type: 'steam', x: ex, y: ey, z: ez, h: 10 + R * 4, rate: 0.18 });
    }
    if (n % d.ringEvery === 0) {
      const ring = new THREE.TorusGeometry(R * 1.3, R * 0.2, 6, 20);
      if (axis === 'x') ring.rotateY(Math.PI / 2);
      if (axis === 'y') ring.rotateX(Math.PI / 2);
      const q = P(ts + 2);
      ring.translate(q.x, q.y, q.z);
      B.add('rib', ring);
    }
    for (let k = 0; k < d.bundle; k++) {
      const ang = k * 2.1 + d.salt;
      const off = R * 1.55;
      const da = Math.cos(ang) * off;
      const db = Math.sin(ang) * off;
      const rs = R * 0.22;
      B.add('duct', cylinderBetween(P(ts, da, db), P(ts + piece, da, db), rs, rs, 6, { heightSegments: 2, open: true }));
    }
    const h = Math.abs(Math.sin(ts * 12.9898 + d.salt * 78.233) * 43758.5453) % 1;
    if (h < 0.03) {
      const [lx, ly, lz] = G(ts + piece / 2, R + 1.5, 0);
      B.lamp(lx, ly, lz, FLUORO, 50, 'faulty', { to: G(ts + piece / 2 + 0.6, R - 0.2, 0) });
    }
  }
}

// ─── cabos ──────────────────────────────────────────────────────────────────

function genCables(F, B, anchors) {
  const c = { x: 0, z: 0 };
  for (const a of anchors) {
    // posição global de partida (para pilares: calculada depois, na face certa)
    let gx, gy, gz;
    if (a.kind === 'pillar') {
      F.pillarCenter(a.p, a.y, c);
      gx = c.x;
      gy = a.y;
      gz = c.z;
    } else {
      gx = a.gx;
      gy = a.gy;
      gz = a.gz;
    }
    const r = rngAt(F.seed, Math.round(gx * 10), Math.round(gy * 10), Math.round(gz * 10), 50);
    if (!r.chance(a.kind === 'point' ? 0.9 : 0.45)) continue;

    const ci = Math.floor(gx / PILLAR_CELL);
    const ck = Math.floor(gz / PILLAR_CELL);
    for (let tries = 0; tries < 5; tries++) {
      const di = r.int(-2, 2);
      const dk = r.int(-2, 2);
      if (!di && !dk) continue;
      const q = F.pillar(ci + di, ck + dk);
      if (!q || q === a.p) continue;
      const ty = gy + r.float(-35, 35);
      const j = Math.floor(ty / SEG_H);
      if (!F.segmentPresent(q, j)) continue;
      const tc = F.pillarCenter(q, ty);
      const tr = F.pillarRadius(q, j) * 0.9;
      // pontos nas faces que se olham
      let dx = gx - tc.x;
      let dz = gz - tc.z;
      let dl = Math.hypot(dx, dz) || 1;
      const ex = tc.x + (dx / dl) * tr;
      const ez = tc.z + (dz / dl) * tr;
      let sx = gx;
      let sz = gz;
      if (a.kind === 'pillar') {
        dx = ex - gx;
        dz = ez - gz;
        dl = Math.hypot(dx, dz) || 1;
        sx = gx + (dx / dl) * a.r;
        sz = gz + (dz / dl) * a.r;
      }
      const span = Math.hypot(ex - sx, ty - gy, ez - sz);
      if (span < 20 || span > 240) continue;
      B.add('hose', catenaryCable(B.L(sx, gy, sz), B.L(ex, ty, ez), {
        rng: r,
        noise3: F.noise3,
        radius: r.float(0.25, 1.6), // (grosso: colide — world/cables.js cableMat)
        sag: r.float(0.08, 0.35),
      }));
      break;
    }
  }
}

// (Os "objetos flutuantes" — prédios, lajes, gaiolas e anéis presos a nada —
//  foram removidos: na Cidade de Blame! não há mágica; tudo o que existe está
//  apoiado, pendurado ou preso a alguma coisa.)
