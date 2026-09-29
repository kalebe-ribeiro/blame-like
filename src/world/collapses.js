// ─────────────────────────────────────────────────────────────────────────────
//  Colapsos: de tempos em tempos um pedaço de um pilar distante se solta e
//  cai no abismo. A Cidade não só cresce — também desmorona.
//
//  • o pilar é real (Field.pillar / segmentPresent), escolhido na direção em
//    que o observador olha, dentro do alcance visível;
//  • o fragmento (caixas de concreto irregulares, com o material do pilar)
//    desprende-se com um pequeno empurrão para fora e cai girando devagar;
//  • uma nuvem de poeira no desprendimento e um rastro ao longo da queda;
//  • destroços menores se espalhando;
//  • som: o estalo chega atrasado pela distância (340 m/s); o estrondo do
//    impacto, lá embaixo e invisível, alguns segundos depois.
//
//  Tudo em coordenadas GLOBAIS; as malhas são reposicionadas pela origem.
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { PILLAR_CELL, SEG_H } from '../gen/field.js';
import { mergeAll, place } from './geometry.js';

const GRAV = 9.8;
const DUST_MAX = 420;
const DEBRIS = 28;
const LIFE = 26; // s até sumir no fundo

const DUST_VERT = /* glsl */ `
attribute float aBirth;
attribute float aSize;
uniform float uTime;
varying float vA;
void main() {
  float age = uTime - aBirth;
  vec4 mv = modelViewMatrix * vec4(position + vec3(0.0, age * 1.5, 0.0), 1.0);
  float grow = aSize * (1.0 + age * 0.9);
  gl_PointSize = grow * 600.0 / max(-mv.z, 1.0);
  vA = aBirth < 0.0 ? 0.0 : smoothstep(0.0, 0.4, age) * (1.0 - smoothstep(2.0, 9.0, age));
  gl_Position = projectionMatrix * mv;
}
`;
const DUST_FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.1, d) * vA * 0.28;
  gl_FragColor = vec4(uColor, a);
}
`;

export class CollapseSystem {
  constructor(parent, materials, shared) {
    this.parent = parent;
    this.materials = materials;
    this.field = null;
    this.enabled = true;
    this.maxDist = 380;
    this.events = [];
    this.onStart = null; // (ev) — estalo
    this.onImpact = null; // (ev) — estrondo lá embaixo
    this._next = 40 + Math.random() * 50;

    // poeira: um anel de partículas compartilhado por todos os colapsos
    const g = new THREE.BufferGeometry();
    this.dustPos = new Float32Array(DUST_MAX * 3);
    this.dustBirth = new Float32Array(DUST_MAX).fill(-1e9);
    this.dustSize = new Float32Array(DUST_MAX);
    g.setAttribute('position', new THREE.BufferAttribute(this.dustPos, 3));
    g.setAttribute('aBirth', new THREE.BufferAttribute(this.dustBirth, 1));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.dustSize, 1));
    this.dustMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Vector3(0.11, 0.105, 0.1) } },
      vertexShader: DUST_VERT,
      fragmentShader: DUST_FRAG,
      transparent: true,
      depthWrite: false,
    });
    this.dust = new THREE.Points(g, this.dustMat);
    this.dust.frustumCulled = false;
    this.dust.renderOrder = 6;
    this.dustOrigin = new THREE.Vector3(); // as posições da poeira são relativas a este ponto global
    this._dustI = 0;
    parent.add(this.dust);
  }

  /** Força um colapso agora (para testes: --collapse). */
  trigger(g, fwd, time) {
    return this._spawn(g, fwd, time);
  }

  _findSite(g, fwd) {
    // procura um segmento de pilar existente à frente, dentro do alcance
    for (let tries = 0; tries < 40; tries++) {
      const dist = 150 + Math.random() * Math.max(50, this.maxDist - 150);
      const yaw = Math.atan2(fwd.x, fwd.z) + (Math.random() - 0.5) * 1.4;
      const tx = g.x + Math.sin(yaw) * dist;
      const tz = g.z + Math.cos(yaw) * dist;
      const ty = g.y + (Math.random() - 0.3) * 160;
      const p = this.field.pillar(Math.floor(tx / PILLAR_CELL), Math.floor(tz / PILLAR_CELL));
      if (!p) continue;
      const j = Math.floor(ty / SEG_H);
      if (!this.field.segmentPresent(p, j)) continue;
      const y = j * SEG_H + SEG_H * (0.2 + Math.random() * 0.6);
      const c = this.field.pillarCenter(p, y);
      const r = this.field.pillarRadius(p, j);
      return { x: c.x, y, z: c.z, r };
    }
    return null;
  }

  _spawn(g, fwd, time) {
    const site = this._findSite(g, fwd);
    if (!site) return null;
    // a poeira passa a ser relativa ao observador atual (precisão de float)
    if (!this.events.length) this.dustOrigin.copy(g);
    // de que lado do pilar: o voltado para o observador (para ser visto)
    const ax = g.x - site.x;
    const az = g.z - site.z;
    const al = Math.hypot(ax, az) || 1;
    const out = new THREE.Vector3(ax / al, 0, az / al);
    const size = site.r * (0.8 + Math.random() * 0.9) + 4;

    // o fragmento: 3–6 caixas coladas, irregulares
    const parts = [];
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const s = size * (0.35 + Math.random() * 0.55);
      parts.push(place(new THREE.BoxGeometry(s, s * (0.6 + Math.random()), s * (0.5 + Math.random() * 0.8)), {
        x: (Math.random() - 0.5) * size * 0.6,
        y: (Math.random() - 0.5) * size * 0.7,
        z: (Math.random() - 0.5) * size * 0.6,
        rx: Math.random() * 0.6, ry: Math.random() * 3, rz: Math.random() * 0.6,
      }));
    }
    const mesh = new THREE.Mesh(mergeAll(parts), this.materials.tower);
    this.parent.add(mesh);

    // destroços: pedaços pequenos
    const deb = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), this.materials.tower, DEBRIS);
    deb.frustumCulled = false;
    this.parent.add(deb);
    const debris = Array.from({ length: DEBRIS }, () => ({
      p: new THREE.Vector3((Math.random() - 0.5) * size, (Math.random() - 0.5) * size, (Math.random() - 0.5) * size),
      v: new THREE.Vector3(out.x * 4 + (Math.random() - 0.5) * 9, Math.random() * 5, out.z * 4 + (Math.random() - 0.5) * 9),
      s: 0.6 + Math.random() * 2.8,
      rot: new THREE.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6),
      w: new THREE.Vector3((Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3),
    }));

    const ev = {
      mesh,
      deb,
      debris,
      pos: new THREE.Vector3(site.x + out.x * (site.r + size * 0.3), site.y, site.z + out.z * (site.r + size * 0.3)),
      start: new THREE.Vector3(site.x, site.y, site.z),
      vel: out.clone().multiplyScalar(1.5 + Math.random() * 2),
      rot: new THREE.Euler(),
      w: new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.5) * 0.15, (Math.random() - 0.5) * 0.25),
      t0: time,
      delay: 1.2 + Math.random() * 1.5, // rangido antes de ceder
      size,
      impactAt: 6 + Math.random() * 6, // s de queda até bater em algo invisível lá embaixo
      impacted: false,
      lastDust: 0,
    };
    // nuvem do desprendimento
    for (let i = 0; i < 40; i++) {
      this._puff(ev.pos.x + (Math.random() - 0.5) * size, ev.pos.y + (Math.random() - 0.5) * size, ev.pos.z + (Math.random() - 0.5) * size, time + ev.delay + Math.random() * 0.8, size * 0.5);
    }
    this.events.push(ev);
    this.onStart?.(ev);
    return ev;
  }

  _puff(x, y, z, birth, size) {
    const i = this._dustI++ % DUST_MAX;
    this.dustPos[i * 3] = x - this.dustOrigin.x;
    this.dustPos[i * 3 + 1] = y - this.dustOrigin.y;
    this.dustPos[i * 3 + 2] = z - this.dustOrigin.z;
    this.dustBirth[i] = birth;
    this.dustSize[i] = size;
    this.dust.geometry.attributes.position.needsUpdate = true;
    this.dust.geometry.attributes.aBirth.needsUpdate = true;
    this.dust.geometry.attributes.aSize.needsUpdate = true;
  }

  update(time, dt, g, fwd, origin) {
    this.dustMat.uniforms.uTime.value = time;
    this.dust.position.set(this.dustOrigin.x - origin.x, this.dustOrigin.y - origin.y, this.dustOrigin.z - origin.z);
    if (this.enabled && this.field) {
      this._next -= dt;
      if (this._next <= 0) {
        this._next = this._spawn(g, fwd, time) ? 70 + Math.random() * 110 : 15;
      }
    }
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const sc = new THREE.Vector3();
    for (const ev of this.events) {
      const t = time - ev.t0;
      if (t > ev.delay) {
        // caindo
        ev.vel.y -= GRAV * dt;
        ev.pos.addScaledVector(ev.vel, dt);
        ev.rot.x += ev.w.x * dt;
        ev.rot.y += ev.w.y * dt;
        ev.rot.z += ev.w.z * dt;
        // rastro de poeira
        if (time - ev.lastDust > 0.12) {
          ev.lastDust = time;
          this._puff(ev.pos.x + (Math.random() - 0.5) * ev.size, ev.pos.y + ev.size * 0.4, ev.pos.z + (Math.random() - 0.5) * ev.size, time, ev.size * 0.35);
        }
        for (const d of ev.debris) {
          d.v.y -= GRAV * dt;
          d.p.addScaledVector(d.v, dt);
          d.rot.x += d.w.x * dt;
          d.rot.y += d.w.y * dt;
        }
      } else {
        // rangendo: o bloco treme no lugar
        ev.rot.z = Math.sin(t * 40) * 0.004 * (t / ev.delay);
      }
      ev.mesh.position.set(ev.pos.x - origin.x, ev.pos.y - origin.y, ev.pos.z - origin.z);
      ev.mesh.rotation.copy(ev.rot);
      ev.debris.forEach((d, i) => {
        q.setFromEuler(d.rot);
        sc.setScalar(t > ev.delay ? d.s : 0.0001);
        m.compose(new THREE.Vector3(ev.pos.x + d.p.x - origin.x, ev.pos.y + d.p.y - origin.y, ev.pos.z + d.p.z - origin.z), q, sc);
        ev.deb.setMatrixAt(i, m);
      });
      ev.deb.instanceMatrix.needsUpdate = true;
      if (!ev.impacted && t > ev.delay + ev.impactAt) {
        ev.impacted = true;
        this.onImpact?.(ev);
      }
    }
    // remove os que já sumiram lá embaixo
    this.events = this.events.filter((ev) => {
      if (time - ev.t0 < LIFE) return true;
      ev.mesh.geometry.dispose();
      ev.mesh.removeFromParent();
      ev.deb.geometry.dispose();
      ev.deb.removeFromParent();
      return false;
    });
  }

  dispose() {
    for (const ev of this.events) {
      ev.mesh.geometry.dispose();
      ev.mesh.removeFromParent();
      ev.deb.geometry.dispose();
      ev.deb.removeFromParent();
    }
    this.events = [];
    this.dust.geometry.dispose();
    this.dustMat.dispose();
    this.dust.removeFromParent();
  }
}
