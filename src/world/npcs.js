// ─────────────────────────────────────────────────────────────────────────────
//  Os raros vivos da Cidade (fase 7).
//
//  MORADORES (7.1): as vilas habitadas (gen/villages.js — metade das vilas) têm
//    4 a 7 humanos. Existem quando o jogador está a menos de ~600 m; andam
//    devagar entre pontos livres do galpão, param, se viram para quem chega.
//    Longe, ficam onde estavam (ninguém é simulado).
//  (Os andarilhos transumanos e a vida de silício entram aqui — 7.5 e 7.6.)
//
//  Posições GLOBAIS; o corpo é movido pelo Walker (world/entities.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hash4 } from '../gen/hash.js';
import { villageLayout, villageFrame, villageInhabited } from '../gen/villages.js';

const KEEP = 600; // m: vilas mantidas em volta do jogador
const DROP = 800;
const WALK = 4.2;

export class NpcSystem {
  constructor(world) {
    this.world = world;
    this.field = world.field;
    this.ents = world.entities;
    this.villages = new Map(); // id da vila → { u, layout, people: [entidades] }
    this.scanT = 0;
    this.enabled = true;
    this.bus = null;
  }

  /** Todas as pessoas em cena. */
  *all() {
    for (const v of this.villages.values()) yield* v.people;
  }

  /** As vilas habitadas perto de (x,y,z) (GLOBAL), da mais perto à mais longe. */
  inhabitedNear(x, y, z, R) {
    return this.field
      .uniquesNear(x, y, z, R)
      .filter((u) => u.kind === 'village' && villageInhabited(this.field, u))
      .map((u) => ({ u, d: Math.hypot(u.x - x, u.y - y, u.z - z) }))
      .sort((a, b) => a.d - b.d);
  }

  update(time, dt, g) {
    if ((this.scanT -= dt) > 0) return;
    this.scanT = 2;
    if (!this.enabled) return this.clear();
    for (const { u } of this.inhabitedNear(g.x, g.y, g.z, KEEP)) {
      if (!this.villages.has(u.id)) this._populate(u);
    }
    for (const [id, v] of this.villages) {
      if (Math.hypot(v.u.x - g.x, v.u.y - g.y, v.u.z - g.z) > DROP) {
        for (const e of v.people) this.ents.remove(e.id);
        this.villages.delete(id);
      }
    }
  }

  _populate(u) {
    const F = this.field;
    const L = villageLayout(F, u);
    const { P } = villageFrame(u);
    const n = 4 + Math.floor(hash4(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1703) * 4);
    const people = [];
    const used = new Set();
    for (let k = 0; k < n && L.spots.length; k++) {
      let i = Math.floor(hash4(F.seed, Math.round(u.x), k, Math.round(u.z), 1704) * L.spots.length);
      while (used.has(i) && used.size < L.spots.length) i = (i + 1) % L.spots.length;
      used.add(i);
      const sp = L.spots[i];
      const [x, z] = P(sp.a, sp.c);
      const e = this.ents.spawn({ id: `vl:${u.id}:${k}`, kind: 'human', feet: new THREE.Vector3(x, L.y0, z), yaw: hash4(F.seed, k, u.n, 3, 1705) * Math.PI * 2, persist: false, brain: this });
      e.walker.speedScale = 1.2 / WALK;
      e.npc = { role: 'villager', village: u, layout: L, P, target: null, wait: 1 + hash4(F.seed, k, u.n, 5, 1706) * 6, face: null };
      people.push(e);
    }
    this.villages.set(u.id, { u, layout: L, people });
  }

  // ── o cérebro (world/entities.js chama think a cada quadro) ──

  think(e, dt, g, origin, time) {
    const N = e.npc;
    if (!N) return;
    e.speed = 0;
    if (e.tier !== 'near') return; // longe: fica onde está
    // alguém chegou perto: para e olha para ele
    const dp = Math.hypot(g.x - e.feet.x, g.z - e.feet.z);
    if (dp < 4.5 && Math.abs(g.y - 1.7 - e.feet.y) < 2) {
      N.target = null;
      const want = Math.atan2(-(g.x - e.feet.x), -(g.z - e.feet.z));
      let d = want - e.yaw;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      e.yaw += d * Math.min(1, dt * 3);
      this.ents.walkToward(e, e.feet, dt, origin, time); // parado, mas com os pés no chão
      return;
    }
    if (!N.target) {
      if ((N.wait -= dt) > 0) {
        this.ents.walkToward(e, e.feet, dt, origin, time);
        return;
      }
      const L = N.layout;
      const sp = L.spots[Math.floor(Math.random() * L.spots.length)];
      const [x, z] = N.P(sp.a, sp.c);
      N.target = new THREE.Vector3(x, L.y0, z);
      N.walkT = 0;
    }
    const hd = this.ents.walkToward(e, N.target, dt, origin, time);
    N.walkT += dt;
    if (hd < 0.6 || N.walkT > 25) {
      N.target = null;
      N.wait = 3 + Math.random() * 10;
    }
  }

  /** A pessoa com quem dá para falar: a menos de 2,6 m, à frente da câmera. */
  talkable(g, fwd) {
    let best = null;
    for (const e of this.all()) {
      const dx = e.feet.x - g.x;
      const dz = e.feet.z - g.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.6 || Math.abs(e.feet.y + 1.2 - g.y) > 1.8) continue;
      if ((dx * fwd.x + dz * fwd.z) / (d || 1) < 0.5) continue;
      if (!best || d < best.d) best = { e, d };
    }
    return best?.e ?? null;
  }

  clear() {
    for (const v of this.villages.values()) for (const e of v.people) this.ents.remove(e.id);
    this.villages.clear();
  }

  rebase() {}

  dispose() {
    this.clear();
  }
}
