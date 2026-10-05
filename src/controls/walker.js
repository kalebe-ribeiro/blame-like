// ─────────────────────────────────────────────────────────────────────────────
//  Controlador de caminhada (modo andar).
//
//  Corpo = cilindro vertical (raio + altura dos olhos), resolvido com raios:
//    • chão: raio para baixo a partir de "pé + altura de degrau" → sobe degraus
//      e rampas, gruda no chão ao descer, aceita inclinação até ~55°
//    • paredes: raios horizontais na direção do movimento (3 alturas) com
//      deslizamento ao longo da parede, + empurrão para fora em 8 direções
//    • teto: raio para cima ao pular
//
//    • escadas de marinheiro: encostado numa e segurando W, sobe (S desce);
//      A/D solta para o lado — e o corpo encaixa no patamar do nível mais perto
//    • elevadores e vagões: o que você pisa pode se mover (userData.dx/dy/dz) e
//      te leva junto; ao pular de um vagão, o corpo conserva a velocidade dele
//    • pouso pesado: a câmera afunda (dip) proporcionalmente ao impacto
//    • QUINAS: uma parede à frente com um topo plano e largo logo acima, e
//      espaço para ficar de pé lá em cima. Pulando de frente para ela: até
//      ~1,3 m o corpo passa por cima (vault); mais alto, até onde o braço
//      alcança (~2,25 m), agarra e sobe. No ar (pulando ou caindo), as mãos
//      pegam uma borda que passe por elas — também atrás e dos lados (caiu da
//      ponte: segura o piso dela). Pendurado: frente/pulo sobe, trás solta,
//      lados andam pela borda. Carregando uma carga: só o vault.
//      Corrimãos e quinas finas não contam (o topo tem de continuar 0,6 m).
//
//  Tudo escala com a escala do observador (portais de tamanhos diferentes).
//  O mesmo controlador move os corpos dos seres (world/entities.js): a mesma física.
//  Se o mundo ao redor ainda não foi gerado, o corpo "paira" até ficar pronto.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const WALKABLE_NY = 0.55; // normal.y mínima de um chão (≈ 57°)
const LEDGE = {
  vault: 1.3, // m: até aqui passa por cima direto
  reach: 2.25, // m: o mais alto que as mãos alcançam de pé
  hangBelow: 0.02, // m: os olhos ficam rente à quina, pendurado (o queixo na borda)
  shimmy: 0.9, // m/s pela borda
  maxFall: 14, // m/s: caindo mais rápido que isso, as mãos não seguram
  leapSide: 2.4, // m: pendurado, o salto de lado (pulo + lado) alcança uma borda até aqui
  leapBack: 3.2, // m: pendurado, o salto para trás (pulo + trás) alcança a parede em frente até aqui
  leapT: 0.45, // s: o salto entre bordas
  dropEdge: 2.5, // m: andando de costas para uma beirada com queda maior que isto, o corpo desce e se pendura
  lowerT: 0.6, // s: descer da beirada até ficar pendurado
};
/** O rolamento (o cofre, Mobilidade §3): pulo apertado pouco antes de tocar o chão, caindo. */
const ROLL = {
  window: 0.3, // s: o pulo até isto antes do toque vale
  min: 9, // m/s de impacto (~2,7 m de queda): abaixo disso não há o que rolar
  absorb: 8, // m: a energia de 8 m de queda vai para o rolamento (nada até ~18 m; 30 m: 31% em vez de 52%)
  maxV: 38, // m/s: o impacto letal (app/health.js FALL.lethal) — acima disso, rolar não salva
  dur: 0.65, // s rolando
  speed: 4.5, // m/s para a frente, rolando
};
const G_WALK = 15; // a gravidade daqui (vel.y −= 15·s·dt)
const ease = (k) => k * k * (3 - 2 * k);

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _move = new THREE.Vector3();
const _n = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _f = new THREE.Vector3();
const _b1 = new THREE.Vector3();
const _b2 = new THREE.Vector3();
const _b3 = new THREE.Vector3();

export class Walker {
  constructor(collision) {
    this.jumpScale = 1; // (uma carga pesada pula menos — app/people.js)
    this.col = collision;
    this.vel = new THREE.Vector3();
    this.feet = new THREE.Vector3();
    this.grounded = false;
    this.airTime = 0;
    this.fallStartY = 0;
    this.bobPhase = 0;
    this.bob = 0;
    this.onStep = null; // (intensidade) — passos
    this.onLand = null; // (velocidade de impacto)
    this.onClimbStep = null; // degrau de escada
    this.eye = 1.7;
    this.climbing = false;
    this.groundObj = null; // o que está sob os pés (pode ser um elevador)
    this._climbAcc = 0;
    this.dip = 0; // afundamento da câmera após um pouso pesado (m)
    this.bobScale = 1; // 0 = sem balanço da cabeça (conforto)
    this.speedScale = 1; // < 1 dentro d'água (setores inundados)
    this.dipScale = 1; // 0 = sem afundamento no pouso
    this.carrier = new THREE.Vector3(); // velocidade herdada do chão móvel (vagão) ao sair dele
    /** Um empurrão de fora (o coice do emissor — app/beam.js): velocidade horizontal à parte do
     *  passo, que as paredes param e o atrito consome (no chão rápido, no ar devagar). */
    this.shove = new THREE.Vector3();
    /** @type {((speed: number) => void)|null} bateu numa parede no empurrão (m/s contra ela) */
    this.onSlam = null;
    /** Arremessado por um hostil (app/safeguards.js — o golpe): o controle sai até pousar e
     *  levantar; o choque contra um obstáculo tira vida só assim (app/health.js). */
    this.thrown = false;
    this.downT = 0; // s caído depois de pousar arremessado
    this.thrownSlam = 0; // m/s do choque contra um obstáculo no arremesso (0 = não bateu)
    this.canClimb = true; // escadas de marinheiro (os corpos dos seres de teste não sobem)
    this.canGrab = true; // agarrar quinas (os seres não: world/entities.js; sem braços também não — app/beam.js)
    this.canClimb = true; // subir escadas de marinheiro (sem braços, não)
    this.ledge = null; // pendurado: { topY, edge, nrm, h }
    this.climb = null; // subindo: { t, dur, from, mid, to, h }
    this.hangT = 0;
    this.shimmyT = 0;
    this.grabCooldown = 0;
    this.turnTo = null; // yaw para onde o corpo se vira ao agarrar (controls/noclip.js aplica)
    this.backFree = false; // pendurado: soltar pede apertar "trás" de novo
    this.dropping = false; // soltou uma borda e cai rente à parede
    this.ignoreAbove = Infinity; // soltou uma borda: as mãos só pegam as de baixo dela (até pousar)
    this.onGrab = null; // () — as mãos pegaram a quina
    this.onMantle = null; // (altura) — começou a subir
    this.onLower = null; // () — começou a descer da beirada para se pendurar
    this.onLeap = null; // () — saltou de uma borda para outra
    this.rollAt = -Infinity; // (tempo) o pulo apertado caindo — o rolamento ao tocar o chão
    this.rollT = 0; // s de rolamento que faltam
    this.rollPitch = 0; // rad: a cabeça mergulhando no rolamento (controls/noclip.js soma ao olhar)
    this.jumpLatch = false; // o pulo do rolamento ainda segurado: não vira um salto
    this.onRoll = null; // (impacto antes, depois) — rolou
    this.cornerT = 0; // s até poder virar outro canto pendurado
    this._s = 1;
  }

  /** O arremesso de um golpe: velocidade horizontal (hx, hz) e para cima (up), em m/s. */
  throwBody(hx, hz, up) {
    this.ledge = null;
    this.climb = null;
    this.climbing = false;
    this.shove.set(hx, 0, hz);
    this.vel.set(0, up, 0);
    this.grounded = false;
    this.thrown = true;
    this.downT = 0;
    this.thrownSlam = 0;
  }

  /** Posiciona o corpo a partir da câmera (ao entrar no modo andar). */
  syncFromCamera(camera, scale, velocity) {
    this.feet.copy(camera.position).y -= this.eye * scale;
    this.vel.copy(velocity ?? new THREE.Vector3());
    this.shove?.set(0, 0, 0);
    this.thrown = false;
    this.downT = 0;
    this.grounded = false;
    this.airTime = 0;
    this.fallStartY = this.feet.y;
    this.carrier.set(0, 0, 0);
    // posto noutro lugar (transporte, despertar, voo): nada de agarrão, rolamento ou queda de antes
    this.ledge = null;
    this.climb = null;
    this.rollT = 0;
    this.rollPitch = 0;
    this.dropping = false;
    this.ignoreAbove = Infinity;
  }

  /**
   * @param {object} input { f, r, jump, run }  (f/r ∈ {-1,0,1})
   * @returns {boolean} false se o mundo ao redor não estava pronto (pairando)
   */
  step(dt, camera, input, yaw, s, time) {
    // arremessado: o corpo vai, sem comando; pousou, fica caído ~1 s e se levanta
    if (this.thrown) {
      input = { f: 0, r: 0, run: false, jump: false };
      if (this.downT > 0) {
        this.downT -= dt;
        // os olhos rente ao chão; ao acabar, o afundamento solta e o corpo se levanta
        this.dip = Math.max(this.dip, (this.eye - 0.5) * s);
        if (this.downT <= 0) this.thrown = false;
      }
    }
    const eye = this.eye * s;
    const radius = 0.38 * s;
    const stepH = 0.55 * s;
    const col = this.col;
    this._s = s;

    this.feet.copy(camera.position).y -= eye + this.bob - this.dip;
    this.dip *= Math.exp(-4.5 * dt); // os joelhos voltam devagar
    // o chão se moveu (elevador, vagão): vamos junto
    const gd = this.grounded ? this.groundObj?.userData : null;
    if (gd?.dy) this.feet.y += gd.dy;
    if (gd?.dx || gd?.dz) {
      this.feet.x += gd.dx;
      this.feet.z += gd.dz;
      if (dt > 0) this.carrier.set(gd.dx / dt, 0, gd.dz / dt);
    } else if (this.grounded) {
      this.carrier.set(0, 0, 0);
    }
    col.refresh(this.feet, 30 * s);
    if (!col.ready) {
      this.vel.multiplyScalar(Math.exp(-4 * dt));
      this.feet.addScaledVector(this.vel, dt);
      this._apply(camera, eye);
      return false;
    }

    // ── intenção de movimento (no plano) ──
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    // rolando: o corpo vai para a frente sozinho; a cabeça mergulha e volta
    if (this.rollT > 0) {
      this.rollT = Math.max(0, this.rollT - dt);
      const k = 1 - this.rollT / ROLL.dur;
      this.rollPitch = -Math.sin(k * Math.PI) * 0.9;
      input = { ...input, f: 1, r: 0, run: false, jump: false };
    } else this.rollPitch = 0;
    if (!input.jump) this.jumpLatch = false;
    // soltou uma borda: cai rente à parede (segurar "trás" não o afasta das bordas de baixo)
    if (this.dropping) {
      if (this.grounded || this.ledge || this.climb) this.dropping = false;
      else input = { ...input, f: 0, r: 0, run: false };
    }
    if (this.jumpLatch) input = { ...input, jump: false };
    // caindo rápido, o pulo APERTADO (não segurado desde antes): rola se tocar o chão logo
    if (!this.grounded && input.jump && !this._jumpWas && this.vel.y < -ROLL.min * s * 0.7) this.rollAt = time;
    this._jumpWas = !!input.jump;

    // ── quinas: subindo, pendurado, ou pegando uma agora ──
    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    if (this.climb) return this._mantleStep(dt, camera, eye);
    if (this.ledge) return this._hangStep(dt, camera, input, sin, cos, s, eye);
    if (this.canGrab && !this.thrown && this._tryLedge(input, sin, cos, s, eye)) {
      this._apply(camera, eye);
      return true;
    }
    // andando de costas para fora de uma beirada funda: desce e se pendura nela (o cofre, Mobilidade §2)
    if (this.canGrab && !this.thrown && this.grounded && input.f < 0 && !input.run && !input.burden && this.grabCooldown <= 0) {
      const l = this._edgeBehind(sin, cos, s, radius, stepH);
      if (l) {
        this._startLower(l, s, eye);
        this._apply(camera, eye);
        return true;
      }
    }

    // ── escada à frente? ──
    _d.set(-sin, 0, -cos);
    _o.copy(this.feet).y += eye * 0.6;
    let ladder = col.ray(_o, _d, 0.95 * s);
    // já na escada, o raio pode bater numa fixação (a cada 6–12 m, um pouco à frente dos degraus):
    // confere um palmo abaixo antes de soltar
    if (this.climbing && ladder && ladder.object.userData.mat !== 'rungs') {
      _o.y -= 0.35 * s;
      const below = col.ray(_o, _d, 0.95 * s);
      if (below?.object.userData.mat === 'rungs') ladder = below;
      _o.y += 0.35 * s;
    }
    const onLadder = this.canClimb && !!ladder && ladder.object.userData.mat === 'rungs';
    if (onLadder && this.canClimb && (input.f !== 0 || this.climbing) && !(this.grounded && input.f < 0)) {
      if (!this.climbing) this.climbing = true;
      return this._climb(dt, camera, input, sin, cos, s, eye, ladder);
    }
    if (this.climbing) {
      // saiu da escada: pequeno empurrão para a frente se estava subindo
      this.climbing = false;
      if (input.f > 0) this.vel.set(-sin * 2 * s, 1.5 * s, -cos * 2 * s);
    }
    _d.set(-sin * input.f + cos * input.r, 0, -cos * input.f - sin * input.r);
    if (_d.lengthSq() > 1) _d.normalize();
    const speed = (this.rollT > 0 ? ROLL.speed : input.run ? 8.5 : 4.2) * (input.slow ? 0.6 : 1) * s * this.speedScale;
    const control = this.grounded ? 12 : 2.2;
    const k = Math.min(1, control * dt);
    this.vel.x += (_d.x * speed - this.vel.x) * k;
    this.vel.z += (_d.z * speed - this.vel.z) * k;

    // ── gravidade e pulo ──
    if (this.grounded && input.jump) {
      this.vel.y = 5.4 * Math.sqrt(s) * (this.jumpScale ?? 1);
      this.grounded = false;
    }
    this.vel.y = Math.max(this.vel.y - 15 * s * dt, -60 * s);

    // ── horizontal com paredes ──
    // no ar, conserva a velocidade do vagão de onde saiu (não fica para trás)
    const carry = this.grounded ? 0 : 1;
    _move.set((this.vel.x + this.carrier.x * carry + this.shove.x) * dt, 0, (this.vel.z + this.carrier.z * carry + this.shove.z) * dt);
    this.shove.multiplyScalar(Math.exp(-dt * (this.grounded ? 4 : 0.6)));
    if (this.shove.lengthSq() < 1e-4) this.shove.set(0, 0, 0);
    this._slide(_move, radius, stepH, eye);
    this.feet.add(_move);
    this._pushOut(radius, stepH, eye);

    // ── vertical ──
    let dy = this.vel.y * dt;
    if (dy > 0) {
      _o.copy(this.feet).y += eye;
      const hit = col.ray(_o, UP, dy + 0.15 * s);
      if (hit) {
        dy = Math.max(0, hit.distance - 0.15 * s);
        this.vel.y = 0;
      }
    }
    this.feet.y += dy;

    // ── chão ──
    const snap = this.grounded ? 0.45 * s : 0.05 * s;
    _o.copy(this.feet).y += stepH;
    let hit = col.ray(_o, DOWN, stepH + snap + Math.max(0, -dy));
    // o raio do centro passou por uma fenda (uma junta do tabuleiro, uma grade): o corpo
    // tem largura — procura o chão em volta, dentro dele
    if (!hit || !hit.face || hit.face.normal.y <= WALKABLE_NY) {
      for (const [ox, oz] of [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) {
        _o.set(this.feet.x + ox * s, this.feet.y + stepH, this.feet.z + oz * s);
        const h = col.ray(_o, DOWN, stepH + snap + Math.max(0, -dy));
        if (h && h.face && h.face.normal.y > WALKABLE_NY && (!hit || !hit.face || hit.face.normal.y <= WALKABLE_NY || h.point.y > hit.point.y)) hit = h;
      }
    }
    const wasGrounded = this.grounded;
    if (hit && hit.face && hit.face.normal.y > WALKABLE_NY && this.vel.y <= 0.01) {
      const impact = this.vel.y;
      this.feet.y = hit.point.y;
      this.vel.y = 0;
      this.grounded = true;
      this.groundObj = hit.object;
      if (!wasGrounded) {
        let v = -impact / s;
        // o rolamento: o pulo apertado pouco antes do toque, numa queda que não é letal
        if (!this.thrown && time - this.rollAt < ROLL.window && v > ROLL.min && v < ROLL.maxV) {
          const v0 = v;
          v = Math.sqrt(Math.max(0, v * v - 2 * G_WALK * ROLL.absorb));
          this.rollT = ROLL.dur;
          this.rollAt = -Infinity;
          this.jumpLatch = true;
          this.dip = Math.max(this.dip, (this.eye - 0.7) * s * this.dipScale); // agachado, rolando
          this.onRoll?.(v0, v);
        } else {
          // pouso pesado: a câmera afunda proporcionalmente ao impacto
          this.dip = Math.max(this.dip, Math.min(0.95, Math.max(0, v - 7) * 0.022) * s * this.dipScale);
        }
        this.onLand?.(v, this.fallStartY - this.feet.y);
        if (this.thrown && this.downT <= 0) this.downT = 1; // caído ~1 s (o cofre, Barra-de-vida §3.2)
      }
    } else {
      this.grounded = false;
      this.groundObj = null;
    }
    if (this.grounded) {
      this.airTime = 0;
      this.fallStartY = this.feet.y;
      this.ignoreAbove = Infinity;
    } else {
      this.airTime += dt;
    }

    // ── balanço da cabeça + passos ──
    const hs = Math.hypot(this.vel.x, this.vel.z) / s;
    if (this.grounded && hs > 0.5) {
      const before = Math.floor(this.bobPhase / Math.PI);
      this.bobPhase += dt * hs * 2.1;
      if (Math.floor(this.bobPhase / Math.PI) !== before && this.onStep) this.onStep(Math.min(1, hs / 8.5));
      this.bob = Math.sin(this.bobPhase) * 0.035 * s * Math.min(1, hs / 4) * this.bobScale;
    } else {
      this.bob *= Math.exp(-8 * dt);
    }

    this._apply(camera, eye);
    return true;
  }

  /** Subindo/descendo uma escada de marinheiro. */
  _climb(dt, camera, input, sin, cos, s, eye, ladder) {
    const speed = 2.6 * s;
    this.vel.set(0, input.f * speed, 0);
    // mantém o corpo encostado na escada
    const want = ladder.distance - 0.55 * s;
    this.feet.x += -sin * want * Math.min(1, dt * 8);
    this.feet.z += -cos * want * Math.min(1, dt * 8);
    // teto?
    _o.copy(this.feet).y += eye;
    if (input.f > 0 && this.col.ray(_o, UP, 0.3 * s)) this.vel.y = 0;
    this.feet.y += this.vel.y * dt;
    // chão embaixo encerra a descida
    _o.copy(this.feet).y += 0.3 * s;
    const floor = this.col.ray(_o, DOWN, 0.35 * s);
    if (floor && input.f < 0) this.feet.y = Math.max(this.feet.y, floor.point.y);
    // soltar para o lado: encaixa no nível de 48 m mais próximo (onde há patamar)
    if (input.r !== 0) {
      const lvl = Math.round((this.feet.y + 0.4) / 48) * 48 - 0.4;
      if (Math.abs(lvl - this.feet.y) < 1.2 * s) {
        // só solta se houver chão (um patamar) do lado para onde se vai
        const right = new THREE.Vector3(cos, 0, -sin);
        const target = this.feet.clone().addScaledVector(right, input.r * 1.3 * s);
        target.y = lvl + 0.5 * s;
        const floorHit = this.col.ray(target, DOWN, 1.2 * s);
        if (floorHit && floorHit.face && floorHit.face.normal.y > WALKABLE_NY) {
          this.feet.copy(target);
          this.feet.y = floorHit.point.y + 0.02;
          this.climbing = false;
          this.grounded = false;
          this.vel.set(0, 0, 0);
        }
      }
    }
    // som de degrau
    this._climbAcc += Math.abs(this.vel.y) * dt;
    if (this._climbAcc > 0.7 * s) {
      this._climbAcc = 0;
      this.onClimbStep?.();
    }
    this.airTime = 0;
    this.fallStartY = this.feet.y; // na escada não se cai: ao pisar embaixo, a "queda" é zero
    this.bob *= Math.exp(-8 * dt);
    this._apply(camera, eye);
    return true;
  }

  // ── quinas ──────────────────────────────────────────────────────────────

  /**
   * Uma quina na direção `dir` (horizontal, unitária), com o topo entre minH e maxH
   * acima dos pés: { topY, edge (ponto da face na altura do topo), nrm (para fora da
   * parede, horizontal), h } — ou null. Tudo em coordenadas de cena.
   */
  _findLedge(dir, s, minH, maxH) {
    const col = this.col;
    let wall = null;
    for (let h = Math.max(0.3 * s, minH - 0.7 * s); h <= maxH - 0.05 * s; h += 0.18 * s) {
      _o.copy(this.feet).y += h;
      const hit = col.ray(_o, dir, 0.85 * s);
      // uma parede, ou uma face que pende para baixo (a lateral de uma laje, de um disco mais
      // estreito embaixo): também é quina. Um chão (normal para cima) não é.
      if (hit && hit.face && hit.face.normal.y < WALKABLE_NY && hit.face.normal.y > -0.9 && (!wall || hit.distance < wall.distance)) wall = hit;
    }
    if (!wall) return this._no('parede');
    const n = _n.copy(wall.face.normal).transformDirection(wall.object.matrixWorld);
    n.y = 0;
    if (n.lengthSq() < 0.09) return this._no('face deitada');
    n.normalize();
    if (n.x * dir.x + n.z * dir.z > 0) n.negate();
    // o topo: de cima para baixo, um pouco além da face (em mais de um ponto: um rebordo,
    // um cano baixo correndo junto da borda, também é onde a mão pega)
    let top = null;
    for (const back of [0.3, 0.12, 0.7]) {
      _p.copy(wall.point).addScaledVector(n, -back * s);
      _p.y = this.feet.y + maxH + 0.4 * s;
      const t = col.ray(_p, DOWN, maxH + 0.4 * s - minH + 0.05 * s);
      if (t && t.face && t.face.normal.y >= 0.7) {
        top = t;
        break;
      }
    }
    if (!top) return this._no('topo');
    const topY = top.point.y;
    const h = topY - this.feet.y;
    if (h < minH || h > maxH) return this._no(`altura ${h.toFixed(2)}`);
    // largo o bastante para ficar de pé (não um corrimão, não uma quina fina)
    _p.copy(wall.point).addScaledVector(n, -0.9 * s);
    _p.y = topY + 0.5 * s;
    const top2 = col.ray(_p, DOWN, 0.9 * s);
    if (!top2 || !top2.face || top2.face.normal.y < WALKABLE_NY || Math.abs(top2.point.y - topY) > 0.35 * s) return this._no('estreito');
    // espaço para ficar de pé lá em cima, e nada no caminho do corpo passando pela quina
    _o.copy(top.point).y += 0.05 * s;
    if (col.ray(_o, UP, 1.8 * s)) return this._no('sem altura em cima');
    _o.copy(wall.point).addScaledVector(n, 0.3 * s);
    _o.y = topY + 0.9 * s;
    _q.copy(n).negate();
    if (col.ray(_o, _q, 1.1 * s)) return this._no('bloqueado em cima');
    // a quina: onde a face está na altura do topo (a face pode não ser vertical)
    _o.copy(this.feet);
    _o.y = topY - 0.08 * s;
    const face = col.ray(_o, dir, 1.4 * s);
    const edge = (face ? face.point : wall.point).clone();
    edge.y = topY;
    // onde o pé pousa: o chão logo depois da quina (um rebordo pode ser mais alto que ele)
    return { topY, landY: top2.point.y, edge, nrm: n.clone(), h };
  }

  _no(why) {
    this.ledgeWhy = why; // (para os testes: por que não houve quina)
    return null;
  }

  /** Pegar uma quina agora? (pulando de frente para ela, ou no ar) */
  _tryLedge(input, sin, cos, s, eye) {
    if (this.grabCooldown > 0) return false;
    const fwd = _f.set(-sin, 0, -cos);
    // de pé: pular de frente para uma quina
    if (this.grounded && input.jump && input.f >= 0) {
      const l = this._findLedge(fwd, s, 0.62 * s, (input.burden ? LEDGE.vault : LEDGE.reach) * s);
      if (!l) return false;
      if (l.h <= LEDGE.vault * s) this._startMantle(l, s, eye, true);
      else this._startHang(l, s, eye, input.f > 0);
      this.turnTo = Math.atan2(l.nrm.x, l.nrm.z); // de frente para a parede
      return true;
    }
    // no ar: as mãos pegam o que passar por elas (subindo devagar ou caindo, não rápido demais)
    if (this.grounded || input.burden || this.airTime < 0.12 || this.vel.y > 2.5 || this.vel.y < -LEDGE.maxFall * s) return false;
    const lo = eye - 0.45 * s;
    const hi = eye + 0.55 * s;
    // de frente sempre; caindo, também atrás e dos lados (caiu da beirada: segura nela)
    const dirs = this.vel.y < -1 ? [fwd, _b1.set(sin, 0, cos), _b2.set(cos, 0, -sin), _b3.set(-cos, 0, sin)] : input.f > 0 || input.jump ? [fwd] : [];
    // atrás e dos lados só se a queda for séria (nada embaixo por 5 m): descer de propósito
    // uma mureta não pode virar um agarrão na quina de onde se pulou
    _o.copy(this.feet).y += 0.2 * s;
    const deep = !this.col.ray(_o, DOWN, 5 * s);
    for (const d of dirs) {
      if (d !== fwd && !deep) continue;
      const l = this._findLedge(d, s, lo, hi);
      if (l && l.topY < this.ignoreAbove) {
        this._startHang(l, s, eye, false);
        // o corpo se vira para a parede
        this.turnTo = Math.atan2(l.nrm.x, l.nrm.z);
        return true;
      }
    }
    return false;
  }

  /**
   * De pé, a beirada logo atrás (andando de costas): uma queda de mais de LEDGE.dropEdge, e a face
   * da laje para as mãos → a quina (como _findLedge: { topY, landY, edge, nrm, h }) ou null.
   */
  _edgeBehind(sin, cos, s, radius, stepH) {
    const col = this.col;
    const b = _b1.set(sin, 0, cos); // para trás
    // o pé de trás já está quase no ar? (logo além do corpo, nenhum chão até dropEdge)
    _o.copy(this.feet).addScaledVector(b, radius + 0.12 * s);
    _o.y += stepH;
    if (col.ray(_o, DOWN, stepH + LEDGE.dropEdge * s)) return null;
    // onde o chão acaba (andando para trás, de 5 em 5 cm)
    let t = 0;
    for (let x = 0; x <= radius + 0.12 * s; x += 0.05 * s) {
      _o.copy(this.feet).addScaledVector(b, x);
      _o.y += 0.3 * s;
      const h = col.ray(_o, DOWN, 0.6 * s);
      if (!h || !h.face || h.face.normal.y <= WALKABLE_NY) break;
      t = x;
    }
    // a face da laje embaixo da beirada (de fora para dentro), onde as mãos ficam
    let face = null;
    for (const below of [0.25, 0.08]) {
      _o.copy(this.feet).addScaledVector(b, t + 0.5 * s);
      _o.y -= below * s;
      _q.copy(b).negate();
      const h = col.ray(_o, _q, 0.9 * s);
      if (h && h.face && Math.abs(h.face.normal.y) < 0.6) {
        face = h;
        break;
      }
    }
    const edge = face ? face.point.clone() : this.feet.clone().addScaledVector(b, t + 0.05 * s);
    edge.y = this.feet.y;
    const nrm = b.clone();
    if (face) {
      nrm.copy(face.face.normal).transformDirection(face.object.matrixWorld);
      nrm.y = 0;
      if (nrm.lengthSq() < 0.09) nrm.copy(b);
      nrm.normalize();
      if (nrm.dot(b) < 0) nrm.negate();
    }
    return { topY: this.feet.y, landY: this.feet.y, edge, nrm, h: 0 };
  }

  /** Descer da beirada até ficar pendurado nela (o contrário de subir): ~0,6 s. */
  _startLower(l, s, eye) {
    const from = this.feet.clone();
    const to = l.edge.clone().addScaledVector(l.nrm, 0.34 * s);
    to.y = l.topY - eye - LEDGE.hangBelow * s;
    // primeiro o corpo vai até a beirada e se abaixa; depois desce rente à face
    const mid = l.edge.clone().addScaledVector(l.nrm, 0.2 * s);
    mid.y = l.topY - 0.5 * s;
    this.climb = { t: 0, dur: LEDGE.lowerT, from, mid, to, h: 0, vault: false, edge: l.edge.clone(), nrm: l.nrm.clone(), toHang: l, lower: true };
    this.vel.set(0, 0, 0);
    this.grounded = false;
    this.turnTo = Math.atan2(l.nrm.x, l.nrm.z); // de frente para a face
    this.onLower?.();
  }

  _startHang(l, s, eye, climbNow) {
    this.ledge = l;
    this.backFree = false;
    this.vel.set(0, 0, 0);
    this.carrier.set(0, 0, 0);
    this.grounded = false;
    this.airTime = 0;
    this.fallStartY = l.topY;
    this.hangT = climbNow ? 0.3 : 0;
    this.feet.copy(l.edge).addScaledVector(l.nrm, 0.34 * s);
    this.feet.y = l.topY - eye - LEDGE.hangBelow * s;
    this.onGrab?.();
  }

  _hangStep(dt, camera, input, sin, cos, s, eye) {
    const l = this.ledge;
    this.hangT += dt;
    this.bob *= Math.exp(-8 * dt);
    // soltar pede apertar "trás" de novo (quem desceu de costas ainda o segura ao se pendurar)
    if (input.f >= 0 && !input.descend) this.backFree = true;
    this.cornerT = Math.max(0, (this.cornerT ?? 0) - dt);
    // saltos entre bordas (o cofre, Mobilidade §1): pulo + lado → ao longo da parede; pulo + trás → a de trás
    if (input.jump && this.hangT > 0.3 && (input.r || input.f < 0)) {
      const t = this._alongWall(l, sin, cos, input.r || 1);
      const l2 = input.f < 0 ? this._leapTarget(l.nrm, l.nrm, s, eye, 1.2, LEDGE.leapBack) : this._leapTarget(t, l.nrm.clone().negate(), s, eye, 0.6, LEDGE.leapSide + 0.5, true);
      if (l2) {
        this._startLeap(l2, s, eye);
        this._apply(camera, eye);
        return true;
      }
    }
    if ((input.jump || input.f > 0) && this.hangT > 0.3) {
      this._startMantle(l, s, eye, false);
    } else if ((input.f < 0 || input.descend) && this.backFree) {
      // solta: cai rente à parede; as mãos pegam a próxima borda que passar por elas, abaixo desta
      // (descer uma parede de borda em borda — o cofre, Mobilidade §1)
      this.ledge = null;
      this.grabCooldown = 0.12;
      this.ignoreAbove = l.topY - 0.4 * s;
      this.dropping = true; // até pegar outra ou pousar: cai rente à parede, sem se afastar dela
      this.vel.set(l.nrm.x * 0.25, 0, l.nrm.z * 0.25);
      this.fallStartY = this.feet.y;
    } else if (input.r) {
      // pela borda: o lado da câmera, ao longo da parede
      const tx = cos - l.nrm.x * (cos * l.nrm.x - sin * l.nrm.z);
      const tz = -sin - l.nrm.z * (cos * l.nrm.x - sin * l.nrm.z);
      const tl = Math.hypot(tx, tz) || 1;
      // (uma cópia: o _findLedge usa _p por dentro — antes, no fim da borda, o corpo voltava a um ponto
      // qualquer da busca do topo)
      const was = this.feet.clone();
      const step = LEDGE.shimmy * s * dt;
      const sx = (tx / tl) * Math.sign(input.r);
      const sz = (tz / tl) * Math.sign(input.r);
      // uma parede do lado, no caminho do corpo (o outro braço de um L): a borda acaba ali — o canto
      let blocked = false;
      for (const hh of [0.6, 1.3]) {
        _o.set(this.feet.x, this.feet.y + hh * s, this.feet.z);
        const hit = this.col.ray(_o, _d.set(sx, 0, sz), 0.38 * s + step);
        if (hit && hit.face && Math.abs(hit.face.normal.y) < 0.5) blocked = true;
      }
      if (!blocked) {
        this.feet.x += sx * step * Math.abs(input.r);
        this.feet.z += sz * step * Math.abs(input.r);
      }
      const into = _q.copy(l.nrm).negate();
      const l2 = blocked ? null : this._findLedge(into, s, l.topY - this.feet.y - 0.3 * s, l.topY - this.feet.y + 0.3 * s);
      if (l2) {
        this.ledge = l2;
        this.feet.copy(l2.edge).addScaledVector(l2.nrm, 0.34 * s);
        this.feet.y = l2.topY - eye - LEDGE.hangBelow * s;
        // mão por mão: o corpo balança um pouco a cada troca (as mãos — app/hands.js)
        this.shimmyT += dt;
        this.bob = -Math.abs(Math.sin(this.shimmyT * 5.2)) * 0.035 * s;
      } else {
        // acabou a borda: um canto? (a borda segue na face do lado, ou na parede à frente)
        this.feet.copy(was);
        const t = this._alongWall(l, sin, cos, input.r);
        const l3 = this.cornerT > 0 ? null : this._cornerLedge(l, t, s, eye);
        if (l3) {
          this.ledge = l3;
          this.feet.copy(l3.edge).addScaledVector(l3.nrm, 0.34 * s);
          this.feet.y = l3.topY - eye - LEDGE.hangBelow * s;
          this.turnTo = Math.atan2(l3.nrm.x, l3.nrm.z);
          this.cornerT = 0.5;
        }
      }
    }
    this._apply(camera, eye);
    return true;
  }

  /** A direção ao longo da parede (unitária, horizontal) para o lado `side` (+1 direita da câmera, −1 esquerda). */
  _alongWall(l, sin, cos, side) {
    const tx = cos - l.nrm.x * (cos * l.nrm.x - sin * l.nrm.z);
    const tz = -sin - l.nrm.z * (cos * l.nrm.x - sin * l.nrm.z);
    const tl = Math.hypot(tx, tz) || 1;
    return new THREE.Vector3((tx / tl) * Math.sign(side), 0, (tz / tl) * Math.sign(side));
  }

  /** Uma quina vista de um ponto (`pos`, os pés) numa direção — a busca de sempre, de outro lugar. */
  _ledgeFrom(pos, dir, s, minH, maxH) {
    const save = this.feet.clone();
    this.feet.copy(pos);
    const l = this._findLedge(dir, s, minH, maxH);
    this.feet.copy(save);
    return l;
  }

  /** No fim da borda, indo para `t`: a borda que vira o canto — a face do lado (canto de fora: o bloco
   *  acaba) ou a parede à frente (canto de dentro). Na mesma altura (±0,3 m). */
  _cornerLedge(l, t, s, eye) {
    const h = eye + LEDGE.hangBelow * s;
    // canto de dentro: a parede logo à frente, no sentido em que se ia
    const inner = this._ledgeFrom(this.feet, t, s, h - 0.3 * s, h + 0.3 * s);
    if (inner && Math.abs(inner.topY - l.topY) < 0.3 * s && inner.nrm.dot(t) < -0.5) return inner;
    // canto de fora: além do fim, rente à face do lado, olhando de volta
    const q = this.feet.clone().addScaledVector(t, 0.7 * s).addScaledVector(l.nrm, -0.68 * s);
    const outer = this._ledgeFrom(q, t.clone().negate(), s, h - 0.3 * s, h + 0.3 * s);
    if (outer && Math.abs(outer.topY - l.topY) < 0.3 * s && outer.nrm.dot(t) > 0.5) return outer;
    return null;
  }

  /** O alvo de um salto pendurado: andando `step` de `dmin` a `dmax` m, uma borda olhando para `look`
   *  (a mão vai até ela) na altura de agora ±0,6 m. A primeira que aparecer. */
  _leapTarget(step, look, s, eye, dmin, dmax, needGap = false) {
    const h = eye + LEDGE.hangBelow * s;
    const q = new THREE.Vector3();
    // de lado (`needGap`): a borda do outro lado de um vão; sem vão no alcance, um pulo de 1,5 m ao
    // longo da mesma borda
    let gap = false;
    let hop = null;
    for (let d = dmin * s; d <= dmax * s; d += 0.15 * s) {
      q.copy(this.feet).addScaledVector(step, d);
      const l = this._ledgeFrom(q, look, s, h - 0.6 * s, h + 0.6 * s);
      if (!l) {
        gap = true;
        continue;
      }
      if (l.edge.distanceTo(this.ledge.edge) <= 0.5 * s) continue;
      if (!needGap || gap) return l;
      if (!hop && d >= 1.5 * s) hop = l;
    }
    return needGap && !gap ? hop : null;
  }

  /** O salto entre bordas: um arco curto até ficar pendurado na outra. */
  _startLeap(l, s, eye) {
    const from = this.feet.clone();
    const to = l.edge.clone().addScaledVector(l.nrm, 0.34 * s);
    to.y = l.topY - eye - LEDGE.hangBelow * s;
    const mid = from.clone().lerp(to, 0.5);
    mid.y = Math.max(from.y, to.y) + 0.35 * s;
    this.climb = { t: 0, dur: LEDGE.leapT, from, mid, to, h: 0, vault: false, edge: l.edge.clone(), nrm: l.nrm.clone(), toHang: l, leap: true };
    this.ledge = null;
    this.turnTo = Math.atan2(l.nrm.x, l.nrm.z);
    this.onLeap?.();
  }

  /** Subir: primeiro o corpo sobe rente à parede, depois passa por cima da quina. */
  _startMantle(l, s, eye, vault) {
    const from = this.feet.clone();
    const to = l.edge.clone().addScaledVector(l.nrm, -0.55 * s);
    to.y = Math.max(l.landY ?? l.topY, l.topY - 0.35 * s) + 0.02 * s; // (se é um rebordo, o pé desce ao chão depois)
    const mid = from.clone();
    mid.y = l.topY + 0.05 * s;
    const h = l.topY - from.y;
    this.climb = { t: 0, dur: vault ? 0.35 + 0.25 * h / s : 1.05, from, mid, to, h, vault, edge: l.edge.clone(), nrm: l.nrm.clone() };
    this.ledge = null;
    this.vel.set(0, 0, 0);
    this.onMantle?.(h / s);
  }

  _mantleStep(dt, camera, eye) {
    const c = this.climb;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const split = c.vault ? 0.45 : 0.62;
    if (k < split) this.feet.lerpVectors(c.from, c.mid, ease(k / split));
    else this.feet.lerpVectors(c.mid, c.to, ease((k - split) / (1 - split)));
    this.bob *= Math.exp(-8 * dt);
    if (k >= 1 && c.toHang) {
      this.climb = null;
      this._startHang(c.toHang, this._s ?? 1, eye, false);
    } else if (k >= 1) {
      this.climb = null;
      this.grounded = true;
      this.airTime = 0;
      this.fallStartY = this.feet.y;
      this.dip = Math.max(this.dip, 0.12 * this.dipScale); // os joelhos acomodam
    }
    this._apply(camera, eye);
    return true;
  }

  /** A origem flutuante andou (world.maybeRebase): a quina e a subida andam junto. */
  shift(delta) {
    for (const v of [this.ledge?.edge, this.climb?.from, this.climb?.mid, this.climb?.to, this.climb?.edge]) v?.sub(delta);
  }

  /** Para as mãos (app/hands.js): 'hang' · 'climb' · null, e o quanto da subida já foi. */
  get ledgeState() {
    if (this.climb) return { kind: 'climb', k: Math.min(1, this.climb.t / this.climb.dur), vault: this.climb.vault, edge: this.climb.edge, nrm: this.climb.nrm };
    if (this.ledge) return { kind: 'hang', k: 0, edge: this.ledge.edge, nrm: this.ledge.nrm };
    return null;
  }

  _apply(camera, eye) {
    camera.position.copy(this.feet);
    camera.position.y += eye + this.bob - this.dip;
  }

  /** Limita o deslocamento horizontal por paredes e desliza ao longo delas. */
  _slide(move, radius, stepH, eye) {
    for (let pass = 0; pass < 2; pass++) {
      const len = move.length();
      if (len < 1e-6) return;
      _d.copy(move).divideScalar(len);
      let best = null;
      // (os corrimãos são finos e ficam a 1,0–1,2 m: uma altura deles não pode faltar)
      // (alturas em metros do mundo — um corrimão não muda de altura conforme quem passa)
      const s = radius / 0.38; // a escala do corpo (o raio é 0,38 m × escala)
      for (const h of [stepH + 0.05, 0.8 * s, 1.0 * s, 1.15 * s, eye * 0.95]) {
        _o.copy(this.feet).y += h;
        const hit = this.col.ray(_o, _d, len + radius);
        if (hit && hit.face && Math.abs(hit.face.normal.y) < WALKABLE_NY && (!best || hit.distance < best.distance)) best = hit;
      }
      if (!best) return;
      const allowed = Math.max(0, best.distance - radius);
      const n = best.face.normal;
      const nh = new THREE.Vector3(n.x, 0, n.z);
      if (nh.lengthSq() < 1e-6) return;
      nh.normalize();
      if (nh.dot(_d) > 0) nh.negate();
      // anda até encostar e desliza o resto ao longo da parede
      const rest = move.clone().multiplyScalar(1 - allowed / len);
      move.copy(_d).multiplyScalar(allowed);
      rest.addScaledVector(nh, -rest.dot(nh));
      this.feet.add(move);
      move.copy(rest);
      // o empurrão (shove) contra a parede também sai — forte, um baque (app/beam.js onSlam)
      const sn = this.shove.x * nh.x + this.shove.z * nh.z;
      if (sn < 0) {
        if (sn < -12) this.onSlam?.(-sn);
        this.shove.x -= nh.x * sn;
        this.shove.z -= nh.z * sn;
      }
      // tira da velocidade a componente contra a parede
      const vn = this.vel.x * nh.x + this.vel.z * nh.z;
      if (vn < 0) {
        this.vel.x -= nh.x * vn;
        this.vel.z -= nh.z * vn;
      }
    }
  }

  /** Se algo invadiu o raio do corpo (paredes em movimento, quinas), empurra para fora. */
  _pushOut(radius, stepH, eye) {
    const s = radius / 0.38;
    for (const h of [stepH + 0.05, 1.05 * s, 1.15 * s, eye * 0.8]) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        _d.set(Math.cos(a), 0, Math.sin(a));
        _o.copy(this.feet).y += h;
        const hit = this.col.ray(_o, _d, radius);
        if (hit && hit.face && Math.abs(hit.face.normal.y) < WALKABLE_NY) {
          this.feet.addScaledVector(_d, -(radius - hit.distance));
        }
      }
    }
  }
}
