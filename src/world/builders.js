// ─────────────────────────────────────────────────────────────────────────────
//  Os Construtores: máquinas que continuam erguendo a Cidade sem propósito.
//
//  Cada canteiro (posição dada pelo Field) tem um pórtico colossal sobre
//  trilhos. O ciclo nunca termina:
//    anda até o próximo ponto → desce um bloco → solda (clarões e marteladas)
//    → solta → sobe o gancho → próximo ponto
//  Os blocos colocados ficam: a estrutura cresce, camada por camada, enquanto
//  você observa. Nada disso é persistente — ao voltar, a obra recomeçou de
//  outro ponto, como se o tempo ali fosse outro.
//
//  Cemitérios (def.dead, ~30%): canteiros que a Cidade esqueceu. O pórtico
//  parou torto sobre uma perna que cedeu, o gancho caiu com a carga, a obra
//  ficou pela metade com falhas, blocos espalhados pelo chão; às vezes
//  pórticos mais antigos já tombados ao lado. Só uma lâmpada de aviso resta.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { mergeAll, place } from './geometry.js';
import { RNG } from '../core/rng.js';

const SPAN = 150; // vão do pórtico
const LEG_H = 70; // altura das pernas
const _beacon = new THREE.Vector3();
const BLOCK = { w: 12, h: 8 };
const MOVE_SPEED = 3; // m/s do pórtico nos trilhos
const LOWER_T = 9;
const WELD_T = 7;
const RAISE_T = 6;

export class BuilderSystem {
  constructor(parent, materials) {
    this.group = new THREE.Group();
    this.group.name = 'builders';
    parent.add(this.group);
    this.materials = materials;
    this.sites = new Map();
    this.lights = [];
    this.bus = null; // evento builder:work { kind: 'clang'|'weld', x, y, z }
    this.field = null;
    this._scanTimer = 0;
  }

  _createSite(def) {
    const r = new RNG(def.seed >>> 0);
    const site = { def, r, group: new THREE.Group(), built: [], cols: Math.floor((SPAN - 30) / BLOCK.w), plan: [] };
    // plano de obra: uma parede sendo levantada fiada por fiada, com falhas
    const cols = site.cols;
    for (let layer = 0; layer < 30; layer++) {
      for (let row = 0; row < 3; row++) for (let c = 0; c < cols; c++) if (r.chance(0.82)) site.plan.push({ c, row, layer });
    }
    // parte já construída (o canteiro não começou agora)
    const pre = r.int(cols, cols * 4);
    site.built = site.plan.splice(0, pre);
    // estrutura fixa: trilhos
    const railLen = SPAN + 60;
    const railParts = [];
    for (const s of [-1, 1]) railParts.push(place(new THREE.BoxGeometry(def.axis === 'x' ? 1.2 : railLen, 1, def.axis === 'x' ? railLen : 1.2), def.axis === 'x' ? { x: (s * SPAN) / 2, y: 0.5 } : { z: (s * SPAN) / 2, y: 0.5 }));
    site.rails = new THREE.Mesh(mergeAll(railParts), this.materials.machine);
    site.group.add(site.rails);
    // pórtico (móvel)
    site.gantry = new THREE.Mesh(mergeAll(this._gantryParts(def)), this.materials.machine);
    site.group.add(site.gantry);
    // gancho + bloco pendurado
    site.hook = new THREE.Mesh(mergeAll([place(new THREE.BoxGeometry(3, 1.5, 3), {}), place(new THREE.CylinderGeometry(0.15, 0.15, 60, 4, 1, true), { y: 30 })]), this.materials.machine);
    site.load = new THREE.Mesh(new THREE.BoxGeometry(BLOCK.w, BLOCK.h, BLOCK.w), this.materials.block);
    site.group.add(site.hook, site.load);
    site.builtMesh = null;
    if (def.dead) {
      this._wreck(site, r);
      return site;
    }
    this._rebuildBuilt(site);
    this._nextTask(site, 0);
    return site;
  }

  /** Transforma o canteiro num cemitério: nada se move mais. */
  _wreck(site, r) {
    const def = site.def;
    const along = def.axis === 'x' ? 'z' : 'x';
    const rust = this.materials.rib;
    site.dead = true;
    site.rails.material = rust;
    // o pórtico parou num ponto qualquer, torto: uma perna afundou
    site.gantry.material = rust;
    const gx = r.float(-40, 40);
    if (along === 'z') site.gantry.position.set(0, -3, gx);
    else site.gantry.position.set(gx, -3, 0);
    const tilt = r.sign() * r.float(0.06, 0.16);
    if (along === 'z') site.gantry.rotation.z = tilt;
    else site.gantry.rotation.x = tilt;
    // o gancho caiu com a carga
    const hx = r.float(-SPAN / 3, SPAN / 3);
    site.hook.position.set(along === 'z' ? hx : gx + 6, 0.75, along === 'z' ? gx + 6 : hx);
    site.hook.rotation.set(r.float(-0.4, 0.4), r.float(0, 3), 1.2);
    site.load.position.set(along === 'z' ? hx + 7 : gx + 9, BLOCK.h / 2 - 1.2, along === 'z' ? gx + 9 : hx + 7);
    site.load.rotation.set(r.float(-0.3, 0.3), r.float(0, 3), r.float(0.2, 0.6));
    // a obra ficou pela metade, com falhas
    const keep = r.int(site.cols * 2, site.cols * 9);
    site.built = site.built.concat(site.plan.splice(0, keep)).filter(() => r.chance(0.8));
    site.plan = [];
    this._rebuildBuilt(site);
    // blocos que caíram, espalhados
    const debris = [];
    for (let i = 0; i < r.int(6, 16); i++) {
      const a = r.float(0, Math.PI * 2);
      const d = r.float(12, 70);
      debris.push(place(new THREE.BoxGeometry(BLOCK.w - 0.3, BLOCK.h - 0.3, BLOCK.w - 0.3), {
        x: Math.cos(a) * d, y: BLOCK.h / 2 - r.float(0.5, 2.5), z: Math.sin(a) * d,
        rx: r.float(-0.5, 0.5), ry: r.float(0, 3), rz: r.float(-0.5, 0.5),
      }));
    }
    const debrisMesh = new THREE.Mesh(mergeAll(debris), this.materials.block);
    site.group.add(debrisMesh);
    // às vezes, pórticos mais antigos já tombados ao lado (o cemitério)
    const n = r.chance(0.55) ? r.int(1, 3) : 0;
    for (let i = 0; i < n; i++) {
      const g = new THREE.Mesh(site.gantry.geometry, rust);
      const off = (r.chance(0.5) ? 1 : -1) * r.float(70, 150);
      if (along === 'z') {
        g.position.set(r.float(-30, 30), 4, off);
        g.rotation.set(r.float(-0.2, 0.2), r.float(-0.3, 0.3), Math.PI / 2 * r.sign() * r.float(0.85, 1));
      } else {
        g.position.set(off, 4, r.float(-30, 30));
        g.rotation.set(Math.PI / 2 * r.sign() * r.float(0.85, 1), r.float(-0.3, 0.3), r.float(-0.2, 0.2));
      }
      site.group.add(g);
    }
    site.warn = { phase: r.float(0, 10) };
  }

  _gantryParts(def) {
    const parts = [];
    const across = def.axis === 'x' ? 'x' : 'z'; // o vão atravessa este eixo
    for (const s of [-1, 1]) {
      const leg = new THREE.BoxGeometry(5, LEG_H, 5);
      leg.translate(across === 'x' ? (s * SPAN) / 2 : 0, LEG_H / 2 + 1, across === 'z' ? (s * SPAN) / 2 : 0);
      parts.push(leg);
      // truque (rodas) na base da perna
      const bogie = new THREE.BoxGeometry(across === 'x' ? 6 : 12, 3, across === 'x' ? 12 : 6);
      bogie.translate(across === 'x' ? (s * SPAN) / 2 : 0, 2.5, across === 'z' ? (s * SPAN) / 2 : 0);
      parts.push(bogie);
    }
    const beam = new THREE.BoxGeometry(across === 'x' ? SPAN + 10 : 8, 8, across === 'x' ? 8 : SPAN + 10);
    beam.translate(0, LEG_H + 4, 0);
    parts.push(beam);
    // cabine do operador (vazia)
    // o farol no alto da viga (a lâmpada fica logo acima dele)
    const beacon = new THREE.BoxGeometry(1.4, 0.8, 1.4);
    beacon.translate(0, LEG_H + 8.4, 0);
    parts.push(beacon);
    const cab = new THREE.BoxGeometry(6, 5, 6);
    cab.translate(across === 'x' ? SPAN / 2 - 8 : 0, LEG_H - 3, across === 'z' ? SPAN / 2 - 8 : 0);
    parts.push(cab);
    return parts;
  }

  /** Posição (local ao canteiro) de uma célula do plano. */
  _cellPos(site, cell) {
    const across = -((site.cols - 1) * BLOCK.w) / 2 + cell.c * BLOCK.w;
    const along = (cell.row - 1) * BLOCK.w * 3;
    const y = BLOCK.h / 2 + cell.layer * BLOCK.h;
    return site.def.axis === 'x' ? new THREE.Vector3(across, y, along) : new THREE.Vector3(along, y, across);
  }

  _rebuildBuilt(site) {
    if (site.builtMesh) {
      site.builtMesh.geometry.dispose();
      site.builtMesh.removeFromParent();
    }
    if (!site.built.length) {
      site.builtMesh = null;
      return;
    }
    const g = mergeAll(site.built.map((c) => {
      const p = this._cellPos(site, c);
      return place(new THREE.BoxGeometry(BLOCK.w - 0.3, BLOCK.h - 0.3, BLOCK.w - 0.3), { x: p.x, y: p.y, z: p.z });
    }));
    site.builtMesh = new THREE.Mesh(g, this.materials.block);
    site.group.add(site.builtMesh);
  }

  _nextTask(site, time) {
    if (!site.plan.length) {
      // terminou? recomeça ao lado — a obra não termina nunca
      site.built = [];
      for (let layer = 0; layer < 30; layer++) for (let row = 0; row < 3; row++) for (let c = 0; c < site.cols; c++) if (site.r.chance(0.82)) site.plan.push({ c, row, layer });
      this._rebuildBuilt(site);
    }
    site.task = { cell: site.plan[0], phase: 'move', t0: time };
  }

  update(time, dt, g, origin) {
    if (!this.field) return;
    this._scanTimer -= dt;
    if (this._scanTimer <= 0) {
      this._scanTimer = 2;
      const want = new Map(this.field.builderSitesNear(g.x, g.y, g.z, 2200).map((s) => [s.id, s]));
      for (const [id, site] of this.sites) {
        if (!want.has(id)) {
          site.group.traverse((o) => o.geometry?.dispose());
          site.group.removeFromParent();
          this.sites.delete(id);
        }
      }
      for (const [id, def] of want) {
        if (this.sites.has(id)) continue;
        const site = this._createSite(def);
        this.group.add(site.group);
        this.sites.set(id, site);
      }
    }

    this.lights.length = 0;
    for (const site of this.sites.values()) {
      const d = site.def;
      site.group.position.set(d.x - origin.x, d.y - origin.y, d.z - origin.z);
      if (site.dead) {
        // só a lâmpada de aviso, vermelha e fraca, no alto do pórtico torto
        site.group.updateMatrixWorld(true);
        // o farol inclina junto com o pórtico torto
        const bp = _beacon.set(0, LEG_H + 9, 0).applyMatrix4(site.gantry.matrix);
        this.lights.push({ x: d.x + bp.x, y: d.y + bp.y, z: d.z + bp.z, color: [0.85, 0.12, 0.05], intensity: 40, mode: 'faulty', phase: site.warn.phase, grid: false });
        continue;
      }
      const task = site.task;
      const target = this._cellPos(site, task.cell);
      const along = d.axis === 'x' ? 'z' : 'x'; // o pórtico anda neste eixo
      const hookTop = LEG_H - 2;
      site.gx ??= 0;
      site.hx ??= 0;
      const tt = time - task.t0;
      let hookY = hookTop - 8;
      let loadVisible = true;
      const acrossPos = d.axis === 'x' ? target.x : target.z;
      if (task.phase === 'move') {
        // o pórtico anda nos trilhos e o carro do guincho corre pela viga
        const goal = along === 'z' ? target.z : target.x;
        const step = MOVE_SPEED * dt;
        const toward = (v, g2) => (Math.abs(g2 - v) < step ? g2 : v + Math.sign(g2 - v) * step);
        site.gx = toward(site.gx, goal);
        site.hx = toward(site.hx, acrossPos);
        if (Math.abs(goal - site.gx) < 0.01 && Math.abs(acrossPos - site.hx) < 0.01) Object.assign(task, { phase: 'lower', t0: time });
      } else if (task.phase === 'lower') {
        const u = Math.min(1, tt / LOWER_T);
        hookY = hookTop - 8 + (target.y + BLOCK.h / 2 + 0.75 - (hookTop - 8)) * u * u * (3 - 2 * u);
        if (u >= 1) Object.assign(task, { phase: 'weld', t0: time });
      } else if (task.phase === 'weld') {
        hookY = target.y + BLOCK.h / 2 + 0.75;
        // clarões de solda e marteladas
        if (Math.random() < dt * 6) {
          const wp = target.clone().add(site.group.position).add(origin);
          this.bus?.emit('builder:work', { kind: Math.random() < 0.3 ? 'clang' : 'weld', x: wp.x, y: wp.y - BLOCK.h / 2, z: wp.z });
        }
        if (tt >= WELD_T) {
          site.built.push(site.plan.shift());
          this._rebuildBuilt(site);
          Object.assign(task, { phase: 'raise', t0: time });
        }
      } else if (task.phase === 'raise') {
        loadVisible = false;
        const u = Math.min(1, tt / RAISE_T);
        hookY = target.y + BLOCK.h / 2 + 0.75 + (hookTop - 8 - (target.y + BLOCK.h / 2 + 0.75)) * u;
        if (u >= 1) this._nextTask(site, time);
      }
      // posiciona pórtico, gancho e carga
      if (along === 'z') site.gantry.position.set(0, 0, site.gx);
      else site.gantry.position.set(site.gx, 0, 0);
      const hx = along === 'z' ? site.hx : site.gx;
      const hz = along === 'z' ? site.gx : site.hx;
      site.hook.position.set(hx, hookY, hz);
      site.load.visible = loadVisible && task.phase !== 'raise';
      site.load.position.set(hx, hookY - 0.75 - BLOCK.h / 2, hz);
      site.group.updateMatrixWorld(true);

      // luzes: farol âmbar no alto do pórtico, arco de solda no ponto de trabalho
      const gp = site.gantry.position;
      this.lights.push({ x: d.x + gp.x, y: d.y + gp.y + LEG_H + 9, z: d.z + gp.z, color: [1, 0.5, 0.17], intensity: 300, mode: 'faulty', phase: 3, grid: false });
      if (task.phase === 'weld') {
        this.lights.push({ x: d.x + hx, y: d.y + target.y - BLOCK.h / 2 + 1, z: d.z + hz, color: [0.8, 0.88, 1], intensity: 700 * (0.4 + Math.random()), mode: 'steady', phase: 0, grid: false });
      }
    }
  }

  dispose() {
    for (const s of this.sites.values()) s.group.traverse((o) => o.geometry?.dispose());
    this.sites.clear();
    this.group.removeFromParent();
  }
}
