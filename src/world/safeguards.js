// ─────────────────────────────────────────────────────────────────────────────
//  Safeguards (fase 6) — a Cidade percebe que você não deveria estar ali.
//
//  RONDAS (6.1): em cada território perto do jogador (setor × fatia de 480 m,
//    gen/patrols.js) com rede andável, UM Safeguard anda um circuito. Longe,
//    a posição é a do relógio do mundo no circuito (ninguém é simulado); perto
//    (< 110 m), o corpo anda de verdade com o Walker (world/entities.js) e o
//    relógio espera por ele — sem saltos à vista.
//  PERCEPÇÃO (6.3): vê num cone (de costas, bem menos); o alcance cresce com a
//    luz (escuro e quieto: só muito perto; setor com energia; lanterna acesa) e
//    com o alerta do setor; linha de visão por raio. Ouve correr e os barulhos
//    (this.noise: quedas, alavancas, leituras). De ronda percebe pouco.
//  CAÇADA (6.4): ronda → caça → perdeu de vista: vai ao último ponto visto e procura →
//    desiste → volta ao circuito. Não sobe escadas de marinheiro nem pula de
//    beiradas (o desvio local não pisa onde não há chão).
//  NÍVEIS E ARRANQUE (o cofre, Movimento-dos-inimigos): cada um é baixo, médio ou alto
//    (world/levels.js — pelo lugar: perto do começo só baixos). Caçando, ARRANCA: começa
//    devagar e acelera até a terminal do nível (baixo 8 m/s — menos que a sua corrida;
//    médio 11, alto 14 — mais); uma curva forte custa velocidade; escada, elevador, ferido
//    ou depois de um golpe, recomeça de baixo.
//  CAPTURA (6.5): o toque — this.onCatch (app/safeguards.js → desmaio → cemitério).
//  O GOLPE (com a vida — o cofre, Barra-de-vida §3): a ~1,5 m, no lugar do toque, se
//    this.strikes() diz que sim: para, gira para você e recolhe o braço (0,35 s); o braço
//    vem (this.onStrike — app/safeguards.js: −50% e o arremesso; longe demais no impacto,
//    errou); recolhe e ESPERA (1,5–2 s) antes de vir de novo. A captura só quando a vida zera.
//  SURGIMENTO (6.6): alerta:rise no setor do jogador (0,5 → um; 0,75 → dois):
//    uma placa de parede perto se abre (escuro dentro) e um caçador sai; quem
//    desiste volta à placa, entra, e ela fecha. Nunca mais de 3 caçando.
//
//  TERCEIRA FORÇA (fase 7): a vida de silício revelada (world/npcs.js) é caçada
//    antes do jogador — um Safeguard que a vê vai atrás dela (S.prey) e, se a
//    alcança, ela acaba.
//
//  Eventos: safeguard:spot · safeguard:step · safeguard:emerge · safeguard:lost
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { territoryAt, patrolCircuit, circuitAt, circuitNearest, PATROL } from '../gen/patrols.js';
import * as circ from '../gen/patrols.js';
import { CollisionWorld } from './collision.js';
import { levelAt, MOVE, accelerate } from './levels.js';

const WALK = 4.2; // m/s do Walker com speedScale 1
const PATROL_SCALE = PATROL.speed / WALK;
const HUNT_SCALE = 1.25; // ~5,2 m/s (atrás da vida de silício — ela não é o jogador)
const SCAN = 600; // m: territórios mantidos em volta do jogador
const DROP = 900; // m: longe assim, a ronda sai da memória
const STALE_DROP = 450; // m: uma ronda de circuito cortado sai quando ninguém a vê (além da névoa)
const SIGHT_MAX = 105; // m: ninguém vê além disso (a névoa, a poeira)
const CATCH = 1.0; // m (horizontal)
/** O golpe: alcance para começar, alcance no impacto (você pode sair na preparação), os tempos (s). */
export const STRIKE = { reach: 1.5, hit: 2.3, windup: 0.35, swing: 0.15, recover: 0.4, waitMin: 1.5, waitMax: 2 };
const LOST_AFTER = 1.5; // s sem ver → vai ao último ponto visto
const SEARCH_TIME = 7; // s procurando em volta
const MAX_HUNTERS = 3;
const STRIDE = 1.9;
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _d = new THREE.Vector3();

export class SafeguardSystem {
  constructor(group, materials, world) {
    /** @type {THREE.Vector3 | null} onde o jogador estava no último quadro (GLOBAL) */
    this.lastG = null;
    this.group = group;
    this.materials = materials;
    this.world = world;
    this.field = world.field;
    this.ents = world.entities;
    this.nav = world.entities.nav;
    this.enabled = false; // quem liga: app/safeguards.js (Peregrinação; no Livre, a opção)
    this.bus = null;
    /** () => { lantern, running, alertAt(x,y,z) } — o que o corpo do jogador está fazendo (app) */
    this.senses = null;
    this.onCatch = null;
    this.wired = false; // (app/safeguards.js ligou os sentidos, a captura e o golpe)
    /** () => boolean — o golpe no lugar do toque? (com a vida ligada — app/safeguards.js) */
    this.strikes = null;
    /** (e, hit) — o braço chegou: hit = o jogador ainda ao alcance */
    this.onStrike = null;
    this.byTerritory = new Map(); // território → entidade de ronda
    this.pending = new Set(); // territórios com o circuito sendo calculado (num worker)
    this.none = new Set(); // territórios sem ronda (sem rede andável)
    this.queue = [];
    this.hunters = new Set(); // entidades que saíram das paredes
    this.scanT = 0;
    this.los = new CollisionWorld(world);
    this.los.buildsPerFrame = 1;
    this.noise = null; // { x, y, z, r, t } o último barulho do jogador
    this.time = 0;
    this.clock = () => Date.now() / 1000; // o relógio do mundo (as rondas andam com o jogo fechado)
    this.stats = { spotted: 0, caught: 0, emerged: 0, lost: 0, strikes: 0, hits: 0 };
    this._circ = circ; // (para as flags de desenvolvimento)
  }

  /** Todos os Safeguards em cena (para o sensor e os sons). */
  *all() {
    for (const e of this.byTerritory.values()) if (!e.dead) yield e;
    for (const e of this.hunters) if (!e.dead) yield e;
  }

  /** O jogador fez barulho (app/safeguards.js): quem estiver a menos de r m ouve. */
  hear(x, y, z, r) {
    this.noise = { x, y, z, r, t: this.time };
  }

  update(time, dt, g, origin) {
    this.time = time;
    (this.lastG ??= new THREE.Vector3()).copy(g); // (onCut: quem pode ser visto não some)
    if (!this.enabled) {
      if (this.byTerritory.size || this.hunters.size) this.clear();
      return;
    }
    // quais territórios existem em volta (a cada 1 s)
    if ((this.scanT -= dt) <= 0) {
      this.scanT = 1;
      const want = new Set();
      for (let dx = -SCAN; dx <= SCAN; dx += 300) {
        for (let dz = -SCAN; dz <= SCAN; dz += 300) {
          for (const dy of [-PATROL.slab, 0, PATROL.slab]) want.add(territoryAt(this.field, g.x + dx, g.y + dy, g.z + dz).id + '|' + (g.x + dx) + ',' + (g.y + dy) + ',' + (g.z + dz));
        }
      }
      const ids = new Map();
      for (const k of want) {
        const [id, p] = k.split('|');
        if (!ids.has(id)) ids.set(id, p.split(',').map(Number));
      }
      for (const [id, p] of ids) {
        if (!this.byTerritory.has(id) && !this.none.has(id) && !this.pending.has(id) && !this.queue.some((q) => q.id === id)) this.queue.push({ id, p });
      }
      for (const [id, e] of this.byTerritory) {
        const d = e.feet.distanceTo(g);
        if (e.sg.state === 'patrol' && ((!ids.has(id) && d > DROP) || (e.sg.stale && d > STALE_DROP))) {
          this.ents.remove(e.id);
          this.byTerritory.delete(id);
        }
      }
    }
    // um circuito novo por quadro — calculado num worker (a busca no grafo leva até ~100 ms)
    const q = this.queue.shift();
    if (q) {
      const t = territoryAt(this.field, q.p[0], q.p[1], q.p[2]);
      this.pending.add(q.id);
      this.world.circuitAsync(t, 0, (c) => {
        this.pending.delete(q.id);
        if (!this.enabled) return;
        if (!c) {
          this.none.add(q.id);
          if (this.none.size > 2000) this.none.clear();
        } else if (!this.byTerritory.has(c.id)) this._spawnPatrol(c);
      });
    }
    // os caçadores que saíram das paredes: a placa abrindo/fechando
    for (const e of this.hunters) this._panel(e, dt, origin);
  }

  /** Um corte do emissor: as rondas de circuito cortado saem (o próximo varrer refaz o circuito) —
   *  menos o corpo de quem morreu (fica onde caiu) e quem pode ser visto: nada some na frente do
   *  jogador (fica marcado e sai quando estiver longe — STALE_DROP). */
  onCut() {
    const F = this.field;
    for (const [id, e] of this.byTerritory) {
      if (e.dead || e.sg.state !== 'patrol' || !F.cutOnPath(e.sg.c.pts)) continue;
      if (e.feet.distanceTo(this.lastG ?? e.feet) < STALE_DROP) {
        e.sg.stale = true;
        continue;
      }
      this.ents.remove(e.id);
      this.byTerritory.delete(id);
    }
    this.scanT = 0;
  }

  _spawnPatrol(c) {
    const s = c.phase + this.clock() * PATROL.speed;
    const p = circuitAt(c, s);
    const p0 = c.pts[0];
    // (o nível antes de nascer: o corpo é o do nível — world/kits.js)
    const level = levelAt(this.field, p0.x, p0.y, p0.z, 0);
    const e = this.ents.spawn({ id: `sg:${c.id}`, kind: 'safeguard', feet: p, yaw: p.yaw, persist: false, brain: this, level });
    e.level = level;
    e.walker.speedScale = PATROL_SCALE;
    e.sg = { c, s, state: 'patrol', unseen: 0, lastSeen: null, searchT: 0, percT: Math.random() * 0.2, sees: false, stepAcc: 0, stuckT: 0 };
    this.byTerritory.set(c.id, e);
  }

  // ── o cérebro (world/entities.js chama think a cada quadro) ──────────────

  think(e, dt, g, origin, time) {
    const S = e.sg;
    if ((S.percT -= dt) <= 0) {
      S.percT = 0.2;
      this._perceive(e, g, origin, time);
    }
    switch (S.state) {
      case 'patrol':
        this._patrol(e, dt, origin, time);
        break;
      case 'hunt':
        this._hunt(e, dt, g, origin, time);
        break;
      case 'search':
        this._search(e, dt, origin, time);
        break;
      case 'return':
        this._return(e, dt, g, origin, time);
        break;
      case 'grab':
        e.speed = 0; // segurando quem pegou (app/wake.js solta)
        break;
      case 'strike':
        this._strike(e, dt, g);
        break;
      case 'summon':
        // chamado pelo alerta: vem pelo grafo; perto, procura onde foi
        if (e.tier === 'far') {
          this.ents._stepFar(e, dt);
          if (e.state !== 'walk') {
            S.state = 'search';
            S.searchT = 0;
          }
        } else {
          S.state = 'search';
          S.searchT = 0;
        }
        break;
      case 'emerge':
      case 'enter':
        break; // a placa conduz (_panel)
      default:
        break;
    }
    // passos (só os que dá para ouvir)
    S.stepAcc += e.speed * dt;
    if (S.stepAcc > STRIDE / 2) {
      S.stepAcc = 0;
      if (e.feet.distanceTo(g) < 160) this.bus?.emit('safeguard:step', { x: e.feet.x, y: e.feet.y, z: e.feet.z, hunting: S.state === 'hunt' });
    }
  }

  _patrol(e, dt, origin, time) {
    const S = e.sg;
    if (!S.c) return; // um caçador não tem ronda: volta à placa
    S.s += PATROL.speed * dt;
    if (e.tier === 'far') {
      const p = circuitAt(S.c, S.s);
      e.feet.set(p.x, p.y, p.z);
      e.yaw = p.yaw;
      e.speed = PATROL.speed;
      return;
    }
    e.walker.speedScale = PATROL_SCALE;
    const tgt = circuitAt(S.c, S.s + 2.5);
    const hd = this.ents.walkToward(e, tgt, dt, origin, time);
    // o relógio espera o corpo (uma curva, um desvio): nada de adiantar o ponto sem ele
    if (hd > 5) S.s -= PATROL.speed * dt;
    // enroscou de vez (e ninguém está olhando de perto): volta ao circuito onde deveria estar
    if (hd > 5 && e.speed < 0.3) S.stuckT += dt;
    else S.stuckT = 0;
    if (S.stuckT > 8) {
      S.stuckT = 0;
      const p = circuitAt(S.c, S.s);
      e.feet.set(p.x, p.y, p.z);
      this.ents.toNear(e, origin);
    }
  }

  _hunt(e, dt, g, origin, time) {
    const S = e.sg;
    if (e.tier === 'far') {
      // o jogador fugiu para longe: perdeu
      this._lose(e);
      return;
    }
    // caçando vida de silício: ela é o alvo
    if (S.prey) {
      if (!this.world.npcs?.wanderers || ![...this.world.npcs.silicon()].includes(S.prey)) {
        S.prey = null;
        this._lose(e);
        return;
      }
      e.walker.speedScale = HUNT_SCALE;
      const hp = this.ents.walkToward(e, S.prey.feet, dt, origin, time);
      if (hp < 1.2 && Math.abs(S.prey.feet.y - e.feet.y) < 1.8) {
        this.world.npcs.destroy(S.prey);
        S.prey = null;
        this._lose(e);
      } else if (!S.sees && (S.unseen += dt) > 4) {
        S.prey = null;
        this._lose(e);
      }
      return;
    }
    const feet = _a.set(g.x, g.y - 1.7, g.z);
    this._accelerate(e, dt);
    if (S.unseen < 0) S.lastSeen.copy(feet); // recém-saído da parede: ainda sabe onde você está
    // depois de um golpe, espera antes de vir de novo (a chance de fugir ferido)
    if (S.waitT > 0) {
      S.waitT -= dt;
      S.huntV = undefined; // (parado: o arranque recomeça de baixo)
      e.speed = 0;
      e.walker.vel.x = 0;
      e.walker.vel.z = 0;
      this._face(e, feet);
      if (S.sees && S.lastSeen) S.lastSeen.copy(feet);
      return;
    }
    const target = S.sees ? feet : S.lastSeen;
    const hd = this.ents.walkToward(e, target, dt, origin, time);
    // vê, mas não chega (outro nível, uma beirada no meio): desiste depois de um tempo —
    // menos esperando/andando num elevador ou subindo uma escada atrás de você (world/entities.js)
    if (e.vert) S.stuckT = 0;
    else if (hd < S.bestD - 0.5) {
      S.bestD = hd;
      S.stuckT = 0;
    } else if ((S.stuckT += dt) > 7) {
      this._lose(e);
      return;
    }
    // o golpe (com a vida): a ~1,5 m, para e golpeia
    const hdist = Math.hypot(feet.x - e.feet.x, feet.z - e.feet.z);
    if (S.sees && hdist < STRIKE.reach && Math.abs(feet.y - e.feet.y) < 1.8 && this.strikes?.()) {
      this.stats.strikes++;
      S.state = 'strike';
      S.strikeT = 0;
      S.struck = false;
      this.bus?.emit('safeguard:strike', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
      return;
    }
    // o toque
    if (S.sees && hdist < CATCH && Math.abs(feet.y - e.feet.y) < 1.8) {
      this.stats.caught++;
      for (const o of this.all()) if (o.sg.state === 'hunt' || o.sg.state === 'search') this._lose(o);
      this.onCatch?.(e);
      return;
    }
    if (!S.sees && (S.unseen += dt) > LOST_AFTER) {
      S.state = 'search';
      S.searchT = 0;
    }
  }

  /** O arranque (M1–M2): de v0 até a terminal com a aceleração do nível; curvas custam. */
  _accelerate(e, dt) {
    accelerate(e, e.sg, MOVE[e.level ?? 'low'], dt);
  }

  /** Vira o corpo para o ponto (GLOBAL). */
  _face(e, p) {
    const want = Math.atan2(-(p.x - e.feet.x), -(p.z - e.feet.z));
    let d = want - e.yaw;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    e.yaw += d * 0.35;
  }

  /** O golpe: preparar (gira e recolhe o braço) → o braço vem → recolhe → espera. */
  _strike(e, dt, g) {
    const S = e.sg;
    S.strikeT += dt;
    const t = S.strikeT;
    e.speed = 0;
    e.walker.vel.x = 0;
    e.walker.vel.z = 0;
    const feet = _b.set(g.x, g.y - 1.7, g.z);
    if (t < STRIKE.windup) this._face(e, feet);
    const w = Math.min(1, t / STRIKE.windup);
    const sw = Math.max(0, Math.min(1, (t - STRIKE.windup) / STRIKE.swing));
    const back = Math.max(0, Math.min(1, (t - STRIKE.windup - STRIKE.swing) / STRIKE.recover));
    e.strikePose = { w: w * (1 - back), s: sw * (1 - back) };
    if (!S.struck && t >= STRIKE.windup + STRIKE.swing * 0.6) {
      S.struck = true;
      const hit = Math.hypot(feet.x - e.feet.x, feet.z - e.feet.z) < STRIKE.hit && Math.abs(feet.y - e.feet.y) < 2;
      if (hit) this.stats.hits++;
      this.onStrike?.(e, hit);
      if (S.state !== 'strike') return; // (a vida zerou: a captura levou ele)
    }
    if (t >= STRIKE.windup + STRIKE.swing + STRIKE.recover) {
      e.strikePose = null;
      S.state = 'hunt';
      S.lastSeen = feet.clone(); // (arremessado longe da vista: ele vai ver onde você caiu)
      S.waitT = STRIKE.waitMin + Math.random() * (STRIKE.waitMax - STRIKE.waitMin);
      S.huntV = undefined; // (o arranque recomeça de baixo)
      S.unseen = 0;
      S.stuckT = 0;
      S.bestD = Infinity;
    }
  }

  _search(e, dt, origin, time) {
    const S = e.sg;
    if (e.tier === 'far') return this._lose(e);
    e.walker.speedScale = PATROL_SCALE * 1.6;
    const hd = this.ents.walkToward(e, S.lastSeen, dt, origin, time);
    // (esperando o elevador, ou na escada, não está "parado procurando")
    if (!e.vert && (hd < 1.5 || e.speed < 0.2)) {
      // chegou (ou não passa): olha em volta
      S.searchT += dt;
      e.yaw += dt * 1.3 * Math.sin(S.searchT * 0.9);
    }
    if (S.searchT > SEARCH_TIME) this._lose(e);
  }

  _lose(e) {
    const S = e.sg;
    if (S.state === 'hunt' || S.state === 'search') {
      this.stats.lost++;
      this.bus?.emit('safeguard:lost', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
    }
    S.state = 'return';
    e.strikePose = null;
    S.waitT = 0;
    S.sees = false;
    S.unseen = 0;
    S.stuckT = 0;
    S.prey = null;
    e.farSpeed = undefined;
  }

  _return(e, dt, g, origin, time) {
    const S = e.sg;
    if (!S.c) {
      // caçador: de volta à placa de onde saiu, e para dentro dela
      if (e.tier === 'far') return this._removeHunter(e);
      e.walker.speedScale = PATROL_SCALE * 1.4;
      const hd = this.ents.walkToward(e, S.panel.front, dt, origin, time);
      if (hd < 0.8 || (e.speed < 0.2 && (S.stuckT += dt) > 6)) {
        S.state = 'enter';
        S.panel.t = 0;
      }
      return;
    }
    const n = circuitNearest(S.c, e.feet.x, e.feet.y, e.feet.z);
    if (e.tier === 'far' || n.d < 2) {
      S.s = n.s;
      S.state = 'patrol';
      return;
    }
    e.walker.speedScale = PATROL_SCALE;
    const p = circuitAt(S.c, n.s + 2);
    this.ents.walkToward(e, p, dt, origin, time);
    // não acha o caminho de volta (e o jogador não está perto para ver): volta ao circuito
    if (e.speed < 0.3 && (S.stuckT += dt) > 8 && e.feet.distanceTo(g) > 40) {
      const q = circuitAt(S.c, n.s);
      e.feet.set(q.x, q.y, q.z);
      this.ents.toNear(e, origin);
      S.s = n.s;
      S.state = 'patrol';
    }
  }

  /** Vê ou ouve o jogador? (5 Hz) */
  _perceive(e, g, origin, time) {
    const S = e.sg;
    if (S.state === 'strike') return; // (golpeando: nada o interrompe)
    S.sees = false;
    if (S.state === 'emerge' || S.state === 'enter' || e.tier !== 'near') return;
    // a vida de silício revelada vem antes de tudo (a terceira força)
    for (const si of this.world.npcs?.silicon() ?? []) {
      const d2 = si.feet.distanceTo(e.feet);
      if (d2 > 60 || (S.prey && S.prey !== si)) continue;
      const eyeS = new THREE.Vector3(e.feet.x, e.feet.y + 2.1, e.feet.z);
      const tgt = new THREE.Vector3(si.feet.x, si.feet.y + 1.4, si.feet.z);
      if (!this._clear(eyeS, tgt, eyeS.distanceTo(tgt), origin)) continue;
      if (!S.prey) {
        this.bus?.emit('safeguard:spot', { x: e.feet.x, y: e.feet.y, z: e.feet.z, prey: true });
        this.stats.spotted++;
      }
      S.prey = si;
      S.state = 'hunt';
      S.sees = true;
      S.unseen = 0;
      return;
    }
    if (S.prey) return;
    const sn = this.senses?.(); // null: desmaiado, voando — ninguém percebe
    if (!sn) return;
    const eye = _a.set(e.feet.x, e.feet.y + 2.1, e.feet.z);
    const d = eye.distanceTo(g);
    if (d > SIGHT_MAX) return;
    // quanto se vê: o escuro esconde, a luz entrega
    const lit = this.field.sectorLight(g.x, g.y, g.z, time);
    let range = 9 + 26 * lit + (sn.lantern ? 60 : 0);
    range *= (S.state === 'patrol' ? 0.6 : 1.4) * (1 + 1.5 * (sn.alertAt?.(e.feet.x, e.feet.y, e.feet.z) ?? 0));
    // o cone: de costas vê bem menos
    _d.set(g.x - eye.x, 0, g.z - eye.z).normalize();
    const facing = -Math.sin(e.yaw) * _d.x - Math.cos(e.yaw) * _d.z;
    if (facing < 0.5) range *= 0.35;
    let sees = d < Math.min(range, SIGHT_MAX) && this._clear(eye, g, d, origin);
    // ouvir: correr perto, e os barulhos (quedas, alavancas, leituras)
    let heard = null;
    if (sn.running && d < (S.state === 'patrol' ? 14 : 22)) heard = { x: g.x, y: g.y - 1.7, z: g.z };
    const nz = this.noise;
    if (!heard && nz && this.time - nz.t < 0.5 && Math.hypot(nz.x - eye.x, nz.y - eye.y, nz.z - eye.z) < nz.r) heard = { x: nz.x, y: nz.y, z: nz.z };
    if (sees) {
      S.sees = true;
      S.unseen = 0;
      S.lastSeen = new THREE.Vector3(g.x, g.y - 1.7, g.z);
      if (S.state !== 'hunt') {
        S.state = 'hunt';
        S.huntV = undefined; // o arranque começa de baixo
        S.bestD = Infinity;
        S.stuckT = 0;
        this.stats.spotted++;
        this.bus?.emit('safeguard:spot', { x: e.feet.x, y: e.feet.y, z: e.feet.z });
      }
    } else if (heard && (S.state === 'patrol' || S.state === 'return' || S.state === 'search')) {
      // ouviu: vai ver o que foi
      S.lastSeen = new THREE.Vector3(heard.x, heard.y, heard.z);
      S.state = 'search';
      S.searchT = 0;
    }
  }

  /** Linha de visão livre entre dois pontos GLOBAIS? */
  _clear(a, b, d, origin) {
    const col = this.los;
    _b.copy(a).add(b).multiplyScalar(0.5).sub(origin);
    col.refresh(_b, d / 2 + 3);
    if (!col.ready && !col.meshes.length) return false;
    const from = _b.copy(a).sub(origin);
    _d.copy(b).sub(a).normalize();
    const hit = col.ray(from, _d, d - 0.6);
    return !hit;
  }

  // ── o alerta: chamar quem está de ronda perto ────────────────────────────

  /** Os `n` Safeguards de ronda mais perto (até 500 m) vêm, pelo grafo, até g. Devolve quantos vieram. */
  summon(g, n = 1) {
    const cands = [...this.byTerritory.values()].filter((e) => e.sg.state === 'patrol' && e.feet.distanceTo(g) < 500).sort((a, b) => a.feet.distanceTo(g) - b.feet.distanceTo(g));
    let made = 0;
    for (const e of cands) {
      if (made >= n) break;
      e.goal = { x: g.x, y: g.y - 1.7, z: g.z };
      e.path = null;
      e.avoid.clear();
      if (!this.ents._plan(e)) continue;
      e.farSpeed = 3.5;
      e.sg.state = 'summon';
      e.sg.lastSeen = new THREE.Vector3(g.x, g.y - 1.7, g.z);
      made++;
    }
    return made;
  }

  // ── surgimento das paredes (o alerta) ────────────────────────────────────

  /** Uma placa de parede perto do jogador se abre e `n` caçadores saem. */
  emerge(g, origin, n = 1) {
    let made = 0;
    for (let k = 0; k < n && this.hunters.size < MAX_HUNTERS; k++) {
      const spot = this._wallSpot(g, origin, k);
      if (!spot) break;
      this._spawnHunter(spot, g);
      made++;
    }
    return made;
  }

  /** Um ponto de parede (vertical, com chão rente) a 14–60 m do jogador, fora da mão. */
  _wallSpot(g, origin, salt) {
    const col = this.los;
    const c = _a.copy(g).sub(origin);
    // (uma busca só, rara: pode montar as árvores de colisão de tudo em volta de uma vez)
    col.buildsPerFrame = 400;
    col.refresh(c, 64);
    col.buildsPerFrame = 1;
    const floorY = g.y - 1.7;
    const base = Math.random() * Math.PI * 2 + salt * 1.3;
    const why = (this.wallWhy = { meshes: col.meshes.length, miss: 0, near: 0, flat: 0, nofloor: 0 });
    for (let i = 0; i < 24; i++) {
      const ang = base + i * 0.9;
      const dir = new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
      const o = new THREE.Vector3(c.x, floorY - origin.y + 1.3, c.z);
      const hit = col.ray(o, dir, 60);
      if (!hit || !hit.face) {
        why.miss++;
        continue;
      }
      if (hit.distance < 14) {
        why.near++;
        continue;
      }
      if (Math.abs(hit.face.normal.y) > 0.25) {
        why.flat++;
        continue;
      }
      const nrm = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      nrm.y = 0;
      nrm.normalize();
      if (nrm.dot(dir) > 0) nrm.negate(); // a face virada para o jogador
      // chão rente ao pé da parede, do lado de cá
      const front = hit.point.clone().addScaledVector(nrm, 0.9);
      const fh = col.ray(front.clone().add(UP), DOWN, 2.6);
      if (!fh || !fh.face || fh.face.normal.y < 0.55) {
        why.nofloor++;
        continue;
      }
      const wall = hit.point.clone().add(origin);
      wall.y = fh.point.y + origin.y;
      return { wall, nrm, front: front.add(origin).setY(wall.y) };
    }
    return null;
  }

  _spawnHunter(spot, g) {
    // a placa: um vão escuro que se abre na parede (duas folhas correndo para os lados)
    const panel = new THREE.Mesh(new THREE.BoxGeometry(1.5, 2.9, 0.08), this.materials.door);
    panel.userData.noCollide = true;
    this.group.add(panel);
    const id = `sgh:${Math.round(this.time * 1000)}:${this.hunters.size}`;
    const level = levelAt(this.field, spot.wall.x, spot.wall.y, spot.wall.z, 1);
    const e = this.ents.spawn({ id, kind: 'safeguard', feet: spot.wall.clone().addScaledVector(spot.nrm, -0.2), yaw: Math.atan2(spot.nrm.x, spot.nrm.z) + Math.PI, persist: false, brain: this, level });
    e.level = level;
    e.sg = {
      c: null, state: 'emerge', unseen: 0, lastSeen: new THREE.Vector3(g.x, g.y - 1.7, g.z), searchT: 0, percT: 1.8, sees: false, stepAcc: 0, stuckT: 0,
      panel: { mesh: panel, wall: spot.wall, nrm: spot.nrm, front: spot.front, t: 0 },
    };
    this.hunters.add(e);
    this.stats.emerged++;
    this.bus?.emit('safeguard:emerge', { x: spot.wall.x, y: spot.wall.y, z: spot.wall.z });
  }

  /** A placa de um caçador: abre (ele sai), fica aberta, fecha (ele entrou). */
  _panel(e, dt, origin) {
    const S = e.sg;
    const P = S.panel;
    const m = P.mesh;
    const yaw = Math.atan2(P.nrm.x, P.nrm.z);
    m.position.set(P.wall.x - origin.x + P.nrm.x * 0.03, P.wall.y + 1.45 - origin.y, P.wall.z - origin.z + P.nrm.z * 0.03);
    m.rotation.y = yaw;
    if (S.state === 'emerge') {
      P.t += dt;
      // 0–0,9 s a placa se abre; 0,6–1,8 s ele sai de dentro, de frente
      m.scale.x = Math.min(1, Math.max(0.02, P.t / 0.9));
      const k = Math.min(1, Math.max(0, (P.t - 0.6) / 1.2));
      e.feet.copy(P.wall).addScaledVector(P.nrm, -0.2 + 1.1 * k);
      e.yaw = yaw + Math.PI;
      e.speed = k > 0 && k < 1 ? 1.2 : 0;
      if (P.t > 1.8) {
        this.ents.toNear(e, origin);
        S.state = 'hunt';
        S.bestD = Infinity;
        S.stuckT = 0;
        S.sees = true; // no primeiro instante ele sabe onde você está
        S.unseen = -3.5; // …e por uns segundos continua indo para lá
      }
    } else if (S.state === 'enter') {
      P.t += dt;
      const k = Math.min(1, P.t / 1.2);
      e.feet.copy(P.wall).addScaledVector(P.nrm, 0.9 - 1.1 * k);
      e.yaw = yaw;
      e.speed = 1.2;
      m.scale.x = Math.max(0.02, 1 - Math.max(0, P.t - 1.2) / 0.9);
      if (P.t > 2.1) this._removeHunter(e);
    } else m.scale.x = 1;
  }

  _removeHunter(e) {
    const P = e.sg.panel;
    if (P) {
      this.group.remove(P.mesh);
      P.mesh.geometry.dispose();
    }
    this.hunters.delete(e);
    this.ents.remove(e.id);
  }

  clear() {
    for (const e of this.byTerritory.values()) this.ents.remove(e.id);
    this.byTerritory.clear();
    for (const e of [...this.hunters]) this._removeHunter(e);
    this.queue.length = 0;
  }

  rebase() {} // posições globais

  dispose() {
    this.clear();
  }
}
