// ─────────────────────────────────────────────────────────────────────────────
//  Duas memórias (ver o cofre, Arquitetura-para-o-futuro):
//
//  • PERFIL (global, vale para todos os mundos): o modo ativo e, a partir da
//    fase 2, o léxico da língua antiga. As configurações ficam à parte
//    (ui/settings.js), mas também são do perfil.
//
//  • MUNDO SALVO (um por modo de jogo: Livre e Peregrinação): a seed, onde
//    você está, o diário, o rastro do mapa, o estado do corpo e — o que
//    importa para o futuro — O QUE MUDOU NO MUNDO. O mundo em si é a lei do
//    Field (determinística pela seed); o salvamento guarda só as diferenças,
//    por id estável (ex.: um terminal lido, um setor religado, uma porta
//    aberta; depois, o estado dos NPCs). Ver WorldState.
//
//  Um mundo não troca de modo: o modo é parte do salvamento.
//  Tudo em localStorage (no perfil do Electron, na máquina).
// ─────────────────────────────────────────────────────────────────────────────

export const MODE_IDS = ['free', 'pilgrimage'];

const PROFILE_KEY = 'cybercosmic.profile.v1';
const slotKey = (mode) => `cybercosmic.world.${mode}.v1`;
// salvamento antigo (antes dos modos): vira o mundo do modo Livre
const LEGACY = { save: 'cybercosmic.save.v1', diary: 'cybercosmic.diary.v1', trail: 'cybercosmic.trail.v1' };

const read = (k) => {
  try {
    const raw = localStorage.getItem(k);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
    return true;
  } catch {
    return false; // sem armazenamento, ou cheio
  }
};

// ── perfil ──────────────────────────────────────────────────────────────────

export function loadProfile() {
  return { activeMode: null, migrated: false, ...(read(PROFILE_KEY) ?? {}) };
}

export function storeProfile(p) {
  write(PROFILE_KEY, p);
}

// ── mundos salvos ───────────────────────────────────────────────────────────

/** Um mundo novo (ainda sem posição: começa no ponto de partida do modo). */
export function newSlot(mode, seed) {
  const now = Date.now();
  return { v: 1, mode, seed, pos: null, yaw: 0, pitch: 0, move: 'walk', diary: null, trail: null, player: null, changes: {}, created: now, updated: now };
}

export function loadSlot(mode) {
  const s = read(slotKey(mode));
  if (!s || typeof s.seed !== 'number' || s.mode !== mode) return null;
  s.changes ??= {};
  return s;
}

export function storeSlot(slot) {
  slot.updated = Date.now();
  // o rastro do mapa pode ficar grande: se não couber, salva sem ele
  if (!write(slotKey(slot.mode), slot)) write(slotKey(slot.mode), { ...slot, trail: null });
}

/** Leva o salvamento de antes dos modos para o mundo do modo Livre (uma vez). */
export function migrateLegacy(profile) {
  if (profile.migrated) return;
  profile.migrated = true;
  const old = read(LEGACY.save);
  if (old && typeof old.seed === 'number' && Array.isArray(old.pos) && !loadSlot('free')) {
    const slot = newSlot('free', old.seed);
    Object.assign(slot, { pos: old.pos, yaw: old.yaw ?? 0, pitch: old.pitch ?? 0, move: old.mode === 'fly' ? 'fly' : 'walk' });
    slot.diary = read(LEGACY.diary);
    const trail = read(LEGACY.trail);
    if (trail && trail.seed === old.seed) slot.trail = { pts: trail.pts ?? [], marks: trail.marks ?? [] };
    storeSlot(slot);
    profile.activeMode ??= 'free';
  }
  storeProfile(profile);
}

// ── o que mudou no mundo ────────────────────────────────────────────────────

/**
 * Diferenças do mundo salvo em relação à lei do Field, por **id estável**.
 * Ids estáveis saem das coordenadas no Field (ex.: terminais 'st:<linha>:<s>'
 * e 'ps:<camada>:<pi>:<pk>' em world/terminals.js) — nunca de contadores de
 * sessão, para continuarem valendo depois de recarregar o mundo.
 */
export class WorldState {
  constructor(slot) {
    this.slot = slot;
  }

  get(id) {
    return this.slot.changes[id];
  }

  set(id, value) {
    if (value === undefined) delete this.slot.changes[id];
    else this.slot.changes[id] = value;
  }
}
