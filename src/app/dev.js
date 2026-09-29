// ─────────────────────────────────────────────────────────────────────────────
//  Flags de desenvolvimento (ver main.js): --goto, --outage, --collapse,
//  --stats e --check (teste de fumaça). Nada disso roda no `npm start` normal.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { subDraws } from '../world/batches.js';

export function setupDev(ctx) {
  const { params, world, camera, renderer } = ctx;
  const trigger = (system) => system.trigger(world.toGlobal(camera.position), camera.getWorldDirection(new THREE.Vector3()), ctx.time);

  // --goto=construtores (ou qualquer tipo do painel de transporte)
  if (params.get('goto')) ctx.ui.teleport(params.get('goto'), t(`dest.${params.get('goto')}`));
  // --outage=4 / --collapse=4: força o acontecimento aos N segundos
  if (params.get('outage')) setTimeout(() => trigger(world.outages), Number(params.get('outage')) * 1000);
  if (params.get('collapse')) setTimeout(() => trigger(world.collapses), Number(params.get('collapse')) * 1000);
  // --wake=4: desmaio (queda fatal) aos N segundos — para ver a sequência de despertar
  if (params.get('wake')) setTimeout(() => ctx.wake.start('impact'), Number(params.get('wake')) * 1000);

  // --check: roteiro automático por todos os destinos (npm run check)
  if (params.get('check')) {
    import('../dev/check.js').then((m) => m.runCheck({ teleport: ctx.ui.teleport, world, controls: ctx.controls, camera, THREE, getTime: () => ctx.time, only: params.get('check') }));
  }

  // --stats: FPS e streaming no terminal a cada 2 s
  if (params.get('stats')) {
    // tempo de CPU montando as listas de desenho dos lotes (por quadro)
    let batchMs = 0;
    let batchCalls = 0;
    const timeLists = () => {
      ctx.scene.traverse((o) => {
        if (!o.isBatchedMesh || o._timed) return;
        const obr = o.onBeforeRender;
        o.onBeforeRender = function (...a) {
          const t0 = performance.now();
          obr.apply(this, a);
          batchMs += performance.now() - t0;
          batchCalls++;
        };
        o._timed = true;
      });
    };
    const gl = renderer.getContext();
    // tempo de GPU do reflexo (EXT_disjoint_timer_query_webgl2)
    let reflMs = 0;
    let reflN = 0;
    let reflDraws = 0;
    let reflTris = 0;
    const tq = gl.getExtension('EXT_disjoint_timer_query_webgl2');
    if (tq && ctx.reflection) {
      const pending = [];
      const render = ctx.reflection.render.bind(ctx.reflection);
      ctx.reflection.render = (...a) => {
        while (pending.length && gl.getQueryParameter(pending[0], gl.QUERY_RESULT_AVAILABLE)) {
          const q = pending.shift();
          if (!gl.getParameter(tq.GPU_DISJOINT_EXT)) {
            reflMs += gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6;
            reflN++;
          }
          gl.deleteQuery(q);
        }
        if (ctx.reflection.level === null || pending.length > 4) return render(...a);
        const q = gl.createQuery();
        gl.beginQuery(tq.TIME_ELAPSED_EXT, q);
        const c0 = renderer.info.render.calls;
        const t0 = renderer.info.render.triangles;
        render(...a);
        gl.endQuery(tq.TIME_ELAPSED_EXT);
        reflDraws = renderer.info.render.calls - c0;
        reflTris = renderer.info.render.triangles - t0;
        pending.push(q);
      };
    }
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    console.warn(`gpu=${dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)}`);
    let frames = 0;
    const count = () => {
      frames++;
      requestAnimationFrame(count);
    };
    count();
    setInterval(() => {
      const g = world.toGlobal(camera.position);
      const s = world.stats;
      const info = renderer.info.render;
      const bs = world.batches.stats;
      console.warn(
        `fps=${(frames / 2).toFixed(0)} chunks=${s.chunks} lod1=${s.lod1} lod2=${s.lod2} macro=${s.macro} fila=${s.pending} ` +
          `lotes=${bs.pages} uso=${Math.round((100 * bs.used) / bs.cap)}% livres=${bs.freeSlots} mats=${bs.materials} comp=${world.batches.compactions ?? 0}/${(world.batches.compactMs ?? 0).toFixed(1)}ms draws=${info.calls} tris=${(info.triangles / 1e6).toFixed(2)}M pos=${g.x.toFixed(0)},${g.y.toFixed(0)},${g.z.toFixed(0)} região=${world.regionAt(camera.position)}` +
          (performance.memory ? ` heap=${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB` : ''),
      );
      timeLists();
      console.warn(`  vagas desenhadas/quadro: cena ${Math.round(subDraws.main / Math.max(1, frames))} · reflexo ${Math.round(subDraws.reflection / Math.max(1, frames))}`);
      subDraws.main = subDraws.reflection = 0;
      if (reflN) console.warn(`  reflexo: ${(reflMs / reflN).toFixed(2)} ms de GPU · ${reflDraws} desenhos · ${(reflTris / 1e6).toFixed(2)}M triângulos · cena ${renderer.info.render.calls}`);
      reflMs = 0;
      reflN = 0;
      console.warn(`  listas: ${(batchMs / Math.max(1, frames)).toFixed(2)} ms/quadro em ${Math.round(batchCalls / Math.max(1, frames))} chamadas`);
      batchMs = 0;
      batchCalls = 0;
      frames = 0;
    }, 2000);
  }
}
