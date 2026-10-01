// ─────────────────────────────────────────────────────────────────────────────
//  A conversa (fase 7): E diante de alguém. Pouca fala — quem fala diz uma ou
//  duas frases curtas; você responde escolhendo o que fazer (uma troca), nunca
//  com texto. Navegável pelo controle (ui/padNav.js: os botões são [data-id]) e
//  pelo teclado: W/S (ou ↑ ↓) escolhem, E (ou Enter, Espaço) confirma, 1–9 vão
//  direto, Esc fecha — sem abrir o menu.
// ─────────────────────────────────────────────────────────────────────────────
import { t } from '../i18n/index.js';
import { bindings } from '../controls/bindings.js';

export class TalkPanel {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'talk';
    this.el.innerHTML = `
      <div class="talk-box">
        <div class="talk-who"></div>
        <div class="talk-line"></div>
        <div class="talk-opts"></div>
        <div class="talk-hint"></div>
      </div>`;
    document.body.appendChild(this.el);
    this.whoEl = this.el.querySelector('.talk-who');
    this.lineEl = this.el.querySelector('.talk-line');
    this.optsEl = this.el.querySelector('.talk-opts');
    this.hintEl = this.el.querySelector('.talk-hint');
    this.onPick = null;
    this.onClose = null;
    this.sel = 0;
    // o teclado (com a conversa aberta, as teclas são dela — app/ui.js e o corpo não as veem)
    document.addEventListener('keydown', (e) => {
      // (a tecla que abriu a conversa não escolhe a primeira resposta)
      if (!this.isOpen || e.repeat || performance.now() - this.openedAt < 150) return;
      const btns = [...this.optsEl.querySelectorAll('button[data-id]')];
      if (!btns.length) return;
      const c = e.code;
      if (c === 'KeyW' || c === 'ArrowUp') this._select(this.sel - 1);
      else if (c === 'KeyS' || c === 'ArrowDown') this._select(this.sel + 1);
      else if (c === 'KeyE' || c === 'Enter' || c === 'Space' || c === 'NumpadEnter') btns[this.sel]?.click();
      else if (/^Digit[1-9]$/.test(c)) btns[Number(c.slice(5)) - 1]?.click();
      else if (c === 'Escape') this.onClose?.();
      else return;
      e.preventDefault();
      e.stopPropagation();
    });
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
    this.openedAt = performance.now();
    this.show(line, opts);
    this.el.classList.add('open');
  }

  show(line, opts) {
    this.lineEl.textContent = line ? `“${line}”` : '';
    this.optsEl.innerHTML = '';
    opts.forEach((o, i) => {
      const b = document.createElement('button');
      b.dataset.id = o.id;
      b.innerHTML = `<span class="talk-n">${i + 1}</span>${o.label}`;
      b.addEventListener('mouseenter', () => this._select(i));
      this.optsEl.appendChild(b);
    });
    this._select(0);
    this.hintEl.textContent = t(bindings.lastDevice === 'pad' ? 'talk.keysPad' : 'talk.keys');
  }

  _select(i) {
    const btns = [...this.optsEl.querySelectorAll('button[data-id]')];
    if (!btns.length) return;
    this.sel = (i + btns.length) % btns.length;
    btns.forEach((b, k) => b.classList.toggle('kb-sel', k === this.sel));
  }

  close() {
    this.el.classList.remove('open');
  }

  static leaveLabel() {
    return t('talk.leave');
  }
}
