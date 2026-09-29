// ─────────────────────────────────────────────────────────────────────────────
//  Terminais mortos: consoles nas estações dos transportadores e no alto das
//  passagens das camadas. A tela mostra registros procedurais — manutenção
//  adiada há milhões de ciclos, avisos, listas de setores, "habitantes
//  registrados: 0" — alguns trechos já ilegíveis (o alfabeto da Cidade). Nas
//  estações, uma linha é viva: o horário real do próximo vagão.
//
//  Só os terminais perto do observador existem (e só estes redesenham a
//  tela). Sem energia (apagão), a tela apaga.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { TRANSIT, MEGA } from '../gen/field.js';
import { stationT } from '../gen/transit.js';
import { hash4, rngAt } from '../gen/hash.js';
import { createAlphabet, drawGlyph } from '../ui/glyphs.js';

const RANGE = 90; // m: terminais existem só perto
const W = 256;
const H = 176;
const LINE_H = 13;

const hex = (n, d = 3) => `0x${(n >>> 0).toString(16).toUpperCase().padStart(d, '0').slice(-d)}`;
const num = (n) => Math.round(n).toLocaleString('pt-BR');

/** Registros de um terminal (determinísticos pela semente). */
function writeLog(r, kind) {
  const L = [];
  const sector = hex(r.int(0, 4095));
  L.push(`TERMINAL ${hex(r.int(0, 65535), 4)} · SETOR ${sector}`);
  L.push('────────────────────────────');
  const pool = [
    () => `MANUTENÇÃO ${r.pick(['ADIADA', 'SUSPENSA', 'NÃO AGENDADA'])} · ${num(r.int(40000, 9000000))} CICLOS`,
    () => `HABITANTES REGISTRADOS NO SETOR: 0`,
    () => `ÚLTIMO ACESSO AUTORIZADO: ∅`,
    () => `TERMINAL GENÉTICO: NÃO DETECTADO`,
    () => `ENERGIA: ${r.int(3, 61)}% · REDE ${r.pick(['INSTÁVEL', 'DEGRADADA', 'EM RESERVA'])}`,
    () => `CONSTRUÇÃO EM ANDAMENTO · PRAZO: ∞`,
    () => `SETORES: ${hex(r.int(0, 4095))} ${hex(r.int(0, 4095))} [APAGADO] ${hex(r.int(0, 4095))}`,
    () => `AVISO: CAMADA ${r.int(2, 90)} INTRANSPONÍVEL`,
    () => `PASSAGEM MAIS PRÓXIMA: ${(r.float(1.5, 40)).toFixed(1).replace('.', ',')} KM`,
    () => `REQUISIÇÃO ${hex(r.int(0, 65535), 4)} · SEM RESPOSTA HÁ ${num(r.int(300, 90000))} DIAS`,
    () => `CONTAGEM DE PAVIMENTOS: ${num(r.int(1e5, 9e6))} · INCOMPLETA`,
    () => `REGISTRO CORROMPIDO · RECUPERAÇÃO ${r.int(0, 12)}%`,
    () => `OBJETO NÃO CATALOGADO NO NÍVEL ${num(r.int(1000, 900000))}`,
    () => `ROTA ALTERNATIVA: NENHUMA`,
  ];
  if (kind === 'passage') {
    L.push(`ELEVADOR DE PASSAGEM · CAMADA ${r.int(2, 60)}`);
    L.push(`ESPESSURA DA CAMADA: ${MEGA.barrierThick} M`);
  }
  const n = 7 + r.int(0, 3);
  for (let i = 0; i < n; i++) L.push(r.pick(pool)());
  return L;
}

export class TerminalSystem {
  constructor(parent, materials, seed) {
    this.parent = parent;
    this.materials = materials;
    this.seed = seed;
    this.field = null;
    this.transit = null;
    this.outages = null;
    this.items = new Map(); // id → terminal
    this.lights = [];
    this.meshes = [];
    this.alphabet = createAlphabet(seed ^ 0x7e11);
    this._scan = 0;
    this._body = new THREE.BoxGeometry(0.7, 1.05, 0.45);
    this._body.translate(0, 0.525, 0);
    this._screenGeo = new THREE.PlaneGeometry(0.66, 0.46);
  }

  /** Lugares de terminais perto de (x,y,z) GLOBAL: { id, x, y, z, yaw, kind, line?, s? } */
  _sites(g) {
    const out = [];
    const S = TRANSIT.station;
    for (const L of this.field.transitLinesNear(g.x, g.y, g.z, RANGE)) {
      const tp = L.axis === 'z' ? g.z : g.x;
      const s = Math.round((tp - S / 2) / S);
      const ts = stationT(s);
      if (Math.abs(ts - tp) > RANGE) continue;
      const hw = L.w.width / 2;
      const side = L.track.side;
      const len = TRANSIT.carLen + 4;
      const t = ts - len / 2 + 1.4; // na ponta oposta à placa
      const lat = L.u + side * (hw + 0.9);
      // a tela olha ao longo da plataforma (para quem vem da passarela)
      const x = L.axis === 'z' ? lat : t;
      const z = L.axis === 'z' ? t : lat;
      const yaw = L.axis === 'z' ? 0 : Math.PI / 2; // a tela (+z local) olha para +t
      out.push({ id: `st:${L.id}:${s}`, x, y: L.y, z, yaw, kind: 'station', line: L, s });
    }
    // no alto das passagens das camadas, ao lado da ponte de embarque
    for (const b of this.field.barriersNear(g.y)) {
      if (Math.abs(b.top - g.y) > RANGE) continue;
      const P = MEGA.passage;
      for (let pi = Math.floor((g.x - RANGE) / P); pi <= Math.floor((g.x + RANGE) / P); pi++) {
        for (let pk = Math.floor((g.z - RANGE) / P); pk <= Math.floor((g.z + RANGE) / P); pk++) {
          const p = this.field.passage(b.n, pi, pk);
          if (!p) continue;
          out.push({ id: `ps:${b.n}:${pi}:${pk}`, x: p.x + p.size / 2 + 5, y: b.top, z: p.z + 7, yaw: Math.PI / 2, kind: 'passage' });
        }
      }
    }
    return out.filter((s) => Math.hypot(s.x - g.x, s.y - g.y, s.z - g.z) < RANGE);
  }

  _create(site) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.minFilter = THREE.LinearFilter;
    const screenMat = new THREE.MeshBasicMaterial({ map: tex, color: 0x8a948c, transparent: true });
    const group = new THREE.Group();
    const body = new THREE.Mesh(this._body, this.materials.machine);
    body.userData.mat = 'machine';
    const screen = new THREE.Mesh(this._screenGeo, screenMat);
    screen.position.set(0, 1.28, 0.02);
    screen.rotation.x = -0.35; // inclinada para quem está em pé
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.56, 0.08), this.materials.machine);
    hood.position.set(0, 1.28, -0.04);
    hood.rotation.x = -0.35;
    group.add(body, hood, screen);
    group.rotation.y = site.yaw;
    this.parent.add(group);
    const r = rngAt(this.seed, Math.round(site.x), Math.round(site.y), Math.round(site.z), 950);
    return { site, group, screen, canvas, ctx: canvas.getContext('2d'), tex, lines: writeLog(r, site.kind), shown: 0, next: 0, r, powered: true };
  }

  _draw(t, time) {
    const c = t.ctx;
    c.fillStyle = '#050706';
    c.fillRect(0, 0, W, H);
    if (!t.powered) {
      t.tex.needsUpdate = true;
      return;
    }
    c.font = '10px Consolas, "Courier New", monospace';
    c.textBaseline = 'top';
    const lines = t.lines.slice(0, t.shown);
    // linha viva nas estações: o horário do vagão
    if (t.site.kind === 'station' && this.transit) {
      const st = this.transit.stationStatus(t.site.line, t.site.s, time);
      lines.splice(2, 0, st);
    }
    let y = 8;
    for (let i = 0; i < lines.length && y < H - 12; i++) {
      const line = lines[i];
      const live = i === 2 && t.site.kind === 'station'; // o horário: sempre legível
      c.fillStyle = i === 0 ? '#c9d4c8' : live ? '#d7c49a' : '#9fae9f';
      let x = 8;
      // palavras que a Cidade já apagou: glifos no lugar do texto
      for (const word of line.split(' ')) {
        const h = hash4(this.seed, word.length * 31 + i, x, y, 951);
        if (h < 0.1 && word.length > 2 && i > 1 && !live) {
          c.strokeStyle = '#7f8c7f';
          c.lineWidth = 1;
          for (let k = 0; k < Math.min(word.length, 5); k++) drawGlyph(c, this.alphabet[Math.floor(h * 997 + k) % this.alphabet.length], x + k * 7, y + 1, 5, 8);
          x += Math.min(word.length, 5) * 7 + 6;
        } else {
          c.fillText(word, x, y);
          x += c.measureText(word + ' ').width;
        }
      }
      y += LINE_H;
    }
    // cursor
    if (Math.floor(time * 1.6) % 2 === 0) {
      c.fillStyle = '#9fae9f';
      c.fillRect(8, y + 2, 6, 9);
    }
    t.tex.needsUpdate = true;
  }

  update(time, dt, g, origin) {
    if (!this.field) return;
    this._scan -= dt;
    if (this._scan <= 0) {
      this._scan = 1;
      const want = new Map(this._sites(g).map((s) => [s.id, s]));
      for (const [id, t] of this.items) {
        if (!want.has(id)) {
          t.group.removeFromParent();
          t.tex.dispose();
          t.screen.material.dispose();
          t.group.children[1].geometry.dispose();
          this.items.delete(id);
        }
      }
      for (const [id, s] of want) if (!this.items.has(id)) this.items.set(id, this._create(s));
    }
    this.lights.length = 0;
    this.meshes.length = 0;
    for (const t of this.items.values()) {
      const s = t.site;
      t.group.position.set(s.x - origin.x, s.y - origin.y, s.z - origin.z);
      t.group.updateMatrixWorld(true);
      this.meshes.push(t.group.children[0]);
      const powered = !this.outages || this.outages.power(s.x, s.y + 1, s.z, 1.1, time) >= 0.5;
      if (powered !== t.powered) {
        t.powered = powered;
        t.shown = powered ? 2 : 0; // religado: reescreve do começo
        t.next = time + 0.8;
        this._draw(t, time);
      }
      // o texto aparece linha a linha; depois só o cursor e a linha viva
      if (time > t.next) {
        t.next = time + (t.shown < t.lines.length ? 0.9 + t.r.float(0, 1.2) : 0.6);
        if (t.shown < t.lines.length) t.shown++;
        this._draw(t, time);
      }
      // a tela se desfaz na névoa com a distância
      const d = Math.hypot(s.x - g.x, s.y - g.y, s.z - g.z);
      t.screen.material.opacity = t.powered ? Math.max(0, 1 - d / RANGE) : 1;
      if (t.powered) this.lights.push({ x: s.x, y: s.y + 1.4, z: s.z, color: [0.5, 0.6, 0.54], intensity: 4, mode: 'faulty', phase: s.x % 5, grid: false });
    }
  }

  dispose() {
    for (const t of this.items.values()) {
      t.tex.dispose();
      t.screen.material.dispose();
    }
    this.items.clear();
    this._body.dispose();
    this._screenGeo.dispose();
  }
}
