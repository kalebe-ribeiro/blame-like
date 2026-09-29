// ─────────────────────────────────────────────────────────────────────────────
//  O que os terminais dizem — na língua antiga, em tokens (lang/ancient.js).
//
//  Tudo é função pura de (seed, id do terminal) + fatos do Field: o setor
//  citado é o setor de verdade, o nível conta as camadas de verdade. Os
//  códigos seguem o endereçamento irregular da Cidade (ver o cofre,
//  Enderecamento-da-Cidade): formatos que mudam de setor para setor.
//
//  Tipos de linha: manutenção adiada, falhas, energia, contagens, avisos,
//  a burocracia da rede (gene, acesso) — e, raramente, fragmentos de quem
//  construiu tudo e se perdeu na própria obra. Em parte dos terminais, uma
//  ROTA: o endereço de outro lugar — uma pista (lang/leads.js).
// ─────────────────────────────────────────────────────────────────────────────
import { hash4, rngAt } from '../gen/hash.js';
import { MEGA } from '../gen/field.js';
import { SCRIPT } from './ancient.js';
import { leadFor, leadLine } from './leads.js';

const W = (w) => ({ w });
const N = (n) => ({ n: String(n) });
const P = (p) => ({ p });
const num = (n) => Math.round(n).toString();

/** Código de um setor: formatos diferentes de setor para setor (nada "certinho"). */
export function sectorCode(field, sector) {
  const h = hash4(field.seed, sector.i, sector.band, sector.k, 920);
  const n = Math.floor(hash4(field.seed, sector.i, sector.band, sector.k, 921) * 100000);
  if (h < 0.45) return { c: [Math.floor(h * 1000) % SCRIPT.length, String(n % 1000).padStart(2, '0')] };
  if (h < 0.8) return N(String(n % 100000).padStart(4, '0'));
  return { c: [Math.floor(h * 7919) % SCRIPT.length, `${n % 100}.${(n >> 7) % 10}`] };
}

/** Nível: conta as camadas — mas cada região conta a partir de uma camada diferente. */
export function levelNumber(field, band, x, z) {
  const off = Math.floor(hash4(field.seed, Math.floor(x / 12000), 0, Math.floor(z / 12000), 922) * 40) - 20;
  return band - off;
}

const RULE = [P('──────────────────')];

function pool(r, field, here) {
  const code = () => ({ c: [r.int(0, SCRIPT.length - 1), num(r.int(10, 9999))] });
  return [
    () => [W('MAINTENANCE'), W(r.pick(['POSTPONED', 'SUSPENDED'])), P('·'), N(num(r.int(40000, 9000000))), W('CYCLES')],
    () => [W('VALVE'), code(), W('REPLACEMENT'), W('POSTPONED'), P('·'), N(num(r.int(300, 90000))), W('DAYS')],
    () => [W('CABLE'), code(), W('FAILURE'), P('·'), W('LOAD'), N(`${r.int(0, 140)}%`)],
    () => [W('REGISTERED'), W('INHABITANTS'), W('IN'), W('SECTOR'), P(':'), N('0')],
    () => [W('ACCESS'), W('AUTHORIZED'), P(':'), W('NONE')],
    () => [W('NET'), W('TERMINAL'), W('GENE'), P(':'), W('NO'), W('DETECTED')],
    () => [W('POWER'), P(':'), N(`${r.int(3, 61)}%`), P('·'), W('GRID'), W(r.pick(['UNSTABLE', 'DARK', 'DAMAGED']))],
    () => [W('CONSTRUCTION'), W('IN'), W('WORK'), P('·'), W('DEADLINE'), P(':'), P('∞')],
    () => [W('SECTOR'), sectorCode(field, here.near(r)), W('DARK'), P('·'), W('RESTORE'), W('SCHEDULED'), P(':'), W('NONE')],
    () => [W('WARNING'), P(':'), W('LAYER'), N(num(r.int(2, 90))), W('IMPASSABLE')],
    () => [W('NEXT'), W('PASSAGE'), P(':'), N(r.float(1.5, 40).toFixed(1)), P('KM')],
    () => [W('REQUEST'), code(), P('·'), W('REPLY'), W('NONE'), P('·'), N(num(r.int(300, 90000))), W('DAYS')],
    () => [W('FLOOR'), W('COUNT'), P(':'), N(num(r.int(1e5, 9e6))), P('·'), W('INCOMPLETE')],
    () => [W('RECORD'), W('DAMAGED'), P('·'), W('RECOVERY'), N(`${r.int(0, 12)}%`)],
    () => [W('OBJECT'), W('UNCATALOGUED'), P('·'), W('LEVEL'), N(num(r.int(1000, 900000)))],
    () => [W('ROUTE'), W('ALTERNATE'), P(':'), W('NONE')],
    () => [W('NOTICE'), P(':'), W('ILLEGAL'), W('RESIDENT'), W('DETECTED'), P('·'), W('SAFEGUARD'), W('SIGNAL')],
    () => [W('BUILDERS'), P(':'), W('SITE'), code(), P('·'), W('WORK'), W('SUSPENDED')],
  ];
}

// fragmentos de quem se perdeu (raros; só fazem sentido com a tradução avançada)
const HISTORY = [
  [W('WE'), W('BUILT'), W('CITY'), W('WITHOUT'), W('END')],
  [W('CITY'), W('GROW'), W('ALWAYS'), P('·'), W('WE'), W('CANNOT'), W('STOP')],
  [W('BEFORE'), W('WE'), W('WANTED'), W('MORE')],
  [W('AFTER'), W('WE'), W('WANTED'), W('EVERYTHING')],
  [W('THEY'), W('FORGOT'), W('KEY'), P('·'), W('KEY'), W('LOST')],
  [W('NAME'), W('LOST'), P('·'), W('HUMAN'), W('NO'), W('REGISTERED')],
  [W('CHILDREN'), W('AFTER'), W('WE'), P('·'), W('ACCESS'), W('NONE')],
  [W('HERE'), W('REMAINS'), W('NOBODY')],
  [W('NET'), W('GENE'), W('LOST'), P('·'), W('NETSPHERE'), W('WITHOUT'), W('HUMAN')],
  [W('AUTHORITY'), W('WITHOUT'), W('HUMAN'), P('·'), W('SAFEGUARD'), W('ALWAYS')],
];

/**
 * Os registros de um terminal: linhas de tokens.
 * site: { id, x, y, z, kind: 'station'|'passage', … } (world/terminals.js)
 */
export function terminalRecords(field, site) {
  const r = rngAt(field.seed, Math.round(site.x), Math.round(site.y), Math.round(site.z), 950);
  const sector = field.sectorAt(site.x, site.y, site.z);
  const here = {
    near: (rr) => field.sectorAt(site.x + rr.float(-3000, 3000), site.y, site.z + rr.float(-3000, 3000)),
  };
  const lines = [];
  lines.push([W('TERMINAL'), { c: [r.int(0, SCRIPT.length - 1), num(r.int(100, 9999))] }, P('·'), W('SECTOR'), sectorCode(field, sector)]);
  lines.push(RULE);
  if (site.kind === 'unique') {
    // as estruturas únicas: ainda há energia aqui — e mais para contar
    const u = site.unique;
    const code = { c: [r.int(0, SCRIPT.length - 1), num(r.int(10, 99))] };
    if (u.kind === 'console') {
      lines.push([W('TERMINAL'), W('ACTIVE'), P('·'), W('POWER'), W('OWN')]);
      lines.push([W('POWER'), W('RESERVE'), P(':'), N(`${r.int(4, 31)}%`), P('·'), N(num(r.int(2e5, 9e7))), W('CYCLES')]);
    } else if (u.kind === 'archive') {
      lines.push([W('ARCHIVE'), code, P('·'), W('RECORD'), W('COUNT'), P(':'), N(num(r.int(1e6, 9e8)))]);
      lines.push([W('RECORD'), W('DAMAGED'), P(':'), N(`${r.int(60, 99)}%`), P('·'), W('RECOVERY'), W('IN'), W('WORK')]);
    } else {
      lines.push([W('PLANT'), code, P('·'), W('STATUS'), P(':'), W('ACTIVE')]);
      lines.push([W('OUTPUT'), P(':'), N(`${r.int(1, 9)}%`), P('·'), W('GRID'), W('SECTOR'), sectorCode(field, sector), W('DARK')]);
    }
    lines.push([W('LEVEL'), N(levelNumber(field, Math.floor((site.y - MEGA.barrierTop0) / MEGA.barrier) + 1, site.x, site.z))]);
  }
  if (site.kind === 'passage') {
    const band = Math.floor((site.y - MEGA.barrierTop0) / MEGA.barrier) + 1;
    lines.push([W('ELEVATOR'), W('PASSAGE'), P('·'), W('LAYER'), N(levelNumber(field, band, site.x, site.z))]);
    lines.push([W('LAYER'), P(':'), N(`${MEGA.barrierThick} M`), P('·'), W('IMPASSABLE')]);
  }
  const p = pool(r, field, here);
  const n = 6 + r.int(0, 4);
  for (let i = 0; i < n; i++) lines.push(r.pick(p)());
  // a pista (lang/leads.js): o endereço de outro lugar que existe — nem todo terminal tem
  const lead = leadFor(field, site);
  if (lead) lines.splice(Math.min(lines.length, 3 + r.int(1, 4)), 0, leadLine(field, lead));
  // um terminal em ~8 guarda um fragmento (nas únicas, sempre)
  if (site.kind === 'unique' || hash4(field.seed, Math.round(site.x), Math.round(site.z), 0, 951) < 0.12) {
    lines.push(RULE);
    const k = r.int(1, 3);
    for (let i = 0; i < k; i++) lines.push(r.pick(HISTORY));
  }
  return lines;
}
