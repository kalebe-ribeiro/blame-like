// ─────────────────────────────────────────────────────────────────────────────
//  Partículas na GPU (os efeitos do emissor — app/beamfx.js — e os respingos das gotas — world/particles.js).
//  Cada partícula guarda onde e quando nasceu; o vertex shader anda com ela (nada por partícula na CPU).
//  As posições são relativas a uma referência GLOBAL (a origem flutuante anda; o grupo anda junto).
//
//  O rework gráfico, frente 3 (efeitos): as faíscas RISCAM — o sprite cresce para caber o rastro na
//  direção do movimento na tela e o fragmento desenha um segmento fino, mais claro na ponta — e QUICAM no
//  chão (a altura dele vem de um raio no nascimento: um pulinho e ficam ali até apagar).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';

export const now = () => performance.now() / 1000;

const BURST_VERT = /* glsl */ `
attribute vec3 aV;
attribute vec4 aT;          // nascimento (s), vida (s), tamanho (m), semente
attribute float aF;         // a altura do chão (relativa à referência) — abaixo de -1e8: sem chão
uniform float uNow;
uniform float uGravity;
uniform float uDrag;
uniform float uGrow;        // o tamanho cresce com a idade (poeira se abrindo)
uniform float uStreak;      // 1: risca na direção do movimento (faíscas)
uniform float uBounce;      // 1: quica no chão
uniform vec2 uRes;          // px do alvo
varying float vU;           // idade / vida
varying float vSeed;
varying vec2 vDir;          // o rastro: a direção (no sprite) para TRÁS
varying float vL;           //   o comprimento (fração do sprite)
varying float vW;           //   a meia largura (fração do sprite)
void main() {
  float age = uNow - aT.x;
  vU = age / aT.y;
  vSeed = aT.w;
  vDir = vec2(1.0, 0.0);
  vL = 0.0;
  vW = 0.5;
  if (age < 0.0 || vU > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
  } else {
    // arrasto: a distância percorrida tende a v / drag
    float k = uDrag > 0.0 ? (1.0 - exp(-uDrag * age)) / uDrag : age;
    vec3 p = position + aV * k + vec3(0.0, -0.5 * uGravity * age * age, 0.0);
    vec3 vel = aV * (uDrag > 0.0 ? exp(-uDrag * age) : 1.0) + vec3(0.0, -uGravity * age, 0.0);
    if (uBounce > 0.5 && p.y < aF) {
      // bateu: um pulinho (sobe um pouco do que passaria e volta) e escorrega devagar
      float over = aF - p.y;
      p.y = aF + 0.18 * over * exp(-over * 2.5);
      vel = vec3(vel.x * 0.25, 0.0, vel.z * 0.25);
    }
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float ppm = uRes.y * 0.5 * projectionMatrix[1][1]; // px por m a 1 m
    float diam = aT.z * (1.0 + uGrow * vU) * ppm / max(-mv.z, 0.1);
    float size = diam;
    if (uStreak > 0.5) {
      // o rastro: onde a faísca estava 35 ms atrás, na tela
      vec4 c2 = projectionMatrix * modelViewMatrix * vec4(p - vel * 0.035, 1.0);
      vec2 s1 = gl_Position.xy / gl_Position.w * 0.5 * uRes;
      vec2 s2 = c2.xy / max(c2.w, 1e-3) * 0.5 * uRes;
      vec2 d = s2 - s1;
      float len = min(length(d), 140.0);
      size = diam + 2.0 * len;
      if (len > 0.5) vDir = vec2(d.x, -d.y) / len; // (gl_PointCoord: y para baixo)
      vL = len / size;
      vW = 0.5 * diam / size;
    }
    gl_PointSize = clamp(size, 0.0, 900.0);
  }
}
`;

const BURST_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAlpha;
uniform float uSoft;       // 1 = disco suave (poeira, clarão); 0 = ponto duro (faísca)
uniform float uStreak;
varying float vU;
varying float vSeed;
varying vec2 vDir;
varying float vL;
varying float vW;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a;
  if (uStreak > 0.5) {
    // o segmento da cabeça (o centro) para trás; mais claro e grosso na cabeça
    float tq = clamp(dot(q, vDir), 0.0, vL);
    float f = vL > 1e-4 ? tq / vL : 0.0;
    float w = vW * (1.0 - 0.6 * f);
    float dist = length(q - vDir * tq);
    a = (1.0 - smoothstep(w * 0.35, w, dist)) * (1.0 - 0.75 * f);
  } else {
    float r = length(q) * 2.0;
    a = mix(step(r, 1.0) * (1.0 - r * r), exp(-r * r * 3.5), uSoft);
  }
  a *= (1.0 - smoothstep(0.55, 1.0, vU)) * smoothstep(0.0, 0.05, vU + 0.05 * (1.0 - uSoft));
  vec3 c = mix(uColorA, uColorB, smoothstep(0.0, 0.7, vU));
  gl_FragColor = vec4(c, a * uAlpha);
}
`;

export class Burst {
  /**
   * @param {number} max
   * @param {{ additive?: boolean, gravity?: number, drag?: number, grow?: number, a: THREE.Color, b: THREE.Color, alpha?: number, soft?: number, streak?: boolean, bounce?: boolean }} o
   */
  constructor(max, o) {
    this.max = max;
    this.i = 0;
    this.ref = new THREE.Vector3(); // GLOBAL: as posições são relativas a ela
    this.lastDeath = 0;
    const g = new THREE.BufferGeometry();
    this.p = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.v = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
    this.t = new THREE.BufferAttribute(new Float32Array(max * 4).fill(-1e9), 4);
    this.f = new THREE.BufferAttribute(new Float32Array(max).fill(-1e9), 1);
    for (const a of [this.p, this.v, this.t, this.f]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.p);
    g.setAttribute('aV', this.v);
    g.setAttribute('aT', this.t);
    g.setAttribute('aF', this.f);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uNow: { value: 0 },
        uGravity: { value: o.gravity ?? 0 },
        uDrag: { value: o.drag ?? 0 },
        uGrow: { value: o.grow ?? 0 },
        uRes: { value: new THREE.Vector2(1920, 1080) },
        uColorA: { value: o.a },
        uColorB: { value: o.b },
        uAlpha: { value: o.alpha ?? 1 },
        uSoft: { value: o.soft ?? 1 },
        uStreak: { value: o.streak ? 1 : 0 },
        uBounce: { value: o.bounce ? 1 : 0 },
      },
      vertexShader: BURST_VERT,
      fragmentShader: BURST_FRAG,
      transparent: true,
      depthWrite: false,
      blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 11;
    this.points.userData.noCollide = true;
    this.dirty = false;
  }

  /** Uma partícula: g (GLOBAL), velocidade (m/s), nascimento (s), vida (s), tamanho (m), chão (y GLOBAL ou null). */
  spawn(g, vel, born, life, size, floorY = null) {
    const t = now();
    if (t > this.lastDeath) this.ref.copy(g); // (todas mortas: a referência vem para cá)
    this.lastDeath = Math.max(this.lastDeath, born + life);
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    this.p.setXYZ(i, g.x - this.ref.x, g.y - this.ref.y, g.z - this.ref.z);
    this.v.setXYZ(i, vel.x, vel.y, vel.z);
    this.t.setXYZW(i, born, life, size, Math.random());
    this.f.setX(i, floorY == null ? -1e9 : floorY - this.ref.y);
    this.dirty = true;
  }

  /** origin: a origem flutuante; t: now(); res: o tamanho do alvo em px. */
  update(origin, t, res) {
    this.mat.uniforms.uNow.value = t;
    if (res) this.mat.uniforms.uRes.value.copy(res);
    this.points.visible = t < this.lastDeath;
    this.points.position.copy(this.ref).sub(origin);
    if (this.dirty) {
      this.p.needsUpdate = this.v.needsUpdate = this.t.needsUpdate = this.f.needsUpdate = true;
      this.dirty = false;
    }
  }
}
