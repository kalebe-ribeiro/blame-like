// ─────────────────────────────────────────────────────────────────────────────
//  O gene de terminal da rede — o que é puro (o cofre, Gene-terminal). Pela seed:
//
//    os depósitos   a estrutura única 'vault' (gen/field.js): rara, só a mais de 40 km da
//                   origem; guardada (Safeguards altos) ou esquecida (Field.vaultGuarded)
//    a cadeia       cada depósito tem uma cadeia de CHAIN estruturas únicas: a mais longe a
//                   ~CHAIN·STEP km, a mais perto a ~STEP km. Ler o console de uma revela a
//                   seguinte (a última, o depósito); um arquivo de registros perto de uma
//                   cadeia revela o começo dela
//    esquecido e levado  num depósito esquecido, um andarilho que passou pode ter levado o
//                   gene (o território dele, perto) — a pista leva a um pedestal vazio
//    os portadores  humanos raros com o gene: um morador numa vila habitada (algumas) ou um
//                   andarilho (poucos) — só longe do começo
// ─────────────────────────────────────────────────────────────────────────────
import { hash4 } from './hash.js';
import { territoryAt, wandererOf } from './patrols.js';
import { villageInhabited } from './villages.js';

export const GENE = {
  chain: 5, // estruturas na cadeia
  step: 12000, // m entre elas
  archiveReach: 90000, // m: um arquivo revela o começo das cadeias até aqui
  takenP: 0.4, // um depósito esquecido: o gene foi levado por um andarilho
  villageCarrierP: 0.15, // uma vila habitada (longe) tem um portador
  wandererCarrierP: 0.06, // um andarilho (longe, humano) é portador
  carrierFrom: 30000, // m da origem: portadores só daqui para fora
};

const far = (x, z, R) => Math.hypot(x, z) > R;

/** Os depósitos perto de (x,y,z) GLOBAL. */
export function vaultsNear(F, x, y, z, R) {
  return F.uniquesNear(x, y, z, R).filter((u) => u.kind === 'vault');
}

const chains = new WeakMap();
/**
 * A cadeia de um depósito: as estruturas únicas, da mais longe (o começo) à mais perto; depois
 * delas, o depósito. Determinística (memorizada por Field).
 */
export function chainOf(F, v) {
  let m = chains.get(F);
  if (!m) chains.set(F, (m = new Map()));
  if (m.has(v.id)) return m.get(v.id);
  const ang = hash4(F.seed, Math.round(v.x), v.n, Math.round(v.z), 2200) * Math.PI * 2;
  const out = [];
  const used = new Set([v.id]);
  for (let k = GENE.chain; k >= 1; k--) {
    // um ponto na direção da cadeia, a k passos; a única mais perto dele (na mesma camada ±1)
    const a = ang + (hash4(F.seed, k, v.n, Math.round(v.x), 2201) - 0.5) * 0.6;
    const px = v.x + Math.cos(a) * k * GENE.step;
    const pz = v.z + Math.sin(a) * k * GENE.step;
    let best = null;
    for (const u of F.uniquesNear(px, v.y, pz, GENE.step * 0.9)) {
      if (used.has(u.id) || u.kind === 'vault') continue;
      const d = Math.hypot(u.x - px, u.z - pz) + Math.abs(u.y - v.y) * 0.3;
      if (!best || d < best.d) best = { u, d };
    }
    if (best) {
      used.add(best.u.id);
      out.push(best.u);
    }
  }
  m.set(v.id, out);
  return out;
}

/** A estrutura u é elo de alguma cadeia por perto? → [{ v, i }] (i: o índice na cadeia). */
export function linksOf(F, u, R = GENE.chain * GENE.step * 1.3) {
  const out = [];
  for (const v of vaultsNear(F, u.x, u.y, u.z, R)) {
    const ch = chainOf(F, v);
    const i = ch.findIndex((x) => x.id === u.id);
    if (i >= 0) out.push({ v, i });
  }
  return out;
}

/**
 * Num depósito esquecido, o gene foi levado? → o id do território do andarilho que o levou (que
 * passa ali perto), ou null (o gene está no pedestal).
 */
export function vaultTakenBy(F, v) {
  if (F.vaultGuarded(v) || hash4(F.seed, Math.round(v.x), v.n, Math.round(v.z), 988) >= GENE.takenP) return null;
  for (let q = 0; q < 8; q++) {
    const a = hash4(F.seed, q, v.n, Math.round(v.z), 2202) * Math.PI * 2;
    const r = 600 + hash4(F.seed, q, v.n, Math.round(v.x), 2203) * 1800;
    const t = territoryAt(F, v.x + Math.cos(a) * r, v.y + 5, v.z + Math.sin(a) * r);
    const w = wandererOf(F, t);
    if (w && !w.silicon) return t.id;
  }
  return null;
}

/** Numa vila habitada, quem carrega o gene: o índice do morador (0..3), ou -1. */
export function villageCarrier(F, u) {
  if (!villageInhabited(F, u) || !far(u.x, u.z, GENE.carrierFrom)) return -1;
  if (hash4(F.seed, Math.round(u.x), u.n, Math.round(u.z), 1995) >= GENE.villageCarrierP) return -1;
  return Math.floor(hash4(F.seed, Math.round(u.z), u.n, Math.round(u.x), 1996) * 4);
}

/** O andarilho do território t é portador do gene? (humano, longe) */
export function wandererCarrier(F, t, x, z) {
  const w = wandererOf(F, t);
  if (!w || w.silicon || !far(x, z, GENE.carrierFrom)) return false;
  const S = t.sector;
  return hash4(F.seed, S.i, t.slab, S.k, 1997) < GENE.wandererCarrierP;
}
