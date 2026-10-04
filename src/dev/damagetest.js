// ─────────────────────────────────────────────────────────────────────────────
//  O dano do emissor e a fuga (`check:beam`, `--beampart=dano` — o cofre, Dano-do-emissor e
//  Movimento-dos-inimigos). Corpos de teste parados num chão largo; o dano é lido logo depois do
//  disparo (o furo leva o chão debaixo deles nos quadros seguintes — a queda não entra na conta):
//
//    dano:baixo    um tiro médio-fraco (0,7 s) mata o Safeguard baixo
//    dano:medio    o médio sobrevive a 2 médio-fracos e morre no 3º
//    dano:alto     o alto sobrevive ao cheio (sobra ~75%)
//    dano:colapso  o colapso de raspão mata o alto
//    dano:raspao   de raspão, metade (um corpo de resistência 1, tiro cheio: sobra 50%)
//    dano:silicio  a vida de silício baixa: o médio-fraco não mata, o segundo mata
//    fuga          um Safeguard baixo caçando a 13 m: andando para trás, dá para carregar um
//                  cheio e atirar antes do golpe (e ele morre); o médio chega em ~2–3 s (o cheio no limite)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { chargeK, shotOf } from '../app/beam.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DOWN = new THREE.Vector3(0, -1, 0);

export async function runDamage(ctx, report) {
  const { world, camera, controls } = ctx;
  const w = controls.walker;
  const sg = world.safeguards;
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < s * 1000) await sleep(50);
    return cond();
  };
  // ninguém percebe o jogador enquanto o teste prepara (uma captura no meio estragaria tudo)
  const senses0 = sg.senses;
  sg.senses = () => null;
  await waitFor(() => !ctx.wake.active, 90);
  const dirOf = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  const floorBelow = (x, y, z, far = 3) => {
    const h = w.col.ray(new THREE.Vector3(x, y, z), DOWN, far);
    return h && h.face && h.face.normal.y > 0.55 ? h.point.y : null;
  };

  // um chão largo e plano, sem paredes até 14 m
  let spot = null;
  const tried = [];
  for (const place of ['camada', 'galeria', 'estrato', 'teia', 'maquinas']) {
    if (!ctx.ui.teleport(place, place)) continue;
    controls.setMode('walk');
    await sleep(7000);
    await waitFor(() => w.grounded, 5);
    w.col._t = -1e9;
    w.col.buildsPerFrame = 600;
    w.col.refresh(camera.position.clone(), 70);
    w.col.buildsPerFrame = 2;
    const feet = w.feet.clone();
    const why = { floor: 0, flat: 0, wall: 0 };
    tried.push({ place, grounded: w.grounded, mode: controls.mode, why });
    for (let i = 0; i < 90 && !spot; i++) {
      const p = feet.clone().addScaledVector(dirOf(i * 2.4), (i % 9) * 5);
      const y = floorBelow(p.x, feet.y + 1, p.z);
      if (y === null) {
        why.floor++;
        continue;
      }
      const c = new THREE.Vector3(p.x, y, p.z);
      let ok = true;
      for (let q = 0; q < 12 && ok; q++) {
        const d = dirOf((q / 12) * Math.PI * 2);
        for (const r of [4, 8, 11, 14]) {
          const fy = floorBelow(c.x + d.x * r, y + 1, c.z + d.z * r, 2);
          if (ok && (fy === null || Math.abs(fy - y) > 0.4)) {
            ok = false;
            why.flat++;
          }
        }
        for (const hh of [1.0, 1.6]) if (ok && w.col.ray(c.clone().setY(y + hh), d, 14)) {
          ok = false;
          why.wall++;
        }
      }
      if (ok) spot = { place, c };
    }
    if (spot) break;
  }
  if (!spot) {
    report({ kind: 'dano', ok: false, why: 'nenhum chão largo: ' + tried.map((t) => `${t.place} (${t.mode}, chão ${t.grounded}) sem chão ${t.why.floor} · desnível ${t.why.flat} · parede ${t.why.wall}`).join(' | ') });
    return;
  }
  const home = () => controls.placeFeet(spot.c);
  home();
  await sleep(800);

  // (a fuga antes dos tiros de dano: as valas deles ficariam no caminho do Safeguard)
  // ── fuga ──
  const chase = async (level, back, charge = true) => {
    // a ronda mais perto, trazida para 13 m à frente, caçando
    await waitFor(() => !ctx.wake.active, 90);
    controls.setMode('walk'); // (o caso 'salvar' do check:beam deixa voando — voando não há golpe)
    home();
    await sleep(600);
    await waitFor(() => sg.byTerritory.size > 0, 20); // (as rondas voltam quando os Safeguards religam)
    const g = world.toGlobal(camera.position.clone());
    let x = null;
    for (const e of sg.byTerritory.values()) if (!x || e.feet.distanceTo(g) < x.feet.distanceTo(g)) x = e;
    if (!x) return null;
    for (const e of sg.all()) if (e !== x && e.sg.state !== 'patrol') sg._lose(e);
    const yaw = 0.3;
    const p = world.toGlobal(spot.c.clone().addScaledVector(dirOf(yaw), 13));
    x.feet.copy(p);
    world.entities.toNear(x, world.origin);
    x.walker.vel.set(0, 0, 0);
    x.level = level;
    x.yaw = yaw;
    controls.yaw = Math.atan2(-(p.x - g.x), -(p.z - g.z));
    controls.pitch = -0.05;
    sg.senses = senses0;
    Object.assign(x.sg, { state: 'hunt', sees: true, unseen: 0, lastSeen: g.clone().setY(g.y - 1.7), prey: null, bestD: Infinity, stuckT: 0, waitT: 0, huntV: undefined });
    ctx.player.energy.value = 1; // (os tiros de antes gastaram a célula)
    ctx.health.set(1); // (a vida pode vir baixa dos casos de antes: o golpe zeraria)
    const zeros = [];
    const offZ = world.bus.on('player:zero', (ev) => zeros.push(ev.source));
    const catches = [];
    const onCatch0 = sg.onCatch;
    sg.onCatch = (e) => {
      catches.push(`toque de ${e === x ? 'o do teste' : 'outro'} (${e.level}, ${e.sg.state}) · modo ${controls.mode} · vida ligada ${ctx.health.enabled} · rules ${ctx.rules.health} · strikes() ${sg.strikes?.()}`);
      return onCatch0?.(e);
    };
    const wakes = [];
    const wakeStart = ctx.wake.start;
    ctx.wake.start = (cause, taker, opts) => {
      wakes.push(`${cause}/${taker ?? '-'}`);
      return wakeStart(cause, taker, opts);
    };
    const blocks = [];
    const offB = world.bus.on('player:beamBlocked', (ev) => blocks.length < 6 && blocks.push(ev.why));
    const st0 = sg.stats.strikes;
    const shot0 = ctx.beam.lastShot;
    const t0 = performance.now();
    ctx.beam.testHeld = charge;
    let holding = charge;
    if (back) controls.forceInput = { f: -1 };
    let tStrike = null;
    let tShot = null;
    await waitFor(() => {
      // mira nele (o peito)
      const c = x.feet.clone().sub(world.origin);
      c.y += 1.1;
      const d = c.sub(camera.position);
      controls.yaw = Math.atan2(-d.x, -d.z);
      controls.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
      if (tStrike === null && sg.stats.strikes > st0) tStrike = (performance.now() - t0) / 1000;
      if (holding && ctx.beam.held >= 2.55) {
        holding = false;
        ctx.beam.testHeld = false; // solta: o tiro cheio
      }
      if (tShot === null && ctx.beam.lastShot !== shot0) tShot = (performance.now() - t0) / 1000;
      return tShot !== null || tStrike !== null;
    }, 8);
    ctx.beam.testHeld = null;
    controls.forceInput = null;
    const res = { tStrike, tShot, k: ctx.beam.lastShot !== shot0 ? ctx.beam.lastShot.k : null, dead: x.dead, hp: x.hp, diag: `arma ${ctx.beam.state} (bloqueios ${blocks.join(',') || '—'}) · ele ${x.sg.state} ${x.tier} a ${x.feet.distanceTo(world.toGlobal(camera.position.clone()).setY(camera.position.y + world.origin.y - 1.7)).toFixed(1)} m · ${controls.mode} · desmaio ${ctx.wake.active}${zeros.length ? ` (zerou por ${zeros.join(',')})` : ''}${wakes.length ? ` [desmaio: ${wakes.join(',')}]` : ''}${catches.length ? ` {${catches.join(' | ')}}` : ''} · sg ligados ${sg.enabled}` };
    offB?.();
    offZ?.();
    ctx.wake.start = wakeStart;
    sg.onCatch = onCatch0;
    sg.senses = () => null;
    if (!x.dead) sg._lose(x);
    return res;
  };
  // (a fuga é contra o golpe: a vida ligada, só aqui — o resto do check:beam a desliga)
  const rules0 = ctx.rules;
  ctx.rules = { ...rules0, health: true, safeguards: true };
  ctx.beam.restoreArms(); // (o caso 'alem' do check:beam leva um braço)
  ctx.inventory.equip('emitter');
  await sleep(300);
  sg.senses = () => null;
  // o médio (sem carregar, você parado): quanto leva para chegar e golpear — o cheio (2,5 s) fica no limite
  // (antes do baixo: o tiro dele abre uma vala no chão entre os dois)
  const mid = await chase('mid', false, false);
  report({ kind: 'fuga:medio', ok: !!mid && mid.tStrike !== null && mid.tStrike < 3.2, why: mid ? `médio a 13 m, você parado: ${mid.tStrike !== null ? `golpe aos ${mid.tStrike.toFixed(2)} s (o cheio leva 2,5 s + soltar)` : `não chegou em 8 s · ${mid.diag}`}` : 'sem ronda' });
  const lo = await chase('low', true);
  report({ kind: 'fuga', ok: !!lo && lo.tShot !== null && lo.tStrike === null && lo.k > 0.99 && lo.dead, why: lo ? `baixo, andando para trás: ${lo.tShot !== null ? `atirou um cheio (k ${lo.k?.toFixed(2)}) aos ${lo.tShot.toFixed(2)} s · ${lo.dead ? 'morreu' : `sobrou ${(lo.hp * 100).toFixed(0)}%`}` : `golpeado aos ${lo.tStrike?.toFixed(2)} s`} · ${lo.diag}` : 'sem ronda' });
  sg.senses = senses0;
  ctx.rules = rules0;
  ctx.health.set(1);

  let n = 0;
  /** Um corpo de teste parado a D m na direção yaw (de frente para o jogador). */
  const body = (kind, level, yaw = 0, D = 8) => {
    const p = world.toGlobal(spot.c.clone().addScaledVector(dirOf(yaw), D));
    const e = world.entities.spawn({ id: `t:dano:${n++}`, kind, feet: p, yaw: yaw, persist: false });
    e.level = level;
    return e;
  };
  /** Atira em e: k (carga), o (sobrecarga), side (m de lado do peito: o raspão). → hp depois. */
  const shoot = (e, k, o = 0, side = 0) => {
    home();
    camera.position.copy(spot.c).y += 1.7;
    const chest = e.feet.clone().sub(world.origin);
    chest.y += 1.1;
    const toward = chest.clone().sub(camera.position).setY(0).normalize();
    const lat = new THREE.Vector3(-toward.z, 0, toward.x);
    camera.lookAt(chest.clone().addScaledVector(lat, side));
    camera.updateMatrixWorld();
    ctx.beam.fire(k, o);
    return e.dead ? 0 : e.hp;
  };
  const k07 = chargeK(0.7);
  const rFull = shotOf(1).r;
  const clean = () => {
    for (const id of [...world.entities.list.keys()]) if (id.startsWith('t:dano:')) world.entities.remove(id);
  };

  {
    const e = body('safeguard', 'low', 0);
    const hp = shoot(e, k07);
    report({ kind: 'dano:baixo', ok: e.dead, why: `médio-fraco (0,7 s, D ${shotOf(k07).dmg.toFixed(2)}): ${e.dead ? 'morreu' : `sobrou ${(hp * 100).toFixed(0)}%`}` });
  }
  {
    const e = body('safeguard', 'mid', 1);
    const hs = [shoot(e, k07), shoot(e, k07), shoot(e, k07)];
    report({ kind: 'dano:medio', ok: hs[0] > 0 && hs[1] > 0 && e.dead, why: `3 médio-fracos: ${hs.map((h) => `${(h * 100).toFixed(0)}%`).join(' → ')}` });
  }
  {
    const e = body('safeguard', 'high', 2);
    const hp = shoot(e, 1);
    report({ kind: 'dano:alto', ok: !e.dead && Math.abs(hp - 0.75) < 0.01, why: `cheio: sobrou ${(hp * 100).toFixed(0)}%` });
  }
  {
    const e = body('safeguard', 'high', 3, 12);
    const rc = shotOf(1, 2).r;
    shoot(e, 1, 2, rc + 0.2);
    report({ kind: 'dano:colapso', ok: e.dead && ctx.beam.lastShot?.kills >= 1, why: `colapso de raspão (eixo a ${(rc + 0.2).toFixed(1)} m do peito, r ${rc.toFixed(1)}): ${e.dead ? 'morreu' : `sobrou ${(e.hp * 100).toFixed(0)}%`}` });
    ctx.beam.restoreArms();
  }
  {
    const e = body('test', null, 4);
    const hp = shoot(e, 1, 0, rFull + 0.2);
    report({ kind: 'dano:raspao', ok: !e.dead && Math.abs(hp - 0.5) < 0.01, why: `cheio de raspão num corpo de resistência 1: sobrou ${(hp * 100).toFixed(0)}%` });
  }
  {
    const e = body('silicon', 'low', 5);
    const h1 = shoot(e, k07);
    shoot(e, k07);
    report({ kind: 'dano:silicio', ok: h1 > 0 && e.dead, why: `baixa, médio-fraco: ${(h1 * 100).toFixed(0)}% → ${e.dead ? 'morreu no 2º' : 'viva'}` });
  }
  clean();
  await sleep(1500);

}
