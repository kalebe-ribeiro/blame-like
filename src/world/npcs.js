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
//  FERIDOS E A VILA HOSTIL (o cofre, Dano-do-emissor §4): o andarilho ferido pelo emissor
//    foge; a vida de silício tem nível (world/levels.js — baixa/média/alta: a resistência e o
//    arranque); ferir ou matar um morador deixa a VILA HOSTIL (this.hostile(id) — app/people.js
//    guarda no mundo salvo): os moradores dela vêm (o arranque dos humanos, M4) e golpeiam
//    como os Safeguards — o golpe com arremesso, −25% (this.onStrike).
//
//  Posições GLOBAIS; o corpo é movido pelo Walker (world/entities.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { hash4 } from '../gen/hash.js';
import { villageLayout, villageFrame, villageInhabited } from '../gen/villages.js';
import { territoryAt, patrolCircuit, circuitAt, circuitNearest, PATROL, WANDER, wandererOf } from '../gen/patrols.js';
import { levelAt, MOVE, accelerate } from './levels.js';
import { STRIKE } from './safeguards.js';
import { villageCarrier } from '../gen/gene.js';

const KEEP = 600; // m: vilas mantidas em volta do jogador
const DROP = 800;
const WALK = 4.2;
const WANDER_SPEED = WANDER.speed;
const SALT = WANDER.salt; // o circuito do andarilho (outro que o da ronda)
// (quem é andarilho, vida de silício ou ladrão: gen/patrols.js — wandererOf)

export class NpcSystem {
  constructor(world) {
    this.world = world;
    this.field = world.field;
    this.ents = world.entities;
    this.villages = new Map(); // id da vila → { u, layout, people: [entidades] }
    this.wanderers = new Map(); // território → entidade
    this.noWander = new Set();
    this.wqueue = [];
    this.wpending = new Set(); // circuitos sendo calculados (num worker)
    this.clock = () => Date.now() / 1000;
    /** o jogador (app/people.js): { carrying(), steal(), drain(), walking() } */
    this.player = null;
    this.stats = { revealed: 0, drained: 0, stolen: 0, destroyed: 0 };
    this.scanT = 0;
    this.enabled = true;
    this.bus = null;
    /** @type {(id: string) => boolean} a vila está hostil? (app/people.js — o mundo salvo) */
    this.hostile = (_id) => false;
    /** (e, hit) — o golpe de um morador hostil chegou (app/people.js) */
    this.onStrike = null;
    /** @type {(territoryId: string) => string|null} o gene levado de um depósito esquecido, se este andarilho o carrega (app/gene.js) */
    this.geneItemFor = (_id) => null;
  }

  /** Todas as pessoas em cena (moradores e andarilhos). */
  *all() {
    for (const v of this.villages.values()) yield* v.people;
    yield* this.wanderers.values();
  }

  /** A vida de silício já revelada (os Safeguards a caçam). */
  *silicon() {
    for (const e of this.wanderers.values()) if (e.npc.revealed && !e.dead) yield e;
  }

  /** As vilas habitadas perto de (x,y,z) (GLOBAL), da mais perto à mais longe. */
  inhabitedNear(x, y, z, R) {
    return this.field
      .uniquesNear(x, y, z, R)
      .filter((u) => u.kind === 'village' && villageInhabited(this.field, u) && !this.hostile(u.id))
      .map((u) => ({ u, d: Math.hypot(u.x - x, u.y - y, u.z - z) }))
      .sort((a, b) => a.d - b.d);
  }

  update(time, dt, g) {
    // um circuito de andarilho por quadro — calculado num worker
    const q = this.wqueue.shift();
    if (q) {
      this.wpending.add(q.id);
      this.world.circuitAsync(q, SALT, (c) => {
        this.wpending.delete(q.id);
        if (this.enabled && !this.wanderers.has(q.id)) this._spawnWanderer(q, c);
      });
    }
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

  /** Um corte do emissor: os andarilhos de circuito cortado saem (o próximo varrer refaz o circuito). */
  onCut() {
    for (const [id, e] of this.wanderers) {
      if (e.npc.state !== 'walk' || !this.field.cutOnPath(e.npc.c.pts)) continue;
      this.ents.remove(e.id);
      this.wanderers.delete(id);
    }
    this.scanT = 0;
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
      if (this.wanderers.has(id) || this.noWander.has(id) || this.wpending.has(id) || this.wqueue.some((w) => w.id === id)) continue;
      if (!wandererOf(F, t)) {
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

  _spawnWanderer(t, c = patrolCircuit(this.field, this.ents.nav, t, SALT)) {
    const F = this.field;
    if (!c) {
      this.noWander.add(t.id);
      return;
    }
    const { silicon, thief } = wandererOf(F, t);
    const s0 = c.phase + this.clock() * WANDER_SPEED;
    const p = circuitAt(c, s0);
    const e = this.ents.spawn({ id: `wd:${t.id}`, kind: 'transhuman', feet: new THREE.Vector3(p.x, p.y, p.z), yaw: p.yaw, persist: false, brain: this });
    e.walker.speedScale = WANDER_SPEED / WALK;
    e.npc = { role: 'wanderer', silicon, thief, revealed: false, c, s: s0, state: 'walk', t: 0 };
    // o gene de terminal (gen/gene.js): levando o do depósito esquecido (um objeto); o portador é um morador
    e.npc.carrier = false;
    e.npc.geneItem = silicon ? null : this.geneItemFor(t.id);
    if (silicon) e.level = levelAt(F, c.pts[0].x, c.pts[0].y, c.pts[0].z, 2);
    this.wanderers.set(t.id, e);
  }

  /** A vida de silício mostra o que é (de perto, ou quando alguém tenta falar com ela). */
  reveal(e) {
    const N = e.npc;
    if (!N.silicon || N.revealed) return;
    N.revealed = true;
    N.hunt = {}; // (o arranque começa de baixo)
    this.ents.replaceRig(e, 'silicon');
    N.state = 'hunt';
    N.t = 0;
    this.stats.revealed++;
    this.bus?.emit('silicon:reveal', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
  }

  /** Um Safeguard pegou a vida de silício: acabou (o corpo fica onde caiu). */
  destroy(e) {
    if (e.dead) return;
    this.stats.destroyed++;
    this.bus?.emit('silicon:destroyed', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
    this.ents.kill(e, 'safeguard');
  }

  _populate(u) {
    const F = this.field;
    const L = villageLayout(F, u);
    const { P } = villageFrame(u);
    const n = 4 + Math.floor(hash4(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1703) * 4);
    const people = [];
    const used = new Set();
    const carrier = villageCarrier(F, u); // (o morador k que carrega o gene — gen/gene.js)
    for (let k = 0; k < n && L.spots.length; k++) {
      let i = Math.floor(hash4(F.seed, Math.round(u.x), k, Math.round(u.z), 1704) * L.spots.length);
      while (used.has(i) && used.size < L.spots.length) i = (i + 1) % L.spots.length;
      used.add(i);
      const sp = L.spots[i];
      const [x, z] = P(sp.a, sp.c);
      const e = this.ents.spawn({ id: `vl:${u.id}:${k}`, kind: 'human', feet: new THREE.Vector3(x, L.y0, z), yaw: hash4(F.seed, k, u.n, 3, 1705) * Math.PI * 2, persist: false, brain: this });
      e.walker.speedScale = 1.2 / WALK;
      e.npc = { role: 'villager', village: u, layout: L, P, target: null, wait: 1 + hash4(F.seed, k, u.n, 5, 1706) * 6, face: null, carrier: k === carrier };
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
    if (this.hostile(N.village.id)) return this._hostile(e, dt, g, origin, time);
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

  /** Um morador de uma vila hostil: vem com o arranque dos humanos (M4) e golpeia (−25%). */
  _hostile(e, dt, g, origin, time) {
    const N = e.npc;
    const feet = new THREE.Vector3(g.x, g.y - 1.7, g.z);
    const P = this.player;
    N.hunt ??= {};
    if (N.strikeT !== undefined) {
      // o golpe: os mesmos tempos do Safeguard (world/safeguards.js STRIKE)
      N.strikeT += dt;
      const t = N.strikeT;
      e.speed = 0;
      e.walker.vel.x = 0;
      e.walker.vel.z = 0;
      const want = Math.atan2(-(feet.x - e.feet.x), -(feet.z - e.feet.z));
      if (t < STRIKE.windup) e.yaw += Math.atan2(Math.sin(want - e.yaw), Math.cos(want - e.yaw)) * 0.35;
      const w = Math.min(1, t / STRIKE.windup);
      const sw = Math.max(0, Math.min(1, (t - STRIKE.windup) / STRIKE.swing));
      const back = Math.max(0, Math.min(1, (t - STRIKE.windup - STRIKE.swing) / STRIKE.recover));
      e.strikePose = { w: w * (1 - back), s: sw * (1 - back) };
      if (!N.struck && t >= STRIKE.windup + STRIKE.swing * 0.6) {
        N.struck = true;
        const hit = Math.hypot(feet.x - e.feet.x, feet.z - e.feet.z) < STRIKE.hit && Math.abs(feet.y - e.feet.y) < 2;
        this.onStrike?.(e, hit);
      }
      if (t >= STRIKE.windup + STRIKE.swing + STRIKE.recover) {
        e.strikePose = null;
        N.strikeT = undefined;
        N.waitT = STRIKE.waitMin + Math.random() * (STRIKE.waitMax - STRIKE.waitMin);
        N.hunt.huntV = undefined;
      }
      return;
    }
    const dp = Math.hypot(feet.x - e.feet.x, feet.z - e.feet.z);
    const level = Math.abs(feet.y - e.feet.y) < 2;
    // longe demais, ou você não está andando (desmaiado, voando): voltam para o galpão
    if (dp > 80 || !P?.walking()) {
      N.hunt.huntV = undefined;
      return this.ents.walkToward(e, e.feet, dt, origin, time);
    }
    if ((N.waitT ?? 0) > 0) {
      N.waitT -= dt;
      this.ents.walkToward(e, e.feet, dt, origin, time);
      return;
    }
    accelerate(e, N.hunt, MOVE.villager, dt);
    this.ents.walkToward(e, feet, dt, origin, time);
    if (dp < STRIKE.reach && level) {
      N.strikeT = 0;
      N.struck = false;
      this.bus?.emit('villager:strike', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
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
    // ferido pelo emissor: o andarilho foge de você (a vida de silício disfarçada se mostra)
    if (e.staggerT > 0 && N.state !== 'flee') {
      if (N.silicon && !N.revealed) return this.reveal(e);
      if (!N.silicon) {
        N.state = 'flee';
        N.t = 0;
        N.from = null;
      }
    }
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
      // revelada: vem direto, com o arranque do nível dela (M4); o toque drena a célula
      accelerate(e, (N.hunt ??= {}), MOVE[e.level ?? 'low'], dt);
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
      if (e.dead || e.npc?.revealed || (e.npc?.role === 'wanderer' && e.npc.state !== 'walk')) continue;
      if (e.npc?.role === 'villager' && this.hostile(e.npc.village.id)) continue; // a vila hostil não conversa
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
