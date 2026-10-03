// ─────────────────────────────────────────────────────────────────────────────
//  O emissor de feixe gravitacional — a arma de Killy (o cofre, Arma-do-Killy, fase F2).
//
//  Uma ferramenta (app/inventory.js: vai para a mão pela regra das mãos). A POTÊNCIA
//  é o tempo segurando o gatilho, sem níveis (§5.2):
//    t < 0,25 s     não atira (um estalo seco, sem gasto)
//    u = (t − 0,25) / 2,25 (0..1, até 2,5 s) · k = 1 − (1 − u)²
//    alcance 30 → 400 m · raio 0,6 → 2,8 m · gasto 3 → 18% da célula (5 cheios = 90%)
//  Segurar além do cheio mantém a carga. A célula não tem o bastante: a carga para onde
//  ela alcança. Entre tiros, 0,8 s.
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
import { createBeamFx } from './beamfx.js';
import { cutHitsBoxes } from '../gen/cut.js';
import { CHUNK } from '../gen/field.js';

export const CHARGE = { min: 0.25, full: 2.5 };
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
/** O tiro de carga k. */
export function shotOf(k) {
  return { range: 30 + 370 * k, r: 0.6 + 2.2 * k, cost: 0.03 + 0.15 * k };
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
  for (const side of [1, -1]) {
    const h = buildHand(world.materials.cloth, side);
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
  let capped = false; // a célula limitou a carga
  let cool = 0;
  let kick = 0;
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
    if (!ctx.inventory.sideOf('emitter')) return 'mao';
    if (!free() && player.energy.value < shotOf(0).cost) return 'celula';
    return null;
  }

  function cancel(why = 'cancelado') {
    if (state !== 'charging') return;
    state = 'locked';
    held = 0;
    k = 0;
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
    fire(k);
    held = 0;
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

  /** O tiro de carga kk (0..1). */
  function fire(kk) {
    const S = shotOf(kk);
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
    fx.fire(a, end, kk, S.r, _m.clone());
    // som, coice, atenção
    audio.beamShot?.(kk);
    controls.rumble?.(0.45 + 0.55 * kk, 0.3 + 0.4 * kk, 140 + 300 * kk);
    controls.pitch = Math.min(1.5, controls.pitch + 0.01 + 0.05 * kk);
    // na carga cheia, o corpo recua um passo
    if (controls.mode === 'walk' && controls.walker && kk > 0.6) controls.walker.vel.addScaledVector(_d.clone().setY(0).normalize(), -3.5 * (kk - 0.6) / 0.4);
    ctx.alert?.raise(eye.x, eye.y, eye.z, 0.08 + 0.23 * kk);
    world.safeguards?.hear(eye.x, eye.y - 1.7, eye.z, 60 + 80 * kk);
    lastShot = { k: kk, ...S, t, stop, kills };
    world.bus.emit('player:beam', { k: kk, length: t, stop, kills, x: end.x, y: end.y, z: end.z });
    return true;
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
    cancel,
    fire,
    /** (medidas) os efeitos */
    get fx() {
      return fx;
    },
    update(dt) {
      cool = Math.max(0, cool - dt);
      kick = Math.max(0, kick - dt * 6);
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
          // a célula limita: a carga para onde ela alcança
          const kMax = free() ? 1 : Math.max(0, Math.min(1, (player.energy.value - 0.03) / 0.15));
          capped = want > kMax;
          k = Math.min(want, kMax);
          const on = chargeK(held) >= 0;
          audio.beamCharge?.(on ? k : 0);
          rumbleT -= dt;
          if (rumbleT <= 0) {
            rumbleT = 0.1;
            controls.rumble?.(0.05 + 0.35 * k, 0.05 + 0.25 * k, 130);
          }
          // o aparelho mostra o gasto que o tiro terá
          if (!free() && on) ctx.carried?.say?.(tr(capped ? 'device.beamCapped' : 'device.beamCharge', { n: Math.round(shotOf(k).cost * 100) }), 0.25);
        }
      }

      const side = ctx.inventory.sideOf('emitter');
      const busy = !!(controls.mode === 'walk' && controls.walker?.ledgeState);
      em.group.visible = !!side && !busy && !ctx.wake?.active;
      if (em.group.visible) {
        const shake = state === 'charging' ? 0.0025 * k : 0;
        em.group.position.set(0.15 * side + (Math.random() - 0.5) * shake, -0.14 + kick * 0.01 + (Math.random() - 0.5) * shake, -0.3 + kick * 0.05);
        em.group.rotation.set(kick * 0.15, 0, 0);
        const lit = state === 'charging' ? k * 5 : 0;
        em.coils.forEach((mat, i) => mat.color.copy(DIM).lerp(LIT, Math.max(0, Math.min(1, lit - i))));
      }
      for (const s of [1, -1]) grips[s].group.visible = side === s;
      if (state === 'charging' && chargeK(held) >= 0) {
        em.group.updateMatrixWorld(true);
        em.muzzle.getWorldPosition(_m);
        fx.charge(k, _m);
      } else fx.charge(-1);
      fx.update(dt);
    },
  };
}
