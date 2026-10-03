// ─────────────────────────────────────────────────────────────────────────────
//  O emissor de feixe gravitacional — a arma de Killy (o cofre, Arma-do-Killy, fase F2).
//
//  Uma ferramenta (app/inventory.js: vai para a mão pela regra das mãos). A POTÊNCIA
//  é o tempo segurando o gatilho, sem níveis (§5.2):
//    t < 0,25 s     não atira (um estalo seco, sem gasto)
//    u = (t − 0,25) / 2,25 (0..1, até 2,5 s) · k = 1 − (1 − u)²
//    alcance 30 → 400 m · raio 0,6 → 2,8 m · gasto 3 → 18% da célula (5 cheios = 90%)
//  Segurar além do cheio: de 2,5 a 3 s a carga fica no cheio; de 3 a 6,5 s, a SOBRECARGA
//  (o, 0..1 — 2026-10-03, pedido do usuário): alcance até 800 m, raio até 4,4 m, gasto até 35%,
//  a luz do feixe desviando para o azul e o violeta até o limite — um traço preto que engole a
//  luz (app/beamfx.js beamColors) — e o empurrão crescendo muito mais que a carga. E o BRAÇO
//  paga (como o de Killy): depois de um tiro em sobrecarga ele fica sem responder (3 a 40 s);
//  no limite é destruído — o emissor e a mão somem e se regeneram em 90 s.
//  A célula não tem o bastante: a carga para onde ela alcança. Entre tiros, 0,8 s.
//
//  Ao soltar: o corte de verdade (world.addCut — gen/cut.js) até onde o feixe chega
//  (beamReach: acaba nas camadas e nas estruturas únicas); o que estava no caminho morre;
//  o alerta do setor sobe e os Safeguards perto ouvem.
//
//  Carregando (C2): anda a 60%, sem correr nem pular. CANCELA (sem tiro, sem gasto —
//  §5.3): o botão de correr (LT / Shift) ou o clique direito; abrir qualquer painel;
//  desmaio/captura; quina ou escada; a mão sem o emissor; a célula zerada; trocar de
//  mundo. Depois de um cancelamento, só um aperto novo carrega.
//  Controle (C4): RT atira (segurar), LT cancela. Teclado: Q ou clique esquerdo.
//  No modo Livre não gasta a célula.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { bindings } from '../controls/bindings.js';
import { t as tr } from '../i18n/index.js';
import { buildHand } from './hands.js';
import { beamReach } from '../gen/beamreach.js';
import { createBeamFx, beamColors } from './beamfx.js';
import { cutHitsBoxes } from '../gen/cut.js';
import { CHUNK } from '../gen/field.js';

export const CHARGE = { min: 0.25, full: 2.5, hold: 3.0, over: 6.5 };
/** O braço depois de um tiro em sobrecarga: sem responder de lockMin a lockMax s (pela sobrecarga);
 *  a partir de `wreck`, destruído — `regen` s para se regenerar. */
export const ARM = { lockMin: 3, lockMax: 40, wreck: 0.95, regen: 90 };
export const COOLDOWN = 0.8;
/** O teto de cortes num chunk (§4.3 — inatingível jogando; atingido, o emissor engasga ali). */
export const MAX_CUTS_PER_CHUNK = 64;
/** A coluna protegida debaixo de quem atira: raio e profundidade (m); `aim` — o eixo do tiro
 *  passando a menos disto dos pés, abaixo deles, é "atirar no chão debaixo de si". */
export const KEEP = { r: 0.9, depth: 6, aim: 0.6 };

/**
 * Até onde o feixe vai antes de um chunk que já tem o teto de cortes (a — GLOBAL, dir, t):
 * a distância onde ele entra nesse chunk, ou t.
 */
export function jamAt(F, a, dir, t) {
  if ((F.cuts?.length ?? 0) < MAX_CUTS_PER_CHUNK) return t;
  const seen = new Set();
  for (let s = 0; s <= t; s += CHUNK / 4) {
    const cx = Math.floor((a.x + dir.x * s) / CHUNK);
    const cy = Math.floor((a.y + dir.y * s) / CHUNK);
    const cz = Math.floor((a.z + dir.z * s) / CHUNK);
    const key = `${cx},${cy},${cz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const box = [cx * CHUNK, cy * CHUNK, cz * CHUNK, (cx + 1) * CHUNK, (cy + 1) * CHUNK, (cz + 1) * CHUNK];
    let n = 0;
    for (const c of F.cuts) if (cutHitsBoxes(c, box) && ++n >= MAX_CUTS_PER_CHUNK) return Math.max(0, s - CHUNK / 4);
  }
  return t;
}
/** A curva da carga: tempo segurando → k (0..1), ou −1 abaixo do mínimo. */
export function chargeK(t) {
  if (t < CHARGE.min) return -1;
  const u = Math.min(1, (t - CHARGE.min) / (CHARGE.full - CHARGE.min));
  return 1 - (1 - u) * (1 - u);
}
/** A sobrecarga: tempo segurando → o (0..1) — de 3 a 6,5 s. */
export function overK(t) {
  if (t < CHARGE.hold) return 0;
  return Math.min(1, (t - CHARGE.hold) / (CHARGE.over - CHARGE.hold));
}
/** O tiro de carga k e sobrecarga o. */
export function shotOf(k, o = 0) {
  return { range: 30 + 370 * k + 400 * o, r: 0.6 + 2.2 * k + 1.6 * o, cost: 0.03 + 0.15 * k + 0.17 * o };
}

/** O emissor: um corpo de chapa, o cano com as cinco bobinas, o cabo. */
function buildEmitter(m) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), m.machine);
  body.position.z = -0.04;
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.2, 10), m.machine);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.22);
  g.add(barrel);
  // as bobinas: acendem em sequência com a carga (a própria fonte da luz — emissivas)
  const coils = [];
  for (let i = 0; i < 5; i++) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x0c0b0a });
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 14), mat);
    coil.position.set(0, 0.012, -0.15 - i * 0.03);
    g.add(coil);
    coils.push(mat);
  }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.09, 0.04), m.machine);
  grip.position.set(0, -0.06, 0.03);
  grip.rotation.x = 0.25;
  g.add(grip);
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, -0.33);
  g.add(muzzle);
  return { group: g, coils, muzzle };
}

export function createBeam(ctx) {
  const { camera, world, controls, audio } = ctx;
  const player = ctx.player;
  const em = buildEmitter(world.materials);
  em.group.visible = false;
  camera.add(em.group);
  const grips = {};
  // (a luva da mão do emissor: um material só dela — escurece queimada sem mexer no pano do mundo)
  const handMat = world.materials.cloth.clone();
  for (const k of Object.keys(ctx.shared)) handMat.uniforms[k] = ctx.shared[k];
  handMat.uniforms.uBaseColor = { value: world.materials.cloth.uniforms.uBaseColor.value.clone() };
  const handBase = handMat.uniforms.uBaseColor.value.clone();
  const BURNT = new THREE.Color(0.02, 0.008, 0.006);
  for (const side of [1, -1]) {
    const h = buildHand(handMat, side);
    h.group.position.set(0.026 * side, -0.07, 0.04);
    h.group.quaternion
      .setFromAxisAngle(new THREE.Vector3(0, 1, 0), (side * Math.PI) / 2)
      .multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 + 0.25));
    h.pose(1.05, 1);
    h.group.visible = false;
    em.group.add(h.group);
    grips[side] = h;
  }

  /** 'idle' · 'charging' · 'locked' (cancelado ou sem poder: espera soltar) */
  let state = 'idle';
  let held = 0; // s segurando
  let k = 0; // a carga efetiva (limitada pela célula)
  let o = 0; // a sobrecarga (0..1)
  /** o braço: ferido (0..1), até quando não responde (s, performance), destruído? */
  const arm = { hurt: 0, from: 0, until: 0, wrecked: false };
  const now = () => performance.now() / 1000;
  let capped = false; // a célula limitou a carga
  let cool = 0;
  let kick = 0;
  /** @type {{ t: number, p: number, y: number, applied: number, appliedY: number }|null} o coice da mira (recoil) */
  let rec = null;
  let field = null; // o mundo em que a carga começou
  let rumbleT = 0;
  let cancelReq = false;
  const keyDown = { key: false, mouse: false };
  /** Os testes seguram o gatilho por aqui (dev/beamtest.js). */
  let testHeld = null;
  let lastShot = null;
  const fx = createBeamFx(ctx); // o que se vê e se ouve (app/beamfx.js)
  const _d = new THREE.Vector3();
  const _a = new THREE.Vector3();
  const _m = new THREE.Vector3();
  const LIT = new THREE.Color(1.0, 0.88, 0.66);
  const DIM = new THREE.Color(0.05, 0.045, 0.04);

  const free = () => !ctx.rules.resources;
  const pressed = () => (testHeld ?? (keyDown.key || keyDown.mouse || !!controls.padFire));

  /** O que impede (ou interrompe) a carga agora — ou null. */
  function blocked() {
    if (controls.mode !== 'walk' && controls.mode !== 'fly') return 'modo';
    if (bindings.uiActive || ctx.people?.isOpen || ctx.inventory?.isOpen || ctx.reading?.isOpen) return 'painel';
    if (ctx.wake?.active) return 'desmaio';
    const w = controls.mode === 'walk' ? controls.walker : null;
    if (w?.ledgeState) return 'quina';
    if (w?.climbing) return 'escada';
    if (now() < arm.until) return 'braco';
    if (!ctx.inventory.sideOf('emitter')) return 'mao';
    if (!free() && player.energy.value < shotOf(0).cost) return 'celula';
    return null;
  }

  function cancel(why = 'cancelado') {
    if (state !== 'charging') return;
    state = 'locked';
    held = 0;
    k = 0;
    o = 0;
    controls.charging = false;
    audio.beamCharge?.(-1);
    world.bus.emit('player:beamCancel', { why });
  }

  function begin() {
    const why = blocked();
    if (why === 'mao') {
      ctx.inventory.equip('emitter'); // a mão pega o emissor; o próximo aperto carrega
      state = 'locked';
      return;
    }
    if (why) {
      world.bus.emit('player:beamBlocked', { why });
      if (why === 'braco') audio.deviceClick?.(false);
      if (why === 'celula') {
        audio.deviceClick?.(false);
        ctx.carried?.say?.(tr('device.beamWeak', { n: Math.round(shotOf(0).cost * 100) }), 2);
      }
      state = 'locked';
      return;
    }
    state = 'charging';
    held = 0;
    k = 0;
    o = 0;
    capped = false;
    field = world.field;
    cancelReq = false;
    controls.charging = true;
  }

  function release() {
    controls.charging = false;
    audio.beamCharge?.(-1);
    state = 'idle';
    if (chargeK(held) < 0) {
      audio.deviceClick?.(false); // um estalo seco: sem tiro, sem gasto
      held = 0;
      return;
    }
    fire(k, o);
    held = 0;
    o = 0;
  }

  /**
   * O chão debaixo de quem atira não se destrói (o corpo cairia): uma coluna protegida em volta
   * dos pés — [x, y0, z, raio, y1], GLOBAL (gen/cut.js inKeep). A exceção: o tiro que mira o chão
   * logo abaixo (o eixo entra na coluna abaixo dos pés). Só a pé.
   */
  function keepUnder(a, dir, t) {
    if (controls.mode !== 'walk' || !controls.walker) return null;
    const feet = controls.walker.feet.clone().add(world.origin);
    for (let s = 0; s <= Math.min(t, 25); s += 0.2) {
      const px = a.x + dir.x * s;
      const py = a.y + dir.y * s;
      const pz = a.z + dir.z * s;
      if (py < feet.y - 0.2 && Math.hypot(px - feet.x, pz - feet.z) < KEEP.aim) return null; // (atirando no chão debaixo de si)
    }
    return [feet.x, feet.y - KEEP.depth, feet.z, KEEP.r, feet.y + 0.3];
  }

  /**
   * O coice e o empurrão do tiro de carga kk (dir: para onde atirou), contínuos com a carga:
   *   coice     a mira sobe rápido e volta pela metade (~0,5 s), com um desvio de lado ao acaso;
   *             ~1° no mínimo, ~8° no cheio; a arma recua na mão
   *   empurrão  o corpo é jogado para trás do tiro: ~1 m/s no mínimo, ~10 m/s no cheio (no chão,
   *             ~0,25 a ~2,5 m; no ar vai mais longe). Atirar para baixo empurra para cima.
   */
  function recoil(kk, dir, oo = 0) {
    const amp = 0.018 + 0.12 * kk + 0.22 * oo;
    rec = { t: 0, p: amp, y: (Math.random() - 0.5) * (0.01 + 0.05 * kk + 0.12 * oo), applied: 0, appliedY: 0 };
    kick = 0.4 + 0.6 * kk + 0.8 * oo;
    // na sobrecarga o empurrão cresce muito mais que a carga: até ~40 m/s no limite
    const v = 1 + 9 * kk * kk + 30 * oo * oo;
    if (controls.mode === 'walk' && controls.walker) {
      const w = controls.walker;
      const h = Math.hypot(dir.x, dir.z);
      if (h > 1e-3) w.shove.set(w.shove.x - (dir.x / h) * v * h, 0, w.shove.z - (dir.z / h) * v * h);
      // a parte vertical: para baixo empurra para cima (no máximo 7 m/s); para cima, para baixo
      const up = Math.max(-v, Math.min(7 + 18 * oo, -dir.y * v));
      if (up > 0.3) {
        w.vel.y = Math.max(w.vel.y, 0) + up;
        w.grounded = false;
      } else if (up < 0 && !w.grounded) w.vel.y += up;
    } else if (controls.mode === 'fly') {
      controls.velocity.addScaledVector(dir, -v * 0.6);
    }
  }

  /** O tiro de carga kk (0..1) e sobrecarga oo (0..1). */
  function fire(kk, oo = 0) {
    const S = shotOf(kk, oo);
    if (!free()) player.energy.value = Math.max(0, player.energy.value - S.cost);
    cool = COOLDOWN;
    kick = 1;
    camera.getWorldDirection(_d);
    const eye = world.toGlobal(camera.position, new THREE.Vector3());
    _a.copy(eye).addScaledVector(_d, 0.6);
    const reach = beamReach(world.field, _a, _d, S.range);
    let { t, stop } = reach;
    // um chunk com o teto de cortes no caminho: o emissor engasga ali (o aparelho avisa)
    const jam = jamAt(world.field, _a, _d, t);
    if (jam < t) {
      t = jam;
      stop = 'jam';
      ctx.carried?.say?.(tr('device.beamJam'), 3);
    }
    const end = _a.clone().addScaledVector(_d, t);
    const a = _a.clone();
    if (t > 0.5) {
      const cut = { a: a.toArray(), b: end.toArray(), r: S.r };
      const keep = keepUnder(a, _d, t);
      if (keep) cut.keep = keep;
      world.addCut(cut, a);
    }
    // o que estava no caminho morre
    const ab = end.clone().sub(a);
    let kills = 0;
    for (const e of world.entities.list.values()) {
      if (e.dead) continue;
      _m.copy(e.feet).y += 1.1;
      const u = Math.max(0, Math.min(1, _m.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
      if (a.clone().addScaledVector(ab, u).distanceTo(_m) < S.r + 0.45) {
        world.entities.kill(e, 'beam');
        kills++;
      }
    }
    // os efeitos: o traço, a detonação correndo pela linha, a brasa, o que cai (app/beamfx.js)
    em.group.updateMatrixWorld(true);
    em.muzzle.getWorldPosition(_m);
    fx.fire(a, end, kk, S.r, _m.clone(), false, oo);
    // som, coice, atenção
    audio.beamShot?.(Math.min(1.6, kk + 0.6 * oo));
    controls.rumble?.(0.45 + 0.55 * kk + oo, 0.3 + 0.4 * kk + oo, 140 + 300 * kk + 500 * oo);
    recoil(kk, _d, oo);
    ctx.alert?.raise(eye.x, eye.y, eye.z, 0.08 + 0.23 * kk + 0.4 * oo);
    world.safeguards?.hear(eye.x, eye.y - 1.7, eye.z, 60 + 80 * kk + 200 * oo);
    // o braço paga a sobrecarga (Killy: muitas vezes o braço se desfaz no tiro)
    if (oo > 0.02) hurtArm(oo);
    lastShot = { k: kk, o: oo, ...S, t, stop, kills };
    world.bus.emit('player:beam', { k: kk, o: oo, length: t, stop, kills, x: end.x, y: end.y, z: end.z });
    return true;
  }

  /** O braço depois de um tiro em sobrecarga oo: sem responder um tempo; no limite, destruído. */
  function hurtArm(oo) {
    const wreck = oo >= ARM.wreck;
    const t = now();
    arm.hurt = Math.max(arm.hurt, oo);
    arm.wrecked = arm.wrecked || wreck;
    arm.from = t;
    arm.until = Math.max(arm.until, t + (wreck ? ARM.regen : ARM.lockMin + (ARM.lockMax - ARM.lockMin) * oo * oo));
    audio.impact?.(Math.min(1, 0.4 + oo * 0.6));
    controls.rumble?.(1, 1, wreck ? 900 : 300);
    world.bus.emit('player:arm', { o: oo, wreck, seconds: arm.until - t });
  }

  // teclado e mouse (o controle: controls.padFire / padCancel — controls/noclip.js)
  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (bindings.is('fire', e.code) && controls.locked) keyDown.key = true;
    if (bindings.is('run', e.code) && state === 'charging') cancelReq = true;
  });
  document.addEventListener('keyup', (e) => {
    if (bindings.is('fire', e.code)) keyDown.key = false;
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && controls.locked) keyDown.mouse = true;
    if (e.button === 2 && state === 'charging') cancelReq = true;
  });
  document.addEventListener('mouseup', (e) => {
    if (e.button === 0) keyDown.mouse = false;
  });
  window.addEventListener('blur', () => {
    keyDown.key = false;
    keyDown.mouse = false;
  });

  return {
    get state() {
      return state;
    },
    get k() {
      return k;
    },
    get capped() {
      return capped;
    },
    get lastShot() {
      return lastShot;
    },
    set testHeld(v) {
      testHeld = v;
    },
    get o() {
      return o;
    },
    /** o tempo de carga (s de jogo) */
    get held() {
      return held;
    },
    /** o braço: { hurt, until (s, performance), wrecked } */
    get arm() {
      return arm;
    },
    /** (testes) o braço inteiro de novo */
    healArm() {
      arm.hurt = 0;
      arm.until = 0;
      arm.wrecked = false;
    },
    cancel,
    fire,
    /** (medidas) os efeitos */
    get fx() {
      return fx;
    },
    update(dt) {
      cool = Math.max(0, cool - dt);
      kick = Math.max(0, kick - dt * 6);
      // o coice da mira: sobe em ~30 ms até p, depois assenta em 45% de p em ~0,35 s
      if (rec) {
        rec.t += dt;
        const env = (1 - Math.exp(-rec.t / 0.03)) * (0.45 + 0.55 * Math.exp(-rec.t / 0.35));
        const want = rec.p * env;
        const wantY = rec.y * env;
        controls.pitch = Math.max(-1.55, Math.min(1.55, controls.pitch + want - rec.applied));
        controls.yaw += wantY - rec.appliedY;
        rec.applied = want;
        rec.appliedY = wantY;
        if (rec.t > 1.5) rec = null;
      }
      const down = pressed();
      if (controls.padCancel && state === 'charging') cancelReq = true;
      controls.padCancel = false;
      if (state === 'locked' && !down) state = 'idle';
      else if (state === 'idle' && down && cool <= 0) begin();
      else if (state === 'charging') {
        const why = cancelReq ? 'botao' : world.field !== field ? 'mundo' : blocked();
        if (why) cancel(why);
        else if (!down) release();
        else {
          held += dt;
          const want = Math.max(0, chargeK(held));
          const wantO = overK(held);
          // a célula limita: a carga para onde ela alcança
          const e = player.energy.value;
          const kMax = free() ? 1 : Math.max(0, Math.min(1, (e - 0.03) / 0.15));
          const oMax = free() ? 1 : Math.max(0, Math.min(1, (e - 0.18) / 0.17));
          capped = want > kMax || wantO > oMax;
          k = Math.min(want, kMax);
          o = k >= 1 ? Math.min(wantO, oMax) : 0;
          const on = chargeK(held) >= 0;
          audio.beamCharge?.(on ? Math.min(1.6, k + 0.6 * o) : 0);
          rumbleT -= dt;
          if (rumbleT <= 0) {
            rumbleT = 0.1;
            controls.rumble?.(0.05 + 0.35 * k + 0.6 * o, 0.05 + 0.25 * k + 0.6 * o, 130);
          }
          // o aparelho mostra o gasto que o tiro terá — e a sobrecarga
          if (on) {
            const n = Math.round(shotOf(k, o).cost * 100);
            const msg = o >= ARM.wreck ? tr('device.beamLimit', { n }) : o > 0 ? tr('device.beamOver', { n, lvl: '▲'.repeat(1 + Math.min(2, Math.floor(o * 3))) }) : tr(capped ? 'device.beamCapped' : 'device.beamCharge', { n });
            if (!free() || o > 0) ctx.carried?.say?.(msg, 0.25);
          }
        }
      }

      // o braço: sem responder (a mira treme, a luva queimada) — ou destruído, se regenerando
      const tn = now();
      if (arm.until && tn >= arm.until) {
        arm.hurt = 0;
        arm.until = 0;
        arm.wrecked = false;
      }
      const left = arm.until ? (arm.until - tn) / Math.max(1e-3, arm.until - arm.from) : 0;
      handMat.uniforms.uBaseColor.value.copy(handBase).lerp(BURNT, Math.min(1, arm.hurt * 1.4) * left);
      if (arm.until && controls.mode !== 'fly') {
        const a = 0.0025 * arm.hurt * left;
        controls.yaw += Math.sin(tn * 9.1) * a * dt * 9;
        controls.pitch += Math.sin(tn * 7.3 + 1) * a * dt * 9;
      }
      if (arm.until && ctx.inventory.sideOf('emitter')) ctx.carried?.say?.(tr(arm.wrecked ? 'device.beamArmGone' : 'device.beamArm', { s: Math.ceil(arm.until - tn) }), 0.3);
      const walker = controls.walker;
      if (walker && !walker.onSlam) {
        // bater numa parede no empurrão: um baque
        walker.onSlam = (v) => {
          audio.impact?.(Math.min(1, v / 40));
          controls.rumble?.(Math.min(1, v / 30), Math.min(1, v / 40), 250);
        };
      }

      const side = ctx.inventory.sideOf('emitter');
      const busy = !!(controls.mode === 'walk' && controls.walker?.ledgeState);
      em.group.visible = !!side && !busy && !ctx.wake?.active && !arm.wrecked;
      if (em.group.visible) {
        const shake = state === 'charging' ? 0.0025 * k + 0.012 * o : 0;
        em.group.position.set(0.15 * side + (Math.random() - 0.5) * shake, -0.14 + kick * 0.01 + (Math.random() - 0.5) * shake, -0.3 + kick * 0.05);
        em.group.rotation.set(kick * 0.15, 0, 0);
        const lit = state === 'charging' ? k * 5 : 0;
        // (as bobinas tomam a cor da sobrecarga: branco quente → azul → violeta — beamfx.js beamColors)
        const lc = o > 0 ? beamColors(1 + o).halo : LIT;
        em.coils.forEach((mat, i) => mat.color.copy(DIM).lerp(lc, Math.max(0, Math.min(1, lit - i))));
      }
      for (const s of [1, -1]) grips[s].group.visible = side === s;
      if (state === 'charging' && chargeK(held) >= 0) {
        em.group.updateMatrixWorld(true);
        em.muzzle.getWorldPosition(_m);
        fx.charge(k, _m, o);
      } else fx.charge(-1);
      fx.update(dt);
    },
  };
}
