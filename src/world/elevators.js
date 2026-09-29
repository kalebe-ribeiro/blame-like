// ─────────────────────────────────────────────────────────────────────────────
//  Elevadores: as primeiras coisas que se MOVEM na Cidade.
//
//  O Field diz onde eles existem (passagens das camadas, fachadas do maciço);
//  aqui criamos os carros perto do observador e os animamos: sobem, param,
//  descem, param — num ciclo contínuo. São malhas colidíveis: dá para subir
//  num deles e ser carregado (o Walker lê userData.dy do chão onde pisa).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeAll, place } from './geometry.js';

const PAUSE = 12; // s parado em cada ponta

export class ElevatorSystem {
  /**
   * @param {THREE.Object3D} parent
   * @param {object} materials  { machine, grate }
   */
  constructor(parent, materials) {
    this.group = new THREE.Group();
    this.group.name = 'elevators';
    parent.add(this.group);
    this.materials = materials;
    this.cars = new Map(); // id → { def, mesh, y }
    this.meshes = [];
    this.lights = [];
    this._scanTimer = 0;
    this.field = null;
  }

  /** Altura do carro no instante t (ciclo: pausa · sobe · pausa · desce). */
  static heightAt(def, t) {
    const D = def.y1 - def.y0;
    const travel = D / def.speed;
    const cycle = 2 * (travel + PAUSE);
    let p = (t + def.phase) % cycle;
    const ease = (u) => u * u * (3 - 2 * u);
    if (p < PAUSE) return def.y0;
    p -= PAUSE;
    if (p < travel) return def.y0 + D * ease(p / travel);
    p -= travel;
    if (p < PAUSE) return def.y1;
    p -= PAUSE;
    return def.y1 - D * ease(p / travel);
  }

  _buildCar(def) {
    const parts = [];
    const { w, d } = def;
    const big = def.kind === 'grand';
    // piso (topo em y = 0 no espaço do carro)
    parts.push({ mat: 'grate', g: place(new THREE.BoxGeometry(w, 0.4, d), { y: -0.2 }) });
    parts.push({ mat: 'machine', g: place(new THREE.BoxGeometry(w + 0.4, big ? 3 : 0.8, d + 0.4), { y: -0.4 - (big ? 1.5 : 0.4) }) });
    // guarda-corpo em dois lados (os outros dois são embarque)
    for (const s of [-1, 1]) {
      parts.push({ mat: 'machine', g: place(new THREE.BoxGeometry(w, 0.1, 0.1), { y: 0.6, z: s * (d / 2 - 0.1) }) });
      parts.push({ mat: 'machine', g: place(new THREE.BoxGeometry(w, 0.1, 0.1), { y: 0.95, z: s * (d / 2 - 0.1) }) });
    }
    // cabos de tração subindo até sumir
    const cableH = big ? 400 : 120;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      parts.push({ mat: 'machine', g: place(new THREE.CylinderGeometry(big ? 0.25 : 0.08, big ? 0.25 : 0.08, cableH, 4, 1, true), { x: sx * (w / 2 - 1), y: cableH / 2, z: sz * (d / 2 - 1) }) });
    }
    if (big) {
      // uma cabine de operação vazia num canto
      parts.push({ mat: 'machine', g: place(new THREE.BoxGeometry(5, 3.2, 4), { x: w / 2 - 4, y: 1.6, z: d / 2 - 4 }) });
    }
    // a lâmpada de sinalização: sobre a cabine (grande) ou presa num cabo de tração
    const lamp = big ? { x: w / 2 - 4, y: 3.4, z: d / 2 - 4 } : { x: w / 2 - 1, y: 3.4, z: d / 2 - 1 };
    parts.push({ mat: 'machine', g: place(new THREE.BoxGeometry(0.7, 0.4, 0.7), lamp) });
    def.lamp = { x: lamp.x, y: lamp.y + 0.35, z: lamp.z };
    const group = new THREE.Group();
    for (const mat of ['grate', 'machine']) {
      const g = mergeAll(parts.filter((p) => p.mat === mat).map((p) => p.g));
      const mesh = new THREE.Mesh(g, this.materials[mat]);
      mesh.userData.mat = mat;
      mesh.userData.elevator = true;
      mesh.userData.dy = 0;
      group.add(mesh);
    }
    return group;
  }

  /**
   * @param {THREE.Vector3} g       posição global do observador
   * @param {THREE.Vector3} origin  origem flutuante
   */
  update(time, dt, g, origin) {
    if (!this.field) return;
    this.outages ??= null; // OutageSystem (o motor para nos apagões)
    this._scanTimer -= dt;
    if (this._scanTimer <= 0) {
      this._scanTimer = 1;
      const want = new Map(this.field.elevatorsNear(g.x, g.y, g.z, 1000).map((e) => [e.id, e]));
      for (const [id, car] of this.cars) {
        if (!want.has(id)) {
          car.group.traverse((o) => o.geometry?.dispose());
          car.group.removeFromParent();
          this.cars.delete(id);
        }
      }
      for (const [id, def] of want) {
        if (this.cars.has(id)) continue;
        def.phase = (Math.abs(Math.sin(def.x * 0.013 + def.z * 0.029)) * 1000) % 300;
        const group = this._buildCar(def);
        this.group.add(group);
        this.cars.set(id, { def, group, y: ElevatorSystem.heightAt(def, time), clock: time, rate: 1 });
      }
      this.meshes = [];
      for (const c of this.cars.values()) this.meshes.push(...c.group.children);
    }
    this.lights.length = 0;
    for (const car of this.cars.values()) {
      // sem energia, o motor para (desacelerando) e o carro fica onde está
      const powered = !this.outages || this.outages.power(car.def.x, car.y + 3, car.def.z, 3.3, time) >= 0.5;
      car.rate = powered ? Math.min(1, car.rate + dt / 8) : Math.max(0, car.rate - dt / 4);
      car.clock += car.rate * dt;
      const y = ElevatorSystem.heightAt(car.def, car.clock);
      const dy = y - car.y;
      car.y = y;
      car.group.position.set(car.def.x - origin.x, y - origin.y, car.def.z - origin.z);
      car.group.updateMatrixWorld(true);
      for (const m of car.group.children) m.userData.dy = dy;
      // lâmpada de sinalização presa ao carro (âmbar parado, vermelha em movimento)
      const moving = Math.abs(dy) > 1e-3;
      const lp = car.def.lamp;
      this.lights.push({ x: car.def.x + lp.x, y: y + lp.y, z: car.def.z + lp.z, color: moving ? [0.85, 0.12, 0.05] : [1, 0.5, 0.17], intensity: car.def.kind === 'grand' ? 90 : 20, mode: moving ? 'faulty' : 'steady', phase: car.def.x % 7 });
    }
  }

  dispose() {
    for (const car of this.cars.values()) car.group.traverse((o) => o.geometry?.dispose());
    this.cars.clear();
    this.group.removeFromParent();
  }
}
