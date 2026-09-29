// ─────────────────────────────────────────────────────────────────────────────
//  Luzes "de shader" num mundo infinito.
//
//  Os shaders têm LIGHT_COUNT posições. Algumas são FIXAS (acompanham o
//  observador: o brilho do abismo abaixo, o brilho acima); as
//  demais são DINÂMICAS: a cada 0,25 s escolhemos, entre todas as luzes dos
//  chunks carregados, as mais próximas do observador. Luzes que entram/saem
//  do conjunto fazem fade, então nada pisca ao trocar.
//
//  Modos: 'steady' constante · 'faulty' lâmpada falhando
//         'carried' a lanterna do aparelho na mão (posição e força vêm de app/carried.js)
//         'follow' preso ao observador com um deslocamento que deriva devagar
//  (Não há luz "mágica" perto do corpo: o que ilumina o caminho é a Cidade —
//  e, no modo Peregrinação, a luz que você carrega, fase 1 do plano.)
//         'weld'   arco de solda: rajadas de clarões durante alguns segundos,
//                  depois silêncio — alguém (algo) continua construindo
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { LIGHT_COUNT } from '../shaders/materials.js';

const _col = new THREE.Vector3();

export class LightRig {
  constructor(shared) {
    this.shared = shared;
    this.fixed = []; // coordenadas de CENA
    this.slots = [];
    this._selectTimer = 0;
    this._desired = new Set();
    this.outages = null; // OutageSystem: luzes da rede apagam nos apagões
  }

  /** Luz fixa (em coordenadas de cena). */
  addFixed({ pos = new THREE.Vector3(), color, intensity, mode = 'follow', offset = null, phase = Math.random() * 100 }) {
    this.fixed.push({ pos: pos.clone(), base: pos.clone(), color: color.clone(), intensity, mode, offset, phase });
    this.slots = new Array(LIGHT_COUNT - this.fixed.length).fill(null).map(() => ({ light: null, level: 0 }));
  }

  clear() {
    this.fixed = [];
    this.slots = new Array(LIGHT_COUNT).fill(null).map(() => ({ light: null, level: 0 }));
  }

  /** A origem flutuante andou `delta`: move o que está em coordenadas de cena. */
  shift(delta) {
    for (const l of this.fixed) {
      l.pos.sub(delta);
      l.base.sub(delta);
    }
  }

  /**
   * @param {Iterable<object>} candidates  luzes {x,y,z,color[],intensity,mode,phase} GLOBAIS
   * @param {THREE.Vector3[]} focus         pontos de foco GLOBAIS
   * @param {THREE.Vector3} origin          origem flutuante
   */
  update(time, dt, camera, observerScale, candidates, focus, origin) {
    this._selectTimer -= dt;
    if (this._selectTimer <= 0) {
      this._selectTimer = 0.25;
      this._select(candidates, focus);
    }

    // entra/sai com fade
    const free = [];
    for (const s of this.slots) {
      if (s.light && !this._desired.has(s.light)) {
        s.level -= dt * 1.2;
        if (s.level <= 0) {
          s.light = null;
          s.level = 0;
        }
      } else if (s.light) {
        s.level = Math.min(1, s.level + dt * 1.2);
      }
      if (!s.light) free.push(s);
    }
    if (free.length) {
      const inSlots = new Set(this.slots.map((s) => s.light));
      for (const l of this._desired) {
        if (!free.length) break;
        if (inSlots.has(l)) continue;
        const s = free.shift();
        s.light = l;
        s.level = 0;
      }
    }

    // grava os uniforms
    const { uLightPos, uLightColor } = this.shared;
    let i = 0;
    for (const l of this.fixed) {
      this._animateFixed(l, time, dt, camera, observerScale);
      uLightPos.value[i].copy(l.pos);
      uLightColor.value[i].copy(l.color).multiplyScalar(l.intensity * flicker(l, time));
      i++;
    }
    for (const s of this.slots) {
      if (s.light) {
        const l = s.light;
        uLightPos.value[i].set(l.x - origin.x, l.y - origin.y, l.z - origin.z);
        _col.set(l.color[0], l.color[1], l.color[2]);
        // luzes da rede elétrica (quase todas) obedecem aos apagões
        // luzes da rede: apagões, setores apagados e as ondas dos setores instáveis
        const field = this.outages?.field;
        const power = l.grid === false || !this.outages ? 1 : this.outages.power(l.x, l.y, l.z, l.phase + l.x * 0.37, time) * (field ? field.sectorLight(l.x, l.y, l.z, time) : 1);
        uLightColor.value[i].copy(_col).multiplyScalar(l.intensity * flicker(l, time) * s.level * power);
      } else {
        uLightPos.value[i].set(0, -1e6, 0);
        uLightColor.value[i].set(0, 0, 0);
      }
      i++;
    }
    // para a névoa: a atenuação câmera→luz é a mesma em toda a tela — calcula
    // uma vez aqui em vez de uma vez por pixel
    const { uLightFog, uFogDensity } = this.shared;
    for (let k = 0; k < uLightPos.value.length; k++) {
      const dl = uLightPos.value[k].distanceTo(camera.position);
      uLightFog.value[k].copy(uLightColor.value[k]).multiplyScalar(Math.exp(-uFogDensity.value * 0.9 * dl));
    }
  }

  _select(candidates, focus) {
    const best = [];
    const n = this.slots.length;
    for (const l of candidates) {
      let d = Infinity;
      for (const f of focus) {
        const dd = (l.x - f.x) ** 2 + (l.y - f.y) ** 2 + (l.z - f.z) ** 2;
        if (dd < d) d = dd;
      }
      if (d > 900 * 900) continue;
      // pondera pela intensidade: luzes fortes contam de mais longe
      const score = d / Math.sqrt(l.intensity);
      if (best.length < n) {
        best.push({ l, score });
        if (best.length === n) best.sort((a, b) => a.score - b.score);
      } else if (score < best[n - 1].score) {
        best[n - 1] = { l, score };
        best.sort((a, b) => a.score - b.score);
      }
    }
    this._desired = new Set(best.map((b) => b.l));
  }

  _animateFixed(l, time, dt, camera, scale) {
    const cam = camera.position;
    if (l.mode === 'follow') {
      const o = l.offset;
      l.pos.set(
        cam.x + o.x + Math.sin(time * 0.013 + l.phase) * 60,
        cam.y + o.y,
        cam.z + o.z + Math.cos(time * 0.011 + l.phase) * 60,
      );
    }
  }
}

function flicker(l, time) {
  if (l.mode === 'carried') return 1; // a lanterna: quem manda nela é app/carried.js
  if (l.mode === 'ember') {
    // brasa quase apagada: respira devagar, irregular
    return 0.45 + 0.3 * Math.sin(time * 2.3 + l.phase) * Math.sin(time * 0.7 + l.phase * 3.1) + 0.1 * Math.sin(time * 9 + l.phase);
  }
  if (l.mode === 'weld') {
    const shift = Math.floor(time / 7 + l.phase);
    if (fract(Math.sin(shift * 91.7 + l.phase) * 43758.5) > 0.35) return 0;
    const f = fract(Math.sin(Math.floor(time * 22 + l.phase) * 12.9898) * 43758.5453);
    return f > 0.55 ? 0.6 + f : 0.03;
  }
  let k = 0.85 + 0.15 * Math.sin(time * 0.6 + l.phase);
  if (l.mode === 'faulty') {
    const step = Math.floor(time * 11 + l.phase);
    const r = fract(Math.sin(step * 12.9898 + l.phase) * 43758.5453);
    if (r > 0.93) k *= 0.08;
    else if (r > 0.88) k *= 0.5;
  }
  return k;
}

function fract(x) {
  return x - Math.floor(x);
}

export const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
