// ─────────────────────────────────────────────────────────────────────────────
//  A travessia: salvamento (continuar de onde parou), diário e mapa.
//  Só o `npm start` normal (ctx.persist) lê e grava — sessões de teste e de
//  captura não tocam no seu salvamento.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { storeSave, Diary } from '../ui/journey.js';
import { TrailMap } from '../ui/trailmap.js';

export function createTravel(ctx) {
  const { world, camera, controls } = ctx;
  const diary = new Diary(ctx.persist);
  const trail = new TrailMap(ctx.persist);
  trail.useSeed(ctx.seed);
  const last = new THREE.Vector3();
  const g = new THREE.Vector3();
  let hasLast = false;
  let saveTimer = 0;
  let regionTimer = 0;

  function save() {
    if (!ctx.persist) return;
    world.toGlobal(camera.position, g);
    storeSave({ seed: ctx.seed, pos: [g.x, g.y, g.z], yaw: controls.yaw, pitch: controls.pitch, mode: controls.mode });
    diary.save();
    trail.save();
  }
  window.addEventListener('beforeunload', save);

  /** Mostra o diário na tela de entrada. */
  function renderDiary() {
    const el = document.getElementById('gate-diary');
    if (!el) return;
    el.innerHTML = '<div class="diary-title">DIÁRIO DA TRAVESSIA</div>' +
      diary.lines().map(([k, v]) => `<div class="diary-row"><span>${k}</span><b>${v}</b></div>`).join('');
  }

  return {
    diary,
    trail,
    save,
    renderDiary,
    here: () => world.toGlobal(camera.position, new THREE.Vector3()),
    fell(height) {
      diary.fall(height);
      if (height > 40) trail.mark(world.toGlobal(camera.position, g), 'queda', height);
    },
    boarded: () => diary.add('rides'),
    witnessed: (what) => diary.add(what),
    photographed() {
      diary.add('photos');
      trail.mark(world.toGlobal(camera.position, g), 'foto');
    },
    /** Mundo novo: rastro novo, nada de "salto" contado como distância. */
    newWorld() {
      hasLast = false;
      trail.useSeed(ctx.seed);
    },
    update(dt) {
      world.toGlobal(camera.position, g);
      if (hasLast) {
        const d = g.distanceTo(last);
        // saltos (transporte, novo mundo) não contam
        if (d < 120 * Math.max(dt, 1 / 60)) {
          const horiz = Math.hypot(g.x - last.x, g.z - last.z);
          if (world.transit.riding) diary.add('rode', horiz);
          else if (controls.mode === 'fly') diary.add('flown', d);
          else diary.add('walked', horiz);
        }
      }
      last.copy(g);
      hasLast = true;
      trail.record(g, world.transit.riding ? 1 : 0);
      diary.altitude(g.y);
      if (controls.locked) diary.add('time', dt);
      regionTimer -= dt;
      if (regionTimer <= 0) {
        regionTimer = 1;
        diary.region(world.regionAt(camera.position));
      }
      saveTimer -= dt;
      if (saveTimer <= 0) {
        saveTimer = 5;
        save();
      }
    },
  };
}
