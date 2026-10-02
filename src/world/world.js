// ─────────────────────────────────────────────────────────────────────────────
//  World: o mundo infinito.
//
//  Três partes:
//    • STREAMING — camadas de chunks gerados em Web Workers:
//        chunk  (cubos de 192 m): tudo, com detalhe total
//        lod1   (cubos de 384 m): as massas, simplificadas      ┐ LOD: só entram
//        lod2   (cubos de 768 m): só o essencial                ┘ com distância > ~700 m
//        macro  (cubos de 1,6 km): megaestruturas vistas a quilômetros
//      Os níveis de detalhe formam uma árvore (768 ⊃ 384 ⊃ 192): cada região é
//      mostrada por exatamente um nível, e um cubo só é descartado quando o que
//      o substitui já está pronto — sem buracos ao andar.
//      A "lei" do que existe em cada ponto está em src/gen/field.js.
//    • ORIGEM FLUTUANTE — quando o observador se afasta ~1,5 km do (0,0,0) da
//      cena, tudo é deslocado de volta. Coordenadas GLOBAIS (as do mundo
//      infinito) = coordenadas de CENA + this.origin. Isso evita tremedeira de
//      float32 mesmo a milhões de metros.
//
//  Para expandir a geração, veja src/gen/chunkgen.js (e macrogen.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { RNG } from '../core/rng.js';
import { PALETTE, createSurfaceMaterial, createSkyMaterial, createBeamMaterial, createCascadeMaterial, linearColor } from '../shaders/materials.js';
import { ElevatorSystem } from './elevators.js';
import { BuilderSystem } from './builders.js';
import { ParticleSystem } from './particles.js';
import { LightRig, V3 } from './lights.js';
import { WorkerPool, ChunkLayer } from './chunks.js';
import { BatchSet } from './batches.js';
import { OutageSystem } from './outages.js';
import { SilhouetteSystem } from './silhouettes.js';
import { CollapseSystem } from './collapses.js';
import { TransitCars } from './transitCars.js';
import { ColossusSystem } from './colossi.js';
import { EventBus } from '../core/events.js';
import { InscriptionSystem } from './inscriptions.js';
import { TerminalSystem } from './terminals.js';
import { SubstationSystem } from './substations.js';
import { EntitySystem } from './entities.js';
import { SafeguardSystem } from './safeguards.js';
import { NpcSystem } from './npcs.js';
import { CHUNK, MACRO, Field } from '../gen/field.js';

/** Raio de carregamento padrão dos chunks normais (m). A névoa esconde a borda. */
export const LOAD_RADIUS = 560;
/** Raio de carregamento padrão da camada macro (m). */
export const MACRO_RADIUS = 4000;
/** Densidade de névoa calibrada para LOAD_RADIUS (escala com a distância). */
const BASE_FOG = 0.0075;
/** Acima desta distância de renderização, o LOD entra em ação. */
const LOD_ENABLE_AT = 700;
/** Raio (centro dos cubos de 384 m) até onde vale o detalhe total. */
const LOD0_RADIUS = 420;
/** Raio (centro dos cubos de 768 m) até onde vale o LOD 1. */
const LOD1_RADIUS = 1300;

// materiais que somem perto do raio dos chunks / da camada macro
const NEAR_MATS = ['cut', 'lamp', 'tower', 'bridge', 'rib', 'cable', 'duct', 'dress', 'block', 'slab', 'monolith', 'plaza', 'tube', 'hive', 'massif',
  'rungs', 'grate', 'door', 'sign', 'shack', 'cloth', 'screen', 'graffiti', 'water'];
const FAR_MATS = ['lampFar', 'wall', 'floor', 'frame', 'stairway', 'macro', 'conduit', 'barrier', 'beam', 'cascade', 'pool', 'flood'];
/** Período do deslocamento de origem nos shaders (múltiplo de CHUNK). */
const ORIGIN_PERIOD = CHUNK * 340; // ~65 km: o salto do padrão é raríssimo
/** Distância da origem da cena que dispara a reindexação. */
const REBASE_AT = 1536;

/** Pontos de vista pré-definidos (coordenadas globais; usados por --view). */
export const VIEWS = {
  spawn: { pos: V3(0, 2.2, 58), yaw: 0, pitch: 0.03, scale: 1 },
  abyss: { pos: V3(12, 3, 10), yaw: 0.6, pitch: -0.85, scale: 1 },
  up: { pos: V3(0, 2.2, 20), yaw: 0.2, pitch: 0.95, scale: 1 },
  far: { pos: V3(6, 25, -170), yaw: 0.42, pitch: 0.22, scale: 1 },
};

const _g = new THREE.Vector3();
const _fwd = new THREE.Vector3();

/** Os circuitos de ronda vão à frente dos chunks na fila dos workers (são pequenos). */
const CIRCUIT_JOB = { priorityOf: () => -1e12 };

export class World {
  constructor(scene, shared) {
    /** @type {{ a: number[], b: number[], r: number, id?: string }[]} os cortes do emissor de feixe (addCut) */
    this.cuts = [];
    this._afterCut = 0; // o quadro depois do qual o resto do mundo reage aos cortes novos
    /** @type {any} o que o jogador mudou no mundo (WorldState — app.js), lido no build */
    this.worldState = null;
    this.frameNo = 0;
    this.scene = scene;
    this.shared = shared;
    this.origin = new THREE.Vector3();
    this.materials = {};
    this.staticGroup = null;
    this.streamGroup = null;
    this.lights = new LightRig(shared);
    /** Tudo o que acontece no mundo passa por aqui (core/events.js). */
    this.bus = new EventBus();
    this.outages = new OutageSystem(shared);
    this.outages.bus = this.bus;
    this.lights.outages = this.outages;
    this.staticLights = [];
    this.seed = 0;
    this.view = { renderDistance: LOAD_RADIUS, fog: 1 };
    this.lod = { enabled: false, r0: LOD0_RADIUS, r1: LOD1_RADIUS, r2: LOAD_RADIUS };
    this.layers = [];

    const cores = navigator.hardwareConcurrency || 4;
    this.pool = new WorkerPool(Math.max(2, Math.min(6, cores - 2)));

    // O céu não depende da seed: criado uma vez só.
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(1, 48, 24), createSkyMaterial(shared));
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1000;
    scene.add(this.sky);
  }

  build(seed) {
    this.dispose();
    this.seed = seed >>> 0;
    this.origin.set(0, 0, 0);
    this.shared.uOriginMod.value.set(0, 0, 0);
    this.shared.uOrigin.value.set(0, 0, 0);
    this.shared.uSectorSeed.value = this.seed | 0; // o mesmo inteiro que o hash do Field usa
    this.outages.events = [];
    const rng = new RNG(this.seed);
    const m = this._createMaterials(rng);

    // ── grupo fixo (vazio: a ponte inicial é só mais uma passarela da Cidade) ──
    this.staticGroup = new THREE.Group();
    this.staticGroup.name = 'static';
    this.scene.add(this.staticGroup);

    // ── zonas reservadas (caixas onde o mundo infinito não gera nada) ──
    const reserved = [];

    // ── streaming ──
    this.streamGroup = new THREE.Group();
    this.streamGroup.name = 'stream';
    this.scene.add(this.streamGroup);
    // a mesma "lei" dos workers, na thread principal (consultas como nearestNode)
    this.field = new Field(this.seed, reserved);
    this.field.setCuts(this.cuts);
    this.outages.field = this.field; // setores apagados: trens, elevadores e terminais param
    this.batches = new BatchSet(this.streamGroup);
    const common = { pool: this.pool, batches: this.batches, materials: m, seed: this.seed, reserved, field: this.field };
    const lodHooks = {
      desiredFn: (layer, x, y, z) => this._lodDesired(layer.level, x, y, z),
      canDisposeFn: (layer, e) => this._lodCovered(layer.level, e.cx, e.cy, e.cz),
    };
    this.chunkLayer = new ChunkLayer({ ...common, ...lodHooks, layer: 'chunk', level: 0, size: CHUNK, loadRadius: LOAD_RADIUS, uploadsPerFrame: 3, collide: true });
    this.lod1Layer = new ChunkLayer({ ...common, ...lodHooks, materials: this.lodMaterials, layer: 'chunk', level: 1, size: CHUNK * 2, loadRadius: 0, uploadsPerFrame: 2, bias: 200 });
    this.lod2Layer = new ChunkLayer({ ...common, ...lodHooks, materials: this.lodMaterials, layer: 'chunk', level: 2, size: CHUNK * 4, loadRadius: 0, uploadsPerFrame: 1, bias: 400 });
    this.layers = [this.chunkLayer, this.lod1Layer, this.lod2Layer];
    this.macroLayer = new ChunkLayer({ ...common, layer: 'macro', size: MACRO, loadRadius: MACRO_RADIUS, uploadsPerFrame: 1, bias: -2000, collide: true });
    // um chunk refeito por um corte entrou em cena (os detritos dele caem — app/beamfx.js)
    for (const L of [this.chunkLayer, this.macroLayer]) L.onSwap = (e) => this.bus.emit('cut:swap', { entry: e, layer: L.layer });

    // ── coisas que se movem: elevadores, construtores, água ──
    this.elevators = new ElevatorSystem(this.streamGroup, m);
    this.elevators.field = this.field;
    this.builders = new BuilderSystem(this.streamGroup, m);
    this.builders.field = this.field;
    this.builders.bus = this.bus;
    this.transit = new TransitCars(this.streamGroup, m);
    this.transit.field = this.field;
    this.transit.outages = this.outages;
    this.colossi = new ColossusSystem(this.streamGroup, m);
    this.colossi.field = this.field;
    this.colossi.bus = this.bus;
    this.elevators.outages = this.outages;
    this.terminals = new TerminalSystem(this.streamGroup, m, this.seed);
    Object.assign(this.terminals, { field: this.field, transit: this.transit, outages: this.outages, world: this });
    // subestações: religar setores apagados (fase 4); o que foi religado vem do mundo salvo
    this.substations = new SubstationSystem(this.streamGroup, m, this.shared);
    Object.assign(this.substations, { field: this.field, bus: this.bus });
    this.substations.load(this.worldState);
    // os seres (fase 5): corpos que andam pela Cidade pelo grafo de navegação (gen/nav.js)
    this.entities = new EntitySystem(this.streamGroup, m, this);
    this.entities.bus = this.bus;
    // os Safeguards (fase 6): rondas em cada território, caçadas, saídas das paredes
    const prevSg = this.safeguards;
    this.safeguards = new SafeguardSystem(this.streamGroup, m, this);
    this.safeguards.bus = this.bus;
    if (prevSg) Object.assign(this.safeguards, { enabled: prevSg.enabled, senses: prevSg.senses, onCatch: prevSg.onCatch });
    // os raros vivos (fase 7): moradores das vilas, andarilhos, vida de silício
    this.npcs = new NpcSystem(this);
    this.npcs.bus = this.bus;
    // o endereçamento pintado nas paredes (na língua antiga)
    this.inscriptions = new InscriptionSystem(this.streamGroup, this.seed);
    Object.assign(this.inscriptions, { field: this.field, world: this });
    this.particles = new ParticleSystem(this.streamGroup);
    this.particles.bus = this.bus;
    // o horizonte impossível: estruturas a dezenas de km, só sombras na poeira
    this.silhouettes = new SilhouetteSystem(this.streamGroup, this.shared, this.seed);
    // pedaços de pilares distantes se soltando
    const prevCollapses = this.collapses;
    this.collapses = new CollapseSystem(this.streamGroup, m, this.shared);
    this.collapses.field = this.field;
    this.collapses.bus = this.bus;
    if (prevCollapses) this.collapses.enabled = prevCollapses.enabled;
    this.space = 200;

    // ── luzes ──
    this._setupLights(rng.fork());
    this._applyView();
    return this;
  }

  _createMaterials(rng) {
    const seed = rng.float(0, 100);
    const S = this.shared;
    const fadeNear = [LOAD_RADIUS * 0.72, LOAD_RADIUS * 0.95];
    const fadeMacro = [MACRO_RADIUS * 0.55, MACRO_RADIUS * 0.72];
    let n = 0;
    const mk = (params) => createSurfaceMaterial(S, { seed: seed + n++ * 13.7, ...params });
    const C = linearColor;

    // ── receitas (o "catálogo de materiais" da Cidade) ──
    const concrete = { base: C(0.26, 0.25, 0.235), panel: 4, streaks: 0.6, accentAmount: 0.08 };
    const darkConcrete = { base: C(0.16, 0.155, 0.148), panel: 8, streaks: 0.8, accentAmount: 0.05 };
    const steel = { base: C(0.17, 0.175, 0.18), accent: C(0.22, 0.11, 0.06), accentAmount: 0.45, panel: 1.5, streaks: 0.4 };
    const deck = { base: C(0.22, 0.212, 0.2), panel: 2, streaks: 0.3, accentAmount: 0.15, circuitAmount: 0.25, circuitScale: 1.2 };
    const rubber = { base: C(0.035, 0.035, 0.035), panel: 100, streaks: 0, accentAmount: 0 };
    const megaWall = {
      ...darkConcrete,
      base: C(0.2, 0.195, 0.185),
      panel: 10,
      windows: 0.06,
      windowSize: [3.2, 5],
      noiseScale: 0.01,
    };

    this.materials = {
      // ── camada chunk (somem na névoa perto do raio de carregamento) ──
      tower: mk({ ...concrete, panel: 3, windows: 0.035, windowSize: [2.4, 3.6], noiseScale: 0.05, fogAmount: 0.85, fade: fadeNear }),
      bridge: mk({ ...deck, fade: fadeNear }),
      rib: mk({ ...steel, fade: fadeNear }),
      cable: mk({ ...rubber, fade: fadeNear }),
      duct: mk({ ...steel, panel: 3, fade: fadeNear }),
      dress: mk({ ...concrete, panel: 5, fade: fadeNear }),
      block: mk({ ...concrete, base: C(0.24, 0.232, 0.22), panel: 3, windows: 0.16, windowSize: [2.6, 3.2], fade: fadeNear }),
      slab: mk({ ...darkConcrete, panel: 6, fogAmount: 0.7, fade: fadeNear }),
      monolith: mk({ ...darkConcrete, base: C(0.07, 0.07, 0.07), panel: 12, fogAmount: 0.6, fade: fadeNear }),
      plaza: mk({ ...concrete, base: C(0.28, 0.27, 0.255), panel: 3, circuitAmount: 0.2, circuitScale: 0.8, fade: fadeNear }),
      tube: mk({ ...steel, panel: 2, windows: 0.02, windowSize: [1.5, 1.2], side: THREE.DoubleSide, fade: fadeNear }),
      // ── camada macro (visível a quilômetros) ──
      wall: mk({ ...megaWall, fogAmount: 0.28, fade: fadeMacro }),
      floor: mk({ ...darkConcrete, panel: 12, windows: 0.03, windowSize: [4, 5], noiseScale: 0.008, fogAmount: 0.3, fade: fadeMacro }),
      frame: mk({ ...darkConcrete, base: C(0.17, 0.168, 0.162), panel: 6, fogAmount: 0.35, fade: fadeMacro }),
      stairway: mk({ ...concrete, panel: 6, fogAmount: 0.4, fade: fadeMacro }),
      macro: mk({ ...darkConcrete, base: C(0.09, 0.09, 0.09), panel: 16, windows: 0.015, fogAmount: 0.3, fade: fadeMacro }),
      // ── regiões fechadas e condutos ──
      hive: mk({ ...concrete, base: C(0.22, 0.214, 0.205), panel: 3, windows: 0.015, windowSize: [2.5, 3], fade: fadeNear }),
      massif: mk({ ...megaWall, panel: 6, windows: 0.08, windowSize: [3, 4], noiseScale: 0.02, fogAmount: 0.7, fade: fadeNear }),
      conduit: mk({ ...steel, base: C(0.14, 0.142, 0.145), panel: 4, windows: 0.01, windowSize: [2, 2], side: THREE.DoubleSide, fogAmount: 0.4, fade: fadeMacro }),
      // ── camadas, escala humana, vestígios ──
      // as faces abertas pelo emissor de feixe (a arma de Killy): metal fundido, escuro
      // (a brasa que esfria vem nos efeitos — o cofre, Arma-do-Killy §7.5)
      cut: mk({ ...steel, base: C(0.075, 0.07, 0.068), accent: C(0.16, 0.08, 0.04), accentAmount: 0.6, panel: 100, streaks: 0.2, fade: fadeNear, heat: true }), // (em brasa depois do tiro — app/beamfx.js)
      barrier: mk({ ...darkConcrete, base: C(0.13, 0.126, 0.12), panel: 16, streaks: 0.9, noiseScale: 0.006, fogAmount: 0.35, fade: fadeMacro }),
      rungs: mk({ ...steel, panel: 100, cutout: 1, side: THREE.DoubleSide, fade: fadeNear }),
      grate: mk({ ...steel, panel: 100, cutout: 2, side: THREE.DoubleSide, fade: fadeNear }),
      door: mk({ base: C(0.012, 0.012, 0.013), panel: 100, streaks: 0.2, accentAmount: 0, fade: fadeNear }),
      sign: mk({ ...steel, panel: 100, windows: 0.55, windowSize: [0.16, 0.2], windowColor: C(0.9, 0.85, 0.7), fade: fadeNear }),
      shack: mk({ ...steel, base: C(0.15, 0.13, 0.11), accentAmount: 0.8, panel: 0.8, fade: fadeNear }),
      cloth: mk({ base: C(0.2, 0.17, 0.14), accent: C(0.18, 0.08, 0.06), accentAmount: 0.5, panel: 100, streaks: 0.5, side: THREE.DoubleSide, fade: fadeNear }),
      screen: mk({ base: C(0.01, 0.015, 0.012), panel: 100, windows: 0.9, windowSize: [0.05, 0.03], windowColor: C(0.35, 0.6, 0.45), fade: fadeNear }),
      graffiti: mk({ base: C(0.09, 0.025, 0.02), panel: 100, streaks: 0.3, accentAmount: 0, cutout: 3, fade: fadeNear }),
      water: mk({ base: C(0.05, 0.05, 0.055), panel: 100, streaks: 0, wet: 1, fade: fadeNear }),
      // cascatas (camada macro): a coluna d'água e a poça na base
      cascade: createCascadeMaterial(S, { fade: fadeMacro }),
      pool: mk({ base: C(0.05, 0.05, 0.055), panel: 100, streaks: 0, wet: 1, fade: fadeMacro }),
      // setores inundados: lâmina d'água parada de quilômetros
      flood: mk({ base: C(0.03, 0.032, 0.034), panel: 100, streaks: 0, accentAmount: 0, wet: 1, fogAmount: 0.6, fade: fadeMacro, reflect: true }),
      // a pele dos Safeguards: pálida, lisa, sem placas (fase 6)
      pale: mk({ base: C(0.5, 0.49, 0.46), panel: 100, streaks: 0.15, accentAmount: 0, fogAmount: 0.9 }),
      machine: mk({ ...steel, base: C(0.1, 0.1, 0.105), accentAmount: 0.6, panel: 2.5, fogAmount: 0.6 }),
      // a lente das luminárias: clara, acesa pela própria luz logo abaixo dela
      lamp: mk({ base: C(0.85, 0.82, 0.74), panel: 100, streaks: 0, accentAmount: 0, fogAmount: 0.5, fade: fadeNear }),
      lampFar: mk({ base: C(0.85, 0.82, 0.74), panel: 100, streaks: 0, accentAmount: 0, fogAmount: 0.35, fade: fadeMacro }),
      // máquinas colossais nas trincheiras do teto (vistas a quilômetros)
      colossus: mk({ ...steel, base: C(0.085, 0.085, 0.09), accentAmount: 0.5, panel: 7, windows: 0.04, windowSize: [4, 2.5], windowColor: C(0.95, 0.62, 0.32), fogAmount: 0.35, fade: fadeMacro }),
      beam: createBeamMaterial(S, { color: new THREE.Vector3(0.95, 0.88, 0.75), intensity: 0.05, fade: fadeMacro }),
      colossusBeam: createBeamMaterial(S, { color: new THREE.Vector3(1.0, 0.7, 0.42), intensity: 0.14, fade: fadeMacro }),
    };
    // variantes para os chunks LOD: mesmas receitas, fade no fim do alcance
    this.lodMaterials = {};
    this._recipes = { concrete, darkConcrete, steel, deck, rubber, megaWall };
    for (const name of NEAR_MATS) {
      const src = this.materials[name];
      const mat = src.clone();
      // clone() copia os uniforms: religa os compartilhados (tempo, luzes, névoa...)
      for (const k of Object.keys(S)) mat.uniforms[k] = S[k];
      this.lodMaterials[name] = mat;
    }
    return this.materials;
  }

  _setupLights(rng) {
    const L = this.lights;
    const { sodium, cold } = PALETTE;
    L.clear();
    // fixas: acompanham o observador
    L.addFixed({ color: sodium, intensity: 450, mode: 'follow', offset: V3(40, -300, -60) }); // brasa distante lá embaixo
    L.addFixed({ color: cold, intensity: 700, mode: 'follow', offset: V3(-80, 450, -120) }); // clarão frio lá em cima
    // a lanterna do aparelho na mão (modo Peregrinação — app/carried.js); apagada = intensidade 0
    L.addFixed({ color: V3(1.0, 0.9, 0.78), intensity: 0, mode: 'carried' });

    // estática (global): a lâmpada de sódio da ponte inicial, num poste de verdade
    const S = (x, y, z, c, intensity, mode = 'steady') => ({ x, y, z, color: [c.x, c.y, c.z], intensity, mode, phase: rng.float(0, 100) });
    this.staticLights = [S(1.9, 3.75, 44, sodium, 30)];
    const m = this.materials;
    const post = [
      [new THREE.CylinderGeometry(0.1, 0.13, 4.35, 6), m.duct, 2.5, 2.15, 44], // poste: do tabuleiro (topo em y = 0) até o braço
      [new THREE.BoxGeometry(0.7, 0.12, 0.12), m.duct, 2.2, 4.25, 44], // braço
      [new THREE.BoxGeometry(0.7, 0.3, 0.7), m.machine, 1.9, 4.05, 44], // carcaça
      [new THREE.BoxGeometry(0.5, 0.1, 0.5), m.lamp, 1.9, 3.85, 44], // lente
    ];
    for (const [geo, mat, x, y, z] of post) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      this.staticGroup.add(mesh);
    }
  }

  /**
   * Distância de renderização (m) e multiplicador de névoa. Pode ser chamado a
   * qualquer momento: os raios de carregamento, o fade dos materiais e a
   * densidade da névoa se ajustam juntos (a névoa sempre esconde a borda).
   */
  setView({ renderDistance, fog }) {
    if (renderDistance !== undefined) this.view.renderDistance = renderDistance;
    if (fog !== undefined) this.view.fog = fog;
    this._applyView();
  }

  _applyView() {
    const r = this.view.renderDistance;
    // colapsos só onde os pilares são visíveis
    if (this.collapses) this.collapses.maxDist = Math.min(380, r * 0.7);
    const R = Math.min(5000, Math.max(3000, r * 7.2));
    const lodOn = r > LOD_ENABLE_AT;
    this.lod = { enabled: lodOn, r0: LOD0_RADIUS, r1: Math.min(LOD1_RADIUS, r), r2: r };
    // névoa proporcional: mais longe → névoa mais rala, para a borda continuar escondida
    this.shared.uFogDensity.value = BASE_FOG * (LOAD_RADIUS / r) * this.view.fog;
    for (const name of NEAR_MATS) {
      // com LOD, os chunks próximos não precisam sumir: o LOD assume a partir deles
      if (lodOn) this.materials[name]?.uniforms.uFadeRange.value.set(1e9, 2e9);
      else this.materials[name]?.uniforms.uFadeRange.value.set(r * 0.72, r * 0.95);
      this.lodMaterials?.[name]?.uniforms.uFadeRange.value.set(r * 0.72, r * 0.95);
    }
    for (const name of FAR_MATS) this.materials[name]?.uniforms.uFadeRange?.value.set(R * 0.55, R * 0.72);
    const hd = (s) => (Math.sqrt(3) * s) / 2;
    if (this.chunkLayer) {
      this.chunkLayer.loadRadius = r;
      this.chunkLayer.scanRadius = lodOn ? LOD0_RADIUS + hd(CHUNK * 2) + CHUNK : r + hd(CHUNK);
      this.lod1Layer.scanRadius = lodOn ? this.lod.r1 + hd(CHUNK * 4) + CHUNK * 2 : 0;
      this.lod2Layer.scanRadius = lodOn ? r + hd(CHUNK * 4) : 0;
      for (const L of this.layers) L._scanTimer = 0;
    }
    if (this.macroLayer) {
      this.macroLayer.loadRadius = R;
      this.macroLayer._scanTimer = 0;
    }
  }

  // ── LOD: qual nível mostra cada região ───────────────────────────────────

  _lodDesired(level, x, y, z) {
    const v = this.lod;
    const L = this.layers;
    if (!v.enabled) return level === 0 && L[0].distanceTo(x, y, z) <= v.r2 + (Math.sqrt(3) * CHUNK) / 2;
    const f = Math.floor;
    if (level === 0) return L[1].distanceTo(f(x / 2), f(y / 2), f(z / 2)) < v.r0 && L[2].distanceTo(f(x / 4), f(y / 4), f(z / 4)) < v.r1;
    if (level === 1) {
      const d = L[1].distanceTo(x, y, z);
      return d >= v.r0 && d < v.r2 + CHUNK * 2 && L[2].distanceTo(f(x / 2), f(y / 2), f(z / 2)) < v.r1;
    }
    const d = L[2].distanceTo(x, y, z);
    return d >= v.r1 && d < v.r2 + CHUNK * 3.5;
  }

  /** A região deste cubo já está coberta por outro nível pronto (ou ninguém a quer)? */
  _lodCovered(level, x, y, z) {
    const L = this.layers;
    const f = Math.floor;
    const kids = (cx, cy, cz) => {
      const out = [];
      for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) for (let c = 0; c < 2; c++) out.push([cx * 2 + a, cy * 2 + b, cz * 2 + c]);
      return out;
    };
    const readyOrUnwanted = (lvl, c) => !this._lodDesired(lvl, ...c) || L[lvl].isReady(...c);
    if (level === 0) {
      const p1 = [f(x / 2), f(y / 2), f(z / 2)];
      const p2 = [f(x / 4), f(y / 4), f(z / 4)];
      if (this._lodDesired(1, ...p1)) return L[1].isReady(...p1);
      if (this._lodDesired(2, ...p2)) return L[2].isReady(...p2);
      return true;
    }
    if (level === 1) {
      const p2 = [f(x / 2), f(y / 2), f(z / 2)];
      if (this._lodDesired(2, ...p2)) return L[2].isReady(...p2);
      return kids(x, y, z).every((k) => readyOrUnwanted(0, k));
    }
    return kids(x, y, z).every((k1) => (this._lodDesired(1, ...k1) ? L[1].isReady(...k1) : kids(...k1).every((k0) => readyOrUnwanted(0, k0))));
  }

  // ── coordenadas ──────────────────────────────────────────────────────────

  toGlobal(scenePos, out = new THREE.Vector3()) {
    return out.copy(scenePos).add(this.origin);
  }

  /**
   * Se a câmera se afastou demais do (0,0,0) da cena, desloca o mundo.
   * @returns {{delta: THREE.Vector3, wrapped: boolean} | null}
   */
  maybeRebase(camera) {
    const p = camera.position;
    if (Math.abs(p.x) < REBASE_AT && Math.abs(p.y) < REBASE_AT && Math.abs(p.z) < REBASE_AT) return null;
    const delta = new THREE.Vector3(
      Math.round(p.x / CHUNK) * CHUNK,
      Math.round(p.y / CHUNK) * CHUNK,
      Math.round(p.z / CHUNK) * CHUNK,
    );
    this.origin.add(delta);
    camera.position.sub(delta);
    camera.updateMatrixWorld();

    this.staticGroup.position.copy(this.origin).negate();
    this.staticGroup.updateMatrixWorld(true);
    for (const L of this.layers) L.rebase(this.origin);
    this.macroLayer.rebase(this.origin);
    this.lights.shift(delta);
    this.transit?.rebase(delta);
    this.colossi?.rebase(delta);

    // o ruído dos shaders usa origem mód. PERÍODO; ao "dar a volta" o padrão salta
    const mod = (v) => ((v % ORIGIN_PERIOD) + ORIGIN_PERIOD) % ORIGIN_PERIOD;
    this.shared.uOrigin.value.copy(this.origin);
    const om = this.shared.uOriginMod.value;
    const next = new THREE.Vector3(mod(this.origin.x), mod(this.origin.y), mod(this.origin.z));
    const expected = om.clone().add(delta);
    const wrapped = next.distanceTo(expected) > 1;
    om.copy(next);
    return { delta, wrapped };
  }

  // ── consultas ────────────────────────────────────────────────────────────

  /** Nome da região (usado pela interface alienígena). */
  regionAt(scenePos) {
    const g = this.toGlobal(scenePos, _g);
    if (Math.abs(g.x) < 8 && g.y > -3 && g.y < 12) return 'ponte';
    if (this.field.barriersNear(g.y).some((b) => g.y > b.top - 2 && g.y < b.top + 60)) return 'camada';
    const v = this.field.insideVoid(g.x, g.y, g.z);
    if (v) return { s: 'poco', c: 'conduto' }[v.id[0]] ?? 'galeria';
    if (this.field.strataNear(g.y).some((st) => g.y > st.top && g.y < st.top + 400)) return 'estrato';
    const bio = this.field.biome(g.x, g.y, g.z);
    if (bio === 'colmeia' || bio === 'macico' || bio === 'vazio') return bio;
    if (g.y < -400) return 'abismo';
    if (g.y > 400) return 'altura';
    return 'deriva';
  }

  /** Tomadas de recarga carregadas (posições GLOBAIS) — ver ChunkBuilder.socket. */
  *sockets() {
    for (const e of this.chunkLayer.allEmitters()) if (e.type === 'socket') yield e;
  }

  /** A luz que o corpo carrega (a lanterna do aparelho): { pos (cena), intensity }. */
  get carriedLight() {
    return this.lights.fixed.find((l) => l.mode === 'carried');
  }

  /**
   * Plataforma mais próxima (em coordenadas de cena) — para realocar quem
   * caiu no abismo. Procura um pouco acima e bem abaixo.
   */
  findLanding(scenePos) {
    const g = this.toGlobal(scenePos, _g);
    for (const reach of [2, 4]) {
      const n = this.field.nearestNode(g.x, g.y, g.z, { below: 10, above: 3, reach });
      if (n) return new THREE.Vector3(n.x, n.y + 0.05, n.z).sub(this.origin);
    }
    return null;
  }

  /**
   * Tamanho aproximado do espaço ao redor (m) — para a reverberação.
   * Estimado pela "lei" do mundo (dimensões analíticas das estruturas).
   */
  spaceSize(scenePos) {
    const g = this.toGlobal(scenePos, _g);
    const v = this.field.insideVoid(g.x, g.y, g.z);
    if (v) {
      if (v.id[0] === 'g') return Math.min(v.w, v.h) * 0.9;
      if (v.id[0] === 's') return Math.min(v.wx, v.wz);
      if (v.id[0] === 'c') return v.R * 2;
    }
    const bio = this.field.biome(g.x, g.y, g.z);
    if (bio === 'colmeia') {
      const C = 48;
      if (this.field.hiveRoom(Math.floor(g.x / C), Math.floor(g.y / C), Math.floor(g.z / C))) return 48;
    }
    if (bio === 'macico') return 40;
    // perto de uma camada (teto ou chão imenso)
    for (const b of this.field.barriersNear(g.y)) {
      const d = Math.min(Math.abs(g.y - b.top), Math.abs(g.y - b.bottom));
      if (d < 300) return 150 + d;
    }
    return 400;
  }

  get stats() {
    return {
      chunks: this.chunkLayer?.loadedCount ?? 0,
      lod1: this.lod1Layer?.loadedCount ?? 0,
      lod2: this.lod2Layer?.loadedCount ?? 0,
      macro: this.macroLayer?.loadedCount ?? 0,
      pending: this.pool.busy,
    };
  }

  // ── frame ────────────────────────────────────────────────────────────────

  /**
   * Um circuito de ronda (gen/patrols.js) calculado num worker de geração: cb(circuito | null).
   * Fica também no cache do grafo daqui (quem pedir o mesmo depois, na hora, já acha).
   */
  circuitAsync(t, salt, cb) {
    const field = this.field;
    const nav = this.entities.nav;
    const key = `${t.id}#${salt}`;
    if (nav._patrols?.has(key)) return cb(nav._patrols.get(key));
    this.pool.submit({ task: 'circuit', seed: this.seed, reserved: field.reserved, t, salt, cuts: field.cuts }, CIRCUIT_JOB, (d) => {
      if (this.field !== field) return; // outro mundo nesse meio tempo
      nav._patrols ??= new Map();
      nav._patrols.set(key, d.circuit ?? null);
      cb(d.circuit ?? null);
    });
  }

  /**
   * Um corte do emissor de feixe (GLOBAL: { a: [x,y,z], b: [x,y,z], r }): vai para o Field (e
   * para os pedidos dos workers) e os chunks que ele cruza são refeitos, do mais perto de
   * `from` (GLOBAL) ao mais longe. Devolve quantos chunks foram pedidos, por camada.
   */
  addCut(cut, from) {
    cut.id ??= `C${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
    this.cuts.push(cut);
    this.field.setCuts(this.cuts);
    const out = {};
    for (const L of [...this.layers, this.macroLayer]) out[L.level ? 'lod' + L.level : L.layer] = L.recut(cut, from);
    // o resto do mundo (os caminhos, as rondas, os objetos montados fora da geração): no
    // próximo quadro (world.update — o quadro do tiro fica leve)
    this._afterCut = (this.frameNo ?? 0) + 1; // (o update deste quadro ainda vem: o do seguinte)
    return out;
  }

  /** O resto do mundo reage aos cortes novos (addCut). */
  _reactToCuts() {
    this._afterCut = 0;
    this.entities.onCut();
    this.safeguards.onCut();
    this.npcs.onCut();
    for (const sys of [this.terminals, this.inscriptions, this.substations]) if (sys) sys._scan = 0;
    if (this.builders) this.builders._scanTimer = 0;
  }

  update(time, dt, camera, observerScale) {
    this.frameNo = (this.frameNo ?? 0) + 1; // (o orçamento de colisão por quadro — world/collision.js)
    if (this._afterCut && this.frameNo > this._afterCut) this._reactToCuts();
    const g = this.toGlobal(camera.position, new THREE.Vector3());
    camera.getWorldDirection(_fwd);

    for (const L of this.layers) L.center.copy(g); // todos os níveis veem a mesma posição antes de varrer
    for (let i = this.layers.length - 1; i >= 0; i--) this.layers[i].update(dt, g, _fwd, this.origin);
    this.macroLayer.update(dt, g, _fwd, this.origin);
    this.pool.pump();
    for (const L of this.layers) L.flushUploads();
    this.macroLayer.flushUploads();
    this.batches.tick(); // páginas reserva nos quadros calmos

    // foco das luzes: o observador
    const focus = [g];
    // coisas que se movem
    this.elevators.update(time, dt, g, this.origin);
    this.builders.update(time, dt, g, this.origin);
    this.transit.update(time, dt, g, this.origin);
    this.colossi.update(time, dt, g, this.origin);
    this.terminals.update(time, dt, g, this.origin);
    this.substations.update(time, dt, g, this.origin);
    this.entities.update(time, dt, g, this.origin);
    this.safeguards.update(time, dt, g, this.origin);
    this.npcs.update(time, dt, g);
    this.inscriptions.update(time, dt, g, this.origin, camera);
    this.particles.update(time, dt, g, this.origin, () => [...this.chunkLayer.allEmitters(), ...this.macroLayer.allEmitters()]);

    const self = this;
    function* candidates() {
      yield* self.staticLights;
      yield* self.chunkLayer.allLights();
      yield* self.macroLayer.allLights();
      yield* self.elevators.lights;
      yield* self.builders.lights;
      yield* self.transit.lights;
      yield* self.colossi.lights;
      yield* self.terminals.lights;
      yield* self.substations.lights;
    }
    this.outages.update(time, dt, g, _fwd, this.origin);
    this.silhouettes.update(g, this.origin);
    this.collapses.update(time, dt, g, _fwd, this.origin);
    this.lights.update(time, dt, camera, observerScale, candidates(), focus, this.origin);
  }

  dispose() {
    this.elevators?.dispose();
    this.transit?.dispose();
    this.colossi?.dispose();
    this.terminals?.dispose();
    this.substations?.dispose();
    this.npcs?.dispose();
    this.safeguards?.dispose();
    this.entities?.dispose();
    this.inscriptions?.dispose();
    this.builders?.dispose();
    this.particles?.dispose();
    this.silhouettes?.dispose();
    this.collapses?.dispose();
    for (const L of this.layers) L.dispose();
    this.layers = [];
    this.macroLayer?.dispose();
    this.batches?.dispose();
    this.chunkLayer = this.lod1Layer = this.lod2Layer = this.macroLayer = null;
    for (const grp of [this.staticGroup, this.streamGroup]) {
      if (!grp) continue;
      grp.traverse((o) => /** @type {any} */ (o).geometry?.dispose());
      this.scene.remove(grp);
    }
    this.staticGroup = this.streamGroup = null;
    Object.values(this.materials).forEach((mat) => mat.dispose());
    Object.values(this.lodMaterials ?? {}).forEach((mat) => mat.dispose());
    this.materials = {};
    this.lodMaterials = {};
  }
}
