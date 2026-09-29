// ─────────────────────────────────────────────────────────────────────────────
//  Painel de transporte (tecla T, ou o botão na tela de entrada).
//  Um botão por tipo de lugar; o destino é o exemplar mais próximo daquele
//  tipo (clicar de novo leva a outro). A busca em si fica em world/teleport.js.
// ─────────────────────────────────────────────────────────────────────────────
import { DESTINATIONS } from '../world/teleport.js';
import { t, onLangChange } from '../i18n/index.js';

export class TransportPanel {
  /** @param {(kind: string, label: string) => boolean} onPick  true = transportou */
  constructor(onPick) {
    this.onPick = onPick;
    this.onClose = null;
    this.el = this._build();
    document.body.appendChild(this.el);
    onLangChange(() => this._relabel());
    this._relabel();
  }

  _relabel() {
    this.el.querySelector('.settings-title').textContent = t('transport.title');
    this.el.querySelector('[data-act="close"]').textContent = t('transport.back');
    for (const el of this.el.querySelectorAll('[data-group]')) el.textContent = t(`dest.group.${el.dataset.group}`);
    for (const el of this.el.querySelectorAll('[data-kind]')) el.textContent = t(`dest.${el.dataset.kind}`);
    this.status.textContent = t('transport.status');
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  open() {
    this.status.textContent = t('transport.status');
    this.el.classList.add('open');
  }

  close() {
    this.el.classList.remove('open');
    this.onClose?.();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'transport';
    root.className = 'panel';
    const groups = [...new Set(DESTINATIONS.map((d) => d.group))];
    root.innerHTML = `
      <div class="settings-box">
        <div class="settings-title"></div>
        ${groups
          .map(
            (g) => `<div class="transport-group" data-group="${g}"></div>
          <div class="transport-grid">${DESTINATIONS.filter((d) => d.group === g)
            .map((d) => `<button data-kind="${d.kind}"></button>`)
            .join('')}</div>`,
          )
          .join('')}
        <div class="settings-hint transport-status"></div>
        <div class="settings-actions">
          <span></span>
          <button data-act="close"></button>
        </div>
      </div>`;
    this.status = root.querySelector('.transport-status');
    root.addEventListener('click', (e) => {
      e.stopPropagation();
      const target = e.target;
      if (target?.dataset?.act === 'close') return this.close();
      const kind = target?.dataset?.kind;
      if (!kind) return;
      const label = t(`dest.${kind}`);
      this.status.textContent = t('transport.searching');
      // deixa o texto aparecer antes da busca (que pode levar alguns ms)
      setTimeout(() => {
        if (this.onPick(kind, label)) this.close();
        else this.status.textContent = t('transport.none', { label });
      }, 16);
    });
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close();
    });
    return root;
  }
}
