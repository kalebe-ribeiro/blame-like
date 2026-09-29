// ─────────────────────────────────────────────────────────────────────────────
//  Sons do mundo e os acontecimentos que eles anunciam: apagões de setor,
//  colapsos distantes, obras dos Construtores, gotas, a cascata mais próxima
//  e o tamanho do espaço (reverberação). Também a interface e a vibração que
//  acompanham cada acontecimento.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';

/** Nome de setor "mal traduzido" para os avisos. */
const sectorName = (ev) => ((Math.abs(Math.round(ev.c.x / 97) * 131 + Math.round(ev.c.z / 89) * 7) + ev.id) % 4096).toString(16).toUpperCase().padStart(3, '0');

export function createWorldSound(ctx) {
  const { world, audio, hud, controls, camera } = ctx;
  let spaceTimer = 0;
  let sawColossus = false;
  const g = new THREE.Vector3();

  // os acontecimentos do mundo chegam pelo barramento (core/events.js); ele
  // sobrevive a um mundo novo, então basta escutar uma vez
  const { bus } = world;
  bus.on('outage:start', (ev) => {
    audio.powerDown(...ctx.placeOf(ev.c.x, ev.c.y, ev.c.z), ev.maxR);
    controls.rumble(0.25, 0.1, 300);
    hud.push(t('hud.outage.start', { sector: sectorName(ev) }));
  });
  bus.on('outage:restore', (ev) => {
    audio.powerUp(...ctx.placeOf(ev.c.x, ev.c.y, ev.c.z), ev.maxR);
    hud.push(t('hud.outage.restore', { sector: sectorName(ev) }));
  });
  bus.on('collapse:start', (ev) => {
    const [pan, dist] = ctx.placeOf(ev.pos.x, ev.pos.y, ev.pos.z);
    audio.collapseStart(pan, dist, ev.delay);
    hud.push(t('hud.collapse'));
  });
  bus.on('collapse:impact', (ev) => {
    const [pan, dist] = ctx.placeOf(ev.pos.x, ev.pos.y, ev.pos.z);
    audio.collapseImpact(pan, dist);
    setTimeout(() => controls.rumble(Math.max(0, 0.6 - dist / 800), 0.3, 700), Math.min(dist, 3000) / 0.34);
  });
  bus.on('drip', (ev) => audio.dripAt(...ctx.placeOf(ev.x, ev.y, ev.z)));
  // obras dos Construtores: marteladas e solda, onde acontecem
  bus.on('builder:work', (ev) => {
    const [pan, dist] = ctx.placeOf(ev.x, ev.y, ev.z);
    if (ev.kind === 'clang') audio.clangAt(pan, dist);
    else audio.weldAt(pan, dist);
  });
  // máquinas colossais: o baque das garras; perto, o chão treme junto
  bus.on('colossus:clamp', (ev) => {
    const [pan, dist] = ctx.placeOf(ev.x, ev.y, ev.z);
    audio.colossusClamp(pan, dist);
    if (dist < 900) setTimeout(() => controls.rumble(0.5 * (1 - dist / 900), 0.2, 400), dist / 0.34);
    if (dist < 1500 && !sawColossus) {
      sawColossus = true;
      hud.push(t('hud.colossus'));
    }
  });

  return {
    update(dt) {
      spaceTimer -= dt;
      if (spaceTimer > 0) return;
      spaceTimer = 0.5;
      audio.setSpace(world.spaceSize(camera.position));
      audio.region = world.regionAt(camera.position); // a harmonia da trilha
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
