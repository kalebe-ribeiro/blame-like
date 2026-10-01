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
import { renderArchive } from '../ui/archive.js';
import { leadLine, areaDistance } from '../lang/leads.js';
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
      entities: ctx.beings?.serialize() ?? [],
      holes: world.holes?.serialize() ?? [],
    });
    storeSlot(slot);
  }
  window.addEventListener('beforeunload', save);

  /** Mostra o diário (e o arquivo: registros lidos, léxico) na tela de entrada. */
  function renderDiary() {
    const el = document.getElementById('gate-diary');
    if (!el) return;
    const here = world.toGlobal(camera.position, new THREE.Vector3());
    // as pistas (Peregrinação): a rota refeita do Field, com as partes que você tem
    const leads = ctx.rules.leads
      ? ctx.leads.list().map(([id, rec]) => {
          const a = ctx.leads.area(rec);
          return { tokens: leadLine(world.field, { id, ...rec }, rec.parts), open: rec.state === 'open', dist: areaDistance(a, here), r: a.r, ring: a.ring ?? null };
        })
      : null;
    renderArchive(el, {
      lines: diary.lines(),
      records: slot.archive?.records ?? {},
      leads,
      lexicon: ctx.lexicon,
      here,
      onOpen: (id, rec) => ctx.reading.showArchived(id, rec),
    });
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
  // setor religado: o mapa passa a mostrá-lo como seu
  bus.on('sector:restore', ({ sector, x, y, z }) => {
    slot.sectors ??= {};
    slot.sectors[sector] = { ...(slot.sectors[sector] ?? { x: Math.round(x), y: Math.round(y), z: Math.round(z) }), state: 'restored' };
    diary.add('restored');
  });
  bus.on('player:read', ({ id, site }) => {
    slot.archive ??= { records: {} };
    slot.archive.records[id] ??= { x: site.x, y: site.y, z: site.z, kind: site.kind === 'unique' ? `unique:${site.unique.kind}` : site.kind, at: Date.now() };
  });
  bus.on('player:photo', () => {
    diary.add('photos');
    trail.mark(world.toGlobal(camera.position, g), 'foto');
  });

  /** As descobertas deste mundo, para o mapa (ui/trailmap.js → setFound). */
  function found() {
    const places = Object.values(slot.archive?.records ?? {}).map((r) => ({ x: r.x, y: r.y, z: r.z, unique: r.kind.startsWith('unique') }));
    const leads = ctx.rules.leads
      ? ctx.leads.list().map(([id, rec]) => {
          const a = ctx.leads.area(rec);
          return { x: a.x, y: a.y, z: a.z, r: a.r, ring: a.ring ?? null, open: rec.state === 'open', tokens: leadLine(world.field, { id, ...rec }, rec.parts) };
        })
      : [];
    const sectors = Object.values(slot.sectors ?? {});
    const marks = (slot.marks ?? []).map((m) => ({ x: m.x, y: m.y, z: m.z, dx: m.dx, dz: m.dz, shared: !!m.shared }));
    const builders = Object.values(slot.builderSites ?? {});
    // as cargas: o lugar de entrega (◇)
    const cargo = ctx.player.carried.filter((c) => c.kind === 'cargo').map((c) => ({ x: c.x, y: c.y, z: c.z, label: t('map.cargoTo', { what: t(`cargo.what.${c.what ?? 0}`) }) }));
    return { places, leads, sectors, marks, builders, cargo, ...(ctx.rules.leads ? { known: (w) => ctx.lexicon.known(w), word: (w) => t(`word.${w}`) } : {}) };
  }

  return {
    diary,
    trail,
    save,
    renderDiary,
    found,
    here: () => world.toGlobal(camera.position, new THREE.Vector3()),
    /** Mundo novo na hora (R, modo Livre): rastro e mudanças do mundo zerados; o diário continua. */
    newWorld() {
      hasLast = false;
      trail.load(null);
      slot.seed = ctx.seed;
      slot.changes = {};
      slot.leads = {};
      slot.marks = [];
      slot.uniques = {};
      slot.builderSites = {};
      slot.boosts = {};
      slot.sectors = {};
      slot.entities = [];
      slot.holes = [];
      world.holes?.load([]);
      ctx.alert?.reset();
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
        // o setor em que você está (para o mapa): guardado uma vez, onde você entrou nele
        const s = world.field.sectorAt(g.x, g.y, g.z);
        slot.sectors ??= {};
        if (!slot.sectors[s.id] && Object.keys(slot.sectors).length < 3000) slot.sectors[s.id] = { x: Math.round(g.x), y: Math.round(g.y), z: Math.round(g.z), state: s.state };
      }
      saveTimer -= dt;
      if (saveTimer <= 0) {
        saveTimer = 5;
        save();
      }
    },
  };
}
