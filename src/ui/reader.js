// ─────────────────────────────────────────────────────────────────────────────
//  A tela de leitura (tecla E diante de um terminal): o texto do terminal no
//  centro, grande o bastante para ler com calma. As palavras já entendidas
//  aparecem no idioma do jogo; as outras, na escrita de estêncil. O que você
//  acabou de entender ao ler "se resolve" na frente dos seus olhos: primeiro
//  na escrita antiga, um instante depois na tradução.
// ─────────────────────────────────────────────────────────────────────────────
import { drawTokens } from '../lang/ancient.js';
import { t } from '../i18n/index.js';

const LINE_H = 24;

export class ReaderPanel {
  constructor() {
    this.el = document.createElement('div');
    this.el.id = 'reader';
    this.el.innerHTML = `
      <div class="reader-box">
        <canvas></canvas>
        <div class="reader-foot"><span class="reader-new"></span><span class="reader-hint"></span></div>
      </div>`;
    document.body.appendChild(this.el);
    this.canvas = this.el.querySelector('canvas');
    this.g = this.canvas.getContext('2d');
    this.newEl = this.el.querySelector('.reader-new');
    this.hintEl = this.el.querySelector('.reader-hint');
    this.scroll = 0;
    this.lines = [];
    this.el.addEventListener('wheel', (e) => {
      this.scroll = Math.max(0, Math.min(this._maxScroll(), this.scroll + Math.sign(e.deltaY) * LINE_H * 2));
      this._draw();
    });
    this.el.addEventListener('click', (e) => e.stopPropagation());
  }

  get isOpen() {
    return this.el.classList.contains('open');
  }

  /**
   * lines: linhas de tokens · known(w) · word(w) · learned: palavras entendidas agora
   * opts: { dim: true (fragmento do leitor portátil), note: texto do rodapé }
   */
  open(lines, known, word, learned = [], opts = {}) {
    this.lines = lines;
    this.known = known;
    this.word = word;
    this.learned = new Set(learned);
    this.opts = opts;
    this.scroll = 0;
    this.revealed = false;
    this.el.classList.add('open');
    this._size();
    this._draw();
    this.newEl.textContent = '';
    this.hintEl.textContent = opts.note ?? t('reader.hint');
    clearTimeout(this._timer);
    if (learned.length) {
      // um instante na escrita antiga, depois a palavra se resolve
      this._timer = setTimeout(() => {
        this.revealed = true;
        this._draw();
        this.newEl.textContent = t('reader.learned', { words: learned.map((w) => word(w)).join(' · ') });
      }, 1400);
    }
  }

  close() {
    clearTimeout(this._timer);
    this.el.classList.remove('open');
  }

  _size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.min(820, window.innerWidth * 0.8);
    const h = Math.min(520, window.innerHeight * 0.66);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.dpr = dpr;
    this.cw = w;
    this.ch = h;
  }

  _maxScroll() {
    return Math.max(0, this.lines.length * LINE_H + 40 - this.ch);
  }

  _draw() {
    const { g, dpr } = this;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#050706';
    g.fillRect(0, 0, this.cw, this.ch);
    // enquanto não "resolve", as palavras recém-entendidas ainda aparecem na escrita antiga
    const known = (w) => this.known(w) && (this.revealed || !this.learned.has(w));
    let y = 20 - this.scroll;
    this.lines.forEach((line, i) => {
      if (y > -LINE_H && y < this.ch) {
        const color = this.opts.dim ? '#7d8a7e' : i === 0 ? '#d0dacd' : '#a9b8a8';
        drawTokens(g, line, 22, y, known, this.word, { h: 13, font: '16px Consolas, "Courier New", monospace', color, maxW: this.cw - 44 });
      }
      y += LINE_H;
    });
    // linhas de varredura bem leves: é uma tela velha, não um livro
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let sy = 0; sy < this.ch; sy += 3) g.fillRect(0, sy, this.cw, 1);
  }
}
