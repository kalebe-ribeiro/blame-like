// ─────────────────────────────────────────────────────────────────────────────
//  O gene de terminal da rede — o objetivo final (o cofre, Gene-terminal; o puro em gen/gene.js).
//
//    a cadeia     ler o console de um elo revela o seguinte (o último, o depósito); um arquivo
//                 de registros revela o começo das cadeias por perto — pistas inteiras
//    o depósito   o gene na cápsula, no pedestal do fundo (E pega). Guardado: chegando perto, a
//                 Cidade manda Safeguards ALTOS pelas paredes. Esquecido: escuro; às vezes o
//                 pedestal está vazio — um andarilho levou (world/npcs.js geneItem: ele vende, ou,
//                 morto, o gene cai no chão)
//    o analisador a ferramenta nova (G3): achada nas estruturas únicas (1 em 4, ao ler o console)
//                 ou vendida por andarilhos; na conversa, "analisar" mostra o traço do gene; num
//                 portador, "colher amostra" — com ele vivo (G2)
//    um objeto    até o implante, o gene (ou a amostra) é algo que se carrega: no desmaio se perde
//                 (G1) — o gene volta para onde estava; a amostra se degrada
//    o implante   no berço da câmara de reconstrução (G6 — app/arms.js), ~40 s. Depois: os
//                 Safeguards param de caçar você (G5); os terminais ficam legíveis; o mapa mostra
//                 a região; e o FINAL é uma escolha — manter, destruir, entregar a uma vila
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { t } from '../i18n/index.js';
import { hash4 } from '../gen/hash.js';
import { uniqueTerminal } from '../gen/sites.js';
import { bindings } from '../controls/bindings.js';
import { GENE, chainOf, linksOf, vaultsNear, vaultTakenBy, geneTargets } from '../gen/gene.js';

export const IMPLANT_TIME = 40; // s no berço
export const ANALYZE_COST = 0.03;
export const PRICE = { analyzer: 0.35, gene: 0.6 };
const ANALYZER_IN_UNIQUE = 0.25;
const REACH = 2.2;
const GUARD_R = 160; // m do depósito guardado: a Cidade manda os altos
const GUARD_EVERY = 90; // s entre as levas

export function createGene(ctx) {
  const { world, camera, controls, audio } = ctx;
  const player = ctx.player;
  const slot = ctx.slot;
  const bus = world.bus;
  const F = () => world.field;
  const loot = () => (slot.loot ??= {});
  const _g = new THREE.Vector3();
  const here = () => world.toGlobal(camera.position, _g);
  const tell = (msg, s = 6) => {
    if (ctx.rules.hud) ctx.hud?.push(msg);
    else ctx.carried?.say?.(msg, s);
  };
  const geneKey = (v) => `gene:${v.id}`;
  const hasAnalyzer = () => player.inventory.includes('analyzer');
  const item = () => player.carried.find((c) => c.kind === 'gene' || c.kind === 'sample') ?? null;

  /** Revela uma única como pista inteira. */
  function reveal(u, from) {
    const s = uniqueTerminal(F(), u);
    const lead = { id: s.id, x: s.x, y: s.y, z: s.z, kind: 'unique', uniqueKind: u.kind, from: { id: `un:${from.id}`, x: from.x, y: from.y, z: from.z } };
    bus.emit('lead:reveal', { lead, parts: ['sector', 'level', 'dist'] });
  }

  // ── a cadeia, e o analisador achado nas estruturas ──
  bus.on('player:read', ({ site }) => {
    if (site?.kind !== 'unique') return;
    const u = site.unique;
    const f = F();
    let told = false;
    for (const { v, i } of linksOf(f, u)) {
      const ch = chainOf(f, v);
      reveal(i + 1 < ch.length ? ch[i + 1] : v, u);
      bus.emit('gene:link', { vault: v.id, i });
      if (!told) tell(t(i + 1 < ch.length ? 'gene.chainNext' : 'gene.chainVault'));
      told = true;
    }
    if (u.kind === 'archive') {
      for (const v of geneTargets(f).filter((x) => Math.hypot(x.x - u.x, x.z - u.z) < GENE.archiveReach)) {
        const ch = chainOf(f, v);
        if (!ch.length || ch[0].id === u.id) continue;
        reveal(ch[0], u);
        bus.emit('gene:chainStart', { vault: v.id });
        if (!told) tell(t('gene.chainStart'));
        told = true;
      }
    }
    if (ctx.rules.resources && !hasAnalyzer() && hash4(f.seed, Math.round(u.x), u.n, Math.round(u.z), 2210) < ANALYZER_IN_UNIQUE) giveAnalyzer('unique');
  });

  function giveAnalyzer(how) {
    if (hasAnalyzer()) return;
    player.inventory.push('analyzer');
    bus.emit('player:pickup', { tool: 'analyzer', how });
    audio.deviceClick?.(true);
    setTimeout(() => tell(t('gene.analyzerFound'), 6), how === 'unique' ? 3000 : 0);
  }

  // ── o gene: na cápsula do pedestal, ou no chão (um andarilho morto que o levava) ──
  function buildCapsule() {
    const g = new THREE.Group();
    const m = world.materials.machine;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.32, 10), m);
    body.position.y = 0.16;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.05, 10), m);
    cap.position.y = 0.33;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.04, 10), m);
    base.position.y = 0.02;
    g.add(body, cap, base);
    g.traverse((o) => (o.userData.noCollide = true));
    return g;
  }
  /** id → { p: {x,y,z}, from (o depósito de origem), mesh, kind: 'vault'|'drop' } */
  const genes = new Map();
  const drops = []; // os que caíram (de um andarilho morto): { id, x, y, z, from }

  const geneItemFor = (tid) => {
    const g = here();
    for (const v of vaultsNear(F(), g.x, g.y, g.z, 8000)) if (!loot()[geneKey(v)] && vaultTakenBy(F(), v) === tid) return v.id;
    return null;
  };
  world.npcs.geneItemFor = geneItemFor;
  bus.on('being:die', (ev) => {
    const e = world.entities.list.get(ev.id);
    const from = e?.npc?.geneItem;
    if (!from) return;
    e.npc.geneItem = null;
    loot()[`gene:${from}`] = 'dropped';
    drops.push({ id: `drop:${from}`, x: ev.x, y: ev.y, z: ev.z, from });
    scanT = 0;
  });

  let scanT = 0;
  function scan() {
    const g = here();
    const want = new Map();
    for (const v of vaultsNear(F(), g.x, g.y, g.z, 700)) {
      if (loot()[geneKey(v)] || vaultTakenBy(F(), v)) continue;
      const p = F().vaultPedestal(v);
      want.set(`vault:${v.id}`, { p, from: v.id, kind: 'vault' });
    }
    for (const d of drops) if (Math.hypot(d.x - g.x, d.z - g.z) < 700) want.set(d.id, { p: d, from: d.from, kind: 'drop' });
    for (const [id, w] of want) {
      if (genes.has(id)) continue;
      const mesh = buildCapsule();
      ctx.scene.add(mesh);
      genes.set(id, { ...w, mesh });
    }
    for (const [id, it] of genes) {
      if (want.has(id)) continue;
      ctx.scene.remove(it.mesh);
      genes.delete(id);
    }
  }

  function nearGene() {
    const g = here();
    for (const [id, it] of genes) if (Math.hypot(it.p.x - g.x, it.p.z - g.z) < REACH && Math.abs(g.y - 1.7 - (it.p.y - 1.1)) < 2.2) return { id, it };
    return null;
  }

  function take({ id, it }) {
    ctx.scene.remove(it.mesh);
    genes.delete(id);
    if (it.kind === 'drop') drops.splice(drops.findIndex((d) => d.id === id), 1);
    loot()[`gene:${it.from}`] = 'taken';
    player.carried.push({ kind: 'gene', from: it.from });
    audio.powerUp?.(0, 3, 500);
    controls.rumble?.(0.5, 0.4, 300);
    tell(t('gene.taken'), 7);
    bus.emit('player:gene', { from: it.from });
  }

  // ── os guardas: perto de um depósito guardado, a Cidade manda Safeguards altos ──
  let guardT = 0;
  function guard(dt) {
    guardT -= dt;
    const sg = world.safeguards;
    if (guardT > 0 || player.gene || !sg?.enabled || controls.mode !== 'walk' || ctx.wake?.active) return;
    const g = here();
    const v = vaultsNear(F(), g.x, g.y, g.z, GUARD_R + 50).find((x) => F().vaultGuarded(x) && Math.hypot(x.x - g.x, x.z - g.z) < GUARD_R);
    if (!v) return;
    guardT = GUARD_EVERY;
    const before = new Set(sg.hunters);
    const made = sg.emerge(g, world.origin, 3);
    // (perto demais das paredes dele, a busca de placas não acha nada: saem da própria fachada do
    //  depósito, dos dois lados da porta)
    if (made < 3) {
      const d = v.door;
      const ax = d === 0 ? [1, 0] : d === 1 ? [-1, 0] : d === 2 ? [0, 1] : [0, -1];
      const cx = [-ax[1], ax[0]];
      const ha = d < 2 ? v.hx : v.hz;
      const hc = d < 2 ? v.hz : v.hx;
      const off = v.doorOff * hc;
      for (const c of [off - 7, off + 7, off - 12].slice(0, 3 - made)) {
        const wx = v.x + ax[0] * ha + cx[0] * c;
        const wz = v.z + ax[1] * ha + cx[1] * c;
        const nrm = new THREE.Vector3(ax[0], 0, ax[1]);
        const wall = new THREE.Vector3(wx, v.y + 1.2, wz);
        sg._spawnHunter({ wall, nrm, front: wall.clone().addScaledVector(nrm, 0.9) }, g);
      }
    }
    const levels = [];
    for (const h of sg.hunters) {
      if (before.has(h)) continue;
      h.level = 'high';
      levels.push(h.level);
    }
    if (levels.length) bus.emit('gene:guards', { vault: v.id, n: levels.length, levels });
  }

  // ── perder: no desmaio o gene (ou a amostra) se perde — o gene volta para onde estava ──
  let carrying = null; // { kind, from } o que se levava no último quadro
  bus.on('player:wake', () => {
    const lost = carrying;
    for (let i = player.carried.length - 1; i >= 0; i--) if (player.carried[i].kind === 'gene' || player.carried[i].kind === 'sample') player.carried.splice(i, 1);
    if (!lost) return;
    if (lost.kind === 'gene') {
      // de volta ao depósito (ou ao andarilho que o tinha levado)
      if (loot()[`gene:${lost.from}`] !== 'dropped') delete loot()[`gene:${lost.from}`];
      else loot()[`gene:${lost.from}`] = 'lost';
    }
    carrying = null;
    setTimeout(() => tell(t(lost.kind === 'gene' ? 'gene.lost' : 'gene.sampleLost'), 7), 4000);
    bus.emit('gene:lost', lost);
  });

  // ── o implante e o que muda ──
  function implanted() {
    const it = item();
    if (it) player.carried.splice(player.carried.indexOf(it), 1);
    player.gene = true;
    carrying = null;
    // os Safeguards param de caçar (G5)
    const sg = world.safeguards;
    for (const e of sg?.all() ?? []) if (['hunt', 'search', 'strike', 'summon'].includes(e.sg.state)) sg._lose(e);
    // o mapa: o que a Netsfera sabe — as estruturas únicas da região
    const g = here();
    let n = 0;
    for (const u of F().uniquesNear(g.x, g.y, g.z, 60000)) {
      reveal(u, { id: 'gene', x: g.x, y: g.y, z: g.z });
      n++;
    }
    bus.emit('player:implanted', { map: n });
    tell(t('gene.implanted'), 8);
    setTimeout(() => chooseEnding(), 2500);
  }

  // ── o final: uma escolha ──
  function chooseEnding() {
    if (!player.gene) return;
    ctx.people.choice(t('ending.who'), t('ending.ask'), [
      { id: 'keep', label: t('ending.opt.keep') },
      { id: 'destroy', label: t('ending.opt.destroy') },
      { id: 'village', label: t('ending.opt.village') },
    ], (id) => {
      if (id === 'keep') {
        slot.ending = 'keep';
        tell(t('ending.keep'), 8);
        bus.emit('ending', { kind: 'keep' });
      } else if (id === 'destroy') destroy();
      else {
        slot.ending = 'pending-village';
        tell(t('ending.toVillage'), 8);
        bus.emit('ending', { kind: 'pending-village' });
      }
    });
  }

  /** Destruir: a Cidade desaba — tremor, baques, o escuro; depois o fim. */
  let destroying = null;
  function destroy() {
    slot.ending = 'destroy';
    destroying = { t: 0, next: 0 };
    bus.emit('ending', { kind: 'destroy' });
  }

  // a tela do fim
  const el = document.createElement('div');
  el.id = 'ending';
  el.style.cssText = 'position:fixed;inset:0;background:#000;color:#b8c4b4;display:none;flex-direction:column;align-items:center;justify-content:center;font:16px Consolas,monospace;letter-spacing:.08em;z-index:50;text-align:center;padding:16px;opacity:0;transition:opacity 3s';
  document.body.appendChild(el);
  let endingShown = 0;
  function showEnding(kind) {
    el.innerHTML = [1, 2, 3].map((i) => `<p style="margin:.9em 0;max-width:640px">${t(`ending.${kind}.${i}`)}</p>`).join('') + `<p style="margin-top:3em;opacity:.55;font-size:13px">${t('ending.hint', { key: bindings.label('use') })}</p>`;
    el.style.display = 'flex';
    requestAnimationFrame(() => (el.style.opacity = '1'));
    endingShown = performance.now();
    document.exitPointerLock?.();
    bus.emit('ending:shown', { kind });
  }
  const leave = () => {
    if (!endingShown || performance.now() - endingShown < 3000) return;
    location.reload(); // de volta à tela de entrada (o mundo salvo lembra o fim)
  };
  document.addEventListener('keydown', leave);
  el.addEventListener('click', leave);

  return {
    get implanted() {
      return !!player.gene;
    },
    get hasAnalyzer() {
      return hasAnalyzer();
    },
    giveAnalyzer,
    /** o gene (ou a amostra) a implantar? (app/arms.js — o berço) */
    canImplant: () => !player.gene && !!item(),
    implantDone: implanted,
    chooseEnding,
    showEnding,
    /** (testes) os genes em cena */
    get genes() {
      return genes;
    },
    /** o traço do gene num ser (0..1) — o analisador */
    traceOf(e) {
      const h = hash4(F().seed, e.id.length, e.id.charCodeAt(3) || 1, e.id.charCodeAt(e.id.length - 1), 2211);
      return e.npc?.carrier ? 0.82 + 0.14 * h : 0.04 * h;
    },
    /** o aviso no aparelho (app/carried.js) */
    get hint() {
      return nearGene() ? t('gene.hint', { key: bindings.label('use') }) : null;
    },
    tryUse() {
      if (endingShown) {
        leave();
        return true;
      }
      const ng = nearGene();
      if (ng) {
        take(ng);
        return true;
      }
      return false;
    },
    update(dt) {
      // (um mundo novo traz um sistema de NPCs novo: liga de novo)
      if (world.npcs && world.npcs.geneItemFor !== geneItemFor) world.npcs.geneItemFor = geneItemFor;
      if ((scanT -= dt) <= 0) {
        scanT = 1;
        scan();
      }
      for (const it of genes.values()) it.mesh.position.set(it.p.x - world.origin.x, it.p.y - world.origin.y, it.p.z - world.origin.z);
      const it = item();
      carrying = it ? { kind: it.kind, from: it.from } : carrying && !ctx.wake?.active ? null : carrying;
      guard(dt);
      // o pad também fecha a tela do fim (qualquer botão)
      if (endingShown && performance.now() - endingShown > 3000) {
        for (const pad of navigator.getGamepads?.() ?? []) if (pad?.buttons.some((b) => b.pressed)) leave();
      }
      if (destroying) {
        const d = destroying;
        d.t += dt;
        const U = ctx.signal.uniforms;
        if (d.t >= d.next) {
          d.next = d.t + 0.3 + Math.random() * 0.6;
          audio.impact?.(20 + Math.random() * 30);
          audio.clangAt?.((Math.random() - 0.5) * 2, 20 + Math.random() * 200);
          controls.rumble?.(1, 1, 400);
        }
        controls.pitch += (Math.random() - 0.5) * 0.02 * Math.min(1, d.t / 2);
        controls.yaw += (Math.random() - 0.5) * 0.02 * Math.min(1, d.t / 2);
        U.uBlack.value = Math.min(1, Math.max(0, (d.t - 4) / 4));
        if (d.t > 8) {
          destroying = null;
          showEnding('destroy');
        }
      }
    },
  };
}
