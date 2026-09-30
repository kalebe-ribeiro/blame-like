// ─────────────────────────────────────────────────────────────────────────────
//  Teste dos Safeguards (`npm run check:safeguards`, fase 6), na Peregrinação:
//
//    rondas     perto do jogador há rondas, e elas andam
//    visto      posto no caminho de um de ronda, com a lanterna acesa: ele vê e caça
//    captura    o toque → desmaio → acorda perto de um cemitério de vítimas
//    escondido  visto de novo; lanterna apagada e longe: ele perde o rastro e volta
//    parede     alerta: dois saem de uma parede (colmeia), caçam; escondido, eles voltam
//               para a placa e somem
//    chamado    no aberto: o de ronda mais perto vem pelo grafo
//    fiscal     nenhum corpo atravessou parede nem caiu
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { circuitAt } from '../gen/patrols.js';

const SETTLE = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runSafeguardTest(ctx) {
  const { world, camera, controls } = ctx;
  const sg = world.safeguards;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));
  const here = () => world.toGlobal(camera.position);
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < s * 1000) await sleep(250);
    return cond();
  };
  const lantern = (on) => {
    if (!!ctx.carried.lanternOn !== on) ctx.carried.toggleLantern();
  };
  ctx.player.energy.value = 1; // a lanterna precisa de carga
  let woke = null;
  world.bus.on('player:wake', (ev) => (woke = ev));
  const fiscal = { wall: 0, fell: 0 };
  const watch = setInterval(() => {
    for (const e of sg.all()) {
      fiscal.wall = Math.max(fiscal.wall, e.stats.wall);
      fiscal.fell = Math.max(fiscal.fell, e.stats.fell);
    }
  }, 500);

  /** O jogador de pé num ponto do circuito do Safeguard de ronda mais perto, D m à frente dele, olhando para ele. */
  const meet = (D) => {
    const g = here();
    let near = null;
    for (const e of sg.byTerritory.values()) {
      if (e.sg.state !== 'patrol') continue;
      const d = e.feet.distanceTo(g);
      if (!near || d < near.d) near = { e, d };
    }
    if (!near) return null;
    const e = near.e;
    const p = circuitAt(e.sg.c, e.sg.s + D);
    controls.setMode('walk');
    controls.setView({ pos: new THREE.Vector3(p.x, p.y + 1.7, p.z).sub(world.origin), yaw: Math.atan2(-(e.feet.x - p.x), -(e.feet.z - p.z)), pitch: 0, scale: 1 });
    return e;
  };

  await sleep(SETTLE);

  // ── rondas ──
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  await waitFor(() => sg.byTerritory.size > 0, 10);
  const one = [...sg.byTerritory.values()][0];
  const p0 = one?.feet.clone();
  await sleep(3000);
  const moved = one ? one.feet.distanceTo(p0) : 0;
  report({ kind: 'rondas', ok: sg.byTerritory.size > 0 && moved > 2.5, why: `${sg.byTerritory.size} rondas perto · uma andou ${moved.toFixed(1)} m em 3 s · ${sg.none.size} territórios sem rede` });

  // ── visto ──
  let e = meet(22);
  lantern(true);
  const spotted0 = sg.stats.spotted;
  const seen = !!e && (await waitFor(() => sg.stats.spotted > spotted0, 20));
  report({ kind: 'visto', ok: seen, why: e ? (seen ? `caçando (${e.sg.state})` : `não viu (${e.sg.state}, ${e.tier})`) : 'nenhuma ronda' });

  // ── captura ──
  const caught0 = sg.stats.caught;
  const caught = seen && (await waitFor(() => sg.stats.caught > caught0, 25));
  let why = caught ? '' : 'não pegou';
  if (caught) {
    await waitFor(() => !!woke, 90);
    let gy = null;
    if (woke) {
      for (const u of world.field.uniquesNear(woke.to.x, woke.to.y, woke.to.z, 400)) {
        if (u.kind !== 'graveyard') continue;
        const d = Math.hypot(u.x - woke.to.x, u.z - woke.to.z);
        if (gy === null || d < gy) gy = d;
      }
    }
    why = woke ? `acordou (${woke.taker}) a ${gy === null ? '?' : Math.round(gy)} m do cemitério` : 'não acordou';
    report({ kind: 'captura', ok: !!woke && woke.taker === 'safeguard' && gy !== null && gy < 80, why });
  } else report({ kind: 'captura', ok: false, why });
  await waitFor(() => !ctx.wake.active, 20);
  ctx.player.energy.value = 1;

  // ── escondido ──
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  await waitFor(() => [...sg.byTerritory.values()].some((x) => x.sg.state === 'patrol'), 10);
  e = meet(20);
  lantern(true);
  const s1 = sg.stats.spotted;
  const seen2 = !!e && (await waitFor(() => sg.stats.spotted > s1, 20));
  let lostOk = false;
  if (seen2) {
    // apaga a lanterna e some: um ponto do grafo a ~150 m de caminho
    lantern(false);
    const nav = world.entities.nav;
    const g = here();
    const v = nav.vertexAt(g.x, g.y - 1.7, g.z) ?? nav.nodeVertex(world.field.nearestNode(g.x, g.y, g.z));
    let s = 5;
    const far = v && nav.wander(v, 200, () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296));
    if (far) controls.setView({ pos: new THREE.Vector3(far.x, far.y + 1.7, far.z).sub(world.origin), yaw: 0, pitch: 0, scale: 1 });
    const caughtBefore = sg.stats.caught;
    lostOk = await waitFor(() => e.sg.state === 'return' || e.sg.state === 'patrol', 30);
    lostOk = lostOk && sg.stats.caught === caughtBefore;
  }
  report({ kind: 'escondido', ok: seen2 && lostOk, why: !seen2 ? 'não chegou a ser visto' : lostOk ? `perdeu o rastro e voltou (${e.sg.state})` : `continuou (${e.sg.state})` });

  // ── parede ──
  ctx.ui.teleport('colmeia', 'colmeia');
  await sleep(SETTLE);
  lantern(true);
  const made = sg.emerge(here(), world.origin, 2);
  const hunters = [...sg.hunters];
  await sleep(2600);
  const out = hunters.filter((h) => h.sg.state === 'hunt' || h.sg.state === 'search');
  // escondido de novo: lanterna apagada, longe
  lantern(false);
  ctx.ui.teleport('colmeia', 'colmeia');
  const gone = made > 0 && (await waitFor(() => hunters.every((h) => !sg.hunters.has(h)), 60));
  report({ kind: 'parede', ok: made >= 1 && out.length === made && gone, why: `${made} saíram da parede · ${out.length} caçando depois de 2,6 s · ${gone ? 'voltaram para a placa' : `ainda ${sg.hunters.size} fora`}` });

  // ── chamado ──
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  await waitFor(() => sg.byTerritory.size > 0, 10);
  const g = here();
  const n = sg.summon(g, 1);
  const called = [...sg.byTerritory.values()].find((x) => x.sg.state === 'summon');
  const d0 = called ? called.feet.distanceTo(g) : 0;
  await sleep(8000);
  const d1 = called ? called.feet.distanceTo(g) : 0;
  report({ kind: 'chamado', ok: n === 1 && !!called && (d1 < d0 - 5 || called.sg.state !== 'summon'), why: called ? `vindo de ${Math.round(d0)} m → ${Math.round(d1)} m (${called.sg.state})` : 'ninguém veio' });

  clearInterval(watch);
  for (const x of sg.all()) {
    fiscal.wall = Math.max(fiscal.wall, x.stats.wall);
    fiscal.fell = Math.max(fiscal.fell, x.stats.fell);
  }
  report({ kind: 'fiscal', ok: fiscal.wall === 0 && fiscal.fell === 0, why: `atravessou parede ${fiscal.wall}× · caiu ${fiscal.fell}×` });
  console.warn('CHECK:DONE');
}
