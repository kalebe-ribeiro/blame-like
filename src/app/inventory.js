// ─────────────────────────────────────────────────────────────────────────────
//  O inventário e as mãos.
//
//  O que você tem (ctx.player):
//    ferramentas   a lanterna (sempre) · o aparelho (Peregrinação: célula,
//                  leitor de terminais; o sensor é um módulo dele, quando achado)
//    carregado     as cargas (nas costas — app/people.js)
//  As MÃOS começam vazias (ctx.player.hands = { right, left }). Equipar uma
//  ferramenta: com as duas vazias, vai para a direita; com a direita ocupada, a
//  esquerda; com as duas ocupadas, troca a da direita. Usar uma ferramenta que
//  não está na mão (a lanterna, o sensor, a tomada, o leitor) a equipa antes.
//  Guardar: a mão fica vazia.
//
//  O painel (tecla 'inventory' — I / R3): a lista, com equipar/guardar; W/S
//  escolhem, E confirma, Esc ou I fecham; pelo controle, como os outros painéis.
// ─────────────────────────────────────────────────────────────────────────────
import { t } from '../i18n/index.js';
import { bindings } from '../controls/bindings.js';

export const TOOLS = ['lantern', 'device', 'emitter'];

export function createInventory(ctx) {
  const { controls, world } = ctx;
  const player = ctx.player;
  player.hands ??= { right: null, left: null };

  /** As ferramentas que você tem. */
  // (o emissor — a arma de Killy, app/beam.js — está com você desde o começo, nos dois modos)
  const tools = () => TOOLS.filter((id) => id === 'lantern' || id === 'emitter' || (id === 'device' && ctx.rules.resources && player.inventory.includes('reader')));
  const has = (id) => tools().includes(id);
  /** Em que mão está: 1 direita · −1 esquerda · 0 em nenhuma. */
  const sideOf = (id) => (player.hands.right === id ? 1 : player.hands.left === id ? -1 : 0);

  function equip(id) {
    if (!has(id) || sideOf(id)) return sideOf(id);
    const H = player.hands;
    // (um braço perdido — o emissor além do limite, app/beam.js — não segura nada)
    const A = player.arms ?? { right: true, left: true };
    if (!A.right && !A.left) return 0;
    if (A.right && !H.right) H.right = id;
    else if (A.left && !H.left) H.left = id;
    else if (A.right) H.right = id; // as duas ocupadas: troca a da direita
    else H.left = id;
    world.bus.emit('player:equip', { id, side: sideOf(id) });
    ctx.audio?.deviceClick?.(true);
    return sideOf(id);
  }

  function unequip(id) {
    const H = player.hands;
    if (H.right === id) H.right = null;
    if (H.left === id) H.left = null;
    world.bus.emit('player:unequip', { id });
  }

  // ── o painel ──
  const el = document.createElement('div');
  el.id = 'inventory';
  el.innerHTML = `<div class="inv-box"><div class="inv-title"></div><div class="inv-hands"></div><div class="inv-list"></div><div class="talk-hint inv-hint"></div></div>`;
  document.body.appendChild(el);
  const listEl = el.querySelector('.inv-list');
  let sel = 0;
  let openedAt = 0;
  const isOpen = () => el.classList.contains('open');

  const fmt = (d) => (d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`);
  const toolName = (id) => t(`inv.tool.${id}`);

  function render() {
    el.querySelector('.inv-title').textContent = t('inv.title');
    const H = player.hands;
    const A = player.arms ?? { right: true, left: true };
    // (R7: com um braço só, a linha do perdido avisa que o outro é o último — na Peregrinação)
    const last = ctx.rules.resources && A.right !== A.left;
    const metal = (side) => (player.armKind?.[side] === 'prosthesis' ? ` ${t('inv.metal')}` : '');
    const hand = (side) => (!A[side] ? t(last ? 'inv.armLostLast' : 'inv.armLost') : (H[side] ? toolName(H[side]) : t('inv.empty')) + metal(side));
    el.querySelector('.inv-hands').textContent = t('inv.hands', { right: hand('right'), left: hand('left') });
    const rows = [];
    for (const id of tools()) {
      const s = sideOf(id);
      rows.push({ name: toolName(id), desc: t(`inv.desc.${id}`), act: s ? 'unequip' : 'equip', id, label: s ? t('inv.unequip') : t('inv.equip'), where: s ? t(s > 0 ? 'inv.inRight' : 'inv.inLeft') : '' });
    }
    if (player.inventory.includes('sensor')) rows.push({ name: t('inv.tool.sensor'), desc: t('inv.desc.sensor'), act: null });
    if (player.inventory.includes('analyzer')) rows.push({ name: t('inv.tool.analyzer'), desc: t('inv.desc.analyzer'), act: null });
    if (player.gene) rows.push({ name: t('inv.geneImplanted'), desc: t('inv.geneImplantedDesc'), act: null });
    // o gene de terminal e a amostra (app/gene.js): até o implante, objetos que se perdem
    for (const c of player.carried) if (c.kind === 'gene' || c.kind === 'sample') rows.push({ name: t(`inv.${c.kind}`), desc: t(`inv.${c.kind}Desc`), act: null });
    const g = world.toGlobal(ctx.camera.position);
    for (const c of player.carried) {
      if (c.kind !== 'cargo') continue;
      const d = Math.hypot(c.x - g.x, c.y - g.y, c.z - g.z);
      rows.push({ name: t('inv.cargo', { what: t(`cargo.what.${c.what ?? 0}`) }), desc: t('inv.cargoDesc', { dist: fmt(d), reward: t(`cargo.reward.${c.reward?.kind ?? 'words'}`, { n: c.reward?.n ?? 5 }) }), act: null });
    }
    // a prótese (app/arms.js): vai com o que se carrega; instala-se daqui, parado
    for (const c of player.carried) {
      if (c.kind !== 'prosthesis') continue;
      const can = !A.right || !A.left;
      rows.push({ name: t('inv.prosthesis'), desc: t(can ? 'inv.prosthesisDesc' : 'inv.prosthesisWhole'), act: can ? 'install' : null, id: 'prosthesis', label: t('inv.install'), where: '' });
    }
    if (!rows.length) rows.push({ name: t('inv.nothing'), desc: '', act: null });
    listEl.innerHTML = rows
      .map(
        (r, i) => `<div class="inv-row"><div class="inv-name">${r.name}${r.where ? ` <span class="inv-where">${r.where}</span>` : ''}</div><div class="inv-desc">${r.desc}</div>${
          r.act ? `<button data-id="${r.act}:${r.id}" data-i="${i}">${r.label}</button>` : ''
        }</div>`,
      )
      .join('');
    el.querySelector('.inv-hint').textContent = t(bindings.lastDevice === 'pad' ? 'inv.keysPad' : 'inv.keys', { key: bindings.label('inventory') });
    select(sel);
  }

  function select(i) {
    const btns = [...listEl.querySelectorAll('button[data-id]')];
    if (!btns.length) return;
    sel = (i + btns.length) % btns.length;
    btns.forEach((b, k) => b.classList.toggle('kb-sel', k === sel));
  }

  function pick(id) {
    const [act, tool] = id.split(':');
    if (act === 'install') {
      close();
      ctx.arms?.installProsthesis();
      return;
    }
    if (act === 'equip') equip(tool);
    else unequip(tool);
    render();
  }

  listEl.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-id]');
    if (b) pick(b.dataset.id);
  });
  el.addEventListener('click', (e) => e.stopPropagation());

  function open() {
    if (isOpen() || ctx.wake?.active) return;
    sel = 0;
    openedAt = performance.now();
    document.exitPointerLock?.();
    render();
    el.classList.add('open');
  }

  function close() {
    if (!isOpen()) return;
    el.classList.remove('open');
    controls.lock();
  }

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (!isOpen()) {
      if (bindings.is('inventory', e.code) && (controls.locked || !document.querySelector('.panel.open, #reader.open, #talk.open'))) open();
      return;
    }
    if (performance.now() - openedAt < 150) return; // (a tecla que abriu)
    const c = e.code;
    const btns = [...listEl.querySelectorAll('button[data-id]')];
    if (c === 'KeyW' || c === 'ArrowUp') select(sel - 1);
    else if (c === 'KeyS' || c === 'ArrowDown') select(sel + 1);
    else if (c === 'KeyE' || c === 'Enter' || c === 'Space' || c === 'NumpadEnter') {
      if (btns[sel]) pick(btns[sel].dataset.id);
    } else if (c === 'Escape' || bindings.is('inventory', c)) close();
    else return;
    e.preventDefault();
    e.stopPropagation();
  });

  return {
    el,
    get isOpen() {
      return isOpen();
    },
    open,
    close,
    toggle: () => (isOpen() ? close() : open()),
    tools,
    has,
    sideOf,
    equip,
    unequip,
    /** Garante a ferramenta numa mão (usar algo que não está na mão a equipa). */
    ensure(id) {
      return sideOf(id) || equip(id);
    },
  };
}
