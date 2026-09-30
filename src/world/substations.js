// ─────────────────────────────────────────────────────────────────────────────
//  Subestações e setores religados (fase 4 — ver o cofre, Religar-setores).
//
//  Um setor permanentemente apagado tem subestações (gen/sites.js →
//  substationFor): armários de manobra com uma alavanca, nas plataformas das
//  estações do próprio setor. Religar (app/power.js) põe o setor em
//  Field.restored e a luz volta como uma FRENTE que sai da subestação
//  (40 m/s): lâmpadas (Field.sectorLight → LightRig), janelas e linhas
//  técnicas (sectorPower no shader, uRestoredId/uRestoredFront), trens,
//  elevadores, terminais e tomadas — tudo o que já pergunta pelo setor.
//
//  O que o jogador religou fica no mundo salvo (WorldState: 'sector:<id>').
//  Só as subestações perto existem na cena.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { substationsNear } from '../gen/sites.js';

const RANGE = 110; // m: armários existem só perto
const MAX_RESTORED = 8; // setores religados que os shaders conhecem por vez (os mais perto)

export class SubstationSystem {
  constructor(parent, materials, shared) {
    this.parent = parent;
    this.materials = materials;
    this.shared = shared;
    this.field = null;
    this.bus = null;
    this.items = new Map(); // id → { site, group, lever, lamp, anim }
    this.meshes = [];
    this.lights = [];
    this._scan = 0;
    this._cabinet = new THREE.BoxGeometry(1.1, 2.1, 0.6);
    this._cabinet.translate(0, 1.05, 0);
    this._leverGeo = new THREE.BoxGeometry(0.08, 0.5, 0.08);
    this._leverGeo.translate(0, 0.25, 0); // gira pela base
  }

  /** Lê do mundo salvo os setores que o jogador já religou (luz plena, sem frente). */
  load(worldState) {
    this.field.restored.clear();
    for (const [key, v] of Object.entries(worldState?.slot?.changes ?? {})) {
      if (!key.startsWith('sector:') || !v) continue;
      this.field.restored.set(key.slice(7), { x: v.x, y: v.y, z: v.z, t0: -1e9 });
    }
  }

  /** O setor desta subestação já tem energia? */
  isLive(site) {
    return this.field.restored.has(site.sector);
  }

  /** Religa o setor desta subestação agora: a frente sai daqui. */
  restore(site, time, worldState) {
    if (this.isLive(site)) return false;
    const it = this.items.get(site.id);
    if (it) it.anim = 0;
    return this.restoreSector(site.sector, site.x, site.y + 1, site.z, time, worldState, site.id);
  }

  /** Religa um setor com a luz saindo de (x,y,z) — a subestação, ou a usina (app/uniques.js). */
  restoreSector(sector, x, y, z, time, worldState, id = `sector:${sector}`) {
    if (this.field.restored.has(sector)) return false;
    this.field.restored.set(sector, { x, y, z, t0: time });
    worldState?.set(`sector:${sector}`, { x: Math.round(x), y: Math.round(y), z: Math.round(z), at: Date.now() });
    this.bus?.emit('sector:restore', { id, sector, x, y, z });
    return true;
  }

  /** A subestação mais perto de g (GLOBAL), até R metros — ou null. */
  nearest(g, R = 2.3) {
    let best = null;
    let bd = R;
    for (const it of this.items.values()) {
      const s = it.site;
      const d = Math.hypot(s.x - g.x, s.y + 1.2 - g.y, s.z - g.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  _create(site) {
    const m = this.materials;
    const group = new THREE.Group();
    const body = new THREE.Mesh(this._cabinet, m.machine);
    body.userData.mat = 'machine';
    // porta com dobradiças e grade de ventilação (desenho seco, de manutenção)
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.03), m.machine);
    door.position.set(0, 1.1, 0.31);
    const vent = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.18, 0.02), m.grate ?? m.machine);
    vent.position.set(0, 1.75, 0.33);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.7), m.machine);
    hood.position.set(0, 2.14, 0);
    // a alavanca, na lateral da frente: embaixo = desligado, em cima = ligado
    const pivot = new THREE.Group();
    pivot.position.set(0.62, 1.05, 0.2);
    const lever = new THREE.Mesh(this._leverGeo, m.duct ?? m.machine);
    const knob = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.12), m.machine);
    knob.position.y = 0.52;
    lever.add(knob);
    pivot.add(lever);
    pivot.rotation.z = -2.2; // abaixada
    // a lâmpada de estado: apagada (sem energia) ou âmbar firme (religado)
    const lampMat = new THREE.MeshBasicMaterial({ color: 0x100c08 });
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.06, 0.04), lampMat);
    lamp.position.set(-0.3, 1.9, 0.32);
    // cabos saindo por cima, até a laje do abrigo
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), m.cable ?? m.machine);
    cable.position.set(0.3, 3.3, -0.1);
    group.add(body, door, vent, hood, pivot, lamp, cable);
    group.rotation.y = site.yaw;
    this.parent.add(group);
    const live = this.isLive(site);
    return { site, group, body, pivot, lamp, lampMat, anim: live ? 1 : -1, geos: [door.geometry, vent.geometry, hood.geometry, knob.geometry, lamp.geometry, cable.geometry] };
  }

  update(time, dt, g, origin) {
    if (!this.field) return;
    this._scan -= dt;
    if (this._scan <= 0) {
      this._scan = 1;
      const want = new Map(substationsNear(this.field, g.x, g.y, g.z, RANGE).map((s) => [s.id, s]));
      for (const [id, it] of this.items) {
        if (want.has(id)) continue;
        it.group.removeFromParent();
        for (const geo of it.geos) geo.dispose();
        it.lampMat.dispose();
        this.items.delete(id);
      }
      for (const [id, s] of want) if (!this.items.has(id)) this.items.set(id, this._create(s));
    }
    this.meshes.length = 0;
    this.lights.length = 0;
    for (const it of this.items.values()) {
      const s = it.site;
      it.group.position.set(s.x - origin.x, s.y - origin.y, s.z - origin.z);
      const live = this.isLive(s);
      // alavanca: sobe devagar e trava (0,6 s); a lâmpada acende quando trava
      if (live && it.anim < 1) it.anim = Math.min(1, Math.max(0, it.anim) + dt / 0.6);
      const e = live ? 1 - Math.pow(1 - Math.max(0, it.anim), 3) : 0;
      it.pivot.rotation.z = -2.2 + e * 1.9;
      it.lampMat.color.setHex(live && it.anim >= 1 ? 0xd9a25a : 0x100c08);
      it.group.updateMatrixWorld(true);
      this.meshes.push(it.body);
      if (live && it.anim >= 1) this.lights.push({ x: s.x, y: s.y + 1.9, z: s.z, color: [1, 0.66, 0.3], intensity: 3, mode: 'steady', phase: 0, grid: false });
    }
    this._uniforms(g, origin, time);
  }

  /** Os setores religados mais perto vão para os shaders (janelas e linhas técnicas). */
  _uniforms(g, origin, time) {
    const ids = this.shared.uRestoredId.value;
    const fronts = this.shared.uRestoredFront.value;
    const list = [...this.field.restored.entries()]
      .map(([id, r]) => ({ id, r, d: Math.hypot(r.x - g.x, r.y - g.y, r.z - g.z) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, MAX_RESTORED);
    for (let i = 0; i < MAX_RESTORED; i++) {
      const e = list[i];
      if (!e) {
        ids[i].set(0, 0, 0, 0);
        continue;
      }
      const [band, si, sk] = e.id.slice(1).split(',').map(Number);
      ids[i].set(si, band, sk, 1);
      fronts[i].set(e.r.x - origin.x, e.r.z - origin.z, Math.min(1e7, (time - e.r.t0) * 40), e.r.y - origin.y);
    }
  }

  dispose() {
    for (const it of this.items.values()) {
      it.group.removeFromParent();
      for (const geo of it.geos) geo.dispose();
      it.lampMat.dispose();
    }
    this.items.clear();
    this._cabinet.dispose();
    this._leverGeo.dispose();
  }
}
