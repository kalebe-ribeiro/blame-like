// ─────────────────────────────────────────────────────────────────────────────
//  Teste dos raros vivos (`npm run check:npcs`, fase 7), na Peregrinação:
//
//    vila        a vila habitada mais perto tem 4+ moradores de pé no chão
//    conversa    E diante de um: a conversa abre; aprender palavras; levar uma carga
//    carga       carregando: não se corre (controls.burden)
//    entrega     na vila de destino: entregar → a carga sai, a célula enche
//    despertar   recolhido por humanos → acorda perto de uma vila habitada
//    andarilhos  existem andarilhos perto da teia, e eles andam
//    ladrao      um andarilho ladrão arranca a carga de quem chega perto
//    silicio     a vida de silício se revela de perto e o toque drena a célula
//    terceira    um Safeguard vê a vida de silício e vai atrás dela, não de você
//    fiscal      nenhum corpo atravessou parede nem caiu
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { villageFrame, villageLayout } from '../gen/villages.js';
import { circuitAt } from '../gen/patrols.js';

const SETTLE = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runNpcTest(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
    console.warn('CHECK:DONE');
  }
}

async function run(ctx) {
  const { world, camera, controls } = ctx;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));
  const here = () => world.toGlobal(camera.position);
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < s * 1000) await sleep(250);
    return cond();
  };
  const stand = (x, y, z, yaw = 0) => {
    controls.setMode('walk');
    controls.setView({ pos: new THREE.Vector3(x, y + 1.7, z).sub(world.origin), yaw, pitch: -0.1, scale: 1 });
  };
  const click = (id) => document.querySelector(`#talk button[data-id="${id}"]`)?.click();
  const lineNow = () => document.querySelector('#talk .talk-line')?.textContent ?? '';
  const facing = (e, D = 2.2) => {
    const fx = -Math.sin(e.yaw);
    const fz = -Math.cos(e.yaw);
    stand(e.feet.x + fx * D, e.feet.y, e.feet.z + fz * D, e.yaw + Math.PI);
  };
  ctx.player.energy.value = 0.5;
  const fiscal = { wall: 0, fell: 0 };
  const watch = setInterval(() => {
    for (const e of world.entities.list.values()) {
      fiscal.wall = Math.max(fiscal.wall, e.stats.wall);
      fiscal.fell = Math.max(fiscal.fell, e.stats.fell);
    }
  }, 500);
  await sleep(SETTLE);

  // ── vila ──
  const v = world.npcs.inhabitedNear(0, 0, 0, 90000)[0];
  const { P } = villageFrame(v.u);
  const L0 = villageLayout(world.field, v.u);
  const [cx, cz] = P(L0.console.a - 1.5, L0.console.c);
  stand(cx, v.u.y + 1.2, cz, Math.atan2(-(v.u.x - cx), -(v.u.z - cz)));
  await sleep(SETTLE + 3000);
  const vil = world.npcs.villages.get(v.u.id);
  const people = vil?.people ?? [];
  await waitFor(() => people.some((e) => e.tier === 'near'), 8);
  const grounded = people.filter((e) => e.tier === 'near' && e.walker.grounded).length;
  const near = people.filter((e) => e.tier === 'near').length;
  report({ kind: 'vila', ok: people.length >= 4 && grounded === near && near > 0, why: `${people.length} moradores · ${grounded}/${near} de pé no chão (perto)` });

  // ── conversa ──
  const who = people.find((e) => e.tier === 'near') ?? people[0];
  facing(who);
  await sleep(1500);
  const opened = ctx.people.tryUse();
  await sleep(400);
  const l0 = lineNow();
  click('teach');
  await sleep(400);
  const l1 = lineNow();
  click('cargo');
  await sleep(400);
  const cargo = ctx.player.carried.find((c) => c.kind === 'cargo');
  report({ kind: 'conversa', ok: opened && ctx.people.isOpen && l0 !== l1 && !!cargo, why: `aberta ${opened} · “${l1.slice(0, 40)}…” · carga ${cargo ? `para ${cargo.to}` : 'nenhuma'}` });
  ctx.people.close();
  await sleep(300);

  // ── carga ──
  report({ kind: 'carga', ok: !!controls.burden && controls.walker.jumpScale < 1, why: `sem correr ${!!controls.burden} · pulo ×${controls.walker.jumpScale}` });

  // ── entrega ──
  let delivered = false;
  if (cargo) {
    const dv = world.npcs.inhabitedNear(cargo.x, cargo.y, cargo.z, 200)[0];
    const F2 = villageFrame(dv.u);
    const L2 = villageLayout(world.field, dv.u);
    const [dx, dz] = F2.P(L2.console.a - 1.5, L2.console.c);
    stand(dx, dv.u.y + 1.2, dz);
    await sleep(SETTLE + 4000);
    await waitFor(() => world.npcs.villages.get(dv.u.id)?.people.some((e) => e.tier === 'near'), 10);
    const w2 = world.npcs.villages.get(dv.u.id)?.people.find((e) => e.tier === 'near');
    if (w2) {
      facing(w2);
      await sleep(1500);
      ctx.player.energy.value = 0.3;
      ctx.people.tryUse();
      await sleep(400);
      click('deliver');
      await sleep(400);
      delivered = !ctx.player.carried.some((c) => c.kind === 'cargo') && ctx.player.energy.value > 0.95;
      ctx.people.close();
    }
  }
  report({ kind: 'entrega', ok: delivered, why: delivered ? 'entregue · célula cheia' : 'não entregou' });

  // ── despertar ──
  let woke = null;
  const off = world.bus.on('player:wake', (ev) => (woke = ev));
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  ctx.wake.start('impact', 'npc');
  await waitFor(() => !!woke, 90);
  off();
  const wv = woke ? world.npcs.inhabitedNear(woke.to.x, woke.to.y, woke.to.z, 400)[0] : null;
  report({ kind: 'despertar', ok: !!woke && woke.taker === 'npc' && !!wv && wv.d < 80, why: woke ? `acordou (${woke.taker}) a ${wv ? Math.round(wv.d) : '?'} m de uma vila habitada · carga ${ctx.player.carried.length ? 'pedida' : 'nenhuma'}` : 'não acordou' });
  await waitFor(() => !ctx.wake.active, 20);
  ctx.player.carried.length = 0;

  // ── andarilhos ──
  let wd = null;
  for (let k = 0; k < 5 && !wd; k++) {
    ctx.ui.teleport('teia', 'teia');
    await sleep(SETTLE);
    await waitFor(() => world.npcs.wanderers.size > 0, 6);
    wd = [...world.npcs.wanderers.values()][0] ?? null;
  }
  let moved = 0;
  if (wd) {
    const p0 = wd.feet.clone();
    await sleep(3000);
    moved = wd.feet.distanceTo(p0);
  }
  report({ kind: 'andarilhos', ok: !!wd && moved > 2, why: wd ? `${world.npcs.wanderers.size} perto · um andou ${moved.toFixed(1)} m em 3 s` : 'nenhum' });

  /** De pé no circuito do andarilho, D m à frente dele. */
  const meet = (e, D) => {
    const p = circuitAt(e.npc.c, e.npc.s + D);
    stand(p.x, p.y, p.z, Math.atan2(-(e.feet.x - p.x), -(e.feet.z - p.z)));
  };

  // ── ladrao ──
  let stolen = false;
  if (wd) {
    Object.assign(wd.npc, { thief: true, silicon: false, state: 'walk' });
    ctx.player.carried.push({ kind: 'cargo', from: 'x', to: 'y', x: 0, y: 0, z: 0 });
    const s0 = world.npcs.stats.stolen;
    for (const D of [3, 2]) {
      meet(wd, D);
      stolen = await waitFor(() => world.npcs.stats.stolen > s0, 12);
      if (stolen) break;
    }
    Object.assign(wd.npc, { thief: false });
  }
  report({ kind: 'ladrao', ok: stolen && !ctx.player.carried.some((c) => c.kind === 'cargo'), why: stolen ? `levou a carga e fugiu (${wd.npc.state})` : 'não roubou' });
  ctx.player.carried.length = 0;

  // ── silicio ──
  let revealed = false;
  let drained = false;
  let si = null;
  for (const e of world.npcs.wanderers.values()) if (e !== wd && !si) si = e;
  si ??= wd;
  if (si) {
    await waitFor(() => si.npc.state === 'walk', 30);
    Object.assign(si.npc, { silicon: true, thief: false });
    ctx.player.energy.value = 0.8;
    const r0 = world.npcs.stats.revealed;
    const d0 = world.npcs.stats.drained;
    for (const D of [5, 4]) {
      meet(si, D);
      revealed = await waitFor(() => world.npcs.stats.revealed > r0, 10);
      if (revealed) break;
    }
    drained = revealed && (await waitFor(() => world.npcs.stats.drained > d0, 25));
  }
  report({ kind: 'silicio', ok: revealed && drained && ctx.player.energy.value === 0, why: `revelou ${revealed} · drenou ${drained} · célula ${Math.round(ctx.player.energy.value * 100)}%` });
  ctx.player.energy.value = 1;

  // ── terceira força ──
  let chased = false;
  const sg = world.safeguards;
  const guard = [...sg.byTerritory.values()].find((e) => e.sg.state === 'patrol' && e.tier === 'near') ?? [...sg.byTerritory.values()][0];
  if (guard && si) {
    // o jogador longe dele, no escuro; a vida de silício revelada no caminho do Safeguard
    const pp = circuitAt(guard.sg.c, guard.sg.s + 45);
    stand(pp.x, pp.y, pp.z);
    await sleep(4000);
    const q = circuitAt(guard.sg.c, guard.sg.s + 10);
    si.feet.set(q.x, q.y, q.z);
    world.entities.toNear(si, world.origin);
    if (!si.npc.revealed) world.npcs.reveal(si);
    si.npc.state = 'walk';
    chased = await waitFor(() => guard.sg.prey === si || !world.npcs.wanderers.size || world.npcs.stats.destroyed > 0, 15);
  }
  report({ kind: 'terceira', ok: chased, why: guard ? (chased ? `o Safeguard foi atrás da vida de silício (${guard.sg.prey ? 'caçando' : 'alcançou'})` : `não foi (${guard.sg.state}, ${guard.tier})`) : 'sem Safeguard perto' });

  clearInterval(watch);
  report({ kind: 'fiscal', ok: fiscal.wall === 0 && fiscal.fell === 0, why: `atravessou parede ${fiscal.wall}× · caiu ${fiscal.fell}×` });
  console.warn('CHECK:DONE');
}
