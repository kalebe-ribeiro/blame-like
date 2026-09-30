// ─────────────────────────────────────────────────────────────────────────────
//  Os raros vivos da Cidade (fase 7).
//
//  MORADORES (7.1): as vilas habitadas (gen/villages.js — metade das vilas) têm
//    4 a 7 humanos. Existem quando o jogador está a menos de ~600 m; andam
//    devagar entre pontos livres do galpão, param, se viram para quem chega.
//    Longe, ficam onde estavam (ninguém é simulado).
//  ANDARILHOS (7.5): em ~1 de cada 5 territórios (setor × 480 m, como os
//    Safeguards) anda um transumano — um circuito próprio do grafo, posição pelo
//    relógio (ninguém é simulado longe). Ambíguos: metade troca; a outra metade,
//    se você carrega uma carga, arranca-a e foge.
//  VIDA DE SILÍCIO (7.6): parte dos "andarilhos" é vida de silício disfarçada.
//    De perto (6 m) se revela — o corpo muda —, caça, e o toque DRENA a célula;
//    depois foge. É a terceira força: um Safeguard que a vê caça ela, não você
//    (world/safeguards.js), e ela foge dele.
//
//  Posições GLOBAIS; o corpo é movido pelo Walker (world/entities.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hash4 } from '../gen/hash.js';
import { villageLayout, villageFrame, villageInhabited } from '../gen/villages.js';
import { territoryAt, patrolCircuit, circuitAt, circuitNearest, PATROL } from '../gen/patrols.js';

const KEEP = 600; // m: vilas mantidas em volta do jogador
const DROP = 800;
const WALK = 4.2;
const WANDER_P = 0.2; // territórios com um andarilho
const SILICON_P = 0.3; // dos andarilhos, os que são vida de silício
const THIEF_P = 0.5; // dos transumanos, os que roubam cargas
const WANDER_SPEED = 1.1;
const SALT = 7; // o circuito do andarilho (outro que o da ronda)

export class NpcSystem {
  constructor(world) {
    this.world = world;
    this.field = world.field;
    this.ents = world.entities;
    this.villages = new Map(); // id da vila → { u, layout, people: [entidades] }
    this.wanderers = new Map(); // território → entidade
    this.noWander = new Set();
    this.wqueue = [];
    this.clock = () => Date.now() / 1000;
    /** o jogador (app/people.js): { carrying(), steal(), drain(), walking() } */
    this.player = null;
    this.stats = { revealed: 0, drained: 0, stolen: 0, destroyed: 0 };
    this.scanT = 0;
    this.enabled = true;
    this.bus = null;
  }

  /** Todas as pessoas em cena (moradores e andarilhos). */
  *all() {
    for (const v of this.villages.values()) yield* v.people;
    yield* this.wanderers.values();
  }

  /** A vida de silício já revelada (os Safeguards a caçam). */
  *silicon() {
    for (const e of this.wanderers.values()) if (e.npc.revealed) yield e;
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
    // um circuito de andarilho por quadro
    const q = this.wqueue.shift();
    if (q) this._spawnWanderer(q);
    if ((this.scanT -= dt) > 0) return;
    this.scanT = 2;
    if (!this.enabled) return this.clear();
    this._scanWanderers(g);
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

  _scanWanderers(g) {
    const F = this.field;
    const ids = new Map();
    for (let dx = -600; dx <= 600; dx += 300) {
      for (let dz = -600; dz <= 600; dz += 300) {
        for (const dy of [-PATROL.slab, 0, PATROL.slab]) {
          const t = territoryAt(F, g.x + dx, g.y + dy, g.z + dz);
          if (!ids.has(t.id)) ids.set(t.id, t);
        }
      }
    }
    for (const [id, t] of ids) {
      if (this.wanderers.has(id) || this.noWander.has(id) || this.wqueue.some((w) => w.id === id)) continue;
      if (hash4(F.seed, t.sector.i, t.slab, t.sector.k, 1730) > WANDER_P) {
        this.noWander.add(id);
        continue;
      }
      this.wqueue.push(t);
    }
    for (const [id, e] of this.wanderers) {
      if (!ids.has(id) && e.feet.distanceTo(g) > DROP && e.npc.state === 'walk') {
        this.ents.remove(e.id);
        this.wanderers.delete(id);
      }
    }
    if (this.noWander.size > 3000) this.noWander.clear();
  }

  _spawnWanderer(t) {
    const F = this.field;
    const c = patrolCircuit(F, this.ents.nav, t, SALT);
    if (!c) {
      this.noWander.add(t.id);
      return;
    }
    const S = t.sector;
    const silicon = hash4(F.seed, S.i, t.slab, S.k, 1731) < SILICON_P;
    const thief = !silicon && hash4(F.seed, S.i, t.slab, S.k, 1732) < THIEF_P;
    const s0 = c.phase + this.clock() * WANDER_SPEED;
    const p = circuitAt(c, s0);
    const e = this.ents.spawn({ id: `wd:${t.id}`, kind: 'transhuman', feet: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, persist: false, brain: this });
    e.walker.speedScale = WANDER_SPEED / WALK;
    e.npc = { role: 'wanderer', silicon, thief, revealed: false, c, s: s0, state: 'walk', t: 0 };
    this.wanderers.set(t.id, e);
  }

  /** A vida de silício mostra o que é (de perto, ou quando alguém tenta falar com ela). */
  reveal(e) {
    const N = e.npc;
    if (!N.silicon || N.revealed) return;
    N.revealed = true;
    this.ents.replaceRig(e, 'silicon');
    N.state = 'hunt';
    N.t = 0;
    this.stats.revealed++;
    this.bus?.emit('silicon:reveal', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
  }

  /** Um Safeguard pegou a vida de silício: acabou. */
  destroy(e) {
    for (const [id, w] of this.wanderers) {
      if (w !== e) continue;
      this.stats.destroyed++;
      this.bus?.emit('silicon:destroyed', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
      this.ents.remove(e.id);
      this.wanderers.delete(id);
      this.noWander.add(id); // não volta nesta sessão
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
    if (N.role === 'wanderer') return this._wander(e, dt, g, origin, time);
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

  _wander(e, dt, g, origin, time) {
    const N = e.npc;
    const P = this.player;
    const feet = new THREE.Vector3(g.x, g.y - 1.7, g.z);
    const dp = Math.hypot(feet.x - e.feet.x, feet.z - e.feet.z);
    const level = Math.abs(feet.y - e.feet.y) < 2;
    const walking = !!P?.walking();
    // a vida de silício foge dos Safeguards que a caçam
    if (N.revealed && N.state !== 'flee') {
      for (const sg of this.world.safeguards?.all() ?? []) {
        if (sg.sg.prey === e && sg.feet.distanceTo(e.feet) < 50) {
          N.state = 'flee';
          N.t = 0;
          N.from = sg;
        }
      }
    }
    if (e.tier === 'far') {
      // longe: segue o circuito pelo relógio (e quem fugia volta a ele)
      if (N.state !== 'walk') {
        N.s = circuitNearest(N.c, e.feet.x, e.feet.y, e.feet.z).s;
        N.state = 'walk';
      }
      N.s += WANDER_SPEED * dt;
      const p = circuitAt(N.c, N.s);
      e.feet.set(p.x, p.y, p.z);
      e.yaw = p.yaw;
      e.speed = WANDER_SPEED;
      return;
    }
    N.t += dt;
    if (N.state === 'walk') {
      // disfarçada: de perto, se revela
      if (N.silicon && !N.revealed && dp < 6 && level && walking) return this.reveal(e);
      // o ladrão: você carrega uma carga e chegou perto — ele arranca e foge
      if (N.thief && dp < 2.2 && level && walking && P?.carrying()) {
        P.steal();
        this.stats.stolen++;
        this.bus?.emit('wanderer:steal', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
        N.state = 'flee';
        N.t = 0;
        N.from = null;
        return;
      }
      if (dp < 4.5 && level && walking && !N.revealed) {
        // parado, olhando para quem chegou
        const want = Math.atan2(-(feet.x - e.feet.x), -(feet.z - e.feet.z));
        let d = want - e.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        e.yaw += d * Math.min(1, dt * 3);
        this.ents.walkToward(e, e.feet, dt, origin, time);
        return;
      }
      e.walker.speedScale = WANDER_SPEED / WALK;
      N.s += WANDER_SPEED * dt;
      const hd = this.ents.walkToward(e, circuitAt(N.c, N.s + 2.5), dt, origin, time);
      if (hd > 5) N.s -= WANDER_SPEED * dt; // o relógio espera o corpo
      return;
    }
    if (N.state === 'hunt') {
      // revelada: vem direto; o toque drena a célula
      e.walker.speedScale = 1.2;
      this.ents.walkToward(e, feet, dt, origin, time);
      if (dp < 1.0 && level && walking) {
        P?.drain();
        this.stats.drained++;
        this.bus?.emit('silicon:drain', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
        N.state = 'flee';
        N.t = 0;
        N.from = null;
      } else if (N.t > 25 || dp > 60) {
        N.state = 'return';
        N.t = 0;
      }
      return;
    }
    if (N.state === 'flee') {
      // para longe de quem ameaça (o Safeguard) ou de você
      const from = N.from?.feet ?? feet;
      const away = new THREE.Vector3(e.feet.x - from.x, 0, e.feet.z - from.z);
      if (away.lengthSq() < 1e-4) away.set(1, 0, 0);
      away.normalize().multiplyScalar(10).add(e.feet);
      e.walker.speedScale = 1.5;
      this.ents.walkToward(e, away, dt, origin, time);
      if (N.t > 20) {
        N.state = 'return';
        N.t = 0;
      }
      return;
    }
    if (N.state === 'return') {
      const n = circuitNearest(N.c, e.feet.x, e.feet.y, e.feet.z);
      e.walker.speedScale = WANDER_SPEED / WALK;
      this.ents.walkToward(e, circuitAt(N.c, n.s + 2), dt, origin, time);
      if (n.d < 2 || N.t > 40) {
        N.s = n.s;
        N.state = 'walk';
        N.t = 0;
      }
    }
  }

  /** A pessoa com quem dá para falar: a menos de 2,6 m, à frente da câmera. */
  talkable(g, fwd) {
    let best = null;
    for (const e of this.all()) {
      if (e.npc?.revealed || (e.npc?.role === 'wanderer' && e.npc.state !== 'walk')) continue;
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
    for (const e of this.wanderers.values()) this.ents.remove(e.id);
    this.wanderers.clear();
    this.wqueue.length = 0;
  }

  rebase() {}

  dispose() {
    this.clear();
  }
}
