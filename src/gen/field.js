// ─────────────────────────────────────────────────────────────────────────────
//  Field: a "lei" do mundo infinito.
//
//  Define, como funções puras da seed, as estruturas que atravessam o espaço
//  sem fim. Os geradores de chunk só perguntam ao Field "o que existe aqui?"
//  e constroem a parte que cai dentro do próprio cubo.
//
//   PILARES   colunas verticais em grade 2D (x,z). Infinitas em y, mas com
//             lacunas definidas por ruído → torres que pendem do nada, torres
//             que sobem do nada, fragmentos flutuando. Oscilam suavemente.
//   PASSARELAS  retas infinitas em treliça (ao longo de Z e de X), em alturas
//             periódicas. A ponte inicial é a passarela (0,0) ao longo de Z.
//   DUTOS     tubos infinitos ao longo de X, Z e Y — o "sistema".
//   MEGAESTRUTURAS (escala de quilômetros, ver MEGA abaixo):
//     GALERIAS   túneis retangulares infinitos ao longo de X ou Z (fechados)
//     POÇOS      fossos verticais infinitos (fechados)
//     ESTRATOS   pisos colossais infinitos com buracos e colunas (abertos)
//     TRELIÇAS   estrutura espacial de vigas em regiões do mundo (aberta)
//     ESCADARIAS escadas colossais que sobem/descem para sempre
//     Onde dois volumes se cruzam, as paredes de um são removidas dentro do
//     outro: os espaços se fundem.
//   REGIÕES   o caráter muda de lugar para lugar (ruído de baixíssima freq.):
//     teia     pilares, rede andável, cabos — a trama aberta
//     colmeia  interior fechado: labirinto 3D de salas de concreto
//     maciço   blocos do tamanho de montanhas separados por cânions estreitos
//     vazio    quase nada além das megaestruturas
//   CONDUTOS  tubos colossais fechados, com piso interno (ao longo de X e Z)
//   CAMADAS   lajes intransponíveis de 72 m a cada 2,88 km de altura; só se
//             atravessa pelas PASSAGENS, onde sobem e descem elevadores colossais
//   CONSTRUTORES  canteiros onde máquinas continuam erguendo a Cidade
//   REDE      o mundo ANDÁVEL: plataformas (nós) numa grade 3D com ruído,
//             ligadas por pontes, rampas, escadas, tubos e espirais (arestas).
//             Cada ligação é sorteada — não há caminho desenhado, mas a rede
//             é densa o bastante para ser infinita (percolação).
//
//  Unidades em metros. Tudo com coordenadas GLOBAIS (antes da origem flutuante).
// ─────────────────────────────────────────────────────────────────────────────
import { createNoise3D } from '../core/noise.js';
import { mulberry32 } from '../core/rng.js';
import { hash4, rngAt } from './hash.js';

export const CHUNK = 192; // aresta do cubo de geração
export const PILLAR_CELL = 96; // CHUNK / 2 — cada chunk possui 2×2 células de pilar
export const SEG_H = 48; // CHUNK / 4 — altura de um segmento de pilar
export const MACRO = 1600; // aresta da célula das megaestruturas

export const WALK = { spacing: 480, ySpacing: 288, prob: 0.22, module: 12 };
export const DUCT = { spacing: 320, ySpacing: 208, prob: 0.22, piece: 24 };
export const NODE = { h: 96, v: 48 }; // célula da rede andável (horizontal, vertical)
/**
 * Transportadores: trilho paralelo a algumas passarelas infinitas.
 *   gap      distância da borda da passarela até o centro do trilho (m)
 *   station  espaçamento das estações ao longo da linha (m)
 *   carLen / carW / carH  vagão
 */
/**
 * Setores inundados: placas (MEGA.tile) do alto das camadas e dos estratos
 * cobertas por uma lâmina d'água parada, contida por diques baixos.
 *   depth  profundidade da água (m) · dam  altura do dique (m, dá para pular)
 */
export const FLOOD = { depth: 0.6, dam: 0.85, damW: 1.6, thr: 0.2 };
export const TRANSIT = { prob: 0.4, gap: 7, station: 1440, carLen: 22, carW: 5, carH: 4.6 };
/**
 * Máquinas colossais em trânsito: trincheiras cavadas por baixo das camadas,
 * ao longo das linhas da grade das passagens (nunca cruzam um poço de
 * elevador). Dentro delas, pórticos de centenas de metros se arrastam.
 *   half: meia largura da trincheira · depth: quanto ela sobe na laje
 *   spacing: distância entre máquinas na mesma trincheira (onde houver)
 */
export const COLOSSUS = { prob: 0.3, half: 80, depth: 56, spacing: 2600, fill: 0.75, speed: 4, len: 260, width: 118, deck: 38 };
/**
 * Escotilhas de manutenção (fase 4.2 — subir nas máquinas): ao longo de cada
 * trincheira, uma placa da laje (MEGA.tile) falta a cada ~1,3 km, no lado da
 * trincheira. Uma passarela leva a uma escada que desce até uma plataforma na
 * altura das longarinas da máquina (b.bottom + COLOSSUS.deck): ela passa por
 * baixo, e dá para subir nela. Um terminal ao lado mostra quando vem a próxima.
 *   every: placas entre escotilhas · prob: quantas existem
 */
export const HATCH = { every: 16, prob: 0.8 };
/**
 * Relevo sobre as camadas: o topo de uma camada não é um plano liso até o
 * horizonte — tem plataformas, espinhaços de serviço, galpões e chaminés de
 * ventilação, em distritos mais densos e mais ralos. Célula de 160 m.
 * Até ~36 m de altura: acima disso começam passarelas, nós e blocos.
 */
export const RELIEF = { cell: 160, maxH: 36 };
/**
 * Setores de energia: distritos de formas e tamanhos irregulares (nada de
 * grade). Voronoi com pesos sobre uma grade de pontos sorteados — pesos
 * grandes fazem setores enormes, pequenos fazem setores minúsculos. Na
 * vertical, só as camadas separam setores: um setor é um distrito entre duas
 * lajes. Cada setor está permanentemente apagado, instável (a luz vai e vem
 * em ondas) ou com energia.
 *
 * A MESMA conta roda no shader (shaders/chunks.js → sectorPower), com o mesmo
 * hash inteiro — as lâmpadas (CPU) e as janelas (GPU) concordam.
 */
export const SECTOR = { cell: 900, dark: 0.3, unstable: 0.15, salt: 910 };
/**
 * Estruturas únicas (ver o cofre, Estruturas-unicas): raras, no alto das
 * camadas (chão firme, espaço livre em cima, vistas de longe), no fim das
 * cadeias de pistas. Uma por célula de ~16 km (quando existe).
 *   console  terminal ativo: um salão com um console que ainda tem energia própria
 *   archive  arquivo de registros: um salão comprido cheio de estantes
 *   plant    usina: um bloco-núcleo com chaminés
 */
/** Religar um setor (app/power.js): a frente da luz voltando, em m/s. */
export const RESTORE_SPEED = 40;
export const UNIQUE = { cell: 16000, prob: 0.75, kinds: ['console', 'archive', 'plant'], plantHall: 0.45 };
export const HIVE = 48; // célula da colmeia (uma sala)

export const MEGA = {
  tile: 80, // lado das placas de parede (m)
  wall: 18, // espessura de paredes (m)
  galleryY: 2400, // espaçamento vertical entre linhas de galerias
  galleryH: 3600, // espaçamento horizontal
  galleryProb: 0.55,
  shaft: 3200,
  shaftProb: 0.5,
  conduit: 2200, // espaçamento dos condutos
  conduitProb: 0.35,
  strataProb: 0.45,
  strataThick: 24,
  frame: 240, // célula da treliça
  stair: 2800, // espaçamento lateral das escadarias
  stairRise: 2400, // espaçamento vertical entre escadarias paralelas
  stairProb: 0.3,
  stairSlope: 0.5,
  barrier: 60 * 48, // espaçamento vertical das camadas intransponíveis (2880 m)
  barrierTop0: 31 * 48, // topo da camada n=0 (1488 m)
  barrierThick: 72,
  barrierProb: 0.8,
  passage: 1920, // grade das passagens (elevadores colossais)
  passageProb: 0.45,
  passageSize: 96,
  builder: 1400, // grade dos canteiros de obra dos Construtores
};

/** Alinha uma altura a um nível da rede (piso ligeiramente abaixo, p/ plataformas pousarem). */
const levelAlign = (y) => Math.round(y / 48) * 48 - 0.4;

/**
 * Direções "de saída" de cada nó. Cada aresta pertence ao nó de onde sai, então
 * é gerada uma única vez (pelo chunk dono desse nó).
 */
export const EDGE_DIRS = [
  [1, 0, 0], [0, 0, 1], [1, 0, 1], [1, 0, -1], // mesmo nível (inclui diagonais)
  [2, 0, 0], [0, 0, 2], // pontes longas sobre o vazio (só se a célula do meio estiver vazia)
  [1, 1, 0], [1, -1, 0], [0, 1, 1], [0, -1, 1], [1, 1, 1], [1, -1, 1], [1, 1, -1], [1, -1, -1], // um nível acima/abaixo
  [0, 1, 0], // torre em espiral
];
const MAX_STAIR_SLOPE = Math.tan((36 * Math.PI) / 180);

export class Field {
  /**
   * @param {number} seed
   * @param {{min:number[],max:number[],keepWalkways?:boolean}[]} reserved
   *        caixas onde nada é gerado (keepWalkways: passarelas continuam passando)
   */
  constructor(seed, reserved = []) {
    this.restored = new Map(); // setores religados pelo jogador: id → { x, y, z, t0 } (app/power.js)
    this.seed = seed >>> 0;
    this.noise3 = createNoise3D(mulberry32(this.seed ^ 0x9e3779b9));
    this.reserved = reserved;
    this._pillars = new Map();
    this._nodes = new Map();
    this._mega = new Map();
  }

  _memo(key, fn) {
    if (this._mega.has(key)) return this._mega.get(key);
    const v = fn();
    if (this._mega.size > 20000) this._mega.clear();
    this._mega.set(key, v);
    return v;
  }

  // ── galerias (túneis colossais) ──────────────────────────────────────────
  //  eixo X: índices (b, c) → piso perto de b·galleryY, centro z perto de c·galleryH
  //  eixo Z: índices (a, b) → centro x perto de a·galleryH + meio, piso perto de b·galleryY + meio

  gallery(axis, u, v) {
    return this._memo(`g${axis}${u},${v}`, () => {
      const { galleryY, galleryH, galleryProb } = MEGA;
      const salt = axis === 'x' ? 200 : 201;
      const forced = axis === 'x' && u === 0 && v === 0; // o lugar onde tudo começa
      if (!forced && hash4(this.seed, u, v, 0, salt) > galleryProb) return null;
      const r = rngAt(this.seed, u, v, 0, salt + 10);
      const g = { axis, id: `g${axis}${u},${v}`, roof: r.chance(0.82) };
      g.w = r.float(200, 460);
      g.h = r.float(260, 720);
      if (axis === 'x') {
        g.floor = levelAlign(u * galleryY + r.float(-500, 500));
        g.c = v * galleryH + r.float(-700, 700); // centro em z
      } else {
        g.c = u * galleryH + galleryH / 2 + r.float(-700, 700); // centro em x
        g.floor = levelAlign(v * galleryY + galleryY / 2 + r.float(-500, 500));
      }
      if (forced) Object.assign(g, { w: 360, h: 528, floor: -144.4, c: 0, roof: true });
      g.top = g.floor + g.h;
      return g;
    });
  }

  /** Galerias cujo volume pode passar perto de (x,y,z). */
  galleriesNear(x, y, z) {
    const { galleryY, galleryH } = MEGA;
    const out = [];
    const bx = Math.round(y / galleryY);
    const cx = Math.round(z / galleryH);
    for (let b = bx - 1; b <= bx + 1; b++) {
      for (let c = cx - 1; c <= cx + 1; c++) {
        const g = this.gallery('x', b, c);
        if (g) out.push(g);
      }
    }
    const az = Math.round((x - galleryH / 2) / galleryH);
    const bz = Math.round((y - galleryY / 2) / galleryY);
    for (let a = az - 1; a <= az + 1; a++) {
      for (let b = bz - 1; b <= bz + 1; b++) {
        const g = this.gallery('z', a, b);
        if (g) out.push(g);
      }
    }
    return out;
  }

  // ── camadas intransponíveis ──────────────────────────────────────────────

  barrier(n) {
    return this._memo(`b${n}`, () => {
      const forced = n === 0 || n === -1; // sempre há um teto e um chão perto da origem
      if (!forced && hash4(this.seed, n, 0, 0, 600) > MEGA.barrierProb) return null;
      const top = n * MEGA.barrier + MEGA.barrierTop0;
      return { n, top, bottom: top - MEGA.barrierThick };
    });
  }

  barriersNear(y) {
    const n0 = Math.round((y - MEGA.barrierTop0) / MEGA.barrier);
    const out = [];
    for (let n = n0 - 1; n <= n0 + 1; n++) {
      const b = this.barrier(n);
      if (b) out.push(b);
    }
    return out;
  }

  /** O ponto está dentro (ou quase) do concreto de uma camada? */
  inBarrier(y, margin = 2) {
    return this.barriersNear(y).some((b) => y > b.bottom - margin && y < b.top + margin);
  }

  /** O intervalo de alturas [y0, y1] toca alguma camada? */
  touchesBarrier(y0, y1) {
    return this.barriersNear((y0 + y1) / 2).some((b) => y1 > b.bottom - 2 && y0 < b.top + 2);
  }

  /** Passagem (poço de elevador) na célula (pi, pk) da camada n, ou null. */
  passage(n, pi, pk) {
    return this._memo(`p${n},${pi},${pk}`, () => {
      if (hash4(this.seed, pi, n, pk, 601) > MEGA.passageProb) return null;
      const r = rngAt(this.seed, pi, n, pk, 602);
      const P = MEGA.passage;
      return { n, pi, pk, x: (pi + r.float(0.25, 0.75)) * P, z: (pk + r.float(0.25, 0.75)) * P, size: MEGA.passageSize };
    });
  }

  /** A laje da camada existe neste ponto? (só as passagens a perfuram) */
  barrierSolid(b, x, z) {
    const P = MEGA.passage;
    const p = this.passage(b.n, Math.floor(x / P), Math.floor(z / P));
    if (p && Math.abs(x - p.x) < p.size / 2 && Math.abs(z - p.z) < p.size / 2) return false;
    return !this.hatchAt(b, x, z);
  }

  // ── escotilhas de manutenção (HATCH) ─────────────────────────────────────

  /** A escotilha j da trincheira (camada n, eixo, linha c), ou null. */
  hatch(n, axis, c, j) {
    return this._memo(`H${n}${axis}${c},${j}`, () => {
      if (!this.ceilingLane(n, axis, c)) return null;
      if (hash4(this.seed, n, c * 2 + (axis === 'x' ? 0 : 1), j, 1320) > HATCH.prob) return null;
      const T = MEGA.tile;
      const ta = j * HATCH.every + 2 + Math.floor(hash4(this.seed, n, c, j, 1321) * (HATCH.every - 4));
      const side = hash4(this.seed, n, j, c, 1322) < 0.5 ? 1 : -1;
      const lat = c * MEGA.passage;
      const t = (ta + 0.5) * T; // o meio da placa, ao longo da trincheira
      const u = lat + side * T / 2; // o meio da placa, de lado
      return {
        id: `h${n}${axis}${c}:${j}`, n, axis, c, j, side, lat, t,
        x: axis === 'x' ? t : u,
        z: axis === 'x' ? u : t,
      };
    });
  }

  /** A escotilha cuja placa contém (x,z) no topo da camada b, ou null. */
  hatchAt(b, x, z) {
    const P = MEGA.passage;
    const T = MEGA.tile;
    for (const axis of ['x', 'z']) {
      const along = axis === 'x' ? x : z;
      const lat = axis === 'x' ? z : x;
      const c = Math.round(lat / P);
      const d = lat - c * P;
      if (Math.abs(d) >= T || !this.ceilingLane(b.n, axis, c)) continue;
      const h = this.hatch(b.n, axis, c, Math.floor(along / (T * HATCH.every)));
      if (h && Math.sign(d) === h.side && Math.abs(along - h.t) < T / 2) return h;
    }
    return null;
  }

  /** Escotilhas da camada b a até R de (x,z). */
  hatchesNear(b, x, z, R) {
    const P = MEGA.passage;
    const span = MEGA.tile * HATCH.every;
    const out = [];
    for (const axis of ['x', 'z']) {
      const along = axis === 'x' ? x : z;
      const lat = axis === 'x' ? z : x;
      for (let c = Math.floor((lat - R) / P); c <= Math.ceil((lat + R) / P); c++) {
        if (!this.ceilingLane(b.n, axis, c)) continue;
        for (let j = Math.floor((along - R) / span); j <= Math.floor((along + R) / span); j++) {
          const h = this.hatch(b.n, axis, c, j);
          if (h && Math.hypot(h.x - x, h.z - z) < R) out.push(h);
        }
      }
    }
    return out;
  }

  // ── setores de energia ───────────────────────────────────────────────────

  /** Setor em (x, y, z): { id, band, i, k, state: 'dark'|'unstable'|'powered', phase }. */
  /**
   * O setor em (x,y,z). raw: a lei do mundo pura, sem o que o jogador mudou
   * (setores religados — this.restored, app/power.js). Um setor apagado que
   * foi religado vem com state 'restored' (conta como energizado).
   */
  sectorAt(x, y, z, raw = false) {
    const C = SECTOR.cell;
    const band = Math.floor((y - MEGA.barrierTop0) / MEGA.barrier);
    const ci = Math.floor(x / C);
    const ck = Math.floor(z / C);
    let best = Infinity;
    let bi = ci;
    let bk = ck;
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let k = ck - 1; k <= ck + 1; k++) {
        const h = Math.floor(hash4(this.seed, i, band, k, SECTOR.salt) * 4294967296);
        const px = (i + (h & 1023) / 1024) * C;
        const pz = (k + ((h >>> 10) & 1023) / 1024) * C;
        const w = (((h >>> 20) & 1023) / 1024) * C * 0.8;
        const d = (x - px) * (x - px) + (z - pz) * (z - pz) - w * w;
        if (d < best) {
          best = d;
          bi = i;
          bk = k;
        }
      }
    }
    const r = hash4(this.seed, bi, band, bk, SECTOR.salt + 1);
    let state = r < SECTOR.dark ? 'dark' : r < SECTOR.dark + SECTOR.unstable ? 'unstable' : 'powered';
    const id = `S${band},${bi},${bk}`;
    if (!raw && state === 'dark' && this.restored.has(id)) state = 'restored';
    const h = Math.floor(hash4(this.seed, bi, band, bk, SECTOR.salt) * 4294967296);
    return {
      id, band, i: bi, k: bk, state,
      phase: hash4(this.seed, bi, band, bk, SECTOR.salt + 2),
      px: (bi + (h & 1023) / 1024) * C, // o ponto que gera a célula (perto do "meio" do setor)
      pz: (bk + ((h >>> 10) & 1023) / 1024) * C,
    };
  }

  /** Luz do setor em (x,y,z) agora: 0 apagado · onda 0..1 instável · 1 com energia. */
  sectorLight(x, y, z, time) {
    const s = this.sectorAt(x, y, z);
    if (s.state === 'dark') return 0;
    if (s.state === 'powered') return 1;
    if (s.state === 'restored') {
      // religado: a luz volta como uma frente que sai da subestação (40 m/s)
      const r = this.restored.get(s.id);
      const d = Math.hypot(x - r.x, z - r.z) + Math.abs(y - r.y) * 0.5;
      const front = (time - r.t0) * RESTORE_SPEED;
      return Math.min(1, Math.max(0, (front - d) / 24));
    }
    const w = Math.sin(time * 0.6 + s.phase * 6.2831 + (x + z) * 0.004);
    const t = Math.min(1, Math.max(0, (w + 0.3) / 0.4));
    return t * t * (3 - 2 * t);
  }

  // ── estruturas únicas ────────────────────────────────────────────────────

  /**
   * Estrutura única da célula (ui, uk) no alto da camada n, ou null.
   * { id, kind, n, x, y (topo da camada), z, hx, hz (meias larguras), h, door (0 +x · 1 −x · 2 +z · 3 −z) }
   */
  uniqueSite(n, ui, uk) {
    return this._memo(`U${n},${ui},${uk}`, () => {
      const b = this.barrier(n);
      if (!b || hash4(this.seed, ui, n, uk, 980) > UNIQUE.prob) return null;
      const r = rngAt(this.seed, ui, n, uk, 981);
      const C = UNIQUE.cell;
      const kind = UNIQUE.kinds[r.int(0, UNIQUE.kinds.length - 1)];
      const [hx, hz, h] = kind === 'console' ? [30, 30, 22] : kind === 'archive' ? [66, 26, 26] : [42, 42, 34];
      // tenta alguns pontos da célula até achar um lugar limpo
      for (let tries = 0; tries < 6; tries++) {
        const x = (ui + r.float(0.25, 0.75)) * C;
        const z = (uk + r.float(0.25, 0.75)) * C;
        if (!this._uniqueClear(b, x, z, Math.max(hx, hz))) continue;
        return { id: `U${n},${ui},${uk}`, kind, n, x, y: b.top, z, hx, hz, h, door: r.int(0, 3), doorOff: r.float(-0.25, 0.25) };
      }
      return null;
    });
  }

  _uniqueClear(b, x, z, half) {
    // longe das passagens (elevadores) e dos canteiros dos Construtores
    const P = MEGA.passage;
    for (let pi = Math.floor((x - 500) / P); pi <= Math.floor((x + 500) / P); pi++) {
      for (let pk = Math.floor((z - 500) / P); pk <= Math.floor((z + 500) / P); pk++) {
        const p = this.passage(b.n, pi, pk);
        if (p && Math.abs(x - p.x) < half + 320 && Math.abs(z - p.z) < half + 320) return false;
      }
    }
    const S = MEGA.builder;
    for (let i = Math.floor((x - 500) / S); i <= Math.floor((x + 500) / S); i++) {
      for (let k = Math.floor((z - 500) / S); k <= Math.floor((z + 500) / S); k++) {
        if (hash4(this.seed, i, Math.round(b.top), k, 620) > 0.4) continue;
        const r = rngAt(this.seed, i, Math.round(b.top), k, 621);
        if (Math.abs(x - (i + r.float(0.3, 0.7)) * S) < half + 260 && Math.abs(z - (k + r.float(0.3, 0.7)) * S) < half + 260) return false;
      }
    }
    for (const [dx, dz] of [[0, 0], [half, half], [-half, half], [half, -half], [-half, -half]]) {
      if (!this.barrierSolid(b, x + dx, z + dz) || this.insideVoid(x + dx, b.top + 6, z + dz) || this.insideVoid(x + dx, b.top + 40, z + dz)) return false;
    }
    if (this.nearMegaWall(x, b.top + 20, z, half + 20)) return false;
    if (this.hatchesNear(b, x, z, half + 140).length) return false;
    if (this.walkwayNear(x, b.top - 2, b.top + 50, z, half + 12)) return false;
    return true;
  }

  /**
   * O console ativo de uma única: { x, y (pés), z, yaw } — a tela olha para a porta.
   * (as mesmas medidas de buildUnique em macrogen.js)
   */
  uniqueConsole(u) {
    const d = u.door;
    const ax = d === 0 ? [1, 0] : d === 1 ? [-1, 0] : d === 2 ? [0, 1] : [0, -1];
    const cx = [-ax[1], ax[0]];
    const ha = d < 2 ? u.hx : u.hz;
    const hc = d < 2 ? u.hz : u.hx;
    let a = 0;
    let c = 0;
    let y = u.y + 1.2;
    if (u.kind === 'console') {
      a = -1;
      y += 0.6; // no pedestal
    } else if (u.kind === 'archive') {
      a = ha - 7;
      c = u.doorOff * hc + 4;
    } else {
      a = ha - 2 * ha * UNIQUE.plantHall + 3 + 4;
    }
    return { x: u.x + ax[0] * a + cx[0] * c, y, z: u.z + ax[1] * a + cx[1] * c, yaw: Math.atan2(ax[0], ax[1]) };
  }

  /** Estruturas únicas perto de (x,y,z) — nas camadas perto de y. */
  uniquesNear(x, y, z, R) {
    const C = UNIQUE.cell;
    const out = [];
    for (const b of this.barriersNear(y)) {
      if (Math.abs(b.top - y) > R + 2880) continue;
      for (let i = Math.floor((x - R) / C); i <= Math.floor((x + R) / C); i++) {
        for (let k = Math.floor((z - R) / C); k <= Math.floor((z + R) / C); k++) {
          const u = this.uniqueSite(b.n, i, k);
          if (u) out.push(u);
        }
      }
    }
    return out;
  }

  /** O ponto (x,z) do topo da camada b está sob uma estrutura única (com margem)? */
  uniqueAt(b, x, z, margin = 0) {
    const C = UNIQUE.cell;
    const i0 = Math.floor(x / C);
    const k0 = Math.floor(z / C);
    for (let i = i0 - 1; i <= i0 + 1; i++) {
      for (let k = k0 - 1; k <= k0 + 1; k++) {
        const u = this.uniqueSite(b.n, i, k);
        if (u && Math.abs(x - u.x) < u.hx + margin && Math.abs(z - u.z) < u.hz + margin) return u;
      }
    }
    return null;
  }

  // ── relevo sobre as camadas ──────────────────────────────────────────────

  /**
   * Peça de relevo na célula (ci, ck) do topo da camada b, ou null.
   * { kind, x0, x1, z0, z1, h, … } — pegada em coordenadas globais, h acima do topo.
   *   plinth  plataforma baixa, às vezes em degraus (step: altura do degrau de cima)
   *   ridge   espinhaço de serviço comprido (axis) com dutos por cima
   *   hall    galpão com fendas de janela
   *   stack   chaminé de ventilação sobre uma base
   */
  barrierRelief(b, ci, ck) {
    return this._memo(`rl${b.n},${ci},${ck}`, () => {
      const C = RELIEF.cell;
      const cx = (ci + 0.5) * C;
      const cz = (ck + 0.5) * C;
      // distritos: onde há muito, onde quase nada (mas nunca um plano vazio por km)
      const district = this.noise3(cx * 0.0006 + 3.3, b.n * 7.1, cz * 0.0006 - 8.1) * 0.5 + 0.5;
      if (hash4(this.seed, ci, b.n, ck, 800) > 0.12 + 0.6 * district) return null;
      // longe das passagens (torre do elevador e pontes de embarque)
      const P = MEGA.passage;
      for (let pi = Math.floor((cx - 300) / P); pi <= Math.floor((cx + 300) / P); pi++) {
        for (let pk = Math.floor((cz - 300) / P); pk <= Math.floor((cz + 300) / P); pk++) {
          const p = this.passage(b.n, pi, pk);
          if (p && Math.abs(cx - p.x) < 260 && Math.abs(cz - p.z) < 260) return null;
        }
      }
      // e dos canteiros dos Construtores (mesma regra de builderSitesNear)
      const S = MEGA.builder;
      for (let i = Math.floor((cx - 300) / S); i <= Math.floor((cx + 300) / S); i++) {
        for (let k = Math.floor((cz - 300) / S); k <= Math.floor((cz + 300) / S); k++) {
          if (hash4(this.seed, i, Math.round(b.top), k, 620) > 0.4) continue;
          const r = rngAt(this.seed, i, Math.round(b.top), k, 621);
          if (Math.abs(cx - (i + r.float(0.3, 0.7)) * S) < 240 && Math.abs(cz - (k + r.float(0.3, 0.7)) * S) < 240) return null;
        }
      }
      if (this.uniqueAt(b, cx, cz, 120)) return null; // o entorno de uma estrutura única fica livre
      if (this.hatchesNear(b, cx, cz, 170).length) return null; // nem o de uma escotilha
      const r = rngAt(this.seed, ci, b.n, ck, 801);
      const roll = r.next();
      const kind = roll < 0.42 ? 'plinth' : roll < 0.68 ? 'ridge' : roll < 0.86 ? 'hall' : 'stack';
      const ox = cx + r.float(-12, 12);
      const oz = cz + r.float(-12, 12);
      let piece;
      if (kind === 'plinth') {
        const w = r.float(50, 140);
        const d = r.float(50, 140);
        const h = r.float(3, 12);
        piece = { kind, x0: ox - w / 2, x1: ox + w / 2, z0: oz - d / 2, z1: oz + d / 2, h, step: r.chance(0.4) ? r.float(3, 9) : 0 };
      } else if (kind === 'ridge') {
        const axis = r.chance(0.5) ? 'x' : 'z';
        const len = r.float(110, 156);
        const wid = r.float(10, 26);
        const h = r.float(6, 18);
        const [w, d] = axis === 'x' ? [len, wid] : [wid, len];
        piece = { kind, axis, x0: ox - w / 2, x1: ox + w / 2, z0: oz - d / 2, z1: oz + d / 2, h, pipes: r.int(1, 3) };
      } else if (kind === 'hall') {
        const w = r.float(60, 130);
        const d = r.float(40, 90);
        const h = r.float(14, 30);
        piece = { kind, x0: ox - w / 2, x1: ox + w / 2, z0: oz - d / 2, z1: oz + d / 2, h };
      } else {
        const base = r.float(24, 40);
        const h = r.float(24, RELIEF.maxH);
        piece = { kind, x0: ox - base / 2, x1: ox + base / 2, z0: oz - base / 2, z1: oz + base / 2, h, stackR: r.float(4, 9), baseH: r.float(5, 10), light: r.chance(0.35) };
      }
      // chão firme embaixo de toda a pegada, e nada atravessando o volume
      const { x0, x1, z0, z1, h } = piece;
      const mx = (x0 + x1) / 2;
      const mz = (z0 + z1) / 2;
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1], [mx, mz]]) {
        if (!this.barrierSolid(b, x, z) || this.insideVoid(x, b.top + 4, z) || this.insideVoid(x, b.top + h, z)) return null;
      }
      const half = Math.hypot(x1 - x0, z1 - z0) / 2;
      if (this.nearMegaWall(mx, b.top + h / 2, mz, half + 10)) return null;
      if (this.walkwayNear(mx, b.top - 2, b.top + h + 6, mz, half + 8)) return null;
      if (this.stairwaysIn(x0 - 30, b.top - 2, z0 - 30, x1 + 30, b.top + h + 8, z1 + 30).length) return null;
      return piece;
    });
  }

  /** O ponto (x,z) do topo da camada b está sob (ou a `margin` de) uma peça de relevo? */
  reliefAt(b, x, z, margin = 0) {
    const C = RELIEF.cell;
    const ci = Math.floor(x / C);
    const ck = Math.floor(z / C);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let k = ck - 1; k <= ck + 1; k++) {
        const p = this.barrierRelief(b, i, k);
        if (p && x > p.x0 - margin && x < p.x1 + margin && z > p.z0 - margin && z < p.z1 + margin) return p;
      }
    }
    return null;
  }

  // ── trincheiras das máquinas colossais (por baixo das camadas) ────────────

  /** A linha c da grade das passagens, no eixo dado, tem trincheira na camada n? */
  ceilingLane(n, axis, c) {
    return hash4(this.seed, n, c, axis === 'x' ? 0 : 1, 700) < COLOSSUS.prob;
  }

  /** Profundidade da trincheira sob a camada b no ponto (x,z): 0 = laje cheia. */
  trenchAt(b, x, z) {
    const P = MEGA.passage;
    const { half, depth } = COLOSSUS;
    const cz = Math.round(z / P);
    if (Math.abs(z - cz * P) < half && this.ceilingLane(b.n, 'x', cz)) return depth;
    const cx = Math.round(x / P);
    if (Math.abs(x - cx * P) < half && this.ceilingLane(b.n, 'z', cx)) return depth;
    return 0;
  }

  /** Trincheiras (camada, eixo, linha) a até R do ponto, nas camadas perto de y. */
  trenchesNear(x, y, z, R) {
    const P = MEGA.passage;
    const out = [];
    for (const b of this.barriersNear(y)) {
      if (Math.abs(b.bottom - y) > R) continue;
      for (let c = Math.floor((z - R) / P); c <= Math.ceil((z + R) / P); c++) {
        if (this.ceilingLane(b.n, 'x', c)) out.push({ id: `T${b.n}x${c}`, b, axis: 'x', lat: c * P });
      }
      for (let c = Math.floor((x - R) / P); c <= Math.ceil((x + R) / P); c++) {
        if (this.ceilingLane(b.n, 'z', c)) out.push({ id: `T${b.n}z${c}`, b, axis: 'z', lat: c * P });
      }
    }
    return out;
  }

  // ── elevadores (objetos que se movem; animados na thread principal) ───────

  /**
   * Elevadores perto de (x,y,z). Cada um: { id, kind, x, z, w, d, y0, y1, speed }.
   *   grand — colossal, atravessa uma camada pela passagem
   *   lift  — elevador de carga numa fachada do maciço
   */
  elevatorsNear(x, y, z, R = 900) {
    const out = [];
    const P = MEGA.passage;
    for (const b of this.barriersNear(y)) {
      if (Math.abs(b.top - y) > R + 400) continue;
      for (let pi = Math.floor((x - R) / P); pi <= Math.floor((x + R) / P); pi++) {
        for (let pk = Math.floor((z - R) / P); pk <= Math.floor((z + R) / P); pk++) {
          const p = this.passage(b.n, pi, pk);
          if (!p) continue;
          out.push({
            id: `E${b.n},${pi},${pk}`,
            kind: 'grand',
            x: p.x,
            z: p.z,
            w: 40,
            d: 40,
            y0: Math.floor((b.bottom - 150) / 48) * 48 - 0.4,
            y1: b.top,
            speed: 9,
          });
        }
      }
    }
    // elevadores de carga no maciço (alcance menor)
    const S = 192;
    const r2 = Math.min(R, 420);
    for (let i = Math.floor((x - r2) / S); i <= Math.floor((x + r2) / S); i++) {
      for (let j = Math.floor((y - r2) / S); j <= Math.floor((y + r2) / S); j++) {
        for (let k = Math.floor((z - r2) / S); k <= Math.floor((z + r2) / S); k++) {
          const lift = this.massifLift(i, j, k);
          if (lift) out.push(lift);
        }
      }
    }
    return out;
  }

  /** Elevador de carga numa fachada do bloco (i,j,k) do maciço, ou null. */
  massifLift(i, j, k) {
    if (hash4(this.seed, i, j, k, 610) > 0.3) return null;
    const blk = this.massifBlock(i, j, k);
    if (!blk) return null;
    const r = rngAt(this.seed, i, j, k, 611);
    const side = r.int(0, 3);
    const a = r.int(0, 1);
    const levels = r.int(2, 3);
    const y0 = Math.ceil(blk.y0 / 48) * 48 + a * 48 - 0.4;
    const y1 = Math.min(y0 + levels * 48, Math.floor(blk.y1 / 48) * 48 - 0.4);
    if (y1 - y0 < 40) return null;
    const along = side < 2 ? (blk.z0 + blk.z1) / 2 + r.float(-0.3, 0.3) * (blk.z1 - blk.z0) : (blk.x0 + blk.x1) / 2 + r.float(-0.3, 0.3) * (blk.x1 - blk.x0);
    const off = 4; // o carro corre 4 m fora da fachada
    const x = side === 0 ? blk.x0 - off : side === 1 ? blk.x1 + off : along;
    const z = side === 2 ? blk.z0 - off : side === 3 ? blk.z1 + off : along;
    return { id: `L${i},${j},${k}`, kind: 'lift', x, z, w: 6, d: 6, y0, y1, speed: 3, side };
  }

  // ── construtores ─────────────────────────────────────────────────────────

  /** Canteiros de obra perto de (x,y,z): pórticos sobre superfícies grandes. */
  builderSitesNear(x, y, z, R = 2000) {
    const out = [];
    const S = MEGA.builder;
    const surfaces = [];
    for (const b of this.barriersNear(y)) surfaces.push({ y: b.top, kind: 'barrier', ok: (px, pz) => !this.reliefAt(b, px, pz, 10) && !this.uniqueAt(b, px, pz, 120) && this.barrierSolid(b, px, pz) && this.barrierSolid(b, px + 80, pz + 80) && this.barrierSolid(b, px - 80, pz - 80) });
    for (const st of this.strataNear(y)) surfaces.push({ y: st.top, kind: 'stratum', ok: (px, pz) => this.strataSolid(st, px, pz) && this.strataSolid(st, px + 80, pz) && this.strataSolid(st, px - 80, pz) });
    for (const s of surfaces) {
      if (Math.abs(s.y - y) > R) continue;
      for (let i = Math.floor((x - R) / S); i <= Math.floor((x + R) / S); i++) {
        for (let k = Math.floor((z - R) / S); k <= Math.floor((z + R) / S); k++) {
          if (hash4(this.seed, i, Math.round(s.y), k, 620) > 0.4) continue;
          const r = rngAt(this.seed, i, Math.round(s.y), k, 621);
          const px = (i + r.float(0.3, 0.7)) * S;
          const pz = (k + r.float(0.3, 0.7)) * S;
          if (!s.ok(px, pz) || this.insideVoid(px, s.y + 20, pz)) continue;
          out.push({ id: `B${i},${Math.round(s.y)},${k}`, x: px, y: s.y, z: pz, axis: r.chance(0.5) ? 'x' : 'z', seed: r.int(0, 1e9), dead: hash4(this.seed, i, Math.round(s.y), k, 624) < 0.3 });
        }
      }
    }
    // galerias: um pórtico no eixo do piso
    for (const g of this.galleriesNear(x, y, z)) {
      if (Math.abs(g.floor - y) > R) continue;
      const along = g.axis === 'x' ? x : z;
      for (let n = Math.floor((along - R) / S); n <= Math.floor((along + R) / S); n++) {
        if (hash4(this.seed, n, Math.round(g.c), Math.round(g.floor), 622) > 0.45) continue;
        const t = (n + 0.5) * S;
        const px = g.axis === 'x' ? t : g.c;
        const pz = g.axis === 'x' ? g.c : t;
        if (this.insideVoid(px, g.floor + 20, pz, g.id)) continue;
        out.push({ id: `B${g.id},${n}`, x: px, y: g.floor, z: pz, axis: g.axis, seed: hash4(this.seed, n, 7, 7, 623) * 1e9, dead: hash4(this.seed, n, Math.round(g.c), 9, 625) < 0.3 });
      }
    }
    return out;
  }

  // ── regiões ──────────────────────────────────────────────────────────────

  /** 'teia' | 'colmeia' | 'macico' | 'vazio' — o caráter do lugar. */
  biome(x, y, z) {
    const n = this.noise3(x * 0.00026 + 50.3, y * 0.00045, z * 0.00026 - 50.7);
    if (n > 0.26) return 'colmeia';
    if (n < -0.3) return 'macico';
    const m = this.noise3(x * 0.0002 - 90.1, y * 0.0003 + 7.7, z * 0.0002 + 30.9);
    if (m > 0.42) return 'vazio';
    return 'teia';
  }

  /** Regiões onde a trama aberta (pilares, rede, flutuantes) pode existir. */
  isOpenBiome(x, y, z) {
    const b = this.biome(x, y, z);
    return b === 'teia' || b === 'vazio';
  }

  /** Um volume sólido/fechado (galeria, poço, laje de estrato) ocupa este ponto? */
  inStrataBand(y) {
    return this.strataNear(y).some((st) => y > st.bottom - 30 && y < st.top + 6);
  }

  // ── colmeia: salas de 48 m ───────────────────────────────────────────────

  /** A célula (i,j,k) da colmeia é uma sala? */
  hiveRoom(i, j, k) {
    const C = HIVE;
    const x = (i + 0.5) * C;
    const y = (j + 0.5) * C;
    const z = (k + 0.5) * C;
    if (hash4(this.seed, i, j, k, 500) > 0.64) return false;
    if (this.touchesBarrier(j * C - 2, (j + 1) * C)) return false;
    if (this.biome(x, y, z) !== 'colmeia') return false;
    if (this.insideVoid(x, y, z) || this.inStrataBand(y)) return false;
    if (this.reservedHit(x - C / 2, y - C / 2, z - C / 2, x + C / 2, y + C / 2, z + C / 2)) return false;
    // passarelas (e trilhos) atravessam a colmeia por túneis: a célula fica vazia
    if (this.walkwayNear(x, y - C / 2, y + C / 2, z, C / 2 + 2)) return false;
    return true;
  }

  // ── maciço: blocos colossais em grade de 192 m ───────────────────────────

  /** Largura da viela na linha de grade n (eixo 'x' ou 'z'). */
  massifGap(axis, n) {
    return 14 + hash4(this.seed, n, 0, axis === 'x' ? 1 : 2, 510) * 34;
  }

  /** Bloco na célula (i,j,k) do maciço: pegada e recuo, ou null. */
  massifBlock(i, j, k) {
    const S = 192;
    const x = (i + 0.5) * S;
    const y = (j + 0.5) * S;
    const z = (k + 0.5) * S;
    if (hash4(this.seed, i, 0, k, 511) > 0.82) return null; // praças: quarteirões vazios
    if (this.touchesBarrier(j * S, (j + 1) * S)) return null;
    if (this.biome(x, y, z) !== 'macico') return null;
    if (this.insideVoid(x, y, z) || this.inStrataBand(y)) return null;
    if (this.reservedHit(x - S / 2, y - S / 2, z - S / 2, x + S / 2, y + S / 2, z + S / 2)) return null;
    if (this._trackNear(x, y - S / 2, y + S / 2, z, S / 2)) return null; // cânion para o transportador
    const inset = hash4(this.seed, i, j, k, 512) < 0.22 ? 8 + hash4(this.seed, i, j, k, 513) * 24 : 0;
    return {
      x0: i * S + this.massifGap('x', i) / 2 + inset,
      x1: (i + 1) * S - this.massifGap('x', i + 1) / 2 - inset,
      z0: k * S + this.massifGap('z', k) / 2 + inset,
      z1: (k + 1) * S - this.massifGap('z', k + 1) / 2 - inset,
      y0: j * S,
      y1: (j + 1) * S,
      inset,
    };
  }

  /**
   * Bloco oco do maciço (~25%): por fora igual, por dentro um interior —
   * 'maquinas' (turbinas), 'deposito' (pilhas de blocos) ou 'silo' (rampa em
   * espiral). Só onde nenhuma passarela atravessa e sem elevador de carga.
   * Níveis internos (mezaninos / portas): y0 + 48·n − 0,4, n = 1..3.
   */
  massifHollow(i, j, k) {
    return this._memo(`mh${i},${j},${k}`, () => {
      const blk = this.massifBlock(i, j, k);
      if (!blk || hash4(this.seed, i, j, k, 530) > 0.25) return null;
      if (this.walkwayCrossings('z', blk.z0, blk.x0, blk.x1, blk.y0, blk.y1).length) return null;
      if (this.walkwayCrossings('x', blk.x0, blk.z0, blk.z1, blk.y0, blk.y1).length) return null;
      if (this.massifLift(i, j, k)) return null;
      const h = hash4(this.seed, i, j, k, 531);
      return { ...blk, type: h < 0.4 ? 'maquinas' : h < 0.7 ? 'deposito' : 'silo', levels: [1, 2, 3].map((n) => blk.y0 + 48 * n - 0.4) };
    });
  }

  // ── condutos (tubos colossais) ───────────────────────────────────────────
  //  eixo X: (b, c) → y ≈ b·conduit, z ≈ c·conduit + meio · eixo Z: (a, b) → x ≈ a·conduit + meio, y ≈ b·conduit

  conduit(axis, u, v) {
    return this._memo(`c${axis}${u},${v}`, () => {
      const salt = axis === 'x' ? 520 : 521;
      if (hash4(this.seed, u, v, 0, salt) > MEGA.conduitProb) return null;
      const r = rngAt(this.seed, u, v, 0, salt + 5);
      const R = r.float(22, 60);
      const S = MEGA.conduit;
      const c = {
        axis,
        id: `c${axis}${u},${v}`,
        R,
        y: axis === 'x' ? u * S + r.float(-400, 400) : v * S + S / 2 + r.float(-400, 400),
        lat: axis === 'x' ? v * S + S / 2 + r.float(-500, 500) : u * S + S / 2 + r.float(-500, 500),
      };
      c.floor = Math.round((c.y - R * 0.55) / 48) * 48 - 0.4; // piso alinhado aos níveis da rede
      return c;
    });
  }

  conduitsNear(x, y, z) {
    const S = MEGA.conduit;
    const out = [];
    const bx = Math.round(y / S);
    const cx = Math.round((z - S / 2) / S);
    for (let b = bx - 1; b <= bx + 1; b++) {
      for (let c = cx - 1; c <= cx + 1; c++) {
        const k = this.conduit('x', b, c);
        if (k) out.push(k);
      }
    }
    const az = Math.round((x - S / 2) / S);
    const bz = Math.round((y - S / 2) / S);
    for (let a = az - 1; a <= az + 1; a++) {
      for (let b = bz - 1; b <= bz + 1; b++) {
        const k = this.conduit('z', a, b);
        if (k) out.push(k);
      }
    }
    return out;
  }

  // ── poços (fossos verticais) ─────────────────────────────────────────────

  shaft(a, c) {
    return this._memo(`s${a},${c}`, () => {
      const { shaft, shaftProb } = MEGA;
      if (hash4(this.seed, a, c, 0, 210) > shaftProb) return null;
      const r = rngAt(this.seed, a, c, 0, 211);
      return {
        id: `s${a},${c}`,
        x: a * shaft + shaft / 2 + r.float(-600, 600),
        z: c * shaft + shaft / 2 + r.float(-600, 600),
        wx: r.float(160, 420),
        wz: r.float(160, 420),
        stairFace: r.int(0, 3),
      };
    });
  }

  shaftsNear(x, z) {
    const out = [];
    const a0 = Math.round((x - MEGA.shaft / 2) / MEGA.shaft);
    const c0 = Math.round((z - MEGA.shaft / 2) / MEGA.shaft);
    for (let a = a0 - 1; a <= a0 + 1; a++) {
      for (let c = c0 - 1; c <= c0 + 1; c++) {
        const s = this.shaft(a, c);
        if (s) out.push(s);
      }
    }
    return out;
  }

  /**
   * Um ponto está DENTRO do vazio de alguma galeria/poço (exceto `exceptId`)?
   * Usado para abrir paredes onde os volumes se cruzam.
   */
  insideVoid(x, y, z, exceptId = null) {
    for (const g of this.galleriesNear(x, y, z)) {
      if (g.id === exceptId) continue;
      if (y <= g.floor || y >= g.top) continue;
      const d = g.axis === 'x' ? Math.abs(z - g.c) : Math.abs(x - g.c);
      if (d < g.w / 2) return g;
    }
    for (const s of this.shaftsNear(x, z)) {
      if (s.id === exceptId) continue;
      if (Math.abs(x - s.x) < s.wx / 2 && Math.abs(z - s.z) < s.wz / 2) return s;
    }
    for (const c of this.conduitsNear(x, y, z)) {
      if (c.id === exceptId) continue;
      const d = c.axis === 'x' ? Math.hypot(y - c.y, z - c.lat) : Math.hypot(y - c.y, x - c.lat);
      if (d < c.R) return c;
    }
    return null;
  }

  /** Há parede/piso/teto de galeria ou poço a menos de r do ponto? (afasta plataformas) */
  nearMegaWall(x, y, z, r) {
    const T = MEGA.wall;
    for (const g of this.galleriesNear(x, y, z)) {
      const d = g.axis === 'x' ? Math.abs(z - g.c) : Math.abs(x - g.c);
      const inBand = y > g.floor - T - r && y < g.top + T + r;
      if (inBand && Math.abs(d - g.w / 2) < r + T) return true;
      if (d < g.w / 2 + T + r && y < g.floor + 1 && y > g.floor - T - 30) return true;
      if (g.roof && d < g.w / 2 + T + r && Math.abs(y - g.top - T / 2) < T + 12) return true;
    }
    for (const s of this.shaftsNear(x, z)) {
      const dx = Math.abs(x - s.x);
      const dz = Math.abs(z - s.z);
      if ((Math.abs(dx - s.wx / 2) < r + T && dz < s.wz / 2 + T + r) || (Math.abs(dz - s.wz / 2) < r + T && dx < s.wx / 2 + T + r)) {
        return true;
      }
    }
    return false;
  }

  // ── estratos (pisos infinitos) ───────────────────────────────────────────

  stratum(s) {
    return this._memo(`st${s}`, () => {
      if (hash4(this.seed, s, 0, 0, 220) > MEGA.strataProb) return null;
      const top = (s * 29 - 16) * 48 - 0.4;
      if (this.touchesBarrier(top - MEGA.strataThick - 40, top + 40)) return null;
      const r = rngAt(this.seed, s, 0, 0, 221);
      return {
        s,
        top,
        bottom: top - MEGA.strataThick,
        holeScale: r.float(0.0008, 0.0016),
        holeThr: r.float(-0.35, -0.1),
        colProb: r.float(0.25, 0.5),
      };
    });
  }

  /** Estratos cuja laje passa perto da altura y. */
  strataNear(y) {
    const s0 = Math.round((y / 48 + 16) / 29);
    const out = [];
    for (let s = s0 - 1; s <= s0 + 1; s++) {
      const st = this.stratum(s);
      if (st) out.push(st);
    }
    return out;
  }

  /** A laje do estrato existe neste ponto (não é buraco)? Resolução: uma placa. */
  strataSolid(st, x, z) {
    const T = MEGA.tile;
    const i = Math.floor(x / T);
    const k = Math.floor(z / T);
    const cx = (i + 0.5) * T;
    const cz = (k + 0.5) * T;
    if (this.noise3(cx * st.holeScale, st.s * 3.7, cz * st.holeScale) < st.holeThr) return false;
    if (hash4(this.seed, i, st.s, k, 222) < 0.04) return false;
    if (this.insideVoid(cx, st.top - 5, cz)) return false;
    return true;
  }

  // ── cascatas: água vazando de canos rompidos ─────────────────────────────
  //  Poço: uma chance a cada 480 m de altura; o jato sai de um cano que
  //  atravessa a zona das sacadas e cai até a camada de baixo (poça) ou se
  //  desfaz em névoa no abismo. Galeria: uma chance a cada 900 m; sai alto
  //  numa parede lateral e cai até o piso.
  //  Formato: { id, wall:{x,y,z}, out:{x,y,z} (boca do cano), nx, nz (para
  //  fora da parede), v (m/s horizontal), width, bottom, ends:'pool'|'mist' }

  shaftCascade(s, k) {
    return this._memo(`wc${s.id}:${k}`, () => {
      const sx = Math.round(s.x);
      const sz = Math.round(s.z);
      if (hash4(this.seed, sx, k, sz, 700) > 0.16) return null;
      const r = rngAt(this.seed, sx, k, sz, 701);
      const y = Math.floor((k * 480 + r.float(40, 440)) / 48) * 48 + 28; // entre dois níveis de sacada
      if (this.inBarrier(y, 70)) return null;
      let fi = r.int(0, 3);
      if (fi === s.stairFace) fi = (fi + 1) % 4;
      const faces = [
        ['x', s.z - s.wz / 2, 1, s.wx / 2, s.x],
        ['x', s.z + s.wz / 2, -1, s.wx / 2, s.x],
        ['z', s.x - s.wx / 2, 1, s.wz / 2, s.z],
        ['z', s.x + s.wx / 2, -1, s.wz / 2, s.z],
      ];
      const [axis, face, inward, half, center] = faces[fi];
      const t = center + r.float(-0.7, 0.7) * Math.max(0, half - 25);
      const nx = axis === 'z' ? inward : 0;
      const nz = axis === 'x' ? inward : 0;
      const wall = axis === 'x' ? { x: t, y, z: face } : { x: face, y, z: t };
      const pipe = r.float(12, 15); // atravessa a zona das sacadas (até 9 m)
      const out = { x: wall.x + nx * pipe, y, z: wall.z + nz * pipe };
      // a camada logo abaixo recolhe a água, se estiver perto
      let floor = -Infinity;
      for (const b of this.barriersNear(y - 700)) if (b.top < y - 30 && b.top > floor) floor = b.top;
      const fall = r.float(650, 1200);
      const ends = y - floor < fall ? 'pool' : 'mist';
      return { id: `wc${s.id}:${k}`, wall, out, nx, nz, v: r.float(4, 8), width: r.float(2.5, 6.5), bottom: ends === 'pool' ? floor : y - fall, ends };
    });
  }

  galleryCascade(g, n) {
    return this._memo(`wg${g.id}:${n}`, () => {
      if (hash4(this.seed, n, Math.round(g.c), Math.round(g.floor), 702) > 0.22) return null;
      const r = rngAt(this.seed, n, Math.round(g.c), Math.round(g.floor), 703);
      const side = r.chance(0.5) ? 1 : -1;
      const t = (n + r.float(0.2, 0.8)) * 900;
      const y = Math.floor((g.floor + r.float(0.3, 0.75) * g.h) / 48) * 48 + 28;
      if (y > g.top - 30 || this.touchesBarrier(g.floor, y + 10)) return null;
      const lat = g.c + side * g.w / 2;
      const nx = g.axis === 'z' ? -side : 0;
      const nz = g.axis === 'x' ? -side : 0;
      const wall = g.axis === 'x' ? { x: t, y, z: lat } : { x: lat, y, z: t };
      if (this.insideVoid(wall.x + nx * 20, y, wall.z + nz * 20, g.id)) return null; // outro volume cruza aqui
      const pipe = r.float(14, 18);
      const out = { x: wall.x + nx * pipe, y, z: wall.z + nz * pipe };
      return { id: `wg${g.id}:${n}`, wall, out, nx, nz, v: r.float(3, 7), width: r.float(3.5, 8), bottom: g.floor, ends: 'pool' };
    });
  }

  /** Onde a água deixa de ser jato e vira coluna vertical (x, z) — ver gen/cascades.js. */
  cascadeColumn(c) {
    const ta = 2.4; // s de arco antes de cair a prumo
    return { x: c.out.x + c.nx * c.v * ta, z: c.out.z + c.nz * c.v * ta, ta };
  }

  /** Cascatas cujo trecho passa perto de (x,y,z) (raio R). */
  cascadesNear(x, y, z, R = 1500) {
    const out = [];
    for (const s of this.shaftsNear(x, z)) {
      if (Math.hypot(s.x - x, s.z - z) > R + 400) continue;
      for (let k = Math.floor((y - R) / 480); k <= Math.ceil((y + R + 1300) / 480); k++) {
        const c = this.shaftCascade(s, k);
        if (c && c.bottom < y + R && c.out.y > y - R) out.push(c);
      }
    }
    for (const g of this.galleriesNear(x, y, z)) {
      const along = g.axis === 'x' ? x : z;
      for (let n = Math.floor((along - R) / 900); n <= Math.ceil((along + R) / 900); n++) {
        const c = this.galleryCascade(g, n);
        if (c) out.push(c);
      }
    }
    return out;
  }

  // ── setores inundados ────────────────────────────────────────────────────

  /** Superfícies que podem alagar perto da altura y: topo das camadas e dos estratos. */
  floodSurfaces(y) {
    const out = [];
    for (const b of this.barriersNear(y)) {
      out.push({ kind: 'b', id: b.n, top: b.top, solid: (xc, zc) => this.barrierSolid(b, xc - 30, zc - 30) && this.barrierSolid(b, xc + 30, zc + 30) && this.barrierSolid(b, xc, zc) });
    }
    for (const st of this.strataNear(y)) out.push({ kind: 's', id: st.s, top: st.top, solid: (xc, zc) => this.strataSolid(st, xc, zc) });
    return out;
  }

  /** A placa (i,k) desta superfície está alagada? (regiões por ruído, só sobre placa sólida) */
  floodedTile(surf, i, k) {
    const T = MEGA.tile;
    const n = this.noise3(i * T * 0.00018 + 17.3 + surf.id * 3.1, surf.top * 0.0013, k * T * 0.00018 - 8.1);
    if (n < FLOOD.thr) return false;
    return surf.solid((i + 0.5) * T, (k + 0.5) * T);
  }

  /** Nível da água sob (x,z) se os pés (y) estiverem numa placa alagada; senão null. */
  floodLevelAt(x, y, z) {
    const T = MEGA.tile;
    for (const surf of this.floodSurfaces(y)) {
      if (Math.abs(y - surf.top) > 1.2) continue;
      if (this.floodedTile(surf, Math.floor(x / T), Math.floor(z / T))) return surf.top + FLOOD.depth;
    }
    return null;
  }

  // ── treliça espacial ─────────────────────────────────────────────────────

  frameZone(x, y, z) {
    return this.noise3(x * 0.00032 + 11.1, y * 0.0005, z * 0.00032 - 4.2) > 0.32;
  }

  /**
   * A célula macro (mx,my,mz) gera treliça? Amostra rápida (8 pontos + centro):
   * a geração pula a célula inteira se nenhum cai na zona.
   */
  frameCell(mx, my, mz) {
    return this._memo(`fc${mx},${my},${mz}`, () => {
      const x0 = mx * MACRO;
      const y0 = my * MACRO;
      const z0 = mz * MACRO;
      for (let q = 0; q < 8; q++) {
        if (this.frameZone(x0 + ((q & 1) + 0.5) * 800, y0 + (((q >> 1) & 1) + 0.5) * 800, z0 + (((q >> 2) & 1) + 0.5) * 800)) return true;
      }
      return this.frameZone(x0 + MACRO / 2, y0 + MACRO / 2, z0 + MACRO / 2);
    });
  }

  /** Espessura da viga na linha (eixo, u, v), trecho n — ou 0 se faltar. */
  frameBeam(axis, u, v, n) {
    const salt = axis === 'x' ? 230 : axis === 'y' ? 231 : 232;
    if (hash4(this.seed, u, v, n, salt) < 0.14) return 0; // falhas na treliça
    return 7 + hash4(this.seed, u, v, 0, salt + 5) * 9;
  }

  // ── escadarias infinitas ─────────────────────────────────────────────────
  //  eixo X, família (b, c): z = c·stair + 900; y(x) = y0 + dir·slope·x
  //  eixo Z, família (b, c): x = c·stair + 2100; y(z) = y0 + dir·slope·z

  stairway(axis, b, c) {
    return this._memo(`e${axis}${b},${c}`, () => {
      const salt = axis === 'x' ? 240 : 241;
      if (hash4(this.seed, b, c, 0, salt) > MEGA.stairProb) return null;
      const r = rngAt(this.seed, b, c, 0, salt + 10);
      return {
        axis,
        id: `e${axis}${b},${c}`,
        lat: c * MEGA.stair + (axis === 'x' ? 900 : 2100),
        y0: b * MEGA.stairRise + r.float(-300, 300),
        dir: r.chance(0.5) ? 1 : -1,
        width: r.float(24, 44),
      };
    });
  }

  stairY(e, t) {
    return e.y0 + e.dir * MEGA.stairSlope * t;
  }

  /** Escadarias que cruzam a caixa dada. */
  stairwaysIn(x0, y0, z0, x1, y1, z1) {
    const out = [];
    const { stair, stairRise, stairSlope } = MEGA;
    for (const axis of ['x', 'z']) {
      const la = axis === 'x' ? z0 : x0;
      const lb = axis === 'x' ? z1 : x1;
      const off = axis === 'x' ? 900 : 2100;
      const ta = axis === 'x' ? x0 : z0;
      const tb = axis === 'x' ? x1 : z1;
      for (let c = Math.floor((la - off - 60) / stair); c <= Math.ceil((lb - off + 60) / stair); c++) {
        // y0 possíveis: a escada tem de passar pela faixa de altura dentro da faixa de t
        const reach = stairSlope * Math.max(Math.abs(ta), Math.abs(tb)) + 400;
        for (let b = Math.floor((y0 - reach) / stairRise); b <= Math.ceil((y1 + reach) / stairRise); b++) {
          const e = this.stairway(axis, b, c);
          if (!e) continue;
          if (e.lat + e.width / 2 + 5 < la || e.lat - e.width / 2 - 5 > lb) continue;
          const ya = this.stairY(e, ta);
          const yb = this.stairY(e, tb);
          if (Math.max(ya, yb) + 20 < y0 || Math.min(ya, yb) - 20 > y1) continue;
          out.push(e);
        }
      }
    }
    return out;
  }

  // ── utilidades ───────────────────────────────────────────────────────────

  /** Retorna a caixa reservada que intersecta o AABB dado, ou null. */
  reservedHit(minX, minY, minZ, maxX, maxY, maxZ) {
    for (const r of this.reserved) {
      if (maxX > r.min[0] && minX < r.max[0] && maxY > r.min[1] && minY < r.max[1] && maxZ > r.min[2] && minZ < r.max[2]) {
        return r;
      }
    }
    return null;
  }

  // ── pilares ──────────────────────────────────────────────────────────────

  /** Pilar da célula (i, k) ou null. Memoizado (é consultado muitas vezes). */
  pillar(i, k) {
    const key = `${i},${k}`;
    if (this._pillars.has(key)) return this._pillars.get(key);
    const s = this.seed;
    // regiões densas e regiões ralas
    const regional = this.noise3(i * 0.07, 0.5, k * 0.07);
    const prob = 0.42 + 0.26 * regional;
    let p = null;
    if (hash4(s, i, 0, k, 1) < prob) {
      const r = rngAt(s, i, 0, k, 2);
      p = {
        i,
        k,
        x: (i + r.float(0.25, 0.75)) * PILLAR_CELL,
        z: (k + r.float(0.25, 0.75)) * PILLAR_CELL,
        baseR: 3 + Math.pow(r.next(), 1.6) * 15,
        sides: r.pick([4, 4, 4, 4, 6, 8]),
        spin: r.float(0, Math.PI),
        swayA: r.float(0, 12),
        swayF: r.float(0.002, 0.008),
        phase: r.float(0, 100),
        gapScale: r.float(0.0015, 0.005),
        gapThr: r.float(-0.6, 0.05),
      };
    }
    if (this._pillars.size > 20000) this._pillars.clear();
    this._pillars.set(key, p);
    return p;
  }

  /** Centro do pilar na altura y (oscilação senoidal contínua). */
  pillarCenter(p, y, out = { x: 0, z: 0 }) {
    out.x = p.x + p.swayA * Math.sin(y * p.swayF + p.phase);
    out.z = p.z + p.swayA * Math.cos(y * p.swayF * 0.73 + p.phase * 1.7);
    return out;
  }

  /** Raio na fronteira entre segmentos j-1 e j (garante continuidade). */
  pillarRadius(p, j) {
    return p.baseR * (0.65 + 0.7 * hash4(this.seed, p.i, j, p.k, 3));
  }

  /** O segmento j (de j·SEG_H a (j+1)·SEG_H) existe? */
  segmentPresent(p, j) {
    const n = this.noise3(p.i * 1.31 + 0.5, j * SEG_H * p.gapScale, p.k * 1.31 + 0.5);
    if (n < p.gapThr) return false;
    const y0 = j * SEG_H;
    const y1 = y0 + SEG_H;
    const c = this.pillarCenter(p, y0 + SEG_H / 2);
    const bio = this.biome(c.x, y0 + SEG_H / 2, c.z);
    if (bio === 'colmeia' || bio === 'macico') return false;
    if (this.touchesBarrier(y0, y1)) return false;
    if (bio === 'vazio' && hash4(this.seed, p.i, 0, p.k, 530) < 0.7) return false;
    const R = p.baseR * 3.8 + 8;
    if (this.walkwayNear(c.x, y0, y1, c.z, R)) return false;
    if (this.reservedHit(c.x - R, y0, c.z - R, c.x + R, y1, c.z + R)) return false;
    return true;
  }

  // ── passarelas ───────────────────────────────────────────────────────────
  //  ao longo de Z: x = a·spacing,  y = b·ySpacing
  //  ao longo de X: y = b·ySpacing + ySpacing/2,  z = c·spacing + spacing/2

  walkZ(a, b) {
    return this._memo(`wz${a},${b}`, () => {
      if (a === 0 && b === 0) return { width: 6, main: true, track: null }; // a ponte inicial
      if (hash4(this.seed, a, b, 0, 20) > WALK.prob) return null;
      const w = { width: 4 + hash4(this.seed, a, b, 0, 22) * 7, main: false };
      w.track = this._track(w, a, b, 24, b * WALK.ySpacing);
      return w;
    });
  }

  walkX(b, c) {
    return this._memo(`wx${b},${c}`, () => {
      if (hash4(this.seed, b, c, 0, 21) > WALK.prob) return null;
      const w = { width: 4 + hash4(this.seed, b, c, 0, 23) * 7, main: false };
      w.track = this._track(w, b, c, 25, b * WALK.ySpacing + WALK.ySpacing / 2);
      return w;
    });
  }

  /** Esta passarela tem trilho? { side: ±1 (lado), off: desvio lateral do centro do trilho, dir: ±1 (sentido) } */
  _track(w, u, v, salt, y) {
    if (hash4(this.seed, u, v, 7, salt) > TRANSIT.prob || this.inBarrier(y, 12)) return null;
    const side = hash4(this.seed, u, v, 8, salt) < 0.5 ? -1 : 1;
    return { side, off: side * (w.width / 2 + TRANSIT.gap), dir: hash4(this.seed, u, v, 9, salt) < 0.5 ? -1 : 1 };
  }

  /** Folga lateral extra que uma passarela exige do lado do trilho (m). */
  _trackReach(w, delta) {
    if (!w.track || Math.sign(delta) !== w.track.side) return 0;
    return Math.abs(w.track.off) + TRANSIT.carW / 2 + 3;
  }

  /** Algum trilho (com o vagão) passa a menos de R de (x,z) entre y0..y1? */
  _trackNear(x, y0, y1, z, R) {
    for (const L of this.transitLinesNear(x, (y0 + y1) / 2, z, Math.max(R + 30, (y1 - y0) / 2 + 6))) {
      if (L.y < y0 - TRANSIT.carH || L.y > y1 + 2) continue;
      const lat = (L.axis === 'z' ? x : z) - (L.u + L.track.off);
      if (Math.abs(lat) < R + TRANSIT.carW / 2 + 2) return true;
    }
    return false;
  }

  /** O segmento entre as plataformas a e b atravessa o gabarito de algum vagão? */
  _crossesTrack(a, b) {
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const mz = (a.z + b.z) / 2;
    const R = Math.hypot(b.x - a.x, b.z - a.z) / 2 + 20;
    for (const L of this.transitLinesNear(mx, my, mz, Math.max(R, Math.abs(b.y - a.y) / 2 + 12))) {
      const lat = L.u + L.track.off;
      const la = (L.axis === 'z' ? a.x : a.z) - lat;
      const lb = (L.axis === 'z' ? b.x : b.z) - lat;
      const clear = TRANSIT.carW / 2 + 3;
      let t; // parâmetro (0..1) do ponto do segmento mais perto do trilho
      if (la * lb < 0) t = la / (la - lb);
      else if (Math.abs(la) < clear) t = 0;
      else if (Math.abs(lb) < clear) t = 1;
      else continue;
      const y = a.y + (b.y - a.y) * t;
      if (y > L.y - 10 && y < L.y + TRANSIT.carH + 6) return true;
    }
    return false;
  }

  /** Linhas de transportador perto de (x,y,z): { axis, u (x ou z da passarela), y, w, track, id }. */
  transitLinesNear(x, y, z, R) {
    const { spacing, ySpacing } = WALK;
    const out = [];
    for (let b = Math.floor((y - R) / ySpacing); b <= Math.ceil((y + R) / ySpacing); b++) {
      for (let a = Math.floor((x - R) / spacing); a <= Math.ceil((x + R) / spacing); a++) {
        const w = this.walkZ(a, b);
        if (w?.track) out.push({ axis: 'z', u: a * spacing, y: b * ySpacing, w, track: w.track, id: `tz${a},${b}` });
      }
      const yx = b * ySpacing + ySpacing / 2;
      for (let c = Math.floor((z - R - spacing / 2) / spacing); c <= Math.ceil((z + R - spacing / 2) / spacing); c++) {
        const w = this.walkX(b, c);
        if (w?.track) out.push({ axis: 'x', u: c * spacing + spacing / 2, y: yx, w, track: w.track, id: `tx${b},${c}` });
      }
    }
    return out;
  }

  /** Trecho quebrado? (a passarela simplesmente acaba no vazio) */
  walkGap(salt, t, main, y) {
    if (y !== undefined && this.inBarrier(y, 6)) return true;
    if (main && Math.abs(t) < 900) return false;
    return this.noise3(t * 0.0025, salt * 0.37, 3.3) < -0.48;
  }

  /** Alguma passarela passa a menos de R do ponto (x, z) entre as alturas y0..y1? */
  walkwayNear(x, y0, y1, z, R) {
    const { spacing, ySpacing } = WALK;
    // ao longo de Z
    for (let b = Math.floor((y0 - 4) / ySpacing); b <= Math.floor((y1 + 4) / ySpacing); b++) {
      const wy = b * ySpacing;
      if (wy < y0 - 4 || wy > y1 + 4) continue;
      const a = Math.round(x / spacing);
      // a mais próxima e as vizinhas (o trilho de uma vizinha pode alcançar)
      for (const aa of [a - 1, a, a + 1]) {
        const w = this.walkZ(aa, b);
        if (w && Math.abs(x - aa * spacing) < R + this._trackReach(w, x - aa * spacing)) return true;
      }
    }
    // ao longo de X
    for (let b = Math.floor((y0 - 4 - ySpacing / 2) / ySpacing); b <= Math.floor((y1 + 4 - ySpacing / 2) / ySpacing); b++) {
      const wy = b * ySpacing + ySpacing / 2;
      if (wy < y0 - 4 || wy > y1 + 4) continue;
      const c = Math.round((z - spacing / 2) / spacing);
      for (const cc of [c - 1, c, c + 1]) {
        const lz = cc * spacing + spacing / 2;
        const w = this.walkX(b, cc);
        if (!w) continue;
        const reach = this._trackReach(w, z - lz);
        if (Math.abs(z - lz) < R + reach) return true;
      }
    }
    return false;
  }

  /**
   * Passarelas que atravessam o plano de uma parede.
   * wallAxis 'z': parede no plano z = wallPos (cruzada pelas passarelas ao longo de Z)
   * wallAxis 'x': parede no plano x = wallPos (cruzada pelas passarelas ao longo de X)
   * t = coordenada ao longo da parede (x ou z); retorna [{ t, y, width }].
   */
  walkwayCrossings(wallAxis, wallPos, t0, t1, y0, y1) {
    const { spacing, ySpacing, module } = WALK;
    const tm = Math.floor(wallPos / module) * module + module / 2;
    const out = [];
    if (wallAxis === 'z') {
      const m = TRANSIT.gap + 14; // o trilho fica ao lado: a parede abre também para ele
      for (let a = Math.ceil((t0 - m) / spacing); a * spacing <= t1 + m; a++) {
        for (let b = Math.ceil(y0 / ySpacing); b * ySpacing <= y1; b++) {
          const w = this.walkZ(a, b);
          if (!w) continue;
          const lo = a * spacing - w.width / 2 + Math.min(0, w.track?.off ?? 0) - 4;
          const hi = a * spacing + w.width / 2 + Math.max(0, w.track?.off ?? 0) + 4;
          if (hi < t0 || lo > t1) continue;
          if (w.track || !this.walkGap(a * 7919 + b * 104729, tm, w.main, b * ySpacing)) out.push({ t: a * spacing, y: b * ySpacing, width: w.width });
        }
      }
    } else {
      const m = TRANSIT.gap + 14;
      for (let c = Math.ceil((t0 - m - spacing / 2) / spacing); c * spacing + spacing / 2 <= t1 + m; c++) {
        for (let b = Math.ceil((y0 - ySpacing / 2) / ySpacing); b * ySpacing + ySpacing / 2 <= y1; b++) {
          const w = this.walkX(b, c);
          if (!w) continue;
          const lz = c * spacing + spacing / 2;
          const lo = lz - w.width / 2 + Math.min(0, w.track?.off ?? 0) - 4;
          const hi = lz + w.width / 2 + Math.max(0, w.track?.off ?? 0) + 4;
          if (hi < t0 || lo > t1) continue;
          if (w.track || !this.walkGap(b * 15485863 + c * 7919 + 17, tm, false, b * ySpacing + ySpacing / 2)) {
            out.push({ t: lz, y: b * ySpacing + ySpacing / 2, width: w.width });
          }
        }
      }
    }
    return out;
  }

  // ── dutos ────────────────────────────────────────────────────────────────
  //  X: y = b·ySpacing + 40,  z = c·spacing + 70
  //  Z: x = a·spacing + 150,  y = b·ySpacing + 140
  //  Y: x = a·spacing + 230,  z = c·spacing + 10   (mais raros)

  duct(axis, u, v) {
    const salt = axis === 'x' ? 30 : axis === 'z' ? 31 : 32;
    const prob = axis === 'y' ? DUCT.prob * 0.5 : DUCT.prob;
    if (hash4(this.seed, u, v, 0, salt) > prob) return null;
    const r = rngAt(this.seed, u, v, 0, salt + 10);
    return {
      radius: r.float(1.2, 6),
      bundle: r.int(0, 3),
      ringEvery: r.int(1, 3),
      salt: salt * 1000 + u * 31 + v,
    };
  }

  ductGap(salt, t) {
    return this.noise3(t * 0.004, salt * 0.13, 7.7) < -0.42;
  }

  // ── rede andável ─────────────────────────────────────────────────────────

  /** Plataforma da célula (i, l, k) ou null. y é a superfície onde se pisa. */
  node(i, l, k) {
    const key = `${i},${l},${k}`;
    if (this._nodes.has(key)) return this._nodes.get(key);
    let n = null;
    // aglomerados densos e vazios enormes
    let density = 0.28 + 0.3 * this.noise3(i * 0.09 + 3.1, l * 0.13, k * 0.09 - 7.3);
    const bio = this.biome((i + 0.5) * NODE.h, l * NODE.v, (k + 0.5) * NODE.h);
    if (bio === 'colmeia' || bio === 'macico') density = -1;
    else if (bio === 'vazio') density *= 0.35;
    if (hash4(this.seed, i, l, k, 80) < density) {
      const r = rngAt(this.seed, i, l, k, 81);
      const radius = r.float(7, 18);
      let x = (i + r.float(0.25, 0.75)) * NODE.h;
      const z0 = (k + r.float(0.25, 0.75)) * NODE.h;
      let z = z0;
      const y = l * NODE.v;
      // não sobrepõe passarelas no mesmo nível: afasta-se delas
      const { spacing, ySpacing } = WALK;
      if (y % ySpacing === 0) {
        const a = Math.round(x / spacing);
        const w = this.walkZ(a, y / ySpacing);
        const ex = w ? this._trackReach(w, x - a * spacing) : 0;
        if (w && Math.abs(x - a * spacing) < radius + w.width / 2 + 4 + ex) {
          x = a * spacing + (x >= a * spacing ? 1 : -1) * (radius + w.width / 2 + 8 + ex);
        }
      }
      if ((y - ySpacing / 2) % ySpacing === 0) {
        const c = Math.round((z - spacing / 2) / spacing);
        const lz = c * spacing + spacing / 2;
        const w = this.walkX((y - ySpacing / 2) / ySpacing, c);
        const ex = w ? this._trackReach(w, z - lz) : 0;
        if (w && Math.abs(z - lz) < radius + w.width / 2 + 4 + ex) {
          z = lz + (z >= lz ? 1 : -1) * (radius + w.width / 2 + 8 + ex);
        }
      }
      const blocked =
        this.touchesBarrier(y - 30, y + 12) ||
        this._trackNear(x, y - 34, y + 14, z, radius + 4) ||
        this.reservedHit(x - radius - 4, y - 30, z - radius - 4, x + radius + 4, y + 12, z + radius + 4) ||
        this.nearMegaWall(x, y, z, radius + 4) ||
        this.strataNear(y).some((st) => y > st.bottom - 30 && y < st.top + 4);
      if (!blocked) {
        n = {
          i, l, k, x, y, z,
          r: radius,
          sides: r.pick([4, 4, 4, 6, 8]),
          spin: r.float(0, Math.PI),
          feature: r.pick(['none', 'none', 'lamp', 'arch', 'monolith', 'rings', 'lamp', 'booth']),
        };
      }
    }
    if (this._nodes.size > 40000) this._nodes.clear();
    this._nodes.set(key, n);
    return n;
  }

  /**
   * Aresta que sai do nó n na direção d (um item de EDGE_DIRS), ou null.
   * Retorna { kind, a, b, width, r } — r é um RNG exclusivo desta aresta.
   */
  edge(n, d) {
    const m = this.node(n.i + d[0], n.l + d[1], n.k + d[2]);
    if (!m) return null;
    const long = Math.abs(d[0]) === 2 || Math.abs(d[2]) === 2;
    if (long && this.node(n.i + d[0] / 2, n.l, n.k + d[2] / 2)) return null;
    const r = rngAt(this.seed, n.i * 5 + d[0], n.l * 5 + d[1], n.k * 5 + d[2], 90);
    const dy = m.y - n.y;
    const hd = Math.hypot(m.x - n.x, m.z - n.z);
    const run = hd - n.r - m.r;
    if (d[0] === 0 && d[2] === 0) {
      return r.chance(0.3) ? { kind: 'spiral', a: n, b: m, r, width: r.float(2.4, 3.2) } : null;
    }
    if (run < 6) return null;
    if (this._crossesTrack(n, m)) return null; // o vagão passaria através dela
    let kind;
    if (dy === 0) {
      if (!r.chance(long ? 0.85 : d[0] && d[2] ? 0.3 : 0.7)) return null;
      const roll = r.next();
      kind = long ? (roll < 0.6 ? 'suspended' : 'deck') : roll < 0.5 ? 'deck' : roll < 0.75 ? 'suspended' : 'tube';
    } else {
      if (run * MAX_STAIR_SLOPE < Math.abs(dy)) return null; // íngreme demais
      if (!r.chance(0.4)) return null;
      kind = r.chance(0.55) ? 'ramp' : 'stairs';
    }
    return { kind, a: n, b: m, r, width: r.float(3, 6) };
  }

  /** Nó mais próximo de um ponto global (usado para "realocar" quem cai). */
  nearestNode(x, y, z, { below = 8, above = 2, reach = 3 } = {}) {
    const ci = Math.floor(x / NODE.h);
    const ck = Math.floor(z / NODE.h);
    const cl = Math.floor(y / NODE.v);
    let best = null;
    let bestD = Infinity;
    for (let l = cl + above; l >= cl - below; l--) {
      for (let i = ci - reach; i <= ci + reach; i++) {
        for (let k = ck - reach; k <= ck + reach; k++) {
          const n = this.node(i, l, k);
          if (!n) continue;
          const d = Math.hypot(n.x - x, (n.y - y) * 0.5, n.z - z);
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    return best;
  }
}
