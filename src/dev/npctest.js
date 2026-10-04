// ─────────────────────────────────────────────────────────────────────────────
//  Teste dos raros vivos (`npm run check:npcs`, fase 7), na Peregrinação:
//
//    vila        a vila habitada mais perto tem 4+ moradores de pé no chão
//    conversa    E diante de um: a conversa abre; aprender palavras; levar uma carga
//    carga       carregando: não se corre (controls.burden)
//    entrega     na vila de destino: entregar → a carga sai, a célula enche
//    hostil      ferir um morador com o emissor: a vila fica hostil (salvo), não conversa, sai das
//                vilas habitadas (carga, despertar), e um morador vem e golpeia (−25%, o arremesso)
//    despertar   recolhido por humanos → acorda perto de uma vila habitada (não a hostil)
//    andarilhos  existem andarilhos perto da teia, e eles andam
//    ladrao      um andarilho ladrão arranca a carga de quem chega perto
//    silicio     a vida de silício se revela de perto e o toque drena a célula
//    terceira    um Safeguard vê a vida de silício e vai atrás dela, não de você
//    andarilho   ferido pelo emissor, foge; morto, nada além (nenhuma vila fica hostil)
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
  // os relógios das rondas e dos andarilhos começam sempre no mesmo instante (senão cada
  // rodada cai noutro ponto dos circuitos e o teste fica instável)
  const t0clock = performance.now();
  const clock = () => 1.7e9 + (performance.now() - t0clock) / 1000;
  world.safeguards.clock = clock;
  world.npcs.clock = clock;
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
  const onMap = (ctx.travel.found().cargo ?? []).length;
  report({ kind: 'carga', ok: !!controls.burden && controls.walker.jumpScale < 1 && onMap === 1 && !!cargo?.reward, why: `sem correr ${!!controls.burden} · pulo ×${controls.walker.jumpScale} · no mapa ${onMap} · promessa ${cargo?.reward?.kind ?? '—'} · “${cargo ? l1.slice(0, 0) : ''}${document.querySelector('#talk .talk-line')?.textContent?.slice(0, 60) ?? ''}”` });

  // ── entrega ──
  let delivered = false;
  let rewardWhy = '';
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
      const max0 = ctx.player.energy.max;
      const words0 = ctx.lexicon.progress().known;
      const leads0 = ctx.leads.list().length;
      ctx.people.tryUse();
      await sleep(400);
      click('deliver');
      await sleep(400);
      const k = cargo.reward.kind;
      const paid = k === 'cell' ? ctx.player.energy.max > max0 : k === 'words' ? ctx.lexicon.progress().known > words0 : ctx.leads.list().length > leads0;
      rewardWhy = `recompensa ${k}: ${paid ? 'paga' : 'NÃO paga'} · “${lineNow().slice(0, 70)}”`;
      delivered = paid && !ctx.player.carried.some((c) => c.kind === 'cargo') && ctx.player.energy.value >= ctx.player.energy.max - 0.01;
      ctx.people.close();
    }
  }
  report({ kind: 'entrega', ok: delivered, why: `${delivered ? 'entregue · célula cheia' : 'não entregou'} · ${rewardWhy}` });

  // ── hostil: ferir um morador ──
  let hostileId = null;
  {
    const hv = cargo ? world.npcs.inhabitedNear(cargo.x, cargo.y, cargo.z, 200)[0] : v;
    const ppl = world.npcs.villages.get(hv?.u.id)?.people ?? [];
    const vic = ppl.find((e) => e.tier === 'near' && !e.dead);
    let why = 'nenhum morador perto';
    let ok = false;
    if (vic) {
      facing(vic, 4);
      await sleep(800);
      ctx.health.set(1);
      /** @type {any} */
      let hit = null;
      const off2 = world.bus.on('player:struck', (ev) => (hit ??= ev));
      world.entities.damage(vic, 0.1, 'beam'); // (um raspão do emissor)
      hostileId = hv.u.id;
      const saved = !!ctx.slot.villages?.[hostileId]?.hostile;
      const out = !world.npcs.inhabitedNear(hv.u.x, hv.u.y, hv.u.z, 200).some((o) => o.u.id === hostileId);
      facing(vic, 2.2);
      const g0 = here();
      const fwd = new THREE.Vector3(-Math.sin(controls.yaw), 0, -Math.cos(controls.yaw));
      const noTalk = !world.npcs.talkable(g0, fwd);
      const struck = await waitFor(() => !!hit, 20);
      await sleep(300);
      off2();
      const lost = 1 - ctx.health.value;
      ok = saved && out && noTalk && struck && hit.by === 'human' && Math.abs(lost - 0.25) < 0.02;
      why = `salvo ${saved} · fora das vilas habitadas ${out} · sem conversa ${noTalk} · golpe ${struck ? `de ${hit.by}, vida −${Math.round(lost * 100)}%` : 'não veio'}`;
    }
    report({ kind: 'hostil', ok, why });
    ctx.ui.teleport('teia', 'teia');
    await waitFor(() => !controls.walker.thrown, 5);
    ctx.health.set(1);
  }

  // ── despertar ──
  /** @type {any} */
  let woke = null;
  const off = world.bus.on('player:wake', (ev) => (woke = ev));
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  ctx.wake.start('impact', 'npc');
  await waitFor(() => !!woke, 90);
  off();
  const wv = woke ? world.npcs.inhabitedNear(woke.to.x, woke.to.y, woke.to.z, 400)[0] : null;
  report({ kind: 'despertar', ok: !!woke && woke.taker === 'npc' && !!wv && wv.d < 80 && wv.u.id !== hostileId, why: woke ? `acordou (${woke.taker}) a ${wv ? Math.round(wv.d) : '?'} m de uma vila habitada${wv?.u.id === hostileId ? ' — A HOSTIL' : ''} · carga ${ctx.player.carried.length ? 'pedida' : 'nenhuma'}` : 'não acordou' });
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
    // (a de antes pode ter saído de cena — longe do jogador, o andarilho sai da lista: um que esteja aqui)
    if (![...world.npcs.wanderers.values()].includes(si)) si = [...world.npcs.wanderers.values()].find((e) => !e.dead && e !== wd) ?? si;
    Object.assign(si.npc, { silicon: true, thief: false });
    // (ele pode não estar de ronda — caçando, voltando: a vida de silício vai 10 m à frente dele, onde ele está)
    if (guard.sg.state !== 'patrol') {
      sg._lose(guard);
      guard.sg.state = 'patrol'; // (de ronda: de volta à ronda ele percebe mais — veria você)
    }
    if (ctx.carried.lanternOn) ctx.carried.toggleLantern();
    // (só a prioridade: o jogador fica imperceptível aqui — a caçada a você é do check:safeguards)
    const senses0 = sg.senses;
    sg.senses = () => null;
    const q = circuitAt(guard.sg.c, guard.sg.s + 8);
    // (ainda voltando à ronda: longe do ponto do circuito — então 8 m à frente de onde ele está)
    if (guard.feet.distanceTo(new THREE.Vector3(q.x, q.y, q.z)) > 20) Object.assign(q, { x: guard.feet.x - Math.sin(guard.yaw) * 8, y: guard.feet.y, z: guard.feet.z - Math.cos(guard.yaw) * 8 });
    si.feet.set(q.x, q.y, q.z);
    world.entities.toNear(si, world.origin);
    if (!si.npc.revealed) world.npcs.reveal(si);
    si.npc.state = 'walk';
    chased = await waitFor(() => guard.sg.prey === si || !world.npcs.wanderers.size || world.npcs.stats.destroyed > 0, 15);
    sg.senses = senses0;
    const eyeS = new THREE.Vector3(guard.feet.x, guard.feet.y + 2.1, guard.feet.z);
    const tgt = new THREE.Vector3(si.feet.x, si.feet.y + 1.4, si.feet.z);
    var dbg = `si: morta ${si.dead} revelada ${si.npc.revealed} na lista ${[...world.npcs.silicon()].includes(si)} · a ${si.feet.distanceTo(guard.feet).toFixed(1)} m · vista ${sg._clear(eyeS, tgt, eyeS.distanceTo(tgt), world.origin)} · tier ${si.tier}/${guard.tier}`;
  }
  report({ kind: 'terceira', ok: chased, why: guard ? (chased ? `o Safeguard foi atrás da vida de silício (${guard.sg.prey ? 'caçando' : 'alcançou'})` : `não foi (${guard.sg.state}, ${guard.tier}) · ${typeof dbg === 'string' ? dbg : ''}`) : 'sem Safeguard perto' });

  // ── andarilho ferido e morto ──
  {
    const hostile0 = Object.values(ctx.slot.villages ?? {}).filter((x) => x.hostile).length;
    const w2 = [...world.npcs.wanderers.values()].find((e) => !e.dead && e !== si && !e.npc.revealed) ?? (wd && !wd.dead && !wd.npc.revealed ? wd : null);
    let fled = false;
    if (w2) {
      await waitFor(() => w2.npc.state === 'walk', 30);
      Object.assign(w2.npc, { silicon: false, thief: false, state: 'walk' });
      meet(w2, 6);
      await sleep(500);
      world.entities.damage(w2, 0.1, 'beam');
      fled = await waitFor(() => w2.npc.state === 'flee', 3);
      world.entities.kill(w2, 'beam');
    }
    await sleep(300);
    const hostile1 = Object.values(ctx.slot.villages ?? {}).filter((x) => x.hostile).length;
    report({ kind: 'andarilho', ok: !!w2 && fled && w2.dead && hostile1 === hostile0, why: w2 ? `ferido: ${fled ? 'fugiu' : `não fugiu (${w2.npc.state})`} · morto ${w2.dead} · vilas hostis ${hostile0} → ${hostile1}` : 'nenhum andarilho perto' });
  }

  clearInterval(watch);
  report({ kind: 'fiscal', ok: fiscal.wall === 0 && fiscal.fell === 0, why: `atravessou parede ${fiscal.wall}× · caiu ${fiscal.fell}×` });
  console.warn('CHECK:DONE');
}
