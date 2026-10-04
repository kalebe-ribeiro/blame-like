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
//    corre e o pulo é baixo; o aparelho mostra a distância até o destino, e o
//    mapa, o lugar (◇). Cada carga tem contexto — o que é, por que vai — e uma
//    recompensa prometida na hora (palavras · o mapa da região · uma célula
//    maior), sempre com a célula cheia na entrega.
//    Pego pelos Safeguards: perdida (é "o que você carregava" — app/wake.js).
//  DESPERTAR (7.4): recolhido por humanos → acorda na vila; se carregava uma
//    carga, eles ficam com ela; se não, pedem uma entrega.
//  ANDARILHOS (7.5): E diante de um transumano — os que trocam dão 3 palavras
//    por um quarto da célula, ou contam onde há uma vila; os outros não têm
//    nada a dizer (e, se você carrega uma carga, podem arrancá-la e fugir).
//  VIDA DE SILÍCIO (7.6): tentar falar com uma a revela; o toque dela drena a célula.
//  VILA HOSTIL (o cofre, Dano-do-emissor §4): ferir ou matar um morador com o emissor deixa
//    a vila hostil PARA SEMPRE (slot.villages[id].hostile): os moradores vêm e golpeiam (−25%,
//    o arremesso — app/health.js struck); não conversam, não trocam, não refazem nada; a vila
//    não é mais lugar de despertar nem destino de carga. Zerou por eles: o desmaio dos NPCs,
//    e você acorda noutra vila (longe).
//  O que cada vila já deu fica no mundo salvo (slot.villages).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { TalkPanel } from '../ui/talk.js';
import { CONCEPTS, NEED } from '../lang/ancient.js';
import { uniqueTerminal } from '../gen/sites.js';
import { hash4 } from '../gen/hash.js';
import { HUMAN_STRIKE_DAMAGE } from './health.js';
import { ARM_COST } from './arms.js';
import { ANALYZE_COST, PRICE as GENE_PRICE } from './gene.js';
import { bindings } from '../controls/bindings.js';

const RECHARGE_EVERY = 20 * 60 * 1000; // ms
const TEACH = 4;
const CARGO_RANGE = 45000; // m: até onde se manda uma carga (as vilas são raras: uma a cada ~16 km, metade habitada)
const GREETS = 8;
const WANDER_GREETS = 5;
const SWAP_COST = 0.25; // da célula, por 3 palavras (o andarilho que troca)
const CARGO_WHAT = 6; // o que se leva (i18n: cargo.what.N)
const CARGO_WHY = 4; // por que (cargo.why.N)
const REWARDS = [
  { kind: 'words', n: 7 }, // palavras da língua antiga
  { kind: 'map', n: 4 }, // os lugares da região no mapa (estruturas únicas e vilas)
  { kind: 'cell', n: 25 }, // a célula aguenta 25% a mais (até o dobro)
];
const LORE = 6; // o que os andarilhos contam (talk.wander.lore.N)
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

  /** Uma carga desta vila até outra. Devolve { o, c } (ou null). */
  function giveCargo(u) {
    const o = otherVillage(u);
    if (!o) return null;
    const s = uniqueTerminal(world.field, o.u);
    // o que é, por que, e o que eles prometem — da vila e do destino (sempre o mesmo pedido)
    const F = world.field;
    const hh = (k) => hash4(F.seed, Math.round(u.x), Math.round(o.u.z), k, 1740);
    const c = {
      kind: 'cargo', from: u.id, to: o.u.id, x: s.x, y: s.y, z: s.z,
      what: Math.floor(hh(1) * CARGO_WHAT),
      why: Math.floor(hh(2) * CARGO_WHY),
      reward: REWARDS[Math.floor(hh(3) * REWARDS.length)],
    };
    ctx.player.carried.push(c);
    reveal(o.u, u);
    world.bus.emit('player:cargo', { from: u.id, to: o.u.id });
    return { o, c };
  }

  const rewardText = (c) => t(`cargo.reward.${c.reward.kind}`, { n: c.reward.n });

  /** A recompensa na entrega (além da célula cheia). Devolve o texto do que se ganhou. */
  function payReward(c) {
    const r = c.reward ?? REWARDS[0];
    if (r.kind === 'words' && ctx.rules.translation) {
      const w = teach(r.n, `cg:${c.from}>${c.to}`);
      return t('cargo.got.words', { n: w.length });
    }
    if (r.kind === 'map') {
      // os lugares da região: estruturas únicas e vilas perto do destino, como pistas inteiras
      const F = world.field;
      const near = F.uniquesNear(c.x, c.y, c.z, 30000)
        .filter((o) => o.id !== c.to)
        .map((o) => ({ o, d: Math.hypot(o.x - c.x, o.y - c.y, o.z - c.z) }))
        .sort((a, b) => a.d - b.d)
        .slice(0, r.n);
      const here = { id: c.to, x: c.x, y: c.y, z: c.z };
      for (const { o } of near) reveal(o, here);
      return t('cargo.got.map', { n: near.length });
    }
    if (r.kind === 'cell') {
      const en = ctx.player.energy;
      en.max = Math.min(2, en.max + r.n / 100);
      en.value = en.max;
      return t('cargo.got.cell', { n: Math.round(en.max * 100) });
    }
    return '';
  }

  // ── a conversa ──

  const pay = (n) => {
    if (ctx.rules.resources) ctx.player.energy.value = Math.max(0, ctx.player.energy.value - n);
  };
  const canPay = (n) => !ctx.rules.resources || ctx.player.energy.value >= n;
  /** As opções do gene de terminal (app/gene.js), para moradores e andarilhos. */
  function geneOptions(e) {
    const opts = [];
    const G = ctx.gene;
    if (!G) return opts;
    if (G.hasAnalyzer && !e.npc.analyzed && canPay(ANALYZE_COST)) opts.push({ id: 'analyze', label: t('talk.opt.analyze', { n: Math.round(ANALYZE_COST * 100) }) });
    if (G.hasAnalyzer && e.npc.analyzed && e.npc.carrier && !e.npc.sampled && !G.implanted) opts.push({ id: 'sample', label: t('talk.opt.sample') });
    return opts;
  }
  /** As escolhas do gene: devolve a fala, ou null (não era uma delas). */
  function geneAnswer(e, id) {
    if (id === 'analyze') {
      pay(ANALYZE_COST);
      e.npc.analyzed = true;
      const tr = ctx.gene.traceOf(e);
      world.bus.emit('player:analyze', { id: e.id, trace: tr });
      return t(tr > 0.5 ? 'talk.analyzeYes' : 'talk.analyzeNo', { n: Math.round(tr * 100) });
    }
    if (id === 'sample') {
      e.npc.sampled = true;
      ctx.player.carried.push({ kind: 'sample', from: e.id });
      world.bus.emit('player:sample', { id: e.id });
      return t('talk.sample');
    }
    return null;
  }

  function options(e) {
    if (e.npc.role === 'wanderer') {
      const opts = [];
      if (!e.npc.thief) {
        if (ctx.rules.translation && ctx.player.energy.value >= SWAP_COST && !e.npc.swapped) opts.push({ id: 'swap', label: t('talk.opt.swap', { n: Math.round(SWAP_COST * 100) }) });
        if (!e.npc.told) opts.push({ id: 'news', label: t('talk.opt.news') });
      }
      if ((e.npc.lore ?? 0) < 2) opts.push({ id: 'lore', label: t('talk.opt.lore') });
      if (!e.npc.thief && !e.npc.whence) opts.push({ id: 'whence', label: t('talk.opt.whence') });
      opts.push(...geneOptions(e));
      // o analisador e o gene levado de um depósito esquecido: os que trocam vendem
      if (!e.npc.thief && ctx.gene && !ctx.gene.hasAnalyzer && canPay(GENE_PRICE.analyzer)) opts.push({ id: 'buyAnalyzer', label: t('talk.opt.buyAnalyzer', { n: Math.round(GENE_PRICE.analyzer * 100) }) });
      if (!e.npc.thief && e.npc.geneItem && canPay(GENE_PRICE.gene)) opts.push({ id: 'buyGene', label: t('talk.opt.buyGene', { n: Math.round(GENE_PRICE.gene * 100) }) });
      // R3: os que trocam vendem uma prótese (só a quem falta um braço)
      if (!e.npc.thief && ctx.arms?.missing.length && !ctx.player.carried.some((c) => c.kind === 'prosthesis') && (!ctx.rules.resources || ctx.player.energy.value >= ARM_COST.wanderer))
        opts.push({ id: 'prosthesis', label: t('talk.opt.prosthesis', { n: Math.round(ARM_COST.wanderer * 100) }) });
      opts.push({ id: 'leave', label: t('talk.leave') });
      return opts;
    }
    const u = e.npc.village;
    const st = stateOf(u.id);
    const opts = [];
    const c = cargo();
    if (c && c.to === u.id) opts.push({ id: 'deliver', label: t('talk.opt.deliver') });
    if (ctx.rules.resources && ctx.player.energy.value < 0.95 && !(st.recharged && Date.now() - st.recharged < RECHARGE_EVERY)) opts.push({ id: 'recharge', label: t('talk.opt.recharge') });
    if (ctx.rules.translation && !st.taught) opts.push({ id: 'teach', label: t('talk.opt.teach') });
    opts.push(...geneOptions(e));
    // o final (o cofre, Gene-terminal §6): entregar o gene implantado a esta vila
    if (ctx.player.gene && slot.ending === 'pending-village') opts.push({ id: 'giveGene', label: t('talk.opt.giveGene') });
    // R5: refazer o braço — uma carga entregue, ou 30% da célula; um braço
    if (ctx.arms?.missing.length) {
      if (c) opts.push({ id: 'armCargo', label: t('talk.opt.armCargo') });
      if (!ctx.rules.resources || ctx.player.energy.value >= ARM_COST.villager) opts.push({ id: 'armCell', label: t('talk.opt.armCell', { n: Math.round(ARM_COST.villager * 100) }) });
    }
    if (!st.way && otherVillage(u)) opts.push({ id: 'way', label: t('talk.opt.way') });
    if (!c && otherVillage(u)) opts.push({ id: 'cargo', label: t('talk.opt.cargo') });
    opts.push({ id: 'leave', label: t('talk.leave') });
    return opts;
  }

  function open(e) {
    // vida de silício disfarçada: falar com ela é o bastante para ela se mostrar
    if (e.npc.silicon && !e.npc.revealed) {
      world.npcs.reveal(e);
      return;
    }
    if (e.npc.role === 'wanderer') {
      with_ = e;
      document.exitPointerLock?.();
      const k = Math.floor(hash4(world.field.seed, e.id.length, e.id.charCodeAt(4), e.id.charCodeAt(e.id.length - 1), 1722) * WANDER_GREETS);
      panel.open(t('talk.who.wanderer'), e.npc.thief ? t(`talk.wander.cold.${k % 3}`) : t(`talk.wander.greet.${k}`), options(e));
      ctx.audio?.deviceClick?.(true);
      return;
    }
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

  /** uma escolha avulsa, fora de uma conversa (o final do gene — app/gene.js) */
  let custom = null;
  panel.onClose = () => {
    custom = null;
    close();
  };
  panel.onPick = (id) => {
    if (custom) {
      const f = custom;
      custom = null;
      close();
      f(id);
      return;
    }
    const e = with_;
    if (!e) return;
    if (id === 'leave') return close();
    if (e.npc.role === 'wanderer') {
      let wl = '';
      if (id === 'swap') {
        ctx.player.energy.value = Math.max(0, ctx.player.energy.value - SWAP_COST);
        const w = teach(3, `wd:${e.id}`);
        e.npc.swapped = true;
        wl = t('talk.swap', { n: w.length });
      } else if (id === 'lore') {
        // o que eles contam da Cidade (o ladrão responde seco)
        e.npc.lore = (e.npc.lore ?? 0) + 1;
        const k = Math.floor(hash4(world.field.seed, e.id.length, e.npc.lore, e.id.charCodeAt(5) || 7, 1723) * LORE);
        wl = e.npc.thief ? t(`talk.wander.cold.${e.npc.lore % 3}`) : t(`talk.wander.lore.${k}`);
      } else if (id === 'whence') {
        e.npc.whence = true;
        wl = t(`talk.wander.whence.${Math.floor(hash4(world.field.seed, e.id.length, 3, e.id.charCodeAt(6) || 3, 1724) * 4)}`);
      } else if (id === 'analyze' || id === 'sample') {
        wl = geneAnswer(e, id) ?? '';
      } else if (id === 'buyAnalyzer') {
        pay(GENE_PRICE.analyzer);
        ctx.gene.giveAnalyzer('trade');
        wl = t('talk.analyzer');
      } else if (id === 'buyGene') {
        pay(GENE_PRICE.gene);
        const from = e.npc.geneItem;
        e.npc.geneItem = null;
        (slot.loot ??= {})[`gene:${from}`] = 'taken';
        ctx.player.carried.push({ kind: 'gene', from });
        world.bus.emit('player:gene', { from, by: e.id });
        wl = t('talk.gene');
      } else if (id === 'prosthesis') {
        if (ctx.rules.resources) ctx.player.energy.value = Math.max(0, ctx.player.energy.value - ARM_COST.wanderer);
        ctx.player.carried.push({ kind: 'prosthesis', from: e.id });
        wl = t('talk.prosthesis', { key: bindings.label('inventory') });
        world.bus.emit('player:prosthesis', { from: e.id });
      } else if (id === 'news') {
        e.npc.told = true;
        const o = world.npcs.inhabitedNear(e.feet.x, e.feet.y, e.feet.z, CARGO_RANGE)[0];
        if (o) {
          reveal(o.u, { id: e.id, x: e.feet.x, y: e.feet.y, z: e.feet.z });
          wl = t('talk.news', { dist: fmt(o.d) });
        } else wl = t('talk.newsNone');
      }
      panel.show(wl, options(e));
      return;
    }
    const u = e.npc.village;
    const st = stateOf(u.id);
    let line = '';
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
    } else if (id === 'analyze' || id === 'sample') {
      line = geneAnswer(e, id) ?? '';
    } else if (id === 'giveGene') {
      slot.ending = 'village';
      slot.endingVillage = u.id;
      world.bus.emit('ending', { kind: 'village', village: u.id });
      close();
      ctx.gene.showEnding('village');
      return;
    } else if (id === 'armCargo' || id === 'armCell') {
      if (id === 'armCargo') {
        const cg = cargo();
        if (cg) ctx.player.carried.splice(ctx.player.carried.indexOf(cg), 1);
      } else if (ctx.rules.resources) ctx.player.energy.value = Math.max(0, ctx.player.energy.value - ARM_COST.villager);
      const w = ctx.arms.missing[0];
      if (w) ctx.arms.restore(w, 'flesh');
      line = t('talk.arm');
      world.bus.emit('player:villageArm', { village: u.id, paid: id });
    } else if (id === 'cargo') {
      const r = giveCargo(u);
      line = r ? t('talk.cargo.give', { what: t(`cargo.what.${r.c.what}`), why: t(`cargo.why.${r.c.why}`), dist: fmt(r.o.d), reward: rewardText(r.c) }) : t('talk.nothing');
    } else if (id === 'deliver') {
      const c = cargo();
      ctx.player.carried.splice(ctx.player.carried.indexOf(c), 1);
      ctx.player.energy.value = ctx.player.energy.max;
      const got = payReward(c);
      world.bus.emit('player:deliver', { from: c.from, to: c.to, reward: c.reward?.kind });
      line = t('talk.cargo.thanks', { what: t(`cargo.what.${c.what ?? 0}`), got });
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
      const r = giveCargo(v.u);
      if (r) setTimeout(() => tell(t('npc.mission', { what: t(`cargo.what.${r.c.what}`), dist: fmt(r.o.d) })), 800);
      if (ctx.params.get('wakeas')) console.warn(`WAKE npc: na vila ${v.u.id} (${Math.round(v.d)} m) · entrega ${r ? `${r.o.u.id} a ${Math.round(r.o.d)} m` : 'nenhuma'}`);
    }
  });
  // pego pelos Safeguards: a carga se perde (app/wake.js já esvazia o que se carregava)
  world.bus.on('player:caught', () => {
    if (cargo()) setTimeout(() => tell(t('npc.cargoLost')), 12000);
  });

  // o que os andarilhos e a vida de silício podem fazer com você (world/npcs.js)
  // ferir ou matar um morador: a vila viu (para sempre)
  const angered = (ev) => {
    if (ev.cause !== 'beam') return;
    const e = world.entities.list.get(ev.id);
    const u = e?.npc?.role === 'villager' ? e.npc.village : null;
    if (!u) return;
    const st = stateOf(u.id);
    if (st.hostile) return;
    st.hostile = true;
    if (with_?.npc?.village?.id === u.id) close();
    tell(t('npc.villageSaw'));
    ctx.audio?.sgSpot?.(...ctx.placeOf(e.feet.x, e.feet.y + 1.2, e.feet.z));
    world.bus.emit('village:hostile', { id: u.id });
  };
  world.bus.on('being:hurt', angered);
  world.bus.on('being:die', angered);

  const wire = () => {
    world.npcs.hostile = (id) => !!slot.villages?.[id]?.hostile;
    // o golpe de um morador hostil: −25% e o arremesso; zerou → recolhido por humanos (longe dali)
    world.npcs.onStrike = (e, hit) => ctx.health?.struck(e, hit, HUMAN_STRIKE_DAMAGE, () => ctx.wake.start('impact', 'npc'));
    world.npcs.player = {
      carrying: () => !!cargo(),
      walking: () => controls.mode === 'walk' && !ctx.wake?.active,
      steal() {
        const c = cargo();
        if (c) ctx.player.carried.splice(ctx.player.carried.indexOf(c), 1);
        tell(t('npc.stolen'));
        controls.rumble?.(0.6, 0.3, 300);
      },
      drain() {
        ctx.player.energy.value = 0;
        tell(t('npc.drained'));
        controls.rumble?.(0.9, 0.5, 600);
      },
    };
  };
  wire();

  return {
    get isOpen() {
      return panel.isOpen;
    },
    /** Uma escolha avulsa no painel da conversa: who, line, options [{id,label}], pick(id). */
    choice(who, line, options, pick) {
      if (panel.isOpen) close();
      custom = pick;
      with_ = null;
      document.exitPointerLock?.();
      panel.open(who, line, options);
      ctx.audio?.deviceClick?.(true);
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
      if (!world.npcs.player) wire(); // um mundo novo (world.build)
      // conversando: o corpo fica parado (as teclas são da conversa)
      controls.frozen = panel.isOpen || !!ctx.inventory?.isOpen;
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
