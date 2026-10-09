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
//  TUDO O QUE O JOGADOR FAZ, OS SERES FAZEM (o mesmo Walker):
//    vagão     uma perna 'ride' do caminho (gen/nav.js): espera na estação, entra
//              quando o vagão para, fica dentro, desce na estação de destino
//    elevador  um alvo noutro nível (walkToward — quem caça, quem foge): espera o
//              carro na ponta em que está, entra, sai na outra ponta
//    escada    o mesmo, por uma escada de marinheiro: sobe (ou monta nela por cima
//              e desce) e sai pelo lado num patamar
//    quina     parado diante de uma quina (até 2,25 m) com o alvo mais alto: pula, agarra, sobe
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
import { ElevatorSystem } from './elevators.js';
import { buildTestBody, buildSafeguardLevel, buildHumanOf, buildTranshumanOf, buildSiliconLevel } from './bodies.js';

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
const LEVEL = 3.5; // m: um alvo mais alto/baixo que isso está noutro nível
const LIFT_REACH = 60; // m: elevadores que um corpo considera para mudar de nível
const LADDER_REACH = 14; // m: idem, escadas de marinheiro
const VERT_GIVEUP = 150; // s: desiste de um elevador/escada (e o evita por um tempo)
const DOWN = new THREE.Vector3(0, -1, 0);
const STAGGER = 0.6; // s cambaleando depois de um tiro que não matou

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();

export class EntitySystem {
  constructor(group, materials, world) {
    this.debugVert = false; // (dev/movetest.js --movetrace: por que desistiu, por que replanejou)
    /** @type {THREE.MeshBasicMaterial|undefined} o escuro sem luz dentro dos capuzes */
    this._void = undefined;
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
    const rig = this._rig(def.kind, def);
    this.group.add(rig.group);
    const walker = new Walker(new CollisionWorld(this.world));
    walker.canClimb = false; // (ligado só quando o corpo decide usar uma escada — senão um rumo de lado a pegaria)
    walker.canGrab = false; // (idem: ligado quando ele decide pular para uma quina)
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
      ride: null, // no vagão: { leg, phase: wait · board · ride · off }
      vert: null, // mudando de nível: { kind: 'lift'|'ladder', … }
      vertBan: new Map(), // id do elevador/escada → até quando evitar
      leap: 0, // s pulando para uma quina
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
    if (cause === 'beam') e.staggerT = STAGGER; // cambaleia
    this.bus?.emit('being:hurt', { id: e.id, kind: e.kind, cause, hp: e.hp, amount, x: e.feet.x, y: e.feet.y, z: e.feet.z });
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
    // morreu de pé num piso que anda (vagão, elevador, o convés do colosso): o corpo segue nele desde já
    // (só com física — perto: longe, o Walker guarda o chão de quando esteve perto, noutro lugar)
    e.corpseOn = e.tier === 'near' && e.walker?.grounded ? e.walker.groundObj : null;
    this.bus?.emit('being:die', { id: e.id, kind: e.kind, cause, x: e.feet.x, y: e.feet.y, z: e.feet.z });
  }

  /** O corpo de cada tipo de ser (e: o ser — o nível e a identidade fazem o corpo dos hostis, world/kits.js). */
  _rig(kind, e = null) {
    const M = this.materials;
    const dark = (this._void ??= new THREE.MeshBasicMaterial({ color: 0x030303 })); // o escuro sem luz (dentro do capuz)
    if (kind === 'safeguard') return buildSafeguardLevel(M, e?.level ?? 'low', e?.id);
    if (kind === 'human') return buildHumanOf(M, e?.id);
    if (kind === 'transhuman') return buildTranshumanOf(M, e?.id);
    if (kind === 'silicon') return buildSiliconLevel(M, e?.level ?? 'low', e?.id);
    return buildTestBody(M.machine);
  }

  /** Troca o corpo (a vida de silício se revelando). */
  replaceRig(e, kind) {
    this.group.remove(e.rig.group);
    e.rig.dispose();
    e.rig = this._rig(kind, e);
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
        // sem chão debaixo (o emissor levou o piso): cai — nada fica no ar
        if (dist < NEAR) this._settleCorpse(e, dt, origin);
        const r = e.rig.group;
        r.visible = dist < VISIBLE;
        r.position.set(e.feet.x - origin.x, e.feet.y - origin.y + 0.16, e.feet.z - origin.z);
        r.rotation.set(-Math.PI / 2, e.yaw + Math.PI, 0, 'YXZ');
        continue;
      }
      if (e.tier === 'far' && dist < NEAR && this.world.chunkLayer.isReadyAround(e.feet, 30)) this._toNear(e, origin);
      else if (e.tier === 'near' && dist > FAR) e.tier = 'far';

      if (e.staggerT > 0) e.staggerT = Math.max(0, e.staggerT - dt);
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
        if (e.staggerT > 0) e.rig.stagger?.(Math.sin((e.staggerT / STAGGER) * Math.PI));
        if (e.grabPose) e.rig.grab?.(e.grabPose); // agarrando alguém (app/wake.js)
        else if (e.strikePose) e.rig.strike?.(e.strikePose.w, e.strikePose.s); // o golpe (world/safeguards.js)
      }
    }
  }

  /** O corpo morto: confere o chão (a cada 0,4 s parado; a cada quadro caindo) e cai com a gravidade. */
  _settleCorpse(e, dt, origin) {
    e.fallV ??= 0;
    // deitado num piso que se move (vagão, elevador, o convés do colosso): vai junto, a cada quadro
    // (como os vivos — _carry); sem isso a máquina saía de baixo dele
    let top = e.corpseOn;
    while (top?.parent) top = top.parent;
    const gd = !e.fallV && top?.isScene ? e.corpseOn.userData : null; // (a máquina saiu de cena: não arrasta mais)
    if (gd && (gd.dx || gd.dy || gd.dz)) {
      e.feet.x += gd.dx || 0;
      e.feet.y += gd.dy || 0;
      e.feet.z += gd.dz || 0;
    }
    if (!e.fallV && (e.settleT = (e.settleT ?? 0) - dt) > 0) return;
    e.settleT = 0.4;
    const col = e.walker.col;
    _o.set(e.feet.x - origin.x, e.feet.y - origin.y + 0.6, e.feet.z - origin.z);
    col.refresh(_o, 12);
    if (!col.ready) return;
    const reach = 0.6 + 0.25 + Math.max(0, e.fallV * dt) + 0.3;
    const hit = col.ray(_o, DOWN, reach);
    const floor = hit && hit.face && hit.face.normal.y > 0.4 ? hit.point.y + origin.y : null;
    if (floor !== null && e.feet.y - floor < 0.25 + Math.max(0, e.fallV * dt)) {
      if (e.fallV) this.bus?.emit('being:corpseLand', { id: e.id, v: e.fallV, x: e.feet.x, y: floor, z: e.feet.z });
      e.feet.y = floor;
      e.fallV = 0;
      e.corpseOn = hit.object;
      return;
    }
    e.corpseOn = null;
    // no ar: cai (a mesma gravidade do Walker)
    e.fallV = Math.min(60, e.fallV + 15 * dt);
    e.feet.y -= e.fallV * dt;
    if (floor !== null && e.feet.y < floor) {
      e.feet.y = floor;
      e.fallV = 0;
      e.corpseOn = hit.object;
    }
  }

  /** De pé num piso que se move (vagão, elevador): anda junto (o quanto ele andou neste quadro). */
  _carry(e) {
    const w = e.walker;
    const gd = w.grounded ? w.groundObj?.userData : null;
    if (gd && (gd.dx || gd.dy || gd.dz)) {
      e.feet.x += gd.dx || 0;
      e.feet.y += gd.dy || 0;
      e.feet.z += gd.dz || 0;
    }
  }

  /** Passa para a física: o corpo pousa no chão real sob o ponto em que estava. */
  _toNear(e, origin) {
    const w = e.walker;
    // no meio do trecho vertical de uma passagem (andando "no ar" ao longe): volta para a ponta
    // mais perto — senão cairia pelo poço
    const leg = e.path?.legs?.[e.path.ptLeg?.[e.pi] ?? -1];
    const P = e.path?.pts;
    if (leg?.kind === 'lift' && P && e.pi > 0 && e.pi < P.length && Math.abs(P[e.pi].y - P[e.pi - 1].y) > LEVEL) {
      const q = Math.abs(e.feet.y - P[e.pi - 1].y) < Math.abs(e.feet.y - P[e.pi].y) ? P[e.pi - 1] : P[e.pi];
      e.feet.set(q.x, q.y, q.z);
      if (q === P[e.pi]) e.pi++;
    }
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
    e.ride = null;
    e.vert = null;
    const pts = e.path.pts;
    // dentro do vagão (do centro do vagão numa estação ao da outra, numa perna 'ride'): na velocidade dele
    const leg = e.path.legs?.[e.path.ptLeg?.[e.pi] ?? -1];
    let left = (e.farSpeed ?? FAR_SPEED) * dt;
    if (leg?.kind === 'ride' && pts[e.pi].x === leg.pts[2].x && pts[e.pi].z === leg.pts[2].z) left = 15 * dt;
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
    // o chão em volta ainda não chegou: fica parado onde está (não anda no ar) — mas, de pé
    // num vagão ou elevador, vai junto com ele (senão o piso andava e o corpo ficava no ar)
    if (!this.world.chunkLayer.isReadyAround(e.feet, 30)) return this._carry(e);
    w.feet.copy(e.feet).sub(origin); // (a origem flutuante pode ter mudado)
    let f = 0;
    let yaw = e.yaw;
    const legNow = e.state === 'walk' && e.path ? e.path.legs?.[e.path.ptLeg?.[e.pi] ?? -1] : null;
    if (legNow?.kind === 'ride' || e.ride) return this._rideStep(e, legNow, dt, origin, time);
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
          wrongDeck = hd < ARRIVE && Math.abs(p.y - e.feet.y) > 2.5 && legNow?.kind !== 'lift'; // (na perna do elevador, o outro nível em cima é de propósito)
          break;
        }
      }
      if (wrongDeck) this._replan(e);
      else if (e.pi >= pts.length) this._arrive(e);
      else if (legNow?.kind === 'lift' && (e.vert || Math.abs(pts[e.pi].y - e.feet.y) > LEVEL) && this._vertical(e, pts[e.pi], dt, origin, time)) {
        // o próximo ponto é o outro nível de uma passagem: o elevador grande (ou a escada) —
        // que comanda até sair dele lá (não só até chegar à altura)
        e.stuckT = 0;
        e.best = Infinity;
        return;
      } else {
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
        // o próximo ponto mais alto, logo ali, atrás de uma quina: pula e agarra
        if (p.y > e.feet.y + 0.5 && Math.hypot(p.x - e.feet.x, p.z - e.feet.z) < 6) this._leapStart(e, Math.atan2(-(p.x - e.feet.x), -(p.z - e.feet.z)));
      }
    }
    if (this._leapStep(e, dt, origin, time)) return;
    this._walk(e, dt, origin, time, yaw, f);
  }

  /**
   * Perto: um passo do Walker na direção `target` (GLOBAL), com o desvio local.
   * Para quem tem brain (os Safeguards). Devolve a distância horizontal que falta.
   */
  walkToward(e, target, dt, origin, time) {
    if (e.tier !== 'near') return Infinity;
    if (!this.world.chunkLayer.isReadyAround(e.feet, 30)) {
      this._carry(e); // (num elevador/vagão, vai junto mesmo sem o chão em volta pronto)
      return Infinity;
    }
    e.walker.feet.copy(e.feet).sub(origin);
    const hd = Math.hypot(target.x - e.feet.x, target.z - e.feet.z);
    // noutro nível: um elevador ou uma escada perto leva até lá
    if (this._vertical(e, target, dt, origin, time)) return Math.max(hd, Math.abs(target.y - e.feet.y));
    if (this._leapStep(e, dt, origin, time)) return hd;
    let yaw = Math.atan2(-(target.x - e.feet.x), -(target.z - e.feet.z));
    // o alvo mais alto, logo ali, atrás de uma quina que dá para subir: pula e agarra
    if (hd < 6 && target.y > e.feet.y + 0.5 && this._leapStart(e, yaw)) return hd;
    let f = hd > 0.35 ? 1 : 0;
    if (f) {
      const s = this._steer(e, yaw, dt);
      if (s === null) f = 0;
      else yaw = s;
    }
    this._walk(e, dt, origin, time, f ? yaw : e.yaw, f);
    return hd;
  }

  // ── vagões ──────────────────────────────────────────────────────────────

  /** Uma perna 'ride': esperar na estação, embarcar, viajar, descer. */
  _rideStep(e, leg, dt, origin, time) {
    const T = this.world.transit;
    if (!e.ride) {
      if (!leg) return this._walk(e, dt, origin, time, e.yaw, 0);
      e.ride = { leg, phase: 'wait', t: 0 };
    }
    const R = e.ride;
    const L = R.leg;
    const [W0, C0, C1, W1] = L.pts;
    R.t += dt;
    const go = (p, tol = ARRIVE, steer = true) => {
      const hd = Math.hypot(p.x - e.feet.x, p.z - e.feet.z);
      if (hd < tol) {
        this._walk(e, dt, origin, time, e.yaw, 0);
        return true;
      }
      const yaw = Math.atan2(-(p.x - e.feet.x), -(p.z - e.feet.z));
      if (!steer) {
        // reto (para dentro/fora do vagão): um vão no caminho se pula; sem outro lado, para
        this._walkInput(e, dt, origin, time, yaw, this._gapJump(e, yaw) ?? { f: 1 });
        return false;
      }
      const st = this._steer(e, yaw, dt);
      this._walk(e, dt, origin, time, st ?? e.yaw, st === null ? 0 : 1); // (sem rumo com chão: parado)
      return false;
    };
    const car = (ts, minLeft) => T?.dockedAt(L.ride.line, ts, minLeft) ?? null;
    // a linha sem energia (o relógio dela parado): o vagão não vem; vai a pé (outro caminho)
    const clock = T?.clocks.get(L.ride.line);
    if (R.phase !== 'ride' && clock && clock.rate < 0.1 && (R.dark = (R.dark ?? 0) + dt) > 10) return this._rideFail(e);
    if (clock && clock.rate >= 0.1) R.dark = 0;
    if (R.phase === 'wait') {
      // na passarela, diante da estação, até um vagão parar com tempo para entrar
      const there = go(W0, 1.2);
      // (com folga: andar da passarela ao meio do vagão leva ~5 s — com 6 s de parada, às vezes
      // ele partia no meio do embarque e o corpo ficava para trás)
      if (there && car(L.ride.from, 10)) R.phase = 'board';
      if (R.t > 400) return this._rideFail(e);
    } else if (R.phase === 'board') {
      go(C0, 1.4, false);
      const on = !!e.walker.groundObj?.userData.transit;
      if (on && Math.hypot(C0.x - e.feet.x, C0.z - e.feet.z) < 3) {
        R.phase = 'ride';
        R.t = 0;
        this.bus?.emit('being:board', { id: e.id, line: L.ride.line, at: L.ride.from });
      } else if (!car(L.ride.from, 0)) R.phase = 'wait'; // partiu sem ele: o próximo
    } else if (R.phase === 'ride') {
      // dentro: parado (o vagão leva — o Walker lê o quanto o piso andou)
      this._walk(e, dt, origin, time, e.yaw, 0);
      if (car(L.ride.to, 2) && Math.hypot(C1.x - e.feet.x, C1.z - e.feet.z) < 8) R.phase = 'off';
      else if (!e.walker.groundObj?.userData.transit && e.walker.grounded && R.t > 2) return this._rideFail(e); // ficou para trás
    } else if (R.phase === 'off') {
      if (go(W1, ARRIVE, Math.hypot(C1.x - e.feet.x, C1.z - e.feet.z) > 4)) {
        // desceu: o caminho segue depois desta perna
        const li = e.path.legs.indexOf(L);
        while (e.pi < e.path.pts.length && (e.path.ptLeg[e.pi] ?? -1) <= li) e.pi++;
        e.ride = null;
        e.best = Infinity;
        e.stuckT = 0;
        this.bus?.emit('being:ride', { id: e.id, from: L.ride.from, to: L.ride.to });
        if (e.pi >= e.path.pts.length) this._arrive(e);
      }
    }
  }

  _rideFail(e) {
    e.ride = null;
    this._replan(e);
  }

  // ── mudar de nível: elevadores e escadas ────────────────────────────────

  /** O alvo está noutro nível: usa (ou procura) um elevador ou uma escada. true = no controle. */
  _vertical(e, target, dt, origin, time) {
    if (e.vert) return this._vertStep(e, target, dt, origin, time);
    const dy = target.y - e.feet.y;
    if (Math.abs(dy) < LEVEL || !e.walker.grounded) return false;
    if ((e.vertScan = (e.vertScan ?? 0) - dt) > 0) return false;
    e.vertScan = 1.5;
    const v = this._findLift(e, target, time) ?? this._findLadder(e, target, origin, time);
    if (!v) return false;
    e.vert = { ...v, t: 0, y0: e.feet.y };
    this.bus?.emit('being:level', { id: e.id, kind: v.kind, dy });
    return this._vertStep(e, target, dt, origin, time);
  }

  _banned(e, id, time) {
    const until = e.vertBan.get(id);
    return until !== undefined && until > time;
  }

  /** Um elevador perto cuja ponta está no meu nível e a outra mais perto do nível do alvo. */
  _findLift(e, target, time) {
    const E = this.world.elevators;
    if (!E) return null;
    let best = null;
    for (const [id, car] of E.cars) {
      if (this._banned(e, id, time)) continue;
      const d = car.def;
      const hd = Math.hypot(d.x - e.feet.x, d.z - e.feet.z);
      if (hd > LIFT_REACH + d.w / 2) continue;
      for (const [from, to] of [[d.y0, d.y1], [d.y1, d.y0]]) {
        if (Math.abs(from - e.feet.y) > 1.5) continue;
        if (Math.abs(to - target.y) > Math.abs(target.y - e.feet.y) - LEVEL) continue;
        const score = hd + Math.abs(to - target.y);
        if (!best || score < best.score) best = { kind: 'lift', id, car, from, to, score, phase: 'wait' };
      }
    }
    return best;
  }

  /**
   * Uma escada de marinheiro perto que leva para o lado do alvo: para subir, os degraus
   * à vista em volta; para descer, a beirada com degraus logo abaixo.
   */
  _findLadder(e, target, origin, time) {
    const w = e.walker;
    const col = w.col;
    const up = target.y > e.feet.y;
    let best = null;
    for (let q = 0; q < 24; q++) {
      const a = (q / 24) * Math.PI * 2;
      _d.set(-Math.sin(a), 0, -Math.cos(a));
      if (up) {
        _o.copy(w.feet).y += 1.0;
        const hit = col.ray(_o, _d, LADDER_REACH);
        if (!hit || hit.object.userData.mat !== 'rungs' || !hit.face) continue;
        // a escada continua para cima (ao menos uns metros)
        _s.copy(hit.point).addScaledVector(_d, -0.4).y += 4;
        const more = col.ray(_s, _d, 1.2);
        if (!more || more.object.userData.mat !== 'rungs') continue;
        if (!best || hit.distance < best.d) best = { d: hit.distance, yaw: a, at: hit.point.clone().add(origin) };
      } else {
        // descer: degraus logo abaixo da beirada, vistos de fora
        // (um ponto no ar logo depois da beirada, 2 m abaixo dela: degraus em alguma direção dali)
        for (const r of [1.0, 1.5, 3, 5, 8, 11]) {
          _o.copy(w.feet).addScaledVector(_d, r);
          _o.y += 1.0;
          if (col.ray(_o, DOWN, 3)) continue; // ainda há chão aqui
          _o.y -= 3.2;
          let hit = null;
          let hb = 0;
          for (let k = 0; k < 8 && !hit; k++) {
            const b = (k / 8) * Math.PI * 2;
            _s.set(-Math.sin(b), 0, -Math.cos(b));
            const h = col.ray(_o, _s, 2.0);
            if (h && h.object.userData.mat === 'rungs' && h.face) {
              hit = h;
              hb = b;
            }
          }
          if (!hit) continue;
          if (!best || r < best.d) best = { d: r, yaw: hb, at: hit.point.clone().add(origin), down: true };
          break;
        }
      }
    }
    if (!best) return null;
    const id = `lad${Math.round(best.at.x)},${Math.round(best.at.z)}`;
    if (this._banned(e, id, time)) return null;
    return { kind: 'ladder', id, yaw: best.yaw, at: best.at, down: !!best.down, phase: best.down ? 'edge' : 'approach' };
  }

  /**
   * Andando reto no rumo yaw: um vão logo à frente (sem chão a 0,9 m) com chão do outro lado
   * (até ~3 m, no mesmo nível ou pouco abaixo) → { f, run, jump } para pular correndo; senão null.
   */
  _gapJump(e, yaw) {
    const w = e.walker;
    if (!w.grounded) return { f: 1, run: true };
    _d.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    // (três raios lado a lado: um só, exatamente sobre a junta de duas peças, pode não ver nenhuma)
    const floorAt = (r, far) => {
      for (const side of [0, 0.2, -0.2]) {
        _o.copy(w.feet).addScaledVector(_d, r);
        _o.x += _d.z * side;
        _o.z -= _d.x * side;
        _o.y += 0.8;
        const h = w.col.ray(_o, DOWN, far);
        if (h) return h;
      }
      return null;
    };
    if (floorAt(0.9, 2.2)) return null; // há chão: anda
    for (const r of [1.8, 2.4, 3.0]) {
      const fl = floorAt(r, 2.0);
      if (fl && fl.face && fl.face.normal.y > 0.7) return { f: 1, run: true, jump: true };
    }
    return { f: 0 }; // um vão sem outro lado: não vai
  }

  _vertDone(e, ok, time) {
    if (!ok && this.debugVert) console.warn(`MOVE desistiu de ${e.vert?.kind} ${e.vert?.id} na fase ${e.vert?.phase} (t ${e.vert?.t?.toFixed(1)})`);
    if (!ok && e.vert) e.vertBan.set(e.vert.id, time + 60);
    e.vert = null;
    e.walker.canClimb = false;
    e.walker.climbing = false;
    e.vertScan = ok ? 0 : 2;
  }

  _vertStep(e, target, dt, origin, time) {
    const V = e.vert;
    const w = e.walker;
    V.t += dt;
    if (V.t > VERT_GIVEUP) {
      this._vertDone(e, false, time);
      return false;
    }
    const go = (x, z, tol, steer = true) => {
      const hd = Math.hypot(x - e.feet.x, z - e.feet.z);
      if (hd < tol) {
        this._walk(e, dt, origin, time, e.yaw, 0);
        return true;
      }
      const yaw = Math.atan2(-(x - e.feet.x), -(z - e.feet.z));
      if (!steer) {
        // em linha reta (para dentro/fora do carro); um vão estreito no caminho se pula, correndo
        this._walkInput(e, dt, origin, time, yaw, this._gapJump(e, yaw) ?? { f: 1 });
        return false;
      }
      const st = this._steer(e, yaw, dt);
      this._walk(e, dt, origin, time, st ?? e.yaw, st === null ? 0 : 1); // (sem rumo com chão: parado)
      return false;
    };
    if (V.kind === 'lift') {
      const car = V.car;
      const d = car.def;
      if (this.world.elevators.cars.get(V.id) !== car) {
        this._vertDone(e, false, time);
        return false;
      }
      const still = (y) => Math.abs(car.y - y) < 0.05 && car.rate > 0.5 && Math.abs(ElevatorSystem.heightAt(d, car.clock + 0.2) - y) < 0.01;
      // sem energia (o setor apagado — o motor parado): não vai andar; desiste dele (a escada…)
      if (V.phase !== 'ride' && car.rate < 0.1 && (V.dark = (V.dark ?? 0) + dt) > 8) {
        this._vertDone(e, false, time);
        return false;
      }
      if (car.rate >= 0.1) V.dark = 0;
      // embarque pelos lados sem guarda-corpo (±x): o lado de onde se vem
      V.sx ??= Math.sign(e.feet.x - d.x) || 1;
      if (V.phase === 'wait') {
        // ao lado do carro, no lado aberto; vindo do lado do guarda-corpo, pela quina (não pelo vão)
        const wx = d.x + V.sx * (d.w / 2 + 2.5);
        const side = e.feet.z - d.z;
        if (Math.abs(side) > d.d / 2 + 1 && Math.abs(e.feet.x - wx) > 1.5) go(wx, d.z + Math.sign(side) * (d.d / 2 + 3), 1.0);
        else go(wx, d.z, 1.0);
        // parado na minha ponta, e ainda vai ficar uns segundos
        if (still(V.from) && Math.abs(ElevatorSystem.heightAt(d, car.clock + 5) - V.from) < 0.01) V.phase = 'board';
      } else if (V.phase === 'board') {
        go(d.x + V.sx * (d.w / 2 - 3), d.z, 0.8, false); // (perto da borda: a saída lá é do mesmo lado)
        if (w.groundObj?.userData.elevator && Math.abs(e.feet.x - d.x) < d.w / 2 - 0.6 && Math.abs(e.feet.z - d.z) < d.d / 2 - 0.6) {
          V.phase = 'ride';
          this.bus?.emit('being:board', { id: e.id, lift: V.id });
        } else if (!still(V.from)) V.phase = 'wait';
      } else if (V.phase === 'ride') {
        this._walk(e, dt, origin, time, e.yaw, 0);
        if (still(V.to) && Math.abs(e.feet.y - V.to) < 1) {
          // sai pelo lado aberto que dá para o alvo (com chão lá fora)
          const pref = Math.sign(target.x - d.x) || 1;
          V.ox = pref;
          for (const sx of [pref, -pref]) {
            _o.set(d.x + sx * (d.w / 2 + 3) - origin.x, V.to + 1.5 - origin.y, d.z - origin.z);
            if (w.col.ray(_o, DOWN, 3)) {
              V.ox = sx;
              break;
            }
          }
          V.phase = 'off';
        }
      } else if (V.phase === 'off') {
        const out = go(d.x + V.ox * (d.w / 2 + 3.5), d.z, 1.0, false);
        if (out || (!w.groundObj?.userData.elevator && Math.abs(e.feet.x - d.x) > d.w / 2 + 1 && w.grounded)) {
          this.bus?.emit('being:lift', { id: e.id, from: V.from, to: V.to });
          this._vertDone(e, true, time);
        }
      }
      return true;
    }
    // ── escada ──
    const ax = V.at.x;
    const az = V.at.z;
    const fx = -Math.sin(V.yaw);
    const fz = -Math.cos(V.yaw);
    if (V.phase === 'approach') {
      // até o pé da escada, de frente para ela
      if (go(ax - fx * 0.9, az - fz * 0.9, 0.5)) {
        V.phase = 'climb';
        V.ct = 0;
      }
      return true;
    }
    if (V.phase === 'edge') {
      // descer: até um chão junto do alto da escada — atrás dos degraus (o telhado, numa
      // fachada) ou ao lado deles (um patamar) —; depois monta nela, de frente para os degraus
      if (!V.stand) {
        const sx = -fz;
        const sz = fx;
        for (const [u, v] of [[1.0, 0], [-0.5, 1.6], [-0.5, -1.6], [0.6, 1.4], [0.6, -1.4], [-1.6, 0]]) {
          const x = ax + fx * u + sx * v;
          const z = az + fz * u + sz * v;
          _o.set(x - origin.x, e.feet.y + 1.2 - origin.y, z - origin.z);
          const fl = w.col.ray(_o, DOWN, 2.4);
          if (fl && fl.face && fl.face.normal.y > 0.7 && Math.abs(fl.point.y + origin.y - e.feet.y) < 0.6) {
            V.stand = { x, z };
            break;
          }
        }
        if (!V.stand) {
          this._vertDone(e, false, time);
          return false;
        }
      }
      if (go(V.stand.x, V.stand.z, 0.5)) {
        V.phase = 'mount';
        V.m = 0;
        V.p0 = e.feet.clone();
      }
      return true;
    }
    if (V.phase === 'mount') {
      V.m = Math.min(1, V.m + dt / 0.6);
      const k = V.m * V.m * (3 - 2 * V.m);
      // passa a perna por cima da beirada: do chão até pendurado nos degraus, 0,9 m abaixo
      e.feet.set(V.p0.x + (ax - fx * 0.55 - V.p0.x) * k, V.p0.y - 0.9 * k, V.p0.z + (az - fz * 0.55 - V.p0.z) * k);
      let dy = V.yaw - e.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      e.yaw += dy * Math.min(1, dt * 10);
      w.feet.copy(e.feet).sub(origin);
      w.vel.set(0, 0, 0);
      w.grounded = false;
      e.speed = 0;
      if (V.m >= 1) {
        e.yaw = V.yaw;
        V.phase = 'climb';
        V.ct = 0;
        w.climbing = true;
      }
      return true;
    }
    // subindo/descendo (o Walker na escada)
    w.canClimb = true;
    V.ct += dt;
    const dir = V.down ? -1 : 1;
    // no nível do alvo: sai pelo lado (onde houver patamar)
    const near = Math.abs(e.feet.y - target.y) < 1.4;
    V.side ??= 1;
    if (near && (V.sideT = (V.sideT ?? 0) + dt) > 0.6) {
      V.side = -V.side;
      V.sideT = 0;
    }
    const yb = e.feet.y;
    if (w.climbing) V.air = 0;
    this._walkInput(e, dt, origin, time, V.yaw, { f: near ? 0 : dir, r: near ? V.side : 0 });
    // terminou: em pé (subiu por cima, desceu no chão, ou saiu de lado num patamar)
    if (V.ct > 0.8 && !w.climbing && w.grounded) {
      this.bus?.emit('being:ladder', { id: e.id, dy: e.feet.y - V.y0 });
      this._vertDone(e, true, time);
    } else if (V.ct > 0.8 && !w.climbing && !w.grounded && (V.air = (V.air ?? 0) + dt) > 0.6) {
      // soltou-se no ar (o fim da escada sem saída): deixa cair, desiste desta
      this._vertDone(e, false, time);
    } else if (!near && Math.abs(e.feet.y - yb) < 1e-4) {
      if ((V.stall = (V.stall ?? 0) + dt) > 3) this._vertDone(e, false, time); // travado (teto)
    } else V.stall = 0;
    return true;
  }

  // ── quinas ─────────────────────────────────────────────────────────────

  /** Uma quina à frente (rumo yaw) que dá para subir: começa o pulo (o Walker agarra e sobe). */
  _leapStart(e, yaw) {
    if ((e.leapCool ?? 0) > 0) return false;
    const w = e.walker;
    if (!w.grounded) return false;
    _d.set(-Math.sin(yaw), 0, -Math.cos(yaw));
    const l = w._findLedge(_d, 1, 0.62, 2.25);
    if (!l) {
      e.leapCool = 1.5;
      return false;
    }
    e.leap = 3;
    e.leapYaw = yaw;
    e.leapJump = true;
    w.canGrab = true;
    return true;
  }

  /** Durante o pulo para a quina: para a frente até estar em pé lá em cima. true = no controle. */
  _leapStep(e, dt, origin, time) {
    e.leapCool = Math.max(0, (e.leapCool ?? 0) - dt);
    if (!(e.leap > 0)) return false;
    const w = e.walker;
    e.leap -= dt;
    this._walkInput(e, dt, origin, time, e.leapYaw, { f: 1, jump: e.leapJump });
    e.leapJump = false;
    const busy = !!(w.ledge || w.climb);
    if ((e.leap < 2.6 && w.grounded && !busy) || (e.leap <= 0 && !busy)) {
      e.leap = 0;
      e.leapCool = 2;
      w.canGrab = false;
      this.bus?.emit('being:leap', { id: e.id, y: e.feet.y });
    }
    return true;
  }

  /** Um passo do Walker com rumo `yaw` e avanço f (0..1). */
  _walk(e, dt, origin, time, yaw, f) {
    this._walkInput(e, dt, origin, time, yaw, { f });
  }

  /** Um passo do Walker com a entrada inteira { f, r, jump } (escadas, quinas). */
  _walkInput(e, dt, origin, time, yaw, input) {
    const w = e.walker;
    let f = input.f ?? 0;
    // vira suave (um corpo não gira no lugar de uma vez)
    let dy = yaw - e.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    e.yaw += dy * Math.min(1, dt * 7);
    if (Math.abs(dy) > 1.2 && !w.climbing) f *= 0.3; // curva fechada: desacelera

    e.proxy.position.set(e.feet.x - origin.x, e.feet.y - origin.y + w.eye + w.bob - w.dip, e.feet.z - origin.z);
    const bx = w.feet.x;
    const by = w.feet.y;
    const bz = w.feet.z;
    w.step(dt, e.proxy, { f, r: input.r ?? 0, jump: !!input.jump, run: !!input.run }, e.yaw, 1, time);
    // fiscal: o peito passou através de alguma coisa neste quadro? (não deveria nunca)
    _d.set(w.feet.x - bx, 0, w.feet.z - bz);
    const mv = _d.length();
    if (mv > 1e-3) {
      _s.set(bx, by + 1.2, bz);
      _d.divideScalar(mv);
      const hit = w.col.ray(_s, _d, mv);
      if (hit && hit.face && Math.abs(hit.face.normal.y) < 0.55) {
        e.stats.wall++;
        // (onde e em quê — o fiscal dos testes diz)
        const u = hit.object.userData;
        e.stats.wallLast = `${u.mat ?? '?'}${u.transit ? ' (vagão)' : ''}${u.dy || u.dx || u.dz ? ' (andando)' : ''} em ${[bx, by, bz].map(Math.round).join(',')} · ${e.kind} ${e.sg?.state ?? e.npc?.state ?? e.state}${e.vert ? ' ' + e.vert.kind + ':' + e.vert.phase : ''}`;
      }
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
    if (this.debugVert) {
      const P = e.path?.pts?.[e.pi];
      console.warn(`MOVE replan pi ${e.pi} perna ${e.path?.legs?.[e.path.ptLeg?.[e.pi] ?? -1]?.kind} pés ${e.feet.toArray().map(Math.round)} próximo ${P ? [P.x, P.y, P.z].map(Math.round) : '-'} ${(new Error().stack ?? '').split(String.fromCharCode(10))[2]?.trim()}`);
    }
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

  /** Um corte do emissor: quem tem caminho por ele pede outro (o grafo já não passa ali). */
  onCut() {
    const F = this.world.field;
    for (const e of this.list.values()) {
      if (e.dead || e.state !== 'walk' || !e.path) continue;
      const rest = e.path.pts.slice(Math.max(0, e.pi - 1));
      if (F.cutOnPath(rest)) this._plan(e);
    }
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
