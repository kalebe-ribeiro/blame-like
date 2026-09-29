// ─────────────────────────────────────────────────────────────────────────────
//  Terminais mortos: consoles nas estações dos transportadores e no alto das
//  passagens das camadas. A tela mostra registros procedurais — manutenção
//  adiada há milhões de ciclos, avisos, listas de setores, "habitantes
//  registrados: 0" — na LÍNGUA ANTIGA (lang/ancient.js, lang/records.js):
//  palavras já entendidas aparecem no idioma do jogo, as outras na escrita de
//  estêncil; números sempre legíveis. Nas estações, uma linha é viva: o
//  horário real do próximo vagão.
//
//  Só os terminais perto do observador existem (e só estes redesenham a
//  tela). Sem energia (apagão), a tela apaga.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { terminalSitesNear } from '../gen/sites.js';
import { hash4, rngAt } from '../gen/hash.js';
import { t as tr } from '../i18n/index.js';
import { drawTokens } from '../lang/ancient.js';
import { terminalRecords } from '../lang/records.js';

const RANGE = 90; // m: terminais existem só perto
const W = 256;
const H = 176;
const LINE_H = 13;

export class TerminalSystem {
  constructor(parent, materials, seed) {
    this.parent = parent;
    this.materials = materials;
    this.seed = seed;
    this.field = null;
    this.transit = null;
    this.outages = null;
    this.items = new Map(); // id → terminal
    /** (site) → true: há um sensor largado ao pé deste terminal (app/reading.js decide) */
    this.toolAt = null;
    this.lights = [];
    this.meshes = [];
    this._scan = 0;
    this._body = new THREE.BoxGeometry(0.7, 1.05, 0.45);
    this._body.translate(0, 0.525, 0);
    this._screenGeo = new THREE.PlaneGeometry(0.66, 0.46);
  }

  /** Lugares de terminais perto de (x,y,z) GLOBAL (gen/sites.js). */
  _sites(g) {
    return terminalSitesNear(this.field, g.x, g.y, g.z, RANGE);
  }

  /** O terminal mais perto de g (GLOBAL), até R metros — ou null. */
  nearest(g, R = 2.4) {
    let best = null;
    let bd = R;
    for (const it of this.items.values()) {
      const s = it.site;
      const d = Math.hypot(s.x - g.x, s.y + 1.2 - g.y, s.z - g.z);
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  /** O texto inteiro de um terminal para ler (com a linha viva do horário, nas estações). */
  readable(it, time) {
    const lines = it.lines.slice();
    if (it.site.kind === 'station' && this.transit) lines.splice(2, 0, this.transit.stationStatus(it.site.line, it.site.s, time));
    return lines;
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
    // um sensor largado no chão, ao pé do terminal: um aparelho igual ao da mão, com a lente virada para cima
    const tool = new THREE.Group();
    const tb = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.04, 0.16), this.materials.machine);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.026, 0.006), this.materials.lamp ?? this.materials.machine);
    tl.position.set(0, 0, -0.083);
    tool.add(tb, tl);
    tool.position.set(0.5, 0.02, 0.3);
    tool.rotation.y = 0.7;
    tool.visible = false;
    group.add(tool);
    group.rotation.y = site.yaw;
    this.parent.add(group);
    const r = rngAt(this.seed, Math.round(site.x), Math.round(site.y), Math.round(site.z), 950);
    return { site, group, screen, tool, canvas, ctx: canvas.getContext('2d'), tex, lines: terminalRecords(this.field, site), shown: 0, next: 0, r, powered: true };
  }

  _draw(t, time) {
    const c = t.ctx;
    c.fillStyle = '#050706';
    c.fillRect(0, 0, W, H);
    if (!t.powered) {
      t.tex.needsUpdate = true;
      return;
    }
    const lines = t.lines.slice(0, t.shown);
    const lex = this.world?.lexicon;
    const known = (w) => !!lex && lex.known(w);
    const word = (w) => tr(`word.${w}`);
    // linha viva nas estações: o horário do vagão
    if (t.site.kind === 'station' && this.transit) {
      const st = this.transit.stationStatus(t.site.line, t.site.s, time);
      lines.splice(2, 0, st);
    }
    let y = 8;
    for (let i = 0; i < lines.length && y < H - 12; i++) {
      const live = i === 2 && t.site.kind === 'station'; // o horário: a linha viva
      drawTokens(c, lines[i], 8, y, known, word, { h: 7, font: '10px Consolas, "Courier New", monospace', color: i === 0 ? '#c9d4c8' : live ? '#d7c49a' : '#9fae9f', maxW: W - 16 });
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
          for (const m of t.tool.children) m.geometry.dispose();
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
      t.tool.visible = !!this.toolAt?.(s);
      t.group.updateMatrixWorld(true);
      this.meshes.push(t.group.children[0]);
      const powered = s.kind === 'unique' || !this.outages || this.outages.power(s.x, s.y + 1, s.z, 1.1, time) >= 0.5;
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
