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
import { COLOSSUS } from '../gen/field.js';
import { hash4 } from '../gen/hash.js';
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
    this.bus = null; // evento colossus:clamp { x, y, z }
    this._scan = 0;
    this._geo = null;
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
    const mh = new THREE.Mesh(hull, this.materials.colossus);
    const mg = new THREE.Mesh(glow, this.materials.colossusBeam);
    mg.renderOrder = 5;
    for (const m of [mh, mg]) {
      m.matrixAutoUpdate = false;
      g.add(m);
    }
    if (lane.axis === 'x') g.rotation.y = Math.PI / 2;
    this.group.add(g);
    return {
      group: g,
      lane,
      k,
      pos: new THREE.Vector3(),
      clamp: hash4(this.field.seed, lane.b.n, k, lane.lat, 712) * CLAMP,
      light: { x: 0, y: 0, z: 0, color: SODIUM, intensity: 900, mode: 'steady', phase: k * 3.1 },
    };
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

  /**
   * A máquina mais próxima (em posição GLOBAL) de um ponto que `accept` aceite,
   * ou null — para o transporte.
   */
  nearest(field, g, time, accept = () => true) {
    this.field ??= field;
    let best = null;
    for (const lane of field.trenchesNear(g.x, g.y, g.z, 9000)) {
      const u = lane.axis === 'x' ? g.x : g.z;
      const base = this.posT(lane, 0, time);
      const k0 = Math.round((u - base) / COLOSSUS.spacing);
      for (let k = k0 - 3; k <= k0 + 3; k++) {
        if (!this.exists(lane, k)) continue;
        const t = this.posT(lane, k, time);
        const x = lane.axis === 'x' ? t : lane.lat;
        const z = lane.axis === 'x' ? lane.lat : t;
        const d = Math.hypot(x - g.x, lane.b.bottom - g.y, z - g.z);
        if (best && d >= best.d) continue;
        const m = { d, x, y: lane.b.bottom, z, lane, dir: this._laneInfo(lane).dir };
        if (accept(m)) best = m;
      }
    }
    return best;
  }

  update(time, dt, g, origin) {
    if (!this.field) return;
    this._scan -= dt;
    if (this._scan <= 0) {
      this._scan = 1;
      this.lanes = this.field.trenchesNear(g.x, g.y, g.z, RANGE);
    }
    const want = new Set();
    for (const lane of this.lanes) {
      const lateral = lane.axis === 'x' ? g.z - lane.lat : g.x - lane.lat;
      if (Math.abs(lateral) > RANGE) continue;
      const u = lane.axis === 'x' ? g.x : g.z;
      const base = this.posT(lane, 0, time);
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
    }

    this.lights.length = 0;
    for (const m of this.machines.values()) {
      const L = m.lane;
      const t = this.posT(L, m.k, time);
      const x = L.axis === 'x' ? t : L.lat;
      const z = L.axis === 'x' ? L.lat : t;
      const y = L.b.bottom - DROP;
      m.pos.set(x, y, z);
      m.group.position.set(x - origin.x, y - origin.y, z - origin.z);
      m.group.updateMatrixWorld(true);
      m.light.x = x;
      m.light.y = y - 20;
      m.light.z = z;
      this.lights.push(m.light);
      // o baque das garras (só as que dá para ouvir)
      const before = Math.floor((time - dt + m.clamp) / CLAMP);
      if (Math.floor((time + m.clamp) / CLAMP) !== before && m.pos.distanceTo(g) < HEAR) this.bus?.emit('colossus:clamp', { x, y, z });
    }
  }

  /** A origem flutuante andou `delta`. */
  rebase(delta) {
    for (const m of this.machines.values()) m.group.position.sub(delta);
  }

  dispose() {
    this._geo?.hull.dispose();
    this._geo?.glow.dispose();
    this.group.removeFromParent();
    this.machines.clear();
  }
}
