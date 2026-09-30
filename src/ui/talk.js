// ─────────────────────────────────────────────────────────────────────────────
//  A conversa (fase 7): E diante de alguém. Pouca fala — quem fala diz uma ou
//  duas frases curtas; você responde escolhendo o que fazer (uma troca), nunca
//  com texto. Navegável pelo controle (ui/padNav.js: os botões são [data-id]).
// ─────────────────────────────────────────────────────────────────────────────
import { t } from '../i18n/index.js';

export class TalkPanel {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'talk';
    this.el.innerHTML = `
      <div class="talk-box">
        <div class="talk-who"></div>
        <div class="talk-line"></div>
        <div class="talk-opts"></div>
      </div>`;
    document.body.appendChild(this.el);
    this.whoEl = this.el.querySelector('.talk-who');
    this.lineEl = this.el.querySelector('.talk-line');
    this.optsEl = this.el.querySelector('.talk-opts');
    this.onPick = null;
    this.optsEl.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-id]');
      if (b) this.onPick?.(b.dataset.id);
    });
    this.el.addEventListener('click', (e) => e.stopPropagation());
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  /** who: rótulo de quem fala · line: o que diz · opts: [{ id, label }] */
  open(who, line, opts) {
    this.whoEl.textContent = who;
    this.show(line, opts);
    this.el.classList.add('open');
  }

  show(line, opts) {
    this.lineEl.textContent = line ? `“${line}”` : '';
    this.optsEl.innerHTML = '';
    for (const o of opts) {
      const b = document.createElement('button');
      b.dataset.id = o.id;
      b.textContent = o.label;
      this.optsEl.appendChild(b);
    }
  }

  close() {
    this.el.classList.remove('open');
  }

  static leaveLabel() {
    return t('talk.leave');
  }
}
