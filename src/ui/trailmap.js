// ─────────────────────────────────────────────────────────────────────────────
//  Mapa da travessia (tecla M): uma vista 3D escura só com o caminho que você
//  fez neste mundo — uma linha fina de luz. Nada do que existe aparece; só o
//  que foi atravessado.
//
//  Registro: um ponto a cada ~8 m (e sempre que algo acontece). Saltos
//  (transporte, novo lugar) viram tracejado. Marcos: quedas grandes, viagens
//  de trilho, fotos. Guardado por seed no localStorage (só no `npm start`
//  normal — ver PERSIST em app.js).
//
//  A vista gira devagar sozinha; arrastar gira, a roda aproxima.
// ─────────────────────────────────────────────────────────────────────────────

const KEY = 'cybercosmic.trail.v1';
const STEP = 8; // m entre pontos
const MAX = 40000;

export class TrailMap {
  constructor(persist) {
    this.persist = persist;
    this.seed = null;
    this.pts = []; // [x, y, z, tipo] — tipo: 0 andar/voar, 1 trilho, 2 salto (começa tracejado)
    this.marks = []; // { x, y, z, kind: 'queda'|'foto'|'trilho', v }
    this._last = null;
    this.el = this._build();
    this.yaw = 0.6;
    this.pitch = 0.5;
    this.zoom = 1;
    this.open = false;
  }

  /** Troca para o rastro deste mundo (carrega o salvo, se houver). */
  useSeed(seed) {
    if (this.seed === seed) return;
    this.seed = seed;
    this.pts = [];
    this.marks = [];
    this._last = null;
    if (!this.persist) return;
    try {
      const d = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (d && d.seed === seed) {
        this.pts = d.pts ?? [];
        this.marks = d.marks ?? [];
      }
    } catch {
      /* sem armazenamento */
    }
  }

  save() {
    if (!this.persist) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ seed: this.seed, pts: this.pts, marks: this.marks }));
    } catch {
      /* cheio: fica só na memória */
    }
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
      <div class="tm-title">MAPA DA TRAVESSIA</div>
      <div class="tm-info"></div>
      <div class="tm-legend">
        <span><i class="tm-l0"></i>caminho</span><span><i class="tm-l1"></i>trilhos</span>
        <span><i class="tm-l2"></i>transporte</span><span><i class="tm-q"></i>queda</span><span><i class="tm-f"></i>foto</span>
        <span class="tm-hint">arrastar gira · roda aproxima · M ou ESC fecha</span>
      </div>`;
    document.body.appendChild(root);
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
    if (!pts.length) {
      g.fillStyle = 'rgba(200,196,184,0.5)';
      g.font = `${13 * devicePixelRatio}px Consolas, monospace`;
      g.fillText('nenhum trecho registrado ainda', W / 2 - 120 * devicePixelRatio, H / 2);
      return;
    }
    // caixa envolvente → centro e escala
    let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0];
      if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1];
      if (p[1] > y1) y1 = p[1];
      if (p[2] < z0) z0 = p[2];
      if (p[2] > z1) z1 = p[2];
    }
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
    // o caminho
    const dpr = devicePixelRatio;
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
    g.fillText(fmt(bar), 40 * dpr, H - 48 * dpr);
    this.info.textContent = `extensão ${fmt(x1 - x0)} × ${fmt(z1 - z0)} · desnível ${fmt(y1 - y0)} · ${pts.length.toLocaleString('pt-BR')} pontos`;
  }
}

function niceStep(v) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  const m = v / p;
  return (m < 2 ? 1 : m < 5 ? 2 : 5) * p;
}
function fmt(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1).replace('.', ',')} km` : `${Math.round(m)} m`;
}
