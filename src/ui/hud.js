// ─────────────────────────────────────────────────────────────────────────────
//  Interface do modo Livre: a leitura seca de um instrumento.
//  Não é HUD de jogo: não há mira, vida nem objetivo.
//
//    canto superior esquerdo  → registro de acontecimentos (apagões, quedas,
//                               transferências…), digitado linha a linha
//    canto inferior direito   → posição (m), região e seed
//
//  Tecla H alterna a visibilidade. No modo Peregrinação ela fica desligada
//  (a interface lá é quase nula — ver o cofre, Interface-diegetica).
// ─────────────────────────────────────────────────────────────────────────────
import { t, fmtNum } from '../i18n/index.js';

const MAX_LINES = 9;

export class HUD {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.lines = [];
    this.accum = 0;
    this.visible = true;
    this.enabled = true; // o modo pode desligar a interface de vez
    this.info = { pos: { x: 0, y: 0, z: 0 }, region: 'ponte', seed: 0 };
    this._time = 0;
    this.resize();
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

  setEnabled(on) {
    this.enabled = on;
    if (!on) this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Registra um acontecimento (texto já traduzido). */
  push(text) {
    this.lines.push({ text, born: this._time });
    if (this.lines.length > MAX_LINES) this.lines.shift();
  }

  update(dt, time, info) {
    this._time = time;
    Object.assign(this.info, info);
    if (!this.visible || !this.enabled) return;
    // redesenha a ~15 fps (é uma tela de instrumento, não precisa de 60)
    this.accum += dt;
    if (this.accum < 1 / 15) return;
    this.accum = 0;
    this._draw(time);
  }

  _draw(time) {
    const { ctx, dpr } = this;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.font = '11px Consolas, "Courier New", monospace';
    ctx.textBaseline = 'top';

    // ── registro: as linhas mais velhas somem aos poucos ──
    let y = 26;
    this.lines.forEach((line, li) => {
      const age = time - line.born;
      const fade = Math.max(0, 1 - Math.max(0, age - 25) / 10);
      const alpha = Math.min(1, age * 3) * (0.3 + 0.5 * ((li + 1) / this.lines.length)) * fade;
      const shown = line.text.slice(0, Math.floor(age * 40)); // "sendo digitada"
      ctx.fillStyle = `rgba(178,188,172,${alpha * 0.85})`;
      ctx.fillText(shown, 26, y);
      y += 19;
    });
    this.lines = this.lines.filter((l) => time - l.born < 35);

    // ── posição, região, seed ──
    const { pos, region, seed } = this.info;
    const rx = window.innerWidth - 210;
    let ry = window.innerHeight - 100;
    ctx.fillStyle = 'rgba(178,188,172,0.45)';
    for (const [axis, v] of [['X', pos.x], ['Y', pos.y], ['Z', pos.z]]) {
      ctx.fillText(`${axis} ${fmtNum(Math.round(v)).padStart(10)} m`, rx, ry);
      ry += 16;
    }
    ry += 6;
    ctx.fillStyle = 'rgba(150,146,136,0.45)';
    ctx.fillText(`${t(`region.${region}`)} · ${seed.toString(36).toUpperCase()}`, rx, ry);
    ctx.restore();
  }
}
