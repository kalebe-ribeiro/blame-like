// ─────────────────────────────────────────────────────────────────────────────
//  Teste dos movimentos dos seres (`npm run check:moves`): o que o jogador
//  faz, um corpo (um morador de teste, com o mesmo Walker) também faz.
//
//    quina     diante de uma quina alta (1,3–2,25 m), o alvo em cima: pula, agarra, sobe
//    escada    o alvo lá em cima de uma escada de marinheiro: vai até ela e sobe
//    elevador  no alto de uma passagem, o alvo embaixo: espera o elevador grande,
//              entra, desce, sai (pulando o vão do anel de embarque)
//    vagao     numa estação, o destino na estação seguinte: o caminho usa o vagão
//              (perna 'ride'); espera, embarca, viaja, desce e chega
//    viagem    de uma rede à da camada de cima: a ponte até o anel, o elevador grande,
//              a rampa até a plataforma lá em cima (Field.passageLinks, perna 'lift')
//  A câmera segue o corpo (o corpo fica na física completa).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { followBody } from '../app/dev.js';
import { scanLedges } from './climbtest.js';
import { TRANSIT } from '../gen/field.js';

const SETTLE = 7000;
const DOWN = new THREE.Vector3(0, -1, 0);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runMoveTest(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
  }
  console.warn('CHECK:DONE');
}

async function run(ctx) {
  const { world, camera, controls } = ctx;
  const E = world.entities;
  E.debugVert = !!ctx.params.get('movetrace');
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  const only = ctx.params.get('moveonly');
  const want = (k) => !only || only === k;
  const events = [];
  for (const ev of ['being:leap', 'being:ladder', 'being:lift', 'being:board', 'being:ride', 'being:level', 'being:die', 'being:stuck']) world.bus.on(ev, (d) => events.push({ ev, ...d }));
  let traced = null; // o corpo cujo estado vai ao terminal (--movetrace)
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    let last = 0;
    while (!cond() && performance.now() - t0 < s * 1000) {
      await sleep(150);
      const e = traced;
      if (e && ctx.params.get('movetrace') && performance.now() - last > 1000) {
        last = performance.now();
        const o = world.origin;
        console.warn(`MOVE ${e.id} ${e.tier} ${e.vert ? e.vert.kind + ':' + e.vert.phase : e.ride ? 'ride:' + e.ride.phase : e.state} pés ${e.feet.toArray().map((v, i) => Math.round(v - [o.x, o.y, o.z][i]))} chão ${e.walker.grounded} ${e.walker.climbing ? 'escada' : ''} ${e.why ?? ''}${e.vert?.kind === 'lift' ? ` carro y ${e.vert.car.y.toFixed(1)} (${e.vert.from}→${e.vert.to}) motor ${e.vert.car.rate.toFixed(2)}` : ''}${e.ride ? ` vagões ${[...world.transit.cars.values()].filter((c) => c.line.id === e.ride.leg.ride.line).map((c) => Math.round(c.t)).join('/')} relógio ${world.transit.clocks.get(e.ride.leg.ride.line)?.rate.toFixed(2)}` : ''}`);
      }
    }
    return cond();
  };
  let n = 0;
  /** Um corpo de teste que anda até `target` (GLOBAL) pelo walkToward (como quem caça). */
  const walker = async (feet, target, yaw = 0) => {
    // a câmera vai antes, e o chão de lá carrega
    controls.setMode('fly');
    controls.setView({ pos: feet.clone().sub(world.origin).setY(feet.y - world.origin.y + 2.5), yaw, pitch: -0.3, scale: 1 });
    await waitFor(() => world.chunkLayer.isReadyAround(feet, 40), 20);
    await sleep(2500);
    const col = controls.walker.col;
    col.buildsPerFrame = 600;
    col.refresh(feet.clone().sub(world.origin), 20);
    col.buildsPerFrame = 2;
    const fl = col.ray(feet.clone().sub(world.origin).setY(feet.y - world.origin.y + 1.2), DOWN, 3);
    console.warn(`MOVE spawn ${feet.toArray().map(Math.round)} chão ${fl ? (fl.point.y + world.origin.y - feet.y).toFixed(2) : 'NENHUM'}`);
    const e = E.spawn({ id: `mv${++n}`, kind: 'human', feet, yaw, persist: false, brain: { think: (b, dt, g, origin, time) => E.walkToward(b, target, dt, origin, time) } });
    traced = e;
    return e;
  };
  await sleep(SETTLE);

  // ── quina ──
  if (want('quina')) {
    let res = null;
    for (const place of ['colmeia', 'macico', 'deposito', 'maquinas', 'estrato', 'escadaria', 'construtores', 'galeria', 'silo']) {
      if (!ctx.ui.teleport(place, place)) continue;
      controls.setMode('walk');
      await sleep(SETTLE);
      const f = scanLedges(ctx);
      console.warn(`MOVE scan ${place}: vault ${!!f.vault} hang ${!!f.hang}`);
      const c = f.hang;
      if (!c) continue;
      const o = world.origin;
      const feet = c.feet.clone().add(o);
      const top = c.l.landY ?? c.l.topY;
      const target = c.l.edge.clone().addScaledVector(c.l.nrm, -1.4).add(o);
      target.y = top + o.y;
      const e = await walker(feet, target, c.yaw);
      const stop = followBody(ctx, e);
      const ok = await waitFor(() => e.feet.y > target.y - 0.3 && e.walker.grounded && !e.leap, 20);
      stop();
      res = { place, ok, h: c.l.h, dy: e.feet.y - target.y, leaps: events.filter((x) => x.ev === 'being:leap' && x.id === e.id).length };
      E.remove(e.id);
      break;
    }
    report({ kind: 'quina', ok: !!res?.ok, why: res ? `${res.place}: quina de ${res.h.toFixed(2)} m · ${res.ok ? 'subiu' : `parou ${res.dy.toFixed(2)} m do topo`} · pulos ${res.leaps}` : 'nenhuma quina alta achada' });
  }

  // ── escada: a de manutenção ao lado do elevador grande (gen/macrogen.js: x +8,2, z +34),
  //    do anel de embarque de baixo até o patamar da ponte de cima (~220 m) ──
  if (want('escada')) {
    let res = null;
    if (ctx.ui.teleport('camada', 'camada')) {
      controls.setMode('walk');
      await sleep(SETTLE);
      const g = world.toGlobal(camera.position, new THREE.Vector3());
      let car = null;
      for (const c of world.elevators.cars.values()) if (c.def.kind === 'grand' && (!car || Math.hypot(c.def.x - g.x, c.def.z - g.z) < Math.hypot(car.def.x - g.x, car.def.z - g.z))) car = c;
      if (car) {
        const d = car.def;
        const feet = new THREE.Vector3(d.x + 6.5, d.y0, d.z + 34);
        const target = new THREE.Vector3(d.x, d.y1, d.z + 30); // a ponte +z de cima
        const e = await walker(feet, target, -Math.PI / 2);
        for (const id of world.elevators.cars.keys()) e.vertBan.set(id, Infinity); // (aqui: a escada, não o elevador)
        const y0 = feet.y;
        let maxY = y0;
        const stop = followBody(ctx, e);
        await waitFor(() => {
          maxY = Math.max(maxY, e.feet.y);
          return (Math.abs(e.feet.y - target.y) < 1.5 && e.walker.grounded && !e.vert) || e.dead;
        }, 200);
        stop();
        const lad = events.find((x) => x.ev === 'being:ladder' && x.id === e.id);
        res = { ok: Math.abs(e.feet.y - target.y) < 1.5 && !e.dead && !!lad, climbed: maxY - y0, H: target.y - y0, end: e.feet.y - target.y, state: e.vert ? `${e.vert.kind} ${e.vert.phase}` : '-', dead: e.dead };
        // e desce de volta: até a beirada, monta na escada por cima, desce, sai embaixo
        if (res.ok) {
          const back = new THREE.Vector3(d.x + 4, d.y0, d.z + 34);
          e.brain.think = (b, dt, g, origin, time) => E.walkToward(b, back, dt, origin, time);
          const stop2 = followBody(ctx, e);
          let minY = e.feet.y;
          await waitFor(() => {
            minY = Math.min(minY, e.feet.y);
            return (Math.abs(e.feet.y - back.y) < 1.5 && e.walker.grounded && !e.vert) || e.dead;
          }, 200);
          stop2();
          const mounted = events.some((x) => x.ev === 'being:level' && x.id === e.id && x.dy < 0);
          report({ kind: 'escada-desce', ok: Math.abs(e.feet.y - back.y) < 1.5 && !e.dead, why: `${mounted ? 'montou na escada' : 'não achou a escada'} · desceu ${(target.y - minY).toFixed(1)} m · terminou a ${(e.feet.y - back.y).toFixed(1)} m do anel · ${e.vert ? e.vert.kind + ' ' + e.vert.phase : '-'}${e.dead ? ' · MORREU' : ''}` });
        }
        E.remove(e.id);
      }
    }
    report({ kind: 'escada', ok: !!res?.ok, why: res ? `subiu ${res.climbed.toFixed(1)} de ${res.H.toFixed(0)} m · terminou a ${res.end.toFixed(1)} m da ponte · ${res.state}${res.dead ? ' · MORREU' : ''}` : 'nenhum elevador grande' });
  }

  // ── elevador ──
  if (want('elevador')) {
    let res = null;
    if (ctx.ui.teleport('camada', 'camada')) {
      controls.setMode('walk');
      await sleep(SETTLE);
      const g = world.toGlobal(camera.position, new THREE.Vector3());
      let car = null;
      for (const c of world.elevators.cars.values()) if (c.def.kind === 'grand' && (!car || Math.hypot(c.def.x - g.x, c.def.z - g.z) < Math.hypot(car.def.x - g.x, car.def.z - g.z))) car = c;
      if (car) {
        const d = car.def;
        const feet = new THREE.Vector3(d.x + 36, d.y1, d.z);
        const target = new THREE.Vector3(d.x + 34, d.y0, d.z);
        // (o setor pode estar apagado: aqui o elevador tem energia — o teste é embarcar e descer)
        const outages = world.elevators.outages;
        world.elevators.outages = null;
        const e = await walker(feet, target, Math.PI / 2);
        const stop = followBody(ctx, e);
        const ok = await waitFor(() => (Math.abs(e.feet.y - d.y0) < 1.5 && e.walker.grounded && !e.vert) || e.dead, 300);
        stop();
        world.elevators.outages = outages;
        res = { ok: ok && !e.dead && events.some((x) => x.ev === 'being:lift' && x.id === e.id), dy: e.feet.y - d.y0, H: d.y1 - d.y0, phase: e.vert?.phase ?? '-', board: events.some((x) => x.ev === 'being:board' && x.id === e.id), dead: e.dead, lift: events.some((x) => x.ev === 'being:lift' && x.id === e.id) };
        E.remove(e.id);
      }
    }
    report({ kind: 'elevador', ok: !!res?.ok, why: res ? `desceu ${res.H.toFixed(0)} m? ${res.lift ? 'sim' : 'não'} · embarcou ${res.board} · a ${res.dy.toFixed(1)} m do piso de baixo · ${res.phase}${res.dead ? ' · MORREU' : ''}` : 'nenhum elevador grande' });
  }

  // ── viagem: de camada em camada pela passagem ──
  if (want('viagem')) {
    let res = null;
    const F = world.field;
    const g = world.toGlobal(camera.position, new THREE.Vector3());
    let L = null;
    for (let r = 0; r <= 8 && !L; r++) {
      for (const b of [...F.barriersNear(g.y), ...F.barriersNear(g.y + 2880), ...F.barriersNear(g.y - 2880)]) {
        for (let pi = Math.floor(g.x / 1920) - r; pi <= Math.floor(g.x / 1920) + r && !L; pi++) {
          for (let pk = Math.floor(g.z / 1920) - r; pk <= Math.floor(g.z / 1920) + r && !L; pk++) {
            const p = F.passage(b.n, pi, pk);
            if (!p) continue;
            const q = F.passageLinks(b, p);
            if (q.bottom && q.top) L = q;
          }
        }
      }
    }
    if (L) {
      const nb = L.bottom.node;
      const nt = L.top.node;
      const outages = world.elevators.outages;
      world.elevators.outages = null; // (o elevador com energia — o teste é viajar)
      const feet = new THREE.Vector3(nb.x, nb.y, nb.z);
      // a câmera vai antes e segue o corpo voando (a Peregrinação não deixa voar: só aqui)
      const couldFly = controls.canFly;
      controls.canFly = true;
      controls.setMode('fly');
      controls.setView({ pos: feet.clone().sub(world.origin).setY(feet.y - world.origin.y + 4), yaw: 0, pitch: -0.3, scale: 1 });
      await waitFor(() => world.chunkLayer.isReadyAround(feet, 40), 30);
      await sleep(3000);
      const e = E.spawn({ id: `mv${++n}`, kind: 'human', feet: { x: nb.x, y: nb.y, z: nb.z }, persist: false, goal: { x: nt.x, y: nt.y, z: nt.z } });
      traced = e;
      const kinds = e.path ? e.path.legs.map((l) => l.kind) : [];
      const lg = e.path?.legs.find((l) => l.kind === 'lift');
      if (lg) console.warn(`MOVE perna lift: passagem x ${L.p.x.toFixed(1)} z ${L.p.z.toFixed(1)} · topo dir ${L.top.dir} · pts ${lg.pts.map((q) => [q.x - L.p.x, q.y, q.z - L.p.z].map(Math.round).join('/')).join(' → ')}`);
      const stop = followBody(ctx, e);
      const ok = await waitFor(() => e.state === 'arrived' || e.state === 'stuck' || e.state === 'lost' || e.dead, 420);
      stop();
      controls.setMode('walk');
      controls.canFly = couldFly;
      world.elevators.outages = outages;
      const at = Math.hypot(e.feet.x - nt.x, e.feet.z - nt.z) + Math.abs(e.feet.y - nt.y);
      res = { ok: ok && e.state === 'arrived' && at < 8 && kinds.includes('lift'), kinds, state: e.state, at, dy: nt.y - nb.y, lift: events.some((x) => x.ev === 'being:lift' && x.id === e.id), dead: e.dead };
      console.warn(`MOVE eventos: ${events.filter((x) => x.id === e.id).map((x) => x.ev.slice(6) + (x.kind ? ':' + x.kind : '')).join(' ')} · proibidos ${[...e.vertBan.keys()].join(',')} · evitar ${[...e.avoid].join(' | ')}`);
      E.remove(e.id);
    }
    report({ kind: 'viagem', ok: !!res?.ok, why: res ? `caminho ${res.kinds.join(',')} · subiu de elevador ${res.lift} · ${res.state} a ${res.at.toFixed(1)} m do destino (${res.dy.toFixed(0)} m acima)${res.dead ? ' · MORREU' : ''}` : 'nenhuma passagem com as duas pontes' });
  }

  // ── vagão ──
  if (want('vagao')) {
    let res = null;
    if (ctx.ui.teleport('transportador', 'transportador')) {
      controls.setMode('walk');
      await sleep(SETTLE);
      const g = world.toGlobal(camera.position, new THREE.Vector3());
      const nav = E.nav;
      const L = world.field.transitLinesNear(g.x, g.y, g.z, 60).find((l) => Math.abs(l.y - g.y) < 3);
      if (L) {
        const S = TRANSIT.station;
        const wk = L.axis === 'z' ? nav.walkZ(Math.round(L.u / 480), Math.round(L.y / 288)) : nav.walkX(Math.round((L.y - 144) / 288), Math.round((L.u - 240) / 480));
        const tp = L.axis === 'z' ? g.z : g.x;
        const ts = Math.round((tp - S / 2) / S) * S + S / 2;
        const td = ts + L.track.dir * S;
        const v0 = nav.walkVertex(wk, ts);
        const v1 = nav.walkVertex(wk, td);
        const outages = world.transit.outages;
        world.transit.outages = null; // (aqui a linha tem energia — o teste é viajar)
        const e = E.spawn({ id: `mv${++n}`, kind: 'human', feet: { x: v0.x, y: v0.y, z: v0.z }, persist: false, goal: { x: v1.x, y: v1.y, z: v1.z } });
        traced = e;
        console.warn(`MOVE linha: u ${L.u} largura ${L.w.width} trilho off ${L.track.off} lado ${L.track.side} dir ${L.track.dir} · wk.u ${wk?.u} · W0 ${[v0.x, v0.z].map(Math.round)} C0 ${(() => { const c = nav.carPoint(wk, ts); return [c.x, c.z].map(Math.round); })()}`);
        console.warn(`MOVE vagão: ${wk ? wk.key : 'sem passarela'} trilho ${!!wk?.w.track} ${ts}→${td} · caminho ${e.path ? e.path.legs.map((l) => l.kind).join(',') : e.state}`);
        const rides = e.path?.legs?.filter((l) => l.kind === 'ride').length ?? 0;
        const stop = followBody(ctx, e);
        const ok = await waitFor(() => e.state === 'arrived' || e.state === 'stuck' || e.state === 'lost' || e.dead, 330);
        stop();
        world.transit.outages = outages;
        const at = Math.hypot(e.feet.x - v1.x, e.feet.z - v1.z);
        res = { ok: ok && e.state === 'arrived' && at < 6 && events.some((x) => x.ev === 'being:ride' && x.id === e.id), rides, state: e.state, at, board: events.some((x) => x.ev === 'being:board' && x.id === e.id), phase: e.ride?.phase ?? '-' };
        E.remove(e.id);
      }
    }
    report({ kind: 'vagao', ok: !!res?.ok, why: res ? `pernas de vagão no caminho: ${res.rides} · embarcou ${res.board} · ${res.state} a ${res.at.toFixed(1)} m do destino (1440 m adiante) · ${res.phase}` : 'nenhuma linha' });
  }
}
