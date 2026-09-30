// ─────────────────────────────────────────────────────────────────────────────
//  Controles do observador (pointer lock), com dois modos:
//
//    ANDAR (padrão)  mover · mouse olhar · pular · correr
//                    gravidade e colisão reais (ver walker.js)
//    VOAR (noclip)   mover · subir (a tecla de pular) · descer · acelerar
//                    com inércia, para parecer flutuação
//
//    "voar" alterna entre os modos (só onde se voa).
//    Piloto automático (voo): deriva sozinho, curvando devagar.
//      Qualquer tecla de movimento ou o mouse devolve o controle.
//
//  As teclas e os botões vêm de controls/bindings.js (trocáveis na aba CONTROLES).
//
//  "scale" é a escala do observador: muda ao atravessar portais de tamanhos
//  diferentes e multiplica velocidade, altura dos olhos, gravidade etc.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { bindings } from './bindings.js';

const MOVE = ['forward', 'back', 'left', 'right', 'jump', 'descend'];

export class NoclipControls {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;
    this.yaw = 0;
    this.pitch = 0;
    this.velocity = new THREE.Vector3();
    this.scale = 1;
    this.keys = new Set();
    this.locked = false;
    this.sensitivity = 0.0021;
    this.onLockChange = null;
    this.onModeChange = null;
    this.autopilot = false;
    this.autopilotBoost = 1;
    this.walker = null; // atribuído pelo app (precisa do mundo para colidir)
    this.invertY = false;
    // controle de videogame (API Gamepad): lido a cada quadro em update()
    this.pad = { active: false, prev: [] };
    this.onPadButton = null; // (nome) — botões de ação que o app trata (foto, interface…)
    this.onPadStart = null; // primeiro uso do controle (sai da tela de entrada)
    this.mode = 'walk';
    this.canFly = true; // o modo de jogo decide (app/modes.js): na Peregrinação não se voa
    this._euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this._fwd = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._wish = new THREE.Vector3();

    document.addEventListener('keydown', (e) => {
      if (bindings.capturing) return;
      bindings.lastDevice = 'key';
      if (bindings.is('autopilot', e.code) && !e.repeat) {
        if (!this.canFly) return;
        this.autopilot = !this.autopilot;
        if (this.autopilot) this.setMode('fly');
      } else if (bindings.is('fly', e.code) && !e.repeat) {
        if (!this.canFly) return;
        this.autopilot = false;
        this.setMode(this.mode === 'walk' ? 'fly' : 'walk');
      } else if (MOVE.some((a) => bindings.is(a, e.code))) {
        this.autopilot = false;
      }
      this.keys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
    });
    document.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) + Math.abs(e.movementY) > 3) this.autopilot = false;
      this.yaw -= e.movementX * this.sensitivity;
      this.pitch -= e.movementY * this.sensitivity * (this.invertY ? -1 : 1);
      this.pitch = THREE.MathUtils.clamp(this.pitch, -1.55, 1.55);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.dom;
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    // sem gesto do usuário o pedido é recusado (promessa rejeitada): ignora
    this.dom.requestPointerLock?.()?.catch?.(() => {});
  }

  setMode(mode) {
    if (mode === 'fly' && !this.canFly) mode = 'walk';
    if (mode === this.mode) return;
    if (mode === 'walk' && this.walker) {
      this.walker.syncFromCamera(this.camera, this.scale, this.velocity);
    } else if (mode === 'fly' && this.walker) {
      this.velocity.copy(this.walker.vel);
    }
    this.mode = mode;
    this.onModeChange?.(mode);
  }

  setView({ pos, yaw, pitch, scale = 1 }) {
    this.camera.position.copy(pos);
    this.yaw = yaw;
    this.pitch = pitch;
    this.velocity.set(0, 0, 0);
    this._setScale(scale);
    this._applyRotation(0);
    this.walker?.syncFromCamera(this.camera, this.scale);
  }

  _setScale(s) {
    this.scale = s;
    this.camera.near = 0.08 * s;
    this.camera.updateProjectionMatrix();
  }

  _applyRotation(time) {
    // micro-rolagem lenta: o horizonte nunca está completamente reto
    this._euler.set(this.pitch, this.yaw, Math.sin(time * 0.13) * 0.006);
    this.camera.quaternion.setFromEuler(this._euler);
  }

  /**
   * Lê o controle (se houver). Analógicos com zona morta e curva suave; os
   * botões de ação disparam uma vez por aperto.
   */
  _readPad(dt) {
    const out = { f: 0, r: 0, u: 0, run: false, jump: false };
    const pads = navigator.getGamepads?.() ?? [];
    const gp = [...pads].find((p) => p && p.connected && p.mapping === 'standard') ?? [...pads].find((p) => p && p.connected);
    if (!gp) return out;
    const dz = (v) => {
      const a = Math.abs(v);
      return a < 0.15 ? 0 : Math.sign(v) * ((a - 0.15) / 0.85) ** 1.6;
    };
    const ax = gp.axes;
    const b = (i) => !!gp.buttons[i]?.pressed;
    const val = (i) => gp.buttons[i]?.value ?? 0;
    const lx = dz(ax[0] ?? 0);
    const ly = dz(ax[1] ?? 0);
    const rx = dz(ax[2] ?? 0);
    const ry = dz(ax[3] ?? 0);
    const any = lx || ly || rx || ry || gp.buttons.some((x) => x.pressed);
    if (bindings.capturing) {
      // a aba CONTROLES está esperando um botão: o jogo não reage
      this.pad.prev = gp.buttons.map((x) => x.pressed);
      return out;
    }
    if (any) bindings.lastDevice = 'pad';
    if (any && !this.pad.active) {
      this.pad.active = true;
      this.onPadStart?.();
    }
    this.pad.gp = gp;
    out.f = -ly;
    out.r = lx;
    // olhar: velocidade angular proporcional ao analógico (sensibilidade do mouse escala junto)
    const rate = 2.6 * (this.sensitivity / 0.0021);
    if (rx || ry) {
      this.autopilot = false;
      this.yaw -= rx * rate * dt;
      this.pitch = THREE.MathUtils.clamp(this.pitch - ry * rate * 0.75 * dt * (this.invertY ? -1 : 1), -1.55, 1.55);
    }
    if (lx || ly) this.autopilot = false;
    // botões pela aba CONTROLES (bindings.js); gatilhos analógicos contam a partir de 40%
    const down = (i) => i !== null && i !== undefined && (b(i) || val(i) > 0.4);
    const hold = (id) => bindings.available(id) && down(bindings.pad(id));
    const edge = (id) => {
      const i = bindings.pad(id);
      return bindings.available(id) && down(i) && !this.pad.prev[i];
    };
    out.run = hold('run');
    out.jump = hold('jump');
    out.u = (hold('jump') ? 1 : 0) - (hold('descend') ? 1 : 0); // voando: pular sobe, descer desce
    // botões de ação: uma vez por aperto
    if (edge('fly') && this.canFly) {
      this.autopilot = false;
      this.setMode(this.mode === 'walk' ? 'fly' : 'walk');
    }
    if (edge('autopilot') && this.canFly) {
      this.autopilot = !this.autopilot;
      if (this.autopilot) this.setMode('fly');
    }
    for (const id of ['use', 'lantern', 'sensor', 'photo', 'map', 'hud', 'transport', 'regenerate', 'settings', 'controls']) {
      if (edge(id)) this.onPadButton?.(id);
    }
    this.pad.prev = gp.buttons.map((x) => x.pressed || (x.value ?? 0) > 0.4);
    return out;
  }

  /** Vibração do controle (se ele tiver motor). intensidade 0..1, duração em ms. */
  rumble(strong, weak = strong * 0.6, ms = 160) {
    const act = this.pad.gp?.vibrationActuator;
    if (!this.pad.active || !act || strong <= 0.01) return;
    act.playEffect?.('dual-rumble', { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) })?.catch?.(() => {});
  }

  update(dt, time) {
    const k = this.keys;
    const pad = this._readPad(dt);
    const clamp1 = (v) => Math.max(-1, Math.min(1, v));
    const h = (id) => (bindings.held(id, k) ? 1 : 0);
    const f = clamp1(h('forward') - h('back') + pad.f);
    const r = clamp1(h('right') - h('left') + pad.r);
    const run = !!h('run') || pad.run;
    this._applyRotation(time);

    if (this.mode === 'walk' && this.walker) {
      this.walker.step(dt, this.camera, { f, r, run, jump: !!h('jump') || pad.jump }, this.yaw, this.scale, time);
      return;
    }

    const u = clamp1(h('jump') - h('descend') + pad.u);
    this.camera.getWorldDirection(this._fwd);
    this._right.crossVectors(this._fwd, this.camera.up).normalize();

    this._wish.set(0, 0, 0)
      .addScaledVector(this._fwd, f)
      .addScaledVector(this._right, r)
      .addScaledVector(this.camera.up, u);
    if (this._wish.lengthSq() > 0) this._wish.normalize();

    if (this.autopilot) {
      // curvas lentas e sobrepostas: nunca repete o mesmo caminho
      this.yaw += (Math.sin(time * 0.043) * 0.6 + Math.sin(time * 0.017 + 2) * 0.4) * 0.12 * dt;
      const targetPitch = Math.sin(time * 0.021) * 0.35 + Math.sin(time * 0.0071 + 1) * 0.25;
      this.pitch += (targetPitch - this.pitch) * dt * 0.2;
      this._wish.copy(this._fwd);
    }

    const boost = (run ? 6 : 1) * (this.autopilot ? this.autopilotBoost * 0.45 : 1);
    const accel = 24 * boost * this.scale;
    this.velocity.addScaledVector(this._wish, accel * dt);
    this.velocity.multiplyScalar(Math.exp(-2.6 * dt)); // amortecimento
    this.camera.position.addScaledVector(this.velocity, dt);
  }

  /** Teleporta os pés para um ponto (realocação ao cair no abismo). */
  placeFeet(scenePos) {
    this.camera.position.copy(scenePos).y += 1.7 * this.scale;
    this.velocity.set(0, 0, 0);
    this.walker?.syncFromCamera(this.camera, this.scale);
  }

  get speed() {
    const v = this.mode === 'walk' && this.walker ? this.walker.vel : this.velocity;
    return v.length() / this.scale;
  }
}
