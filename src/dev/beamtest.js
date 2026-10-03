// ─────────────────────────────────────────────────────────────────────────────
//  Teste da arma de Killy — fase F1, o protótipo de risco (`npm run check:beam`;
//  o cofre, Arma-do-Killy §6 e §8). Só o corte, sem a arma na mão nem efeitos:
//  um tiro "cheio" (400 m, raio 2,8 m) é `world.addCut` com o alcance de `beamReach`.
//
//    furo        numa parede: o raio de colisão passa; a parede do corte existe
//                (de dentro do furo, para o lado, bate a ~r do eixo)
//    camada      o feixe acaba numa camada intransponível (beamReach)
//    unica       e numa estrutura única (de fora e de dentro)
//    torre       a torre do elevador grande não se corta (protegida)
//    luzes       nenhuma luz de chunk dentro de um corte
//    grafo       uma ponte cortada sai dos vizinhos do grafo dos seres
//    vagao       um trilho cortado para a linha
//    recarregar  saindo e voltando, os chunks cortados vêm do cache
//    tempo       10 tiros em lugares diferentes: o furo perto e o tiro inteiro (orçamento §8)
//  F2, o jogo (app/beam.js — antes, com a célula cheia; --beampart=f1|f2 roda só uma parte):
//    carga       0,2 s não atira; 1 s → k da curva; 2,5 s → cheio (18%); 5 cheios por célula;
//                o sexto, com 10%, para onde a célula alcança
//    andar       carregando: 60% do passo, sem correr nem pular (C2)
//    estados     cada cancelamento (correr, Shift, clique direito, painel, mão, célula) — sem
//                tiro, sem gasto, e só um aperto novo carrega
//    controle    RT segurado atira; LT cancela (C4) — por um controle falso
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { beamReach } from '../gen/beamreach.js';
import { chargeK, shotOf, jamAt } from '../app/beam.js';
import { onWorldBuilt } from '../app/render.js';
import { bindings } from '../controls/bindings.js';
import { cutKey, cacheGet } from '../world/cutCache.js';

const SETTLE = 7000;
const RANGE = 400;
const R = 2.8;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBeamTest(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
  }
  ctx.controls.forceInput = null;
  console.warn('CHECK:DONE');
}

async function run(ctx) {
  const { world, camera, controls } = ctx;
  const F = world.field;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));
  const layers = [...world.layers, world.macroLayer];
  const g = () => world.toGlobal(camera.position, new THREE.Vector3());

  /**
   * Um tiro de a (GLOBAL) na direção dir: o corte, e espera os chunks refeitos entrarem.
   * → { t, stop, n (chunks pedidos), first (ms até o primeiro trocar), last (ms até o último) }
   */
  const shoot = async (a, dir, range = RANGE, r = R) => {
    const { t, stop } = beamReach(F, a, dir, range);
    const b = a.clone().addScaledVector(dir, t);
    let swapped = 0;
    let first = null;
    let last = null;
    let firstE = null; // o primeiro chunk trocado: { worker (ms), csg (ms), peças cortadas }
    let worker = 0; // o tempo de worker somado de todos os chunks refeitos
    const t0 = performance.now();
    for (const L of layers) {
      L.onRecut = (e) => {
        swapped++;
        const ms = performance.now() - t0;
        worker += e.workMs ?? 0;
        firstE ??= { worker: e.recutMs ?? -1, csg: e.cutStats?.ms ?? -1, pieces: e.cutStats?.cut ?? -1, memo: e.cutStats?.memo ?? 0, slow: (e.cutStats?.slow ?? []).join(' '), layer: L.layer };
        first ??= ms;
        last = ms;
      };
    }
    const counts = t > 0.5 ? world.addCut({ a: a.toArray(), b: b.toArray(), r }, a) : {};
    const n = Object.values(counts).reduce((s, v) => s + v, 0);
    const end = performance.now() + 15000;
    while (swapped < n && performance.now() < end) await sleep(20);
    for (const L of layers) L.onRecut = null;
    return { t, stop, n, swapped, first, last, firstE, worker, a, b };
  };
  const refreshCol = (col, at) => {
    col._t = -1e9; // (a lista de malhas é reaproveitada por 300 ms: refazer agora)
    col.buildsPerFrame = 600;
    col.refresh(at, 40);
    col.buildsPerFrame = 2;
  };

  await sleep(SETTLE);
  const part = ctx.params.get('beampart');
  if (part !== 'f1') await runF2(ctx, report);
  if (part === 'f2') return;

  // ── camada e única (puros) ──
  {
    let res = null;
    for (const b of F.barriersNear(0)) {
      for (let i = 0; i < 400 && !res; i++) {
        const x = (i % 20) * 37 + 11;
        const z = Math.floor(i / 20) * 41 + 7;
        if (!F.barrierTileSolid(b, x, z)) continue;
        res = beamReach(F, new THREE.Vector3(x, b.top + 50, z), new THREE.Vector3(0, -1, 0), RANGE);
      }
      if (res) break;
    }
    report({ kind: 'camada', ok: !!res && res.stop === 'layer' && Math.abs(res.t - 50) < 0.01, why: res ? `parou em ${res.t.toFixed(2)} m (${res.stop}) — a laje a 50 m` : 'nenhuma laje' });
    let u = null;
    for (const b of F.barriersNear(0)) {
      for (let i = -6; i <= 6 && !u; i++) for (let k = -6; k <= 6 && !u; k++) u = F.uniqueSite(b.n, i, k);
      if (u) break;
    }
    if (u) {
      const out = beamReach(F, new THREE.Vector3(u.x - 200, u.y + 10, u.z), new THREE.Vector3(1, 0, 0), RANGE);
      const inn = beamReach(F, new THREE.Vector3(u.x, u.y + 1.7, u.z), new THREE.Vector3(1, 0, 0), RANGE);
      report({ kind: 'unica', ok: out.stop === 'unique' && Math.abs(out.t - (200 - u.hx - 1)) < 0.01 && inn.stop === 'unique' && Math.abs(inn.t - (u.hx - 3.2)) < 0.01, why: `de fora ${out.t.toFixed(1)} m (${out.stop}) · de dentro ${inn.t.toFixed(1)} m (${inn.stop})` });
    } else report({ kind: 'unica', ok: false, why: 'nenhuma única' });
  }

  // ── furo: uma parede na frente ──
  const w = controls.walker;
  let wall = null;
  for (const place of ['colmeia', 'macico', 'deposito', 'maquinas']) {
    if (!ctx.ui.teleport(place, place)) continue;
    controls.setMode('walk');
    await sleep(SETTLE);
    refreshCol(w.col, camera.position.clone());
    const feet = w.feet.clone();
    for (let q = 0; q < 16 && !wall; q++) {
      const yaw = (q / 16) * Math.PI * 2;
      const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
      const h = w.col.ray(feet.clone().setY(feet.y + 1.7), dir, 12);
      if (h && h.distance > 3 && h.face && Math.abs(h.face.normal.y) < 0.3) wall = { place, feet, dir, d: h.distance };
    }
    if (wall) break;
  }
  let cutWall = null;
  if (!wall) report({ kind: 'furo', ok: false, why: 'nenhuma parede' });
  else {
    const eye = wall.feet.clone().setY(wall.feet.y + 1.7);
    const a = eye.clone().add(world.origin);
    const s = await shoot(a, wall.dir);
    refreshCol(w.col, eye);
    const after = w.col.ray(eye, wall.dir, 30);
    const through = !after || after.distance > wall.d + 1;
    // a parede do corte: de um ponto do eixo logo depois da superfície (15 cm — paredes finas,
    // como as da colmeia, não deixam ir mais fundo), em 8 direções em volta do eixo: batidas a
    // ~r (a parede do túnel) e nenhuma dentro do furo
    const inside = eye.clone().addScaledVector(wall.dir, wall.d + 0.15);
    const side = new THREE.Vector3(-wall.dir.z, 0, wall.dir.x);
    const up = new THREE.Vector3().crossVectors(side, wall.dir).normalize();
    const walls = [];
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2;
      const d = side.clone().multiplyScalar(Math.cos(ang)).addScaledVector(up, Math.sin(ang));
      walls.push(w.col.ray(inside, d, R + 2)?.distance ?? null);
    }
    const near = walls.filter((d) => d !== null && Math.abs(d - R) < 0.45).length;
    const bad = walls.filter((d) => d !== null && d < R - 0.45).length;
    cutWall = { s, eye };
    report({ kind: 'furo', ok: s.swapped === s.n && s.n > 0 && through && near >= 2 && bad === 0, why: `${wall.place}: parede a ${wall.d.toFixed(1)} m · ${s.swapped}/${s.n} chunks refeitos · raio depois ${after ? after.distance.toFixed(1) + ' m' : 'livre'} · parede do corte a ${walls.map((d) => (d === null ? '-' : d.toFixed(2))).join('/')} m (r ${R})` });
  }

  // ── luzes: nenhuma luz de chunk dentro de um corte ──
  {
    let bad = 0;
    let total = 0;
    for (const L of layers) {
      for (const e of L.chunks.values()) {
        for (const l of e.lights ?? []) {
          total++;
          if (F.cutAt(l.x, l.y, l.z, 0)) bad++;
        }
      }
    }
    // e um tiro de propósito numa luminária perto
    let aimed = null;
    const here = g();
    for (const L of layers) {
      for (const e of L.chunks.values()) {
        for (const l of e.lights ?? []) {
          const d = Math.hypot(l.x - here.x, l.y - here.y, l.z - here.z);
          if (d > 8 && d < 60 && (!aimed || d < aimed.d)) aimed = { l, d, e, L };
        }
      }
    }
    let gone = null;
    if (aimed) {
      const a = here.clone();
      const dir = new THREE.Vector3(aimed.l.x, aimed.l.y, aimed.l.z).sub(a).normalize();
      await shoot(a, dir, aimed.d + 2, 1.2);
      gone = !(aimed.e.lights ?? []).some((l) => Math.hypot(l.x - aimed.l.x, l.y - aimed.l.y, l.z - aimed.l.z) < 0.5);
    }
    report({ kind: 'luzes', ok: bad === 0 && gone !== false, why: `${bad} de ${total} luzes dentro de cortes · a luminária atingida ${gone === null ? '(nenhuma perto)' : gone ? 'sumiu' : 'CONTINUA'}` });
  }

  // ── recarregar: sai e volta — os chunks cortados vêm do cache ──
  if (cutWall) {
    const back = camera.position.clone().add(world.origin);
    // os chunks com cortes carregados agora (os que entram só na volta nunca foram feitos — não estão no cache)
    const before = new Map(); // → os ids dos cortes dele ao sair
    const ids = (L, e) => L.cutsFor(e.cx, e.cy, e.cz).map((c) => c.id).sort().join(',');
    const objs = new Set(); // (as entradas de agora: uma que nunca descarregou não passa pelo cache)
    for (const L of layers) for (const e of L.chunks.values()) if (e.received && L.cutsFor(e.cx, e.cy, e.cz).length) {
      before.set(L.layer + (L.level ?? '') + e.key, ids(L, e));
      objs.add(e);
    }
    ctx.ui.teleport('vazio', 'vazio');
    await sleep(SETTLE);
    const far = g().distanceTo(back);
    controls.setMode('fly');
    controls.setView({ pos: back.clone().sub(world.origin), yaw: 0, pitch: 0, scale: 1 });
    await sleep(SETTLE + 3000);
    let cut = 0;
    let cached = 0;
    const miss = [];
    let stayed = 0;
    for (const L of layers) {
      for (const e of L.chunks.values()) {
        if (!L.cutsFor(e.cx, e.cy, e.cz).length || !e.received || !before.has(L.layer + (L.level ?? '') + e.key)) continue;
        if (objs.has(e)) {
          stayed++;
          continue;
        }
        cut++;
        if (e.fromCache) cached++;
        else {
          const k = L.layer + (L.level ?? '') + e.key;
          const hit = !!(await cacheGet(cutKey(L.seed, L.layer, L.level, e.cx, e.cy, e.cz, L.cutsFor(e.cx, e.cy, e.cz))));
          miss.push(`${k} cortes ${before.get(k)}→${ids(L, e)} memo ${L.boxMemo.get(e.key)?.none ? 'nenhum' : L.boxMemo.has(e.key) ? 'caixas' : '-'} no cache agora ${hit}`);
        }
      }
    }
    report({ kind: 'recarregar', ok: cut > 0 && cached === cut, why: `foi a ${far.toFixed(0)} m · ${cut} chunks com cortes ao voltar · ${cached} lidos do cache · ${stayed} nunca descarregaram${miss.length ? ' · fora: ' + miss.join(' | ') : ''}` });
  }

  // ── grafo: uma ponte cortada sai dos vizinhos ──
  {
    ctx.ui.teleport('teia', 'teia');
    controls.setMode('walk');
    await sleep(SETTLE);
    const here = g();
    const nav = world.entities.nav;
    const v = nav.vertexAt(here.x, here.y - 1.7, here.z) ?? nav.nodeVertex(F.nearestNode(here.x, here.y, here.z));
    let ok = false;
    let why = 'nenhum vértice';
    if (v) {
      const len = (pts) => pts.reduce((a, p, k) => (k ? a + Math.hypot(p.x - pts[k - 1].x, p.y - pts[k - 1].y, p.z - pts[k - 1].z) : 0), 0);
      const all = nav.neighbors(v);
      const nb = all.find((x) => !['ride', 'lift', 'link'].includes(x.kind) && len(x.pts) > 8);
      if (nb) {
        // o meio do caminho, cortado de cima
        const p = nb.pts[0];
        const q = nb.pts[nb.pts.length - 1];
        const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 };
        const mid = nb.pts.length > 2 ? nb.pts[Math.floor(nb.pts.length / 2)] : m;
        await shoot(new THREE.Vector3(mid.x, mid.y + 30, mid.z), new THREE.Vector3(0, -1, 0), 60, R);
        const still = nav.neighbors(v).some((x) => x.v.id === nb.v.id && x.kind === nb.kind);
        ok = !still;
        why = `${nb.kind} de ${v.id} a ${nb.v.id} (${len(nb.pts).toFixed(0)} m): ${still ? 'AINDA no grafo' : 'saiu do grafo'}`;
      } else why = `${v.id} sem caminho longo (${all.map((x) => x.kind + ':' + len(x.pts).toFixed(0)).join(' ')})`;
    }
    report({ kind: 'grafo', ok, why });
  }

  // ── vagão: trilho cortado, a linha para ──
  {
    let ok = false;
    let why = 'nenhuma linha';
    if (ctx.ui.teleport('transportador', 'transportador')) {
      controls.setMode('walk');
      await sleep(SETTLE);
      const here = g();
      const L = F.transitLinesNear(here.x, here.y, here.z, 80).find((l) => Math.abs(l.y - here.y) < 3);
      if (L) {
        const lat = L.u + L.track.off;
        const tp = (L.axis === 'z' ? here.z : here.x) + 40;
        const p = L.axis === 'z' ? new THREE.Vector3(lat, L.y - 1.5, tp) : new THREE.Vector3(tp, L.y - 1.5, lat);
        await shoot(p.clone().setY(p.y + 20), new THREE.Vector3(0, -1, 0), 30, R);
        await sleep(9000);
        const k = world.transit.clocks.get(L.id);
        ok = !!k && k.rate < 0.1;
        why = `linha ${L.id}: relógio a ${k ? (k.rate * 100).toFixed(0) : '?'}% 9 s depois do corte no trilho`;
      }
    }
    report({ kind: 'vagao', ok, why });
  }

  // ── torre: a torre do elevador grande não se corta ──
  {
    let ok = false;
    let why = 'nenhuma passagem';
    if (ctx.ui.teleport('camada', 'camada')) {
      controls.setMode('walk');
      await sleep(SETTLE);
      let car = null;
      const here = g();
      for (const c of world.elevators.cars.values()) if (c.def.kind === 'grand' && (!car || Math.hypot(c.def.x - here.x, c.def.z - here.z) < Math.hypot(car.def.x - here.x, car.def.z - here.z))) car = c;
      if (car) {
        // de fora do quadro da torre, mirando um pilar de canto (a 27 m do centro)
        const pillar = new THREE.Vector3(car.def.x + 27, car.def.y1 + 20, car.def.z + 27);
        const from = pillar.clone().add(new THREE.Vector3(30, 0, 0));
        const dir = new THREE.Vector3(-1, 0, 0);
        const sc = from.clone().sub(world.origin);
        refreshCol(w.col, sc);
        const before = w.col.ray(sc, dir, 40)?.distance ?? null;
        await shoot(from, dir, 60, R);
        refreshCol(w.col, sc);
        const after = w.col.ray(sc, dir, 40)?.distance ?? null;
        ok = before !== null && after !== null && Math.abs(before - after) < 0.05;
        why = `pilar a ${before?.toFixed(2) ?? '-'} m antes · ${after?.toFixed(2) ?? '-'} m depois do tiro`;
      }
    }
    report({ kind: 'torre', ok, why });
  }

  // ── tempo: 10 tiros em lugares diferentes ──
  {
    const near = [];
    const all = [];
    const work = [];
    const tags = [];
    let n = 0;
    for (const place of ['colmeia', 'macico', 'deposito', 'maquinas', 'teia', 'estrato', 'galeria', 'silo', 'escadaria', 'trelica']) {
      if (!ctx.ui.teleport(place, place)) continue;
      controls.setMode('walk');
      await sleep(SETTLE);
      const d = new THREE.Vector3();
      camera.getWorldDirection(d);
      d.y = 0;
      d.normalize();
      const s = await shoot(g().addScaledVector(d, 0.6), d);
      if (!s.n) continue;
      n++;
      tags.push(`${place} ${s.n}ch (${s.firstE?.layer}: worker ${s.firstE?.worker.toFixed(0)} ms · CSG ${s.firstE?.csg.toFixed(0)} ms · ${s.firstE?.pieces} peças · lentas ${s.firstE?.slow})`);
      near.push(s.first);
      all.push(s.last);
      work.push(s.worker);
    }
    const p95 = (arr) => {
      const v = arr.slice().sort((x, y) => x - y);
      return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] : Infinity;
    };
    const pn = p95(near);
    const pa = p95(all);
    const pw = p95(work);
    report({ kind: 'tempo', ok: n >= 5 && pn <= 300 && pa <= 1500 && pw <= 800, why: `${n} tiros · furo perto p95 ${pn.toFixed(0)} ms (≤ 300) · tiro inteiro p95 ${pa.toFixed(0)} ms (≤ 1500) · worker por tiro p95 ${pw.toFixed(0)} ms (≤ 800) · ${near.map((x) => x.toFixed(0)).join('/')} · ${all.map((x) => x.toFixed(0)).join('/')} · pior: ${tags[near.indexOf(Math.max(...near))]}` });
  }

  // ── memoria: a memória das peças cortadas sobrevive a uma sessão nova (o worker de corte
  //    trocado por um novo — world/pieceStore.js): o próximo tiro ali só subtrai o novo ──
  {
    ctx.ui.teleport('deposito', 'deposito');
    controls.setMode('walk');
    await sleep(SETTLE);
    const d = new THREE.Vector3();
    camera.getWorldDirection(d);
    d.y = 0;
    d.normalize();
    const side = new THREE.Vector3(-d.z, 0, d.x);
    const base = g();
    const shots = [];
    for (let i = 0; i < 6; i++) shots.push(await shoot(base.clone().addScaledVector(side, (i - 2.5) * 1.2), d, 120, 0.8));
    await sleep(1500); // (a memória vai para o disco depois de cada resposta)
    world.pool.restartCutWorker();
    await sleep(800);
    const s = await shoot(base.clone().addScaledVector(side, 4.5), d, 120, 0.8);
    const fe = s.firstE;
    report({
      kind: 'memoria',
      ok: !!fe && fe.memo > 0,
      why: `6 tiros · worker trocado · o 7º: chunk perto ${fe ? `${fe.pieces} peças, ${fe.memo} da memória do disco, CSG ${fe.csg.toFixed(0)} ms, worker ${fe.worker.toFixed(0)} ms` : 'sem chunk refeito'} · antes da troca, o 6º: worker ${shots[5].firstE?.worker.toFixed(0) ?? '-'} ms`,
    });
  }

  // ── chão: a pé, o chão debaixo de quem atira fica (tiro horizontal e inclinado — a coluna
  //    protegida, app/beam.js keepUnder); só some mirando nele, quase reto para baixo ──
  {
    const sgWas = ctx.rules.safeguards;
    ctx.rules.safeguards = false;
    const w = controls.walker;
    const res = [];
    let ok = true;
    for (const [pitch, wantFloor] of [[0, true], [-0.5, true], [-0.8, true], [-1.5, false]]) {
      ctx.ui.teleport('deposito', 'deposito');
      controls.setMode('walk');
      await sleep(SETTLE);
      const y0 = w.feet.y;
      controls.pitch = pitch;
      await sleep(300);
      ctx.player.energy.value = 1;
      ctx.beam.fire(1);
      await sleep(2500);
      refreshCol(w.col, camera.position.clone());
      const eye = camera.position.clone();
      const hit = w.col.ray(eye, new THREE.Vector3(0, -1, 0), 2.6);
      const floor = !!hit && hit.distance < 2.2;
      const fell = w.feet.y < y0 - 0.5;
      const good = wantFloor ? floor && !fell : !floor || fell;
      ok &&= good;
      res.push(`${(-pitch * 57.3).toFixed(0)}° para baixo: ${floor ? `chão a ${hit.distance.toFixed(2)} m` : 'sem chão'}${fell ? ' · CAIU' : ''}${good ? '' : ' ✗'}`);
    }
    controls.pitch = 0;
    ctx.ui.teleport('deposito', 'deposito');
    await sleep(2000);
    ctx.rules.safeguards = sgWas;
    report({ kind: 'chao', ok, why: res.join(' · ') });
  }

  // ── coice: a mira sobe e assenta pela metade; o corpo é empurrado para trás — os dois
  //    crescem com a carga (app/beam.js recoil) ──
  {
    const sgWas = ctx.rules.safeguards;
    ctx.rules.safeguards = false;
    const w = controls.walker;
    const out = [];
    for (const [kk, oo] of [[0.2, 0], [1, 0], [1, 1]]) {
      ctx.ui.teleport('deposito', 'deposito');
      controls.setMode('walk');
      await sleep(SETTLE);
      // (de costas para o lado mais livre: o empurrão não bate numa parede logo atrás)
      refreshCol(w.col, camera.position.clone());
      let best = { yaw: controls.yaw, d: -1 };
      for (let q = 0; q < 16; q++) {
        const yaw = (q / 16) * Math.PI * 2;
        const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const h = w.col.ray(camera.position.clone(), back, 30);
        const d = h ? h.distance : 30;
        if (d > best.d) best = { yaw, d };
      }
      controls.yaw = best.yaw;
      controls.pitch = 0;
      await sleep(400);
      const p0 = w.feet.clone();
      ctx.player.energy.value = 1;
      ctx.beam.fire(kk, oo);
      let peak = 0;
      const t0 = performance.now();
      while (performance.now() - t0 < 1500) {
        peak = Math.max(peak, controls.pitch);
        await sleep(16);
      }
      const moved = Math.hypot(w.feet.x - p0.x, w.feet.z - p0.z);
      out.push({ kk, oo, peak, rest: controls.pitch, moved, room: best.d });
      for (let i = 0; i < 150 && ctx.wake?.active; i++) await sleep(200); // (um empurrão forte pode derrubar)
    }
    controls.pitch = 0;
    ctx.rules.safeguards = sgWas;
    const [lo, hi, over] = out;
    const ok = hi.peak > lo.peak * 2.5 && hi.moved > lo.moved * 3 && hi.moved > 1.5 && hi.rest > 0.2 * hi.peak && hi.rest < 0.7 * hi.peak && over.moved > hi.moved * 4;
    report({ kind: 'coice', ok, why: out.map((o) => `carga ${o.kk}${o.oo ? ' + sobrecarga ' + o.oo : ''}: mira +${(o.peak * 57.3).toFixed(1)}° (assentou em +${(o.rest * 57.3).toFixed(1)}°) · empurrado ${o.moved.toFixed(2)} m (livre atrás ${o.room.toFixed(0)} m)`).join(' · ') });
  }

  // ── teto: um chunk com 64 cortes faz o feixe engasgar na entrada dele (puro) ──
  {
    const mk = (n) => ({
      cuts: Array.from({ length: n }, (_, i) => ({ id: 'T' + i, a: [10, 20 + i * 2.5, 96], b: [180, 20 + i * 2.5, 96], r: 0.6 })), // (só dentro do chunk 0,0,0)
    });
    const a = new THREE.Vector3(-500, 96, 96);
    const dir = new THREE.Vector3(1, 0, 0);
    const j64 = jamAt(mk(64), a, dir, 1000);
    const j63 = jamAt(mk(63), a, dir, 1000);
    report({ kind: 'teto', ok: j64 >= 400 && j64 <= 500 && j63 === 1000, why: `64 cortes no chunk: o feixe para em ${j64.toFixed(0)} m (o chunk começa a 500 m) · 63: ${j63.toFixed(0)} m` });
  }

  // ── salvar: os cortes passam pelo salvamento (JSON, como storeSlot) e o mundo volta com eles —
  //    do cache, sem CSG (o que o jogo faz ao abrir um mundo salvo: app.js) ──
  {
    const saved = JSON.parse(JSON.stringify({ cuts: world.cuts }));
    const ids0 = world.cuts.map((c) => c.id).sort().join(',');
    const back = camera.position.clone().add(world.origin);
    const yaw = controls.yaw;
    const pitch = controls.pitch;
    world.cuts = saved.cuts.slice();
    world.build(ctx.seed);
    world.setView({ renderDistance: ctx.settings.renderDistance, fog: ctx.settings.fog });
    onWorldBuilt(ctx);
    controls.setMode('fly');
    controls.setView({ pos: back.clone().sub(world.origin), yaw, pitch, scale: 1 });
    await sleep(SETTLE + 5000);
    let cut = 0;
    let cached = 0;
    let jobs = 0;
    for (const L of [...world.layers, world.macroLayer]) {
      for (const e of L.chunks.values()) {
        if (!e.received || !L.cutsFor(e.cx, e.cy, e.cz).length) continue;
        cut++;
        if (e.fromCache) cached++;
        else if ((e.cutStats?.cut ?? 0) > 0) jobs++;
      }
    }
    const ids1 = world.cuts.map((c) => c.id).sort().join(',');
    report({
      kind: 'salvar',
      ok: ids0 === ids1 && world.field.cuts.length === world.cuts.length && cut > 0 && jobs === 0,
      why: `${world.cuts.length} cortes de volta (ids ${ids0 === ids1 ? 'iguais' : 'DIFERENTES'}) · ${cut} chunks com cortes em volta · ${cached} do cache · ${jobs} cortados de novo (CSG) · ${cut - cached - jobs} sem peça atingida`,
    });
  }
}

/** F2: a carga, o andar, os cancelamentos e o controle (app/beam.js). */
async function runF2(ctx, report) {
  const { world, controls } = ctx;
  const beam = ctx.beam;
  const player = ctx.player;
  const en = player.energy;
  const cutsN = () => world.cuts.length;
  // o gatilho segurado por s segundos (o teste segura por beam.testHeld)
  // (pelo tempo de carga do jogo, não pelo relógio: um quadro lento não rouba potência do teste)
  const hold = async (s) => {
    beam.testHeld = true;
    const t0 = performance.now();
    await sleep(Math.min(s, 0.15) * 1000);
    while ((beam.state === 'charging' ? beam.held : 0) < s - 0.02 && performance.now() - t0 < s * 3000 + 2000) {
      if (beam.state !== 'charging' && performance.now() - t0 > 400) break; // (bloqueado / cancelado)
      await sleep(10);
    }
    beam.testHeld = false;
    await sleep(120);
  };
  const rest = () => sleep(1000); // (o intervalo entre tiros é 0,8 s)
  // o que impediu ou cancelou uma carga (para o relatório)
  const events = [];
  world.bus.on('player:beamBlocked', (d) => events.push('bloq:' + d.why));
  world.bus.on('player:beamCancel', (d) => events.push('canc:' + d.why));
  // num lugar aberto, acordado (o começo da Peregrinação é um despertar)
  ctx.ui.teleport('teia', 'teia');
  controls.setMode('walk');
  await sleep(SETTLE);
  const t0 = performance.now();
  while (ctx.wake?.active && performance.now() - t0 < 30000) await sleep(200);
  console.warn(`BEAM F2: despertar ${ctx.wake?.active ? 'AINDA' : 'acabou'} · modo ${controls.mode}`);
  ctx.inventory.equip('emitter');
  // (sem Safeguards: os tiros chamam atenção, e uma captura no meio estraga as medidas)
  const sgWas = ctx.rules.safeguards;
  ctx.rules.safeguards = false;
  // mirando para cima e para fora (os tiros não precisam acertar nada)
  controls.pitch = 0.6;
  await sleep(300);

  // ── carga ──
  {
    en.value = 1;
    const why = [];
    let ok = true;
    const c0 = cutsN();
    const s0 = beam.lastShot;
    await hold(0.2);
    const none = beam.lastShot === s0 && cutsN() === c0 && en.value === 1;
    ok &&= none;
    why.push(`0,2 s: ${none ? 'sem tiro' : 'ATIROU'}`);
    await rest();
    await hold(1.0);
    const k1 = beam.lastShot?.k ?? -1;
    const want1 = chargeK(1.0);
    const g1 = Math.abs(k1 - want1) < 0.08 && Math.abs(1 - en.value - shotOf(k1).cost) < 0.002;
    ok &&= g1;
    why.push(`1 s: k ${k1.toFixed(2)} (curva ${want1.toFixed(2)}) gasto ${((1 - en.value) * 100).toFixed(1)}%`);
    await rest();
    en.value = 1;
    const ks = [];
    for (let i = 0; i < 5; i++) {
      await hold(2.7);
      ks.push(beam.lastShot?.k ?? -1);
      await rest();
    }
    const full = ks.every((k) => k > 0.999);
    const left = en.value;
    ok &&= full && Math.abs(left - 0.1) < 0.005;
    why.push(`5 cheios: k ${ks.map((k) => k.toFixed(2)).join('/')} · sobrou ${(left * 100).toFixed(1)}%`);
    await hold(2.7);
    const k6 = beam.lastShot?.k ?? -1;
    const g6 = Math.abs(k6 - (left - 0.03) / 0.15) < 0.02 && en.value < 0.002;
    ok &&= g6;
    why.push(`6º com ${(left * 100).toFixed(0)}%: k ${k6.toFixed(2)} · sobrou ${(en.value * 100).toFixed(1)}%`);
    en.value = 1; // (a célula a zero desmaia — app/wake.js)
    await rest();
    report({ kind: 'carga', ok, why: why.join(' · ') + (ok ? '' : ` · eventos ${events.join(',')}`) });
  }

  // ── andar: carregando, 60% e sem correr nem pular ──
  {
    en.value = 1;
    controls.pitch = 0;
    const w = controls.walker;
    const home = w.feet.clone();
    const speedOver = async (s, charging) => {
      beam.testHeld = charging;
      if (charging) await sleep(150); // (a carga começa antes do pulo apertado)
      controls.forceInput = { f: 1, r: 0, run: true, jump: !!charging };
      let vmax = 0;
      let dy = 0; // o impulso para cima (um pulo é ~5 m/s; degraus e rampas não chegam perto)
      const t0 = performance.now();
      while (performance.now() - t0 < s * 1000) {
        await sleep(50);
        vmax = Math.max(vmax, Math.hypot(w.vel.x, w.vel.z));
        dy = Math.max(dy, w.vel.y);
      }
      controls.forceInput = null;
      controls.placeFeet(home); // (de volta ao ponto de partida — correndo, cai-se da passarela)
      if (charging) {
        beam.cancel('teste');
        beam.testHeld = false;
      }
      await sleep(400);
      return { vmax, dy };
    };
    const ch = await speedOver(1.5, true);
    const run = await speedOver(0.8, false);
    const ok = ch.vmax <= 4.2 * 0.6 + 0.05 && ch.vmax > 1.5 && ch.dy < 2.5 && run.vmax > 6;
    report({ kind: 'andar', ok, why: `carregando ${ch.vmax.toFixed(2)} m/s (teto ${(4.2 * 0.6).toFixed(2)}) · impulso para cima ${ch.dy.toFixed(2)} m/s com pulo apertado · correndo sem carregar ${run.vmax.toFixed(2)} m/s` });
    await sleep(500);
  }

  // ── estados: cada cancelamento ──
  {
    controls.pitch = 0.6;
    /** @type {[string, () => any, (() => any)|null][]} */
    const causes = [
      ['correr (LT)', () => (controls.padCancel = true), null],
      ['Shift', () => document.dispatchEvent(new KeyboardEvent('keydown', { code: 'ShiftLeft' })), () => document.dispatchEvent(new KeyboardEvent('keyup', { code: 'ShiftLeft' }))],
      ['clique direito', () => document.dispatchEvent(new MouseEvent('mousedown', { button: 2 })), () => document.dispatchEvent(new MouseEvent('mouseup', { button: 2 }))],
      ['inventário', () => ctx.inventory.open(), () => ctx.inventory.close()],
      ['mão', () => ctx.inventory.unequip('emitter'), () => ctx.inventory.equip('emitter')],
      ['célula', () => (en.value = 0.01), () => (en.value = 1)], // (abaixo do mínimo de um tiro; a zero, desmaia)
    ];
    const res = [];
    let ok = true;
    for (const [name, doIt, undo] of causes) {
      en.value = 1;
      await sleep(900);
      const s0 = beam.lastShot;
      const c0 = cutsN();
      beam.testHeld = true;
      await sleep(700);
      const charging = beam.state === 'charging';
      doIt();
      await sleep(250);
      const locked = beam.state === 'locked';
      // segurando ainda: não volta a carregar sem soltar
      await sleep(600);
      const stays = beam.state === 'locked';
      beam.testHeld = false;
      await sleep(200);
      undo?.();
      const e1 = name === 'célula' ? 1 : en.value;
      const good = charging && locked && stays && beam.lastShot === s0 && cutsN() === c0 && Math.abs(e1 - 1) < 1e-6 && beam.state === 'idle';
      ok &&= good;
      res.push(`${name} ${good ? 'ok' : `FALHOU (carregava ${charging} · parou ${locked} · ficou ${stays} · tiro ${beam.lastShot !== s0} · estado ${beam.state})`}`);
    }
    await sleep(300);
    report({ kind: 'estados', ok, why: res.join(' · ') + (ok ? '' : ` · eventos ${events.slice(-12).join(',')}`) });
  }

  // ── controle: RT segurado atira, LT cancela (um controle falso) ──
  {
    en.value = 1;
    beam.testHeld = null; // (o gatilho de volta aos aparelhos de verdade)
    const real = navigator.getGamepads;
    const pad = { id: 'fake', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => /** @type {any} */ ([pad]);
    const set = (i, on) => (pad.buttons[i] = { pressed: on, value: on ? 1 : 0 });
    await sleep(300);
    const s0 = beam.lastShot;
    set(7, true);
    await sleep(600);
    const seen = `padFire ${controls.padFire} · estado ${beam.state} · uiActive ${bindings.uiActive} · mute ${controls.pad.mute} · ativo ${controls.pad.active} · eventos ${events.slice(-3).join(',')}`;
    await sleep(600);
    set(7, false);
    await sleep(300);
    const s1 = beam.lastShot;
    const shot = s1 !== s0 && Math.abs((s1?.k ?? 0) - chargeK(1.2)) < 0.12;
    await sleep(1000);
    set(7, true);
    await sleep(800);
    set(6, true);
    await sleep(200);
    const cancelled = beam.state === 'locked';
    set(6, false);
    set(7, false);
    await sleep(300);
    const noShot = beam.lastShot === s1;
    navigator.getGamepads = real;
    await sleep(300);
    report({ kind: 'controle', ok: shot && cancelled && noShot, why: `RT 1,2 s: ${shot ? `atirou (k ${s1?.k.toFixed(2)})` : `NÃO atirou (${seen})`} · RT + LT: ${cancelled && noShot ? 'cancelou sem tiro' : 'NÃO cancelou'}` });
  }
  // ── sobrecarga: segurar além do cheio (3 a 6,5 s) — estágios que se anunciam, o furo e o
  //    alcance crescendo, e sem perder a arma (o custo vai para a futura barra de vida) ──
  {
    en.value = 1;
    beam.testHeld = null;
    controls.pitch = 1.5; // (para cima: o empurrão não joga o corpo da passarela)
    await sleep(1000);
    const stages = [];
    const onStage = (d) => stages.push(d.stage);
    world.bus.on('player:beamStage', onStage);
    const s0 = beam.lastShot;
    await hold(6.55); // (logo depois do limite — 6,5 s; além disso começam os estágios 5–7)
    const S = beam.lastShot;
    const shot = S !== s0 && S.o > 0.99 && S.o < 1.05;
    const lim = shot && S.cost > 0.349 && S.cost < 0.36 && S.r > 7.6 && S.range > 999 && S.range < 1050 && !S.lost;
    const seq = stages.join(',') === '1,2,3,4';
    await rest();
    en.value = 1;
    const s1 = beam.lastShot;
    await hold(1.2);
    const again = beam.lastShot !== s1; // (sem braço destruído: atira de novo)
    controls.pitch = 0;
    await rest();
    report({
      kind: 'sobrecarga',
      ok: shot && lim && seq && again,
      why: `6,55 s: o ${S.o?.toFixed(2)} · gasto ${(S.cost * 100).toFixed(0)}% · raio ${S.r.toFixed(1)} m · alcance ${S.range.toFixed(0)} m · estágios anunciados ${stages.join(',') || 'nenhum'} · depois: ${again ? 'atira de novo' : 'NÃO atirou'}`,
    });
  }
  // ── além: os estágios 5–7 (até 11 s) — o furo e o alcance maiores ainda, e o braço que
  //    atira é perdido (o emissor volta ao inventário; o outro braço o pega) ──
  {
    en.value = 1;
    beam.testHeld = null;
    beam.restoreArms();
    ctx.inventory.unequip('emitter');
    ctx.inventory.equip('emitter');
    const side0 = ctx.inventory.sideOf('emitter');
    controls.pitch = 1.5;
    await sleep(1000);
    const stages = [];
    const onStage = (d) => stages.push(d.stage);
    world.bus.on('player:beamStage', onStage);
    const s0 = beam.lastShot;
    await hold(11.3);
    const S = beam.lastShot;
    const shot = S !== s0 && S.o > 1.97;
    const big = shot && S.r > 18 && Math.abs(S.range - 2000) < 1 && Math.abs(S.cost - 0.5) < 0.01;
    const armName = side0 === 1 ? 'right' : 'left';
    const lost = shot && S.lost === armName && player.arms[armName] === false && ctx.inventory.sideOf('emitter') === 0;
    await rest();
    // o outro braço pega o emissor (o primeiro aperto equipa)
    beam.testHeld = true;
    await sleep(300);
    beam.testHeld = false;
    await sleep(300);
    const other = ctx.inventory.sideOf('emitter') === -side0;
    // sem os dois: não agarra nem sobe escada
    player.arms.right = false;
    player.arms.left = false;
    await sleep(200);
    const noArms = controls.walker.canGrab === false && controls.walker.canClimb === false;
    beam.restoreArms();
    ctx.inventory.equip('emitter');
    controls.pitch = 0;
    await rest();
    report({
      kind: 'alem',
      ok: shot && big && stages.join(',') === '1,2,3,4,5,6,7' && lost && other && noArms,
      why: `11,3 s: o ${S.o?.toFixed(2)} · gasto ${(S.cost * 100).toFixed(0)}% · raio ${S.r.toFixed(1)} m · alcance ${S.range.toFixed(0)} m · estágios ${stages.join(',')} · braço ${S.lost ?? 'nenhum'} perdido${lost ? '' : ' ✗'} · o outro pegou o emissor: ${other ? 'sim' : 'NÃO'} · sem braços, agarrar/escada: ${noArms ? 'não' : 'AINDA'}`,
    });
  }
  en.value = 1;
  ctx.rules.safeguards = sgWas;
}
