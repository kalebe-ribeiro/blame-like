// ─────────────────────────────────────────────────────────────────────────────
//  Mapa da travessia (tecla M): uma vista 3D escura só com o caminho que você
//  fez neste mundo — uma linha fina de luz. Nada do que existe aparece; só o
//  que foi atravessado.
//
//  Registro: um ponto a cada ~8 m (e sempre que algo acontece). Saltos
//  (transporte, novo lugar) viram tracejado. Marcos: quedas grandes, viagens
//  de trilho, fotos. Guardado no mundo salvo (app/saves.js).
//
//  Descobertas (ver o cofre, Mapa-de-descobertas), dadas por quem abre o mapa
//  (setFound): os setores por onde você passou (a mancha do tamanho de um
//  setor, com o estado da energia), os terminais lidos, as estruturas únicas
//  e — na Peregrinação — as PISTAS: um círculo tracejado com a área de
//  incerteza (encolhe conforme você junta partes e entende as palavras) e a
//  rota, escrita como a Cidade escreve.
//
//  A vista gira devagar sozinha; arrastar gira, a roda aproxima.
// ─────────────────────────────────────────────────────────────────────────────

import { t, fmtNum, fmtDist, applyDom } from '../i18n/index.js';
import { drawTokens } from '../lang/ancient.js';
import { bindings } from '../controls/bindings.js';

const STEP = 8; // m entre pontos
const MAX = 40000;

export class TrailMap {
  constructor() {
    this.pts = []; // [x, y, z, tipo] — tipo: 0 andar/voar, 1 trilho, 2 salto (começa tracejado)
    this.marks = []; // { x, y, z, kind: 'queda'|'foto'|'trilho', v }
    this._last = null;
    this.el = this._build();
    this.yaw = 0.6;
    this.pitch = 0.5;
    this.zoom = 1;
    this.open = false;
    this.found = { places: [], leads: [], sectors: [] };
  }

  /**
   * O que foi descoberto, para desenhar junto do rastro:
   *   places  [{ x, y, z, unique }]           terminais lidos (unique: estrutura única)
   *   leads   [{ x, y, z, r, open, tokens, ring? }] pistas (centro estimado e raio; ring {R,w}: anel em volta de quem citou)
   *   sectors [{ x, y, z, state }]             setores por onde passou
   *   known(w), word(w)                        o léxico, para escrever as rotas
   */
  setFound(found) {
    this.found = found;
  }

  /** Carrega o rastro do mundo salvo (null = começa vazio). */
  load(data) {
    this.pts = data?.pts ?? [];
    this.marks = data?.marks ?? [];
    this._last = null;
  }

  /** Para o mundo salvo (app/saves.js). */
  toJSON() {
    return { pts: this.pts, marks: this.marks };
  }

  /** Chamado a cada quadro com a posição GLOBAL. kind: 0 normal, 1 sobre trilho. */
  record(g, kind = 0) {
    const L = this._last;
    if (L) {
      const d = Math.hypot(g.x - L[0], g.y - L[1], g.z - L[2]);
      if (d < STEP) return;
      // salto: o próximo trecho começa tracejado
      if (d > 150) {
        this._push(g.x, g.y, g.z, 2);
        return;
      }
    }
    this._push(g.x, g.y, g.z, kind);
  }

  _push(x, y, z, t) {
    const p = [Math.round(x * 10) / 10, Math.round(y * 10) / 10, Math.round(z * 10) / 10, t];
    this.pts.push(p);
    this._last = p;
    if (this.pts.length > MAX) this.pts.splice(0, this.pts.length - MAX); // o começo mais antigo se apaga
  }

  mark(g, kind, v = 0) {
    this.marks.push({ x: Math.round(g.x), y: Math.round(g.y), z: Math.round(g.z), kind, v: Math.round(v) });
    if (this.marks.length > 500) this.marks.shift();
  }

  _build() {
    const root = document.createElement('div');
    root.id = 'trailmap';
    root.innerHTML = `
      <canvas></canvas>
      <div class="tm-title" data-i18n="map.title"></div>
      <div class="tm-info"></div>
      <div class="tm-legend">
        <span><i class="tm-l0"></i><b data-i18n="map.path"></b></span><span><i class="tm-l1"></i><b data-i18n="map.rails"></b></span>
        <span><i class="tm-l2"></i><b data-i18n="map.jump"></b></span><span><i class="tm-q"></i><b data-i18n="map.fall"></b></span><span><i class="tm-f"></i><b data-i18n="map.photo"></b></span>
        <span><i class="tm-t"></i><b data-i18n="map.terminal"></b></span><span><i class="tm-u"></i><b data-i18n="map.unique"></b></span><span class="tm-lead-key"><i class="tm-p"></i><b data-i18n="map.lead"></b></span><span><i class="tm-s"></i><b data-i18n="map.sector"></b></span>
        <span class="tm-hint" data-i18n="map.hint"></span>
      </div>`;
    document.body.appendChild(root);
    applyDom(root);
    this.canvas = root.querySelector('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.info = root.querySelector('.tm-info');
    let drag = null;
    root.addEventListener('mousedown', (e) => (drag = [e.clientX, e.clientY]));
    window.addEventListener('mouseup', () => (drag = null));
    root.addEventListener('mousemove', (e) => {
      if (!drag) return;
      this.yaw += (e.clientX - drag[0]) * 0.006;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch + (e.clientY - drag[1]) * 0.006));
      drag = [e.clientX, e.clientY];
      this._auto = false;
    });
    root.addEventListener('wheel', (e) => {
      this.zoom = Math.max(0.3, Math.min(40, this.zoom * Math.exp(-e.deltaY * 0.0012)));
      e.preventDefault();
    });
    root.addEventListener('click', (e) => e.stopPropagation());
    return root;
  }

  show(current) {
    this.open = true;
    this.current = current;
    this._auto = true;
    this.el.querySelector('.tm-hint').textContent = t('map.hint', { key: bindings.label('map') });
    this.el.classList.add('open');
    const loop = () => {
      if (!this.open) return;
      if (this._auto) this.yaw += 0.0015;
      this._draw();
      requestAnimationFrame(loop);
    };
    loop();
  }

  hide() {
    this.open = false;
    this.el.classList.remove('open');
  }

  _draw() {
    const c = this.canvas;
    const W = (c.width = c.clientWidth * devicePixelRatio);
    const H = (c.height = c.clientHeight * devicePixelRatio);
    const g = this.ctx;
    g.fillStyle = '#050505';
    g.fillRect(0, 0, W, H);
    const pts = this.pts;
    const cur = this.current;
    const F = this.found;
    this.el.querySelector('.tm-lead-key').style.display = F.known ? '' : 'none';
    if (!pts.length) {
      g.fillStyle = 'rgba(200,196,184,0.5)';
      g.font = `${13 * devicePixelRatio}px Consolas, monospace`;
      g.fillText(t('map.empty'), W / 2 - 120 * devicePixelRatio, H / 2);
      return;
    }
    // caixa envolvente → centro e escala
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    const grow = (x, y, z, r = 0) => {
      if (x - r < x0) x0 = x - r;
      if (x + r > x1) x1 = x + r;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (z - r < z0) z0 = z - r;
      if (z + r > z1) z1 = z + r;
    };
    for (const p of pts) grow(p[0], p[1], p[2]);
    // as pistas abertas entram na moldura: o mapa mostra para onde elas apontam
    for (const l of F.leads) if (l.open) grow(l.x, l.y, l.z, l.r);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const cz = (z0 + z1) / 2;
    const ext = Math.max(x1 - x0, y1 - y0, z1 - z0, 200);
    const s = (Math.min(W, H) * 0.42 * this.zoom) / (ext / 2);
    const cyw = Math.cos(this.yaw);
    const syw = Math.sin(this.yaw);
    const cp = Math.cos(this.pitch);
    const sp = Math.sin(this.pitch);
    // projeção ortográfica girada; profundidade para o esmaecimento
    const proj = (x, y, z) => {
      const dx = x - cx;
      const dy = y - cy;
      const dz = z - cz;
      const rx = dx * cyw - dz * syw;
      const rz = dx * syw + dz * cyw;
      const ry = dy * cp - rz * sp;
      const d = dy * sp + rz * cp;
      return [W / 2 + rx * s, H / 2 - ry * s, d / (ext / 2)];
    };
    // grade fraca no plano do ponto mais baixo (dá chão à escala)
    const gridStep = niceStep(ext / 6);
    g.strokeStyle = 'rgba(178,188,172,0.05)';
    g.lineWidth = 1;
    for (let gx = Math.floor(x0 / gridStep) * gridStep; gx <= x1 + gridStep; gx += gridStep) {
      const [ax, ay] = proj(gx, y0, z0 - gridStep);
      const [bx, by] = proj(gx, y0, z1 + gridStep);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    for (let gz = Math.floor(z0 / gridStep) * gridStep; gz <= z1 + gridStep; gz += gridStep) {
      const [ax, ay] = proj(x0 - gridStep, y0, gz);
      const [bx, by] = proj(x1 + gridStep, y0, gz);
      g.beginPath();
      g.moveTo(ax, ay);
      g.lineTo(bx, by);
      g.stroke();
    }
    const dpr = devicePixelRatio;
    // um círculo no plano horizontal (em projeção): polígono de 40 lados
    const ring = (x, y, z, r) => {
      g.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const [px, py] = proj(x + Math.cos(a) * r, y, z + Math.sin(a) * r);
        if (i) g.lineTo(px, py);
        else g.moveTo(px, py);
      }
    };
    // os setores por onde passou: manchas fracas, com o estado da energia
    for (const s of F.sectors) {
      ring(s.x, s.y, s.z, 380);
      g.fillStyle = s.state === 'powered' ? 'rgba(200,206,196,0.035)' : s.state === 'unstable' ? 'rgba(215,160,90,0.035)' : 'rgba(0,0,0,0)';
      g.fill();
      g.setLineDash(s.state === 'dark' ? [2 * dpr, 5 * dpr] : []);
      g.strokeStyle = s.state === 'powered' ? 'rgba(200,206,196,0.09)' : s.state === 'unstable' ? 'rgba(215,160,90,0.1)' : 'rgba(150,146,136,0.1)';
      g.lineWidth = 1 * dpr;
      g.stroke();
    }
    g.setLineDash([]);
    // o caminho
    let prev = null;
    for (const p of pts) {
      const q = proj(p[0], p[1], p[2]);
      if (prev) {
        const depth = 0.55 + 0.45 * (1 - (q[2] + 1) / 2);
        g.setLineDash(p[3] === 2 ? [3 * dpr, 6 * dpr] : []);
        g.lineWidth = (p[3] === 1 ? 1.6 : 1.1) * dpr;
        g.strokeStyle = p[3] === 1 ? `rgba(215,196,154,${0.75 * depth})` : p[3] === 2 ? `rgba(160,160,150,${0.35 * depth})` : `rgba(200,206,196,${0.7 * depth})`;
        g.beginPath();
        g.moveTo(prev[0], prev[1]);
        g.lineTo(q[0], q[1]);
        g.stroke();
      }
      prev = q;
    }
    g.setLineDash([]);
    // marcos
    for (const m of this.marks) {
      const [mx, my] = proj(m.x, m.y, m.z);
      if (m.kind === 'queda') {
        const [tx, ty] = proj(m.x, m.y + m.v, m.z);
        g.strokeStyle = 'rgba(176,118,62,0.8)';
        g.lineWidth = 1 * dpr;
        g.beginPath();
        g.moveTo(tx, ty);
        g.lineTo(mx, my);
        g.stroke();
        g.fillStyle = 'rgba(176,118,62,0.9)';
        g.fillRect(mx - 2 * dpr, my - 2 * dpr, 4 * dpr, 4 * dpr);
      } else if (m.kind === 'foto') {
        g.strokeStyle = 'rgba(200,196,184,0.8)';
        g.strokeRect(mx - 3 * dpr, my - 3 * dpr, 6 * dpr, 6 * dpr);
      }
    }
    // terminais lidos e estruturas únicas
    for (const p of F.places) {
      const [px, py] = proj(p.x, p.y, p.z);
      if (p.unique) {
        g.strokeStyle = 'rgba(215,196,154,0.9)';
        g.lineWidth = 1.4 * dpr;
        g.strokeRect(px - 6 * dpr, py - 6 * dpr, 12 * dpr, 12 * dpr);
        g.fillStyle = 'rgba(215,196,154,0.9)';
        g.fillRect(px - 2 * dpr, py - 2 * dpr, 4 * dpr, 4 * dpr);
      } else {
        g.fillStyle = 'rgba(159,174,159,0.85)';
        g.beginPath();
        g.moveTo(px, py - 4 * dpr);
        g.lineTo(px + 4 * dpr, py);
        g.lineTo(px, py + 4 * dpr);
        g.lineTo(px - 4 * dpr, py);
        g.fill();
      }
    }
    // as pistas: a área de incerteza (tracejada) e a rota ao lado
    for (const l of F.leads) {
      if (!l.open) continue;
      let [px, py] = proj(l.x, l.y, l.z);
      if (l.ring) {
        // só a distância: um anel em volta de quem citou (a faixa é a incerteza)
        ring(l.x, l.y, l.z, l.ring.R);
        g.strokeStyle = 'rgba(215,160,90,0.12)';
        g.lineWidth = Math.max(2 * dpr, 2 * l.ring.w * s);
        g.stroke();
        [px, py] = proj(l.x + l.ring.R * 0.71, l.y, l.z - l.ring.R * 0.71); // o rótulo, num ponto do anel
      } else {
        ring(l.x, l.y, l.z, l.r);
      }
      g.setLineDash([4 * dpr, 5 * dpr]);
      g.strokeStyle = 'rgba(215,160,90,0.55)';
      g.lineWidth = 1.2 * dpr;
      g.stroke();
      g.setLineDash([]);
      g.fillStyle = 'rgba(215,160,90,0.8)';
      g.fillRect(px - 1.5 * dpr, py - 1.5 * dpr, 3 * dpr, 3 * dpr);
      if (F.known) drawTokens(g, l.tokens, px + 8 * dpr, py - 5 * dpr, F.known, F.word, { h: 7 * dpr, font: `${9 * dpr}px Consolas, monospace`, color: 'rgba(215,196,154,0.75)', maxW: 520 * dpr });
    }
    // início e onde você está
    const [sx, sy] = proj(pts[0][0], pts[0][1], pts[0][2]);
    g.strokeStyle = 'rgba(200,196,184,0.6)';
    g.beginPath();
    g.arc(sx, sy, 4 * dpr, 0, Math.PI * 2);
    g.stroke();
    if (cur) {
      const [px, py] = proj(cur.x, cur.y, cur.z);
      const t = performance.now() / 1000;
      g.fillStyle = `rgba(215,160,90,${0.6 + 0.4 * Math.sin(t * 3)})`;
      g.beginPath();
      g.arc(px, py, 4 * dpr, 0, Math.PI * 2);
      g.fill();
    }
    // barra de escala
    const bar = niceStep(ext / 4);
    const bl = bar * s;
    g.strokeStyle = 'rgba(200,196,184,0.6)';
    g.lineWidth = 1 * dpr;
    g.beginPath();
    g.moveTo(40 * dpr, H - 40 * dpr);
    g.lineTo(40 * dpr + bl, H - 40 * dpr);
    g.stroke();
    g.fillStyle = 'rgba(200,196,184,0.7)';
    g.font = `${11 * dpr}px Consolas, monospace`;
    g.fillText(fmtDist(bar), 40 * dpr, H - 48 * dpr);
    this.info.textContent = t('map.info', { w: fmtDist(x1 - x0), d: fmtDist(z1 - z0), h: fmtDist(y1 - y0), n: fmtNum(pts.length) });
  }
}

function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  const m = v / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
}
