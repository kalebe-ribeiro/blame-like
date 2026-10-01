// ─────────────────────────────────────────────────────────────────────────────
//  Teste do emissor de feixe — a arma de Killy (`npm run check:beam`).
//
//    camada   o feixe acaba ao chegar numa camada intransponível (beamReach)
//    unica    o feixe acaba numa estrutura única
//    buraco   um tiro numa parede deixa um buraco: o raio da colisão passa por
//             ele e o corpo do jogador, andando para a frente, atravessa
//    morte    um ser no caminho do feixe morre
//    tiros    na potência máxima, uma célula cheia dá 5 tiros (e não 6)
//    potencia cada potência: mais alcance, mais raio, mais gasto
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { POWER, beamReach } from '../app/beam.js';

const SETTLE = 7000;
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
  const look = (feet, yaw, pitch = 0) => controls.setView({ pos: feet.clone().setY(feet.y + 1.7), yaw, pitch, scale: 1 });

  // ── potência: tudo cresce junto
  let mono = true;
  for (let i = 1; i < POWER.length; i++) for (const k of ['range', 'r', 'cost']) if (!(POWER[i][k] > POWER[i - 1][k])) mono = false;
  report({ kind: 'potencia', ok: mono && POWER.length === 5, why: POWER.map((p, i) => `${i + 1}: ${p.range} m · r ${p.r} · ${Math.round(p.cost * 100)}%`).join(' | ') });

  // ── camada: de cima de uma laje, atirando para baixo
  {
    let res = null;
    for (const b of F.barriersNear(0)) {
      for (let i = 0; i < 400 && !res; i++) {
        const x = (i % 20) * 37 + 11;
        const z = Math.floor(i / 20) * 41 + 7;
        if (!F.barrierSolid(b, x, z)) continue;
        const a = new THREE.Vector3(x, b.top + 50, z);
        res = beamReach(F, a, new THREE.Vector3(0, -1, 0), 400);
      }
      if (res) break;
    }
    // rente à camada: um feixe largo (potência 5) a 1,7 m do piso dela não abre o piso
    if (res) {
      const b = F.barriersNear(0).find((bb) => F.barrierSolid(bb, 11, 7)) ?? F.barriersNear(0)[0];
      const H = world.holes;
      const keepList = H.list;
      H.list = [];
      const p0 = new THREE.Vector3(11, b.top + 1.7, 7);
      H.add(p0, p0.clone().add(new THREE.Vector3(100, 0, 0)), POWER[4].r);
      H.update(p0, world.origin, F);
      const floor = new THREE.Vector3(40, b.top - 0.05, 7).sub(world.origin);
      const air = new THREE.Vector3(40, b.top + 0.5, 7).sub(world.origin);
      const okFloor = !H.insideScene(floor, world.origin) && H.insideScene(air, world.origin);
      H.list = keepList;
      H._keepAt = null;
      report({ kind: 'rente', ok: okFloor, why: `piso da camada ${H.insideScene(floor, world.origin) ? 'FURADO' : 'inteiro'} · ar acima ${okFloor ? 'furado' : '?'}` });
    }
    report({ kind: 'camada', ok: !!res && res.stop === 'layer' && Math.abs(res.t - 50) < 0.01, why: res ? `parou em ${res.t.toFixed(2)} m (${res.stop}) — a laje a 50 m` : 'nenhuma laje achada' });
  }

  // ── única: atirando de lado em uma estrutura única, de 200 m
  {
    let u = null;
    for (const b of F.barriersNear(0)) {
      for (let i = -6; i <= 6 && !u; i++) for (let k = -6; k <= 6 && !u; k++) u = F.uniqueSite(b.n, i, k);
      if (u) break;
    }
    if (!u) report({ kind: 'unica', ok: false, why: 'nenhuma estrutura única achada' });
    else {
      const a = new THREE.Vector3(u.x - 200, u.y + 10, u.z);
      const r = beamReach(F, a, new THREE.Vector3(1, 0, 0), 400);
      const expect = 200 - u.hx - 1;
      // de dentro dela (dá para entrar): o feixe acaba na parede, não sai
      const r2 = beamReach(F, new THREE.Vector3(u.x, u.y + 1.7, u.z), new THREE.Vector3(1, 0, 0), 400);
      report({ kind: 'unica-dentro', ok: r2.stop === 'unique' && Math.abs(r2.t - (u.hx - 3.2)) < 0.01, why: `parou em ${r2.t.toFixed(1)} m (${r2.stop}) — a face de dentro da parede a ${(u.hx - 3.2).toFixed(1)} m` });
      report({ kind: 'unica', ok: r.stop === 'unique' && Math.abs(r.t - expect) < 0.01, why: `${u.kind}: parou em ${r.t.toFixed(1)} m (${r.stop}) — a caixa a ${expect.toFixed(1)} m` });
    }
  }

  await sleep(SETTLE);

  // ── buraco: uma parede na frente, um tiro, e anda-se através dela
  {
    const w = controls.walker;
    const col = w.col;
    let hit = null;
    for (const place of ['colmeia', 'macico', 'deposito', 'maquinas']) {
      if (!ctx.ui.teleport(place, place)) continue;
      controls.setMode('walk');
      await sleep(SETTLE);
      col.buildsPerFrame = 600;
      col.refresh(camera.position.clone(), 30);
      col.buildsPerFrame = 2;
      const feet = w.feet.clone();
      for (let q = 0; q < 16 && !hit; q++) {
        const yaw = (q / 16) * Math.PI * 2;
        const dir = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
        const h = col.ray(feet.clone().setY(feet.y + 1.7), dir, 10);
        // uma parede de verdade (de pé), a uns metros
        if (h && h.distance > 2 && h.face && Math.abs(h.face.normal.y) < 0.3) hit = { feet, yaw, dir, d: h.distance };
      }
      if (hit) break;
    }
    if (!hit) report({ kind: 'buraco', ok: false, why: 'nenhuma parede achada' });
    else {
      look(hit.feet, hit.yaw);
      await sleep(400);
      ctx.beam.setPower(5);
      ctx.beam.fire(); // (o primeiro aperto põe o emissor na mão)
      await sleep(300);
      const fired = ctx.beam.fire();
      await sleep(300);
      const eye = hit.feet.clone().setY(hit.feet.y + 1.7);
      const after = col.ray(eye, hit.dir, 30);
      const through = !after || after.distance > hit.d + 1;
      // anda para a frente: o corpo passa pelo plano da parede
      look(hit.feet, hit.yaw);
      await sleep(200);
      controls.forceInput = { f: 1, r: 0, jump: false };
      const t0 = performance.now();
      let went = 0;
      while (performance.now() - t0 < 5000) {
        went = Math.max(went, w.feet.clone().sub(hit.feet).dot(hit.dir));
        if (went > hit.d + 1) break;
        await sleep(100);
      }
      controls.forceInput = null;
      report({ kind: 'buraco', ok: fired && through && went > hit.d + 1, why: `parede a ${hit.d.toFixed(1)} m · tiro ${fired} · raio depois ${after ? after.distance.toFixed(1) + ' m' : 'livre'} · andou ${went.toFixed(1)} m` });
    }
  }

  // ── morte: o ser mais perto, na mira
  {
    ctx.ui.teleport('vila', 'vila');
    controls.setMode('walk');
    await sleep(SETTLE);
    const g = world.toGlobal(camera.position, new THREE.Vector3());
    let e = null;
    let best = 150;
    for (const x of world.entities.list.values()) {
      if (x.dead) continue;
      const d = x.feet.distanceTo(g);
      if (d < best && d > 3) {
        best = d;
        e = x;
      }
    }
    if (!e) report({ kind: 'morte', ok: false, why: 'nenhum ser perto' });
    else {
      const aim = () => {
        const eye = world.toGlobal(camera.position, new THREE.Vector3());
        const v = e.feet.clone().setY(e.feet.y + 1.1).sub(eye);
        controls.setView({ pos: camera.position.clone(), yaw: Math.atan2(-v.x, -v.z), pitch: Math.asin(v.y / v.length()), scale: 1 });
      };
      ctx.beam.setPower(5);
      aim();
      await sleep(1000);
      aim();
      await sleep(100);
      let shot = null;
      const died = [];
      world.bus.on('player:beam', (ev) => (shot = ev));
      world.bus.on('being:die', (ev) => died.push(ev.id));
      const fired = ctx.beam.fire();
      await sleep(200);
      const still = world.entities.list.get?.(e.id);
      report({ kind: 'morte', ok: fired && !!e.dead, why: `${e.kind} a ${best.toFixed(1)} m · tiro ${fired} · feixe ${shot ? shot.length.toFixed(1) + ' m ' + shot.stop : '-'} · ${e.dead ? 'morreu' : 'vivo'} · mortes ${died.join(',')} · mesmo objeto ${still === e}` });
    }
  }

  // ── tiros: célula cheia, potência máxima
  if (ctx.rules.resources) {
    ctx.beam.setPower(5);
    ctx.player.energy.value = 1;
    let n = 0;
    for (let i = 0; i < 8; i++) {
      await sleep(1000);
      if (ctx.beam.fire()) n++;
      else break;
    }
    report({ kind: 'tiros', ok: n === 5, why: `${n} tiros na potência 5 · sobrou ${Math.round(ctx.player.energy.value * 100)}%` });
  }
}
