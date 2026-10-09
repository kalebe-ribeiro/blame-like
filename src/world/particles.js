// ─────────────────────────────────────────────────────────────────────────────
//  Água e vapor: gotas caindo de tetos e passadiços, vapor subindo de dutos e
//  de fogueiras quase apagadas.
//
//  Os emissores vêm dos chunks (gerados nos workers). Aqui juntamos os que
//  estão perto do observador numa única geometria por tipo; toda a animação é
//  feita no vertex shader a partir do tempo (nada é atualizado por partícula
//  na CPU). As gotas próximas também avisam o áudio quando tocam o chão — e respingam (o rework
//  gráfico, frente 3: gotinhas que saltam e caem de volta, render/burst.js).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { createDripMaterial, createSteamMaterial } from '../shaders/materials.js';
import { Burst, now } from '../render/burst.js';

const DROPS_PER_EMITTER = 4;
const STEAM_PER_EMITTER = 16;
const RANGE = 160;
const _g = new THREE.Vector3();
const _sv = new THREE.Vector3();

export class ParticleSystem {
  constructor(parent) {
    this.group = new THREE.Group();
    this.group.name = 'particles';
    parent.add(this.group);
    this.dripMat = createDripMaterial();
    this.steamMat = createSteamMaterial();
    this.drips = null;
    this.steam = null;
    this._timer = 0;
    this._near = []; // gotas perto (para o som)
    this.bus = null; // evento drip { x, y, z } — uma gota tocou o chão
    this.res = new THREE.Vector2(1920, 1080); // o tamanho do alvo em px (app/render.js resize)
    this.splash = new Burst(256, { gravity: 9.8, drag: 0.6, a: new THREE.Color(0.55, 0.58, 0.6), b: new THREE.Color(0.3, 0.32, 0.34), alpha: 0.55, soft: 1, bounce: true });
    this.group.add(this.splash.points);
  }

  update(time, dt, g, origin, emitters) {
    this.dripMat.uniforms.uTime.value = time;
    this.steamMat.uniforms.uTime.value = time;
    this._timer -= dt;
    if (this._timer <= 0 || this._origin?.distanceToSquared(origin) > 0) {
      this._timer = 1;
      this._origin = origin.clone();
      this._rebuild(g, origin, emitters());
    }
    // som das gotas mais próximas: detecta quando a fase "dá a volta" (impacto)
    for (const d of this._near) {
      const ph = (time * d.rate + d.phase) % 1;
      if (ph < d.last) {
        this.bus?.emit('drip', { x: d.x, y: d.y - d.len, z: d.z });
        // o respingo: 3–5 gotinhas saltando de onde a gota bateu
        const g = _g.set(d.x, d.y - d.len + 0.01, d.z);
        const t = now();
        const n = 3 + Math.floor(Math.random() * 3);
        for (let k = 0; k < n; k++) {
          const a = Math.random() * Math.PI * 2;
          const s = 0.4 + Math.random() * 0.8;
          this.splash.spawn(g, _sv.set(Math.cos(a) * s, 0.8 + Math.random() * 1.2, Math.sin(a) * s), t, 0.35 + Math.random() * 0.25, 0.012 + Math.random() * 0.01, g.y);
        }
      }
      d.last = ph;
    }
    this.splash.update(origin, now(), this.res);
  }

  _rebuild(g, origin, list) {
    const drips = [];
    const steam = [];
    for (const e of list) {
      const dx = e.x - g.x;
      const dz = e.z - g.z;
      if (dx * dx + dz * dz > RANGE * RANGE) continue;
      if (e.type === 'drip' && Math.abs(e.y - e.len / 2 - g.y) < RANGE + e.len / 2) drips.push(e);
      if (e.type === 'steam' && Math.abs(e.y - g.y) < RANGE) steam.push(e);
    }
    drips.length = Math.min(drips.length, 400);
    steam.length = Math.min(steam.length, 60);

    // ── gotas: segmentos de linha (cabeça + rastro) ──
    this.drips?.geometry.dispose();
    this.drips?.removeFromParent();
    this.drips = null;
    const oldNear = new Map(this._near.map((d) => [d.key, d]));
    this._near = [];
    if (drips.length) {
      const n = drips.length * DROPS_PER_EMITTER * 2;
      const top = new Float32Array(n * 3);
      const len = new Float32Array(n);
      const phase = new Float32Array(n);
      const rate = new Float32Array(n);
      const end = new Float32Array(n);
      let v = 0;
      drips.forEach((e, ei) => {
        const hs = Math.abs(Math.sin(e.x * 12.9898 + e.z * 78.233) * 43758.5453) % 1;
        for (let q = 0; q < DROPS_PER_EMITTER; q++) {
          const ph = (hs + q / DROPS_PER_EMITTER) % 1;
          const jitter = ((q * 0.37) % 1) - 0.5;
          for (let k = 0; k < 2; k++) {
            top[v * 3] = e.x - origin.x + jitter * 0.3;
            top[v * 3 + 1] = e.y - origin.y;
            top[v * 3 + 2] = e.z - origin.z + jitter * 0.2;
            len[v] = e.len;
            phase[v] = ph;
            rate[v] = e.rate;
            end[v] = k;
            v++;
          }
          // som: só as gotas perto do observador
          const dd = Math.hypot(e.x - g.x, e.y - e.len - g.y, e.z - g.z);
          if (dd < 45) {
            const key = `${ei}:${e.x}:${e.z}:${q}`;
            this._near.push(oldNear.get(key) ?? { key, x: e.x, y: e.y, z: e.z, len: e.len, rate: e.rate, phase: ph, last: 1 });
          }
        }
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('aTop', new THREE.BufferAttribute(top, 3));
      geo.setAttribute('aLen', new THREE.BufferAttribute(len, 1));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      geo.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
      geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
      this.drips = new THREE.LineSegments(geo, this.dripMat);
      this.drips.frustumCulled = false;
      this.group.add(this.drips);
    }

    // ── vapor: pontos macios subindo e se abrindo ──
    this.steam?.geometry.dispose();
    this.steam?.removeFromParent();
    this.steam = null;
    if (steam.length) {
      const n = steam.length * STEAM_PER_EMITTER;
      const orig = new Float32Array(n * 3);
      const phase = new Float32Array(n);
      const rate = new Float32Array(n);
      const height = new Float32Array(n);
      let v = 0;
      for (const e of steam) {
        for (let q = 0; q < STEAM_PER_EMITTER; q++) {
          orig[v * 3] = e.x - origin.x;
          orig[v * 3 + 1] = e.y - origin.y;
          orig[v * 3 + 2] = e.z - origin.z;
          phase[v] = q / STEAM_PER_EMITTER + ((e.x * 0.13) % 1);
          rate[v] = e.rate;
          height[v] = e.h;
          v++;
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      geo.setAttribute('aOrigin', new THREE.BufferAttribute(orig, 3));
      geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
      geo.setAttribute('aRate', new THREE.BufferAttribute(rate, 1));
      geo.setAttribute('aHeight', new THREE.BufferAttribute(height, 1));
      this.steam = new THREE.Points(geo, this.steamMat);
      this.steam.frustumCulled = false;
      this.group.add(this.steam);
    }
  }

  dispose() {
    this.drips?.geometry.dispose();
    this.steam?.geometry.dispose();
    this.group.removeFromParent();
  }
}
