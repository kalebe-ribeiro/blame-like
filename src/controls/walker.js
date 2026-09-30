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
//
//  Tudo escala com a escala do observador (portais de tamanhos diferentes).
//  O mesmo controlador move os corpos dos seres (world/entities.js): a mesma física.
//  Se o mundo ao redor ainda não foi gerado, o corpo "paira" até ficar pronto.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);
const WALKABLE_NY = 0.55; // normal.y mínima de um chão (≈ 57°)

const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _move = new THREE.Vector3();

export class Walker {
  constructor(collision) {
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
    this.canClimb = true; // escadas de marinheiro (os corpos dos seres de teste não sobem)
  }

  /** Posiciona o corpo a partir da câmera (ao entrar no modo andar). */
  syncFromCamera(camera, scale, velocity) {
    this.feet.copy(camera.position).y -= this.eye * scale;
    this.vel.copy(velocity ?? new THREE.Vector3());
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

    // ── escada à frente? ──
    _d.set(-sin, 0, -cos);
    _o.copy(this.feet).y += eye * 0.6;
    const ladder = col.ray(_o, _d, 0.95 * s);
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
    const speed = (input.run ? 8.5 : 4.2) * s * this.speedScale;
    const control = this.grounded ? 12 : 2.2;
    const k = Math.min(1, control * dt);
    this.vel.x += (_d.x * speed - this.vel.x) * k;
    this.vel.z += (_d.z * speed - this.vel.z) * k;

    // ── gravidade e pulo ──
    if (this.grounded && input.jump) {
      this.vel.y = 5.4 * Math.sqrt(s);
      this.grounded = false;
    }
    this.vel.y = Math.max(this.vel.y - 15 * s * dt, -60 * s);

    // ── horizontal com paredes ──
    // no ar, conserva a velocidade do vagão de onde saiu (não fica para trás)
    const carry = this.grounded ? 0 : 1;
    _move.set((this.vel.x + this.carrier.x * carry) * dt, 0, (this.vel.z + this.carrier.z * carry) * dt);
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
    const hit = col.ray(_o, DOWN, stepH + snap + Math.max(0, -dy));
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
    this.bob *= Math.exp(-8 * dt);
    this._apply(camera, eye);
    return true;
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
      for (const h of [stepH + 0.05, eye * 0.55, eye * 0.95]) {
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
    for (const h of [stepH + 0.05, eye * 0.8]) {
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
