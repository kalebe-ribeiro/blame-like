// ─────────────────────────────────────────────────────────────────────────────
//  Painel MUNDOS (tela de entrada): escolher o modo de jogo antes de entrar.
//  Um mundo salvo por modo (Livre e Peregrinação). Para cada um: continuar,
//  ou começar um mundo novo — o que substitui o mundo salvo daquele modo
//  (pede confirmação).
//
//  Trocar de mundo recarrega o jogo (app/ui.js): o mundo inteiro é refeito.
//
//  Seeds compartilháveis (app/share.js): COPIAR CÓDIGO de um mundo salvo (a
//  seed, o modo e as marcas), e COLAR CÓDIGO para começar um mundo a partir de
//  um código (substitui o mundo salvo daquele modo — pede confirmação).
// ─────────────────────────────────────────────────────────────────────────────
import { t, onLangChange, fmtDist } from '../i18n/index.js';
import { MODE_IDS, loadSlot } from '../app/saves.js';
import { encodeWorld, decodeWorld, copyText, pasteText } from '../app/share.js';

export class WorldsPanel {
  /**
   * @param {object} opts
   *   current    modo do mundo aberto agora (ou null, se nenhum foi escolhido)
   *   onContinue (mode) — abrir o mundo salvo daquele modo
   *   onNew      (mode) — começar um mundo novo naquele modo
   */
  constructor({ current, onContinue, onNew, onImport, liveSlot }) {
    this.current = current;
    this.onContinue = onContinue;
    this.onNew = onNew;
    this.onImport = onImport; // (world { seed, mode, marks }) — começar a partir de um código
    this.liveSlot = liveSlot; // () → o mundo aberto agora (o salvo pode estar uns segundos atrás)
    this.pasted = null; // o código colado, esperando a confirmação
    this.note = '';
    this.onClose = null;
    this.confirming = null; // modo esperando a confirmação de "novo mundo"
    this.el = document.createElement('div');
    this.el.id = 'worlds';
    this.el.className = 'panel';
    document.body.appendChild(this.el);
    this.el.addEventListener('click', (e) => this._click(e));
    this.el.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape' && this.current) this.close();
    });
    onLangChange(() => this.isOpen && this._render());
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  open() {
    this.confirming = null;
    this.pasted = null;
    this.note = '';
    this._render();
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    this.onClose?.();
  }

  _render() {
    const rows = MODE_IDS.map((mode) => {
      const slot = loadSlot(mode);
      const active = mode === this.current;
      let status = t('worlds.empty');
      if (slot) {
        const d = slot.diary ?? {};
        const dist = (d.walked ?? 0) + (d.flown ?? 0) + (d.rode ?? 0);
        const min = Math.floor((d.time ?? 0) / 60);
        status = t('worlds.slot', { seed: slot.seed.toString(36).toUpperCase(), dist: fmtDist(dist), time: min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')} min` : `${min} min` });
      }
      const confirm = this.confirming === mode;
      return `
        <div class="worlds-row${active ? ' active' : ''}">
          <div class="worlds-name">${t(`mode.${mode}`)}${active ? ` <span class="worlds-current">${t('worlds.current')}</span>` : ''}</div>
          <div class="worlds-desc">${t(`mode.${mode}.desc`)}</div>
          <div class="worlds-status">${status}</div>
          <div class="worlds-actions">
            ${slot && !active ? `<button data-act="continue" data-mode="${mode}">${t('worlds.continue')}</button>` : ''}
            <button data-act="new" data-mode="${mode}" class="${confirm ? 'warn' : ''}">${confirm ? t('worlds.confirmNew') : t('worlds.new')}</button>
            ${slot || active ? `<button data-act="copy" data-mode="${mode}">${t('worlds.copy')}</button>` : ''}
          </div>
        </div>`;
    }).join('');
    this.el.innerHTML = `
      <div class="settings-box">
        <div class="settings-title">${t('worlds.title')}</div>
        ${rows}
        <div class="worlds-share">
          ${this.pasted
            ? `<span class="settings-hint">${t('worlds.pasted', { seed: this.pasted.seed.toString(36).toUpperCase(), mode: t(`mode.${this.pasted.mode}`), n: this.pasted.marks.length })}</span>
               <button data-act="import" class="warn">${t(loadSlot(this.pasted.mode) ? 'worlds.importReplace' : 'worlds.import')}</button>`
            : `<button data-act="paste">${t('worlds.paste')}</button>`}
          <span class="settings-hint worlds-note">${this.note}</span>
        </div>
        <div class="settings-actions">
          <span class="settings-hint">${t('worlds.hint')}</span>
          ${this.current ? `<button data-act="close">${t('settings.back')}</button>` : ''}
        </div>
      </div>`;
  }

  _click(e) {
    e.stopPropagation(); // não deixa o clique entrar no mundo por trás
    const b = e.target?.closest?.('button');
    if (!b) return;
    const { act, mode } = b.dataset;
    if (act === 'close') return this.close();
    if (act === 'copy') {
      // o mundo aberto agora vem da memória (o salvo pode estar uns segundos atrás)
      const slot = (mode === this.current && this.liveSlot?.()) || loadSlot(mode);
      copyText(encodeWorld(slot))
        .then(() => (this.note = t('worlds.copied')))
        .catch(() => (this.note = t('worlds.copyFail')))
        .finally(() => this._render());
      return;
    }
    if (act === 'paste') {
      pasteText()
        .then((txt) => {
          this.pasted = decodeWorld(txt);
          this.note = this.pasted ? '' : t('worlds.badCode');
        })
        .catch(() => (this.note = t('worlds.badCode')))
        .finally(() => this._render());
      return;
    }
    if (act === 'import' && this.pasted) return this.onImport?.(this.pasted);
    if (act === 'continue') return this.onContinue(mode);
    if (act === 'new') {
      // substituir um mundo salvo pede um segundo clique
      if (loadSlot(mode) && this.confirming !== mode) {
        this.confirming = mode;
        return this._render();
      }
      this.onNew(mode);
    }
  }
}
