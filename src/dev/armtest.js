// ─────────────────────────────────────────────────────────────────────────────
//  Teste de recuperar o braço (`npm run check:arms`, na Peregrinação — o cofre, Recuperar-o-braco):
//
//    um-braco    o tiro além do limite leva o primeiro braço: o aviso de um braço só (R7)
//    ultimo      com um braço só, carregar até o estágio 5 avisa ÚLTIMO BRAÇO (R7)
//    sem-bracos  o segundo tiro leva o outro: o mapa ganha a câmara ou a vila mais perto (R6b)
//    vila        um morador refaz um braço por 30% da célula (R5) — de carne
//    andarilho   um andarilho vende uma prótese por 40% (R3); instalada do inventário, parado,
//                em ~5 s: um braço de metal (R4)
//    cemiterio   num cemitério de vítimas com prótese: ela está no chão, e E a pega
//    camara      a câmara de reconstrução: o berço existe (colisão no tampo); deitar (E) com os dois
//                braços perdidos → ~20 s → os dois de volta, de carne; −50% da célula (R1, R2)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CHAMBER_TIME, INSTALL_TIME, ARM_COST } from '../app/arms.js';
import { circuitAt } from '../gen/patrols.js';
import { villageFrame, villageLayout } from '../gen/villages.js';

const SETTLE = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DOWN = new THREE.Vector3(0, -1, 0);

export async function runArmTest(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
  }
  ctx.beam.testHeld = null;
  console.warn('CHECK:DONE');
}

async function run(ctx) {
  const { world, camera, controls } = ctx;
  const P = ctx.player;
  const F = world.field;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + (e.error?.stack ?? e.message)));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < s * 1000) await sleep(100);
    return cond();
  };
  const here = () => world.toGlobal(camera.position);
  const stand = (x, y, z, yaw = 0) => {
    controls.setMode('walk');
    controls.setView({ pos: new THREE.Vector3(x, y + 1.7, z).sub(world.origin), yaw, pitch: -0.1, scale: 1 });
  };
  const click = (id) => document.querySelector(`#talk button[data-id="${id}"]`)?.click();
  const has = (id) => !!document.querySelector(`#talk button[data-id="${id}"]`);
  const ev = {};
  for (const k of ['player:oneArm', 'player:lastArmWarn', 'player:noArms', 'player:rebuilt', 'player:installed']) world.bus.on(k, (e) => (ev[k] = e ?? true));
  // (só os braços: sem a vida — os tiros em sobrecarga — e sem Safeguards no meio)
  ctx.rules = { ...ctx.rules, health: false, safeguards: false };
  const t0clock = performance.now();
  world.npcs.clock = () => 1.7e9 + (performance.now() - t0clock) / 1000;

  await sleep(SETTLE);
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  P.energy.value = 1;
  ctx.beam.restoreArms();

  // (os tiros além do limite empurram o corpo para longe — ~100 m/s: atirando no ar, parado)
  const couldFly = controls.canFly;
  controls.canFly = true;
  controls.setMode('fly');
  const still = () => controls.velocity.set(0, 0, 0);
  // ── um-braco: o tiro no estágio 5 leva o braço que segura o emissor ──
  ctx.inventory.equip('emitter');
  controls.pitch = 1.3; // (para cima: o furo não leva o chão)
  ctx.beam.fire(1, 1.4);
  still();
  const lost1 = Object.keys(P.arms).filter((k) => !P.arms[k]);
  report({ kind: 'um-braco', ok: lost1.length === 1 && !!ev['player:oneArm'], why: `perdido ${lost1.join(',') || 'nenhum'} · aviso ${!!ev['player:oneArm']}` });

  // ── ultimo: carregando com um braço só, o estágio 5 avisa ──
  await sleep(1500);
  P.energy.value = 1;
  ctx.inventory.equip('emitter');
  await sleep(300);
  const blocks = [];
  world.bus.on('player:beamBlocked', (e) => blocks.length < 4 && blocks.push(e.why));
  world.bus.on('player:beamCancel', (e) => blocks.length < 4 && blocks.push('cancel:' + e.why));
  const hands = `${P.hands.right}/${P.hands.left}`;
  ctx.beam.testHeld = true;
  const warned = await waitFor(() => {
    still();
    return !!ev['player:lastArmWarn'];
  }, 14);
  const st = ctx.beam.stage;
  ctx.beam.cancel();
  ctx.beam.testHeld = null;
  report({ kind: 'ultimo', ok: warned && st >= 5, why: `estágio ${st} · ${warned ? 'ÚLTIMO BRAÇO avisado' : `sem aviso (mãos ${hands} · ${blocks.join(',') || '—'} · arma ${ctx.beam.state})`}` });
  await sleep(800);

  // ── sem-bracos: o segundo tiro leva o outro; o mapa mostra onde refazer ──
  P.energy.value = 1;
  const leads0 = ctx.leads.list().length;
  ctx.inventory.equip('emitter');
  controls.pitch = 1.3;
  ctx.beam.fire(1, 1.4);
  still();
  await sleep(500);
  const none = !P.arms.right && !P.arms.left;
  const nl = ev['player:noArms'];
  report({ kind: 'sem-bracos', ok: none && !!nl?.lead && ctx.leads.list().length > leads0 && !controls.walker.canGrab, why: `sem braços ${none} · pista ${nl?.kind ?? '—'} (${nl?.lead ?? '—'}) · pistas ${leads0} → ${ctx.leads.list().length} · agarra ${controls.walker.canGrab}` });

  controls.setMode('walk');
  controls.canFly = couldFly;
  await waitFor(() => !ctx.wake.active, 90);

  // ── vila: um morador refaz um braço (30%) ──
  {
    const v = world.npcs.inhabitedNear(0, 0, 0, 90000)[0];
    let ok = false;
    let why = 'nenhuma vila';
    if (v) {
      // junto do console, um passo para dentro (como o check:npcs)
      const { P: VP } = villageFrame(v.u);
      const L0 = villageLayout(F, v.u);
      const [cx, cz] = VP(L0.console.a - 1.5, L0.console.c);
      stand(cx, v.u.y + 1.2, cz, Math.atan2(-(v.u.x - cx), -(v.u.z - cz)));
      await sleep(SETTLE + 3000);
      const ppl = world.npcs.villages.get(v.u.id)?.people ?? [];
      await waitFor(() => ppl.some((e) => e.tier === 'near'), 10);
      const who = ppl.find((e) => e.tier === 'near');
      if (who) {
        stand(who.feet.x - Math.sin(who.yaw) * 2.2, who.feet.y, who.feet.z - Math.cos(who.yaw) * 2.2, who.yaw + Math.PI);
        await sleep(1500);
        P.energy.value = 0.8;
        ctx.people.tryUse();
        await sleep(400);
        const offered = has('armCell');
        click('armCell');
        await sleep(400);
        ctx.people.close();
        const back = Object.keys(P.arms).filter((k) => P.arms[k]);
        ok = offered && back.length === 1 && P.armKind[back[0]] === 'flesh' && Math.abs(P.energy.value - (0.8 - ARM_COST.villager)) < 0.01;
        why = `oferta ${offered} · de volta ${back.join(',') || 'nenhum'} (${back[0] ? P.armKind[back[0]] : '—'}) · célula ${Math.round(P.energy.value * 100)}%`;
      } else why = 'nenhum morador perto';
    }
    report({ kind: 'vila', ok, why });
  }

  // ── andarilho: a prótese por 40%, instalada do inventário ──
  {
    ctx.ui.teleport('teia', 'teia');
    await sleep(SETTLE);
    await waitFor(() => world.npcs.wanderers.size > 0, 15);
    const wd = [...world.npcs.wanderers.values()].find((e) => !e.dead && !e.npc.revealed);
    let ok = false;
    let why = 'nenhum andarilho';
    if (wd) {
      Object.assign(wd.npc, { thief: false, silicon: false, state: 'walk' });
      const p = circuitAt(wd.npc.c, wd.npc.s + 2.2);
      stand(p.x, p.y, p.z, Math.atan2(-(wd.feet.x - p.x), -(wd.feet.z - p.z)));
      await sleep(1500);
      P.energy.value = 0.8;
      let offered = false;
      for (let i = 0; i < 6 && !offered; i++) {
        const p2 = circuitAt(wd.npc.c, wd.npc.s + 2.2);
        stand(p2.x, p2.y, p2.z, Math.atan2(-(wd.feet.x - p2.x), -(wd.feet.z - p2.z)));
        await sleep(500);
        ctx.people.tryUse();
        await sleep(400);
        offered = has('prosthesis');
        if (!offered) ctx.people.close();
      }
      click('prosthesis');
      await sleep(400);
      ctx.people.close();
      const got = P.carried.some((c) => c.kind === 'prosthesis');
      const cost = Math.abs(P.energy.value - (0.8 - ARM_COST.wanderer)) < 0.01;
      ctx.arms.installProsthesis();
      const t0 = performance.now();
      const done = await waitFor(() => !!ev['player:installed'], INSTALL_TIME + 3);
      const secs = (performance.now() - t0) / 1000;
      const metal = Object.keys(P.arms).filter((k) => P.arms[k] && P.armKind[k] === 'prosthesis');
      ok = offered && got && cost && done && metal.length === 1 && !P.carried.some((c) => c.kind === 'prosthesis');
      why = `oferta ${offered} · prótese ${got} · célula ${Math.round(P.energy.value * 100)}% · instalada em ${secs.toFixed(1)} s · braço de metal ${metal.join(',') || '—'}`;
    }
    report({ kind: 'andarilho', ok, why });
  }

  // ── cemiterio: a prótese no chão ──
  {
    const g = here();
    let best = null;
    for (const u of F.uniquesNear(g.x, g.y, g.z, 120000)) {
      const p = ctx.arms.prosthesisAt(u);
      if (!p || ctx.slot.loot?.[p.id]) continue;
      const d = Math.hypot(p.x - g.x, p.y - g.y, p.z - g.z);
      if (!best || d < best.d) best = { p, d };
    }
    let ok = false;
    let why = 'nenhum cemitério com prótese em 120 km';
    if (best) {
      const p = best.p;
      stand(p.x + 1, p.y, p.z, Math.atan2(1, 0));
      await sleep(SETTLE + 2000);
      const shown = await waitFor(() => ctx.arms.items.has(p.id), 5);
      const n0 = P.carried.filter((c) => c.kind === 'prosthesis').length;
      const used = ctx.arms.tryUse();
      const n1 = P.carried.filter((c) => c.kind === 'prosthesis').length;
      ok = shown && used && n1 === n0 + 1 && !!ctx.slot.loot?.[p.id];
      why = `a ${(best.d / 1000).toFixed(1)} km · no chão ${shown} · pegou ${used && n1 > n0} · salvo ${!!ctx.slot.loot?.[p.id]}`;
    }
    report({ kind: 'cemiterio', ok, why });
  }

  // ── camara: o berço; os dois braços de volta ──
  {
    const g = here();
    let best = null;
    for (const u of F.uniquesNear(g.x, g.y, g.z, 160000)) {
      if (u.kind !== 'chamber') continue;
      const d = Math.hypot(u.x - g.x, u.y - g.y, u.z - g.z);
      if (!best || d < best.d) best = { u, d };
    }
    let ok = false;
    let why = 'nenhuma câmara em 160 km';
    if (best) {
      const b = F.chamberBed(best.u);
      // de pé ao lado do berço (de lado, c + 1,6 m)
      const side = new THREE.Vector3(Math.cos(b.yaw), 0, -Math.sin(b.yaw));
      stand(b.x + side.x * 1.6, best.u.y + 1.2, b.z + side.z * 1.6);
      await sleep(SETTLE + 3000);
      const w = controls.walker;
      w.col._t = -1e9;
      w.col.buildsPerFrame = 600;
      w.col.refresh(camera.position.clone(), 30);
      w.col.buildsPerFrame = 2;
      const top = w.col.ray(new THREE.Vector3(b.x, b.y + 2, b.z).sub(world.origin), DOWN, 4);
      const bedOk = !!top && Math.abs(top.point.y + world.origin.y - b.y) < 0.15;
      P.arms.right = false;
      P.arms.left = false;
      P.energy.value = 0.9;
      const used = ctx.arms.tryUse();
      const t0 = performance.now();
      const done = await waitFor(() => !!ev['player:rebuilt'], CHAMBER_TIME + 5);
      const secs = (performance.now() - t0) / 1000;
      ok = bedOk && used && done && P.arms.right && P.arms.left && P.armKind.right === 'flesh' && P.armKind.left === 'flesh' && Math.abs(P.energy.value - (0.9 - ARM_COST.chamber)) < 0.01;
      why = `a ${(best.d / 1000).toFixed(1)} km · o tampo do berço ${top ? `a ${(top.point.y + world.origin.y - b.y).toFixed(2)} m do esperado` : 'sem colisão'} · deitou ${used} · ${done ? `refeito em ${secs.toFixed(1)} s` : 'não terminou'} · braços ${P.arms.right}/${P.arms.left} (${P.armKind.right}/${P.armKind.left}) · célula ${Math.round(P.energy.value * 100)}%`;
      if (ctx.params.get('capture')) {
        stand(b.x + side.x * 4, best.u.y + 1.2, b.z + side.z * 4, Math.atan2(side.x, side.z));
        controls.pitch = -0.25;
        await sleep(2500);
        await /** @type {any} */ (window).cybercosmic?.devCapture?.('chamber.png');
      }
    }
    report({ kind: 'camara', ok, why });
  }
}
