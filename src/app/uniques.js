// ─────────────────────────────────────────────────────────────────────────────
//  O que cada estrutura única faz (fase 4.5 — ver o cofre, Estruturas-unicas).
//  Ler o console dela pela PRIMEIRA vez neste mundo:
//
//    archive   arquivo de registros: um salto de tradução — um lote de palavras
//              ainda não entendidas passa a ser entendido de uma vez
//    plant     usina: religa a região — os setores apagados a até 2,5 km, na
//              mesma faixa, com a luz saindo daqui (world/substations.js)
//    console   terminal ativo: mostra no mapa onde ficam as estruturas únicas
//              vizinhas (pistas completas, sem incerteza)
//    builders  sala de controle dos Construtores: marca no mapa os canteiros
//              da região (vivos e mortos)
//    antenna   terminal de transmissão: o sensor passa a ouvir 2,5× mais longe
//
//  O que já foi usado fica no mundo salvo (slot.uniques). Os efeitos de
//  tradução só valem onde se aprende (Peregrinação — o léxico decide).
// ─────────────────────────────────────────────────────────────────────────────
import { t } from '../i18n/index.js';
import { CONCEPTS, NEED } from '../lang/ancient.js';
import { hash4 } from '../gen/hash.js';
import { uniqueTerminal } from '../gen/sites.js';

const ARCHIVE_WORDS = 14; // palavras entendidas de uma vez no arquivo
const PLANT_RADIUS = 2500; // m
const CONSOLE_REVEAL = 3; // estruturas vizinhas mostradas
const BUILDERS_RADIUS = 6000; // m

export function createUniques(ctx) {
  const { world } = ctx;
  const slot = ctx.slot;
  const used = () => (slot.uniques ??= {});
  const tell = (key, params) => {
    const msg = t(key, params);
    if (ctx.rules.hud) ctx.hud?.push(msg);
    else ctx.carried?.say?.(msg, 5);
  };

  const effects = {
    archive(u) {
      // as palavras ainda não entendidas, das comuns às raras, escolhidas pela estrutura
      const lex = ctx.lexicon;
      const pool = Object.keys(CONCEPTS).filter((c) => !lex.known(c));
      pool.sort((a, b) => CONCEPTS[a] - CONCEPTS[b] || hash4(world.field.seed, a.length, a.charCodeAt(0), u.n, 1330) - hash4(world.field.seed, b.length, b.charCodeAt(0), u.n, 1330));
      const pick = pool.slice(0, ARCHIVE_WORDS);
      let learned = [];
      for (const c of pick) learned = learned.concat(lex.see(`arch:${u.id}:${c}`, [c], NEED[CONCEPTS[c]]));
      if (learned.length) world.bus.emit('player:learn', { words: learned, source: u.id });
      tell(learned.length ? 'unique.archive' : 'unique.archiveNone', { n: learned.length });
    },
    plant(u, site) {
      const F = world.field;
      const seen = new Set();
      let n = 0;
      for (let r = 0; r <= PLANT_RADIUS; r += 300) {
        for (let a = 0; a < Math.PI * 2; a += r ? 300 / r : 7) {
          const s = F.sectorAt(site.x + Math.cos(a) * r, site.y + 1, site.z + Math.sin(a) * r, true);
          if (seen.has(s.id)) continue;
          seen.add(s.id);
          if (s.state !== 'dark' || F.restored.has(s.id)) continue;
          world.substations.restoreSector(s.id, site.x, site.y + 1, site.z, ctx.time, ctx.worldState);
          n++;
        }
      }
      tell(n ? 'unique.plant' : 'unique.plantNone', { n });
    },
    console(u) {
      const F = world.field;
      const others = F.uniquesNear(u.x, u.y, u.z, 40000)
        .filter((o) => o.id !== u.id)
        .map((o) => ({ o, d: Math.hypot(o.x - u.x, o.y - u.y, o.z - u.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, CONSOLE_REVEAL);
      for (const { o } of others) {
        const s = uniqueTerminal(F, o);
        const lead = { id: s.id, x: s.x, y: s.y, z: s.z, kind: 'unique', uniqueKind: o.kind, from: { id: `un:${u.id}`, x: u.x, y: u.y, z: u.z } };
        world.bus.emit('lead:reveal', { lead, parts: ['sector', 'level', 'dist'] });
      }
      tell('unique.console', { n: others.length });
    },
    builders(u) {
      // os canteiros da mesma laje (a sala controla a sua camada), na região
      const sites = world.field.builderSitesNear(u.x, u.y, u.z, BUILDERS_RADIUS).filter((b) => Math.abs(b.y - u.y) < 60 && Math.hypot(b.x - u.x, b.z - u.z) < BUILDERS_RADIUS);
      slot.builderSites ??= {};
      for (const s of sites) slot.builderSites[`${Math.round(s.x)},${Math.round(s.z)}`] = { x: Math.round(s.x), y: Math.round(s.y ?? u.y), z: Math.round(s.z), dead: !!s.dead };
      tell('unique.builders', { n: sites.length });
    },
    chamber() {
      tell('unique.chamber');
    },
    antenna() {
      slot.boosts = { ...(slot.boosts ?? {}), antenna: true };
      tell('unique.antenna');
    },
  };

  world.bus.on('player:read', ({ site }) => {
    if (site?.kind !== 'unique' || used()[site.unique.id]) return;
    used()[site.unique.id] = Date.now();
    effects[site.unique.kind]?.(site.unique, site);
  });

  return {
    /** O sensor ouve mais longe (a antena)? */
    sensorBoost: () => (slot.boosts?.antenna ? 2.5 : 1),
  };
}
