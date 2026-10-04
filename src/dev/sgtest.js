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
//    subir      procurando você 240 m acima (a ponte de cima de uma passagem): ele
//               pega o elevador grande e chega lá; e, sem elevador, sobe pela escada
//    arranque   num chão largo, um de cada nível caçando em linha reta: começa em v0 e chega à
//               terminal no tempo da aceleração (baixo 8 m/s em 2 s · médio 11 em 2 s · alto 14 em 1,4 s)
//    curva      o alto na terminal: o alvo muda 90° de lado — ele perde velocidade e acelera de novo
//    fiscal     nenhum corpo atravessou parede nem caiu
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { circuitAt } from '../gen/patrols.js';
import { MOVE, accelerate } from '../world/levels.js';

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
  // o relógio das rondas começa sempre no mesmo instante (senão cada rodada cai noutro ponto)
  const t0clock = performance.now();
  sg.clock = () => 1.7e9 + (performance.now() - t0clock) / 1000;
  /** @type {any} */
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

  /** O arranque e a curva (--sgpart=arranque roda só isto). */
  const arranque = async () => {
  // ── arranque e curva: num chão largo ──
  {
    const w = controls.walker;
    const DOWN = new THREE.Vector3(0, -1, 0);
    const dirOf = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
    const floorBelow = (x, y, z) => {
      const h = w.col.ray(new THREE.Vector3(x, y, z), DOWN, 3);
      return h && h.face && h.face.normal.y > 0.55 ? h.point.y : null;
    };
    let spot = null;
    for (const place of ['camada', 'galeria', 'estrato', 'teia', 'maquinas']) {
      if (!ctx.ui.teleport(place, place)) continue;
      controls.setMode('walk');
      await sleep(SETTLE);
      await waitFor(() => w.grounded && sg.byTerritory.size > 0, 6);
      if (!sg.byTerritory.size) continue;
      w.col._t = -1e9;
      w.col.buildsPerFrame = 600;
      w.col.refresh(camera.position.clone(), 70);
      w.col.buildsPerFrame = 2;
      const feet = w.feet.clone();
      // uma linha de 45 m de chão plano, sem nada no caminho, e 20 m de lado aos 30 m
      for (let i = 0; i < 40 && !spot; i++) {
        const p = feet.clone().addScaledVector(dirOf(i * 2.4), (i % 5) * 4);
        const y = floorBelow(p.x, feet.y + 1, p.z);
        if (y === null) continue;
        const c = new THREE.Vector3(p.x, y, p.z);
        for (let q = 0; q < 8 && !spot; q++) {
          const d = dirOf((q / 8) * Math.PI * 2);
          const side = new THREE.Vector3(-d.z, 0, d.x);
          let ok = true;
          for (let r = 3; r <= 45 && ok; r += 3) {
            const fy = floorBelow(c.x + d.x * r, y + 1, c.z + d.z * r);
            if (fy === null || Math.abs(fy - y) > 0.4) ok = false;
          }
          for (let r = 3; r <= 20 && ok; r += 3) {
            const o = c.clone().addScaledVector(d, 30).addScaledVector(side, r);
            const fy = floorBelow(o.x, y + 1, o.z);
            if (fy === null || Math.abs(fy - y) > 0.4) ok = false;
          }
          for (const hh of [1.0, 1.8]) if (ok && w.col.ray(c.clone().setY(y + hh), d, 45)) ok = false;
          if (ok && w.col.ray(c.clone().addScaledVector(d, 30).setY(y + 1.2), side, 20)) ok = false;
          if (ok) spot = { place, c, d, side };
        }
      }
      if (spot) break;
    }
    if (!spot) {
      report({ kind: 'arranque', ok: false, why: 'nenhum chão largo com ronda perto' });
      report({ kind: 'curva', ok: false, why: '—' });
    } else {
      const rules0 = ctx.rules;
      ctx.rules = { ...rules0, health: false }; // (só o movimento: sem golpe nem arremesso no fim)
      const run = async (level, turn) => {
        // o jogador na ponta; o Safeguard 44 m antes, caçando
        controls.placeFeet(spot.c.clone().addScaledVector(spot.d, 44));
        await sleep(600);
        const g = here();
        let x = null;
        for (const e of sg.byTerritory.values()) if (!x || e.feet.distanceTo(g) < x.feet.distanceTo(g)) x = e;
        for (const e of sg.all()) if (e !== x && e.sg.state !== 'patrol') sg._lose(e);
        x.feet.copy(world.toGlobal(spot.c.clone()));
        world.entities.toNear(x, world.origin);
        x.walker.vel.set(0, 0, 0);
        x.level = level;
        lantern(true);
        Object.assign(x.sg, { state: 'hunt', sees: true, unseen: 0, lastSeen: g.clone().setY(g.y - 1.7), prey: null, bestD: Infinity, stuckT: 0, waitT: 0, huntV: undefined, turns: 0, turnRef: null });
        const M = MOVE[level];
        const t0 = performance.now();
        const samples = [];
        let turnedAt = null;
        await new Promise((resolve) => {
          const tick = () => {
            const t = (performance.now() - t0) / 1000;
            samples.push({ t, v: x.sg.huntV ?? 0, sp: x.speed });
            // a curva: com ele na terminal, o alvo pula 90° para o lado
            if (turn && turnedAt === null && t > 2.2) {
              turnedAt = t;
              const side = spot.c.clone().addScaledVector(spot.d, 30).addScaledVector(spot.side, 18);
              controls.placeFeet(side);
              x.sg.lastSeen = world.toGlobal(side.clone()).setY(x.sg.lastSeen.y);
            }
            if (t > (turn ? 4.6 : 3.4) || x.sg.state === 'strike' || x.sg.state === 'grab') resolve(null);
            else requestAnimationFrame(tick);
          };
          tick();
        });
        sg._lose(x);
        return { M, samples, turnedAt, turns: x.sg.turns ?? 0, last: x.sg.lastTurn ?? null };
      };
      const rows = [];
      let okA = true;
      for (const level of ['low', 'mid', 'high']) {
        const r = await run(level, false);
        const first = r.samples.find((s) => s.v > 0);
        const at = r.samples.find((s) => s.v >= r.M.vt - 0.05);
        const exp = (r.M.vt - r.M.v0) / r.M.a;
        const top = Math.max(...r.samples.map((s) => s.sp));
        // (um desvio no caminho conta como curva e custa velocidade: até 0,8 s de folga)
        const ok = !!first && first.v < r.M.v0 + 0.5 && !!at && at.t - first.t > exp - 0.35 && at.t - first.t < exp + (r.turns ? 1.2 : 0.4) && top > 0.85 * r.M.vt;
        if (!ok) okA = false;
        rows.push(`${level}: ${first ? first.v.toFixed(1) : '?'} → ${r.M.vt} m/s em ${at ? (at.t - first.t).toFixed(2) : '—'} s (esperado ${exp.toFixed(2)}) · o corpo a ${top.toFixed(1)} · ${r.turns} curva(s)`);
      }
      report({ kind: 'arranque', ok: okA, why: `${rows.join(' · ')} (${spot.place})` });
      // a curva (M2): a regra simulada no mesmo accelerate() dos corpos — determinística (no mundo, o
      // caminho que ele escolhe ao mudar de alvo varia: às vezes contorna devagar, às vezes nem vira)
      const sim = (deg, over) => {
        const e = { walker: { vel: { x: 0, z: 0 }, speedScale: 1 }, vert: null, staggerT: 0 };
        const S = {};
        const dt = 1 / 60;
        let ang = 0;
        let before = 0;
        let low = Infinity;
        for (let t = 0; t < 6; t += dt) {
          if (t >= 2.5 && t < 2.5 + over) ang += ((deg * Math.PI) / 180) * (dt / over);
          accelerate(e, S, MOVE.high, dt);
          e.walker.vel.x = Math.sin(ang) * S.huntV;
          e.walker.vel.z = Math.cos(ang) * S.huntV;
          if (t < 2.5) before = S.huntV;
          else if (t < 2.5 + over + 1) low = Math.min(low, S.huntV);
        }
        return { before, low, turns: S.turns ?? 0, last: S.lastTurn ?? null };
      };
      const sharp = sim(90, 0.2);
      const small = sim(20, 0.1);
      const soft = sim(45, 2);
      const want = sharp.last ? sharp.last.from * (0.5 + 0.5 * Math.cos(sharp.last.th)) : 0;
      const okC = sharp.turns === 1 && sharp.last && Math.abs((sharp.last.th * 180) / Math.PI - 90) < 8 && Math.abs(sharp.last.to - want) < 0.05 && sharp.low < 0.6 * sharp.before && small.turns === 0 && soft.turns === 0;
      report({ kind: 'curva', ok: !!okC, why: `90° em 0,2 s: ${sharp.before.toFixed(1)} → ${sharp.low.toFixed(1)} m/s (${sharp.last ? Math.round((sharp.last.th * 180) / Math.PI) : '—'}° contados) · 20°: ${small.turns} curva · 45° em 2 s (suave): ${soft.turns} curva` });
      lantern(false);
      ctx.rules = rules0;
    }
  }

  };

  await sleep(SETTLE);
  if (ctx.params.get('sgpart') === 'arranque') {
    await arranque();
    clearInterval(watch);
    console.warn('CHECK:DONE');
    return;
  }

  // ── rondas ──
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  await waitFor(() => sg.byTerritory.size > 0, 10);
  const one = [...sg.byTerritory.values()][0];
  const p0 = one?.feet.clone();
  await sleep(3000);
  const moved = one ? one.feet.distanceTo(p0) : 0;
  report({ kind: 'rondas', ok: sg.byTerritory.size > 0 && moved > 2.5, why: `${sg.byTerritory.size} rondas perto · uma andou ${moved.toFixed(1)} m em 3 s · ${sg.none.size} territórios sem rede` });

  // (a vida presa em 50% desde aqui: o primeiro golpe — que pode vir ainda no "visto" — já é a captura)
  const hold50 = setInterval(() => !ctx.wake.active && ctx.health?.set(0.45), 200); // (45%: a regeneração não leva acima de 50% entre um ajuste e o golpe)
  // ── visto ──
  // até três tentativas (outro ponto do circuito, mais perto): uma curva ou uma escada no meio tapa a vista
  let e = null;
  let seen = false;
  lantern(true);
  for (const D of [22, 14, 9]) {
    e = meet(D);
    const spotted0 = sg.stats.spotted;
    seen = !!e && (await waitFor(() => sg.stats.spotted > spotted0, 15));
    if (seen || !e) break;
  }
  report({ kind: 'visto', ok: seen, why: e ? (seen ? `caçando (${e.sg.state})` : `não viu (${e.sg.state}, ${e.tier})`) : 'nenhuma ronda' });

  // ── captura ── (com a vida: a captura é o golpe que zera — com 50%, o primeiro já zera)
  const zeros = [];
  const offZ = world.bus.on('player:zero', (ev) => zeros.push(ev.source));
  let caughtEv = 0;
  const offC = world.bus.on('player:caught', () => caughtEv++);
  const caught0 = sg.stats.caught;
  const caught = seen && (await waitFor(() => sg.stats.caught > caught0, 25));
  clearInterval(hold50);
  offZ?.();
  offC?.();
  let why = caught ? '' : `não pegou (${e?.sg.state}, ${e?.level}, a ${e ? e.feet.distanceTo(here().setY(here().y - 1.7)).toFixed(1) : '?'} m · golpes ${sg.stats.strikes} acertos ${sg.stats.hits} · vida ${Math.round((ctx.health?.value ?? 1) * 100)}% · desmaio ${ctx.wake.active} · zerou por ${zeros.join(',') || '—'} · player:caught ${caughtEv})`;
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
  await waitFor(() => !ctx.wake.active, 90);
  ctx.health?.set(1);
  ctx.player.energy.value = 1;
  if (ctx.params.get('sgpart') === 'captura') {
    clearInterval(watch);
    console.warn('CHECK:DONE');
    return;
  }

  // ── escondido ──
  ctx.ui.teleport('teia', 'teia');
  await sleep(SETTLE);
  await waitFor(() => [...sg.byTerritory.values()].some((x) => x.sg.state === 'patrol'), 10);
  lantern(true);
  let seen2 = false;
  for (const D of [20, 12, 8]) {
    e = meet(D);
    const s1 = sg.stats.spotted;
    seen2 = !!e && (await waitFor(() => sg.stats.spotted > s1, 15));
    if (seen2 || !e) break;
  }
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
  const out = hunters.filter((h) => ['hunt', 'search', 'strike', 'grab'].includes(h.sg.state)); // (rápidos: já golpeando, ou já pegaram)
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
  // o que falta do caminho (ele vem pelo grafo: em linha reta pode até se afastar no começo)
  const left = (x) => {
    if (!x.path || x.sg.state !== 'summon') return 0;
    const P = x.path.pts;
    let L = P[x.pi] ? x.feet.distanceTo(new THREE.Vector3(P[x.pi].x, P[x.pi].y, P[x.pi].z)) : 0;
    for (let i = x.pi + 1; i < P.length; i++) L += Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y, P[i].z - P[i - 1].z);
    return L;
  };
  const d0 = called ? left(called) : 0;
  await sleep(8000);
  const d1 = called ? left(called) : 0;
  report({ kind: 'chamado', ok: n === 1 && !!called && (d1 < d0 - 10 || called.sg.state !== 'summon'), why: called ? `faltavam ${Math.round(d0)} m de caminho → ${Math.round(d1)} m (${called.sg.state})` : 'ninguém veio' });

  // ── subir: atrás de você, noutro nível ──
  for (const how of ['elevador', 'escada']) {
    let res = null;
    if (ctx.ui.teleport('camada', 'camada')) {
      controls.setMode('walk');
      await sleep(SETTLE);
      const g = here();
      let car = null;
      for (const c of world.elevators.cars.values()) if (c.def.kind === 'grand' && (!car || Math.hypot(c.def.x - g.x, c.def.z - g.z) < Math.hypot(car.def.x - g.x, car.def.z - g.z))) car = c;
      const x = [...sg.byTerritory.values()][0];
      if (car && x) {
        const d = car.def;
        const outages = world.elevators.outages;
        world.elevators.outages = null; // (o setor pode estar apagado: aqui o elevador anda)
        const from = how === 'elevador' ? new THREE.Vector3(d.x + 34, d.y0, d.z) : new THREE.Vector3(d.x + 6.5, d.y0, d.z + 34);
        const top = new THREE.Vector3(d.x + 30, d.y1, d.z + 2);
        // a câmera vai lá embaixo antes (o chão carrega) e depois segue o Safeguard voando —
        // voando ninguém te percebe: ele só tem o último lugar onde te viu, lá em cima
        // (a Peregrinação não deixa voar: só durante este caso)
        const couldFly = controls.canFly;
        controls.canFly = true;
        controls.setMode('fly');
        controls.setView({ pos: from.clone().sub(world.origin).setY(from.y - world.origin.y + 3), yaw: 0, pitch: -0.3, scale: 1 });
        await waitFor(() => world.chunkLayer.isReadyAround(from, 40), 20);
        await sleep(2500);
        x.feet.copy(from);
        world.entities.toNear(x, world.origin);
        if (how === 'escada') for (const id of world.elevators.cars.keys()) x.vertBan.set(id, Infinity);
        Object.assign(x.sg, { state: 'search', lastSeen: top.clone(), searchT: 0, sees: false, unseen: 0, prey: null });
        const { followBody } = await import('../app/dev.js');
        const stop = followBody(ctx, x);
        let maxY = x.feet.y;
        let tr = 0;
        const ok = await waitFor(() => {
          if (ctx.params.get('sgtrace') && performance.now() - tr > 1000) {
            tr = performance.now();
            console.warn(`BEING sg ${x.sg.state} t${x.tier} chão ${x.walker.grounded} busca ${x.sg.searchT?.toFixed(1)} vel ${x.speed.toFixed(2)} dy ${(top.y - x.feet.y).toFixed(1)} ${x.vert ? x.vert.kind + ':' + x.vert.phase : '-'} câmera a ${x.feet.distanceTo(here()).toFixed(0)} m ${controls.mode} ${ctx.wake.active ? 'DESMAIO' : ''}`);
          }
          maxY = Math.max(maxY, x.feet.y);
          return Math.abs(x.feet.y - top.y) < 2 && x.walker.grounded;
        }, 220);
        stop();
        controls.setMode('walk');
        controls.canFly = couldFly;
        world.elevators.outages = outages;
        res = { ok, up: maxY - from.y, H: top.y - from.y, state: x.sg.state, vert: x.vert ? `${x.vert.kind} ${x.vert.phase}` : '-' };
        x.vertBan.clear();
        sg._lose?.(x);
      }
    }
    report({ kind: `subir:${how}`, ok: !!res?.ok, why: res ? `subiu ${res.up.toFixed(0)} de ${res.H.toFixed(0)} m · ${res.state} · ${res.vert}` : 'sem elevador grande ou sem ronda' });
  }

  await arranque();

  clearInterval(watch);
  for (const x of sg.all()) {
    fiscal.wall = Math.max(fiscal.wall, x.stats.wall);
    fiscal.fell = Math.max(fiscal.fell, x.stats.fell);
  }
  report({ kind: 'fiscal', ok: fiscal.wall === 0 && fiscal.fell === 0, why: `atravessou parede ${fiscal.wall}× · caiu ${fiscal.fell}×` });
  console.warn('CHECK:DONE');
}
