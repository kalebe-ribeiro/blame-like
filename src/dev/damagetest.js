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
//    construtor    um canteiro dos Construtores: a perna do pórtico é sólida para o corpo; um corte num
//                  bloco o tira; um corte na perna derruba o canteiro (vira cemitério)
//    cadaver       um corpo morto no chão: o corte leva o piso debaixo dele — ele cai
//    fuga          um Safeguard baixo caçando a 13 m: andando para trás, dá para carregar um
//                  cheio e atirar antes do golpe (e ele morre); o médio chega em ~2–3 s (o cheio no limite)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { chargeK, shotOf } from '../app/beam.js';
import { BUILDER } from '../world/builders.js';
import { COLOSSUS } from '../gen/field.js';
import { beamReach } from '../gen/beamreach.js';
import { components } from '../gen/cut.js';

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
  // ronda:corte — um corte no circuito de um Safeguard de ronda à vista: ele não some (sai depois,
  // longe); morto por um tiro sobre o próprio circuito, o corpo fica onde caiu
  {
    let ok = false;
    let why = 'sem ronda perto';
    await waitFor(() => [...sg.byTerritory.values()].some((e) => !e.dead && e.sg.state === 'patrol'), 20);
    const g = world.toGlobal(camera.position.clone());
    const x = [...sg.byTerritory.values()].filter((e) => !e.dead && e.sg.state === 'patrol').sort((a, b) => a.feet.distanceTo(g) - b.feet.distanceTo(g))[0];
    if (x) {
      // a câmera vai para perto dele (à vista: a 40 m), voando — ninguém percebe
      controls.canFly = true;
      controls.setMode('fly');
      controls.setView({ pos: x.feet.clone().add(new THREE.Vector3(30, 12, 20)).sub(world.origin), yaw: 0, pitch: -0.2, scale: 1 });
      await sleep(1500);
      g.copy(world.toGlobal(camera.position.clone()));
      const chest = () => x.feet.clone().add(new THREE.Vector3(0, 1.1, 0));
      const shotAt = () => {
        const c = chest();
        const d = c.clone().sub(g).setY(0).normalize();
        world.addCut({ a: c.clone().addScaledVector(d, -6).toArray(), b: c.clone().addScaledVector(d, 4).toArray(), r: 2.2 }, c, { now: true });
      };
      const pathCut0 = world.field.cutOnPath(x.sg.c.pts);
      // 1) só o circuito cortado (ele vivo, à vista)
      shotAt();
      await sleep(800);
      const cutNow = world.field.cutOnPath(x.sg.c.pts);
      const stays = world.entities.list.has(x.id) && !!x.sg.stale;
      // 2) morto por um tiro sobre o circuito
      world.entities.kill(x, 'beam');
      shotAt();
      await sleep(800);
      const corpse = world.entities.list.has(x.id) && x.dead;
      ok = cutNow && stays && corpse;
      why = `a ${x.feet.distanceTo(g).toFixed(0)} m · circuito cortado ${cutNow} (antes ${pathCut0}) · vivo: ${stays ? 'ficou (sai quando longe)' : 'SUMIU'} · morto: ${corpse ? 'o corpo ficou' : 'o corpo SUMIU'}`;
    }
    report({ kind: 'ronda:corte', ok, why });
    // (de volta ao lugar dos casos de dano)
    controls.setMode('walk');
    home();
    await sleep(800);
  }
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


  // ── cadaver: o piso some debaixo de um corpo morto ──
  {
    // num piso que o emissor corta (não a laje de uma camada — intransponível por decisão)
    let p = null;
    for (const place of ['teia', 'trelica', 'escadaria', 'maquinas']) {
      if (!ctx.ui.teleport(place, place)) continue;
      controls.setMode('walk');
      await sleep(7000);
      await waitFor(() => w.grounded, 5);
      const mat = w.groundObj?.userData.mat;
      if (w.grounded && !['barrier', 'beam', 'colossusBeam'].includes(mat)) {
        p = world.toGlobal(w.feet.clone());
        break;
      }
    }
    if (!p) p = world.toGlobal(spot.c.clone());
    // o jogador sai de cima (o corte não leva o chão debaixo dele) e o corpo fica onde ele estava
    controls.placeFeet(new THREE.Vector3(p.x, p.y, p.z).sub(world.origin).add(new THREE.Vector3(0, 0, 0)));
    const e = world.entities.spawn({ id: 't:dano:corpo', kind: 'test', feet: p, persist: false });
    controls.setMode('fly');
    controls.setView({ pos: new THREE.Vector3(p.x + 6, p.y + 4, p.z).sub(world.origin), yaw: Math.PI / 2, pitch: -0.4, scale: 1 });
    await sleep(1500);
    const y0 = e.feet.y;
    world.entities.kill(e, 'beam');
    await sleep(800);
    world.addCut({ a: [e.feet.x, e.feet.y + 0.6, e.feet.z], b: [e.feet.x, e.feet.y - 12, e.feet.z], r: 2.2 }, new THREE.Vector3(e.feet.x, e.feet.y + 0.6, e.feet.z), { now: true });
    await waitFor(() => e.feet.y < y0 - 2, 8);
    // (diagnóstico: o piso ainda está lá, na colisão do próprio corpo?)
    const ec = e.walker.col;
    const o = new THREE.Vector3(e.feet.x, e.feet.y + 0.6, e.feet.z).sub(world.origin);
    ec._t = -1e9;
    ec.refresh(o, 12);
    const fh = ec.ray(o, new THREE.Vector3(0, -1, 0), 20);
    report({ kind: 'cadaver', ok: e.feet.y < y0 - 2, why: `o corpo desceu ${(y0 - e.feet.y).toFixed(1)} m depois do corte no piso · chão abaixo dele ${fh ? `a ${fh.distance.toFixed(1)} m (${fh.object.userData.mat ?? '?'})` : 'nenhum'} · col pronta ${ec.ready} · tier ${e.tier} · fallV ${e.fallV}` });
    world.entities.remove(e.id);
  }

  // ── as estruturas ativas (world/dynamic.js): cortes de verdade, o essencial, a resistência ──
  /** Um corte (raio r) que atravessa o objeto root no ponto local p, na direção local dir. */
  const cutAt = (root, p, dir, r = 2.8, half = 14) => {
    root.updateMatrixWorld(true);
    const c = new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(root.matrixWorld).add(world.origin);
    const dw = new THREE.Vector3(dir.x, dir.y, dir.z).transformDirection(root.matrixWorld);
    const a = c.clone().addScaledVector(dw, -half);
    const b = c.clone().addScaledVector(dw, half);
    world.addCut({ a: a.toArray(), b: b.toArray(), r }, a, { now: true });
  };
  const capsOf = (mesh) => mesh.children.filter((m) => m.userData.cutCaps).length;
  /** Peças cortadas SEM faces (o furo oco, o vazio de dentro à mostra) — tem de ser 0. */
  const hollow = (id) => [...(world.dyn.objs.get(id)?.cut?.values() ?? [])].reduce((n, st) => n + st.pieces.filter((pc) => pc.cut && pc.kept && !pc.caps).length, 0);
  const dyn = world.dyn;

  // construtor: a obra e os trilhos cortados como a Cidade; o pórtico ativo
  {
    let ok = false;
    let why = 'nenhum canteiro';
    const B = world.builders;
    const here = () => world.toGlobal(camera.position.clone());
    if (ctx.ui.teleport('construtores', 'construtores')) {
      controls.setMode('walk');
      await sleep(7000);
      await waitFor(() => [...B.sites.values()].filter((s) => !s.dead).length > 0, 15);
      const live = [...B.sites.values()].filter((s) => !s.dead).sort((a, b) => Math.hypot(a.def.x - here().x, a.def.z - here().z) - Math.hypot(b.def.x - here().x, b.def.z - here().z));
      const site = live[0];
      if (site) {
        const d = site.def;
        const across = d.axis === 'x' ? 'x' : 'z';
        const gpos = site.gx ?? 0;
        const leg = across === 'x' ? new THREE.Vector3(d.x + BUILDER.SPAN / 2, d.y + 20, d.z + gpos) : new THREE.Vector3(d.x + gpos, d.y + 20, d.z + BUILDER.SPAN / 2);
        // sólido
        const col = w.col;
        const from = leg.clone().add(across === 'x' ? new THREE.Vector3(8, 0, 0) : new THREE.Vector3(0, 0, 8)).sub(world.origin);
        col._t = -1e9;
        col.buildsPerFrame = 600;
        col.refresh(from, 30);
        col.buildsPerFrame = 2;
        const hitLeg = col.ray(from, across === 'x' ? new THREE.Vector3(-1, 0, 0) : new THREE.Vector3(0, 0, -1), 12);
        const solid = !!hitLeg && hitLeg.distance < 7;
        // um bloco: o furo (faces em brasa), o bloco continua lá
        const n0 = site.built.length;
        const bp = B._cellPos(site, site.built[0]).add(new THREE.Vector3(d.x, d.y, d.z));
        world.addCut({ a: [bp.x - 10, bp.y, bp.z - 10], b: [bp.x + 10, bp.y, bp.z + 10], r: 2.5 }, bp, { now: true });
        await waitFor(() => !!site.builtCaps, 4);
        const blockCut = !!site.builtCaps && site.built.length === n0;
        // um trilho
        const rp = across === 'x' ? new THREE.Vector3(d.x + BUILDER.SPAN / 2, d.y + 0.5, d.z + 20) : new THREE.Vector3(d.x + 20, d.y + 0.5, d.z + BUILDER.SPAN / 2);
        world.addCut({ a: [rp.x, rp.y + 8, rp.z], b: [rp.x, rp.y - 3, rp.z], r: 2 }, rp, { now: true });
        await waitFor(() => !!site.railCaps, 4);
        const railCut = !!site.railCaps;
        // o pórtico: a perna no meio (não essencial) — continua; a resistência cai
        const lp = across === 'x' ? { x: BUILDER.SPAN / 2, y: 20, z: 0 } : { x: 0, y: 20, z: BUILDER.SPAN / 2 };
        const ldir = across === 'x' ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 };
        cutAt(site.gantry, lp, ldir);
        await sleep(400);
        const i1 = dyn.info(`bg:${d.id}`);
        const alive = !site.dead && i1 && i1.hp < 1 && capsOf(site.gantry) > 0;
        // mais cortes em pontos não essenciais: a resistência acaba — o canteiro cai
        let n = 0;
        const alongOf = () => (d.axis === 'x' ? site.gantry.position.z : site.gantry.position.x);
        let pre = null;
        while (!site.dead && n < 8) {
          pre = { g: alongOf(), nb: site.built.length, kids: site.group.children.length };
          cutAt(site.gantry, { ...lp, y: 28 + n * 7 }, ldir);
          n++;
          await sleep(200);
        }
        const worn = site.dead && dyn.info(`bg:${d.id}`)?.dead === 'worn';
        // tombou ONDE ESTAVA, e nada apareceu nem sumiu (a obra, blocos caídos, pórticos velhos)
        const inPlace = !!pre && Math.abs(alongOf() - pre.g) < 0.5 && site.built.length === pre.nb && site.group.children.length === pre.kids;
        const placeWhy = pre ? `o pórtico ${(alongOf() - pre.g).toFixed(2)} m de onde estava · blocos ${pre.nb}→${site.built.length} · peças do canteiro ${pre.kids}→${site.group.children.length}` : '-';
        // o essencial: noutro canteiro, a perna embaixo — cai de um tiro
        let ess = 'sem segundo canteiro';
        const s2 = live[1];
        if (s2) {
          const a2 = s2.def.axis === 'x' ? 'x' : 'z';
          cutAt(s2.gantry, a2 === 'x' ? { x: -BUILDER.SPAN / 2, y: 4, z: 0 } : { x: 0, y: 4, z: -BUILDER.SPAN / 2 }, a2 === 'x' ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 });
          await sleep(300);
          ess = s2.dead && dyn.info(`bg:${s2.def.id}`)?.dead === 'essential' ? 'a base da perna: caiu de um tiro' : `não caiu (${dyn.info(`bg:${s2.def.id}`)?.dead})`;
        }
        const oco = hollow(`bg:${d.id}`);
        ok = solid && blockCut && railCut && alive && worn && inPlace && !ess.startsWith('não') && !oco;
        why = `perna sólida ${solid} · bloco: furo ${blockCut} · trilho: furo ${railCut} · perna no meio: segue trabalhando ${!!alive} (resistência ${i1 ? Math.round(i1.hp * 100) : '?'}%) · +${n} cortes: ${worn ? 'gasto, caiu' : 'NÃO caiu'} (${placeWhy}) · ${ess} · peças ocas ${oco}`;
      } else why = 'nenhum canteiro vivo perto';
    }
    report({ kind: 'construtor', ok, why });
  }

  // construtor:trilho — um trilho cortado no caminho: o pórtico chega até o corte e para ali
  {
    let ok = false;
    let why = 'nenhum canteiro vivo';
    const B = world.builders;
    const site = [...B.sites.values()].find((x) => !x.dead && x.task);
    if (site) {
      const d = site.def;
      const along = d.axis === 'x' ? 'z' : 'x';
      // um alvo longe (o pórtico vai andar ~40 m) e o corte a 15 m dele, no caminho, no trilho +SPAN/2
      const goal = along === 'z' ? B._cellPos(site, site.task.cell).z : B._cellPos(site, site.task.cell).x;
      site.task.phase = 'move';
      site.gx = goal - 40;
      const at = site.gx + 15;
      const side = BUILDER.SPAN / 2;
      const p = along === 'z' ? new THREE.Vector3(d.x + side, d.y + 0.5, d.z + at) : new THREE.Vector3(d.x + at, d.y + 0.5, d.z + side);
      world.addCut({ a: [p.x, p.y + 6, p.z], b: [p.x, p.y - 3, p.z], r: 1.5 }, p, { now: true });
      await sleep(12000);
      const stopAt = at - 7;
      ok = !!site.stuck && Math.abs(site.gx - stopAt) < 0.5 && !site.dead;
      why = `cortes no trilho achados ${JSON.stringify((site.railBreaks ?? []).map((v) => +v.toFixed(1)))} · o pórtico em ${site.gx.toFixed(1)} (o corte em ${at.toFixed(1)}, para em ${stopAt.toFixed(1)}; o alvo em ${goal.toFixed(1)}) · preso ${!!site.stuck}`;
    }
    report({ kind: 'construtor:trilho', ok, why });
  }

  // elevador: o carro cortado continua; o canto dos cabos (essencial) o para
  {
    let ok = false;
    let why = 'nenhum elevador perto';
    const E = world.elevators;
    for (const place of ['camada', 'poco', 'macico']) {
      if ([...E.cars.values()].length) break;
      if (ctx.ui.teleport(place, place)) await sleep(7000);
    }
    const car = [...E.cars.values()].find((c) => c.def.kind !== 'grand') ?? [...E.cars.values()][0];
    if (car) {
      const id = `lift:${car.def.id}`;
      // um furo fino no meio do piso (longe dos cantos dos cabos)
      cutAt(car.group, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5, 3);
      await sleep(300);
      const i1 = dyn.info(id);
      const alive = i1 && !i1.dead && i1.hp < 1 && !car.dead;
      const hw = car.def.w / 2 - 1;
      const hd = car.def.d / 2 - 1;
      cutAt(car.group, { x: hw, y: 1.5, z: hd }, { x: 0, y: 1, z: 0 }, 1.5, 6);
      await sleep(300);
      const dead = car.dead && dyn.info(id)?.dead === 'essential';
      await sleep(5000);
      const y0 = car.y;
      await sleep(2000);
      const stopped = Math.abs(car.y - y0) < 0.01;
      const oco = hollow(id);
      // some de perto e volta (como sair e voltar, ou recarregar o mundo): reaparece onde parou, parado
      const yStop = car.y;
      E.cars.delete(car.def.id);
      car.group.removeFromParent();
      dyn.detach(id);
      E._scanTimer = 0;
      await waitFor(() => E.cars.has(car.def.id), 5);
      await sleep(1500);
      const back = E.cars.get(car.def.id);
      const same = !!back && Math.abs(back.y - yStop) < 0.05 && back.rate === 0 && !!back.dead;
      ok = !!alive && dead && stopped && !oco && same;
      why = `${car.def.kind}: cortado no meio, segue (resistência ${i1 ? Math.round(i1.hp * 100) : '?'}%) ${!!alive} · o canto dos cabos: ${dead ? 'parou' : 'NÃO parou'} · parado de fato ${stopped} · peças ocas ${oco} · ao voltar: ${back ? `a ${(back.y - yStop).toFixed(2)} m de onde parou, ritmo ${back.rate}` : 'não voltou'}`;
    }
    report({ kind: 'elevador', ok, why });
  }

  // cadaver:vagao — um corpo morto no piso de um vagão andando: vai junto (não fica para trás no ar)
  {
    let ok = false;
    let why = 'nenhum vagão perto';
    const T = world.transit;
    if (ctx.ui.teleport('transportador', 'transportador')) await sleep(8000);
    await waitFor(() => T.cars.size > 0, 10);
    // um vagão que vai andar logo (o que acabou de parar fica na estação um tempo)
    const car = [...T.cars.values()].find((c) => (c.speed ?? 0) > 1) ?? [...T.cars.values()][0];
    if (car) {
      car.group.updateMatrixWorld(true);
      const local = new THREE.Vector3(0.5, 0.02, 3);
      const p = local.clone().applyMatrix4(car.group.matrixWorld).add(world.origin);
      const e = world.entities.spawn({ id: 't:dano:vagao', kind: 'test', feet: p, persist: false });
      // a câmera vai junto (o corpo só é cuidado perto dela)
      controls.canFly = true;
      controls.setMode('fly');
      let on = true;
      const tick = () => {
        if (!on) return;
        requestAnimationFrame(tick);
        car.group.updateMatrixWorld(true);
        camera.position.copy(new THREE.Vector3(8, 4, 3).applyMatrix4(car.group.matrixWorld));
      };
      tick();
      // de pé no vagão (o vivo vai junto — o Walker), e então morre ali: o corpo segue no vagão
      await waitFor(() => e.walker.grounded && !!e.walker.groundObj?.userData.transit, 6);
      car.group.updateMatrixWorld(true);
      local.copy(new THREE.Vector3(e.feet.x, e.feet.y, e.feet.z).sub(world.origin).applyMatrix4(car.group.matrixWorld.clone().invert()));
      world.entities.kill(e, 'beam');
      const t0 = car.t;
      await sleep(9000);
      on = false;
      car.group.updateMatrixWorld(true);
      const back = new THREE.Vector3(e.feet.x, e.feet.y, e.feet.z).sub(world.origin).applyMatrix4(car.group.matrixWorld.clone().invert());
      const moved = Math.abs(car.t - t0);
      const off = back.distanceTo(local);
      ok = moved > 20 && off < 1.2;
      why = `o vagão andou ${moved.toFixed(0)} m · o corpo a ${off.toFixed(2)} m de onde morreu, no frame do vagão (y ${back.y.toFixed(2)}) · caindo ${e.fallV?.toFixed(1)}`;
      world.entities.remove(e.id);
    }
    report({ kind: 'cadaver:vagao', ok, why });
  }

  // solto:vagao — dois tiros de verdade (app/beam.js) no guarda-corpo de um vagão parado na estação, a
  // 1,8 m um do outro: o trecho do meio fica solto e cai (gen/cut.js dropLoose — nada flutua)
  {
    let ok = false;
    let why = 'nenhum vagão parado';
    const T = world.transit;
    // na plataforma de uma estação (o caso anterior seguiu um vagão para longe)
    if (ctx.ui.teleport('transportador', 'transportador')) await sleep(8000);
    // um vagão que ACABA de parar na estação (a parada inteira pela frente: os dois tiros com ele parado)
    const moving = new Set();
    /** @type {any} */
    let car = null;
    await waitFor(() => {
      for (const c of T.cars.values()) {
        if (c.dead) continue;
        if ((c.speed ?? 0) > 1) moving.add(c);
        else if (moving.has(c) && (c.speed ?? 1) < 0.01) car = c;
      }
      return !!car;
    }, 150);
    if (car) {
      const W = 5;
      const L = 22;
      const rail = (z) => new THREE.Vector3(-W / 2 + 0.15, 1.0, z).applyMatrix4(car.group.matrixWorld);
      const loose = [];
      const off = world.bus.on('cut:loose', (d) => loose.push(d));
      const fall0 = ctx.beam.fx.stats.falling;
      controls.canFly = true;
      controls.setMode('fly');
      ctx.player.energy.value = 1;
      ctx.inventory.equip('emitter');
      for (const z of [L / 4 + 1.9 + 1.2, L / 4 + 1.9 + 3.0]) {
        car.group.updateMatrixWorld(true);
        const p = rail(z);
        controls.setView({ pos: p.clone().add(new THREE.Vector3(0, 3, 0)), yaw: 0, pitch: -Math.PI / 2 + 0.001, scale: 1 });
        await sleep(400);
        ctx.beam.testHeld = true;
        await sleep(350);
        ctx.beam.testHeld = false;
        await sleep(900);
      }
      ctx.beam.testHeld = null;
      await sleep(1200);
      off?.();
      const fell = ctx.beam.fx.stats.falling - fall0;
      const mine = loose.filter((d) => d.mat === 'machine');
      // (diagnóstico: a peça do guarda-corpo — cortada? em quantas partes?)
      const id = `car:${car.line.id}:${car.k}`;
      const pcs = [...(world.dyn.objs.get(id)?.cut?.values() ?? [])].flatMap((st) => st.pieces);
      const railPc = pcs.find((pc) => {
        const c = pc.geo.boundingSphere?.center;
        return c && Math.abs(c.x + W / 2 - 0.15) < 0.3 && Math.abs(c.y - 1) < 0.3 && c.z > 3;
      });
      let parts = '?';
      if (railPc?.kept) {
        const g = railPc.kept.index ? railPc.kept.clone() : railPc.kept.clone();
        if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
        parts = components(g).map((c) => `${c.min[2].toFixed(2)}..${c.max[2].toFixed(2)}`).join(' ');
      }
      ok = mine.length >= 1 && fell >= 1;
      why = `fragmentos soltos do vagão ${mine.length} (${mine.map((d) => [d.sx, d.sy, d.sz].map((v) => v.toFixed(2)).join('×')).join(' · ')}) · pedaços caindo a mais ${fell} · tiros ${ctx.beam.lastShot ? `r ${ctx.beam.lastShot.r?.toFixed(2)}` : '?'} · o guarda-corpo: ${railPc ? `cortado ${railPc.cut}, partes (z) ${parts}, largados ${railPc.dropped?.size ?? 0}` : 'peça não achada'} · o vagão andou ${(car.speed ?? 0).toFixed(1)} m/s · resistência ${Math.round((dyn.info(id)?.hp ?? 1) * 100)}%`;
    }
    report({ kind: 'solto:vagao', ok, why });
  }

  // vagão: cortado continua; um truque (essencial) para a linha
  {
    let ok = false;
    let why = 'nenhum vagão perto';
    const T = world.transit;
    if (ctx.ui.teleport('transportador', 'transportador')) {
      await sleep(8000);
    }
    await waitFor(() => T.cars.size > 0, 10);
    const car = [...T.cars.values()][0];
    if (car) {
      const id = `car:${car.line.id}:${car.k}`;
      cutAt(car.group, { x: 0, y: 2.5, z: 0 }, { x: 1, y: 0, z: 0 }, 1.2, 6);
      await sleep(300);
      const i1 = dyn.info(id);
      const alive = i1 && !i1.dead && i1.hp < 1;
      cutAt(car.group, { x: 0, y: -0.7, z: 7 }, { x: 1, y: 0, z: 0 }, 1.5, 6);
      await sleep(300);
      const dead = car.dead && dyn.info(id)?.dead === 'essential' && !!world.worldState?.get(`transitDead:${car.line.id}`);
      const oco = hollow(id);
      // freia até parar; some de perto e volta: os vagões reaparecem onde ficaram, parados
      await sleep(8000);
      const tStop = car.t;
      const L = car.line;
      T.clocks.delete(L.id);
      for (const [cid, c] of [...T.cars]) {
        if (c.line.id !== L.id) continue;
        c.group.removeFromParent();
        T.cars.delete(cid);
        dyn.detach(`car:${cid}`);
      }
      await waitFor(() => T.cars.has(`${L.id}:${car.k}`), 5);
      await sleep(1500);
      const back = T.cars.get(`${L.id}:${car.k}`);
      const k = T.clocks.get(L.id);
      const same = !!back && back.t !== null && Math.abs(back.t - tStop) < 0.5 && k?.rate === 0;
      ok = !!alive && dead && !oco && same;
      why = `cortado no meio, segue (resistência ${i1 ? Math.round(i1.hp * 100) : '?'}%) ${!!alive} · o truque: ${dead ? 'parou a linha' : 'NÃO parou'} · peças ocas ${oco} · ao voltar: ${back ? `a ${(back.t - tStop).toFixed(2)} m de onde parou, ritmo ${k?.rate}` : 'não voltou'}`;
    }
    report({ kind: 'vagao', ok, why });
  }

  // colosso: cortado continua; o núcleo (essencial) para a trincheira
  {
    let ok = false;
    let why = 'nenhum colosso perto';
    const C = world.colossi;
    if (ctx.ui.teleport('colosso', 'colosso')) {
      await sleep(8000);
      await waitFor(() => C.machines.size > 0, 10);
      await sleep(2000);
      const first = [...C.machines.entries()].sort((a, b) => a[1].pos.distanceTo(world.toGlobal(camera.position.clone())) - b[1].pos.distanceTo(world.toGlobal(camera.position.clone())))[0];
      // (pela identidade a cada passo: o sistema pode refazer o objeto da máquina ao varrer as trincheiras)
      const key = first?.[0];
      const M = () => C.machines.get(key);
      if (M()) {
        const id = `col:${key}`;
        cutAt(M().group, { x: 40, y: 4, z: 95 }, { x: 0, y: 1, z: 0 }, 2.8, 12);
        await sleep(400);
        const i1 = dyn.info(id);
        const alive = i1 && !i1.dead && i1.hp < 1;
        const p0 = M().pos.clone();
        await sleep(1500);
        const moving = M().pos.distanceTo(p0) > 1;
        const H = COLOSSUS.depth - 18 + 14;
        cutAt(M().group, { x: 0, y: H / 2 + 2, z: -18 }, { x: 1, y: 0, z: 0 }, 2.8, 60);
        await sleep(400);
        const dead = !!M()?.dead && dyn.info(id)?.dead === 'essential';
        const p1 = M()?.pos.clone();
        await sleep(1500);
        const stopped = !!p1 && !!M() && M().pos.distanceTo(p1) < 0.01;
        if (!p1 || !M()) console.warn('DANO colosso: a máquina saiu do mapa', key, C.machines.size, [...C.machines.keys()].join(','));
        const oco = hollow(id);
        // o feixe chega às partes DENTRO da trincheira (acima do fundo da laje): o bloco central e a
        // longarina — de dentro da trincheira (ao lado) e de baixo, de perto e de longe (cheio: 400 m)
        const mm = M() ?? first?.[1];
        mm.group.updateMatrixWorld(true);
        const Wp = (p) => new THREE.Vector3(...p).applyMatrix4(mm.group.matrixWorld).add(world.origin);
        const alongV = mm.lane.axis === 'x' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
        const sideV = mm.lane.axis === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
        const reachFail = [];
        for (const [nm, tg] of /** @type {[string, THREE.Vector3][]} */ ([['bloco', Wp([0, H / 2 + 2, -18])], ['longarina', Wp([45, H - 5, 0])]])) {
          for (const [how, off] of /** @type {[string, THREE.Vector3][]} */ ([['ao lado', sideV.clone().multiplyScalar(-(nm === 'bloco' ? 60 : 0)).addScaledVector(alongV, 150)], ['de baixo 120 m', new THREE.Vector3(0, -60, 0).addScaledVector(alongV, 104)], ['de baixo 380 m', new THREE.Vector3(0, -190, 0).addScaledVector(alongV, 329)]])) {
            const a = tg.clone().add(off);
            const d = tg.clone().sub(a).normalize();
            const r = beamReach(world.field, a, d, shotOf(1, 0).range);
            if (r.t < tg.distanceTo(a)) reachFail.push(`${nm} ${how}: parou a ${r.t.toFixed(0)} de ${tg.distanceTo(a).toFixed(0)} (${r.stop ?? 'alcance'})`);
          }
        }
        ok = !!alive && moving && dead && stopped && !oco && !reachFail.length;
        why = `cortado na plataforma: segue ${!!alive && moving} (resistência ${i1 ? Math.round(i1.hp * 100) : '?'}%) · o núcleo: ${dead ? 'parou' : 'NÃO parou'} · a trincheira parada ${stopped} · peças ocas ${oco} · o feixe nas partes de dentro da trincheira: ${reachFail.length ? reachFail.join('; ') : 'chega'}`;
      }
    }
    report({ kind: 'colosso', ok, why });
  }

  // colosso:trilho — o trilho do teto da trincheira cortado: a trincheira para (como vagões e elevadores)
  {
    let ok = false;
    let why = 'nenhuma máquina andando perto';
    const C = world.colossi;
    const g0 = world.toGlobal(camera.position.clone());
    const m = [...C.machines.values()].filter((x) => !C.laneStopped(x.lane)).sort((a, b) => a.pos.distanceTo(g0) - b.pos.distanceTo(g0))[0];
    if (m) {
      const L = m.lane;
      const y = L.b.bottom + COLOSSUS.depth - 12;
      // 300 m adiante da máquina, atravessando o trilho +45 de lado (horizontal, perpendicular a ele)
      const u = (L.axis === 'x' ? m.pos.x : m.pos.z) + 300;
      const side = L.lat + 45;
      const a = L.axis === 'x' ? [u, y, side - 10] : [side - 10, y, u];
      const b = L.axis === 'x' ? [u, y, side + 10] : [side + 10, y, u];
      world.addCut({ a, b, r: 2 }, new THREE.Vector3(...a), { now: true });
      await sleep(600);
      const stopped = C.laneStopped(L);
      const p0 = m.pos.clone();
      await sleep(1500);
      const still = m.pos.distanceTo(p0) < 0.01;
      ok = stopped && still;
      why = `trincheira ${L.id}: parada ${stopped} · a máquina ${still ? 'parou' : `andou ${m.pos.distanceTo(p0).toFixed(1)} m`}`;
    }
    report({ kind: 'colosso:trilho', ok, why });
  }
}
