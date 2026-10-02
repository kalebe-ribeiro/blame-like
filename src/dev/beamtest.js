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
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { beamReach } from '../gen/beamreach.js';
import { TRANSIT } from '../gen/field.js';

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
    const t0 = performance.now();
    for (const L of layers) {
      L.onRecut = () => {
        swapped++;
        const ms = performance.now() - t0;
        first ??= ms;
        last = ms;
      };
    }
    const counts = t > 0.5 ? world.addCut({ a: a.toArray(), b: b.toArray(), r }, a) : {};
    const n = Object.values(counts).reduce((s, v) => s + v, 0);
    const end = performance.now() + 15000;
    while (swapped < n && performance.now() < end) await sleep(20);
    for (const L of layers) L.onRecut = null;
    return { t, stop, n, swapped, first, last, a, b };
  };
  const refreshCol = (col, at) => {
    col._t = -1e9; // (a lista de malhas é reaproveitada por 300 ms: refazer agora)
    col.buildsPerFrame = 600;
    col.refresh(at, 40);
    col.buildsPerFrame = 2;
  };

  await sleep(SETTLE);

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
    // a parede do corte: de um ponto do eixo 0,5 m para dentro da parede, para cima e para os lados
    const inside = eye.clone().addScaledVector(wall.dir, wall.d + 0.5);
    const side = new THREE.Vector3(-wall.dir.z, 0, wall.dir.x);
    const walls = [new THREE.Vector3(0, 1, 0), side, side.clone().negate()].map((d) => w.col.ray(inside, d, R + 2)?.distance ?? null);
    const near = walls.filter((d) => d !== null && Math.abs(d - R) < 0.45).length;
    cutWall = { s, eye };
    report({ kind: 'furo', ok: s.swapped === s.n && s.n > 0 && through && near >= 2, why: `${wall.place}: parede a ${wall.d.toFixed(1)} m · ${s.swapped}/${s.n} chunks refeitos · raio depois ${after ? after.distance.toFixed(1) + ' m' : 'livre'} · parede do corte a ${walls.map((d) => (d === null ? '-' : d.toFixed(2))).join('/')} m (r ${R})` });
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
    ctx.ui.teleport('vazio', 'vazio');
    await sleep(SETTLE);
    console.warn(`BEAM longe: ${g().distanceTo(back).toFixed(0)} m`);
    controls.setMode('fly');
    controls.setView({ pos: back.clone().sub(world.origin), yaw: 0, pitch: 0, scale: 1 });
    await sleep(SETTLE + 3000);
    let cut = 0;
    let cached = 0;
    for (const L of layers) {
      for (const e of L.chunks.values()) {
        if (!L.cutsFor(e.cx, e.cy, e.cz).length || !e.received) continue;
        cut++;
        if (e.fromCache) cached++;
      }
    }
    report({ kind: 'recarregar', ok: cut > 0 && cached === cut, why: `${cut} chunks com cortes ao voltar · ${cached} lidos do cache` });
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
      near.push(s.first);
      all.push(s.last);
    }
    const p95 = (arr) => {
      const v = arr.slice().sort((x, y) => x - y);
      return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] : Infinity;
    };
    const pn = p95(near);
    const pa = p95(all);
    report({ kind: 'tempo', ok: n >= 5 && pn <= 300 && pa <= 1500, why: `${n} tiros · furo perto p95 ${pn.toFixed(0)} ms (≤ 300) · tiro inteiro p95 ${pa.toFixed(0)} ms (≤ 1500) · ${near.map((x) => x.toFixed(0)).join('/')} · ${all.map((x) => x.toFixed(0)).join('/')}` });
  }
}
