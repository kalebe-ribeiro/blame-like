// ─────────────────────────────────────────────────────────────────────────────
//  Os efeitos do emissor de feixe gravitacional (o cofre, Arma-do-Killy §7, fase F3).
//  app/beam.js decide o jogo; aqui só o que se vê e se ouve. O emissor DOBRA o espaço:
//  carregar puxa o mundo para a frente da arma; o tiro é uma linha; o colapso vem depois,
//  correndo pela linha. Branco e quente, poeira, metal em brasa — toda luz tem fonte
//  (a arma, o feixe, a detonação, o metal quente).
//
//    carregando   a lente (render/lens.js: um ponto de atração na mira), a poeira escorrendo
//                 para ele (uAttract na poeira), a mão e a câmera tremendo
//    o disparo    um traço fino e quase cegante (núcleo + halo, 0,15 s); a dobra em linha; a
//                 luz do tiro nas superfícies (uShotA/B — uma luz-linha, sem vaga de luz)
//    a detonação  corre pela linha a 1500 m/s: clarões, anéis de poeira se abrindo (malhas
//                 transitórias), o estrondo de cada trecho chegando pela distância (340 m/s)
//    depois       as faces do corte em brasa (o material 'cut' — uCutA/B), faíscas pingando
//                 das bordas, lascas e detritos caindo (um raio para baixo no nascimento),
//                 poeira assentando no túnel, rangidos
//
//  Partículas na GPU: cada uma guarda onde e quando nasceu; o vertex shader anda com ela
//  (nada por partícula na CPU). As posições são relativas a uma referência GLOBAL (a origem
//  flutuante anda; o grupo anda junto).
// ─────────────────────────────────────────────────────────────────────────────
import * as THREE from 'three';
import { CollisionWorld } from '../world/collision.js';

const DET_SPEED = 1500; // m/s — a detonação ao longo do feixe
const SOUND = 340; // m/s
const HEAT_SLOTS = 8;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);
const now = () => performance.now() / 1000;

// ── partículas (pontos) ─────────────────────────────────────────────────────

const BURST_VERT = /* glsl */ `
attribute vec3 aV;
attribute vec4 aT;          // nascimento (s), vida (s), tamanho (m), semente
uniform float uNow;
uniform float uGravity;
uniform float uDrag;
uniform float uGrow;        // o tamanho cresce com a idade (poeira se abrindo)
uniform float uScale;       // px por m a 1 m
varying float vU;           // idade / vida
varying float vSeed;
void main() {
  float age = uNow - aT.x;
  vU = age / aT.y;
  vSeed = aT.w;
  if (age < 0.0 || vU > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; return; }
  // arrasto: a distância percorrida tende a v / drag
  float k = uDrag > 0.0 ? (1.0 - exp(-uDrag * age)) / uDrag : age;
  vec3 p = position + aV * k + vec3(0.0, -0.5 * uGravity * age * age, 0.0);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aT.z * (1.0 + uGrow * vU) * uScale / max(-mv.z, 0.1), 0.0, 900.0);
}
`;

const BURST_FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uAlpha;
uniform float uSoft;       // 1 = disco suave (poeira, clarão); 0 = ponto duro (faísca)
varying float vU;
varying float vSeed;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float r = length(q) * 2.0;
  float a = mix(step(r, 1.0) * (1.0 - r * r), exp(-r * r * 3.5), uSoft);
  a *= (1.0 - smoothstep(0.55, 1.0, vU)) * smoothstep(0.0, 0.05, vU + 0.05 * (1.0 - uSoft));
  vec3 c = mix(uColorA, uColorB, smoothstep(0.0, 0.7, vU));
  gl_FragColor = vec4(c, a * uAlpha);
}
`;

class Burst {
  /**
   * @param {number} max
   * @param {{ additive?: boolean, gravity?: number, drag?: number, grow?: number, a: THREE.Color, b: THREE.Color, alpha?: number, soft?: number }} o
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
    for (const a of [this.p, this.v, this.t]) a.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.p);
    g.setAttribute('aV', this.v);
    g.setAttribute('aT', this.t);
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        uNow: { value: 0 },
        uGravity: { value: o.gravity ?? 0 },
        uDrag: { value: o.drag ?? 0 },
        uGrow: { value: o.grow ?? 0 },
        uScale: { value: 600 },
        uColorA: { value: o.a },
        uColorB: { value: o.b },
        uAlpha: { value: o.alpha ?? 1 },
        uSoft: { value: o.soft ?? 1 },
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

  /** Uma partícula: g (GLOBAL), velocidade (m/s), nascimento (s), vida (s), tamanho (m). */
  spawn(g, vel, born, life, size) {
    const t = now();
    if (t > this.lastDeath) this.ref.copy(g); // (todas mortas: a referência vem para cá)
    this.lastDeath = Math.max(this.lastDeath, born + life);
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    this.p.setXYZ(i, g.x - this.ref.x, g.y - this.ref.y, g.z - this.ref.z);
    this.v.setXYZ(i, vel.x, vel.y, vel.z);
    this.t.setXYZW(i, born, life, size, Math.random());
    this.dirty = true;
  }

  update(origin, t, pxPerM) {
    this.mat.uniforms.uNow.value = t;
    this.mat.uniforms.uScale.value = pxPerM;
    this.points.visible = t < this.lastDeath;
    this.points.position.copy(this.ref).sub(origin);
    if (this.dirty) {
      this.p.needsUpdate = this.v.needsUpdate = this.t.needsUpdate = true;
      this.dirty = false;
    }
  }
}

// ── anéis de poeira (a onda de choque) ──────────────────────────────────────

const RING_VERT = /* glsl */ `
attribute vec4 aR;          // nascimento (s), vida (s), raio inicial, raio final
uniform float uNow;
varying float vU;
varying float vR;
void main() {
  float age = uNow - aR.x;
  vU = age / aR.y;
  vR = length(position.xy);
  if (age < 0.0 || vU > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  float r = aR.z + (aR.w - aR.z) * (1.0 - exp(-age * 4.0));
  vec4 wp = modelMatrix * instanceMatrix * vec4(position.xy * r, position.z, 1.0);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const RING_FRAG = /* glsl */ `
varying float vU;
varying float vR;
void main() {
  // um anel de poeira translúcida: mais denso na frente da onda, claro no começo (o clarão)
  float band = smoothstep(0.55, 0.92, vR) * (1.0 - smoothstep(0.96, 1.0, vR));
  float a = band * (1.0 - smoothstep(0.2, 1.0, vU)) * 0.45;
  vec3 c = mix(vec3(0.95, 0.85, 0.7), vec3(0.2, 0.185, 0.165), smoothstep(0.0, 0.25, vU));
  gl_FragColor = vec4(c, a);
}
`;

class Rings {
  constructor(max) {
    this.max = max;
    this.i = 0;
    this.ref = new THREE.Vector3();
    this.lastDeath = 0;
    const geo = new THREE.RingGeometry(0.0, 1, 40, 2);
    this.r = new THREE.InstancedBufferAttribute(new Float32Array(max * 4).fill(-1e9), 4);
    this.r.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aR', this.r);
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uNow: { value: 0 } },
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.InstancedMesh(geo, this.mat, max);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 11;
    this.mesh.userData.noCollide = true;
    this._m = new THREE.Matrix4();
    this._quat = new THREE.Quaternion();
    this._one = new THREE.Vector3(1, 1, 1);
    this._z = new THREE.Vector3(0, 0, 1);
    for (let i = 0; i < max; i++) this.mesh.setMatrixAt(i, this._m.identity());
  }

  /** Um anel em g (GLOBAL), perpendicular a `dir`. */
  spawn(g, dir, born, life, r0, r1) {
    const t = now();
    if (t > this.lastDeath) this.ref.copy(g);
    this.lastDeath = Math.max(this.lastDeath, born + life);
    const i = this.i;
    this.i = (this.i + 1) % this.max;
    this._quat.setFromUnitVectors(this._z, dir);
    this._m.compose(_q.copy(g).sub(this.ref), this._quat, this._one);
    this.mesh.setMatrixAt(i, this._m);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.r.setXYZW(i, born, life, r0, r1);
    this.r.needsUpdate = true;
  }

  update(origin, t) {
    this.mat.uniforms.uNow.value = t;
    this.mesh.visible = t < this.lastDeath;
    this.mesh.position.copy(this.ref).sub(origin);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export function createBeamFx(ctx) {
  const { camera, world, audio } = ctx;
  const group = new THREE.Group();
  group.name = 'beamfx';
  ctx.scene.add(group);
  const col = new CollisionWorld(world);
  col.buildsPerFrame = 6;

  const flashes = new Burst(256, { additive: true, a: new THREE.Color(1.0, 0.95, 0.85), b: new THREE.Color(1.0, 0.55, 0.2), alpha: 0.9 });
  const sparks = new Burst(1024, { additive: true, gravity: 9.8, drag: 0.4, a: new THREE.Color(1.0, 0.7, 0.3), b: new THREE.Color(1.0, 0.2, 0.02), soft: 0, alpha: 1 });
  // (a poeira só se vê onde há luz: clara no começo — o clarão e o metal quente —, depois some no escuro)
  const dust = new Burst(512, { gravity: 0.15, drag: 1.2, grow: 1.6, a: new THREE.Color(0.32, 0.29, 0.25), b: new THREE.Color(0.1, 0.095, 0.09), alpha: 0.3 });
  const rings = new Rings(96);
  for (const o of [dust.points, rings.mesh, flashes.points, sparks.points]) group.add(o);

  // o traço: núcleo fino quase branco + halo estreito (aditivos — o bloom faz o resto)
  // (um cone: fino na boca da arma — um cilindro grosso visto de perto parecia uma cunha)
  const traceGeo = new THREE.CylinderGeometry(1, 0.12, 1, 8, 1, true).translate(0, 0.5, 0);
  const mkTrace = (color, opacity) => {
    const m = new THREE.Mesh(traceGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.frustumCulled = false;
    m.visible = false;
    m.userData.noCollide = true;
    m.renderOrder = 12;
    group.add(m);
    return m;
  };
  const core = mkTrace(0xfff8ee, 1);
  const halo = mkTrace(0xffd9a8, 0.35);

  /** @type {{ a: THREE.Vector3, b: THREE.Vector3, dir: THREE.Vector3, len: number, r: number, k: number, t0: number }[]} */
  const shots = []; // os tiros recentes (GLOBAIS): luz, brasa, faíscas, detritos
  /** @type {{ mesh: THREE.Mesh, vx: number, vy: number, vz: number, floor: number, rest: boolean, spin: THREE.Vector3, g: THREE.Vector3, bounced: boolean }[]} */
  const falling = [];
  /** @type {{ g: THREE.Vector3, until: number, rate: number, acc: number }[]} */
  const drips = []; // pontos de borda quente que pingam faíscas
  const seenDebris = new Set();
  /** @type {{ a: THREE.Vector3, dir: THREE.Vector3, k: number, r: number, t0: number, pts: number[], i: number, silent: boolean, booms: { g: THREE.Vector3, d: number, born: number }[] }[]} */
  const detonations = []; // as detonações sendo semeadas (alguns pontos por quadro)
  let charge = 0; // a carga mostrada (0..1)
  let charging = false;
  let push = 0; // a poeira empurrada no disparo (decai)
  let lineK = 0;
  const lineA = new THREE.Vector3();
  const lineB = new THREE.Vector3();
  const _p2 = new THREE.Vector2();
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);

  const free = () => ctx.settings?.distortion !== false;
  const pxPerM = () => (camera.isPerspectiveCamera ? (ctx.renderer.getDrawingBufferSize(_p2).y * 0.5) / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) : 600);
  const toScreen = (scenePos, out) => {
    _v.copy(scenePos).project(camera);
    return out.set(_v.x * 0.5 + 0.5, _v.y * 0.5 + 0.5);
  };

  /** Um pedaço que cai (detrito ou lasca): `size` em m, em g (GLOBAL), material do mundo. */
  function drop(g, sx, sy, sz, mat, vel = null) {
    if (falling.length > 60) {
      const old = falling.shift();
      group.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(boxGeo, world.materials[mat] ?? world.materials.cut);
    mesh.scale.set(Math.max(0.04, sx), Math.max(0.04, sy), Math.max(0.04, sz));
    mesh.userData.noCollide = true;
    mesh.position.copy(g).sub(world.origin);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    group.add(mesh);
    // um raio para baixo, só agora: onde vai pousar
    col._t = -1e9;
    col.refresh(mesh.position, Math.max(10, sy + 4));
    const hit = col.ray(mesh.position, DOWN, 160);
    const floor = hit ? hit.point.y + world.origin.y + Math.min(sx, sy, sz) * 0.4 : g.y - 160;
    falling.push({ mesh, vy: vel?.y ?? 0, vx: vel?.x ?? 0, vz: vel?.z ?? 0, floor, rest: false, bounced: false, g: g.clone(), spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(6) });
  }

  // um chunk refeito por um corte entrou: os detritos do corte recente caem, e as bordas
  // de verdade (raios do eixo para fora) viram lascas e pontos que pingam faíscas
  world.bus.on('cut:swap', ({ entry }) => {
    const t = now();
    const recent = shots.filter((s) => t - s.t0 < 6);
    if (!recent.length) return;
    for (const d of entry.debris ?? []) {
      const key = `${d.x.toFixed(1)},${d.y.toFixed(1)},${d.z.toFixed(1)}`;
      if (seenDebris.has(key)) continue;
      _v.set(d.x, d.y, d.z);
      if (!recent.some((s) => segDist(_v, s) < s.r + Math.max(d.sx, d.sy, d.sz))) continue;
      seenDebris.add(key);
      drop(_v.clone(), d.sx * 0.9, d.sy * 0.9, d.sz * 0.9, d.mat);
    }
    // as bordas perto do jogador (os chunks deste trecho do feixe, até ~70 m)
    const eye = world.toGlobal(camera.position, _w);
    for (const s of recent) {
      const n = 10;
      for (let i = 0; i < n; i++) {
        const along = 1.5 + Math.random() * Math.min(s.len - 1.5, 70);
        const axis = s.a.clone().addScaledVector(s.dir, along);
        if (axis.distanceTo(eye) > 80) continue;
        // uma direção perpendicular ao feixe, ao acaso
        _q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(s.dir).normalize();
        const from = axis.clone().sub(world.origin);
        col._t = -1e9;
        col.refresh(from, s.r + 3);
        const hit = col.ray(from, _q, s.r + 0.6);
        if (!hit || Math.abs(hit.distance - s.r) > 0.6) continue;
        const g = hit.point.clone().add(world.origin);
        drips.push({ g, until: t + 4 + Math.random() * 5, rate: 6 + Math.random() * 10, acc: 0 });
        if (drips.length > 64) drips.shift();
        if (Math.random() < 0.5 && s.k > 0.2) {
          const c = 0.08 + Math.random() * 0.25 * s.k;
          drop(g.clone().addScaledVector(_q, -0.2), c, c * 0.6, c * 1.3, 'cut', _q.clone().multiplyScalar(-1.5 - Math.random() * 2));
        }
      }
    }
  });

  // ── compilar de antemão (sem travar): os programas que o primeiro tiro usaria — a brasa no
  // material 'cut' em lote (BatchedMesh), cada material do mundo numa malha comum (os detritos
  // caindo), as partículas, os anéis, o traço e a lente. Sem isto, o primeiro tiro da sessão
  // travava ~1,7 s compilando. Refeito a cada mundo novo (os materiais são outros).
  let warmedFor = null;
  let warmAt = 0;
  function warm() {
    const r = ctx.renderer;
    if (!r.compileAsync) return;
    const sc = new THREE.Scene();
    const tri = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
    tri.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(9), 3));
    tri.setIndex([0, 1, 2]);
    const bm = new THREE.BatchedMesh(1, 3, 3, world.materials.cut);
    bm.addGeometry(tri);
    sc.add(bm);
    for (const m of Object.values(world.materials)) sc.add(new THREE.Mesh(boxGeo, m));
    if (ctx.lens) sc.add(new THREE.Mesh(boxGeo, ctx.lens.material));
    for (const o of [...group.children]) {
      const c = o.clone();
      c.visible = true;
      sc.add(c);
    }
    r.compileAsync(sc, camera)
      .catch(() => {})
      .finally(() => bm.dispose());
    // e um disparo mudo, longe e fora da vista: o primeiro de verdade não paga a primeira vez
    // de cada caminho (o JS ainda frio, os buffers subindo para a GPU)
    const far = world.toGlobal(camera.position, new THREE.Vector3()).add(new THREE.Vector3(0, -5000, 0));
    api.fire(far, far.clone().add(new THREE.Vector3(0, 0, 120)), 1, 2.8, camera.position.clone().add(new THREE.Vector3(0, -5000, 0)), true);
    shots.length = 0;
    lineK = 0;
    push = 0;
    for (const m of [core, halo]) m.visible = false;
  }

  /** Distância de um ponto GLOBAL ao segmento de um tiro. */
  function segDist(p, s) {
    const u = Math.max(0, Math.min(s.len, _w.copy(p).sub(s.a).dot(s.dir)));
    return _w.copy(s.a).addScaledVector(s.dir, u).distanceTo(p);
  }

  const api = {
    /** Carregando (k 0..1) — ou não (k < 0). */
    charge(k) {
      charging = k >= 0;
      charge = Math.max(0, k);
    },

    /**
     * O disparo: a (GLOBAL, de onde sai), end (GLOBAL, onde acaba), carga k, raio r, a boca
     * da arma (cena).
     */
    fire(a, end, k, r, muzzle, silent = false) {
      const t0 = now();
      const dir = end.clone().sub(a);
      const len = dir.length();
      dir.divideScalar(len || 1);
      shots.push({ a: a.clone(), b: end.clone(), dir, len, r, k, t0 });
      if (shots.length > HEAT_SLOTS) shots.shift();
      // o traço
      const endS = end.clone().sub(world.origin);
      /** @type {[THREE.Mesh, number][]} */
      const traces = [[core, 0.012 + 0.02 * k], [halo, 0.07 + 0.18 * k]];
      for (const [m, w] of traces) {
        m.visible = true;
        m.position.copy(muzzle);
        m.quaternion.setFromUnitVectors(_v.set(0, 1, 0), _w.copy(endS).sub(muzzle).normalize());
        m.scale.set(w, Math.max(0.1, muzzle.distanceTo(endS)), w);
        m.userData.t0 = t0;
      }
      lineA.copy(muzzle);
      lineB.copy(endS);
      lineK = 1;
      push = 1;
      // a detonação: do mais perto ao mais longe, a 1500 m/s — os pontos entram numa fila e
      // nascem nos quadros seguintes (o quadro do tiro fica leve; cada um tem a sua hora)
      const step = Math.max(6, len / 28);
      const pts = [];
      for (let q = 2; q < len; q += step) pts.push(q);
      detonations.push({ a: a.clone(), dir, k, r, t0, pts, i: 0, silent, booms: [] });
    },

    update(dt) {
      const t = now();
      const origin = world.origin;
      if (warmedFor !== world.materials) {
        if (!warmAt) warmAt = t + 3;
        else if (t > warmAt && world.materials.cut) {
          warmedFor = world.materials;
          warmAt = 0;
          warm();
        }
      }
      const sh = ctx.shared;
      // ── a detonação: até 10 pontos por quadro (cada um nasce na sua hora — o atraso é do shader) ──
      for (let di = detonations.length - 1; di >= 0; di--) {
        const D = detonations[di];
        const eye = world.toGlobal(camera.position, _w).clone();
        for (let n = 0; n < 10 && D.i < D.pts.length; n++, D.i++) {
          const s = D.pts[D.i];
          const g = D.a.clone().addScaledVector(D.dir, s);
          const born = D.t0 + s / DET_SPEED;
          // (perto da boca, menor: um clarão do tamanho do mundo no rosto só cega)
          if (s > 4) flashes.spawn(g, _v.set(0, 0, 0), born, 0.09 + 0.08 * D.k, (1.2 + 2.4 * D.r) * Math.min(1, s / 25));
          if (s > 6) rings.spawn(g, D.dir, born + 0.01, 1.4 + 1.2 * D.k, D.r * 0.8, D.r * (3 + 3 * D.k)); // (não em volta de quem atira)
          // a poeira: o que a onda levanta e depois assenta
          for (let j = 0; j < 2; j++) {
            _q.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).cross(D.dir).normalize();
            const p = g.clone().addScaledVector(_q, D.r * (0.4 + Math.random() * 0.8));
            dust.spawn(p, _q.multiplyScalar(1.5 + 3 * D.k), born + 0.05, 4 + Math.random() * 4, 1.2 + 2.5 * D.r);
          }
          D.booms.push({ g, d: g.distanceTo(eye), born });
        }
        if (D.i < D.pts.length) continue;
        detonations.splice(di, 1);
        if (D.silent) continue;
        // o estrondo de cada trecho chega pela distância (no máximo 6 trechos); depois, o metal
        const B = D.booms;
        const pick = B.filter((_, i) => i % Math.max(1, Math.floor(B.length / 6)) === 0).slice(0, 6);
        for (const b of pick) {
          const [pan] = ctx.placeOf(b.g.x, b.g.y, b.g.z);
          audio.beamBoom?.(pan, b.d, D.k, Math.max(0, b.born - t) + b.d / SOUND);
        }
        for (let i = 0; i < 1 + Math.round(2 * D.k); i++) {
          const b = B[Math.floor(Math.random() * B.length)];
          if (!b) break;
          const [pan] = ctx.placeOf(b.g.x, b.g.y, b.g.z);
          audio.beamCreak?.(pan, b.d, 1.5 + Math.random() * 3 + b.d / SOUND);
        }
      }
      // ── carregando: lente, poeira, tremor ──
      const lens = ctx.lens;
      camera.getWorldDirection(_v);
      const pullAt = _q.copy(camera.position).addScaledVector(_v, 2.6);
      let point = 0;
      if (charging && charge > 0) {
        point = Math.min(0.85, charge * 0.85);
        const j = 0.0016 * charge;
        camera.rotateX((Math.random() - 0.5) * j);
        camera.rotateY((Math.random() - 0.5) * j);
      }
      push = Math.max(0, push - dt * 2.5);
      const du = ctx.dust.material.uniforms.uAttract.value;
      du.set(pullAt.x, pullAt.y, pullAt.z, charging ? 1.2 * charge : -1.4 * push);
      lineK = Math.max(0, lineK - dt / 0.14);
      if (lens) {
        const on = free() && (point > 0.005 || lineK > 0.005);
        lens.enabled = on;
        if (on) {
          const u = lens.uniforms;
          toScreen(pullAt, _p2);
          u.uPoint.value.set(_p2.x, _p2.y, point);
          u.uRadius.value = 0.1 + 0.12 * charge;
          u.uAspect.value = camera.aspect;
          u.uNear.value = camera.near;
          u.uFar.value = camera.far;
          toScreen(lineA, u.uLineA.value);
          // (o fim pode estar fora da tela: fica a direção)
          _w.copy(lineB).sub(lineA);
          const far = lineA.clone().addScaledVector(_w.normalize(), Math.min(lineA.distanceTo(lineB), 60));
          toScreen(far, u.uLineB.value);
          u.uLineK.value = lineK;
        }
      }
      // ── o traço se apaga ──
      for (const m of [core, halo]) {
        if (!m.visible) continue;
        const age = t - m.userData.t0;
        m.material.opacity = (m === core ? 1 : 0.35) * Math.max(0, 1 - age / 0.15);
        if (age > 0.15) m.visible = false;
      }
      // ── a luz do tiro (luz-linha): corre com a detonação e se apaga em ~0,6 s ──
      const last = shots[shots.length - 1];
      if (last && t - last.t0 < 0.7) {
        const age = t - last.t0;
        const front = Math.min(last.len, age * DET_SPEED);
        sh.uShotA.value.set(last.a.x - origin.x, last.a.y - origin.y, last.a.z - origin.z, (1.5 + 4.5 * last.k) * Math.exp(-age / 0.15));
        sh.uShotB.value.set(last.a.x + last.dir.x * front - origin.x, last.a.y + last.dir.y * front - origin.y, last.a.z + last.dir.z * front - origin.z, 0);
      } else sh.uShotA.value.w = 0;
      // ── a brasa nas faces do corte ──
      const cm = world.materials.cut;
      if (cm?.uniforms.uCutA) {
        cm.uniforms.uHeatNow.value = t;
        for (let i = 0; i < HEAT_SLOTS; i++) {
          const s = shots[i];
          const A = cm.uniforms.uCutA.value[i];
          const B = cm.uniforms.uCutB.value[i];
          if (!s || t - s.t0 > 17) {
            B.w = -1;
            continue;
          }
          A.set(s.a.x - origin.x, s.a.y - origin.y, s.a.z - origin.z, s.r);
          B.set(s.b.x - origin.x, s.b.y - origin.y, s.b.z - origin.z, s.t0);
        }
      }
      // ── faíscas pingando das bordas quentes ──
      for (let i = drips.length - 1; i >= 0; i--) {
        const d = drips[i];
        if (t > d.until) {
          drips.splice(i, 1);
          continue;
        }
        d.acc += dt * d.rate * Math.max(0.2, (d.until - t) / 6);
        while (d.acc >= 1) {
          d.acc -= 1;
          sparks.spawn(d.g, _v.set((Math.random() - 0.5) * 1.2, -Math.random() * 0.5, (Math.random() - 0.5) * 1.2), t, 0.6 + Math.random() * 0.9, 0.09 + Math.random() * 0.07);
        }
      }
      // ── o que cai ──
      for (let i = falling.length - 1; i >= 0; i--) {
        const f = falling[i];
        if (!f.rest) {
          f.vy -= 9.8 * dt;
          f.g.x += f.vx * dt;
          f.g.z += f.vz * dt;
          f.g.y += f.vy * dt;
          f.vx *= Math.exp(-dt * 0.8);
          f.vz *= Math.exp(-dt * 0.8);
          f.mesh.rotation.x += f.spin.x * dt;
          f.mesh.rotation.y += f.spin.y * dt;
          f.mesh.rotation.z += f.spin.z * dt;
          if (f.g.y <= f.floor) {
            f.g.y = f.floor;
            if (!f.bounced && f.vy < -2) {
              f.bounced = true;
              f.vy = -f.vy * 0.25;
              f.spin.multiplyScalar(0.4);
              // (pousou: um pouco de poeira e faíscas, se quente)
              dust.spawn(f.g, _v.set(0, 0.6, 0), t, 2.5, 0.8 + f.mesh.scale.x);
            } else {
              f.rest = true;
            }
          }
        }
        f.mesh.position.copy(f.g).sub(origin);
        // longe: some
        if (f.g.distanceToSquared(world.toGlobal(camera.position, _w)) > 300 * 300) {
          group.remove(f.mesh);
          falling.splice(i, 1);
        }
      }
      const ppm = pxPerM();
      flashes.update(origin, t, ppm);
      sparks.update(origin, t, ppm);
      dust.update(origin, t, ppm);
      rings.update(origin, t);
    },

    /** (testes/medidas) quantos efeitos vivos */
    get stats() {
      return { falling: falling.length, drips: drips.length, shots: shots.length };
    },
  };
  return api;
}
