// ─────────────────────────────────────────────────────────────────────────────
//  Teste dos corpos (`npm run check:beings`) — o "pronto quando" da fase 5:
//  um corpo de teste (sem rosto, sem papel) atravessa a Cidade sozinho, de um
//  lugar a outro, sem se perder nem atravessar paredes.
//
//  Em quatro plataformas da teia (a região da rede andável), cria um
//  corpo e o manda a um lugar alcançável a ~DIST m. A câmera voa atrás dele (o
//  corpo fica na simulação completa, com física). Passa se ele chega; reprova se:
//    • empaca ou se perde (sem caminho), ou passa do tempo;
//    • cai (uma queda de mais de 4 m);
//    • o peito atravessa uma parede num quadro (fiscal em world/entities.js);
//    • termina longe do destino.
//  Cada resultado vai ao processo principal como "CHECK:{json}" (main.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { followBody } from '../app/dev.js';
import { standPoint } from '../gen/nav.js';

const SETTLE = 6000;
const DIST = 220; // m de caminho (andando), no máximo
const START = ['teia', 'teia', 'teia', 'teia']; // quatro plataformas diferentes da teia (repetir o destino leva a outra)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function runBeingTest(ctx) {
  const { world, camera } = ctx;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));
  await sleep(SETTLE);

  for (let n = 0; n < START.length; n++) {
    const kind = `corpo-${n + 1}`;
    if (START[n]) {
      ctx.controls.setMode('walk');
      if (!ctx.ui.teleport(START[n], START[n])) {
        report({ kind, ok: false, why: `partida (${START[n]}) não encontrada` });
        continue;
      }
      await sleep(SETTLE);
    }
    const g = world.toGlobal(camera.position);
    const e = ctx.beings.spawnTest(g, DIST, 7 + n * 13);
    if (!e || !e.path) {
      report({ kind, ok: false, why: e ? `sem caminho (${e.state})` : 'nenhuma plataforma/passarela perto', at: [g.x, g.y, g.z].map(Math.round) });
      if (e) world.entities.remove(e.id);
      continue;
    }
    const from = e.feet.clone();
    const goalV = world.entities.nav.vertexAt(e.goal.x, e.goal.y, e.goal.z);
    const goal = goalV?.kind === 'node' ? standPoint(goalV.n) : e.goal;
    const stop = followBody(ctx, e);
    const len = e.path.length;
    // o prazo: o caminho a ~2,3 m/s com folga; um caminho novo (replanejado) ganha o prazo dele
    let limit = (len / 2.3) * 1.6 + 25; // s
    let lastPath = e.path;
    const t0 = performance.now();
    let frames = 0;
    let worst = 0;
    let last = performance.now();
    const count = () => {
      const t = performance.now();
      worst = Math.max(worst, t - last);
      last = t;
      frames++;
      if (world.entities.list.has(e.id)) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);
    let tick = 0;
    while (e.state === 'walk' && (performance.now() - t0) / 1000 < limit) {
      await sleep(500);
      if (e.path !== lastPath) {
        lastPath = e.path;
        limit = Math.min(420, (performance.now() - t0) / 1000 + (e.path.length / 2.3) * 1.6 + 25);
      }
      // um rastro a cada 10 s (ajuda a ver onde um corpo se enrosca)
      if (++tick % 20 === 0) {
        const leg = e.path?.legs?.[e.path.ptLeg?.[e.pi] ?? -1];
        console.warn(`BEING ${kind}: ponto ${e.pi}/${e.path.pts.length} (${leg?.kind ?? '?'}) em ${[e.feet.x, e.feet.y, e.feet.z].map((v) => v.toFixed(1)).join(',')} · ${e.tier} · vel ${e.speed.toFixed(2)} · parado ${e.stuckT.toFixed(1)} s · desvios ${e.replans}`);
      }
    }
    const secs = (performance.now() - t0) / 1000;
    const miss = Math.hypot(e.feet.x - goal.x, e.feet.z - goal.z);
    const s = e.stats;
    let why = null;
    if (e.state !== 'arrived') {
      const leg = e.path?.legs?.[e.path.ptLeg?.[e.pi] ?? -1];
      why = `${e.state === 'walk' ? `tempo esgotado (${Math.round(secs)} s)` : `empacou/perdeu-se (${e.state})`} no ponto ${e.pi}/${e.path?.pts.length ?? 0} (${leg?.kind ?? '?'}) · ${s.replans} replanejamentos · em ${[e.feet.x, e.feet.y, e.feet.z].map(Math.round).join(',')}`;
    }
    else if (s.fell) why = `caiu ${s.fell}×`;
    else if (s.wall) why = `atravessou parede ${s.wall}×`;
    else if (miss > 2.5 || Math.abs(e.feet.y - goal.y) > 3) why = `chegou longe do destino (${miss.toFixed(1)} m)`;
    const ok = !why;
    report({
      kind,
      ok,
      fps: Math.round(frames / Math.max(1, secs)),
      worst: Math.round(worst),
      why: ok ? `${Math.round(len)} m em ${Math.round(secs)} s · ${e.path.legs.length} arestas (${[...new Set(e.path.legs.map((l) => l.kind))].join(', ')}) · ${s.replans} replanejamentos · perto ${Math.round(s.near)} s` : why,
      ...(ok ? {} : { at: [from.x, from.y, from.z].map(Math.round) }),
    });
    stop();
    world.entities.remove(e.id);
    await sleep(300);
  }

  // ── queda: um corpo que cai de mais de 12 m morre (e fica deitado onde caiu) ──
  {
    const DOWN = new THREE.Vector3(0, -1, 0);
    let spot = null;
    for (let k = 0; k < 4 && !spot; k++) {
      ctx.ui.teleport('teia', 'teia');
      await sleep(SETTLE);
      const n = world.field.nearestNode(...world.toGlobal(camera.position).toArray(), { below: 2, above: 1, reach: 2 });
      if (!n) continue;
      const col = world.entities.nav && ctx.controls.walker.col;
      const c = new THREE.Vector3(n.x, n.y, n.z).sub(world.origin);
      col.buildsPerFrame = 600;
      col.refresh(c, 40);
      col.buildsPerFrame = 2;
      for (let q = 0; q < 24 && !spot; q++) {
        const a = (q / 24) * Math.PI * 2;
        const p = c.clone().add(new THREE.Vector3(Math.sin(a) * (n.r + 1.5), 0, Math.cos(a) * (n.r + 1.5)));
        const hit = col.ray(p.clone().setY(p.y + 0.3), DOWN, 60);
        if (hit && hit.face && hit.face.normal.y > 0.7 && hit.distance > 14) spot = p.add(world.origin);
      }
    }
    if (!spot) report({ kind: 'queda', ok: false, why: 'nenhuma beirada com chão 14–60 m abaixo' });
    else {
      /** @type {any} */
      let died = null;
      const off = world.bus.on('being:die', (ev) => (died = ev));
      const e = world.entities.spawn({ id: 'fall-test', kind: 'test', feet: spot, persist: false });
      followBody(ctx, e);
      await sleep(8000);
      off();
      report({ kind: 'queda', ok: !!e.dead && died?.cause === 'fall', why: e.dead ? `morreu na queda (${died?.cause})` : `vivo (hp ${e.hp.toFixed(2)}, ${e.tier}, no chão ${e.walker.grounded})` });
      world.entities.remove(e.id);
    }
  }
  console.warn('CHECK:DONE');
}
