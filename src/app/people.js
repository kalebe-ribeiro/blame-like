// ─────────────────────────────────────────────────────────────────────────────
//  As pessoas (fase 7): conversa, troca, cargas e o despertar numa vila.
//
//  CONVERSA (7.2): E diante de um morador (world/npcs.js). Ele diz uma frase
//    curta; você escolhe uma troca (ui/talk.js):
//      recarregar a célula     uma vez a cada 20 min por vila (Peregrinação)
//      aprender palavras       4 palavras da língua antiga, uma vez por vila
//      o caminho               onde fica outra vila habitada (uma pista inteira)
//      levar uma carga         até outra vila habitada; entregar = a recompensa
//  CARGAS (7.3): um volume nas costas (ctx.player.carried); carregando, não se
//    corre e o pulo é baixo; o aparelho mostra a distância até o destino.
//    Pego pelos Safeguards: perdida (é "o que você carregava" — app/wake.js).
//  DESPERTAR (7.4): recolhido por humanos → acorda na vila; se carregava uma
//    carga, eles ficam com ela; se não, pedem uma entrega.
//  O que cada vila já deu fica no mundo salvo (slot.villages).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { TalkPanel } from '../ui/talk.js';
import { CONCEPTS, NEED } from '../lang/ancient.js';
import { uniqueTerminal } from '../gen/sites.js';
import { hash4 } from '../gen/hash.js';

const RECHARGE_EVERY = 20 * 60 * 1000; // ms
const TEACH = 4;
const DELIVERY_WORDS = 5;
const CARGO_RANGE = 45000; // m: até onde se manda uma carga (as vilas são raras: uma a cada ~16 km, metade habitada)
const GREETS = 8;
const fmt = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);

export function createPeople(ctx) {
  const { world, controls, camera } = ctx;
  const slot = ctx.slot;
  const panel = new TalkPanel();
  const g = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  let near = null; // o morador à frente (para o aviso do aparelho)
  let with_ = null; // com quem se fala
  let scanT = 0;

  const villages = () => (slot.villages ??= {});
  const stateOf = (id) => (villages()[id] ??= {});
  const cargo = () => ctx.player.carried.find((c) => c.kind === 'cargo') ?? null;
  const here = () => world.toGlobal(camera.position, g);
  const tell = (msg) => {
    if (ctx.rules.hud) ctx.hud?.push(msg);
    else ctx.carried?.say?.(msg, 5);
  };

  /** Outra vila habitada para onde mandar uma carga (a mais perto, fora esta). */
  function otherVillage(u) {
    const list = world.npcs.inhabitedNear(u.x, u.y, u.z, CARGO_RANGE).filter((o) => o.u.id !== u.id && o.d <= CARGO_RANGE);
    return list[0] ?? null;
  }

  function reveal(u, from) {
    const s = uniqueTerminal(world.field, u);
    const lead = { id: s.id, x: s.x, y: s.y, z: s.z, kind: 'unique', uniqueKind: 'village', from: { id: `un:${from.id}`, x: from.x, y: from.y, z: from.z } };
    world.bus.emit('lead:reveal', { lead, parts: ['sector', 'level', 'dist'] });
  }

  function teach(n, sourceId) {
    const lex = ctx.lexicon;
    const pool = Object.keys(CONCEPTS).filter((c) => !lex.known(c));
    pool.sort((a, b) => CONCEPTS[a] - CONCEPTS[b] || hash4(world.field.seed, a.length, a.charCodeAt(0), 7, 1720) - hash4(world.field.seed, b.length, b.charCodeAt(0), 7, 1720));
    let learned = [];
    for (const c of pool.slice(0, n)) learned = learned.concat(lex.see(`${sourceId}:${c}`, [c], NEED[CONCEPTS[c]]));
    if (learned.length) world.bus.emit('player:learn', { words: learned, source: sourceId });
    return learned;
  }

  /** Uma carga desta vila até outra. Devolve a outra (ou null). */
  function giveCargo(u) {
    const o = otherVillage(u);
    if (!o) return null;
    const s = uniqueTerminal(world.field, o.u);
    ctx.player.carried.push({ kind: 'cargo', from: u.id, to: o.u.id, x: s.x, y: s.y, z: s.z });
    reveal(o.u, u);
    world.bus.emit('player:cargo', { from: u.id, to: o.u.id });
    return o;
  }

  // ── a conversa ──

  function options(e) {
    const u = e.npc.village;
    const st = stateOf(u.id);
    const opts = [];
    const c = cargo();
    if (c && c.to === u.id) opts.push({ id: 'deliver', label: t('talk.opt.deliver') });
    if (ctx.rules.resources && ctx.player.energy.value < 0.95 && !(st.recharged && Date.now() - st.recharged < RECHARGE_EVERY)) opts.push({ id: 'recharge', label: t('talk.opt.recharge') });
    if (ctx.rules.translation && !st.taught) opts.push({ id: 'teach', label: t('talk.opt.teach') });
    if (!st.way && otherVillage(u)) opts.push({ id: 'way', label: t('talk.opt.way') });
    if (!c && otherVillage(u)) opts.push({ id: 'cargo', label: t('talk.opt.cargo') });
    opts.push({ id: 'leave', label: t('talk.leave') });
    return opts;
  }

  function open(e) {
    with_ = e;
    document.exitPointerLock?.();
    const k = Math.floor(hash4(world.field.seed, e.id.length, Math.floor(Date.now() / 60000), e.id.charCodeAt(e.id.length - 1), 1721) * GREETS);
    const c = cargo();
    const line = c && c.to === e.npc.village.id ? t('talk.cargo.here') : t(`talk.greet.${k}`);
    panel.open(t('talk.who.villager'), line, options(e));
    ctx.audio?.deviceClick?.(true);
  }

  function close() {
    panel.close();
    with_ = null;
    controls.lock();
  }

  panel.onPick = (id) => {
    const e = with_;
    if (!e) return;
    const u = e.npc.village;
    const st = stateOf(u.id);
    let line = '';
    if (id === 'leave') return close();
    if (id === 'recharge') {
      ctx.player.energy.value = ctx.player.energy.max;
      st.recharged = Date.now();
      line = t('talk.recharge');
    } else if (id === 'teach') {
      const w = teach(TEACH, `vl:${u.id}`);
      st.taught = true;
      line = w.length ? t('talk.teach', { n: w.length }) : t('talk.teachNone');
    } else if (id === 'way') {
      const o = otherVillage(u);
      st.way = true;
      if (o) {
        reveal(o.u, u);
        line = t('talk.way', { dist: fmt(o.d) });
      }
    } else if (id === 'cargo') {
      const o = giveCargo(u);
      line = o ? t('talk.cargo.give', { dist: fmt(o.d) }) : t('talk.nothing');
    } else if (id === 'deliver') {
      const c = cargo();
      ctx.player.carried.splice(ctx.player.carried.indexOf(c), 1);
      ctx.player.energy.value = ctx.player.energy.max;
      const w = ctx.rules.translation ? teach(DELIVERY_WORDS, `cg:${c.from}>${c.to}`) : [];
      world.bus.emit('player:deliver', { from: c.from, to: c.to, words: w.length });
      line = t('talk.cargo.thanks', { n: w.length });
    }
    panel.show(line, options(e));
  };

  // ── o despertar numa vila (app/wake.js: taker 'npc') ──
  world.bus.on('player:wake', (ev) => {
    if (ev.taker !== 'npc') return;
    const v = world.npcs.inhabitedNear(ev.to.x, ev.to.y, ev.to.z, 400)[0];
    if (!v) return;
    const c = cargo();
    if (c) {
      ctx.player.carried.splice(ctx.player.carried.indexOf(c), 1);
      setTimeout(() => tell(t('npc.keptCargo')), 800);
    } else {
      const o = giveCargo(v.u);
      if (o) setTimeout(() => tell(t('npc.mission', { dist: fmt(o.d) })), 800);
      if (ctx.params.get('wakeas')) console.warn(`WAKE npc: na vila ${v.u.id} (${Math.round(v.d)} m) · entrega ${o ? `${o.u.id} a ${Math.round(o.d)} m` : 'nenhuma'}`);
    }
  });
  // pego pelos Safeguards: a carga se perde (app/wake.js já esvazia o que se carregava)
  world.bus.on('player:caught', () => {
    if (cargo()) setTimeout(() => tell(t('npc.cargoLost')), 12000);
  });

  return {
    get isOpen() {
      return panel.isOpen;
    },
    el: panel.el,
    close,
    /** E / (X): fala com quem está à frente, ou fecha a conversa. true = usou a tecla. */
    tryUse() {
      if (panel.isOpen) {
        close();
        return true;
      }
      if (!near) return false;
      open(near);
      return true;
    },
    /** O morador à frente (o aparelho mostra FALAR). */
    get near() {
      return near;
    },
    /** A carga que se carrega, e a distância até o destino (m). */
    cargoInfo() {
      const c = cargo();
      if (!c) return null;
      const p = here();
      return { c, d: Math.hypot(c.x - p.x, c.y - p.y, c.z - p.z) };
    },
    update(dt) {
      // carregando: sem correr, pulo baixo
      const heavy = !!cargo();
      controls.burden = heavy;
      controls.walker.jumpScale = heavy ? 0.55 : 1;
      if ((scanT -= dt) > 0) return;
      scanT = 0.2;
      camera.getWorldDirection(fwd);
      fwd.y = 0;
      fwd.normalize();
      near = controls.mode === 'walk' && !panel.isOpen ? world.npcs.talkable(here(), fwd) : null;
      // quem se afastou da conversa: ela acaba
      if (panel.isOpen && with_ && with_.feet.distanceTo(here()) > 4.5) close();
    },
  };
}
