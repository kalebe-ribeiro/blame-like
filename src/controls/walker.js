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
};
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
    this.canClimb = true; // escadas de marinheiro (os corpos dos seres de teste não sobem)
    this.canGrab = true; // agarrar quinas (os seres não: world/entities.js)
    this.ledge = null; // pendurado: { topY, edge, nrm, h }
    this.climb = null; // subindo: { t, dur, from, mid, to, h }
    this.hangT = 0;
    this.shimmyT = 0;
    this.grabCooldown = 0;
    this.turnTo = null; // yaw para onde o corpo se vira ao agarrar (controls/noclip.js aplica)
    this.onGrab = null; // () — as mãos pegaram a quina
    this.onMantle = null; // (altura) — começou a subir
  }

  /** Posiciona o corpo a partir da câmera (ao entrar no modo andar). */
  syncFromCamera(camera, scale, velocity) {
    this.feet.copy(camera.position).y -= this.eye * scale;
    this.vel.copy(velocity ?? new THREE.Vector3());
    this.shove?.set(0, 0, 0);
    this.grounded = false;
    this.airTime = 0;
    this.fallStartY = this.feet.y;
    this.carrier.set(0, 0, 0);
  }

  /**
   * @param {object} input { f, r, jump, run }  (f/r ∈ {-1,0,1})
   * @returns {boolean} false se o mundo ao redor não estava pronto (pairando)
   */
  step(dt, camera, input, yaw, s, time) {
    const eye = this.eye * s;
    const radius = 0.38 * s;
    const stepH = 0.55 * s;
    const col = this.col;

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

    // ── quinas: subindo, pendurado, ou pegando uma agora ──
    this.grabCooldown = Math.max(0, this.grabCooldown - dt);
    if (this.climb) return this._mantleStep(dt, camera, eye);
    if (this.ledge) return this._hangStep(dt, camera, input, sin, cos, s, eye);
    if (this.canGrab && this._tryLedge(input, sin, cos, s, eye)) {
      this._apply(camera, eye);
      return true;
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
    if (onLadder && (input.f !== 0 || this.climbing) && !(this.grounded && input.f < 0)) {
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
    const speed = (input.run ? 8.5 : 4.2) * (input.slow ? 0.6 : 1) * s * this.speedScale;
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
        // pouso pesado: a câmera afunda proporcionalmente ao impacto
        this.dip = Math.max(this.dip, Math.min(0.95, Math.max(0, -impact / s - 7) * 0.022) * s * this.dipScale);
        this.onLand?.(-impact / s, this.fallStartY - this.feet.y);
      }
    } else {
      this.grounded = false;
      this.groundObj = null;
    }
    if (this.grounded) {
      this.airTime = 0;
      this.fallStartY = this.feet.y;
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
      if (l) {
        this._startHang(l, s, eye, false);
        // o corpo se vira para a parede
        this.turnTo = Math.atan2(l.nrm.x, l.nrm.z);
        return true;
      }
    }
    return false;
  }

  _startHang(l, s, eye, climbNow) {
    this.ledge = l;
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
    if ((input.jump || input.f > 0) && this.hangT > 0.3) {
      this._startMantle(l, s, eye, false);
    } else if (input.f < 0 || input.descend) {
      // solta: cai rente à parede (as mãos só voltam a pegar depois de um instante)
      this.ledge = null;
      this.grabCooldown = 0.7;
      this.vel.set(l.nrm.x * 0.6, 0, l.nrm.z * 0.6);
      this.fallStartY = this.feet.y;
    } else if (input.r) {
      // pela borda: o lado da câmera, ao longo da parede
      const tx = cos - l.nrm.x * (cos * l.nrm.x - sin * l.nrm.z);
      const tz = -sin - l.nrm.z * (cos * l.nrm.x - sin * l.nrm.z);
      const tl = Math.hypot(tx, tz) || 1;
      const was = _p.copy(this.feet);
      this.feet.x += (tx / tl) * input.r * LEDGE.shimmy * s * dt;
      this.feet.z += (tz / tl) * input.r * LEDGE.shimmy * s * dt;
      const into = _q.copy(l.nrm).negate();
      const l2 = this._findLedge(into, s, l.topY - this.feet.y - 0.3 * s, l.topY - this.feet.y + 0.3 * s);
      if (l2) {
        this.ledge = l2;
        this.feet.copy(l2.edge).addScaledVector(l2.nrm, 0.34 * s);
        this.feet.y = l2.topY - eye - LEDGE.hangBelow * s;
        // mão por mão: o corpo balança um pouco a cada troca (as mãos — app/hands.js)
        this.shimmyT += dt;
        this.bob = -Math.abs(Math.sin(this.shimmyT * 5.2)) * 0.035 * s;
      } else this.feet.copy(was); // acabou a borda
    }
    this._apply(camera, eye);
    return true;
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
    if (k >= 1) {
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
