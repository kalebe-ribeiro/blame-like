// ─────────────────────────────────────────────────────────────────────────────
//  O emissor de feixe gravitacional — a arma de Killy (ver o cofre, Arma-do-Killy).
//
//  Uma ferramenta (app/inventory.js: vai para a mão pela regra das mãos). Atira
//  para onde se olha e FURA o que estiver no caminho, deixando um buraco redondo
//  (world/holes.js — o método "de shader") — mas NÃO fura as camadas
//  intransponíveis nem as estruturas únicas: o feixe acaba nelas.
//
//  POTÊNCIA (1–5, ajustável — atalho 'power'): muda o alcance, o raio do feixe e
//  o gasto da célula por tiro. Na máxima, uma célula cheia dá 5 tiros.
//
//    potência   alcance   raio    gasto
//       1         30 m    0,5 m    4%
//       2         60 m    0,9 m    7%
//       3        120 m    1,4 m   11%
//       4        220 m    2,0 m   15%
//       5        400 m    2,8 m   19%
//
//  O que o feixe atravessa morre (Safeguards, moradores, andarilhos, vida de
//  silício — world/entities.js kill 'beam'). Atirar chama atenção: o alerta do
//  setor sobe (mais com mais potência) e quem estiver perto ouve.
//  No modo Livre não gasta a célula.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { bindings } from '../controls/bindings.js';
import { t as tr } from '../i18n/index.js';
import { buildHand } from './hands.js';

export const POWER = [
  { range: 30, r: 0.5, cost: 0.04 },
  { range: 60, r: 0.9, cost: 0.07 },
  { range: 120, r: 1.4, cost: 0.11 },
  { range: 220, r: 2.0, cost: 0.15 },
  { range: 400, r: 2.8, cost: 0.19 },
];
const COOLDOWN = 0.9; // s entre tiros
const BEAM_SHOW = 0.45; // s que o feixe fica visível
const UNIQUE_MARGIN = 1; // m em volta de uma estrutura única (as paredes dela)
const UNIQUE_WALL = 3.2; // a espessura das paredes de uma única (gen/macrogen.js shell, T = 3) e uma folga

/**
 * O trecho do feixe de a (GLOBAL) na direção dir, até `range` — cortado onde ele
 * encontra uma camada intransponível ou uma estrutura única. Puro (só o Field).
 * Devolve { t (m percorridos), stop: null | 'layer' | 'unique' }.
 */
export function beamReach(F, a, dir, range) {
  let t = range;
  let stop = null;
  // as camadas: uma faixa horizontal infinita [bottom, top]; o feixe acaba ao entrar nela
  // (onde a laje existe — uma passagem aberta deixa passar)
  const y0 = a.y;
  const y1 = a.y + dir.y * range;
  for (const b of F.barriersNear((y0 + y1) / 2)) {
    for (const y of [b.top, b.bottom]) {
      if (Math.abs(dir.y) < 1e-5) continue;
      const tt = (y - a.y) / dir.y;
      if (tt <= 0 || tt >= t) continue;
      const x = a.x + dir.x * tt;
      const z = a.z + dir.z * tt;
      if (F.barrierSolid(b, x, z)) {
        t = tt;
        stop = 'layer';
      }
    }
    // começou dentro da laje (encostado nela)
    if (a.y > b.bottom && a.y < b.top && F.barrierSolid(b, a.x, a.z)) return { t: 0, stop: 'layer' };
  }
  // as estruturas únicas: a caixa do prédio (interseção raio × caixa). De fora, o feixe
  // acaba na parede de fora; de dentro (dá para entrar nelas), atira-se, mas ele acaba
  // nas paredes — não sai por elas.
  for (const u of F.uniquesNear(a.x + dir.x * range * 0.5, a.y + dir.y * range * 0.5, a.z + dir.z * range * 0.5, range)) {
    const top = u.y + u.h + (u.kind === 'antenna' ? 130 : 6); // (o mastro da antena é alto)
    const o = [a.x, a.y, a.z];
    const d = [dir.x, dir.y, dir.z];
    const slab = (mn, mx) => {
      let tin = -Infinity;
      let tout = Infinity;
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-8) {
          if (o[k] < mn[k] || o[k] > mx[k]) return null;
          continue;
        }
        let ta = (mn[k] - o[k]) / d[k];
        let tb = (mx[k] - o[k]) / d[k];
        if (ta > tb) [ta, tb] = [tb, ta];
        tin = Math.max(tin, ta);
        tout = Math.min(tout, tb);
      }
      return tin > tout || tout <= 0 ? null : { tin, tout };
    };
    const outer = slab([u.x - u.hx - UNIQUE_MARGIN, u.y - 2, u.z - u.hz - UNIQUE_MARGIN], [u.x + u.hx + UNIQUE_MARGIN, top, u.z + u.hz + UNIQUE_MARGIN]);
    if (!outer) continue; // não cruza a caixa
    let hit = outer.tin;
    if (outer.tin <= 0) {
      // de dentro: até a face de dentro das paredes (e do teto)
      const W = UNIQUE_WALL;
      const inner = slab([u.x - u.hx + W, u.y - 2, u.z - u.hz + W], [u.x + u.hx - W, u.y + u.h - 1, u.z + u.hz - W]);
      hit = inner && inner.tin <= 0 ? inner.tout : 0; // (dentro da própria parede: nada)
    }
    if (hit < t) {
      t = hit;
      stop = 'unique';
    }
  }
  return { t: Math.max(0, t), stop };
}

/** O emissor: um corpo de chapa com a bobina na frente e cinco marcas de potência em cima. */
function buildEmitter(m) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.06, 0.2), m.machine);
  body.position.z = -0.04;
  g.add(body);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.16, 10), m.machine);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.012, -0.2);
  g.add(barrel);
  for (let i = 0; i < 3; i++) {
    const coil = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 6, 14), m.machine);
    coil.position.set(0, 0.012, -0.16 - i * 0.035);
    g.add(coil);
  }
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.09, 0.04), m.machine);
  grip.position.set(0, -0.06, 0.03);
  grip.rotation.x = 0.25;
  g.add(grip);
  // as marcas de potência: acesas até a potência escolhida
  const marks = [];
  for (let i = 0; i < 5; i++) {
    const mk = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.004, 0.012), new THREE.MeshBasicMaterial({ color: 0x151412 }));
    mk.position.set(-0.016 + i * 0.008, 0.032, -0.02);
    g.add(mk);
    marks.push(mk);
  }
  const muzzle = new THREE.Object3D();
  muzzle.position.set(0, 0.012, -0.29);
  g.add(muzzle);
  return { group: g, marks, muzzle };
}

export function createBeam(ctx) {
  const { camera, world, controls, audio } = ctx;
  const player = ctx.player;
  const em = buildEmitter(world.materials);
  em.group.visible = false;
  camera.add(em.group);
  // a mão no cabo (uma para cada lado; luva de tecido, como as outras)
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
  let power = Math.min(5, Math.max(1, player.beamPower ?? 3));
  let cool = 0;
  let kick = 0; // o coice (a arma recua e volta)
  const beams = []; // { mesh, t }
  const LIT = new THREE.Color(1.0, 0.86, 0.6);
  const DIM = new THREE.Color(0.08, 0.075, 0.07);
  const _a = new THREE.Vector3();
  const _d = new THREE.Vector3();
  const _m = new THREE.Vector3();

  const free = () => !ctx.rules.resources;
  world.holes.load(ctx.slot.holes);

  function setPower(p) {
    power = ((p - 1 + 5) % 5) + 1;
    player.beamPower = power;
    audio.deviceClick?.(true);
  }

  function fire() {
    if (ctx.wake?.active || controls.mode !== 'walk' && controls.mode !== 'fly') return false;
    if (ctx.people?.isOpen || ctx.inventory?.isOpen || ctx.reading?.isOpen) return false;
    if (controls.walker?.ledgeState) return false; // pendurado: as duas mãos estão na quina
    if (!ctx.inventory.sideOf('emitter')) {
      ctx.inventory.equip('emitter'); // a mão pega o emissor (a regra das mãos); o próximo aperto atira
      return false;
    }
    if (cool > 0) return false;
    const P = POWER[power - 1];
    const en = player.energy;
    if (!free() && en.value < P.cost) {
      audio.deviceClick?.(false);
      ctx.carried?.say?.(tr('device.beamWeak', { n: Math.round(P.cost * 100) }), 2);
      return false;
    }
    if (!free()) en.value = Math.max(0, en.value - P.cost);
    cool = COOLDOWN;
    kick = 1;
    // de onde e para onde: do centro dos olhos para onde se olha
    camera.getWorldDirection(_d);
    const eye = world.toGlobal(camera.position, new THREE.Vector3());
    _a.copy(eye).addScaledVector(_d, 0.6);
    const { t, stop } = beamReach(world.field, _a, _d, P.range);
    const end = _a.clone().addScaledVector(_d, t);
    if (t > 0.5) world.holes.add(_a, end, P.r);
    // o que estava no caminho morre
    for (const e of world.entities.list.values()) {
      if (e.dead) continue;
      _m.copy(e.feet).y += 1.1;
      const ab = end.clone().sub(_a);
      const u = Math.max(0, Math.min(1, _m.clone().sub(_a).dot(ab) / (ab.lengthSq() || 1)));
      if (_a.clone().addScaledVector(ab, u).distanceTo(_m) < P.r + 0.45) world.entities.kill(e, 'beam');
    }
    // o feixe visível: da boca da arma até onde acabou
    em.muzzle.getWorldPosition(_m);
    const len = Math.max(0.1, _m.distanceTo(end.clone().sub(world.origin)));
    const geo = new THREE.CylinderGeometry(P.r * 0.55, P.r * 0.55, 1, 16, 1, true);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: 0xfff1d8, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(_m);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(world.origin).sub(_m).normalize());
    mesh.scale.set(1, len, 1);
    mesh.frustumCulled = false;
    mesh.userData.noCollide = true;
    ctx.scene.add(mesh);
    beams.push({ mesh, t: 0, origin: world.origin.clone() });
    // som, coice, atenção
    audio.beamShot?.(power, stop);
    controls.rumble?.(0.4 + power * 0.12, 0.3, 120 + power * 60);
    controls.pitch = Math.min(1.5, controls.pitch + 0.012 * power);
    ctx.alert?.raise(eye.x, eye.y, eye.z, 0.06 + 0.05 * power);
    world.safeguards?.hear(eye.x, eye.y - 1.7, eye.z, 40 + 20 * power);
    world.bus.emit('player:beam', { power, length: t, stop, x: end.x, y: end.y, z: end.z });
    ctx.slot.holes = world.holes.serialize();
    return true;
  }

  // teclado e mouse (o controle chama fire/power por onPadButton — app/ui.js)
  document.addEventListener('keydown', (e) => {
    if (e.repeat || !controls.locked) return;
    if (bindings.is('fire', e.code)) fire();
    if (bindings.is('power', e.code)) setPower(power + 1);
  });
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && controls.locked) fire();
  });
  document.addEventListener('wheel', (e) => {
    // (com o emissor na mão, a roda ajusta a potência)
    if (!controls.locked || !ctx.inventory.sideOf('emitter')) return;
    setPower(power + (e.deltaY < 0 ? 1 : -1));
  });

  return {
    fire,
    setPower,
    get power() {
      return power;
    },
    update(dt) {
      cool = Math.max(0, cool - dt);
      kick = Math.max(0, kick - dt * 6);
      const side = ctx.inventory.sideOf('emitter');
      const busy = !!(controls.mode === 'walk' && controls.walker?.ledgeState);
      em.group.visible = !!side && !busy && !ctx.wake?.active;
      if (em.group.visible) {
        em.group.position.set(0.15 * side, -0.14 + kick * 0.01, -0.3 + kick * 0.05);
        em.group.rotation.set(kick * 0.15, 0, 0);
        em.marks.forEach((mk, i) => mk.material.color.copy(i < power ? LIT : DIM));
      }
      for (const s of [1, -1]) grips[s].group.visible = side === s;
      // os feixes visíveis se apagam
      for (let i = beams.length - 1; i >= 0; i--) {
        const b = beams[i];
        b.t += ctx.beamHold ? 0 : dt; // (--beamhold: o feixe fica aceso, para as capturas)
        b.mesh.material.opacity = 0.9 * Math.max(0, 1 - b.t / BEAM_SHOW);
        // (a origem flutuante andou: o feixe anda junto)
        if (!b.origin.equals(world.origin)) {
          b.mesh.position.add(b.origin).sub(world.origin);
          b.origin.copy(world.origin);
        }
        if (b.t > BEAM_SHOW) {
          ctx.scene.remove(b.mesh);
          b.mesh.geometry.dispose();
          b.mesh.material.dispose();
          beams.splice(i, 1);
        }
      }
    },
  };
}
