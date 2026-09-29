// ─────────────────────────────────────────────────────────────────────────────
//  A travessia: salvamento (continuar de onde parou), diário e mapa.
//  Tudo vai para o mundo salvo do modo atual (ctx.slot — app/saves.js).
//  Só grava quando ctx.saving: o `npm start` normal com um mundo escolhido —
//  sessões de teste e de captura não tocam no seu salvamento.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { Diary } from '../ui/journey.js';
import { storeSlot } from './saves.js';
import { TrailMap } from '../ui/trailmap.js';
import { t } from '../i18n/index.js';

export function createTravel(ctx) {
  const { world, camera, controls } = ctx;
  const slot = ctx.slot;
  const diary = new Diary(slot.diary);
  const trail = new TrailMap();
  trail.load(slot.trail);
  const last = new THREE.Vector3();
  const g = new THREE.Vector3();
  let hasLast = false;
  let saveTimer = 0;
  let regionTimer = 0;

  function save() {
    if (!ctx.saving) return;
    world.toGlobal(camera.position, g);
    Object.assign(slot, {
      seed: ctx.seed,
      pos: [g.x, g.y, g.z],
      yaw: controls.yaw,
      pitch: controls.pitch,
      move: controls.mode,
      diary: diary.d,
      trail: trail.toJSON(),
      player: ctx.player,
    });
    storeSlot(slot);
  }
  window.addEventListener('beforeunload', save);

  /** Mostra o diário na tela de entrada. */
  function renderDiary() {
    const el = document.getElementById('gate-diary');
    if (!el) return;
    el.innerHTML = `<div class="diary-title">${t('diary.title')}</div>` +
      diary.lines().map(([k, v]) => `<div class="diary-row"><span>${k}</span><b>${v}</b></div>`).join('');
  }

  // o diário escuta o barramento (core/events.js)
  const { bus } = world;
  bus.on('outage:start', () => diary.add('outages'));
  bus.on('collapse:start', () => diary.add('collapses'));
  bus.on('player:board', () => diary.add('rides'));
  bus.on('player:fall', ({ height }) => {
    diary.fall(height);
    if (height > 40) trail.mark(world.toGlobal(camera.position, g), 'queda', height);
  });
  // o arquivo do mundo: cada registro lido (o texto é refeito do Field pelo lugar — ver lang/records.js)
  bus.on('player:read', ({ id, site }) => {
    slot.archive ??= { records: {} };
    slot.archive.records[id] ??= { x: site.x, y: site.y, z: site.z, kind: site.kind, at: Date.now() };
  });
  bus.on('player:photo', () => {
    diary.add('photos');
    trail.mark(world.toGlobal(camera.position, g), 'foto');
  });

  return {
    diary,
    trail,
    save,
    renderDiary,
    here: () => world.toGlobal(camera.position, new THREE.Vector3()),
    /** Mundo novo na hora (R, modo Livre): rastro e mudanças do mundo zerados; o diário continua. */
    newWorld() {
      hasLast = false;
      trail.load(null);
      slot.seed = ctx.seed;
      slot.changes = {};
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
