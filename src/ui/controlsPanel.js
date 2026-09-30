// ─────────────────────────────────────────────────────────────────────────────
//  Aba CONTROLES (atalho K, ou o botão na tela de entrada): todas as teclas e
//  botões do controle deste modo de jogo, trocáveis (controls/bindings.js).
//
//  Clicar numa célula espera a próxima tecla (ou o próximo botão do controle);
//  ESC cancela, Backspace/Delete tira o atalho. Se a tecla já era de outra
//  ação deste modo, as duas trocam — e a aba avisa.
// ─────────────────────────────────────────────────────────────────────────────
import { t, onLangChange } from '../i18n/index.js';
import { bindings, keyName, padName } from '../controls/bindings.js';

const GROUPS = ['move', 'act', 'ui'];

export class ControlsPanel {
  constructor() {
    this.onClose = null;
    this.waiting = null; // { kind: 'key'|'pad', id, cell }
    this.note = '';
    this.el = document.createElement('div');
    this.el.id = 'controls';
    this.el.innerHTML = `
      <div class="settings-box controls-box">
        <div class="settings-title"></div>
        <div class="controls-head"><span></span><span class="c-key"></span><span class="c-pad"></span></div>
        <div class="controls-rows"></div>
        <div class="controls-note"></div>
        <div class="settings-actions">
          <button data-act="reset"></button>
          <button data-act="close"></button>
        </div>
      </div>`;
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      e.stopPropagation(); // não entra no mundo
      const act = e.target?.dataset?.act;
      if (act === 'close') this.close();
      if (act === 'reset') {
        this._cancel();
        bindings.reset();
        this.note = t('controls.resetDone');
        this._render();
      }
      const cell = e.target.closest?.('[data-bind]');
      if (cell) this._wait(cell.dataset.kind, cell.dataset.bind, cell);
    });
    // a tecla esperada é pega antes de qualquer outro ouvinte (fase de captura)
    window.addEventListener('keydown', (e) => this._onKey(e), true);
    onLangChange(() => this.isOpen && this._render());
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  open() {
    this.note = '';
    this._render();
    this.el.classList.add('open');
  }

  close() {
    this._cancel();
    this.el.classList.remove('open');
    this.onClose?.();
  }

  _render() {
    this.el.querySelector('.settings-title').textContent = t('controls.title');
    this.el.querySelector('.c-key').textContent = t('controls.keyboard');
    this.el.querySelector('.c-pad').textContent = t('controls.gamepad');
    this.el.querySelector('[data-act="reset"]').textContent = t('settings.reset');
    this.el.querySelector('[data-act="close"]').textContent = t('settings.back');
    const rows = this.el.querySelector('.controls-rows');
    const list = bindings.list();
    let html = '';
    for (const g of GROUPS) {
      const acts = list.filter((a) => a.group === g);
      if (!acts.length) continue;
      html += `<div class="controls-group">${t(`controls.group.${g}`)}</div>`;
      for (const a of acts) {
        html +=
          `<div class="controls-row"><span class="settings-label">${t(`controls.action.${a.id}${a.id === 'jump' && !bindings.available('descend') ? '.walk' : ''}`)}</span>` +
          `<button class="controls-cell" data-kind="key" data-bind="${a.id}">${keyName(bindings.key(a.id))}</button>` +
          `<button class="controls-cell" data-kind="pad" data-bind="${a.id}">${padName(bindings.pad(a.id))}</button></div>`;
      }
    }
    // o que não se troca
    html += `<div class="controls-group">${t('controls.group.fixed')}</div>`;
    for (const [label, key, pad] of [
      [t('controls.fixed.look'), t('controls.fixed.mouse'), t('controls.fixed.rs')],
      [t('controls.fixed.walk'), '—', t('controls.fixed.ls')],
      [t('controls.fixed.release'), 'ESC', '—'],
      [t('controls.fixed.fullscreen'), 'F11', '—'],
    ]) {
      html += `<div class="controls-row fixed"><span class="settings-label">${label}</span><span class="controls-cell">${key}</span><span class="controls-cell">${pad}</span></div>`;
    }
    rows.innerHTML = html;
    this.el.querySelector('.controls-note').textContent = this.note || t('controls.hint');
  }

  _wait(kind, id, cell) {
    this._cancel();
    this.waiting = { kind, id };
    bindings.capturing = true;
    cell.textContent = t(kind === 'key' ? 'controls.pressKey' : 'controls.pressButton');
    cell.classList.add('waiting');
    if (kind === 'pad') this._pollPad();
  }

  _cancel() {
    if (!this.waiting) return;
    this.waiting = null;
    bindings.capturing = false;
    cancelAnimationFrame(this._raf);
    this._render();
  }

  _done(kind, id, value) {
    const swapped = value === null ? (bindings.clear(kind, id), []) : bindings.set(kind, id, value);
    this.note = swapped.length
      ? t('controls.swapped', { a: t(`controls.action.${id}`), b: swapped.map((o) => t(`controls.action.${o}`)).join(', ') })
      : '';
    this.waiting = null;
    // solta a captura só no próximo quadro: a própria tecla não dispara a ação
    requestAnimationFrame(() => {
      bindings.capturing = false;
    });
    this._render();
  }

  _onKey(e) {
    if (!this.waiting) {
      if (this.isOpen && e.key === 'Escape') this.close();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') return this._cancel();
    if (e.code === 'Backspace' || e.code === 'Delete') return this._done(this.waiting.kind, this.waiting.id, null);
    if (this.waiting.kind === 'pad') return;
    if (!bindings.canUseKey(e.code)) return;
    this._done('key', this.waiting.id, e.code);
  }

  /** Espera um botão do controle: o primeiro que for apertado (e não estava antes). */
  _pollPad() {
    const pressedNow = () => {
      const gp = [...(navigator.getGamepads?.() ?? [])].find((p) => p && p.connected);
      return gp ? gp.buttons.map((b) => b.pressed || (b.value ?? 0) > 0.4) : [];
    };
    const before = pressedNow();
    const tick = () => {
      if (!this.waiting || this.waiting.kind !== 'pad') return;
      const now = pressedNow();
      const i = now.findIndex((p, k) => p && !before[k]);
      if (i >= 0) return this._done('pad', this.waiting.id, i);
      now.forEach((p, k) => {
        if (!p) before[k] = false; // soltou: vale apertar de novo
      });
      this._raf = requestAnimationFrame(tick);
    };
    this._raf = requestAnimationFrame(tick);
  }
}
