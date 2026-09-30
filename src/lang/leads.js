// ─────────────────────────────────────────────────────────────────────────────
//  Pistas (ver o cofre, Pistas): um terminal cita o endereço de outro lugar
//  que EXISTE — e você decide seguir.
//
//  Tudo é função pura de (seed, terminal) + Field:
//
//  • O alvo de cada terminal comum é a estrutura única mais próxima (o "fim
//    da cadeia"). Longe dela, o terminal cita outro terminal ~2–3 km mais
//    perto dela (um elo); perto (< 4,5 km), cita a própria estrutura.
//    Cada elo recalcula a própria única mais próxima — quase sempre a mesma;
//    as cadeias convergem para alguma única, nunca voltam nem morrem.
//  • O console de uma estrutura única cita um terminal a 40–55% do
//    caminho até a próxima única — a próxima cadeia começa lá. De única em
//    única, as cadeias seguem uma "correnteza" (uma direção por seed): nunca
//    voltam para onde já estiveram, e nunca acabam.
//  • Nem todo terminal cita alguém (~40%); os elos, sempre (só terminais que
//    citam são escolhidos como elo); o primeiro terminal de um mundo da
//    Peregrinação, sempre (startSite).
//
//  A linha da pista tem três partes — SETOR (o código da Cidade), NÍVEL e
//  DISTÂNCIA (a partir de quem cita). Um terminal com energia mostra tudo; o
//  leitor portátil arranca só uma ou duas partes. A DISTÂNCIA é um número
//  (sempre legível): vale logo, e sozinha vira um ANEL em volta de quem citou.
//  SETOR e NÍVEL só valem quando a palavra já foi entendida (léxico): é assim
//  que a área de incerteza encolhe (leadArea).
// ─────────────────────────────────────────────────────────────────────────────
import { hash4, rngAt } from '../gen/hash.js';
import { MEGA } from '../gen/field.js';
import { terminalSitesNear, uniqueTerminal, standBefore, setStartSiteFn, substationFor, hatchTerminal } from '../gen/sites.js';
import { sectorCode, levelNumber } from './records.js';

export const LEAD = {
  prob: 0.4, // terminais comuns que citam alguém
  step: [2000, 3200], // m até o próximo elo
  reach: 1400, // m em volta do ponto procurado
  finish: 4500, // mais perto que isso da única: cita a própria única
  search: 40000, // m: até onde procurar a única
  salt: 990,
};

/** As partes de uma pista e a palavra que torna cada uma legível. */
export const PARTS = { sector: 'SECTOR', level: 'LEVEL', dist: 'DISTANCE' };

const W = (w) => ({ w });
const N = (n) => ({ n: String(n) });
const P = (p) => ({ p });
const HIDDEN = P('▒▒▒');
const d3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

const cache = new Map(); // `${seed}|${id}` → lead | null
const starts = new WeakMap(); // Field → site

/**
 * A correnteza: uma direção por seed. De uma única, a cadeia só segue para uma
 * única pelo menos 3 km mais adiante nela — nunca volta, e sempre há uma
 * próxima (a Cidade não acaba). O jogador não vê a direção: as cadeias só
 * parecem ir "para algum lugar".
 */
const drift = (F, p) => {
  const a = hash4(F.seed, 0, 0, 0, LEAD.salt + 3) * Math.PI * 2;
  return p.x * Math.cos(a) + p.z * Math.sin(a);
};

/** A única mais próxima de p (after: só as mais adiante na correnteza que esta). */
function nearestUnique(F, p, after = null) {
  let best = null;
  let bd = Infinity;
  const d0 = after ? drift(F, after) + 3000 : -Infinity;
  for (const u of F.uniquesNear(p.x, p.y, p.z, LEAD.search)) {
    if (after && (u.id === after.id || drift(F, u) < d0)) continue;
    const c = F.uniqueConsole(u);
    const d = d3(c, p);
    if (d < bd) {
      bd = d;
      best = u;
    }
  }
  return best;
}

/** O sorteio: este terminal comum cita alguém? */
const citesByChance = (F, s) => hash4(F.seed, Math.round(s.x), Math.round(s.y), Math.round(s.z), LEAD.salt) < LEAD.prob;

/**
 * A pista que um terminal cita: { id, x, y, z, kind, uniqueKind?, from: {id,x,y,z} } ou null.
 * opts.force: cita alguém mesmo que o sorteio diga que não (o começo do mundo).
 */
export function leadFor(F, site, opts = {}) {
  const key = `${F.seed}|${site.id}|${opts.force ? 1 : 0}`;
  if (cache.has(key)) return cache.get(key);
  if (cache.size > 4000) cache.clear();
  let lead = null;
  const cites = site.kind === 'unique' || opts.force || citesByChance(F, site) || startSite(F)?.id === site.id;
  if (cites) lead = findLead(F, site);
  cache.set(key, lead);
  return lead;
}

function findLead(F, site) {
  const r = rngAt(F.seed, Math.round(site.x), Math.round(site.y), Math.round(site.z), LEAD.salt + 1);
  const home = site.kind === 'unique' ? site.unique : null;
  const goal = nearestUnique(F, site, home);
  if (!goal) return null;
  const gt = uniqueTerminal(F, goal);
  const d = d3(site, gt);
  const target = (t) => ({
    id: t.id,
    x: t.x,
    y: t.y,
    z: t.z,
    kind: t.kind,
    ...(t.kind === 'unique' ? { uniqueKind: t.unique.kind } : {}),
    from: { id: site.id, x: site.x, y: site.y, z: site.z },
  });
  if (d < LEAD.finish) return target(gt);
  // o ponto procurado: um passo na direção da única (do console: 40–55% do caminho);
  // se ali não houver um terminal que sirva, tenta outros pontos
  for (let tries = 0; tries < 6; tries++) {
    const step = home ? d * r.float(0.4, 0.55) : r.float(...LEAD.step);
    const a = r.float(-0.35, 0.35) * (tries < 3 ? 1 : 2); // nada "certinho": o elo nunca está exatamente no caminho
    const dx = (gt.x - site.x) / d;
    const dz = (gt.z - site.z) / d;
    const want = {
      x: site.x + (dx * Math.cos(a) - dz * Math.sin(a)) * step,
      y: site.y + ((gt.y - site.y) / d) * step,
      z: site.z + (dx * Math.sin(a) + dz * Math.cos(a)) * step,
    };
    let best = null;
    let bd = Infinity;
    for (const c of terminalSitesNear(F, want.x, want.y, want.z, LEAD.reach)) {
      if (c.id === site.id || c.kind === 'unique') continue;
      if (!citesByChance(F, c)) continue; // um elo sempre cita o próximo: a cadeia não morre no meio
      if (d3(c, gt) > d - 800) continue; // cada elo precisa chegar mais perto
      // do console: o elo já tem de estar do lado da próxima única
      if (home && nearestUnique(F, c)?.id !== goal.id) continue;
      const dw = d3(c, want);
      if (dw < bd) {
        bd = dw;
        best = c;
      }
    }
    if (best) return target(best);
  }
  return null;
}

/**
 * O primeiro terminal de um mundo da Peregrinação (ver o cofre, Inicio-do-mundo):
 * um terminal de estação morto (setor apagado), num lugar diferente por seed,
 * que cita alguém. { site, stand: {x,y,z} (pés), yaw } ou null.
 */
export function startSite(F) {
  if (starts.has(F)) return starts.get(F)?.site ?? null;
  starts.set(F, null); // (leadFor → startSite, durante a própria procura)
  const r = rngAt(F.seed, 0, 0, 0, LEAD.salt + 2);
  let found = null;
  for (let tries = 0; tries < 24 && !found; tries++) {
    // longe da ponte do modo Livre, entre as camadas perto do começo
    const ang = r.float(0, Math.PI * 2);
    const dist = r.float(3000, 20000);
    const x = Math.cos(ang) * dist;
    const z = Math.sin(ang) * dist;
    const y = r.float(-1200, 1200);
    if (F.inBarrier(y, 40)) continue;
    const sites = terminalSitesNear(F, x, y, z, 1600)
      .filter((s) => s.kind === 'station' && F.sectorAt(s.x, s.y, s.z, true).state === 'dark' && !F.inBarrier(s.y, 10))
      .sort((a, b) => d3(a, { x, y, z }) - d3(b, { x, y, z }));
    for (const s of sites.slice(0, 4)) {
      if (!leadFor(F, s, { force: true })) continue;
      found = { site: s, stand: standBefore(s), yaw: s.yaw }; // de frente para a tela
      break;
    }
  }
  starts.set(F, found);
  return found?.site ?? null;
}

/** O começo inteiro (onde ficar de pé e para onde olhar), ou null. */
export function startPlace(F) {
  startSite(F);
  return starts.get(F);
}

// ── a linha da pista ────────────────────────────────────────────────────────

function kindWords(lead) {
  if (lead.kind === 'substation') return [W('SUBSTATION')];
  if (lead.kind === 'hatch') return [W('MACHINE'), W('ACCESS')];
  if (lead.kind === 'station') return [W('STATION'), W('TERMINAL')];
  if (lead.kind === 'passage') return [W('PASSAGE'), W('TERMINAL')];
  if (lead.uniqueKind === 'archive') return [W('ARCHIVE')];
  if (lead.uniqueKind === 'plant') return [W('PLANT')];
  if (lead.uniqueKind === 'builders') return [W('BUILDERS'), W('TERMINAL')];
  if (lead.uniqueKind === 'antenna') return [W('SIGNAL'), W('TERMINAL')];
  if (lead.uniqueKind === 'village') return [W('INHABITANTS'), W('HALL')];
  if (lead.uniqueKind === 'graveyard') return [W('RESIDENT'), W('ILLEGAL'), W('SITE')];
  if (lead.uniqueKind === 'cradle') return [W('SAFEGUARD'), W('CONSTRUCTION')];
  return [W('TERMINAL'), W('ACTIVE')];
}

/** As partes da pista, em tokens: { sector, level, dist }. */
export function leadPartTokens(F, lead) {
  const band = Math.floor((lead.y - MEGA.barrierTop0) / MEGA.barrier) + 1;
  const km = d3(lead, lead.from) / 1000;
  return {
    sector: [W('SECTOR'), sectorCode(F, F.sectorAt(lead.x, lead.y + 1, lead.z))],
    level: [W('LEVEL'), N(levelNumber(F, band, lead.x, lead.z))],
    dist: [W('DISTANCE'), N(km.toFixed(1)), P('KM')],
  };
}

/**
 * A linha que o terminal mostra: ROTA : <o que> · SETOR … · NÍVEL … · DISTÂNCIA … KM.
 * shown: as partes visíveis (as outras saem apagadas). A linha leva .lead e .parts.
 */
export function leadLine(F, lead, shown = Object.keys(PARTS)) {
  const parts = leadPartTokens(F, lead);
  const line = [W('ROUTE'), P(':'), ...kindWords(lead)];
  for (const k of Object.keys(PARTS)) {
    line.push(P('·'));
    if (shown.includes(k)) line.push(...parts[k]);
    else line.push(parts[k][0], HIDDEN);
  }
  line.lead = lead;
  line.parts = shown.slice();
  return line;
}

// ── a área de incerteza ─────────────────────────────────────────────────────

/** Raio horizontal (m) conforme as partes entendidas. */
const RADIUS = {
  '': 5000,
  dist: 1800,
  sector: 1500,
  level: 3500,
  'dist,sector': 700,
  'dist,level': 1400,
  'level,sector': 1100,
  'dist,level,sector': 350,
};

/** Meia largura (m) do anel quando só a distância é sabida (a distância vem com uma casa decimal). */
const RING_W = 250;

/**
 * Onde a pista provavelmente está, com o que se sabe: { x, y, z, r, dy, known, ring? }.
 * rec: a pista salva ({ id, x, y, z, parts, from }) · known(w): o léxico.
 * O centro não é o alvo: fica deslocado (sempre com o alvo dentro).
 * Distância sem setor: um ANEL (ring: { R, w }) centrado em quem citou (x,z = from).
 */
export function leadArea(rec, known) {
  // a distância é um número: sempre legível; setor e nível pedem a palavra
  const k = Object.keys(PARTS).filter((p) => rec.parts.includes(p) && (p === 'dist' || known(PARTS[p])));
  const dy0 = k.includes('level') ? 200 : 1500;
  if (k.includes('dist') && !k.includes('sector') && rec.from) {
    const R = Math.hypot(rec.x - rec.from.x, rec.z - rec.from.z);
    const h = hash4(3, Math.round(rec.x), Math.round(rec.z), k.length, 995);
    return { x: rec.from.x, y: rec.y + (h - 0.5) * dy0, z: rec.from.z, r: R + RING_W, dy: dy0, known: k, ring: { R, w: RING_W } };
  }
  const r = RADIUS[k.slice().sort().join(',')];
  const h1 = hash4(1, Math.round(rec.x), Math.round(rec.z), k.length, 993);
  const h2 = hash4(2, Math.round(rec.x), Math.round(rec.z), k.length, 994);
  const a = h1 * Math.PI * 2;
  const off = r * 0.6 * h2;
  const dy = dy0;
  return { x: rec.x + Math.cos(a) * off, y: rec.y + (h1 - 0.5) * dy, z: rec.z + Math.sin(a) * off, r, dy, known: k };
}

/** Quão longe p está da área de uma pista (m, no plano; 0 = dentro). */
export function areaDistance(a, p) {
  const d = Math.hypot(p.x - a.x, p.z - a.z);
  if (a.ring) return Math.max(0, Math.abs(d - a.ring.R) - a.ring.w);
  return Math.max(0, d - a.r);
}

// as subestações evitam a estação do começo (gen/sites.js)
setStartSiteFn((F) => startSite(F));

/**
 * Num setor apagado (e ainda não religado), o terminal diz onde fica a
 * subestação do setor na faixa de altura dele (gen/sites.js). Uma pista do
 * tipo 'substation' — fecha quando o setor é religado (app/leads.js).
 */
export function substationLead(F, site) {
  if (site.kind === 'unique') return null;
  const sec = F.sectorAt(site.x, site.y + 1, site.z);
  if (sec.state !== 'dark') return null;
  const ss = substationFor(F, sec, site.y);
  if (!ss) return null;
  return { id: ss.id, x: ss.x, y: ss.y, z: ss.z, kind: 'substation', from: { id: site.id, x: site.x, y: site.y, z: site.z } };
}

/**
 * No alto de uma camada, o terminal da passagem cita a escotilha de máquina mais
 * perto (até 4 km); a de uma escotilha cita a próxima no sentido em que as
 * máquinas andam — a viagem que dá para fazer pendurado (fase 4.6).
 */
export function hatchLead(F, site) {
  if (site.kind !== 'passage' && site.kind !== 'hatch') return null;
  const b = F.barriersNear(site.y).find((bb) => Math.abs(bb.top - site.y) < 2);
  if (!b) return null;
  let h = null;
  if (site.kind === 'hatch') {
    const me = site.hatch;
    const dir = hash4(F.seed, b.n, me.lat, me.axis === 'x' ? 0 : 1, 710) < 0.5 ? 1 : -1; // o mesmo de world/colossi.js
    for (let k = 1; k <= 4 && !h; k++) h = F.hatch(b.n, me.axis, me.c, me.j + dir * k);
  } else {
    let bd = 4000;
    for (const c of F.hatchesNear(b, site.x, site.z, 4000)) {
      const d = Math.hypot(c.x - site.x, c.z - site.z);
      if (d < bd) {
        bd = d;
        h = c;
      }
    }
  }
  if (!h) return null;
  const t = hatchTerminal(F, b, h);
  return { id: t.id, x: t.x, y: t.y, z: t.z, kind: 'hatch', from: { id: site.id, x: site.x, y: site.y, z: site.z } };
}
