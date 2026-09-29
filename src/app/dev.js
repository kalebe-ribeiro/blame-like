// ─────────────────────────────────────────────────────────────────────────────
//  Flags de desenvolvimento (ver main.js): --goto, --outage, --collapse,
//  --stats e --check (teste de fumaça). Nada disso roda no `npm start` normal.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export function setupDev(ctx) {
  const { params, world, camera, renderer } = ctx;
  const trigger = (system) => system.trigger(world.toGlobal(camera.position), camera.getWorldDirection(new THREE.Vector3()), ctx.time);

  // --goto=construtores (ou qualquer tipo do painel de transporte)
  if (params.get('goto')) ctx.ui.teleport(params.get('goto'), params.get('goto'));
  // --outage=4 / --collapse=4: força o acontecimento aos N segundos
  if (params.get('outage')) setTimeout(() => trigger(world.outages), Number(params.get('outage')) * 1000);
  if (params.get('collapse')) setTimeout(() => trigger(world.collapses), Number(params.get('collapse')) * 1000);

  // --check: roteiro automático por todos os destinos (npm run check)
  if (params.get('check')) {
    import('../dev/check.js').then((m) => m.runCheck({ teleport: ctx.ui.teleport, world, controls: ctx.controls, camera, THREE, getTime: () => ctx.time, only: params.get('check') }));
  }

  // --stats: FPS e streaming no terminal a cada 2 s
  if (params.get('stats')) {
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
      console.warn(
        `fps=${(frames / 2).toFixed(0)} chunks=${s.chunks} lod1=${s.lod1} lod2=${s.lod2} macro=${s.macro} fila=${s.pending} ` +
          `lotes=${world.batches.stats.pages} draws=${info.calls} tris=${(info.triangles / 1e6).toFixed(2)}M pos=${g.x.toFixed(0)},${g.y.toFixed(0)},${g.z.toFixed(0)} região=${world.regionAt(camera.position)}`,
      );
      frames = 0;
    }, 2000);
  }
}
