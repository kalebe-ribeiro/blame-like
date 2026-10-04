// ─────────────────────────────────────────────────────────────────────────────
//  Teste da vida (`npm run check:health`, na Peregrinação — o cofre, Barra-de-vida §10):
//
//    queda:N     largado de N m sobre um chão sem nada no caminho: o dano é o da altura
//                (9 m nada; 20 m ≈ 26%; 30 m ≈ 52%) — e bate com fallDamage(impacto)
//    queda:50    zera → o desmaio (a sequência da queda) → acorda com a vida cheia
//    voltar      sem dano por 6 s a vida não volta; depois, ~1%/s
//    emissor     o disparo pelo estágio: 1 azul 0 · 2 violeta 5% · 3 12% · 4 limite 30% · 5 30%
//    emissor:zera  o tiro no limite com 20% de vida zera (V6) → o desmaio
//    choque      o choque contra um obstáculo tira vida só arremessado (walker.thrown);
//                o próprio coice do emissor contra a parede de verdade: só o baque
//    golpe:plano um Safeguard caçando chega, golpeia: −50%, o arremesso sem comando, cai no
//                mesmo plano, fica caído ~1 s, nada além dos 50%
//    golpe:borda o golpe perto de uma borda alta: cai da estrutura → zera → desmaio da queda
//    golpe:parede de costas para uma parede perto: 50% + o choque
//    golpe:zera  com 50%, o golpe seguinte zera → a captura (acorda pelos Safeguards, cheia)
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { fallDamage, slamDamage, BEAM_DAMAGE, STRIKE_DAMAGE } from '../app/health.js';
import { stageOf } from '../app/beam.js';

const SETTLE = 7000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DOWN = new THREE.Vector3(0, -1, 0);
const UP = new THREE.Vector3(0, 1, 0);

export async function runHealthTest(ctx) {
  try {
    await run(ctx);
  } catch (err) {
    console.error('CHECK-ERR ' + (err?.stack ?? err));
  }
  console.warn('CHECK:DONE');
}

async function run(ctx) {
  const { world, camera, controls } = ctx;
  const H = ctx.health;
  const w = controls.walker;
  const sg = world.safeguards;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + (e.error?.stack ?? e.message)));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));
  const waitFor = async (cond, s) => {
    const t0 = performance.now();
    while (!cond() && performance.now() - t0 < s * 1000) await sleep(100);
    return cond();
  };
  const here = () => world.toGlobal(camera.position, new THREE.Vector3());
  const pct = (v) => `${(v * 100).toFixed(1)}%`;
  const refreshCol = (at, r = 40) => {
    w.col._t = -1e9;
    w.col.buildsPerFrame = 600;
    w.col.refresh(at, r);
    w.col.buildsPerFrame = 2;
  };
  /** @type {any} */
  let woke = null;
  world.bus.on('player:wake', (ev) => (woke = ev));
  /** @type {any[]} */
  const zeros = [];
  world.bus.on('player:zero', (ev) => zeros.push(ev.source));
  /** @type {{ v: number, h: number }|null} */
  let landed = null;
  const onLand0 = w.onLand;
  w.onLand = (v, h) => {
    landed = { v, h };
    onLand0?.(v, h);
  };
  const waitWake = async () => {
    await waitFor(() => ctx.wake.active, 3);
    return waitFor(() => !ctx.wake.active, 90);
  };
  const lantern = (on) => {
    if (!!ctx.carried.lanternOn !== on) ctx.carried.toggleLantern();
  };
  // os Safeguards só no que o teste prepara (senão uma ronda pega o jogador no meio de outro caso)
  const senses0 = sg.senses;
  const quiet = () => (sg.senses = () => null);
  const loud = () => (sg.senses = senses0);

  // --healthpart=queda,voltar,emissor,choque,golpe,borda,parede: só esses casos
  const part = ctx.params.get('healthpart');
  const want = (k) => !part || part.split(',').includes(k);
  ctx.player.energy.value = 1;
  await sleep(SETTLE);
  quiet();

  /** Um lugar: anda até ele, espera o chão. → os pés (cena) ou null. */
  const go = async (place) => {
    if (!ctx.ui.teleport(place, place)) return null;
    controls.setMode('walk');
    await sleep(SETTLE);
    await waitFor(() => w.grounded, 5);
    refreshCol(camera.position.clone(), 60);
    return w.grounded ? w.feet.clone() : null;
  };
  /** O chão abaixo de um ponto da cena (y) — ou null — e a que distância. */
  const floorBelow = (x, y, z, far = 4) => {
    const h = w.col.ray(new THREE.Vector3(x, y, z), DOWN, far);
    return h && h.face && h.face.normal.y > 0.55 ? h.point.y : null;
  };
  /** Livre na horizontal (a 1,0 m e 1,6 m do chão) até d m? */
  const clearH = (feet, dir, d) => {
    for (const hh of [1.0, 1.6]) {
      const hit = w.col.ray(feet.clone().setY(feet.y + hh), dir, d);
      if (hit) return hit.distance;
    }
    return Infinity;
  };
  const dirOf = (a) => new THREE.Vector3(Math.sin(a), 0, Math.cos(a));
  /** Uma parede a [d0, d1] m de um ponto de chão perto dos pés (até 12 m em volta), com chão
   *  a 1,2 m do lado oposto (onde fica quem golpeia). → { c (pés, cena), d (para a parede), dist } */
  const wallNear = (feet, d0, d1) => {
    for (let i = 0; i < 48; i++) {
      const p = i === 0 ? feet.clone() : feet.clone().addScaledVector(dirOf(i * 2.4), 2 + (i % 6) * 2);
      const y = floorBelow(p.x, feet.y + 1, p.z, 3);
      if (y === null) continue;
      const c = new THREE.Vector3(p.x, y, p.z);
      for (let q = 0; q < 24; q++) {
        const d = dirOf((q / 24) * Math.PI * 2);
        const dist = clearH(c, d, d1 + 0.5);
        if (dist < d0 || dist > d1) continue;
        const nrm = w.col.ray(c.clone().setY(y + 1.3), d, d1 + 0.5);
        if (!nrm?.face || Math.abs(nrm.face.normal.y) > 0.3) continue;
        if (floorBelow(c.x - d.x * 1.2, y + 1, c.z - d.z * 1.2, 2) === null) continue;
        return { c, d, dist };
      }
    }
    return null;
  };

  // ── queda: uma coluna livre de ≥ 52 m acima de um chão ──
  let column = null;
  for (const place of want('queda') ? ['poco',  'teia', 'trelica', 'escadaria', 'galeria', 'camada'] : []) {
    const feet = await go(place);
    if (!feet) continue;
    for (let i = 0; i < 40 && !column; i++) {
      const a = (i / 40) * Math.PI * 2 * 3;
      const r = (i % 5) * 2.5;
      const p = feet.clone().addScaledVector(dirOf(a), r);
      const y = floorBelow(p.x, feet.y + 1, p.z, 3);
      if (y === null) continue;
      const base = new THREE.Vector3(p.x, y, p.z);
      refreshCol(base.clone().setY(y + 28), 45);
      const up = w.col.ray(base.clone().setY(y + 0.3), UP, 56);
      if (up) continue;
      // o corpo tem largura: nada a 0,5 m em volta, de cima a baixo
      let ok = true;
      for (let q = 0; q < 6 && ok; q++) {
        const o = base.clone().addScaledVector(dirOf((q / 6) * Math.PI * 2), 0.5);
        const h = w.col.ray(o.setY(y + 54), DOWN, 54);
        if (!h || h.point.y > y + 0.3) ok = false;
      }
      if (ok) column = { place, base };
    }
    if (column) break;
  }
  if (!want('queda')) {
    // (fora desta rodada)
  }
  else if (!column) report({ kind: 'queda', ok: false, why: 'nenhuma coluna livre de 52 m' });
  else {
    for (const hgt of [9, 20, 30, 50]) {
      H.set(1);
      landed = null;
      const z0 = zeros.length;
      const b = column.base;
      controls.placeFeet(new THREE.Vector3(b.x, b.y + hgt, b.z));
      const ok1 = await waitFor(() => !!landed, 8);
      await sleep(150);
      const want = Math.sqrt(2 * 15 * hgt);
      const got = 1 - H.value;
      if (hgt < 50) {
        const exp = fallDamage(landed?.v ?? 0);
        report({ kind: `queda:${hgt}`, ok: ok1 && Math.abs((landed?.v ?? 0) - want) < 1.2 && Math.abs(got - exp) < 0.005 && !ctx.wake.active, why: landed ? `impacto ${landed.v.toFixed(1)} m/s (esperado ${want.toFixed(1)}) · dano ${pct(got)} (pela conta ${pct(exp)}) em ${column.place}` : 'não pousou' });
      } else {
        woke = null;
        const zeroed = zeros.length > z0 && zeros[z0] === 'fall';
        const back = zeroed && (await waitWake());
        report({ kind: 'queda:50', ok: ok1 && zeroed && back && !!woke && woke.cause === 'impact' && H.value === 1, why: `impacto ${landed?.v.toFixed(1)} m/s · ${zeroed ? 'zerou' : `vida ${pct(H.value)}`} · ${woke ? `acordou (${woke.cause}) com ${pct(H.value)}` : 'não acordou'}` });
      }
    }
  }

  // ── voltar ──
  if (want('voltar')) {
    await go('teia');
    H.set(1);
    H.damage('fall', 0.5); // (um dano de verdade: a espera de 6 s começa agora)
    await sleep(5500);
    const v5 = H.value;
    await sleep(1500); // (6 s: começa)
    const a = H.value;
    await sleep(3000);
    const b = H.value;
    const rate = (b - a) / 3;
    report({ kind: 'voltar', ok: Math.abs(v5 - 0.5) < 1e-6 && Math.abs(rate - 0.01) < 0.002, why: `parada nos primeiros 5,5 s (${pct(v5)}) · depois ${(rate * 100).toFixed(2)}%/s` });
  }

  // ── emissor: o disparo pelo estágio (parado no ar, atirando para cima) ──
  if (want('emissor')) {
    const couldFly = controls.canFly;
    controls.canFly = true;
    controls.setMode('fly');
    const rows = [];
    let ok = true;
    for (const o of [0.1, 0.4, 0.7, 1.0, 1.4]) {
      H.set(1);
      controls.pitch = 1.45;
      controls.velocity.set(0, 0, 0);
      ctx.beam.fire(1, o);
      await sleep(400);
      controls.velocity.set(0, 0, 0);
      const st = stageOf(o);
      const got = 1 - H.value;
      rows.push(`${st}:${pct(got)}`);
      if (Math.abs(got - BEAM_DAMAGE[st]) > 1e-6 || ctx.beam.lastShot?.hurt !== BEAM_DAMAGE[st]) ok = false;
      ctx.beam.restoreArms();
      await sleep(1000);
    }
    report({ kind: 'emissor', ok, why: rows.join(' · ') + ' (estágio:dano)' });
    // V6: no limite com 20% de vida — zera
    H.set(0.2);
    woke = null;
    const z0 = zeros.length;
    ctx.beam.fire(1, 1.0);
    const zeroed = zeros.length > z0 && zeros[z0] === 'beam';
    controls.velocity.set(0, 0, 0);
    const back = zeroed && (await waitWake());
    report({ kind: 'emissor:zera', ok: zeroed && back && H.value === 1, why: `${zeroed ? 'zerou' : `ficou ${pct(H.value)}`} · ${woke ? `acordou com ${pct(H.value)}` : 'não acordou'}` });
    controls.setMode('walk');
    controls.canFly = couldFly;
  }

  // ── choque: só arremessado tira vida ──
  if (want('choque')) {
    H.set(1);
    w.thrown = false;
    w.onSlam?.(30);
    const own = 1 - H.value;
    H.set(1);
    w.thrown = true;
    w.onSlam?.(30);
    const thrown = 1 - H.value;
    w.thrown = false;
    w.thrownSlam = 0;
    // o coice de verdade contra uma parede atrás (o estágio 2: a vida perde só os 5% do emissor)
    let real = 'sem parede';
    let realOk = false;
    let back = null;
    for (const place of ['galeria', 'colmeia', 'macico', 'deposito', 'maquinas']) {
      const feet = await go(place);
      const wl = feet && wallNear(feet, 0.8, 2.6);
      if (wl) {
        controls.placeFeet(wl.c);
        await sleep(500);
        back = wl.d;
        break;
      }
    }
    {
      if (back) {
        H.set(1);
        let slam = 0;
        const s0 = w.onSlam;
        w.onSlam = (v) => {
          slam = Math.max(slam, v);
          s0?.(v);
        };
        controls.yaw = Math.atan2(back.x, back.z); // de costas para a parede (olha para −back)
        controls.pitch = 0;
        ctx.beam.fire(1, 0.6);
        await sleep(1500);
        w.onSlam = s0;
        const got = 1 - H.value;
        realOk = slam > 12 && Math.abs(got - BEAM_DAMAGE[2]) < 1e-6;
        real = `bateu a ${slam.toFixed(1)} m/s · perdeu ${pct(got)} (só o emissor: ${pct(BEAM_DAMAGE[2])})`;
        ctx.beam.restoreArms();
      }
    }
    report({ kind: 'choque', ok: own === 0 && Math.abs(thrown - slamDamage(30)) < 1e-6 && realOk, why: `30 m/s pelo coice ${pct(own)} · arremessado ${pct(thrown)} · ${real}` });
  }

  // ── o golpe ──
  /** Um Safeguard de teste: a ronda mais perto, trazida para p (GLOBAL), olhando para o jogador. */
  const bringSg = (p) => {
    const g = here();
    let x = null;
    for (const e of sg.byTerritory.values()) if (!x || e.feet.distanceTo(g) < x.feet.distanceTo(g)) x = e;
    if (!x) return null;
    for (const e of sg.all()) if (e !== x && e.sg.state !== 'patrol') sg._lose(e);
    x.feet.copy(p);
    world.entities.toNear(x, world.origin);
    x.walker.vel.set(0, 0, 0);
    x.yaw = Math.atan2(-(g.x - p.x), -(g.z - p.z));
    return x;
  };
  /** Força o golpe agora (x a ~1,2 m, do lado oposto de dir: o arremesso vai para dir). */
  const strikeNow = (x) => Object.assign(x.sg, { state: 'strike', strikeT: 0, struck: false, sees: true, unseen: 0, prey: null, waitT: 0 });
  const watchThrow = () => {
    w.thrownSlam = 0;
    const r = { thrown: false, maxShove: 0, landed: null, downMax: 0, slam: 0 };
    const iv = setInterval(() => {
      if (w.thrown) r.thrown = true;
      r.maxShove = Math.max(r.maxShove, Math.hypot(w.shove.x, w.shove.z));
      r.downMax = Math.max(r.downMax, w.downT);
      r.slam = Math.max(r.slam, w.thrownSlam || 0);
    }, 16);
    return { r, stop: () => clearInterval(iv) };
  };

  // golpe:plano — vem caçando e golpeia; o chão em volta, largo e plano
  if (want('golpe')) {
    let spot = null;
    for (const place of ['camada', 'galeria', 'estrato', 'teia', 'maquinas']) {
      const feet = await go(place);
      if (!feet || !sg.byTerritory.size) continue;
      for (let i = 0; i < 30 && !spot; i++) {
        const p = feet.clone().addScaledVector(dirOf(i * 2.4), (i % 6) * 3);
        const y = floorBelow(p.x, feet.y + 1, p.z, 3);
        if (y === null) continue;
        const c = new THREE.Vector3(p.x, y, p.z);
        let ok = true;
        for (let q = 0; q < 12 && ok; q++) {
          const d = dirOf((q / 12) * Math.PI * 2);
          for (const r of [3, 6, 9, 12, 16]) {
            const fy = floorBelow(c.x + d.x * r, y + 1, c.z + d.z * r, 2);
            if (fy === null || Math.abs(fy - y) > 0.4) ok = false;
          }
          if (clearH(c, d, 17) !== Infinity) ok = false;
        }
        if (ok) spot = { place, c };
      }
      if (spot) break;
    }
    if (!spot) report({ kind: 'golpe:plano', ok: false, why: 'nenhuma plataforma larga' });
    else {
      controls.placeFeet(spot.c);
      await sleep(500);
      H.set(1);
      loud();
      lantern(true);
      const d = dirOf(0.7);
      const x = bringSg(world.toGlobal(spot.c.clone().addScaledVector(d, -5)));
      if (x) Object.assign(x.sg, { state: 'hunt', sees: true, unseen: 0, lastSeen: here().setY(here().y - 1.7), prey: null, bestD: Infinity, stuckT: 0, waitT: 0 });
      const st0 = sg.stats.strikes;
      const hit0 = sg.stats.hits;
      const y0 = w.feet.y;
      const T = watchThrow();
      const struck = !!x && (await waitFor(() => sg.stats.hits > hit0, 15));
      const afterHit = H.value;
      const down = struck && (await waitFor(() => w.downT > 0, 5));
      await waitFor(() => !w.thrown, 5);
      T.stop();
      const dy = Math.abs(w.feet.y - y0);
      report({ kind: 'golpe:plano', ok: struck && sg.stats.strikes > st0 && Math.abs(afterHit - (1 - STRIKE_DAMAGE)) < 1e-6 && T.r.thrown && down && dy < 0.6 && Math.abs(H.value - 0.5) < 0.01 && !ctx.wake.active, why: struck ? `golpe: vida ${pct(afterHit)} · arremesso ${T.r.maxShove.toFixed(1)} m/s · caído ${T.r.downMax.toFixed(2)} s · desnível ${dy.toFixed(2)} m · no fim ${pct(H.value)}` : `não golpeou (${x?.sg.state})` });

      // golpe:zera — ele espera e vem de novo: com 50%, zera → a captura
      woke = null;
      const caught = !!x && (await waitFor(() => ctx.wake.active, 20));
      const back = caught && (await waitWake());
      report({ kind: 'golpe:zera', ok: caught && back && woke?.cause === 'caught' && woke?.taker === 'safeguard' && H.value === 1, why: caught ? `${woke ? `acordou (${woke.cause}, ${woke.taker}) com ${pct(H.value)}` : 'não acordou'}` : `não veio de novo (${x?.sg.state})` });
      lantern(false);
      quiet();
    }
  }

  // golpe:borda — na beira de uma queda de mais de 60 m: o arremesso leva para fora
  if (want('borda')) {
    let spot = null;
    for (const place of ['teia', 'trelica', 'poco', 'escadaria', 'camada']) {
      const feet = await go(place);
      if (!feet || !sg.byTerritory.size) continue;
      for (let i = 0; i < 60 && !spot; i++) {
        const p = feet.clone().addScaledVector(dirOf(i * 2.4), (i % 6) * 2);
        const y = floorBelow(p.x, feet.y + 1, p.z, 3);
        if (y === null) continue;
        const c = new THREE.Vector3(p.x, y, p.z);
        for (let q = 0; q < 16 && !spot; q++) {
          const d = dirOf((q / 16) * Math.PI * 2);
          // chão até a borda (1,5–4 m), depois o vazio por mais 10 m, sem nada no caminho
          let edge = null;
          for (let r = 0.5; r <= 4; r += 0.5) if (floorBelow(c.x + d.x * r, y + 1, c.z + d.z * r, 2) === null) {
            edge = r;
            break;
          }
          if (edge === null || edge < 1.5) continue;
          let open = true;
          for (let r = edge; r <= edge + 10 && open; r += 1) {
            const h = w.col.ray(new THREE.Vector3(c.x + d.x * r, y + 1, c.z + d.z * r), DOWN, 70);
            if (h) open = false;
          }
          if (!open || clearH(c, d, edge + 10) !== Infinity) continue;
          // e chão atrás (onde ele fica)
          if (floorBelow(c.x - d.x * 1.2, y + 1, c.z - d.z * 1.2, 2) === null) continue;
          spot = { place, c, d, edge };
        }
      }
      if (spot) break;
    }
    if (!spot) report({ kind: 'golpe:borda', ok: false, why: 'nenhuma borda alta' });
    else {
      controls.placeFeet(spot.c);
      await sleep(500);
      H.set(1);
      woke = null;
      const z0 = zeros.length;
      const x = bringSg(world.toGlobal(spot.c.clone().addScaledVector(spot.d, -1.2)));
      if (x) strikeNow(x);
      const T = watchThrow();
      const y0 = w.feet.y;
      let minY = y0;
      let maxAir = 0;
      landed = null;
      let dbgT = 0;
      const probe = setInterval(() => {
        minY = Math.min(minY, w.feet.y);
        maxAir = Math.max(maxAir, w.airTime);
        if (ctx.params.get('healthtrace') && (dbgT += 50) % 250 === 0) {
          const gg = here();
          const L = world.chunkLayer;
          const s = L.size;
          const key = `${Math.floor(gg.x / s)},${Math.floor((gg.y - 1.7) / s)},${Math.floor(gg.z / s)}`;
          const e = L.chunks.get(key);
          console.warn(`MOVE HDBG t ${(performance.now() / 1000).toFixed(2)} air ${w.airTime.toFixed(2)} gr ${w.grounded} y ${gg.y.toFixed(1)} vel ${w.vel.y.toFixed(1)} col.ready ${w.col.ready} chunk ${key} ${e ? `rec ${e.received} empty ${e.empty} group ${!!e.group}` : 'AUSENTE'} · around ${L.isReadyAround(gg, 30)} · wake ${ctx.wake.active} · mode ${controls.mode}`);
        }
      }, 50);
      const hit = !!x && (await waitFor(() => T.r.thrown, 3));
      const after = H.value;
      // a queda leva segundos: espera o pouso (ou o desmaio) antes de esperar o despertar
      if (hit) await waitFor(() => !!landed || ctx.wake.active, 40);
      const back = hit && (await waitWake());
      T.stop();
      clearInterval(probe);
      const src = zeros.slice(z0).join(',') || `— (desceu ${(y0 - minY).toFixed(1)} m · no ar ${maxAir.toFixed(1)} s · pouso ${landed ? landed.v.toFixed(1) + ' m/s' : '—'} · ${w.thrown ? 'arremessado' : 'em pé'})`;
      report({ kind: 'golpe:borda', ok: hit && Math.abs(after - 0.5) < 1e-6 && zeros[z0] === 'fall' && back && woke?.cause === 'impact' && H.value === 1, why: hit ? `golpe ${pct(after)} · a borda a ${spot.edge} m (${spot.place}) · zerou por ${src} · ${woke ? `acordou (${woke.cause}) com ${pct(H.value)}` : 'não acordou'}` : 'não golpeou' });
    }
  }

  // golpe:parede — de costas para uma parede perto: 50% e o choque
  if (want('parede')) {
    let spot = null;
    for (const place of ['colmeia', 'macico', 'deposito', 'maquinas', 'galeria']) {
      const feet = await go(place);
      if (!feet || !sg.byTerritory.size) continue;
      const wl = wallNear(feet, 1.5, 3.5);
      if (wl) spot = { place, ...wl };
      if (spot) break;
    }
    if (!spot) report({ kind: 'golpe:parede', ok: false, why: 'nenhuma parede perto' });
    else {
      controls.placeFeet(spot.c);
      await sleep(500);
      H.set(1);
      const x = bringSg(world.toGlobal(spot.c.clone().addScaledVector(spot.d, -1.2)));
      if (x) strikeNow(x);
      const T = watchThrow();
      const hit = !!x && (await waitFor(() => T.r.thrown, 3));
      await waitFor(() => !w.thrown, 6);
      T.stop();
      const got = 1 - H.value;
      const exp = STRIKE_DAMAGE + slamDamage(T.r.slam);
      report({ kind: 'golpe:parede', ok: hit && T.r.slam > 12 && Math.abs(got - exp) < 0.01 && got > STRIKE_DAMAGE, why: hit ? `parede a ${spot.dist.toFixed(1)} m (${spot.place}) · bateu a ${T.r.slam.toFixed(1)} m/s · perdeu ${pct(got)} (50% + ${pct(slamDamage(T.r.slam))})` : 'não golpeou' });
    }
  }

  w.onLand = onLand0;
  loud();
}
