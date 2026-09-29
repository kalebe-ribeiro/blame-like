// ─────────────────────────────────────────────────────────────────────────────
//  Inscrições: o endereçamento da Cidade pintado em estêncil nas paredes
//  (ver o cofre, Enderecamento-da-Cidade). Nada "certinho": muitos lugares
//  não têm pintura, alguns códigos foram riscados e renumerados, a tinta está
//  gasta. Tudo sai do Field (a mesma seed pinta as mesmas coisas).
//
//    galerias  ao lado de onde uma passarela atravessa a parede:
//              GALERIA <código> · SETOR <código> · NÍVEL n
//    maciço    ao lado da boca dos túneis das passarelas: SETOR <código> · NÍVEL n
//    estações  na placa do abrigo: ESTAÇÃO <código>
//
//  Ler uma inscrição de perto ensina (léxico global; só na Peregrinação); a
//  palavra que nomeia o lugar onde ela está conta dobrado (referência cruzada).
//  A cena tem iluminação própria (não usa luzes do three), então cada
//  inscrição estima quanta luz chega nela: nunca brilha mais que a parede.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { MEGA, TRANSIT } from '../gen/field.js';
import { hash4 } from '../gen/hash.js';
import { drawTokens, conceptsIn } from '../lang/ancient.js';
import { sectorCode, levelNumber } from '../lang/records.js';
import { t as tr } from '../i18n/index.js';

const RANGE = 90; // m: inscrições existem só perto
const READ_AT = 16; // m: de perto (e olhando) ela conta para o léxico
const CW = 2048;
const CH = 112;
const PAINT = '#d8d0bb';

const W = (w) => ({ w });
const N = (n) => ({ n: String(n) });
const P = (p) => ({ p });
const _v = new THREE.Vector3();
const _f = new THREE.Vector3();

export class InscriptionSystem {
  constructor(parent, seed) {
    this.parent = parent;
    this.seed = seed;
    this.field = null;
    this.world = null; // léxico em world.lexicon; luzes em world.shared
    this.items = new Map();
    this._scan = 0;
    this._light = 0;
    this._lexSeen = -1;
  }

  _level(x, y, z) {
    const band = Math.floor((y - MEGA.barrierTop0) / MEGA.barrier) + 1;
    return levelNumber(this.field, band, x, z);
  }

  /** Lugares pintados perto de g (GLOBAL). */
  _sites(g) {
    const F = this.field;
    const out = [];
    const keep = (id, p = 0.6) => hash4(this.seed, Math.round(hashStr(id)), 0, 0, 960) < p;

    // ── galerias: ao lado das passarelas que atravessam a parede ──
    for (const gal of F.galleriesNear(g.x, g.y, g.z)) {
      const wallAxis = gal.axis === 'x' ? 'z' : 'x';
      const tObs = gal.axis === 'x' ? g.x : g.z;
      for (const side of [-1, 1]) {
        const wallPos = gal.c + side * gal.w / 2;
        const lat = gal.axis === 'x' ? g.z : g.x;
        if (Math.abs(lat - wallPos) > RANGE) continue;
        for (const c of F.walkwayCrossings(wallAxis, wallPos, tObs - RANGE, tObs + RANGE, g.y - RANGE, g.y + RANGE)) {
          const id = `ig:${gal.id}:${side}:${c.t}:${c.y}`;
          if (!keep(id)) continue;
          const dir = hash4(this.seed, c.t, c.y, side, 961) < 0.5 ? -1 : 1;
          const t = c.t + dir * (c.width / 2 + 6); // começa perto da abertura e segue ao longo da parede
          const face = wallPos - side * 0.1; // a face de dentro da galeria
          const [x, z] = gal.axis === 'x' ? [t, face] : [face, t];
          const y = c.y + 4.5;
          const sector = F.sectorAt(x, y, z);
          const code = { c: [Math.floor(hash4(this.seed, gal.c | 0, gal.floor | 0, 0, 962) * 22), String(Math.floor(hash4(this.seed, gal.c | 0, 1, 0, 963) * 900) + 10)] };
          out.push({
            id, x, y, z, place: 'GALLERY', size: 1.4, along: gal.axis === 'x' ? [dir, 0] : [0, dir],
            normal: gal.axis === 'x' ? [0, 0, -side] : [-side, 0, 0],
            lines: [[W('GALLERY'), code, P('·'), W('SECTOR'), sectorCode(F, sector), P('·'), W('LEVEL'), N(this._level(x, y, z))]],
          });
        }
      }
    }

    // ── maciço: ao lado da boca dos túneis das passarelas ──
    const S = 192;
    const ci = Math.floor(g.x / S);
    const cj = Math.floor(g.y / S);
    const ck = Math.floor(g.z / S);
    for (let i = ci - 1; i <= ci + 1; i++) {
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let k = ck - 1; k <= ck + 1; k++) {
          const b = F.massifBlock(i, j, k);
          if (!b) continue;
          const faces = [
            ['z', b.z0, b.x0, b.x1, [0, 0, -1]],
            ['z', b.z1, b.x0, b.x1, [0, 0, 1]],
            ['x', b.x0, b.z0, b.z1, [-1, 0, 0]],
            ['x', b.x1, b.z0, b.z1, [1, 0, 0]],
          ];
          for (const [axis, pos, a0, a1, n] of faces) {
            for (const c of F.walkwayCrossings(axis, pos, a0, a1, b.y0, b.y1)) {
              const id = `im:${i},${j},${k}:${axis}${pos}:${c.t}:${c.y}`;
              if (!keep(id, 0.5)) continue;
              const dir = hash4(this.seed, c.t, c.y, i + k, 964) < 0.5 ? -1 : 1;
              const t = c.t + dir * (c.width / 2 + 5);
              if (t < a0 + 30 || t > a1 - 30) continue;
              const face = pos + (n[0] + n[2]) * 0.1;
              const [x, z] = axis === 'z' ? [t, face] : [face, t];
              const y = c.y + 5;
              if (Math.hypot(x - g.x, y - g.y, z - g.z) > RANGE) continue;
              out.push({
                id, x, y, z, place: null, size: 1.3, normal: n, along: axis === 'z' ? [dir, 0] : [0, dir],
                lines: [[W('SECTOR'), sectorCode(F, F.sectorAt(x, y, z)), P('·'), W('LEVEL'), N(this._level(x, y, z))]],
              });
            }
          }
        }
      }
    }

    // ── estações: a placa do abrigo ──
    const ST = TRANSIT.station;
    for (const L of F.transitLinesNear(g.x, g.y, g.z, RANGE)) {
      const tp = L.axis === 'z' ? g.z : g.x;
      const s = Math.round((tp - ST / 2) / ST);
      const ts = s * ST + ST / 2;
      const len = TRANSIT.carLen + 4;
      const hw = L.w.width / 2;
      const side = L.track.side;
      const inner = hw - 0.3;
      const outer = Math.abs(L.track.off) - TRANSIT.carW / 2 - 0.15;
      const pc = side * (inner + (outer - inner) / 2);
      const t = ts + len / 2 - 1.2 - 0.09; // a face da placa voltada para a plataforma
      const [x, z] = L.axis === 'z' ? [L.u + pc, t] : [t, L.u + pc];
      const y = L.y + 3.2;
      if (Math.hypot(x - g.x, y - g.y, z - g.z) > RANGE) continue;
      const id = `is:${L.id}:${s}`;
      out.push({
        id, x, y, z, place: 'STATION', size: 0.55, maxW: (outer - inner) * 0.66,
        normal: L.axis === 'z' ? [0, 0, -1] : [-1, 0, 0],
        lines: [[W('STATION'), { c: [Math.abs(s) % 22, String(Math.abs(s * 37 + 101) % 1000)] }]],
      });
    }
    return out;
  }

  _create(site) {
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, color: 0x000000 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    mesh.renderOrder = 3;
    this.parent.add(mesh);
    const it = { site, mesh, canvas, tex, used: 1 };
    this._paint(it);
    // a placa olha na direção da normal
    const [nx, , nz] = site.normal;
    mesh.rotation.y = Math.atan2(nx, nz);
    return it;
  }

  /** Pinta o texto (as palavras entendidas no idioma do jogo, as outras em estêncil) e desgasta. */
  _paint(it) {
    const g = it.canvas.getContext('2d');
    const { site } = it;
    g.clearRect(0, 0, CW, CH);
    const lex = this.world?.lexicon;
    const known = (w) => !!lex && lex.known(w);
    const word = (w) => tr(`word.${w}`);
    const opts = { h: 72, font: 'bold 76px "Arial Narrow", "Consolas", sans-serif', color: PAINT };
    let used = drawTokens(g, site.lines[0], 16, 18, known, word, opts);
    // não coube (as palavras traduzidas são mais largas): pinta de novo, menor
    if (used > CW - 40) {
      const k = (CW - 40) / used;
      g.clearRect(0, 0, CW, CH);
      g.setTransform(k, 0, 0, k, 16 * (1 - k), 18 * (1 - k) + (CH * (1 - k)) / 2);
      drawTokens(g, site.lines[0], 16, 18, known, word, opts);
      g.setTransform(1, 0, 0, 1, 0, 0);
      used = CW - 40;
    }
    // renumerado: um em ~6 tem o código riscado (a tinta nova ao lado)
    if (hash4(this.seed, hashStr(site.id) | 0, 1, 0, 965) < 0.16) {
      g.fillStyle = PAINT;
      g.fillRect(16 + used * 0.55, 52, used * 0.3, 6);
    }
    // tinta gasta: falhas determinísticas
    g.globalCompositeOperation = 'destination-out';
    let h = hashStr(site.id);
    for (let i = 0; i < 260; i++) {
      h = (Math.imul(h ^ (h >>> 13), 0x5bd1e995) >>> 0) || 1;
      const x = (h % CW);
      const y = ((h >>> 10) % CH);
      g.globalAlpha = 0.3 + ((h >>> 20) % 70) / 100;
      g.beginPath();
      g.arc(x, y, 2 + ((h >>> 5) % 9), 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    it.tex.needsUpdate = true;
    // tamanho no mundo: altura da letra = size; a largura acompanha o texto pintado
    const wpx = Math.min(CW, used + 32);
    const hm = site.size * (CH / 72);
    let wm = hm * (wpx / CH);
    if (site.maxW && wm > site.maxW) wm = site.maxW;
    it.mesh.scale.set(wm, wm * (CH / wpx), 1);
    it.shift = site.along ? wm / 2 : 0; // o texto começa na âncora e segue ao longo da parede
    it.tex.repeat.set(wpx / CW, 1);
  }

  /** Quanta luz chega em (x,y,z) cena — a mesma conta simplificada das superfícies. */
  _lightAt(p) {
    const sh = this.world.shared;
    const amb = sh.uAmbient.value;
    let l = (amb.x + amb.y + amb.z) / 3 * 0.8;
    const P = sh.uLightPos.value;
    const C = sh.uLightColor.value;
    for (let i = 0; i < P.length; i++) {
      const d2 = p.distanceToSquared(P[i]);
      l += ((C[i].x + C[i].y + C[i].z) / 3) / (1 + d2);
    }
    return l;
  }

  update(time, dt, g, origin, camera) {
    if (!this.field) return;
    this._scan -= dt;
    if (this._scan <= 0) {
      this._scan = 1;
      const want = new Map(this._sites(g).map((s) => [s.id, s]));
      for (const [id, it] of this.items) {
        if (want.has(id)) continue;
        it.mesh.removeFromParent();
        it.mesh.geometry.dispose();
        it.mesh.material.dispose();
        it.tex.dispose();
        this.items.delete(id);
      }
      for (const [id, s] of want) if (!this.items.has(id)) this.items.set(id, this._create(s));
    }
    // o léxico cresceu: repinta (palavras entendidas passam ao idioma do jogo)
    const lex = this.world?.lexicon;
    const ver = lex ? lex.profile.lexSources.length : 0;
    const repaint = ver !== this._lexSeen;
    this._lexSeen = ver;
    this._light -= dt;
    const relight = this._light <= 0;
    if (relight) this._light = 0.4;
    camera.getWorldDirection(_f);
    for (const it of this.items.values()) {
      const s = it.site;
      const [ax, az] = s.along ?? [0, 0];
      it.mesh.position.set(s.x + ax * it.shift - origin.x, s.y - origin.y, s.z + az * it.shift - origin.z);
      if (repaint) this._paint(it);
      const d = Math.hypot(s.x - g.x, s.y - g.y, s.z - g.z);
      if (relight) {
        // a tinta clara reflete a luz que chega; some na névoa com a distância
        const l = Math.min(0.85, this._lightAt(it.mesh.position) * 5);
        it.mesh.material.color.setScalar(l);
        it.mesh.material.opacity = Math.max(0, 1 - d / RANGE) * 0.9;
      }
      // de perto e olhando: conta para o léxico
      if (lex && d < READ_AT) {
        _v.set(s.x - g.x, s.y - g.y, s.z - g.z).normalize();
        if (_v.dot(_f) > 0.75) {
          const concepts = conceptsIn(s.lines);
          const named = s.place ? [s.place] : [];
          const learnedA = lex.see(`ins:${s.id}`, concepts);
          // a palavra que nomeia o lugar, vista no próprio lugar: conta mais uma vez
          if (named.length) lex.see(`insp:${s.id}`, named);
          if (learnedA.length) this.world.bus.emit('player:learn', { words: learnedA, source: s.id });
        }
      }
    }
  }

  dispose() {
    for (const it of this.items.values()) {
      it.mesh.removeFromParent();
      it.mesh.geometry.dispose();
      it.mesh.material.dispose();
      it.tex.dispose();
    }
    this.items.clear();
  }
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h;
}
