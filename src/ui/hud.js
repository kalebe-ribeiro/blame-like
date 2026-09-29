// ─────────────────────────────────────────────────────────────────────────────
//  Interface de um sistema alienígena mal traduzido.
//  Não é HUD de jogo: não há mira, vida nem objetivo. São leituras de um
//  sistema que não foi feito para você — glifos, fragmentos quase legíveis,
//  coordenadas em base 7.
//
//    canto superior esquerdo  → log rolando (glifos + "traduções" corrompidas)
//    canto inferior direito   → posição/escala/região em glifos-dígito
//
//  Tecla H alterna a visibilidade.
// ─────────────────────────────────────────────────────────────────────────────
import { createAlphabet, drawGlyph } from './glyphs.js';

// Fragmentos "traduzidos". Edite à vontade — o sistema corrompe partes deles.
const FRAGMENTS = [
  'SUBSTRATO RESPIRA :: NÃO INTERROMPA',
  'você está DENTRO do índice',
  'ERRO: o observador não foi compilado',
  'ORIGEM DO SINAL = ∅ / todos',
  'a arquitetura lembra de você',
  'PROFUNDIDADE: 7 de ∞',
  'tradução 34% · o resto é fome',
  'NÓ 0x3F → NÓ 0x3F → NÓ 0x3F',
  'não há saída. há mais dentro.',
  'CARNE/CÓDIGO: equivalência confirmada',
  'toda ponte leva a outra ponte',
  'ELES NÃO OLHAM. ELES INDEXAM.',
  'escala do observador: irrelevante',
  'processo [SONHADOR] ainda em execução',
  'THE SIGNAL IS NOT FOR YOU',
  'CONSTRUÇÃO: EM ANDAMENTO · PRAZO: ∞',
  'planta baixa não encontrada',
  'ninguém autorizou esta parede',
  'NÍVEL 4.019.332 :: sem registro de habitantes',
  'a cidade cresce 3 km por dia',
  'terminal genético ausente · acesso negado',
  'CONTINUE SUBINDO. CONTINUE DESCENDO.',
  'memória contígua · tecido contíguo',
  'retorno ao ponto zero: NEGADO',
  'o céu é um disco que não reflete',
];

const REGION_WORDS = {
  ponte: 'ESPINHA',
  abismo: 'FUNDO/VIVO',
  altura: 'COROA',
  monolito: 'LAJE',
  interior: 'INTERIOR>EXTERIOR',
  fora: '∅',
  deriva: 'DERIVA/SEM FIM',
  galeria: 'GALERIA',
  poco: 'POÇO',
  estrato: 'ESTRATO',
  colmeia: 'COLMEIA',
  camada: 'CAMADA/INTRANSPONÍVEL',
  macico: 'MACIÇO',
  vazio: 'VAZIO',
  conduto: 'CONDUTO',
};

export class AlienHUD {
  constructor(canvas, seed = 1) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.alphabet = createAlphabet(seed);
    this.lines = [];
    this.nextLine = 0;
    this.accum = 0;
    this.visible = true;
    this.info = { pos: { x: 0, y: 0, z: 0 }, scale: 1, region: 'ponte', seed: 0 };
    this.resize();
  }

  setSeed(seed) {
    this.alphabet = createAlphabet(seed);
    this.lines = [];
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.floor(window.innerWidth * dpr);
    this.canvas.height = Math.floor(window.innerHeight * dpr);
  }

  toggle() {
    this.visible = !this.visible;
    if (!this.visible) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Cria uma linha: sequência de itens {g: índiceGlifo} ou {c: caractere}. */
  _makeLine(time) {
    const items = [];
    if (Math.random() < 0.3) {
      // fragmento "traduzido", com corrupção parcial
      const text = FRAGMENTS[Math.floor(Math.random() * FRAGMENTS.length)];
      for (const ch of text) {
        const r = Math.random();
        if (ch !== ' ' && r < 0.12) items.push({ g: Math.floor(Math.random() * this.alphabet.length), hot: r < 0.015 });
        else items.push({ c: ch });
      }
    } else {
      const n = 4 + Math.floor(Math.random() * 18);
      for (let i = 0; i < n; i++) {
        if (Math.random() < 0.12) items.push({ c: ' ' });
        else items.push({ g: Math.floor(Math.random() * this.alphabet.length) });
      }
    }
    return { items, born: time };
  }

  /** Empurra uma linha "traduzida" para o log (eventos do sistema). */
  push(text) {
    const items = [];
    for (const ch of text) {
      const r = Math.random();
      if (ch !== ' ' && r < 0.06) items.push({ g: Math.floor(Math.random() * this.alphabet.length) });
      else items.push({ c: ch });
    }
    this.lines.push({ items, born: this._time ?? 0 });
    if (this.lines.length > 9) this.lines.shift();
  }

  update(dt, time, info) {
    this._time = time;
    Object.assign(this.info, info);
    if (!this.visible) return;

    // nova linha no log de tempos em tempos (às vezes em rajadas)
    if (time > this.nextLine) {
      this.lines.push(this._makeLine(time));
      if (this.lines.length > 9) this.lines.shift();
      this.nextLine = time + (Math.random() < 0.2 ? 0.15 : 1.2 + Math.random() * 2.5);
    }

    // redesenha a ~15 fps (é uma tela de sistema, não precisa de 60)
    this.accum += dt;
    if (this.accum < 1 / 15) return;
    this.accum = 0;
    this._draw(time);
  }

  _draw(time) {
    const { ctx, dpr } = this;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.scale(dpr, dpr);
    const cw = 9;
    const ch = 13;

    ctx.lineWidth = 1.1;
    ctx.font = '11px Consolas, "Courier New", monospace';
    ctx.textBaseline = 'top';

    // ── log ──
    let y = 26;
    this.lines.forEach((line, li) => {
      const age = time - line.born;
      const alpha = Math.min(1, age * 3) * (0.25 + 0.55 * ((li + 1) / this.lines.length));
      // linha "sendo digitada"
      const shown = Math.min(line.items.length, Math.floor(age * 40));
      let x = 26 ;
      for (let i = 0; i < shown; i++) {
        const it = line.items[i];
        const hot = it.hot;
        ctx.strokeStyle = ctx.fillStyle = hot ? `rgba(196,110,62,${alpha})` : `rgba(178,188,172,${alpha * 0.85})`;
        if (it.g !== undefined) drawGlyph(ctx, this.alphabet[it.g], x + 1.5, y + 1.5, cw - 4, ch - 4);
        else ctx.fillText(it.c, x, y);
        x += cw;
      }
      y += ch + 6;
    });

    // ── leitura de posição (base 7 em glifos-dígito) ──
    const { pos, scale, region, seed } = this.info;
    const rows = [
      ['⟁', pos.x],
      ['⟁', pos.y],
      ['⟁', pos.z],
    ];
    let ry = window.innerHeight - 110;
    const rx = window.innerWidth - 190;
    ctx.strokeStyle = ctx.fillStyle = 'rgba(178,188,172,0.45)';
    for (const [, v] of rows) {
      this._drawNumber(Math.round(v * 10), rx , ry);
      ry += ch + 5;
    }
    // escala do observador: barra que "não deveria" mudar
    ctx.strokeStyle = 'rgba(150,146,136,0.5)';
    ctx.strokeRect(rx, ry + 4, 150, 5);
    ctx.fillStyle = 'rgba(150,146,136,0.5)';
    ctx.fillRect(rx, ry + 4, Math.min(150, 150 * (Math.log2(scale) + 1) / 3), 5);
    ry += 16;
    ctx.fillStyle = 'rgba(150,146,136,0.45)';
    ctx.fillText(`${REGION_WORDS[region] ?? '?'} · ${seed.toString(36).toUpperCase()}`, rx, ry);

    ctx.restore();
  }

  _drawNumber(n, x, y) {
    const neg = n < 0;
    let v = Math.abs(n);
    const digits = [];
    do {
      digits.unshift(v % 7);
      v = Math.floor(v / 7);
    } while (v > 0);
    if (neg) this.ctx.fillRect(x - 10, y + 6, 6, 1.5);
    digits.forEach((d, i) => drawGlyph(this.ctx, this.alphabet[d], x + i * 11, y, 7, 10));
  }
}
