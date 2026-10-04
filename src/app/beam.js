// ─────────────────────────────────────────────────────────────────────────────
//  O emissor de feixe gravitacional — a arma de Killy (o cofre, Arma-do-Killy, fase F2).
//
//  Uma ferramenta (app/inventory.js: vai para a mão pela regra das mãos). A POTÊNCIA
//  é o tempo segurando o gatilho, sem níveis (§5.2):
//    t < 0,25 s     não atira (um estalo seco, sem gasto)
//    u = (t − 0,25) / 2,25 (0..1, até 2,5 s) · k = 1 − (1 − u)²
//    alcance 30 → 400 m · raio 0,6 → 2,8 m · gasto 3 → 18% da célula (5 cheios = 90%)
//  Segurar além do cheio: de 2,5 a 3 s a carga fica no cheio; de 3 a 6,5 s, a SOBRECARGA
//  (o, 0..1 — 2026-10-03, pedido do usuário), em ESTÁGIOS que se anunciam (um baque, um pulso
//  na lente, as bobinas mudando de cor de uma vez — `STAGES`):
//    1 azul (o > 0) · 2 violeta (1/3) · 3 a singularidade se formando na mira (2/3) ·
//    LIMITE (6,5 s): SINGULARIDADE — o traço preto que engole a luz
//  E ALÉM (2026-10-03, pedido do usuário — o braço é perdido): 5 ESPAGUETIFICAÇÃO (8 s) ·
//    6 HORIZONTE (9,5 s) · 7 COLAPSO (11 s) — o furo até ~19 m e 2000 m, o empurrão até
//    ~175 m/s; ao disparar num desses, o BRAÇO que segura o emissor se desfaz (perdido —
//    `player.arms`; o emissor volta ao inventário; recuperar: o cofre, Ideias/Futuro/Recuperar-o-braco).
//    No Livre (sem custos) ele volta sozinho em 30 s.
//  O furo vai a 7,5 m de raio e 1000 m; o empurrão cresce muito mais que a carga (~95 m/s no
//  limite, e o corpo sai do chão). Sem perder a arma: o custo da sobrecarga vai para a vida
//  (app/health.js — BEAM_DAMAGE: violeta 5%, a singularidade se formando 12%, o limite e além 30%).
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
import { buildHand, paintHand, handMaterial } from './hands.js';
import { beamReach } from '../gen/beamreach.js';
import { createBeamFx, beamColors } from './beamfx.js';
import { cutHitsBoxes } from '../gen/cut.js';
import { CHUNK } from '../gen/field.js';
import { BEAM_DAMAGE, slamDamage } from './health.js';
import { resistOf } from '../world/levels.js';

export const CHARGE = { min: 0.25, full: 2.5, hold: 3.0, over: 6.5, beyond: 11.0 };
/** O estágio a partir do qual o braço que atira é perdido. */
export const ARM_LOSS_STAGE = 5;
/** No Livre (sem custos), o braço volta sozinho depois disto (s). */
export const ARM_REGROW_FREE = 30;
/** Os estágios da sobrecarga (o, 0..2): 1 azul, 2 violeta, 3 a singularidade se formando, 4 o LIMITE
 *  (singularidade) — e além: 5 espaguetificação, 6 horizonte, 7 colapso (o braço é perdido). */
export const STAGES = [0, 1e-3, 1 / 3, 2 / 3, 1, 4 / 3, 5 / 3, 2];
/** O estágio de uma sobrecarga o (0 = sem sobrecarga … 4 = o limite). */
export function stageOf(o) {
  let s = 0;
  for (let i = 1; i < STAGES.length; i++) if (o >= STAGES[i] - 1e-6) s = i;
  return s;
}
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
  if (t <= CHARGE.over) return (t - CHARGE.hold) / (CHARGE.over - CHARGE.hold);
  return 1 + Math.min(1, (t - CHARGE.over) / (CHARGE.beyond - CHARGE.over));
}
/** O tiro de carga k e sobrecarga o. */
export function shotOf(k, o = 0) {
  // (o furo cresce mais no fim: 7,7 m de raio no limite — e além, até ~19 m: um túnel que um prédio atravessa)
  const a = Math.min(1, o);
  const b = Math.max(0, o - 1);
  return {
    range: 30 + 370 * k + 600 * a + 1000 * b,
    r: 0.6 + 2.2 * k + 2.4 * a + 2.5 * a * a * a + 5 * b + 6 * b * b,
    cost: 0.03 + 0.15 * k + 0.17 * a + 0.15 * b,
    // o dano nos seres (o cofre, Dano-do-emissor §1), em "vidas" de um ser de resistência 1:
    // a carga 0,3 → 1; a sobrecarga até 3 no limite; além, 4 e 5; o COLAPSO (estágio 7) mata qualquer um
    dmg: o >= STAGES[7] - 1e-6 ? Infinity : o > 1 ? 3 + 3 * (o - 1) : o > 0 ? 1 + 2 * o : 0.3 + 0.7 * k,
  };
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
  let o = 0; // a sobrecarga (0..1)
  let stage = 0; // o estágio da sobrecarga carregando (stageOf)
  player.arms ??= { right: true, left: true };
  /** no Livre: quando cada braço perdido volta (s, performance) */
  const armRegrow = { right: 0, left: 0 };
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
  /** @type {any} */
  let lastShot = null;
  /** @type {(() => void)|null} o que fica para o quadro seguinte ao tiro (som, vibração, atenção) */
  let afterFire = null;
  let gripKinds = '';
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
    if (ctx.arms?.busy) return 'camara'; // (no berço, ou instalando a prótese)
    const w = controls.mode === 'walk' ? controls.walker : null;
    if (w?.ledgeState) return 'quina';
    if (w?.climbing) return 'escada';
    if (w?.thrown) return 'arremesso';
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
    stage = 0;
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
    o = 0;
    stage = 0;
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
    stage = 0;
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
    const oa = Math.min(1, oo);
    const ob = Math.max(0, oo - 1);
    const amp = 0.018 + 0.12 * kk + 0.12 * oa + 0.25 * oa ** 4 + 0.15 * ob;
    rec = { t: 0, p: amp, y: (Math.random() - 0.5) * (0.01 + 0.05 * kk + 0.2 * oo ** 3), applied: 0, appliedY: 0 };
    kick = 0.4 + 0.6 * kk + 1.5 * oo;
    // na sobrecarga o empurrão cresce muito mais que a carga: ~95 m/s no limite
    const v = 1 + 9 * kk * kk + 25 * oa * oa + 60 * oa ** 4 + 80 * ob * ob; // (~175 m/s no colapso)
    if (controls.mode === 'walk' && controls.walker) {
      const w = controls.walker;
      const h = Math.hypot(dir.x, dir.z);
      if (h > 1e-3) w.shove.set(w.shove.x - (dir.x / h) * v * h, 0, w.shove.z - (dir.z / h) * v * h);
      // a parte vertical: para baixo empurra para cima (no máximo 7 m/s); para cima, para baixo
      const up = Math.max(-v, Math.min(7 + 18 * oa, -dir.y * v));
      // (perto do limite o corpo sai do chão — voa para trás num arco)
      const lift = 6 * oa ** 4 + 2 * ob;
      if (up + lift > 0.3) {
        w.vel.y = Math.max(w.vel.y, 0) + Math.max(0, up) + lift;
        w.grounded = false;
      } else if (up < 0 && !w.grounded) w.vel.y += up;
    } else if (controls.mode === 'fly') {
      controls.velocity.addScaledVector(dir, -v * 0.6);
    }
  }

  /** O tiro de carga kk (0..1) e sobrecarga oo (0..1). */
  function fire(kk, oo = 0) {
    // (o tempo de cada etapa — o profile mostra: dev/profile.js)
    const T = [performance.now()];
    const mark = () => T.push(performance.now());
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
    mark();
    if (t > 0.5) {
      const cut = { a: a.toArray(), b: end.toArray(), r: S.r };
      const keep = keepUnder(a, _d, t);
      if (keep) cut.keep = keep;
      world.addCut(cut, a);
    }
    mark();
    // o que estava no caminho: o dano pela carga e pela resistência de cada um (o cofre, Dano-do-emissor):
    // em cheio (o centro do corpo dentro do furo) ×1, de raspão (até 0,45 m fora) ×0,5; o colapso mata
    const ab = end.clone().sub(a);
    let kills = 0;
    let hurt = 0;
    for (const e of world.entities.list.values()) {
      if (e.dead) continue;
      _m.copy(e.feet).y += 1.1;
      const u = Math.max(0, Math.min(1, _m.clone().sub(a).dot(ab) / (ab.lengthSq() || 1)));
      const d = a.clone().addScaledVector(ab, u).distanceTo(_m);
      if (d >= S.r + 0.45) continue;
      if (S.dmg === Infinity) world.entities.kill(e, 'beam');
      else world.entities.damage(e, (S.dmg * (d < S.r ? 1 : 0.5)) / resistOf(e), 'beam');
      if (e.dead) kills++;
      else hurt++;
    }
    mark();
    // os efeitos: o traço, a detonação correndo pela linha, a brasa, o que cai (app/beamfx.js)
    em.group.updateMatrixWorld(true);
    em.muzzle.getWorldPosition(_m);
    fx.fire(a, end, kk, S.r, _m.clone(), false, oo);
    mark();
    // o coice agora; o som, a vibração e a atenção no próximo quadro (16 ms — ninguém nota; o
    // quadro do tiro fica leve)
    recoil(kk, _d, oo);
    afterFire = () => {
      audio.beamShot?.(Math.min(1.6, kk + 0.6 * oo));
      controls.rumble?.(0.45 + 0.55 * kk + oo, 0.3 + 0.4 * kk + oo, 140 + 300 * kk + 500 * oo);
      ctx.alert?.raise(eye.x, eye.y, eye.z, 0.08 + 0.23 * kk + 0.4 * oo);
      world.safeguards?.hear(eye.x, eye.y - 1.7, eye.z, 60 + 80 * kk + 200 * oo);
    };
    mark();
    // além do limite, o braço que segura o emissor se desfaz
    const lost = stageOf(oo) >= ARM_LOSS_STAGE ? loseArm(_m.clone()) : null;
    // a sobrecarga cobra do corpo (app/health.js): a mão queima, a mira treme — pode zerar (V6)
    const self = BEAM_DAMAGE[stageOf(oo)];
    if (self > 0) ctx.health?.damage('beam', self);
    mark();
    lastShot = { k: kk, o: oo, ...S, t, stop, kills, hurt, lost, bodyHurt: BEAM_DAMAGE[stageOf(oo)] };
    world.bus.emit('player:beam', { k: kk, o: oo, length: t, stop, kills, x: end.x, y: end.y, z: end.z });
    mark();
    const names = ['alcance', 'corte', 'mortes', 'efeitos', 'som/coice/alerta', 'braço', 'avisos'];
    lastShot.ms = names.map((n, i) => `${n} ${(T[i + 1] - T[i]).toFixed(1)}`).join(' · ');
    return true;
  }

  /** O braço que segura o emissor se desfaz (muzzle: a boca, na cena). Devolve 'right' | 'left' | null. */
  function loseArm(muzzle) {
    const side = ctx.inventory.sideOf('emitter');
    if (!side) return null;
    const which = side === 1 ? 'right' : 'left';
    player.arms[which] = false;
    player.hands[which] = null; // (o emissor volta ao inventário)
    if (free()) armRegrow[which] = performance.now() / 1000 + ARM_REGROW_FREE;
    fx.armBurst(muzzle);
    audio.impact?.(1);
    controls.rumble?.(1, 1, 900);
    ctx.carried?.say?.(tr(which === 'right' ? 'device.armLostRight' : 'device.armLostLeft'), 5);
    world.bus.emit('player:armLost', { arm: which });
    return which;
  }

  // ferido sem morrer (o cofre, Dano-do-emissor §4): as máquinas soltam faíscas; os humanos, um baque
  world.bus.on('being:hurt', (ev) => {
    if (ev.cause !== 'beam' || ev.hp <= 0) return;
    const g = new THREE.Vector3(ev.x, ev.y + 1.3, ev.z);
    const [pan, dist] = ctx.placeOf(g.x, g.y, g.z);
    if (ev.kind === 'safeguard' || ev.kind === 'silicon') {
      fx.hitSparks(g);
      audio.clangAt?.(pan, Math.max(1, dist));
    } else audio.impact?.(Math.min(14, 6 + 8 * (ev.amount ?? 0)));
  });

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
    /** o estágio da sobrecarga carregando (0 … 7) */
    get stage() {
      return stage;
    },
    /** (testes) os dois braços de volta */
    restoreArms() {
      player.arms.right = true;
      player.arms.left = true;
    },
    cancel,
    fire,
    /** (medidas) os efeitos */
    get fx() {
      return fx;
    },
    update(dt) {
      if (afterFire) {
        const f = afterFire;
        afterFire = null;
        f();
      }
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
          const oMax = free() ? 2 : e < 0.35 ? Math.max(0, (e - 0.18) / 0.17) : Math.min(2, 1 + (e - 0.35) / 0.15);
          capped = want > kMax || wantO > oMax;
          k = Math.min(want, kMax);
          o = k >= 1 ? Math.min(wantO, oMax) : 0;
          // um estágio novo se anuncia: um baque, um pulso na lente, as bobinas mudando de uma vez
          const st = stageOf(o);
          if (st > stage) {
            stage = st;
            // R7: com um braço só, o primeiro estágio que custa o braço avisa — um tom próprio
            const lastArm = !free() && player.arms.right !== player.arms.left;
            audio.beamStage?.(st, lastArm && st === ARM_LOSS_STAGE);
            if (lastArm && st === ARM_LOSS_STAGE) world.bus.emit('player:lastArmWarn', {});
            controls.rumble?.(0.4 + 0.15 * st, 0.3 + 0.15 * st, 200 + 80 * st);
            fx.stagePulse(st);
            world.bus.emit('player:beamStage', { stage: st });
          }
          const on = chargeK(held) >= 0;
          audio.beamCharge?.(on ? Math.min(2.2, k + 0.6 * o) : 0);
          rumbleT -= dt;
          if (rumbleT <= 0) {
            rumbleT = 0.1;
            controls.rumble?.(0.05 + 0.35 * k + 0.6 * o, 0.05 + 0.25 * k + 0.6 * o, 130);
          }
          // o aparelho mostra o gasto que o tiro terá — e a sobrecarga
          if (on) {
            const n = Math.round(shotOf(k, o).cost * 100);
            const lastArm = !free() && player.arms.right !== player.arms.left;
            const msg =
              stage >= ARM_LOSS_STAGE && lastArm
                ? Math.floor(performance.now() / 280) % 2
                  ? tr('device.beamLastArm', { n })
                  : ''
                : stage >= ARM_LOSS_STAGE
                ? tr('device.beamBeyond', { n, name: tr(`beam.stage.${stage}`) })
                : stage >= 4
                  ? tr('device.beamLimit', { n })
                  : o > 0
                    ? tr('device.beamOver', { n, lvl: '▲'.repeat(Math.min(3, stage)) })
                    : tr(capped ? 'device.beamCapped' : 'device.beamCharge', { n });
            if (!free() || o > 0) ctx.carried?.say?.(msg, 0.25);
          }
        }
      }

      const tn = performance.now() / 1000;
      for (const which of ['right', 'left']) {
        if (armRegrow[which] && tn >= armRegrow[which]) {
          armRegrow[which] = 0;
          player.arms[which] = true;
          ctx.carried?.say?.(tr('device.armBack'), 3);
        }
      }
      const walker = controls.walker;
      if (walker) {
        const anyArm = player.arms.right || player.arms.left;
        walker.canGrab = anyArm;
        walker.canClimb = anyArm;
      }
      if (walker && !walker.onSlam) {
        // bater numa parede no empurrão: um baque. Só arremessado por um hostil (walker.thrown)
        // o choque tira vida — o próprio coice do emissor, não (o cofre, Barra-de-vida §2)
        walker.onSlam = (v) => {
          audio.impact?.(Math.min(1, v / 40));
          controls.rumble?.(Math.min(1, v / 30), Math.min(1, v / 40), 250);
          if (walker.thrown) {
            walker.thrownSlam = v;
            ctx.health?.damage('slam', slamDamage(v));
          }
        };
      }

      const side = ctx.inventory.sideOf('emitter');
      const busy = !!(controls.mode === 'walk' && controls.walker?.ledgeState);
      em.group.visible = !!side && !busy && !ctx.wake?.active;
      if (em.group.visible) {
        const shake = state === 'charging' ? 0.0025 * k + 0.006 * stage + 0.012 * (stage >= 4 ? 1 : 0) + 0.01 * Math.max(0, stage - 4) : 0;
        em.group.position.set(0.15 * side + (Math.random() - 0.5) * shake, -0.14 + kick * 0.01 + (Math.random() - 0.5) * shake, -0.3 + kick * 0.05);
        em.group.rotation.set(kick * 0.15, 0, 0);
        const lit = state === 'charging' ? k * 5 : 0;
        // (as bobinas tomam a cor da sobrecarga: branco quente → azul → violeta — beamfx.js beamColors)
        const lc = o > 0 ? beamColors(1 + o).halo : LIT;
        // (no limite as bobinas pulsam — a singularidade puxando a própria luz delas)
        const pulse = stage >= 4 ? 0.55 + 0.45 * Math.sin(performance.now() / (stage >= ARM_LOSS_STAGE ? 25 : 45)) : 1;
        em.coils.forEach((mat, i) => mat.color.copy(DIM).lerp(lc, Math.max(0, Math.min(1, lit - i)) * pulse));
      }
      for (const s of [1, -1]) grips[s].group.visible = side === s;
      // a prótese: a mão de metal segura o emissor (R4)
      const kk = `${player.armKind?.right}|${player.armKind?.left}`;
      if (kk !== gripKinds) {
        gripKinds = kk;
        for (const s of [1, -1]) paintHand(grips[s].group, handMaterial(world, s > 0 ? player.armKind?.right : player.armKind?.left));
      }
      if (state === 'charging' && chargeK(held) >= 0) {
        em.group.updateMatrixWorld(true);
        em.muzzle.getWorldPosition(_m);
        fx.charge(k, _m, o);
      } else fx.charge(-1);
      fx.update(dt);
    },
  };
}
