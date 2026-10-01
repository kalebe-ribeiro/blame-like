// ─────────────────────────────────────────────────────────────────────────────
//  Camada de entidades (fase 5): os seres como um sistema do mundo, igual aos
//  outros (update / rebase / dispose). Hoje só há o corpo de teste; Safeguards
//  (fase 6) e NPCs (fase 7) entram aqui com o seu comportamento.
//
//  Dois níveis de simulação:
//    PERTO (< NEAR m do jogador, e o chão em volta dele já carregado): o corpo
//      é movido pelo MESMO Walker do jogador (controls/walker.js), com a sua
//      própria CollisionWorld — gravidade, degraus, paredes. Nada atravessa nada.
//    LONGE: abstrato e lento — o corpo avança ao longo da polilinha do caminho
//      (pontos no piso, gen/nav.js), sem física. Quando o jogador chega perto,
//      a física retoma daquele ponto.
//
//  Um corpo anda por um CAMINHO do grafo de navegação (gen/nav.js) e só desvia
//  localmente: não pisa onde não há chão (beirada), contorna o que bloqueia à
//  frente e, se empacar, pede outro caminho sem a aresta onde empacou.
//
//  Posições sempre GLOBAIS (e.feet); a cena é recalculada a cada quadro com a
//  origem flutuante, então rebase não precisa mexer em nada.
//  Estado salvo no mundo: serialize() / load() (slot.entities — app/beings.js).
//
//  DANO E MORTE: cada corpo tem e.hp (1 = inteiro). damage(e, quanto, causa) e
//  kill(e, causa) — hoje a causa é a queda (mais de 5 m machuca; mais de 12 m
//  mata); a arma de Killy (ver o cofre) vai usar o mesmo. Morto, o corpo fica
//  deitado onde caiu (sem cérebro, sem colisão) e sai de cena quando o jogador
//  se afasta. Evento: being:die { id, kind, cause, x, y, z }.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Walker } from '../controls/walker.js';
import { CollisionWorld } from './collision.js';
import { NavGraph } from '../gen/nav.js';
import { buildTestBody, buildSafeguardBody, buildHumanBody, buildTranshumanBody, buildSiliconBody } from './bodies.js';

const NEAR = 110; // m: física completa
const FAR = 130; // m: volta ao abstrato (histerese)
const VISIBLE = 420; // m: além disso o corpo nem é desenhado (a névoa já o apagou)
const FAR_SPEED = 1.3; // m/s ao longe (abstrato e lento)
const ARRIVE = 0.9; // m (horizontal) para dar um ponto do caminho por alcançado
const STUCK_AFTER = 3; // s sem se aproximar do próximo ponto
const FALL_HURT = 5; // m: uma queda maior que isso machuca
const FALL_KILL = 12; // m: e maior que isso mata
const CORPSE_FAR = 400; // m: longe assim, o corpo morto sai de cena
const MAX_REPLANS = 4;
const DOWN = new THREE.Vector3(0, -1, 0);

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();

export class EntitySystem {
  constructor(group, materials, world) {
    this.group = group;
    this.materials = materials;
    this.world = world;
    this.nav = new NavGraph(world.field);
    /** id → entidade */
    this.list = new Map();
    this.bus = null;
  }

  /**
   * Cria um corpo em `feet` (GLOBAL). def: { id, kind: 'test'|'safeguard', feet, persist, brain }
   * persist = false: não entra no salvamento (corpos de teste; Safeguards, que são da lei do mundo).
   * brain: quem decide para onde o corpo vai (world/safeguards.js); sem brain, o corpo segue e.path.
   */
  spawn(def) {
    const rig = this._rig(def.kind);
    this.group.add(rig.group);
    const walker = new Walker(new CollisionWorld(this.world));
    walker.canClimb = false;
    walker.canGrab = false; // (os seres andam pelo grafo; agarrar quinas é do jogador)
    walker.bobScale = 0;
    walker.dipScale = 0;
    walker.speedScale = 0.55; // ~2,3 m/s: um passo firme, não uma corrida
    if (def.kind === 'safeguard') walker.eye = 2.1;
    if (def.kind === 'human') walker.eye = 1.5;
    const e = {
      id: def.id,
      kind: def.kind ?? 'test',
      persist: def.persist !== false,
      feet: new THREE.Vector3(def.feet.x, def.feet.y, def.feet.z),
      yaw: def.yaw ?? 0,
      rig,
      walker,
      proxy: new THREE.Object3D(), // a "câmera" do Walker (a cabeça)
      tier: 'far',
      path: null, // { pts, legs, length }
      pi: 0, // próximo ponto do caminho
      goal: def.goal ?? null, // ponto GLOBAL do destino
      state: 'idle', // idle · walk · arrived · stuck · lost
      best: Infinity,
      stuckT: 0,
      replans: 0,
      avoid: new Set(),
      detour: 0, // s de desvio lateral em curso
      detourSide: 1,
      speed: 0,
      stats: { fell: 0, wall: 0, replans: 0, far: 0, near: 0 },
      brain: def.brain ?? null,
      hp: 1,
      dead: false,
    };
    // uma queda de verdade (mais que um degrau) conta — o teste reprova com ela; e machuca
    walker.onLand = (_v, height) => {
      if (height > 4) e.stats.fell++;
      if (height > FALL_KILL) this.kill(e, 'fall');
      else if (height > FALL_HURT) this.damage(e, (height - FALL_HURT) / (FALL_KILL - FALL_HURT), 'fall');
    };
    this.list.set(e.id, e);
    if (e.goal) this.goTo(e, e.goal);
    return e;
  }

  /** Machuca um corpo (quanto: 0..1 da vida). Sem vida, ele morre. */
  damage(e, amount, cause = 'unknown') {
    if (e.dead) return;
    e.hp -= amount;
    this.bus?.emit('being:hurt', { id: e.id, kind: e.kind, cause, hp: e.hp });
    if (e.hp <= 0) this.kill(e, cause);
  }

  /** Mata um corpo: ele fica deitado onde está; ninguém mais o move. */
  kill(e, cause = 'unknown') {
    if (e.dead) return;
    e.dead = true;
    e.hp = 0;
    e.cause = cause;
    e.speed = 0;
    e.state = 'dead';
    this.bus?.emit('being:die', { id: e.id, kind: e.kind, cause, x: e.feet.x, y: e.feet.y, z: e.feet.z });
  }

  /** O corpo de cada tipo de ser. */
  _rig(kind) {
    const M = this.materials;
    const dark = (this._void ??= new THREE.MeshBasicMaterial({ color: 0x030303 })); // o escuro sem luz (dentro do capuz)
    if (kind === 'safeguard') return buildSafeguardBody(M.pale, M.door);
    if (kind === 'human') return buildHumanBody(M.cloth, M.cloth, dark);
    if (kind === 'transhuman') return buildTranshumanBody(M.cloth, M.machine, dark);
    if (kind === 'silicon') return buildSiliconBody(M.monolith);
    return buildTestBody(M.machine);
  }

  /** Troca o corpo (a vida de silício se revelando). */
  replaceRig(e, kind) {
    this.group.remove(e.rig.group);
    e.rig.dispose();
    e.rig = this._rig(kind);
    this.group.add(e.rig.group);
    e.kind = kind;
    if (kind === 'silicon') e.walker.eye = 1.9;
  }

  remove(id) {
    const e = this.list.get(id);
    if (!e) return;
    this.group.remove(e.rig.group);
    e.rig.dispose();
    this.list.delete(id);
  }

  /** Manda o corpo ir até um ponto GLOBAL (o vértice do grafo mais perto dele). */
  goTo(e, goal) {
    e.goal = { x: goal.x, y: goal.y, z: goal.z };
    return this._plan(e);
  }

  _plan(e) {
    const nav = this.nav;
    // no meio de uma ponte não há vértice: volta para o de onde a perna atual saiu
    const leg = e.path?.legs?.[e.path.ptLeg?.[e.pi] ?? -1];
    let from = nav.vertexAt(e.feet.x, e.feet.y, e.feet.z) ?? leg?.from ?? null;
    // no meio de uma ponte, sem caminho anterior (um Safeguard de ronda): a plataforma mais perto
    if (!from) {
      const n = this.world.field.nearestNode(e.feet.x, e.feet.y, e.feet.z, { below: 1, above: 1, reach: 1 });
      if (n && this.world.field.nodeLinked(n) && Math.hypot(n.x - e.feet.x, n.z - e.feet.z) < 80) from = nav.nodeVertex(n);
    }
    const to = nav.vertexAt(e.goal.x, e.goal.y, e.goal.z);
    if (!from || !to) {
      e.state = 'lost';
      return false;
    }
    const path = from.id === to.id ? { pts: [{ ...e.feet }, { x: to.x, y: to.y, z: to.z }], legs: [], length: 0 } : nav.findPath(from, to, { avoid: e.avoid });
    if (!path) {
      e.state = 'lost';
      return false;
    }
    // o primeiro ponto é o do vértice: começa de onde o corpo está
    path.pts[0] = { x: e.feet.x, y: e.feet.y, z: e.feet.z };
    e.path = path;
    e.pi = 1;
    e.best = Infinity;
    e.stuckT = 0;
    e.state = 'walk';
    return true;
  }

  update(time, dt, g, origin) {
    for (const e of [...this.list.values()]) {
      const dist = e.feet.distanceTo(g);
      if (e.dead) {
        // o corpo morto: deitado de costas no chão onde caiu; longe, sai de cena
        if (dist > CORPSE_FAR) {
          this.remove(e.id);
          continue;
        }
        const r = e.rig.group;
        r.visible = dist < VISIBLE;
        r.position.set(e.feet.x - origin.x, e.feet.y - origin.y + 0.16, e.feet.z - origin.z);
        r.rotation.set(-Math.PI / 2, e.yaw + Math.PI, 0, 'YXZ');
        continue;
      }
      if (e.tier === 'far' && dist < NEAR && this.world.chunkLayer.isReadyAround(e.feet, 30)) this._toNear(e, origin);
      else if (e.tier === 'near' && dist > FAR) e.tier = 'far';

      if (e.brain) e.brain.think(e, dt, g, origin, time);
      else if (e.tier === 'near') this._stepNear(e, dt, origin, time);
      else this._stepFar(e, dt);

      // o corpo na cena
      const vis = dist < VISIBLE;
      e.rig.group.visible = vis;
      if (vis) {
        e.rig.group.position.set(e.feet.x - origin.x, e.feet.y - origin.y, e.feet.z - origin.z);
        // o Walker olha para (−sen yaw, −cos yaw); o corpo foi montado olhando para +z
        e.rig.group.rotation.y = e.yaw + Math.PI;
        e.rig.animate(dt, e.speed, e.tier === 'far' || e.walker.grounded);
      }
    }
  }

  /** Passa para a física: o corpo pousa no chão real sob o ponto em que estava. */
  _toNear(e, origin) {
    const w = e.walker;
    w.feet.copy(e.feet).sub(origin);
    w.vel.set(0, 0, 0);
    w.grounded = false;
    w.airTime = 0;
    w.col.refresh(w.feet, 20);
    _o.copy(w.feet).y += 1.2;
    const hit = w.col.ray(_o, DOWN, 3);
    if (hit) w.feet.y = hit.point.y;
    w.fallStartY = w.feet.y;
    e.tier = 'near';
    e.best = Infinity;
    e.stuckT = 0;
  }

  /** Longe: avança pela polilinha, sem física. */
  _stepFar(e, dt) {
    e.stats.far += dt;
    if (e.state !== 'walk' || !e.path) {
      e.speed = 0;
      return;
    }
    let left = (e.farSpeed ?? FAR_SPEED) * dt;
    const pts = e.path.pts;
    while (left > 0 && e.pi < pts.length) {
      const p = pts[e.pi];
      const dx = p.x - e.feet.x;
      const dy = p.y - e.feet.y;
      const dz = p.z - e.feet.z;
      const d = Math.hypot(dx, dy, dz);
      if (d <= left) {
        e.feet.set(p.x, p.y, p.z);
        left -= d;
        e.pi++;
      } else {
        e.feet.x += (dx / d) * left;
        e.feet.y += (dy / d) * left;
        e.feet.z += (dz / d) * left;
        if (Math.hypot(dx, dz) > 0.01) e.yaw = Math.atan2(-dx, -dz);
        left = 0;
      }
    }
    e.speed = e.farSpeed ?? FAR_SPEED;
    if (e.pi >= pts.length) this._arrive(e);
  }

  _arrive(e) {
    e.state = 'arrived';
    e.speed = 0;
    this.bus?.emit('being:arrive', { id: e.id, x: e.feet.x, y: e.feet.y, z: e.feet.z });
  }

  /** Perto: o Walker, com a direção escolhida pelo caminho + desvio local. */
  _stepNear(e, dt, origin, time) {
    e.stats.near += dt;
    const w = e.walker;
    // o chão em volta ainda não chegou: fica parado onde está (não anda no ar)
    if (!this.world.chunkLayer.isReadyAround(e.feet, 30)) return;
    w.feet.copy(e.feet).sub(origin); // (a origem flutuante pode ter mudado)
    let f = 0;
    let yaw = e.yaw;
    if (e.state === 'walk' && e.path) {
      const pts = e.path.pts;
      // pula os pontos já alcançados
      let wrongDeck = false;
      while (e.pi < pts.length) {
        const p = pts[e.pi];
        const hd = Math.hypot(p.x - e.feet.x, p.z - e.feet.z);
        if (hd < ARRIVE && Math.abs(p.y - e.feet.y) < 1.5) {
          e.pi++;
          e.best = Infinity;
          e.stuckT = 0;
        } else {
          // bem em cima (ou embaixo) do ponto, noutro nível: está noutra ponte que corre
          // junto desta (uma rampa sob uma passarela) — esta aresta não serve daqui
          wrongDeck = hd < ARRIVE && Math.abs(p.y - e.feet.y) > 2.5;
          break;
        }
      }
      if (wrongDeck) this._replan(e);
      else if (e.pi >= pts.length) this._arrive(e);
      else {
        const p = pts[e.pi];
        yaw = Math.atan2(-(p.x - e.feet.x), -(p.z - e.feet.z));
        f = 1;
        // desvio local: beirada ou obstáculo à frente → tenta ângulos para os lados
        yaw = this._steer(e, yaw, dt);
        if (yaw === null) {
          f = 0;
          yaw = e.yaw;
        }
        // empacou? (não chega mais perto do próximo ponto)
        const hd = Math.hypot(p.x - e.feet.x, p.z - e.feet.z) + Math.abs(p.y - e.feet.y) * 0.5;
        if (hd < e.best - 0.3) {
          e.best = hd;
          e.stuckT = 0;
        } else if ((e.stuckT += dt) > STUCK_AFTER) this._unstick(e);
      }
    }
    this._walk(e, dt, origin, time, yaw, f);
  }

  /**
   * Perto: um passo do Walker na direção `target` (GLOBAL), com o desvio local.
   * Para quem tem brain (os Safeguards). Devolve a distância horizontal que falta.
   */
  walkToward(e, target, dt, origin, time) {
    if (e.tier !== 'near' || !this.world.chunkLayer.isReadyAround(e.feet, 30)) return Infinity;
    e.walker.feet.copy(e.feet).sub(origin);
    const hd = Math.hypot(target.x - e.feet.x, target.z - e.feet.z);
    let yaw = Math.atan2(-(target.x - e.feet.x), -(target.z - e.feet.z));
    let f = hd > 0.35 ? 1 : 0;
    if (f) {
      const s = this._steer(e, yaw, dt);
      if (s === null) f = 0;
      else yaw = s;
    }
    this._walk(e, dt, origin, time, f ? yaw : e.yaw, f);
    return hd;
  }

  /** Um passo do Walker com rumo `yaw` e avanço f (0..1). */
  _walk(e, dt, origin, time, yaw, f) {
    const w = e.walker;
    // vira suave (um corpo não gira no lugar de uma vez)
    let dy = yaw - e.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    e.yaw += dy * Math.min(1, dt * 7);
    if (Math.abs(dy) > 1.2) f *= 0.3; // curva fechada: desacelera

    e.proxy.position.set(e.feet.x - origin.x, e.feet.y - origin.y + w.eye + w.bob - w.dip, e.feet.z - origin.z);
    const bx = w.feet.x;
    const by = w.feet.y;
    const bz = w.feet.z;
    w.step(dt, e.proxy, { f, r: 0, jump: false, run: false }, e.yaw, 1, time);
    // fiscal: o peito passou através de alguma coisa neste quadro? (não deveria nunca)
    _d.set(w.feet.x - bx, 0, w.feet.z - bz);
    const mv = _d.length();
    if (mv > 1e-3) {
      _s.set(bx, by + 1.2, bz);
      _d.divideScalar(mv);
      const hit = w.col.ray(_s, _d, mv);
      if (hit && hit.face && Math.abs(hit.face.normal.y) < 0.55) e.stats.wall++;
    }
    e.feet.copy(w.feet).add(origin);
    e.speed = Math.hypot(w.vel.x, w.vel.z);
  }

  /**
   * Escolhe um rumo perto de `yaw` que tenha chão à frente e nada bloqueando.
   * Devolve o rumo, ou null (ficar parado).
   */
  _steer(e, yaw, dt) {
    const w = e.walker;
    const col = w.col;
    if (e.detour > 0) {
      e.detour -= dt;
      yaw += e.detourSide * 0.9;
    }
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6]) {
      const a = yaw + off * (e.detourSide || 1);
      _d.set(-Math.sin(a), 0, -Math.cos(a));
      // algo na frente (joelho e peito)?
      let blocked = false;
      for (const h of [0.6, 1.0, 1.3]) { // (joelho, corrimão, peito)
        _o.copy(w.feet).y += h;
        const hit = col.ray(_o, _d, 1.1);
        if (hit && hit.face && Math.abs(hit.face.normal.y) < 0.55) blocked = true;
      }
      if (blocked) {
        e.why = `bloqueado a ${off}`;
        continue;
      }
      // chão à frente? (um pouco abaixo do pé serve: rampa, degrau descendo)
      _o.copy(w.feet).addScaledVector(_d, 0.9).y += 0.8;
      const floor = col.ray(_o, DOWN, 2.2);
      if (!floor || !floor.face || floor.face.normal.y < 0.55) {
        e.why = `sem chão a ${off}${floor ? ` (normal ${floor.face?.normal.y.toFixed(2)}, ${floor.object.userData.mat})` : ''}`;
        continue;
      }
      e.why = off ? `desvio ${off}` : 'reto';
      return a;
    }
    return null;
  }

  /** Empacou: primeiro um desvio para o lado; depois, outro caminho sem esta aresta. */
  _unstick(e) {
    e.stuckT = 0;
    e.best = Infinity;
    if (e.detour <= 0 && e.replans % 2 === 0) {
      e.detour = 1.5;
      e.detourSide = Math.random() < 0.5 ? -1 : 1;
      e.replans++;
      return;
    }
    this._replan(e);
  }

  /** Outro caminho, sem a aresta em que está agora. */
  _replan(e) {
    e.replans++;
    e.stats.replans++;
    e.stuckT = 0;
    e.best = Infinity;
    if (e.replans > MAX_REPLANS * 2) {
      e.state = 'stuck';
      this.bus?.emit('being:stuck', { id: e.id, x: e.feet.x, y: e.feet.y, z: e.feet.z });
      return;
    }
    // a aresta em que empacou fica de fora do próximo caminho
    const leg = e.path?.legs?.[e.path.ptLeg?.[e.pi] ?? -1];
    if (leg) e.avoid.add(`${leg.from.id}>${leg.to.id}`);
    this._plan(e);
  }

  /** Estado para o salvamento do mundo (só os corpos persistentes). */
  serialize() {
    const out = [];
    for (const e of this.list.values()) {
      if (!e.persist) continue;
      out.push({ id: e.id, kind: e.kind, feet: [e.feet.x, e.feet.y, e.feet.z].map((v) => Math.round(v * 100) / 100), yaw: e.yaw, goal: e.state === 'walk' ? e.goal : null });
    }
    return out;
  }

  load(list) {
    for (const d of list ?? []) {
      this.spawn({ id: d.id, kind: d.kind, feet: { x: d.feet[0], y: d.feet[1], z: d.feet[2] }, yaw: d.yaw, goal: d.goal });
    }
  }

  /** Passa para a física (para quem tem brain, quando convém). */
  toNear(e, origin) {
    this._toNear(e, origin);
  }

  rebase() {} // posições globais: nada a deslocar

  dispose() {
    for (const id of [...this.list.keys()]) this.remove(id);
  }
}
