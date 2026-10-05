// ─────────────────────────────────────────────────────────────────────────────
//  Máquinas colossais em trânsito.
//
//  Por baixo de algumas camadas correm trincheiras de 160 m de largura, ao
//  longo das linhas da grade das passagens (gen/field.js: trenchAt). Dentro
//  delas, penduradas nos trilhos do teto, pórticos de 260 m se arrastam a
//  ~3 m/s — de baixo, luzes quentes que atravessam o céu de concreto, cones de
//  luz varrendo o que está lá embaixo, e a cada poucos segundos o baque das
//  garras mudando de trilho, que chega atrasado pela distância.
//
//  Horário determinístico: numa trincheira, as máquinas ficam numa "esteira"
//  que anda: a máquina k está em t = k·spacing + fase + dir·v·tempo (e só
//  existe se o hash de k deixar). Nada a guardar; basta criar as que estão
//  perto do observador. Não são entidades: são máquinas cumprindo uma rotina.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { movingMaterial } from '../shaders/materials.js';
import { COLOSSUS } from '../gen/field.js';
import { hash4 } from '../gen/hash.js';
import { railDist } from '../gen/cut.js';
import { beamGeometry } from '../gen/beams.js';
import { mergeAll, place } from './geometry.js';

const RANGE = 7000; // m: máquinas criadas até esta distância (a névoa esconde o resto)
const CLAMP = 6.5; // s entre os baques das garras de uma máquina
const HEAR = 4500; // m: baques ouvidos até aqui
const SODIUM = [1.0, 0.62, 0.3];
/** Quanto o pé da máquina desce abaixo da laje (para ser vista de longe). */
const DROP = 14;

export class ColossusSystem {
  constructor(parent, materials) {
    this.group = new THREE.Group();
    this.group.name = 'colossos';
    parent.add(this.group);
    this.materials = materials;
    this.field = null;
    this.machines = new Map(); // id → { group, lane, k, pos, light }
    this.lanes = [];
    this.lights = [];
    this.meshes = []; // o casco, para a colisão (as longarinas são o convés)
    this.bus = null; // evento colossus:clamp { x, y, z }
    this._scan = 0;
    this._geo = null;
    /** @type {any} os cortes do emissor nas máquinas (world/dynamic.js) */
    this.dyn = null;
    this.now = 0;
  }

  /** O tempo de uma trincheira: parado no instante em que uma máquina dela foi destruída (salvo no mundo). */
  _laneTime(lane, time) {
    const f = this.dyn?.world.worldState?.get(`colLane:${lane.id}`);
    return f === undefined ? time : f;
  }

  /** Geometria (uma só, compartilhada): z local ao longo da trincheira, y = 0 no pé. */
  _parts() {
    if (this._geo) return this._geo;
    const { len: L, width: W } = COLOSSUS;
    // do pé (DROP abaixo da laje) até o topo dos rodízios, que tocam o trilho
    // (o trilho fica 14 m abaixo do fundo da trincheira — ver genBarriers)
    const H = COLOSSUS.depth - 18 + DROP;
    const hull = [];
    // duas longarinas presas aos trilhos, ligadas por treliças transversais
    for (const s of [-1, 1]) {
      hull.push(place(new THREE.BoxGeometry(12, 10, L), { x: s * 45, y: H - 5 }));
      // rodízios sobre o trilho
      for (let z = -L / 2 + 20; z <= L / 2 - 20; z += 55) hull.push(place(new THREE.BoxGeometry(8, 6, 14), { x: s * 45, y: H + 1, z }));
      // pernas descendo para a plataforma de baixo
      for (const z of [-L / 2 + 12, L / 2 - 12]) hull.push(place(new THREE.BoxGeometry(6, H - 8, 6), { x: s * 48, y: (H - 8) / 2 + 4, z }));
    }
    for (let z = -L / 2 + 6; z <= L / 2 - 6; z += 62) hull.push(place(new THREE.BoxGeometry(W - 20, 6, 5), { y: H - 4, z }));
    // o corpo: plataforma inferior e o módulo central pendurado
    hull.push(place(new THREE.BoxGeometry(W - 10, 5, L - 30), { y: 4 }));
    hull.push(place(new THREE.BoxGeometry(54, H - 14, 96), { y: H / 2 + 2, z: -18 }));
    hull.push(place(new THREE.BoxGeometry(30, 8, 60), { y: 0, z: 50 }));
    // tanques e tubos correndo pelo comprimento
    for (const x of [-28, 30]) hull.push(place(new THREE.CylinderGeometry(5, 5, L - 60, 8).rotateX(Math.PI / 2), { x, y: 13 }));
    // garras: braços dobrados sob a plataforma
    for (const z of [-90, 40, 100]) {
      hull.push(place(new THREE.BoxGeometry(4, 12, 4), { x: -30, y: 0, z }));
      hull.push(place(new THREE.BoxGeometry(22, 3, 4), { x: -20, y: -6, z }));
    }
    // luz: cones varrendo para baixo e lâmpadas pequenas sob a plataforma
    const glow = [];
    for (const [x, z] of [[-40, -110], [40, -110], [0, 60]]) glow.push(beamGeometry(new THREE.Vector3(x, 0, z), 420, 3, 60, 14));
    for (let z = -L / 2 + 25; z <= L / 2 - 25; z += 38) for (const x of [-52, 52]) glow.push(beamGeometry(new THREE.Vector3(x, 1.5, z), 7, 0.5, 2.2, 8));
    this._geo = { hull: mergeAll(hull), glow: mergeAll(glow) };
    return this._geo;
  }

  _create(lane, k) {
    const { hull, glow } = this._parts();
    const g = new THREE.Group();
    const mh = new THREE.Mesh(hull, movingMaterial(this.materials.colossus)); // (anda: o desenho vai junto)
    mh.userData.mat = 'machine';
    mh.userData.dx = mh.userData.dy = mh.userData.dz = 0;
    const mg = new THREE.Mesh(glow, this.materials.colossusBeam);
    mg.renderOrder = 5;
    for (const m of [mh, mg]) {
      m.matrixAutoUpdate = false;
      g.add(m);
    }
    if (lane.axis === 'x') g.rotation.y = Math.PI / 2;
    this.group.add(g);
    const H = COLOSSUS.depth - 18 + DROP;
    const mach = {
      group: g,
      lane,
      k,
      pos: new THREE.Vector3(),
      clamp: hash4(this.field.seed, lane.b.n, k, lane.lat, 712) * CLAMP,
      light: { x: 0, y: 0, z: 0, color: SODIUM, intensity: 900, mode: 'steady', phase: k * 3.1, grid: false }, // energia própria
    };
    // o emissor: o módulo central (o núcleo) é o essencial; destruída, a máquina apaga e a trincheira
    // inteira para (as outras não a atravessam) — no instante do fim, salvo no mundo
    this.dyn?.attach(`col:${lane.id}:${k}`, {
      root: g,
      meshes: [mh],
      essential: [{ x: 0, y: H / 2 + 2, z: -18, r: 22 }],
      onDead: (_why, replay) => {
        mach.dead = true;
        mg.visible = false;
        mach.light.intensity = 0;
        const ws = this.dyn.world.worldState;
        if (!replay && ws?.get(`colLane:${lane.id}`) === undefined) ws?.set(`colLane:${lane.id}`, this._laneTime(lane, this.now));
      },
    });
    return mach;
  }

  /** Sentido, fase e se a máquina k existe — tudo pelo hash da trincheira. */
  _laneInfo(lane) {
    if (!lane.info) {
      const s = this.field.seed;
      lane.info = {
        dir: hash4(s, lane.b.n, lane.lat, lane.axis === 'x' ? 0 : 1, 710) < 0.5 ? 1 : -1,
        phase: hash4(s, lane.b.n, lane.lat, lane.axis === 'x' ? 0 : 1, 711) * COLOSSUS.spacing,
      };
    }
    return lane.info;
  }

  exists(lane, k) {
    return hash4(this.field.seed, lane.b.n, k, lane.lat + (lane.axis === 'x' ? 0 : 7), 713) < COLOSSUS.fill;
  }

  /** Posição ao longo da trincheira da máquina k no tempo `time`. */
  posT(lane, k, time) {
    const { dir, phase } = this._laneInfo(lane);
    return k * COLOSSUS.spacing + phase + dir * COLOSSUS.speed * time;
  }

  /** Algum corte do emissor pega um dos dois trilhos do teto (gen/macrogen.js: a ±45 m do eixo,
   *  12 m abaixo do teto da trincheira)? */
  _railCut(lane) {
    const y = lane.b.bottom + COLOSSUS.depth - 12;
    for (const c of this.field.cuts ?? []) for (const side of [-45, 45]) if (railDist(c, lane.axis, lane.lat + side, y) < c.r + 2.5) return true;
    return false;
  }

  /** A trincheira parou (uma máquina dela destruída pelo emissor, ou o trilho cortado)? */
  laneStopped(lane) {
    return this.dyn?.world.worldState?.get(`colLane:${lane.id}`) !== undefined;
  }

  /**
   * A máquina mais próxima (em posição GLOBAL) de um ponto que `accept` aceite,
   * ou null — para o transporte e o sensor. `stopped`: a trincheira dela parou (onde ela
   * está de fato — não onde estaria andando).
   * @param {(m: any) => boolean} [accept]
   */
  nearest(field, g, time, accept = () => true) {
    this.field ??= field;
    let best = null;
    for (const lane of field.trenchesNear(g.x, g.y, g.z, 9000)) {
      const u = lane.axis === 'x' ? g.x : g.z;
      const lt = this._laneTime(lane, time);
      const base = this.posT(lane, 0, lt);
      const k0 = Math.round((u - base) / COLOSSUS.spacing);
      for (let k = k0 - 3; k <= k0 + 3; k++) {
        if (!this.exists(lane, k)) continue;
        const t = this.posT(lane, k, lt);
        const x = lane.axis === 'x' ? t : lane.lat;
        const z = lane.axis === 'x' ? lane.lat : t;
        const d = Math.hypot(x - g.x, lane.b.bottom - g.y, z - g.z);
        if (best && d >= best.d) continue;
        const m = { d, x, y: lane.b.bottom, z, lane, dir: this._laneInfo(lane).dir, stopped: this.laneStopped(lane) };
        if (accept(m)) best = m;
      }
    }
    return best;
  }

  update(time, dt, g, origin) {
    if (!this.field) return;
    this.now = time;
    this._scan -= dt;
    if (this._scan <= 0) {
      this._scan = 1;
      this.lanes = this.field.trenchesNear(g.x, g.y, g.z, RANGE);
    }
    const want = new Set();
    const F = this.field;
    for (const lane of this.lanes) {
      // um trilho do teto cortado pelo emissor: a trincheira para (no instante do corte, salvo no
      // mundo) — como os vagões e os elevadores; as máquinas não passam por um trilho cortado
      if (F.cuts?.length && lane.cutVer !== F.cutVer) {
        lane.cutVer = F.cutVer;
        if (!this.laneStopped(lane) && this._railCut(lane)) this.dyn?.world.worldState?.set(`colLane:${lane.id}`, this._laneTime(lane, time));
      }
      const lateral = lane.axis === 'x' ? g.z - lane.lat : g.x - lane.lat;
      if (Math.abs(lateral) > RANGE) continue;
      const u = lane.axis === 'x' ? g.x : g.z;
      const base = this.posT(lane, 0, this._laneTime(lane, time));
      const reach = Math.sqrt(Math.max(0, RANGE * RANGE - lateral * lateral));
      for (let k = Math.floor((u - reach - base) / COLOSSUS.spacing); k <= Math.ceil((u + reach - base) / COLOSSUS.spacing); k++) {
        if (!this.exists(lane, k)) continue;
        const id = `${lane.id}:${k}`;
        want.add(id);
        if (!this.machines.has(id)) this.machines.set(id, this._create(lane, k));
      }
    }
    for (const [id, m] of this.machines) {
      if (want.has(id)) continue;
      m.group.removeFromParent();
      this.machines.delete(id);
      this.dyn?.detach(`col:${id}`);
    }

    this.lights.length = 0;
    this.meshes.length = 0;
    for (const m of this.machines.values()) {
      const L = m.lane;
      const t = this.posT(L, m.k, this._laneTime(L, time));
      const x = L.axis === 'x' ? t : L.lat;
      const z = L.axis === 'x' ? L.lat : t;
      const y = L.b.bottom - DROP;
      // quanto andou neste quadro (em cena): quem está no convés anda junto (controls/walker.js)
      const hull = m.group.children[0];
      const moved = m.placed;
      const nx = x - origin.x;
      const nz = z - origin.z;
      hull.userData.dx = moved ? nx - m.group.position.x : 0;
      hull.userData.dz = moved ? nz - m.group.position.z : 0;
      m.placed = true;
      m.pos.set(x, y, z);
      m.group.position.set(nx, y - origin.y, nz);
      m.group.updateMatrixWorld(true);
      if (m.pos.distanceTo(g) < 400) this.meshes.push(hull);
      m.light.x = x;
      m.light.y = y + 1; // sob a plataforma, junto das lâmpadas dela
      m.light.z = z;
      this.lights.push(m.light);
      // o baque das garras (só as que dá para ouvir) — pelo relógio da trincheira: parada, não bate
      const lt = this._laneTime(L, time);
      const before = Math.floor((lt - dt + m.clamp) / CLAMP);
      if (lt === time && Math.floor((lt + m.clamp) / CLAMP) !== before && m.pos.distanceTo(g) < HEAR) this.bus?.emit('colossus:clamp', { x, y, z });
    }
  }

  /** A origem flutuante andou `delta`. */
  rebase(delta) {
    for (const m of this.machines.values()) m.group.position.sub(delta);
  }

  /** A máquina mais perto de passar pelo ponto `t` da trincheira: segundos até chegar (ou null).
   *  Trincheira parada: 0 se uma máquina ficou parada sobre o ponto; senão, nenhuma vem (null). */
  nextAt(lane, t, time) {
    const { dir } = this._laneInfo(lane);
    if (this.laneStopped(lane)) {
      const lt = this._laneTime(lane, time);
      const k0 = Math.round((t - this.posT(lane, 0, lt)) / COLOSSUS.spacing);
      for (let k = k0 - 1; k <= k0 + 1; k++) if (this.exists(lane, k) && Math.abs(t - this.posT(lane, k, lt)) < COLOSSUS.len / 2) return 0;
      return null;
    }
    const base = this.posT(lane, 0, time);
    const k0 = Math.round((t - base) / COLOSSUS.spacing);
    let best = null;
    for (let k = k0 - 8; k <= k0 + 8; k++) {
      if (!this.exists(lane, k)) continue;
      const s = ((t - this.posT(lane, k, time)) * dir) / COLOSSUS.speed; // > 0: ainda vem
      if (s > -COLOSSUS.len / 2 / COLOSSUS.speed && (best === null || s < best)) best = s;
    }
    return best;
  }

  dispose() {
    this._geo?.hull.dispose();
    this._geo?.glow.dispose();
    this.group.removeFromParent();
    this.machines.clear();
  }
}
