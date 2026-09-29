// ─────────────────────────────────────────────────────────────────────────────
//  Sons do mundo e os acontecimentos que eles anunciam: apagões de setor,
//  colapsos distantes, obras dos Construtores, gotas, a cascata mais próxima
//  e o tamanho do espaço (reverberação). Também a interface e a vibração que
//  acompanham cada acontecimento.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

/** Nome de setor "mal traduzido" para os avisos. */
const sectorName = (ev) => ((Math.abs(Math.round(ev.c.x / 97) * 131 + Math.round(ev.c.z / 89) * 7) + ev.id) % 4096).toString(16).toUpperCase().padStart(3, '0');

export function createWorldSound(ctx) {
  const { world, audio, hud, controls, camera } = ctx;
  let spaceTimer = 0;
  const g = new THREE.Vector3();

  /** Liga os acontecimentos do mundo atual (chamado de novo a cada mundo novo). */
  function wire() {
    world.outages.onStart = (ev) => {
      audio.powerDown(...ctx.placeOf(ev.c.x, ev.c.y, ev.c.z), ev.maxR);
      controls.rumble(0.25, 0.1, 300);
      ctx.travel.witnessed('outages');
      hud.push(`SETOR 0x${sectorName(ev)} :: ENERGIA INTERROMPIDA`);
    };
    world.outages.onRestore = (ev) => {
      audio.powerUp(...ctx.placeOf(ev.c.x, ev.c.y, ev.c.z), ev.maxR);
      hud.push(`SETOR 0x${sectorName(ev)} :: RELIGAMENTO EM CASCATA`);
    };
    world.collapses.onStart = (ev) => {
      const [pan, dist] = ctx.placeOf(ev.pos.x, ev.pos.y, ev.pos.z);
      audio.collapseStart(pan, dist, ev.delay);
      ctx.travel.witnessed('collapses');
      hud.push('ESTRUTURA COMPROMETIDA :: desprendimento registrado');
    };
    world.collapses.onImpact = (ev) => {
      const [pan, dist] = ctx.placeOf(ev.pos.x, ev.pos.y, ev.pos.z);
      audio.collapseImpact(pan, dist);
      setTimeout(() => controls.rumble(Math.max(0, 0.6 - dist / 800), 0.3, 700), Math.min(dist, 3000) / 0.34);
    };
    world.particles.onDrip = (x, y, z) => audio.dripAt(...ctx.placeOf(x, y, z));
  }
  wire();

  return {
    wire,
    update(dt) {
      // obras dos Construtores: marteladas e solda, onde acontecem
      for (const ev of world.builders.events.splice(0)) {
        const [pan, dist] = ctx.placeOf(ev.x, ev.y, ev.z);
        if (ev.kind === 'clang') audio.clangAt(pan, dist);
        else audio.weldAt(pan, dist);
      }
      spaceTimer -= dt;
      if (spaceTimer > 0) return;
      spaceTimer = 0.5;
      audio.setSpace(world.spaceSize(camera.position));
      // rugido da cascata mais próxima (distância até a coluna d'água)
      world.toGlobal(camera.position, g);
      let best = Infinity;
      let bp = null;
      for (const c of world.field.cascadesNear(g.x, g.y, g.z, 900)) {
        const col = world.field.cascadeColumn(c);
        const y = Math.min(c.out.y, Math.max(c.bottom, g.y));
        const d = Math.hypot(g.x - col.x, g.y - y, g.z - col.z);
        if (d < best) {
          best = d;
          bp = [col.x, y, col.z];
        }
      }
      audio.setWaterfall(bp ? ctx.placeOf(...bp)[0] : 0, best);
    },
  };
}
