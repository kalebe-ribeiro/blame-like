// ─────────────────────────────────────────────────────────────────────────────
//  Menus pelo controle de videogame. REGRA ABSOLUTA do projeto: tudo que se
//  faz com teclado e mouse tem de dar para fazer só com o controle.
//
//  Quando há um menu/painel aberto (a "camada" de cima: aba CONTROLES,
//  configurações, transporte, mundos, leitura, mapa ou a tela de entrada), o
//  controle deixa de andar (bindings.uiActive) e passa a navegar nele:
//
//    direcional / analógico esquerdo   move o foco (o mais perto naquela direção)
//    A                                 aperta o que está em foco
//    B                                 volta (fecha o painel)
//    ← →  num controle deslizante      muda o valor · numa lista, troca a opção
//    LB / RB                           aba anterior / seguinte (diário)
//    analógico direito                 rola a lista · no mapa, gira
//    LT / RT                           no mapa, afasta / aproxima
//    START (atalho 'menu')             abre a tela de entrada; nela, volta ao jogo
//
//  Estes botões dos menus são fixos (a aba CONTROLES os mostra). Um elemento
//  novo entra na navegação sozinho se for <button>, <input>, <select>, uma aba
//  [data-tab], uma linha [data-id] do arquivo, ou tiver [data-nav].
// ─────────────────────────────────────────────────────────────────────────────
import { bindings } from '../controls/bindings.js';

const A = 0;
const B = 1;
const LB = 4;
const RB = 5;
const LT = 6;
const RT = 7;
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;
const FOCUSABLE = 'button, input, select, [data-tab], [data-id], [data-nav]';
const REPEAT_DELAY = 0.38; // s até o direcional segurado repetir
const REPEAT_EVERY = 0.11;

/**
 * @param {object} o
 *   layers()       [{ el, back(), scroll?(dy), map? }] de cima para baixo — o primeiro aberto manda
 *   onMenu()       START fora dos menus (abre a tela de entrada)
 */
export function createPadNav(o) {
  let prev = [];
  let focus = null;
  let layerEl = null;
  let held = null; // direção segurada: { dir, next }
  let last = performance.now();

  // (offsetParent não serve: é sempre null para position: fixed — os painéis todos)
  const visible = (el) => !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';

  function focusables(root) {
    return [...root.querySelectorAll(FOCUSABLE)].filter((el) => visible(el) && !el.disabled && !el.closest('.pad-skip'));
  }

  function setFocus(el) {
    if (focus === el) return;
    focus?.classList.remove('pad-focus');
    focus?.closest('.settings-row')?.classList.remove('pad-focus-row');
    focus = el;
    if (!el) return;
    el.classList.add('pad-focus');
    el.closest('.settings-row')?.classList.add('pad-focus-row');
    el.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }

  /**
   * O vizinho na direção (dx,dy): a linha (ou coluna) seguinte primeiro — o
   * mais perto no eixo — e, nela, o mais alinhado. Só vale o que está num cone
   * naquela direção; ← → ficam na mesma linha.
   */
  function move(dx, dy) {
    const list = focusables(layerEl);
    if (!list.length) return;
    if (!focus || !list.includes(focus)) return setFocus(list[0]);
    const r0 = focus.getBoundingClientRect();
    const c0 = [r0.left + r0.width / 2, r0.top + r0.height / 2];
    const cands = [];
    for (const el of list) {
      if (el === focus) continue;
      const r = el.getBoundingClientRect();
      // distância no eixo: da borda de um à borda do outro (elementos de tamanhos diferentes)
      const along = dy ? (dy > 0 ? r.top - r0.bottom : r0.top - r.bottom) : dx > 0 ? r.left - r0.right : r0.left - r.right;
      if (along < -2) continue;
      const c = [r.left + r.width / 2, r.top + r.height / 2];
      const across = dy ? Math.abs(c[0] - c0[0]) : Math.abs(c[1] - c0[1]);
      if (dx && (r.bottom <= r0.top + 2 || r.top >= r0.bottom - 2)) continue; // ← →: só na mesma linha
      if (dy && across > Math.max(0, along) * 3 + Math.max(r0.width, r.width)) continue; // ↑ ↓: um cone largo
      cands.push({ el, along: Math.max(0, along), across });
    }
    if (!cands.length) return;
    const near = Math.min(...cands.map((c) => c.along));
    const row = cands.filter((c) => c.along <= near + 14);
    row.sort((a, b) => a.across - b.across);
    setFocus(row[0].el);
  }

  /** ← → num controle deslizante ou numa lista: muda o valor em vez de mover o foco. */
  function adjust(dir) {
    const el = focus;
    if (el?.tagName === 'INPUT' && el.type === 'range') {
      const step = Number(el.step) || 1;
      const v = Math.min(Number(el.max), Math.max(Number(el.min), Number(el.value) + dir * step));
      el.value = String(v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return true;
    }
    if (el?.tagName === 'SELECT') {
      const n = el.options.length;
      el.selectedIndex = (el.selectedIndex + dir + n) % n;
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    }
    return false;
  }

  function press() {
    const el = focus;
    if (!el) return;
    if (el.tagName === 'INPUT' && el.type === 'checkbox') {
      el.checked = !el.checked;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (el.tagName === 'INPUT' && el.type === 'range') {
      // A num controle deslizante não faz nada (← → mudam o valor)
    } else {
      el.click();
    }
  }

  function tab(dir) {
    const tabs = [...layerEl.querySelectorAll('[data-tab]')].filter(visible);
    if (!tabs.length) return;
    const on = tabs.findIndex((t) => t.classList.contains('on'));
    tabs[(on + dir + tabs.length) % tabs.length].click();
    // o conteúdo foi refeito: o foco vai para a aba nova
    requestAnimationFrame(() => setFocus(layerEl.querySelector('[data-tab].on')));
  }

  /** Rola o que der para rolar: o painel da camada (ou o do foco). */
  function scroll(dy, layer) {
    if (layer.scroll) return layer.scroll(dy);
    let el = focus;
    while (el && el !== layerEl && !(el.scrollHeight > el.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement;
    if (!el || el === layerEl) el = [...layerEl.querySelectorAll('*')].find((x) => x.scrollHeight > x.clientHeight + 2 && /auto|scroll/.test(getComputedStyle(x).overflowY));
    if (el) el.scrollTop += dy;
  }

  function tick(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    requestAnimationFrame(tick);
    const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected && p.mapping === 'standard') ?? [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected);
    const layer = o.layers().find((l) => visible(l.el) || l.open?.());
    bindings.uiActive = !!layer;
    if (!gp) return;
    const down = gp.buttons.map((b) => b.pressed || (b.value ?? 0) > 0.4);
    const was = prev;
    prev = down;
    const edge = (i) => i !== null && i !== undefined && down[i] && !was[i];
    // a aba CONTROLES está esperando um botão: ninguém mais reage
    if (bindings.capturing) return;

    const menuBtn = bindings.pad('menu');
    if (!layer) {
      if (layerEl) setFocus(null);
      layerEl = null;
      if (menuBtn !== null && menuBtn !== undefined && down[menuBtn] && !was[menuBtn]) o.onMenu();
      return;
    }
    if (down.some(Boolean) || gp.axes.some((a) => Math.abs(a) > 0.5)) bindings.lastDevice = 'pad';
    if (layer.el !== layerEl) {
      // camada nova: foco no primeiro elemento (ou no que ela pedir)
      layerEl = layer.el;
      setFocus(null);
      const list = focusables(layerEl);
      setFocus(layerEl.querySelector('.pad-first') && visible(layerEl.querySelector('.pad-first')) ? layerEl.querySelector('.pad-first') : list[0] ?? null);
    } else if (focus && !layerEl.contains(focus)) {
      // o painel se redesenhou: foco de volta no primeiro
      setFocus(focusables(layerEl)[0] ?? null);
    }
    if (bindings.lastDevice !== 'pad') focus?.classList.remove('pad-focus');
    else focus?.classList.add('pad-focus');

    const ax = gp.axes;
    // mapa: analógicos giram, gatilhos aproximam; B / o botão do mapa fecham
    if (layer.map) {
      const rx = Math.abs(ax[2] ?? 0) > 0.15 ? ax[2] : Math.abs(ax[0] ?? 0) > 0.15 ? ax[0] : 0;
      const ry = Math.abs(ax[3] ?? 0) > 0.15 ? ax[3] : Math.abs(ax[1] ?? 0) > 0.15 ? ax[1] : 0;
      const zoom = (gp.buttons[RT]?.value ?? 0) - (gp.buttons[LT]?.value ?? 0) + (down[UP] ? 1 : 0) - (down[DOWN] ? 1 : 0);
      layer.map.nudge(rx * dt * 1.6, ry * dt * 1.2, zoom * dt * 1.4);
      if (edge(B) || (menuBtn !== null && edge(menuBtn))) layer.back();
      return;
    }

    if (edge(B)) return layer.back();
    // leitura: o botão de "usar" (Y) também fecha, como a tecla E
    const useBtn = bindings.pad('use');
    if (layer.lines && useBtn !== null && edge(useBtn)) return layer.back();
    if (menuBtn !== null && edge(menuBtn)) return (layer.menu ?? layer.back)();
    if (edge(A)) press();
    if (edge(LB)) tab(-1);
    if (edge(RB)) tab(1);
    const ry = ax[3] ?? 0;
    if (Math.abs(ry) > 0.2) scroll(ry * dt * 900, layer);

    // direcional (ou analógico esquerdo): um passo, e repete se segurar
    const lx = ax[0] ?? 0;
    const ly = ax[1] ?? 0;
    const dir = down[UP] || ly < -0.55 ? 'up' : down[DOWN] || ly > 0.55 ? 'down' : down[LEFT] || lx < -0.55 ? 'left' : down[RIGHT] || lx > 0.55 ? 'right' : null;
    if (!dir) {
      held = null;
      return;
    }
    const t = now / 1000;
    if (held?.dir === dir && t < held.next) return;
    held = { dir, next: t + (held?.dir === dir ? REPEAT_EVERY : REPEAT_DELAY) };
    if (layer.lines) {
      // leitura: não há o que focar — o direcional rola o texto
      if (dir === 'up' || dir === 'down') layer.scroll(dir === 'up' ? -30 : 30);
      return;
    }
    if ((dir === 'left' || dir === 'right') && adjust(dir === 'left' ? -1 : 1)) return;
    move(dir === 'left' ? -1 : dir === 'right' ? 1 : 0, dir === 'up' ? -1 : dir === 'down' ? 1 : 0);
  }
  requestAnimationFrame(tick);

  return {
    /** Tira o foco (um painel fechou por fora). */
    reset() {
      setFocus(null);
      layerEl = null;
    },
  };
}
