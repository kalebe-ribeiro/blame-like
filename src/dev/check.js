// ─────────────────────────────────────────────────────────────────────────────
//  Teste de fumaça (`npm run check`): um roteiro automático dentro do jogo.
//
//  Numa seed fixa, visita todos os tipos de destino do transporte. Em cada um
//  espera o terreno carregar, mede o fps (média e pior quadro) e confere se o
//  corpo está parado no chão (não caiu através do mundo). No meio do roteiro
//  força um apagão e um colapso. Cada resultado vai para o processo principal
//  como uma linha "CHECK:{json}"; erros de script/shader chegam como erros do
//  console. O processo principal monta o relatório e sai com 0 (passou) ou 1.
// ─────────────────────────────────────────────────────────────────────────────
import { DESTINATIONS } from '../world/teleport.js';

const SETTLE = 6000; // ms para o terreno em volta carregar
const MEASURE = 2500; // ms medindo quadros

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mede quadros por `ms`: fps médio e pior quadro. */
function measure(ms) {
  return new Promise((resolve) => {
    const ts = [];
    let last = 0;
    const t0 = performance.now();
    const tick = (t) => {
      if (last) ts.push(t - last);
      last = t;
      if (t - t0 < ms) requestAnimationFrame(tick);
      else {
        const avg = ts.reduce((a, b) => a + b, 0) / Math.max(1, ts.length);
        resolve({ fps: Math.round(1000 / avg), worst: Math.round(Math.max(0, ...ts)) });
      }
    };
    requestAnimationFrame(tick);
  });
}

/**
 * @param {object} ctx { teleport, world, controls, camera, THREE, getTime }
 */
export async function runCheck(ctx) {
  const { teleport, world, controls, camera, THREE } = ctx;
  const report = (o) => console.warn('CHECK:' + JSON.stringify(o));
  window.addEventListener('error', (e) => console.error('CHECK-ERR ' + e.message));
  window.addEventListener('unhandledrejection', (e) => console.error('CHECK-ERR ' + (e.reason?.stack ?? e.reason)));

  await sleep(SETTLE);
  const only = ctx.only && ctx.only !== '1' ? ctx.only.split(',') : null;
  // --check=a,b,c visita só esses, nessa ordem
  const kinds = only ? only.filter((k) => DESTINATIONS.some((d) => d.kind === k)) : DESTINATIONS.map((d) => d.kind);
  for (let n = 0; n < kinds.length; n++) {
    const kind = kinds[n];
    const from = world.toGlobal(camera.position);
    const found = teleport(kind, kind);
    if (!found) {
      report({ kind, ok: false, why: 'destino não encontrado' });
      continue;
    }
    controls.setMode('walk');
    // no meio do roteiro, os eventos do mundo também precisam funcionar
    if (n === 3) world.outages.trigger(world.toGlobal(camera.position), camera.getWorldDirection(new THREE.Vector3()), ctx.getTime());
    if (n === 6) world.collapses.trigger(world.toGlobal(camera.position), camera.getWorldDirection(new THREE.Vector3()), ctx.getTime());
    await sleep(SETTLE);
    const m = await measure(MEASURE);
    const w = controls.walker;
    const g = world.toGlobal(camera.position);
    // "caiu": em queda livre há muito tempo depois de o terreno carregar
    const falling = !w.grounded && w.airTime > 2;
    report({ kind, ok: !falling, fps: m.fps, worst: m.worst, grounded: w.grounded, y: Math.round(g.y), ...(falling ? { why: 'em queda livre (atravessou o chão?)', at: [from.x, from.y, from.z].map(Math.round) } : {}) });
  }
  console.warn('CHECK:DONE');
}
