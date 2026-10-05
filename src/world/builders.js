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
//
//  O EMISSOR (a arma de Killy): a obra e os trilhos são cortados como o resto da Cidade — o furo
//  cilíndrico, as faces em brasa (gen/cut.js cutPiece, bloco a bloco); os cortes ficam no mundo
//  salvo e a obra recriada (ou que cresce) já vem cortada. O pórtico é uma estrutura ATIVA
//  (world/dynamic.js): cortado, continua trabalhando, a menos que o corte pegue uma perna embaixo,
//  a viga no meio, ou que a resistência dele acabe — aí o canteiro cai (vira cemitério). Tudo do
//  canteiro é sólido para o corpo (world/collision.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { movingMaterial } from '../shaders/materials.js';
import { mergeAll, place } from './geometry.js';
import { RNG } from '../core/rng.js';
import { cutPiece, dropLoose, segDist } from '../gen/cut.js';

const SPAN = 150; // vão do pórtico
const LEG_H = 70; // altura das pernas
const _beacon = new THREE.Vector3();
const BLOCK = { w: 12, h: 8 };
/** (testes) as medidas do pórtico */
export const BUILDER = { SPAN, LEG_H, BLOCK };
const MOVE_SPEED = 3; // m/s do pórtico nos trilhos
const LOWER_T = 9;
const GROUND = new THREE.Box3(new THREE.Vector3(-Infinity, -Infinity, -Infinity), new THREE.Vector3(Infinity, 0.2, Infinity));
const BREAK_CLEAR = 7; // m: o truque (12 m ao longo do trilho) para antes da ponta de um trilho cortado
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
    this.stats = { destroyed: 0 };
    /** @type {any} os cortes do emissor no pórtico (world/dynamic.js) */
    this.dyn = null;
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
    site.railParts = railParts;
    site.rails = new THREE.Mesh(mergeAll(railParts), this.materials.machine);
    site.group.add(site.rails);
    // pórtico (móvel)
    // (o pórtico, o gancho e a carga andam: o desenho preso a eles)
    site.gantry = new THREE.Mesh(mergeAll(this._gantryParts(def)), movingMaterial(this.materials.machine));
    site.group.add(site.gantry);
    // gancho + bloco pendurado
    site.hook = new THREE.Mesh(mergeAll([place(new THREE.BoxGeometry(3, 1.5, 3), {}), place(new THREE.CylinderGeometry(0.15, 0.15, 60, 4, 1, true), { y: 30 })]), movingMaterial(this.materials.machine));
    site.load = new THREE.Mesh(new THREE.BoxGeometry(BLOCK.w, BLOCK.h, BLOCK.w), movingMaterial(this.materials.block));
    site.group.add(site.hook, site.load);
    site.builtMesh = null;
    if (def.dead) {
      this._wreck(site, r);
      return site;
    }
    this._rebuildBuilt(site);
    this._nextTask(site, 0);
    this._applyCuts(site, this.field?.cuts);
    this._attachGantry(site);
    return site;
  }

  /** O pórtico, estrutura ativa: as pernas embaixo e o meio da viga são o essencial. */
  _attachGantry(site) {
    if (!this.dyn) return;
    const across = site.def.axis === 'x' ? 'x' : 'z';
    const at = (t, y, r) => (across === 'x' ? { x: t, y, z: 0, r } : { x: 0, y, z: t, r });
    site.group.position.set(site.def.x - (this.origin?.x ?? 0), site.def.y - (this.origin?.y ?? 0), site.def.z - (this.origin?.z ?? 0));
    this.dyn.attach(`bg:${site.def.id}`, {
      root: site.gantry,
      meshes: [site.gantry],
      essential: [at(-SPAN / 2, 4, 4), at(SPAN / 2, 4, 4), at(0, LEG_H + 4, 7)],
      onDead: (_why, replay) => {
        if (site.dead) return;
        // derrubado pelo emissor: tomba ONDE ESTÁ (nada some nem aparece); onde ficou vai para o mundo
        // salvo — o canteiro recriado volta igual (sem isto, ia para um ponto qualquer do trilho)
        const ws = this.dyn.world.worldState;
        const key = `bgWreck:${site.def.id}`;
        if (!replay && ws?.get(key) === undefined) ws?.set(key, { gx: site.gx ?? 0, hx: site.hx ?? 0 });
        this._wreck(site, new RNG((site.def.seed ^ 0x9e3779b9) >>> 0), ws?.get(key) ?? null);
        this.stats.destroyed++;
        if (!replay) this.bus?.emit('builder:destroyed', { id: site.def.id, x: site.def.x, y: site.def.y + LEG_H / 2, z: site.def.z });
      },
    });
  }

  /** Os cortes do emissor (world.js _reactToCuts): os blocos atravessados somem; o pórtico atingido cai. */
  onCut(cuts) {
    for (const site of this.sites.values()) this._applyCuts(site, cuts);
  }

  _applyCuts(site, cuts) {
    const d = site.def;
    const near = (cuts ?? []).filter((c) => segDist(d.x, d.y + LEG_H / 2, d.z, c) < SPAN + 40 + c.r);
    const ids = near.map((c) => c.id).join(',');
    if (ids === (site.cutIds ?? '')) return;
    site.cutIds = ids;
    site.cutMemo = new Map(); // (as chaves levam a lista de cortes: as de antes não servem mais — e acumulavam)
    site.cutsL = near.map((c) => ({ id: c.id, a: [c.a[0] - d.x, c.a[1] - d.y, c.a[2] - d.z], b: [c.b[0] - d.x, c.b[1] - d.y, c.b[2] - d.z], r: c.r, keep: c.keep && [c.keep[0] - d.x, c.keep[1] - d.y, c.keep[2] - d.z, c.keep[3], c.keep[4] - d.y] }));
    this._rebuildBuilt(site);
    // os trilhos (fixos): o mesmo corte
    const r = this._cutParts(site.railParts, site.cutsL, site, 'rail');
    // onde os trilhos foram cortados (ao longo deles): o pórtico não passa dali
    const along = d.axis === 'x' ? 2 : 0;
    const across = d.axis === 'x' ? 0 : 2;
    const half = (SPAN + 60) / 2;
    site.railBreaks = [];
    for (const c of site.cutsL) {
      for (const side of [-SPAN / 2, SPAN / 2]) {
        // o ponto do eixo do corte mais perto do trilho (a reta ao longo, em lado = side, y = 0,5)
        const pa = c.a[across];
        const dp = c.b[across] - pa;
        const dy = c.b[1] - c.a[1];
        const L2 = dp * dp + dy * dy;
        const u = L2 > 1e-9 ? Math.max(0, Math.min(1, ((side - pa) * dp + (0.5 - c.a[1]) * dy) / L2)) : 0;
        if (Math.hypot(pa + dp * u - side, c.a[1] + dy * u - 0.5) >= c.r + 0.6) continue;
        const at = c.a[along] + (c.b[along] - c.a[along]) * u;
        if (Math.abs(at) < half) site.railBreaks.push(at);
      }
    }
    site.rails.geometry.dispose();
    site.rails.geometry = r.kept;
    this._setCaps(site, 'railCaps', r.caps);
  }

  /** Os blocos da obra: cada um pelo seu próprio corte (a chave é a célula — a obra cresce sem recortar tudo). */
  _cutBlocks(site, parts) {
    site.cutMemo ??= new Map();
    const kept = [];
    const caps = [];
    for (const g of parts) {
      if (!site.cutsL?.length) {
        kept.push(g);
        continue;
      }
      g.computeBoundingSphere();
      const key = `b:${g.userData.cell}:${site.cutIds}`;
      let res = site.cutMemo.get(key);
      if (!res) {
        res = cutPiece(g, site.cutsL, { maxEdge: 1.5 });
        if (res.mode !== 'none') this._dropLoose(site, g, parts, res);
        site.cutMemo.set(key, res);
      }
      if (res.kept) kept.push(res.kept);
      if (res.caps) caps.push(res.caps);
    }
    return { kept: kept.length ? mergeAll(kept.map((g) => g.clone())) : new THREE.BufferGeometry(), caps: caps.length ? mergeAll(caps.map((g) => g.clone())) : null };
  }

  /** Os pedaços pequenos de um bloco cortado que ficaram soltos (sem encostar noutro bloco nem no chão)
   *  caem — a regra dos chunks (gen/cut.js dropLoose); cada um uma vez só. */
  _dropLoose(site, g, parts, res) {
    const boxes = [];
    for (const q of parts) {
      if (q === g) continue;
      if (!q.boundingBox) q.computeBoundingBox();
      boxes.push(q.boundingBox.clone().expandByScalar(0.2)); // (a junta de 0,3 m entre blocos: soldados)
    }
    boxes.push(GROUND); // o chão do canteiro: o que encosta nele (pela junta de baixo) está apoiado
    const d = site.def;
    for (const f of dropLoose(res, boxes)) {
      const key = `${g.userData.cell}:${f.min.concat(f.max).map((v) => Math.round(v * 2)).join(',')}`;
      if ((site.dropped ??= new Set()).has(key)) continue;
      site.dropped.add(key);
      this.bus?.emit('cut:loose', { x: d.x + (f.min[0] + f.max[0]) / 2, y: d.y + (f.min[1] + f.max[1]) / 2, z: d.z + (f.min[2] + f.max[2]) / 2, sx: f.max[0] - f.min[0], sy: f.max[1] - f.min[1], sz: f.max[2] - f.min[2], mat: 'block' });
    }
  }

  /** Corta peças (geometrias no frame do canteiro) pelos cortes: → { kept (uma malha), caps (ou null) }. */
  _cutParts(parts, cutsL, site, tag) {
    site.cutMemo ??= new Map();
    const kept = [];
    const caps = [];
    parts.forEach((g, i) => {
      if (!cutsL?.length) {
        kept.push(g);
        return;
      }
      const key = `${tag}:${i}:${g.attributes.position.count}:${site.cutIds}`;
      let res = site.cutMemo.get(key);
      if (!res) {
        res = cutPiece(g, cutsL, { maxEdge: 1.5 });
        site.cutMemo.set(key, res);
      }
      if (res.kept) kept.push(res.kept);
      if (res.caps) caps.push(res.caps);
    });
    return { kept: kept.length ? mergeAll(kept.map((g) => g.clone())) : new THREE.BufferGeometry(), caps: caps.length ? mergeAll(caps.map((g) => g.clone())) : null };
  }

  /** As faces de um corte (em brasa) do canteiro: uma malha por grupo (a obra, os trilhos). */
  _setCaps(site, key, geom) {
    if (site[key]) {
      site[key].geometry.dispose();
      site[key].removeFromParent();
      site[key] = null;
    }
    if (!geom) return;
    site[key] = new THREE.Mesh(geom, this.materials.cut);
    site.group.add(site[key]);
  }

  /**
   * O canteiro morto. `at` ({ gx, hx }): derrubado pelo emissor — o pórtico tomba onde estava, o gancho
   * e a carga caem embaixo de onde estavam, e nada mais muda (a obra, os blocos, os pórticos velhos).
   * Sem `at`: um cemitério desde sempre (a geração — o ponto e o resto pelo RNG do canteiro).
   */
  _wreck(site, r, at = null) {
    const def = site.def;
    const along = def.axis === 'x' ? 'z' : 'x';
    const rust = this.materials.rib;
    site.dead = true;
    site.rails.material = rust;
    // o pórtico parou num ponto qualquer, torto: uma perna afundou
    site.gantry.material = rust;
    const gx0 = r.float(-40, 40);
    const gx = at ? at.gx : gx0;
    if (along === 'z') site.gantry.position.set(0, -3, gx);
    else site.gantry.position.set(gx, -3, 0);
    const tilt = r.sign() * r.float(0.06, 0.16);
    if (along === 'z') site.gantry.rotation.z = tilt;
    else site.gantry.rotation.x = tilt;
    // o gancho caiu com a carga
    const hx0 = r.float(-SPAN / 3, SPAN / 3);
    const hx = at ? at.hx : hx0;
    site.hook.position.set(along === 'z' ? hx : gx + 6, 0.75, along === 'z' ? gx + 6 : hx);
    site.hook.rotation.set(r.float(-0.4, 0.4), r.float(0, 3), 1.2);
    site.load.position.set(along === 'z' ? hx + 7 : gx + 9, BLOCK.h / 2 - 1.2, along === 'z' ? gx + 9 : hx + 7);
    site.load.rotation.set(r.float(-0.3, 0.3), r.float(0, 3), r.float(0.2, 0.6));
    site.load.visible = true;
    site.group.updateMatrixWorld(true);
    if (at) {
      site.warn = { phase: r.float(0, 10) };
      return;
    }
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
    // cada bloco, cortado como o resto da Cidade pelos cortes que o pegam (memorizado por bloco)
    const parts = site.built.map((c) => {
      const p = this._cellPos(site, c);
      const g = place(new THREE.BoxGeometry(BLOCK.w - 0.3, BLOCK.h - 0.3, BLOCK.w - 0.3), { x: p.x, y: p.y, z: p.z });
      g.userData.cell = `${c.c},${c.row},${c.layer}`;
      return g;
    });
    const r = this._cutBlocks(site, parts);
    site.builtMesh = new THREE.Mesh(r.kept, this.materials.block);
    site.group.add(site.builtMesh);
    this._setCaps(site, 'builtCaps', r.caps);
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
    this.origin = origin;
    this._scanTimer -= dt;
    if (this._scanTimer <= 0) {
      this._scanTimer = 2;
      const want = new Map(this.field.builderSitesNear(g.x, g.y, g.z, 2200).map((s) => [s.id, s]));
      for (const [id, site] of this.sites) {
        if (!want.has(id)) {
          site.group.traverse((o) => o.geometry?.dispose());
          site.group.removeFromParent();
          this.sites.delete(id);
          this.dyn?.detach(`bg:${id}`);
        }
      }
      // as obras novas: uma por quadro (montar uma leva dezenas de ms — todas juntas travavam a chegada)
      this._pend = [...want.values()].filter((def) => !this.sites.has(def.id));
    }
    const def = this._pend?.shift();
    if (def && !this.sites.has(def.id)) {
      const site = this._createSite(def);
      this.group.add(site.group);
      this.sites.set(def.id, site);
    }

    this.lights.length = 0;
    for (const site of this.sites.values()) {
      const d = site.def;
      site.group.position.set(d.x - origin.x, d.y - origin.y, d.z - origin.z);
      if (site.dead) {
        // parado: nada mais anda (o que ficou do último quadro arrastaria quem está em cima)
        for (const m of [site.gantry, site.hook, site.load]) m.userData.dx = m.userData.dy = m.userData.dz = 0;
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
        let goal = along === 'z' ? target.z : target.x;
        // um trilho cortado no caminho: o pórtico chega até o corte e para ali (a obra para)
        const dir = Math.sign(goal - site.gx);
        for (const at of site.railBreaks ?? []) {
          const stopAt = at - dir * BREAK_CLEAR;
          if (dir && (at - site.gx) * dir > 0 && (goal - stopAt) * dir > 0) goal = (stopAt - site.gx) * dir > 0 ? stopAt : site.gx;
        }
        site.stuck = goal !== (along === 'z' ? target.z : target.x);
        const step = MOVE_SPEED * dt;
        const toward = (v, g2) => (Math.abs(g2 - v) < step ? g2 : v + Math.sign(g2 - v) * step);
        site.gx = toward(site.gx, goal);
        site.hx = toward(site.hx, acrossPos);
        if (!site.stuck && Math.abs(goal - site.gx) < 0.01 && Math.abs(acrossPos - site.hx) < 0.01) Object.assign(task, { phase: 'lower', t0: time });
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
      // posiciona pórtico, gancho e carga — e quanto cada um andou neste quadro (quem está de pé
      // neles anda junto: controls/walker.js, world/entities.js — como nos vagões e elevadores)
      const before = [site.gantry, site.hook, site.load].map((m) => m.position.clone());
      if (along === 'z') site.gantry.position.set(0, 0, site.gx);
      else site.gantry.position.set(site.gx, 0, 0);
      const hx = along === 'z' ? site.hx : site.gx;
      const hz = along === 'z' ? site.gx : site.hx;
      site.hook.position.set(hx, hookY, hz);
      site.load.visible = loadVisible && task.phase !== 'raise';
      site.load.position.set(hx, hookY - 0.75 - BLOCK.h / 2, hz);
      [site.gantry, site.hook, site.load].forEach((m, i) => {
        const placed = m.userData.placed;
        m.userData.dx = placed ? m.position.x - before[i].x : 0;
        m.userData.dy = placed ? m.position.y - before[i].y : 0;
        m.userData.dz = placed ? m.position.z - before[i].z : 0;
        m.userData.placed = true;
      });
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
